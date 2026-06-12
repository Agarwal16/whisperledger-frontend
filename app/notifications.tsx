import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";
import {
  requestNotificationPermissions,
  scheduleDailyExpenseReminder,
} from "@/utils/notifications";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  read?: boolean;
  createdAt?: any;
  notificationType?: string;
}

function isPermissionDeniedError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  return (
    maybe.code === "permission-denied" ||
    (typeof maybe.message === "string" && maybe.message.toLowerCase().includes("insufficient permissions"))
  );
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [hour, setHour] = useState(20);
  const [minute, setMinute] = useState(0);
  const [savingReminder, setSavingReminder] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [pickerMode, setPickerMode] = useState<'hour' | 'minute'>('hour');

  const [hourInput, setHourInput] = useState("");
  const [minuteInput, setMinuteInput] = useState("");

  // Sync text inputs when hour/minute changes (e.g. via dial)
  useEffect(() => {
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    setHourInput(String(displayHour));
  }, [hour]);

  useEffect(() => {
    setMinuteInput(String(minute).padStart(2, "0"));
  }, [minute]);

  const handleHourInputChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setHourInput(cleaned);
    if (cleaned) {
      const parsed = parseInt(cleaned, 10);
      if (parsed >= 1 && parsed <= 12) {
        const isPM = hour >= 12;
        if (parsed === 12) {
          setHour(isPM ? 12 : 0);
        } else {
          setHour(isPM ? parsed + 12 : parsed);
        }
      }
    }
  };

  const handleMinuteInputChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, "");
    setMinuteInput(cleaned);
    if (cleaned) {
      const parsed = parseInt(cleaned, 10);
      if (parsed >= 0 && parsed <= 59) {
        setMinute(parsed);
      }
    }
  };

  const handleHourBlur = () => {
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    setHourInput(String(displayHour));
  };

  const handleMinuteBlur = () => {
    setMinuteInput(String(minute).padStart(2, "0"));
  };

  useEffect(() => {
    if (!user || isLoading) return;
    const q = query(
      collection(db, `users/${user.uid}/notifications`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, {
      next: (snap) => {
        const allNotifs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        setItems(allNotifs.filter((x) => x.notificationType !== "daily_reminder" && x.notificationType !== "budget_alert"));
      },
      error: (err) => {
        console.warn("⚠️ Notification log snapshot failed (likely permission-denied/offline):", err);
      }
    });
    return unsub;
  }, [user, isLoading]);

  useEffect(() => {
    if (!user || isLoading || items.length === 0) return;
    const unread = items.filter(x => !x.read);
    if (unread.length > 0) {
      const batchPromises = unread.map(x => 
        updateDoc(doc(db, `users/${user.uid}/notifications/${x.id}`), { read: true }).catch(() => null)
      );
      Promise.all(batchPromises);
    }
  }, [items, user, isLoading]);

  useEffect(() => {
    if (!user || isLoading) return;
    const settingsRef = doc(db, `users/${user.uid}/settings/reminder`);
    const unsub = onSnapshot(settingsRef, {
      next: (snap) => {
        const data = snap.data() as any;
        if (data?.hour != null && data?.minute != null) {
          setHour(Number(data.hour));
          setMinute(Number(data.minute));
        }
      },
      error: (err) => {
        console.warn("⚠️ Reminder settings snapshot failed (likely permission-denied/offline):", err);
      }
    });
    return unsub;
  }, [user, isLoading]);

  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  const handleNotificationPress = async (item: NotificationItem) => {
    if (!user || item.read) return;
    try {
      Haptics.selectionAsync();
      await updateDoc(doc(db, `users/${user.uid}/notifications/${item.id}`), { read: true });
    } catch (e) {
      console.warn("Failed to mark notification as read:", e);
    }
  };

  const markAllRead = async () => {
    if (!user || unreadCount === 0) return;
    Haptics.selectionAsync();
    try {
      await Promise.all(
        items.filter((x) => !x.read).map((x) =>
          updateDoc(doc(db, `users/${user.uid}/notifications/${x.id}`), { read: true })
        )
      );
    } catch (e) {
      if (isPermissionDeniedError(e)) {
        Alert.alert("Permission denied", "You don't have permission to mark notifications as read.");
        return;
      }
      console.warn("Failed to mark all as read:", e);
    }
  };

  const clearAllNotifications = async () => {
    if (!user || items.length === 0) return;
    
    Alert.alert(
      "Clear all notifications",
      "Are you sure you want to permanently delete all notifications? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            try {
              await Promise.all(
                items.map((x) =>
                  deleteDoc(doc(db, `users/${user.uid}/notifications/${x.id}`))
                )
              );
            } catch (e) {
              console.warn("Failed to clear notifications:", e);
              Alert.alert("Error", "Failed to clear notifications. Please check connection.");
            }
          },
        },
      ]
    );
  };

  const deleteIndividualNotification = async (id: string) => {
    if (!user) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      await deleteDoc(doc(db, `users/${user.uid}/notifications/${id}`));
    } catch (e) {
      console.warn("Failed to delete notification:", e);
    }
  };

  const incrementHour = () => {
    Haptics.selectionAsync();
    setHour((h) => (h + 1) % 24);
  };

  const decrementHour = () => {
    Haptics.selectionAsync();
    setHour((h) => (h - 1 + 24) % 24);
  };

  const incrementMinute = () => {
    Haptics.selectionAsync();
    setMinute((m) => (m + 1) % 60);
  };

  const decrementMinute = () => {
    Haptics.selectionAsync();
    setMinute((m) => (m - 1 + 60) % 60);
  };

  const ampm = hour >= 12 ? "PM" : "AM";

  const handlePeriodChange = (newPeriod: "AM" | "PM") => {
    Haptics.selectionAsync();
    if (newPeriod === "AM" && hour >= 12) {
      setHour((h) => h - 12);
    } else if (newPeriod === "PM" && hour < 12) {
      setHour((h) => h + 12);
    }
  };

  const handleNumberSelect = (val: number) => {
    Haptics.selectionAsync();
    if (pickerMode === "hour") {
      const selectedHour = val === 12 ? 0 : val;
      if (ampm === "PM") {
        setHour(selectedHour + 12);
      } else {
        setHour(selectedHour);
      }
      setTimeout(() => {
        setPickerMode("minute");
      }, 250);
    } else {
      setMinute(val);
    }
  };

  const saveReminder = async () => {
    if (!user) return;

    setSavingReminder(true);
    try {
      const allowed = await requestNotificationPermissions();
      if (!allowed) {
        Alert.alert("Permission needed", "Allow notifications to enable daily reminders.");
        return;
      }

      const notificationId = await scheduleDailyExpenseReminder(hour, minute);

      await setDoc(
        doc(db, `users/${user.uid}/settings/reminder`),
        {
          enabled: true,
          hour,
          minute,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          notificationId: notificationId || "",
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const formattedHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
      const formattedMinute = String(minute).padStart(2, "0");
      const ampm = hour >= 12 ? "PM" : "AM";
      Alert.alert("Reminder saved", `Daily reminder set for ${formattedHour}:${formattedMinute} ${ampm}.`);
    } catch (e) {
      console.warn("⚠️ Failed to save reminder settings (likely permission-denied):", e);
      if (isPermissionDeniedError(e)) {
        Alert.alert("Permission denied", "Unable to save reminder settings for this account.");
        return;
      }
      Alert.alert("Failed to save", "Unable to save reminder settings. Please verify account permissions.");
    } finally {
      setSavingReminder(false);
    }
  };

  const handleSavePress = async () => {
    await saveReminder();
    setShowTimeModal(false);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 14,
      paddingHorizontal: 16,
      paddingBottom: 14,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    leftHead: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { fontSize: 20, fontFamily: "Inter_700Bold", fontWeight: "700" as const, color: colors.foreground },
    compactReminderBtn: {
      marginHorizontal: 16,
      marginTop: 14,
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    compactIconBg: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: `${colors.primary}15`,
      alignItems: "center",
      justifyContent: "center",
    },
    compactLabel: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    compactSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    compactBadge: {
      backgroundColor: colors.primary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    compactBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontFamily: "Inter_700Bold",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalDismissArea: {
      flex: 1,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 10,
    },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      marginBottom: 20,
    },
    modalActions: {
      flexDirection: "row",
      width: "100%",
      gap: 12,
      marginTop: 8,
    },
    cancelBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelBtnText: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
    },
    reminderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 16,
      alignSelf: "flex-start",
    },
    reminderTitle: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
    },
    clockDial: {
      width: 200,
      height: 200,
      borderRadius: 100,
      backgroundColor: colors.background,
      borderWidth: 1.5,
      borderColor: colors.border,
      position: "relative",
      alignItems: "center",
      justifyContent: "center",
      marginVertical: 12,
    },
    clockPivot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      zIndex: 10,
    },
    clockNumberBtn: {
      position: "absolute",
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      zIndex: 5,
    },
    clockNumberText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    clockNumberTextSelected: {
      color: "#fff",
      fontFamily: "Inter_700Bold",
    },
    hourHandContainer: {
      position: "absolute",
      left: 98,
      top: 50,
      width: 4,
      height: 100,
      alignItems: "center",
      justifyContent: "flex-start",
    },
    hourHandLine: {
      width: 4,
      height: 42,
      backgroundColor: colors.foreground,
      borderRadius: 2,
    },
    minuteHandContainer: {
      position: "absolute",
      left: 99,
      top: 35,
      width: 2,
      height: 130,
      alignItems: "center",
      justifyContent: "flex-start",
    },
    minuteHandLine: {
      width: 2,
      height: 62,
      backgroundColor: colors.primary,
      borderRadius: 1,
    },
    modeRow: {
      flexDirection: "row",
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 4,
      width: "100%",
      maxWidth: 240,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      borderRadius: 8,
    },
    modeBtnActive: {
      backgroundColor: colors.card,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    modeBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    modeBtnTextActive: {
      color: colors.primary,
      fontFamily: "Inter_700Bold",
    },
    periodRow: {
      flexDirection: "row",
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 3,
      gap: 4,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    periodBtn: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 7,
    },
    periodBtnActive: {
      backgroundColor: colors.primary,
    },
    periodBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    periodBtnTextActive: {
      color: "#fff",
      fontFamily: "Inter_700Bold",
    },
    fineTuneRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      marginVertical: 12,
    },
    tuneBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: `${colors.foreground}08`,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
    },
    tuneBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    digitalDisplay: {
      backgroundColor: `${colors.primary}10`,
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${colors.primary}30`,
    },
    digitalText: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    digitalInput: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
      padding: 0,
      textAlign: "center",
      minWidth: 22,
    },
    digitalColon: {
      fontSize: 16,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    formattedText: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_500Medium",
      marginTop: 8,
      marginBottom: 16,
      textAlign: "center",
    },
    saveReminderBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 2,
    },
    saveReminderBtnText: {
      color: "#fff",
      fontFamily: "Inter_700Bold",
      fontSize: 14,
    },
    logHead: {
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    logTitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontWeight: "600" as const },
    markText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 12 },
    clearText: { color: "#ef4444", fontFamily: "Inter_600SemiBold", fontSize: 12 },
    item: {
      marginHorizontal: 16,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    itemUnread: { borderColor: colors.primary },
    itemTitle: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    itemBody: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
    itemMeta: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 8 },
    empty: { padding: 28, alignItems: "center" },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    deleteItemBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: "#ef444410",
      alignItems: "center",
      justifyContent: "center",
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.leftHead}>
          <TouchableOpacity
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
            style={{ padding: 4 }}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.title}>Notifications</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Feather name="bell" size={16} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{unreadCount}</Text>
        </View>
      </View>

      <TouchableOpacity 
        style={s.compactReminderBtn} 
        onPress={() => { Haptics.selectionAsync(); setShowTimeModal(true); }}
        activeOpacity={0.7}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={s.compactIconBg}>
            <Feather name="clock" size={16} color={colors.primary} />
          </View>
          <View>
            <Text style={s.compactLabel}>Daily Reminder</Text>
            <Text style={s.compactSub}>Logs prompt alert every day</Text>
          </View>
        </View>
        
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={s.compactBadge}>
            <Text style={s.compactBadgeText}>
              {hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}
              :{String(minute).padStart(2, "0")}{" "}
              {hour >= 12 ? "PM" : "AM"}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        </View>
      </TouchableOpacity>

      <Modal
        visible={showTimeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowTimeModal(false)}
      >
        <View style={s.modalOverlay}>
          <TouchableOpacity 
            style={s.modalDismissArea} 
            activeOpacity={1} 
            onPress={() => setShowTimeModal(false)} 
          />
          <View style={s.modalContent}>
            <View style={s.modalHandle} />

            <View style={s.reminderHeader}>
              <Feather name="clock" size={18} color={colors.primary} />
              <Text style={s.reminderTitle}>SET DAILY EXPENSE REMINDER</Text>
            </View>

            {/* Mode Switcher */}
            <View style={s.modeRow}>
              <TouchableOpacity
                style={[s.modeBtn, pickerMode === 'hour' && s.modeBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setPickerMode('hour'); }}
                activeOpacity={0.8}
              >
                <Text style={[s.modeBtnText, pickerMode === 'hour' && s.modeBtnTextActive]}>HOURS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeBtn, pickerMode === 'minute' && s.modeBtnActive]}
                onPress={() => { Haptics.selectionAsync(); setPickerMode('minute'); }}
                activeOpacity={0.8}
              >
                <Text style={[s.modeBtnText, pickerMode === 'minute' && s.modeBtnTextActive]}>MINUTES</Text>
              </TouchableOpacity>
            </View>

            {/* Circular Clock Dial */}
            <View style={s.clockDial}>
              {/* Center Pivot */}
              <View style={s.clockPivot} />

              {/* Hour Hand Container */}
              <View style={[
                s.hourHandContainer, 
                { transform: [{ rotate: `${((hour % 12) * 30) + (minute * 0.5)}deg` }] }
              ]}>
                <View style={s.hourHandLine} />
              </View>

              {/* Minute Hand Container */}
              <View style={[
                s.minuteHandContainer, 
                { transform: [{ rotate: `${minute * 6}deg` }] }
              ]}>
                <View style={s.minuteHandLine} />
              </View>

              {/* Clock Numbers */}
              {(pickerMode === 'hour' 
                ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] 
                : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
              ).map((n, idx) => {
                const theta = idx * 30;
                const rad = (theta * Math.PI) / 180;
                const radius = 70;
                const x = 100 + radius * Math.sin(rad);
                const y = 100 - radius * Math.cos(rad);

                const isSelected = pickerMode === 'hour'
                  ? (hour % 12) === (n % 12)
                  : minute === n;

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[
                      s.clockNumberBtn, 
                      { left: x - 14, top: y - 14 },
                      isSelected && { backgroundColor: colors.primary }
                    ]}
                    onPress={() => handleNumberSelect(n)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      s.clockNumberText,
                      isSelected && s.clockNumberTextSelected
                    ]}>
                      {pickerMode === 'hour' ? n : String(n).padStart(2, "0")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* AM/PM Selector */}
            <View style={s.periodRow}>
              <TouchableOpacity
                style={[s.periodBtn, ampm === 'AM' && s.periodBtnActive]}
                onPress={() => handlePeriodChange('AM')}
                activeOpacity={0.8}
              >
                <Text style={[s.periodBtnText, ampm === 'AM' && s.periodBtnTextActive]}>AM</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.periodBtn, ampm === 'PM' && s.periodBtnActive]}
                onPress={() => handlePeriodChange('PM')}
                activeOpacity={0.8}
              >
                <Text style={[s.periodBtnText, ampm === 'PM' && s.periodBtnTextActive]}>PM</Text>
              </TouchableOpacity>
            </View>

            {/* Digital Readout & Fine-Tuning */}
            <View style={s.fineTuneRow}>
              <TouchableOpacity onPress={decrementMinute} style={s.tuneBtn} activeOpacity={0.7}>
                <Feather name="minus" size={14} color={colors.foreground} />
                <Text style={s.tuneBtnText}>1m</Text>
              </TouchableOpacity>
              
              <View style={[s.digitalDisplay, { flexDirection: "row", alignItems: "center", gap: 2 }]}>
                <TextInput
                  style={s.digitalInput}
                  value={hourInput}
                  onChangeText={handleHourInputChange}
                  onBlur={handleHourBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <Text style={s.digitalColon}>:</Text>
                <TextInput
                  style={s.digitalInput}
                  value={minuteInput}
                  onChangeText={handleMinuteInputChange}
                  onBlur={handleMinuteBlur}
                  keyboardType="number-pad"
                  maxLength={2}
                  selectTextOnFocus
                />
                <TouchableOpacity 
                  onPress={() => handlePeriodChange(ampm === "AM" ? "PM" : "AM")}
                  activeOpacity={0.7}
                  style={{ marginLeft: 4 }}
                >
                  <Text style={s.digitalText}>{ampm}</Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity onPress={incrementMinute} style={s.tuneBtn} activeOpacity={0.7}>
                <Feather name="plus" size={14} color={colors.foreground} />
                <Text style={s.tuneBtnText}>1m</Text>
              </TouchableOpacity>
            </View>

            <Text style={s.formattedText}>
              Phone alert sounds every day at{" "}
              <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold" }}>
                {hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}
                :{String(minute).padStart(2, "0")}{" "}
                {hour >= 12 ? "PM" : "AM"}
              </Text>
            </Text>

            <View style={s.modalActions}>
              <TouchableOpacity 
                style={s.cancelBtn} 
                onPress={() => setShowTimeModal(false)}
                activeOpacity={0.8}
              >
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={s.saveReminderBtn} 
                onPress={handleSavePress} 
                disabled={savingReminder} 
                activeOpacity={0.8}
              >
                <Text style={s.saveReminderBtnText}>
                  {savingReminder ? "Saving..." : "Save Time"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <View style={s.logHead}>
        <Text style={s.logTitle}>NOTIFICATION LOG</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity onPress={markAllRead} disabled={unreadCount === 0}>
            <Text style={[s.markText, unreadCount === 0 && { opacity: 0.4 }]}>Mark all read</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={clearAllNotifications} disabled={items.length === 0}>
            <Text style={[s.clearText, items.length === 0 && { opacity: 0.4 }]}>Clear all</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>No notifications yet.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[s.item, !item.read && s.itemUnread]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <TouchableOpacity
                style={{ flex: 1, paddingRight: 12 }}
                onPress={() => handleNotificationPress(item)}
                activeOpacity={0.7}
              >
                <Text style={s.itemTitle}>{item.title || "Notification"}</Text>
                <Text style={s.itemBody}>{item.body || ""}</Text>
                {!!item.notificationType && item.notificationType !== "admin_broadcast" && (
                  <Text style={s.itemMeta}>{item.notificationType}</Text>
                )}
              </TouchableOpacity>
              
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {!item.read && (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary }} />
                )}
                <TouchableOpacity
                  style={s.deleteItemBtn}
                  onPress={() => deleteIndividualNotification(item.id)}
                  activeOpacity={0.6}
                >
                  <Feather name="trash-2" size={15} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}
