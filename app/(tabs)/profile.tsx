import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";

import { useAuth } from "@/context/AuthContext";
import { useExpenses } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";
import { fetchAndParseSMS, requestSmsPermission } from "@/utils/smsParser";
import { useTheme } from "@/context/ThemeContext";

interface MenuItemProps {
  icon: string;
  label: string;
  sublabel?: string;
  onPress: () => void;
  danger?: boolean;
  rightText?: string;
  rightElement?: React.ReactNode;
}

function MenuItem({ icon, label, sublabel, onPress, danger, rightText, rightElement }: MenuItemProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        gap: 14,
      }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          backgroundColor: danger 
            ? (colors.text === "#f8fafc" ? "rgba(239, 68, 68, 0.12)" : "#fee2e2")
            : (colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.08)" : colors.muted),
          alignItems: "center",
          justifyContent: "center",
          borderWidth: colors.text === "#f8fafc" ? 1 : 0,
          borderColor: danger ? "rgba(239, 68, 68, 0.25)" : "rgba(99, 102, 241, 0.2)",
        }}
      >
        <Feather 
          name={icon as any} 
          size={18} 
          color={danger ? "#ef4444" : (colors.text === "#f8fafc" ? "#818cf8" : colors.mutedForeground)} 
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 15,
            fontFamily: "Inter_500Medium",
            fontWeight: "500" as const,
            color: danger ? "#ef4444" : colors.foreground,
          }}
        >
          {label}
        </Text>
        {!!sublabel && (
          <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 }}>
            {sublabel}
          </Text>
        )}
      </View>
      {rightElement ? (
        rightElement
      ) : rightText ? (
        <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
          {rightText}
        </Text>
      ) : (
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

function Divider() {
  const colors = useColors();
  return <View style={{ height: 1, backgroundColor: colors.border, marginHorizontal: 16 }} />;
}

const getFallbackAvatar = (isDarkTheme: boolean) =>
  isDarkTheme
    ? require("../../assets/images/default_avatar_dark.png")
    : require("../../assets/images/default_avatar_light.png");

export default function ProfileScreen() {
  const colors = useColors();
  const { theme, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, logout, updateProfile } = useAuth();
  const { addMultipleExpenses } = useExpenses();

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(user?.name || "");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  React.useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.avatarUri]);

  React.useEffect(() => {
    if (!editingName) {
      setNameVal(user?.name || "");
    }
  }, [user?.name, editingName]);

  React.useEffect(() => {
    AsyncStorage.getItem("@auto_sync_enabled").then(val => {
      setAutoSyncEnabled(val === "true");
    });
  }, []);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const MAX_PROFILE_PHOTO_MB = 5;
  const MAX_PROFILE_PHOTO_BYTES = MAX_PROFILE_PHOTO_MB * 1024 * 1024;

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Allow access to your photos to set a profile picture.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const pickedImage = result.assets[0];
      if (pickedImage.fileSize && pickedImage.fileSize > MAX_PROFILE_PHOTO_BYTES) {
        Alert.alert(
          "Image too large",
          `Please choose a photo under ${MAX_PROFILE_PHOTO_MB} MB for faster loading. Recommended: square image, at least 512 x 512 pixels.`
        );
        return;
      }
      await updateProfile({ avatarUri: pickedImage.uri });
      setAvatarLoadFailed(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleAvatarPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const hasPhoto = !!user?.avatarUri && !avatarLoadFailed;
    
    Alert.alert(
      "Profile Picture",
      "Choose an action:",
      hasPhoto
        ? [
            { text: "📸 Select from Library", onPress: pickAvatar },
            {
              text: "🗑️ Remove Photo",
              style: "destructive",
              onPress: () => {
                Alert.alert(
                  "Remove Photo",
                  "Are you sure you want to remove your profile photo?",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: async () => {
                        await updateProfile({ avatarUri: "" });
                        setAvatarLoadFailed(false);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      },
                    },
                  ]
                );
              },
            },
            { text: "Cancel", style: "cancel" },
          ]
        : [
            { text: "📸 Select from Library", onPress: pickAvatar },
            { text: "Cancel", style: "cancel" },
          ]
    );
  };

  const handleLogout = async () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const saveName = async () => {
    await updateProfile({ name: nameVal.trim() || user?.name || "" });
    setEditingName(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleToggleAutoSync = async (newValue: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!newValue) {
      setAutoSyncEnabled(false);
      await AsyncStorage.setItem("@auto_sync_enabled", "false");
      return;
    }

    Alert.alert(
      "SMS Access Consent",
      "To automatically log your spends, we need permission to read your incoming SMS messages to detect bank and UPI transactions.\n\nYour data is completely private. Messages are processed entirely on your device and are never sent to any server.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "I Understand", onPress: () => proceedWithSmsSync() }
      ]
    );
  };

  const proceedWithSmsSync = async () => {
    try {
      const granted = await requestSmsPermission();
      if (!granted) {
        Alert.alert(
          "SMS Sync Unavailable",
          "Auto-Sync needs native Android SMS access. Please use an Android development/production build and grant SMS permission."
        );
        return;
      }

      setAutoSyncEnabled(true);
      await AsyncStorage.setItem("@auto_sync_enabled", "true");

      const lastSyncStr = await AsyncStorage.getItem("@last_sms_sync_time");
      let minDateMs = Date.now() - 30 * 24 * 60 * 60 * 1000; // default to 30 days ago
      if (lastSyncStr) {
        minDateMs = parseInt(lastSyncStr, 10);
      }

      const parsedExpenses = await fetchAndParseSMS(minDateMs);

      if (parsedExpenses.length === 0) {
        Alert.alert("Auto-Sync Enabled", "Your SMS will now be synced securely in the background.");
        return;
      }

      Alert.alert(
        "Auto-Sync Enabled", 
        `We found ${parsedExpenses.length} past transactions. Add them to your expenses?`, 
        [
          { text: "Skip", style: "cancel", onPress: () => AsyncStorage.setItem("@last_sms_sync_time", Date.now().toString()) },
          {
            text: "Add All",
            style: "default",
            onPress: async () => {
               await addMultipleExpenses(parsedExpenses);
               await AsyncStorage.setItem("@last_sms_sync_time", Date.now().toString());
               Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
        ]
      );
    } catch (err: any) {
      Alert.alert("SMS Sync Error", err.message);
      setAutoSyncEnabled(false);
      await AsyncStorage.setItem("@auto_sync_enabled", "false");
    }
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    headerGrad: { paddingTop: topPad + 16, paddingBottom: 40, paddingHorizontal: 20 },
    headerTitle: {
      fontSize: 24,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      marginBottom: 20,
    },
    avatarCenteredWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    avatarWrap: {
      position: "relative",
    },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 28,
      backgroundColor: "rgba(255,255,255,0.2)",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.3)",
    },
    avatarImage: {
      width: 84,
      height: 84,
      borderRadius: 26,
    },
    cameraBtn: {
      position: "absolute",
      bottom: -2,
      right: -2,
      width: 28,
      height: 28,
      borderRadius: 9,
      backgroundColor: "#fff",
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    nameCenteredRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginBottom: 6,
      paddingHorizontal: 20,
    },
    nameInputCentered: {
      fontSize: 22,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      borderBottomWidth: 1.5,
      borderBottomColor: "rgba(255,255,255,0.5)",
      paddingBottom: 2,
      textAlign: "center",
      minWidth: 160,
    },
    nameTextCentered: {
      fontSize: 22,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: "#fff",
      textAlign: "center",
    },
    editNameBtnCentered: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    usernameTextCentered: {
      fontSize: 14,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.text === "#f8fafc" ? "#38bdf8" : "#e0e7ff",
      textAlign: "center",
      marginBottom: 4,
    },
    emailTextCentered: {
      fontSize: 13,
      fontWeight: "400" as const,
      fontFamily: "Inter_400Regular",
      color: "rgba(255,255,255,0.72)",
      textAlign: "center",
    },
    section: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginHorizontal: 16,
      marginTop: 16,
      overflow: "hidden",
      borderWidth: colors.text === "#f8fafc" ? 1 : 0,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.04,
      shadowRadius: 10,
      elevation: 3,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      letterSpacing: 0.8,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 8,
    },
    scrollContent: {
      paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={colors.text === "#f8fafc" ? ["#1e1b4b", "#080A10"] : ["#4f46e5", "#7c3aed"]}
          style={styles.headerGrad}
        >
          <Text style={styles.headerTitle}>Profile</Text>
          
          <View style={styles.avatarCenteredWrap}>
            <TouchableOpacity style={styles.avatarWrap} onPress={handleAvatarPress} activeOpacity={0.8}>
              <View style={styles.avatar}>
                {user?.avatarUri && !avatarLoadFailed ? (
                  <Image 
                    source={{ uri: user.avatarUri }} 
                    style={styles.avatarImage} 
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <Image
                    source={getFallbackAvatar(colors.text === "#f8fafc")}
                    style={styles.avatarImage}
                  />
                )}
              </View>
              <View style={styles.cameraBtn}>
                <Feather name="camera" size={13} color="#4f46e5" />
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.nameCenteredRow}>
            {editingName ? (
              <TextInput
                style={styles.nameInputCentered}
                value={nameVal}
                onChangeText={setNameVal}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={saveName}
                onBlur={saveName}
                placeholderTextColor="rgba(255,255,255,0.5)"
              />
            ) : (
              <Text style={styles.nameTextCentered}>{user?.name}</Text>
            )}
            <TouchableOpacity
              style={styles.editNameBtnCentered}
              onPress={() => { setNameVal(user?.name || ""); setEditingName((v) => !v); }}
            >
              <Feather name={editingName ? "check" : "edit-2"} size={14} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.usernameTextCentered}>@{user?.username}</Text>
          <Text style={styles.emailTextCentered}>{user?.email}</Text>
        </LinearGradient>

        {/* Preferences */}
        <View style={[styles.section, { marginTop: -20 }]}>
          <Text style={styles.sectionLabel}>PREFERENCES</Text>
          <MenuItem
            icon={theme === "dark" ? "moon" : "sun"}
            label="Dark Mode"
            sublabel="Enable dark visual styling"
            onPress={() => {
              const nextTheme = theme === "dark" ? "light" : "dark";
              setTheme(nextTheme);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            rightElement={
              <Switch
                value={theme === "dark"}
                onValueChange={(newValue) => {
                  setTheme(newValue ? "dark" : "light");
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
          <Divider />
          <MenuItem
            icon="message-square"
            label="Auto-Sync SMS Expenses"
            sublabel="Read GPay/UPI messages"
            onPress={() => handleToggleAutoSync(!autoSyncEnabled)}
            rightElement={
              <Switch
                value={autoSyncEnabled}
                onValueChange={handleToggleAutoSync}
                trackColor={{ false: colors.border, true: colors.primary }}
              />
            }
          />
        </View>

        {/* Support */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>SUPPORT</Text>
          <MenuItem
            icon="help-circle"
            label="Help & FAQ"
            sublabel="Common questions"
            onPress={() => router.push("/faq")}
          />
          <Divider />
          <MenuItem
            icon="info"
            label="About WhisperLedger"
            sublabel="Version 1.0.0"
            onPress={() => router.push("/about")}
          />
        </View>

        {/* Danger */}
        <View style={styles.section}>
          <MenuItem icon="log-out" label="Sign Out" onPress={handleLogout} danger />
        </View>
      </ScrollView>
    </View>
  );
}
