import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { safeHaptics } from "@/utils/haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AddExpenseModal from "@/components/AddExpenseModal";
import ExpenseItem from "@/components/ExpenseItem";
import { Expense, useExpenses } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function groupByDate(expenses: Expense[]): { date: string; items: Expense[] }[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  const sorted = Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
  return sorted;
}

function formatDateFull(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function HistoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getExpensesForMonth, getTotalForMonth, isLoading } = useExpenses();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [showAdd, setShowAdd] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);


  const expenses = getExpensesForMonth(year, month);
  const total = getTotalForMonth(year, month);
  const grouped = groupByDate(expenses);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const prevMonth = () => {
    safeHaptics.selectionAsync();
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    safeHaptics.selectionAsync();
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 8,
      padding: 6,
      borderRadius: 16,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(14, 17, 31, 0.65)" : "rgba(255, 255, 255, 0.8)",
      borderWidth: 1,
      borderColor: colors.border,
    },
    navBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.08)" : "rgba(99, 102, 241, 0.04)",
      borderWidth: 1,
      borderColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.15)" : "rgba(99, 102, 241, 0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 12,
      marginTop: 4,
    },
    summaryChip: {
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.08)" : colors.accent,
      borderWidth: 1,
      borderColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.2)" : colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 7,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    summaryTotal: {
      fontSize: 15,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    summaryCount: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginLeft: 10,
    },
    groupHeader: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    groupDate: {
      fontSize: 13,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    groupTotal: {
      fontSize: 13,
      fontWeight: "600" as const,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    listContent: {
      paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84,
    },
    emptyWrap: {
      alignItems: "center",
      paddingTop: 64,
    },
    emptyText: {
      fontSize: 15,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 10,
    },
    fab: {
      position: "absolute",
      right: 20,
      bottom: Platform.OS === "web" ? 34 + 84 : Platform.select({ ios: 84 + 8, default: 64 + 8 }),
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 6,
    },
  });

  type ListItem =
    | { type: "group_header"; date: string; total: number }
    | { type: "expense"; expense: Expense };

  const flatData: ListItem[] = [];
  for (const group of grouped) {
    const groupTotal = group.items.reduce((s, e) => s + Number(e.amount || 0), 0);
    flatData.push({ type: "group_header", date: group.date, total: groupTotal });
    for (const item of group.items) {
      flatData.push({ type: "expense", expense: item });
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>History</Text>
      </View>

      <View style={styles.monthNav}>
        <TouchableOpacity style={styles.navBtn} onPress={prevMonth} activeOpacity={0.7}>
          <Feather name="chevron-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
        <TouchableOpacity style={styles.navBtn} onPress={nextMonth} activeOpacity={0.7}>
          <Feather name="chevron-right" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryChip}>
          <Feather name="trending-up" size={14} color={colors.primary} />
          <Text style={styles.summaryTotal}>₹{Number(total || 0).toLocaleString("en-IN")}</Text>
        </View>
        <Text style={styles.summaryCount}>{expenses.length} expenses</Text>
      </View>

      <FlatList
        data={flatData}
        keyExtractor={(item, i) =>
          item.type === "expense" ? item.expense.id : `gh-${item.date}`
        }
        renderItem={({ item }) => {
          if (item.type === "group_header") {
            return (
              <View style={[styles.groupHeader, { paddingLeft: 34 }]}>
                <View style={{
                  position: "absolute",
                  left: 19,
                  top: 23,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  borderWidth: 2.5,
                  borderColor: colors.primary,
                  backgroundColor: colors.background,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 4,
                }} />
                <Text style={styles.groupDate}>{formatDateFull(item.date)}</Text>
                <Text style={styles.groupTotal}>₹{Number(item.total || 0).toLocaleString("en-IN")}</Text>
              </View>
            );
          }
          return (
            <View style={{ paddingHorizontal: 16, flexDirection: "row" }}>
              <View style={{ width: 16, alignItems: "center" }}>
                <View style={{ width: 1, flex: 1, backgroundColor: colors.border }} />
                <View style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.primary,
                  position: "absolute",
                  top: 32,
                  shadowColor: colors.primary,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.5,
                  shadowRadius: 3,
                }} />
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <ExpenseItem
                  expense={item.expense}
                  onEdit={(exp) => { setEditExpense(exp); setShowAdd(true); }}
                />
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Feather name="calendar" size={40} color={colors.mutedForeground} />
            <Text style={styles.emptyText}>No expenses in {MONTH_NAMES[month - 1]}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => { setEditExpense(null); setShowAdd(true); safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={["#6366f1", "#a855f7"]}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
          }}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Feather name="plus" size={28} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      <AddExpenseModal
        visible={showAdd}
        onClose={() => { setShowAdd(false); setEditExpense(null); }}
        editExpense={editExpense}
      />
    </View>
  );
}
