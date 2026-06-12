import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const HAS_SEEN_ONBOARDING_KEY = "@has_seen_onboarding";

interface OnboardingSlide {
  title: string;
  subtitle: string;
  desc: string;
  icon: keyof typeof Feather.glyphMap;
  gradient: [string, string];
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    title: "Absolute Privacy",
    subtitle: "Zero-Knowledge Storage",
    desc: "All transaction logs and expense data live strictly offline on your device. Your financial secrets are 100% secure.",
    icon: "shield",
    gradient: ["#0f172a", "#1e293b"],
  },
  {
    title: "SMS Auto-Sync",
    subtitle: "Effortless Automation",
    desc: "WhisperLedger monitors incoming transaction SMS alerts in the background and automatically categorizes them in seconds.",
    icon: "zap",
    gradient: ["#4f46e5", "#312e81"],
  },
  {
    title: "Visual Analytics",
    subtitle: "Beautiful Ledger Details",
    desc: "Export credit-card-style PDF statements and view color-coded category shares with a single tap.",
    icon: "bar-chart-2",
    gradient: ["#7c3aed", "#4c1d95"],
  },
  {
    title: "Direct Support",
    subtitle: "Connected Support Desk",
    desc: "Submit support cases natively inside the app and receive push notifications from our admin desk instantly.",
    icon: "life-buoy",
    gradient: ["#06b6d4", "#0891b2"],
  },
];

function translateAuthError(rawError: string | object): string {
  if (!rawError) return "An unexpected error occurred. Please try again.";
  
  const errorString = typeof rawError === "object" ? JSON.stringify(rawError) : String(rawError);
  const msg = errorString.toLowerCase();
  
  if (msg.includes("developer_error") || msg.includes("developer-error")) {
    return "Google Sign-In configuration is pending. Please verify that your local SHA-1 fingerprint is whitelisted in your Firebase Console settings.";
  }
  if (msg.includes("invalid-credential") || msg.includes("wrong-password") || msg.includes("user-not-found") || msg.includes("auth/invalid-credential")) {
    return "Incorrect email or password. Please double check and try again.";
  }
  if (msg.includes("invalid-email")) {
    return "Please enter a valid email address.";
  }
  if (msg.includes("user-disabled")) {
    return "This account has been disabled. Please contact support.";
  }
  if (msg.includes("email-already-in-use")) {
    return "This email address is already registered. Please sign in instead.";
  }
  if (msg.includes("weak-password")) {
    return "Password is too weak. Please use at least 6 characters.";
  }
  if (msg.includes("network-request-failed") || msg.includes("network_error")) {
    return "Connection error. Please check your internet connection and try again.";
  }
  if (msg.includes("too-many-requests")) {
    return "Too many failed attempts. Please try again in a few minutes.";
  }
  if (msg.includes("cancelled") || msg.includes("cancel")) {
    return "Sign-in was cancelled.";
  }
  
  return "Unable to sign in. Please verify your credentials and try again.";
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle, isLoading, forgotPassword } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Onboarding States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Forgot Password States
  const [forgotModalVisible, setForgotModalVisible] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);
  const [forgotError, setForgotError] = useState("");

  // Animated values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // New animated values for login background and logo
  const loginLogoScale = useRef(new Animated.Value(1)).current;
  const loginLogoRotate = useRef(new Animated.Value(0)).current;
  const bubble1X = useRef(new Animated.Value(-50)).current;
  const bubble1Y = useRef(new Animated.Value(50)).current;
  const bubble2X = useRef(new Animated.Value(SCREEN_WIDTH - 100)).current;
  const bubble2Y = useRef(new Animated.Value(SCREEN_HEIGHT / 2)).current;

  // Gesture refs for onboarding swiping
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  useEffect(() => {
    // Check if the user has already completed onboarding
    const checkOnboardingStatus = async () => {
      try {
        const hasSeen = await AsyncStorage.getItem(HAS_SEEN_ONBOARDING_KEY);
        if (hasSeen === null) {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.warn("AsyncStorage check failed:", err);
      }
    };
    checkOnboardingStatus();
  }, []);

  // Soft pulsing animation for the "Get Started" or "Next" button
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1.0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Continuous pulsing scale for the login logo card
    Animated.loop(
      Animated.sequence([
        Animated.timing(loginLogoScale, {
          toValue: 1.08,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(loginLogoScale, {
          toValue: 1.0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Continuous gentle oscillating rotation for the login logo card
    Animated.loop(
      Animated.sequence([
        Animated.timing(loginLogoRotate, {
          toValue: 1,
          duration: 3500,
          useNativeDriver: true,
        }),
        Animated.timing(loginLogoRotate, {
          toValue: -1,
          duration: 3500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Infinite drifting cycle for floating background bubble 1
    const animateBubble1 = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bubble1X, { toValue: 80, duration: 9000, useNativeDriver: true }),
          Animated.timing(bubble1Y, { toValue: 140, duration: 9000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(bubble1X, { toValue: -60, duration: 9000, useNativeDriver: true }),
          Animated.timing(bubble1Y, { toValue: 40, duration: 9000, useNativeDriver: true }),
        ]),
      ]).start(() => animateBubble1());
    };

    // Infinite drifting cycle for floating background bubble 2
    const animateBubble2 = () => {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(bubble2X, { toValue: SCREEN_WIDTH - 220, duration: 11000, useNativeDriver: true }),
          Animated.timing(bubble2Y, { toValue: SCREEN_HEIGHT / 2 - 120, duration: 11000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(bubble2X, { toValue: SCREEN_WIDTH - 80, duration: 11000, useNativeDriver: true }),
          Animated.timing(bubble2Y, { toValue: SCREEN_HEIGHT / 2 + 120, duration: 11000, useNativeDriver: true }),
        ]),
      ]).start(() => animateBubble2());
    };

    animateBubble1();
    animateBubble2();
  }, []);

  const animateSlideChange = (nextIndex: number) => {
    // Smooth transition between slides
    Animated.parallel([
      // Outgoing slide animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -40,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(iconScale, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCurrentSlide(nextIndex);
      // Incoming slide animation
      slideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(iconScale, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleNextSlide = async () => {
    if (currentSlide < ONBOARDING_SLIDES.length - 1) {
      animateSlideChange(currentSlide + 1);
    } else {
      // Exit onboarding and mark as seen
      await handleSkipOnboarding();
    }
  };

  const handlePrevSlide = () => {
    if (currentSlide > 0) {
      animateSlideChange(currentSlide - 1);
    }
  };

  const handleTouchStart = (e: any) => {
    touchStartX.current = e.nativeEvent.pageX;
    touchStartY.current = e.nativeEvent.pageY;
  };

  const handleTouchEnd = (e: any) => {
    const dx = e.nativeEvent.pageX - touchStartX.current;
    const dy = e.nativeEvent.pageY - touchStartY.current;

    // Only register horizontal swipes if dx is large and dy is small
    if (Math.abs(dx) > 50 && Math.abs(dy) < 80) {
      if (dx < 0) {
        // Swiped left -> Next slide
        handleNextSlide();
      } else {
        // Swiped right -> Prev slide
        handlePrevSlide();
      }
    }
  };

  const handleSkipOnboarding = async () => {
    try {
      await AsyncStorage.setItem(HAS_SEEN_ONBOARDING_KEY, "true");
    } catch (err) {
      console.warn("AsyncStorage save failed:", err);
    }
    // Fade out onboarding overlay
    setShowOnboarding(false);
  };

  const handleLogin = async () => {
    setError("");
    if (!username.trim() || !password.trim()) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    const result = await login(username.trim(), password);
    setLoading(false);
    if (result.success) {
      router.replace("/(tabs)");
    } else {
      setError(translateAuthError(result.error || "Login failed"));
    }
  };

  const handleForgotPassword = () => {
    setForgotEmail(username.trim());
    setForgotSuccess(false);
    setForgotError("");
    setForgotModalVisible(true);
  };

  const handleSendReset = async () => {
    setForgotError("");
    if (!forgotEmail.trim()) {
      setForgotError("Please enter your email address");
      return;
    }
    setForgotLoading(true);
    const res = await forgotPassword(forgotEmail.trim());
    setForgotLoading(false);
    if (res.success) {
      setForgotSuccess(true);
    } else {
      setForgotError(translateAuthError(res.error || "Failed to send reset link"));
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1 },
    gradient: { flex: 1 },
    bubble: {
      position: "absolute",
      overflow: "hidden",
    },
    scroll: { flexGrow: 1, justifyContent: "center" },
    inner: {
      paddingHorizontal: 28,
      paddingTop: insets.top + 30,
      paddingBottom: insets.bottom + 30,
    },
    logoWrap: {
      width: 72,
      height: 72,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 24,
    },
    heading: {
      fontSize: 32,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 6,
    },
    subheading: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginBottom: 32,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 24,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.15,
      shadowRadius: 16,
      elevation: 8,
      borderWidth: colors.text === "#f8fafc" ? 1 : 0,
      borderColor: colors.border,
    },
    label: {
      fontSize: 12,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 16,
    },
    inputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.04)" : colors.muted,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
    },
    input: {
      flex: 1,
      paddingVertical: 14,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
    },
    eyeBtn: { padding: 4 },
    errorBox: {
      backgroundColor: colors.text === "#f8fafc" ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
      borderRadius: 10,
      padding: 12,
      marginTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      color: colors.text === "#f8fafc" ? "#f87171" : "#dc2626",
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
    loginBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 24,
    },
    loginBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: 20,
      gap: 12,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
    dividerText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    registerRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 4,
    },
    registerText: {
      fontSize: 14,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
    },
    registerLink: {
      fontSize: 14,
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
    },
    infoButton: {
      position: "absolute",
      top: insets.top + 20,
      right: 24,
      zIndex: 10,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },

    // Onboarding Styles
    onboardingContainer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
    },
    onboardingGradient: {
      flex: 1,
      justifyContent: "space-between",
    },
    onboardingHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingTop: insets.top + 16,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    skipText: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 14,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
    },
    onboardingBody: {
      alignItems: "center",
      paddingHorizontal: 32,
      marginVertical: 20,
    },
    iconOuter: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: "rgba(255,255,255,0.08)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 36,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.15)",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 14,
      elevation: 6,
    },
    slideSub: {
      color: "#38bdf8",
      fontSize: 12,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      letterSpacing: 2,
      textTransform: "uppercase",
      marginBottom: 10,
    },
    slideTitle: {
      color: "#fff",
      fontSize: 32,
      fontWeight: "800" as const,
      fontFamily: "Inter_700Bold",
      textAlign: "center",
      marginBottom: 16,
      letterSpacing: -0.5,
    },
    slideDesc: {
      color: "rgba(255,255,255,0.75)",
      fontSize: 15,
      lineHeight: 24,
      textAlign: "center",
      fontFamily: "Inter_400Regular",
      paddingHorizontal: 12,
    },
    onboardingFooter: {
      paddingHorizontal: 28,
      paddingBottom: insets.bottom + 28,
      alignItems: "center",
    },
    paginationDots: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 36,
    },
    dot: {
      height: 8,
      borderRadius: 4,
      backgroundColor: "rgba(255,255,255,0.25)",
    },
    activeDot: {
      backgroundColor: "#fff",
    },
    actionBtn: {
      width: "100%",
      borderRadius: 16,
      overflow: "hidden",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    actionBtnGrad: {
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    actionBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      letterSpacing: 0.5,
    },
    forgotBtn: {
      alignSelf: "flex-end",
      marginTop: 8,
      marginBottom: 20,
      paddingVertical: 4,
    },
    forgotBtnText: {
      color: "#6366f1",
      fontSize: 14,
      fontFamily: "Inter_500Medium",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(8, 10, 16, 0.85)" : "rgba(15, 23, 42, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 28,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.2,
      shadowRadius: 20,
      elevation: 10,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    modalCloseBtn: {
      padding: 4,
    },
    modalDesc: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 20,
      marginBottom: 20,
    },
    modalInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.04)" : colors.muted,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      height: 56,
      marginBottom: 20,
    },
    modalInput: {
      flex: 1,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      fontSize: 15,
    },
    modalSubmitBtn: {
      borderRadius: 16,
      overflow: "hidden",
    },
    modalSubmitBtnGrad: {
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    modalSubmitBtnText: {
      color: "#fff",
      fontSize: 16,
      fontFamily: "Inter_700Bold",
    },
    modalSuccessBox: {
      alignItems: "center",
      paddingVertical: 10,
    },
    modalSuccessText: {
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: "#10b981",
      textAlign: "center",
      lineHeight: 22,
      marginTop: 12,
    },
    modalErrorBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(220, 38, 38, 0.1)",
      borderRadius: 12,
      padding: 12,
      marginBottom: 20,
      gap: 8,
    },
    modalErrorText: {
      color: "#ef4444",
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      flex: 1,
    },
  });

  const isDark = colors.text === "#f8fafc";
  const slide = ONBOARDING_SLIDES[currentSlide];

  const getSlideGradient = (idx: number, dark: boolean): [string, string] => {
    if (dark) {
      switch (idx) {
        case 0: return ["#0f172a", "#1e293b"];
        case 1: return ["#1e1b4b", "#312e81"];
        case 2: return ["#2e1065", "#4c1d95"];
        case 3: return ["#083344", "#0891b2"];
        default: return ["#0f172a", "#1e293b"];
      }
    } else {
      switch (idx) {
        case 0: return ["#f8fafc", "#f1f5f9"];
        case 1: return ["#eef2ff", "#e0e7ff"];
        case 2: return ["#faf5ff", "#f3e8ff"];
        case 3: return ["#ecfeff", "#cffafe"];
        default: return ["#f8fafc", "#f1f5f9"];
      }
    }
  };

  const slideGradient = getSlideGradient(currentSlide, isDark);

  return (
    <View style={styles.container}>
      {/* Replay / Walkthrough Overlay */}
      {showOnboarding && (
        <View style={styles.onboardingContainer}>
          <LinearGradient
            colors={slideGradient}
            style={styles.onboardingGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header controls */}
            <View style={styles.onboardingHeader}>
              {currentSlide > 0 ? (
                <TouchableOpacity 
                  style={[styles.backButton, { backgroundColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)" }]} 
                  onPress={handlePrevSlide} 
                  activeOpacity={0.7}
                >
                  <Feather name="chevron-left" size={22} color={isDark ? "#fff" : colors.foreground} />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 40 }} />
              )}
              <TouchableOpacity onPress={handleSkipOnboarding} activeOpacity={0.7} style={{ padding: 8 }}>
                <Text style={[styles.skipText, { color: isDark ? "rgba(255,255,255,0.75)" : colors.mutedForeground }]}>Skip</Text>
              </TouchableOpacity>
            </View>

            {/* Slide Body */}
            <Animated.View
              style={[
                styles.onboardingBody,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <Animated.View 
                style={[
                  styles.iconOuter, 
                  { 
                    transform: [{ scale: iconScale }],
                    backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(99, 102, 241, 0.08)",
                    borderColor: isDark ? "rgba(255,255,255,0.15)" : "rgba(99, 102, 241, 0.15)",
                    shadowColor: isDark ? "#000" : colors.primary,
                  }
                ]}
              >
                <Feather name={slide.icon} size={64} color={isDark ? "#fff" : colors.primary} />
              </Animated.View>
              <Text style={[styles.slideSub, { color: isDark ? "#38bdf8" : "#4f46e5" }]}>{slide.subtitle}</Text>
              <Text style={[styles.slideTitle, { color: isDark ? "#fff" : colors.foreground }]}>{slide.title}</Text>
              <Text style={[styles.slideDesc, { color: isDark ? "rgba(255,255,255,0.75)" : colors.mutedForeground }]}>{slide.desc}</Text>
            </Animated.View>

            {/* Footer controls */}
            <View style={styles.onboardingFooter}>
              {/* Pagination Dots */}
              <View style={styles.paginationDots}>
                {ONBOARDING_SLIDES.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      currentSlide === idx 
                        ? { backgroundColor: isDark ? "#fff" : colors.primary, width: 24 } 
                        : { backgroundColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.12)", width: 8 },
                    ]}
                  />
                ))}
              </View>

              {/* Primary Next / Get Started Action Button */}
              <Animated.View style={[styles.actionBtn, { transform: [{ scale: pulseAnim }] }]}>
                <TouchableOpacity onPress={handleNextSlide} activeOpacity={0.95}>
                  <LinearGradient
                    colors={currentSlide === ONBOARDING_SLIDES.length - 1 ? ["#10b981", "#059669"] : ["#4f46e5", "#6366f1"]}
                    style={styles.actionBtnGrad}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={styles.actionBtnText}>
                      {currentSlide === ONBOARDING_SLIDES.length - 1 ? "Let's Get Started" : "Continue"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </LinearGradient>
        </View>
      )}

      {/* Main Login Screen View */}
      <LinearGradient colors={colors.text === "#f8fafc" ? ["#0B0D18", "#080A10"] : ["#E5E7EB", "#F3F4F6"]} style={styles.gradient}>
        {/* Glowing glassmorphism drifting cosmic bubbles */}
        <Animated.View
          style={[
            styles.bubble,
            {
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.12)" : "rgba(99, 102, 241, 0.08)",
              transform: [{ translateX: bubble1X }, { translateY: bubble1Y }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.bubble,
            {
              width: 280,
              height: 280,
              borderRadius: 140,
              backgroundColor: colors.text === "#f8fafc" ? "rgba(236, 72, 153, 0.06)" : "rgba(236, 72, 153, 0.04)",
              transform: [{ translateX: bubble2X }, { translateY: bubble2Y }],
            },
          ]}
        />

        {/* Floating Info Button to trigger walkthrough at any time */}
        <TouchableOpacity 
          style={[
            styles.infoButton, 
            { 
              backgroundColor: colors.text === "#f8fafc" ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.04)",
              borderWidth: 1,
              borderColor: colors.border
            }
          ]} 
          onPress={() => setShowOnboarding(true)} 
          activeOpacity={0.75}
        >
          <Feather name="help-circle" size={22} color={colors.text === "#f8fafc" ? "#fff" : colors.primary} />
        </TouchableOpacity>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.inner}>
              <Animated.View
                style={[
                  styles.logoWrap,
                  {
                    backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.15)" : "rgba(99, 102, 241, 0.08)",
                    borderWidth: colors.text === "#f8fafc" ? 1 : 0,
                    borderColor: "rgba(99, 102, 241, 0.25)",
                    transform: [
                      { scale: loginLogoScale },
                      {
                        rotate: loginLogoRotate.interpolate({
                          inputRange: [-1, 1],
                          outputRange: ["-8deg", "8deg"],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Image
                  source={require("../assets/images/icon.png")}
                  style={{ width: 44, height: 44, borderRadius: 12 }}
                />
              </Animated.View>
              <Text style={styles.heading}>Welcome back</Text>
              <Text style={styles.subheading}>Track your spending with clarity</Text>

              <View style={styles.card}>
                <Text style={[styles.label, { marginTop: 0 }]}>USERNAME</Text>
                <View style={styles.inputWrap}>
                  <Feather name="user" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Enter your username"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                  />
                </View>

                <Text style={styles.label}>PASSWORD</Text>
                <View style={styles.inputWrap}>
                  <Feather name="lock" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry={!showPwd}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPwd((p) => !p)}>
                    <Feather name={showPwd ? "eye-off" : "eye"} size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {/* Forgot Password Link */}
                <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword} activeOpacity={0.7}>
                  <Text style={styles.forgotBtnText}>Forgot password?</Text>
                </TouchableOpacity>

                {!!error && (
                  <View style={styles.errorBox}>
                    <Feather name="alert-circle" size={14} color="#dc2626" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.loginBtn, { opacity: loading ? 0.7 : 1 }]}
                  onPress={handleLogin}
                  disabled={loading}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.loginBtnText}>Sign In</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.loginBtn, { backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", marginTop: 12 }]}
                  onPress={async () => {
                    setLoading(true);
                    const res = await loginWithGoogle();
                    setLoading(false);
                    if (!res.success) setError(translateAuthError(res.error || "Google login failed"));
                  }}
                  disabled={loading}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Feather name="log-in" size={18} color="#4f46e5" style={{ marginRight: 10 }} />
                    <Text style={[styles.loginBtnText, { color: "#4f46e5" }]}>Sign in with Google</Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.divider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.registerRow}>
                  <Text style={styles.registerText}>Don't have an account?</Text>
                  <TouchableOpacity onPress={() => router.push("/register")}>
                    <Text style={styles.registerLink}>Create one</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Custom Forgot Password Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={forgotModalVisible}
          onRequestClose={() => setForgotModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ width: "100%", alignItems: "center" }}
            >
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Reset Password</Text>
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setForgotModalVisible(false)}
                  >
                    <Feather name="x" size={20} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>

                {forgotSuccess ? (
                  <View style={styles.modalSuccessBox}>
                    <Feather name="check-circle" size={48} color="#10b981" />
                    <Text style={styles.modalSuccessText}>
                      A password reset email has been sent successfully! Please check your inbox.
                    </Text>
                    <TouchableOpacity
                      style={[styles.loginBtn, { marginTop: 24, width: "100%" }]}
                      onPress={() => setForgotModalVisible(false)}
                    >
                      <Text style={styles.loginBtnText}>Okay</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.modalDesc}>
                      Enter the email address associated with your account and we'll send you a link to reset your password.
                    </Text>

                    {!!forgotError && (
                      <View style={styles.modalErrorBox}>
                        <Feather name="alert-circle" size={16} color="#ef4444" />
                        <Text style={styles.modalErrorText}>{forgotError}</Text>
                      </View>
                    )}

                    <View style={styles.modalInputWrap}>
                      <Feather name="mail" size={16} color={colors.mutedForeground} style={{ marginRight: 10 }} />
                      <TextInput
                        style={styles.modalInput}
                        value={forgotEmail}
                        onChangeText={setForgotEmail}
                        placeholder="Enter your email address"
                        placeholderTextColor={colors.mutedForeground}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="email-address"
                        onSubmitEditing={handleSendReset}
                      />
                    </View>

                    <TouchableOpacity
                      style={[styles.modalSubmitBtn, { opacity: forgotLoading ? 0.7 : 1 }]}
                      onPress={handleSendReset}
                      disabled={forgotLoading}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={["#4f46e5", "#6366f1"]}
                        style={styles.modalSubmitBtnGrad}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                      >
                        {forgotLoading ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.modalSubmitBtnText}>Send Reset Link</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </LinearGradient>
    </View>
  );
}
