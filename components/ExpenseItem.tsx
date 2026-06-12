import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { safeHaptics } from "@/utils/haptics";
import React, { useRef } from "react";
import {
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { CATEGORIES, Expense, useExpenses } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  expense: Expense;
  onEdit?: (expense: Expense) => void;
}

export default function ExpenseItem({ expense, onEdit }: Props) {
  const colors = useColors();
  const { deleteExpense } = useExpenses();
  const cat = CATEGORIES.find((c) => c.id === expense.categoryId) || CATEGORIES.find((c) => c.id === "other")!;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const handleDelete = () => {
    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Delete Expense", "Remove this expense permanently?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          deleteExpense(expense.id);
        },
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      marginBottom: 8,
      gap: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.text === "#f8fafc" ? `${cat.color}1c` : cat.lightColor,
    },
    info: {
      flex: 1,
    },
    catLabel: {
      fontSize: 14,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    note: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    right: {
      alignItems: "flex-end",
      gap: 6,
    },
    amount: {
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    actions: {
      flexDirection: "row",
      gap: 6,
    },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.15)" : "#eff6ff",
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 8,
    },
    editBtnText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
      color: colors.text === "#f8fafc" ? "#818cf8" : "#3b82f6",
    },
    deleteBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(239, 68, 68, 0.15)" : "#fef2f2",
      alignItems: "center",
      justifyContent: "center",
    },
  });

  const renderPaymentModeBadge = () => {
    if (!expense.paymentMode || expense.paymentMode === "none") return null;

    let icon: any = "credit-card";
    let bg = "rgba(99, 102, 241, 0.12)";
    let fg = "#a5b4fc";
    let label = expense.paymentMode.toUpperCase();

    if (expense.paymentMode === "upi") {
      icon = "zap";
      bg = "rgba(6, 182, 212, 0.15)";
      fg = "#22d3ee";
      label = "UPI";
    } else if (expense.paymentMode === "card") {
      icon = "credit-card";
      bg = "rgba(249, 115, 22, 0.15)";
      fg = "#fdba74";
      label = "CARD";
    } else if (expense.paymentMode === "cash") {
      icon = "dollar-sign";
      bg = "rgba(16, 185, 129, 0.15)";
      fg = "#34d399";
      label = "CASH";
    } else if (expense.paymentMode === "netbanking") {
      icon = "briefcase";
      bg = "rgba(99, 102, 241, 0.15)";
      fg = "#c7d2fe";
      label = "BANK";
    }

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: bg,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
          gap: 4,
          borderWidth: 0.5,
          borderColor: `${fg}30`,
        }}
      >
        <Feather name={icon} size={9} color={fg} />
        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: fg, letterSpacing: 0.5 }}>
          {label}
        </Text>
      </View>
    );
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ scale: scaleAnim }] }]}>
      <View style={styles.iconWrap}>
        <Feather name={cat.icon as any} size={22} color={cat.color} />
      </View>

      <View style={styles.info}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.catLabel}>{cat.label}</Text>
          {renderPaymentModeBadge()}
        </View>
        {!!expense.note && <Text style={styles.note}>{expense.note}</Text>}
      </View>

      <View style={styles.right}>
        <Text style={styles.amount}>₹{Number(expense.amount || 0).toLocaleString("en-IN")}</Text>
        <View style={styles.actions}>
          {onEdit && (
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => { safeHaptics.selectionAsync(); onEdit(expense); }}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={11} color={colors.text === "#f8fafc" ? "#818cf8" : "#3b82f6"} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            activeOpacity={0.75}
          >
            <Feather name="trash-2" size={13} color={colors.text === "#f8fafc" ? "#f87171" : "#ef4444"} />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}
