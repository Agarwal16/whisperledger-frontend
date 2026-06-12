import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import {
  authenticateWithBiometrics,
  checkBiometricAvailable,
} from "@/hooks/useBiometric";

interface BiometricGateProps {
  children: React.ReactNode;
}

/**
 * BiometricGate — wraps the entire app and shows a lock screen
 * requiring biometric/PIN authentication before granting access.
 * Re-locks automatically when the app goes to background.
 */
export function BiometricGate({ children }: BiometricGateProps) {
  const { user, logout } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [isUnlocked, setIsUnlocked] = useState(!user);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<
    "fingerprint" | "faceId" | "iris" | "none"
  >("none");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [checkingHardware, setCheckingHardware] = useState(!!user);

  // Animations
  const lockOpacity = useRef(new Animated.Value(1)).current;
  const lockScale = useRef(new Animated.Value(1)).current;
  const iconPulse = useRef(new Animated.Value(1)).current;
  const appState = useRef(AppState.currentState);
  const lastUnlockedAt = useRef<number>(0);
  // Re-lock grace period: 30 seconds in background before requiring re-auth
  const RELOCK_GRACE_MS = 30_000;

  // Start icon pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(iconPulse, {
          toValue: 1.08,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(iconPulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Check biometric capability on mount
  useEffect(() => {
    let active = true;

    // Safety timeout: if checking hardware takes more than 1.2 seconds, bypass biometric gate
    const timer = setTimeout(() => {
      if (active && checkingHardware) {
        console.warn("[Biometric] Safety timeout triggered - bypassing biometric check");
        setCheckingHardware(false);
        setIsUnlocked(true);
      }
    }, 1200);

    checkBiometricAvailable()
      .then(({ available, biometricType: bt }) => {
        clearTimeout(timer);
        if (!active) return;

        setBiometricAvailable(available);
        setBiometricType(bt);
        setCheckingHardware(false);

        if (!available) {
          // No biometrics — unlock immediately (no hardware to authenticate)
          setIsUnlocked(true);
        } else {
          // Auto-trigger auth prompt on first launch if user is logged in
          if (user) {
            setTimeout(() => {
              if (active) triggerAuth(available);
            }, 400);
          } else {
            setIsUnlocked(true);
          }
        }
      })
      .catch((err) => {
        clearTimeout(timer);
        console.warn("[Biometric] checkBiometricAvailable failed, bypassing:", err);
        if (active) {
          setCheckingHardware(false);
          setIsUnlocked(true);
        }
      });

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // Unlock automatically if the user is logged out
  useEffect(() => {
    if (!user) {
      setIsUnlocked(true);
    }
  }, [user]);

  // AppState listener — re-lock when app returns from background
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      (nextState: AppStateStatus) => {
        if (
          appState.current === "active" &&
          (nextState === "background" || nextState === "inactive")
        ) {
          // App going to background — record when
          lastUnlockedAt.current = Date.now();
        } else if (
          (appState.current === "background" ||
            appState.current === "inactive") &&
          nextState === "active"
        ) {
          // App returning from background — check grace period
          const elapsed = Date.now() - lastUnlockedAt.current;
          if (elapsed > RELOCK_GRACE_MS && biometricAvailable) {
            setIsUnlocked(false);
            setTimeout(() => triggerAuth(biometricAvailable), 200);
          }
        }
        appState.current = nextState;
      }
    );
    return () => sub.remove();
  }, [biometricAvailable]);

  const triggerAuth = useCallback(async (available: boolean) => {
    if (!available) {
      setIsUnlocked(true);
      return;
    }
    if (isAuthenticating) return;

    setIsAuthenticating(true);
    const result = await authenticateWithBiometrics(
      "Unlock WhisperLedger to access your finances"
    );
    setIsAuthenticating(false);

    if (result.success) {
      // Smooth fade out animation
      Animated.parallel([
        Animated.timing(lockOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(lockScale, {
          toValue: 0.96,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => setIsUnlocked(true));
    }
  }, [isAuthenticating, lockOpacity, lockScale]);

  const handleUnlockPress = () => {
    triggerAuth(biometricAvailable);
  };



  // If unlocked, render app content
  if (isUnlocked) return <>{children}</>;

  // Render biometric lock screen
  const biometricIcon =
    biometricType === "faceId"
      ? "cpu"
      : biometricType === "iris"
      ? "eye"
      : "disc"; // fingerprint-like icon

  return (
    <>
      {children}
      <Animated.View
        style={[
          styles.overlay,
          { opacity: lockOpacity, transform: [{ scale: lockScale }] },
        ]}
      >
        <LinearGradient
          colors={["#05060A", "#080A10", "#0D1020"]}
          style={styles.gradient}
        >
          <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
            {/* Logo */}
            <Image
              source={require("../assets/images/icon.png")}
              style={styles.logo}
            />

            <Text style={styles.appName}>WhisperLedger</Text>
            <Text style={styles.subtitle}>Your finances, secured.</Text>

            {/* Biometric icon button */}
            <TouchableOpacity
              onPress={handleUnlockPress}
              activeOpacity={0.7}
              disabled={isAuthenticating}
              style={styles.biometricButton}
            >
              <Animated.View
                style={[
                  styles.biometricIconWrap,
                  { transform: [{ scale: iconPulse }] },
                ]}
              >
                <LinearGradient
                  colors={["rgba(99,102,241,0.18)", "rgba(139,92,246,0.12)"]}
                  style={styles.biometricGradient}
                >
                  <Feather
                    name={biometricIcon as any}
                    size={40}
                    color="#818cf8"
                  />
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>

            <Text style={styles.unlockLabel}>
              {isAuthenticating
                ? "Authenticating…"
                : biometricType === "faceId"
                ? "Unlock with Face ID"
                : biometricType === "iris"
                ? "Unlock with Iris"
                : "Tap to unlock"}
            </Text>

            <Text style={styles.hint}>
              Use your{" "}
              {biometricType === "faceId"
                ? "face"
                : biometricType === "iris"
                ? "iris"
                : "fingerprint"}{" "}
              or device PIN
            </Text>

            <TouchableOpacity
              onPress={async () => {
                try {
                  await logout();
                  setIsUnlocked(true);
                } catch (e) {
                  Alert.alert("Error", "Failed to sign out");
                }
              }}
              style={styles.logoutButton}
              activeOpacity={0.7}
            >
              <Text style={styles.logoutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 72,
    height: 72,
    resizeMode: "contain",
    marginBottom: 16,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#f8fafc",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#8A95A5",
    marginBottom: 56,
  },
  biometricButton: {
    marginBottom: 24,
  },
  biometricIconWrap: {
    borderRadius: 40,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(99,102,241,0.35)",
  },
  biometricGradient: {
    width: 96,
    height: 96,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  unlockLabel: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#C7D2FE",
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#4B5563",
    textAlign: "center",
  },
  logoutButton: {
    marginTop: 48,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
  },
  logoutText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#f87171",
    letterSpacing: 0.2,
  },
});
