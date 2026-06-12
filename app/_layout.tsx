console.error("DEBUG_LAYOUT_EVALUATED_12345");

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router, Stack, useSegments, useRootNavigationState } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import Constants from "expo-constants";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View, LogBox, Image, Animated, Dimensions, StyleSheet, Text, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Sentry from "@sentry/react-native";

import { StatusBar } from "expo-status-bar";

LogBox.ignoreLogs([
  "You are initializing Firebase Auth for React Native without providing AsyncStorage",
  "Push token registration skipped",
  "Default FirebaseApp is not initialized in this process",
]);
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ExpenseProvider } from "@/context/ExpenseContext";
import { BudgetProvider } from "@/context/BudgetContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { logUserNotification, setupNotifications, SMSAction } from "@/utils/notifications";
import { classifyCategory } from "@/utils/smsParser";
import { collection, addDoc, doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import * as Device from "expo-device";
import { BiometricGate } from "@/components/BiometricGate";

// Initialize Sentry for crash reporting and performance monitoring
// Sentry.init({
//   dsn: "https://examplePublicKey@o0.ingest.sentry.io/0", // Replace with your actual DSN from sentry.io
//   debug: false,
//   tracesSampleRate: 0.2, // 20% of transactions for performance profiling
//   environment: __DEV__ ? "development" : "production",
// });


function isPermissionDeniedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === "permission-denied" ||
    (typeof maybe.message === "string" && maybe.message.toLowerCase().includes("insufficient permissions"))
  );
}

SplashScreen.preventAutoHideAsync();
function getNotificationsModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("expo-notifications");
  } catch {
    return null;
  }
}

const Notifications = getNotificationsModule();
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { user, isLoading, isAuthReady } = useAuth();
  const segments = useSegments();
  const navigationState = useRootNavigationState();
  const processedNotifIds = useRef(new Set<string>()).current;
  // Store a deep link that arrived before the router/auth was ready
  const pendingDeepLink = useRef<string | null>(null);

  console.error("🚀 [RootLayoutNav] Rendering. isLoading:", isLoading, "isAuthReady:", isAuthReady, "hasUser:", !!user, "hasNavKey:", !!navigationState?.key);

  useEffect(() => {
    console.error("📡 [RootLayoutNav] redirect useEffect triggered. isLoading:", isLoading, "isAuthReady:", isAuthReady, "hasNavKey:", !!navigationState?.key, "segments:", segments);
    if (isLoading || !navigationState?.key) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "register";

    if (!user) {
      if (!inAuthGroup) {
        console.warn("👉 [RootLayoutNav] Redirecting to /login");
        setTimeout(() => {
          try {
            router.replace("/login");
          } catch (e) {
            console.warn("Auth redirect failed:", e);
          }
        }, 10);
      }
    } else {
      if (pendingDeepLink.current) {
        const link = pendingDeepLink.current;
        pendingDeepLink.current = null;
        console.warn("👉 [RootLayoutNav] Redirecting to pending deep link:", link);
        setTimeout(() => {
          try {
            router.push(link as any);
          } catch {
            router.push("/(tabs)" as any);
          }
        }, 300);
      } else if (inAuthGroup || !segments[0]) {
        console.warn("👉 [RootLayoutNav] Redirecting to /(tabs)");
        setTimeout(() => {
          try {
            router.replace("/(tabs)");
          } catch (e) {
            console.warn("Auth redirect failed:", e);
          }
        }, 10);
      }
    }
  }, [user, isLoading, isAuthReady, segments, navigationState?.key]);


  useEffect(() => {
    setupNotifications();

    // Check for cold-launch notification deep links immediately on startup
    if (Notifications) {
      Notifications.getLastNotificationResponseAsync().then((response: any) => {
        if (response) {
          const data = (response.notification.request.content.data || {}) as Record<string, any>;
          const { deepLink } = data;
          if (typeof deepLink === "string" && deepLink.length > 0) {
            if (isLoading || !user) {
              pendingDeepLink.current = deepLink;
            } else {
              setTimeout(() => {
                try {
                  router.push(deepLink as any);
                } catch {
                  router.push("/(tabs)" as any);
                }
              }, 600);
            }
          }
        }
      }).catch(() => null);
    }

    const registerPushToken = async () => {
      if (!Notifications) {
        console.warn("[Push] Notifications module is missing");
        return;
      }

      // Emulator / simulator — register a mock token so admin dashboard shows the user
      if (!Device.isDevice) {
        if (user) {
          try {
            await setDoc(doc(db, `users/${user.uid}`), {
              uid: user.uid,
              name: user.name,
              email: user.email,
              pushToken: `mock_emulator_token_${user.uid.slice(0, 5)}`,
              lastActive: Date.now(),
            }, { merge: true });
          } catch (err) {
            console.warn("[Push] Failed to register emulator mock token:", err);
          }
        }
        return;
      }

      // Request permission first
      try {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== "granted") {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        if (finalStatus !== "granted") {
          console.warn("[Push] Notification permission not granted");
          return;
        }
      } catch (permErr: any) {
        console.warn("[Push] Permission check failed:", permErr?.message);
        return;
      }

      // Get Expo push token — this is what the admin dashboard and Expo Push API need.
      // getExpoPushTokenAsync works on real devices once Firebase is initialized natively.
      try {
        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ||
          Constants?.easConfig?.projectId;
        const token = (
          await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
        ).data;

        if (user && token) {
          await setDoc(doc(db, `users/${user.uid}`), {
            uid: user.uid,
            name: user.name,
            email: user.email,
            pushToken: token,
            lastActive: Date.now(),
          }, { merge: true });
          console.log("[Push] Expo push token registered ✅", token.slice(0, 40));
        }
      } catch (err: any) {
        // Log quietly — no red box in dev mode
        console.warn("[Push] Token registration failed (will retry on next launch):", err?.message);
      }
    };

    if (user && isAuthReady) registerPushToken();


    let unsubNotifications: (() => void) | null = null;

    if (user && isAuthReady) {
      const {
        collection: fsCollection,
        query: fsQuery,
        orderBy: fsOrderBy,
        limit: fsLimit,
        onSnapshot: fsOnSnapshot,
      } = require("firebase/firestore");

      // Session start time — used client-side to ignore old notifications.
      // We use a single-field orderBy (no composite index needed).
      const sessionStartMs = Date.now() - 30000; // 30s back-window

      const q = fsQuery(
        fsCollection(db, `users/${user.uid}/notifications`),
        fsOrderBy("createdAt", "desc"),
        fsLimit(20)
      );

      unsubNotifications = fsOnSnapshot(q, (snapshot: any) => {
        snapshot.docChanges().forEach(async (change: any) => {
          if ((change.type === "added" || change.type === "modified") && Notifications) {
            const data = change.doc.data();
            const docId = change.doc.id;

            // Only fire for unread notifications created in this session window
            const notifTime = typeof data.createdAt === "number"
              ? data.createdAt
              : data.createdAt?.toMillis?.() ?? 0;

            const isNew = notifTime >= sessionStartMs;

            if (!data.read && isNew && !processedNotifIds.has(docId)) {
              processedNotifIds.add(docId);
              try {
                await Notifications.scheduleNotificationAsync({
                  content: {
                    title: data.title || "Notification",
                    body: data.body || "",
                    data: { ...(data.data || {}), isLocalTriggered: true, firestoreNotifId: docId },
                    sound: true,
                    priority: "max",
                    channelId: "default",
                  },
                  trigger: null,
                });
                console.log("[Notifications] Local notification fired for:", docId);
              } catch (e) {
                console.warn("[Notifications] Failed to schedule local notification:", e);
              }
            } else {
              // Mark as seen so we don't re-process on next snapshot
              processedNotifIds.add(docId);
            }
          }
        });
      }, (err: any) => {
        console.warn("[Notifications] Real-time listener failed:", err);
      });
    }

    const receivedSub = Notifications.addNotificationReceivedListener(async (notification: any) => {
      if (!user) return;
      const data = (notification.request.content.data || {}) as Record<string, any>;
      // Loop-Breaker: Do NOT write mock/local notifications to Firestore!
      if (data.isLocalTriggered) return;
      // Do not write budget alerts or daily reminders to Firestore logs
      if (data.notificationType === "budget_alert" || data.notificationType === "daily_reminder") return;

      try {
        await logUserNotification({
          userId: user.uid,
          notificationId: notification.request.identifier,
          title: notification.request.content.title || "Notification",
          body: notification.request.content.body || "",
          notificationType: (data.notificationType as string) || "general",
          data,
        });
      } catch (e) {
        if (isPermissionDeniedError(e)) {
          console.warn("Notification receive log skipped due to Firestore permissions.");
          return;
        }
        console.warn("Notification receive log failed:", e);
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(async (response: any) => {
      const { actionIdentifier, notification } = response;
      const data = (notification.request.content.data || {}) as Record<string, any>;
      const { smsId, amount, merchant, deepLink } = data;

      if (user) {
        if (data.isLocalTriggered) {
          // If local notification is tapped, update its Firestore read status directly!
          if (data.firestoreNotifId) {
            const { doc: fsDoc, updateDoc: fsUpdateDoc } = require("firebase/firestore");
            await fsUpdateDoc(fsDoc(db, `users/${user.uid}/notifications/${data.firestoreNotifId}`), { read: true }).catch(() => null);
          }
        } else {
          // Only log external/push notifications that are not budget alerts or daily reminders
          if (data.notificationType !== "budget_alert" && data.notificationType !== "daily_reminder") {
            try {
              await logUserNotification({
                userId: user.uid,
                notificationId: notification.request.identifier,
                title: notification.request.content.title || "Notification",
                body: notification.request.content.body || "",
                notificationType: (data.notificationType as string) || "general",
                data,
                read: true,
              });
            } catch (e) {
              if (isPermissionDeniedError(e)) {
                console.warn("Notification response log skipped due to Firestore permissions.");
              } else {
                console.warn("Notification response log failed:", e);
              }
            }
          }
        }
      }

      if (typeof deepLink === "string" && deepLink.length > 0) {
        if (isLoading || !user) {
          // App not ready yet – stash the link and navigate once auth resolves
          pendingDeepLink.current = deepLink;
        } else {
          try {
            router.push(deepLink as any);
          } catch {
            // If the target screen does not exist, navigate to home screen
            router.push("/(tabs)" as any);
          }
        }
      } else {
        // No deep link – at least ensure we're on the home tab
        if (!isLoading && user) {
          router.push("/(tabs)" as any);
        }
      }

      if (actionIdentifier === SMSAction.APPROVE && user) {
        try {
          const date = new Date().toISOString().split("T")[0];
          await addDoc(collection(db, `users/${user.uid}/expenses`), {
            amount,
            note: `Auto-synced from SMS: ${merchant}`,
            categoryId: classifyCategory(merchant),
            paymentMode: "upi",
            date,
            smsId,
            createdAt: Date.now(),
          });
          console.log("Expense approved and added to Firestore");
        } catch (e) {
          console.error("Failed to add approved expense:", e);
        }
      }
    });

    return () => {
      if (receivedSub) receivedSub.remove();
      if (responseSub) responseSub.remove();
      if (unsubNotifications) unsubNotifications();
    };
  }, [user, isAuthReady]);

  const { isDark } = useTheme();

  return (
    <BiometricGate>
      <>
        <StatusBar style={isDark ? "light" : "dark"} />
        {isLoading ? (
          <View style={{ flex: 1, backgroundColor: isDark ? "#050814" : "#F3F4F6" }} />
        ) : (
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" options={{ headerShown: false, animation: "fade" }} />
            <Stack.Screen name="register" options={{ headerShown: false, animation: "slide_from_right" }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="notifications" options={{ headerShown: false, presentation: "card" }} />
            <Stack.Screen name="about" options={{ presentation: "modal", headerShown: false }} />
            <Stack.Screen name="faq" options={{ presentation: "modal", headerShown: false }} />
          </Stack>
        )}
      </>
    </BiometricGate>
  );
}


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

function AnimatedSplashScreen({ onFinish, fontsLoaded }: { onFinish: () => void; fontsLoaded: boolean }) {
  const { isLoading } = useAuth();
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  // High-end zero-flicker seamless transition parameters
  const logoScale = useRef(new Animated.Value(1.0)).current;
  const screenOpacity = useRef(new Animated.Value(1)).current;
  
  // Creative thin linear progress bar animation
  const progressWidth = useRef(new Animated.Value(0)).current;

  // Start progress bar animation and minimum display timer on mount
  useEffect(() => {
    Animated.timing(progressWidth, {
      toValue: 1,
      duration: 700,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1.0), // Butter-smooth cubic easing
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      setMinTimeElapsed(true);
    }, 600); // 600ms minimum display to show the gorgeous brand mark

    return () => clearTimeout(timer);
  }, []);

  // Gracefully transition as soon as fonts are loaded, auth checks complete, AND minimum display time elapsed
  useEffect(() => {
    if (!isLoading && fontsLoaded && minTimeElapsed && !isFadingOut) {
      setIsFadingOut(true);
      Animated.parallel([
        Animated.timing(logoScale, {
          toValue: 0.96,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(screenOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        })
      ]).start(() => {
        onFinish();
      });
    }
  }, [isLoading, fontsLoaded, minTimeElapsed, isFadingOut]);

  // Premium rapid transition safety timeout (1.5s) to guarantee instantaneous load feel
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isFadingOut) {
        setIsFadingOut(true);
        Animated.parallel([
          Animated.timing(logoScale, {
            toValue: 0.96,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(screenOpacity, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          })
        ]).start(() => {
          onFinish();
        });
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [isFadingOut]);

  const animatedProgressWidth = progressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <Animated.View style={[splashStyles.splashContainer, { opacity: screenOpacity }]}>
      <View style={[
        splashStyles.splashBackground, 
        { backgroundColor: "#050814" } // ALWAYS DARK: perfectly matches native splash, zero dark/light flashing!
      ]}>
        <View style={splashStyles.splashCenterWrap}>
          <Animated.View style={[
            splashStyles.splashLogoWrap, 
            { 
              transform: [{ scale: logoScale }]
            }
          ]}>
            <Image source={require("../assets/images/icon.png")} style={splashStyles.splashLogoImage} />
          </Animated.View>
          
          {/* Creative, super-thin glowing linear progress bar */}
          <View style={splashStyles.progressContainer}>
            <View style={splashStyles.progressTrack}>
              <Animated.View style={[
                splashStyles.progressFill,
                { width: animatedProgressWidth }
              ]}>
                <LinearGradient
                  colors={["#6366f1", "#14b8a6"]} // Indigo to Teal premium tech gradient
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            </View>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
  },
  splashBackground: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  splashCenterWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogoWrap: {
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  splashLogoImage: {
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  progressContainer: {
    width: 100,
    height: 3,
    marginTop: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    width: 80,
    height: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 1.5,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 1.5,
  },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
  });

  const [splashFinished, setSplashFinished] = useState(false);
  const [forceLoaded, setForceLoaded] = useState(false);

  console.error("🚀 [RootLayout] Rendering. fontsLoaded:", fontsLoaded, "fontError:", fontError, "forceLoaded:", forceLoaded);

  useEffect(() => {
    console.error("📡 [RootLayout] Mount useEffect triggered. fontsLoaded:", fontsLoaded, "fontError:", fontError);
    // Safety timer: force load resolution after 1.5 seconds if fonts fail to report status
    const timer = setTimeout(() => {
      console.warn("⏰ [RootLayout] Font safety timeout fired! Forcing load resolution.");
      setForceLoaded(true);
      SplashScreen.hideAsync().catch(() => null);
    }, 1500);

    if (fontsLoaded || fontError) {
      console.warn("✅ [RootLayout] Fonts resolved successfully. Clearing safety timer.");
      clearTimeout(timer);
      SplashScreen.hideAsync().catch(() => null);
    }

    return () => {
      console.warn("🧹 [RootLayout] Cleaning up font loader timer.");
      clearTimeout(timer);
    };
  }, [fontsLoaded, fontError]);

  const resolvedLoaded = !!(fontsLoaded || fontError || forceLoaded);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <ExpenseProvider>
                <BudgetProvider>
                  <GestureHandlerRootView style={{ flex: 1 }}>
                    {resolvedLoaded ? (
                      <RootLayoutNav />
                    ) : (
                      <View style={{ flex: 1, backgroundColor: "#050814" }} />
                    )}
                    {!splashFinished && (
                      <AnimatedSplashScreen 
                        onFinish={() => setSplashFinished(true)} 
                        fontsLoaded={resolvedLoaded}
                      />
                    )}
                  </GestureHandlerRootView>
                </BudgetProvider>
              </ExpenseProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

