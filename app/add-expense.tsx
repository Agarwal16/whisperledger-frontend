import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { safeHaptics } from "@/utils/haptics";
import { useLocalSearchParams, router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MiniCalendar from "@/components/MiniCalendar";
import { CATEGORIES, CategoryId, PaymentMode, useExpenses } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeISODate(value: any) {
  if (!value || typeof value !== "string") return todayISO();
  const normalized = value.trim();
  const parts = normalized.split("-");
  if (parts.length !== 3) return todayISO();
  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isFutureISODate(value: any) {
  if (!value || typeof value !== "string") return false;
  const normalized = normalizeISODate(value);
  return normalized > todayISO();
}

export default function AddExpenseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addExpense, updateExpense, expenses, getTotalForDate } = useExpenses();
  const { editId, date: paramDate } = useLocalSearchParams<{ editId?: string; date?: string }>();

  const editExpense = editId ? expenses.find((e) => e.id === editId) : null;

  const [amount, setAmount] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>("groceries");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const amountRef = useRef<TextInput>(null);

  useEffect(() => {
    if (editExpense) {
      setAmount(editExpense.amount ? editExpense.amount.toString() : "");
      setSelectedCategory(editExpense.categoryId || "groceries");
      setPaymentMode(editExpense.paymentMode || "upi");
      setNote(editExpense.note || "");
      setDate(editExpense.date || todayISO());
    } else {
      setAmount("");
      setSelectedCategory("groceries");
      setPaymentMode("upi");
      setNote("");
      setDate(paramDate || todayISO());
    }
    setTimeout(() => amountRef.current?.focus(), 150);
  }, [editId, paramDate]);

  const handleSave = useCallback(async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0 || isFutureISODate(date)) return;
    setSaving(true);
    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const normalizedDate = normalizeISODate(date);
    try {
      if (editExpense) {
        await updateExpense(editExpense.id, {
          amount: parsed,
          categoryId: selectedCategory,
          paymentMode,
          note: note.trim(),
          date: normalizedDate,
        });
      } else {
        await addExpense({
          amount: parsed,
          categoryId: selectedCategory,
          paymentMode,
          note: note.trim(),
          date: normalizedDate,
        });
      }
      router.back();
    } finally {
      setSaving(false);
    }
  }, [amount, selectedCategory, paymentMode, note, date, editExpense, addExpense, updateExpense]);

  const selectedCat = CATEGORIES.find((c) => c.id === selectedCategory) || CATEGORIES.find((c) => c.id === "other")!;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: insets.top + 10,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    titleIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    title: {
      fontSize: 18,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 40,
    },
    amountRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 18,
      paddingHorizontal: 18,
      paddingVertical: 14,
      marginBottom: 22,
    },
    currency: {
      fontSize: 30,
      fontWeight: "700" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_700Bold",
      marginRight: 6,
    },
    amountInput: {
      flex: 1,
      fontSize: 38,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      padding: 0,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: 12,
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-start",
      marginBottom: 6,
    },
    categoryCell: {
      width: "20%",
      alignItems: "center",
      marginBottom: 16,
      gap: 6,
    },
    categoryIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: "transparent",
    },
    categoryName: {
      fontSize: 10,
      fontFamily: "Inter_500Medium",
      fontWeight: "500" as const,
      textAlign: "center",
      lineHeight: 13,
    },
    noteInput: {
      backgroundColor: colors.muted,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      marginBottom: 14,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      marginBottom: 22,
      gap: 10,
    },
    dateText: {
      flex: 1,
      fontSize: 15,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    saveBtn: {
      marginHorizontal: 20,
      marginBottom: insets.bottom + 16,
      marginTop: 10,
      borderRadius: 16,
      paddingVertical: 16,
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
    },
    saveBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.titleIcon, { backgroundColor: colors.text === "#f8fafc" ? `${selectedCat.color}1c` : selectedCat.lightColor }]}>
            <Feather name={selectedCat.icon as any} size={18} color={selectedCat.color} />
          </View>
          <Text style={styles.title}>
            {editExpense ? "Edit Expense" : "Add Expense"}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="x" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
        >
          {/* Amount */}
          <View style={styles.amountRow}>
            <Text style={styles.currency}>₹</Text>
            <TextInput
              ref={amountRef}
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Category Icon Grid */}
          <Text style={styles.sectionLabel}>Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((c) => {
              const isSelected = selectedCategory === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.categoryCell}
                  onPress={() => {
                    setSelectedCategory(c.id);
                    safeHaptics.selectionAsync();
                  }}
                  activeOpacity={0.75}
                >
                  <View
                    style={[
                      styles.categoryIconWrap,
                      {
                        backgroundColor: isSelected 
                          ? (colors.text === "#f8fafc" ? `${c.color}1c` : c.lightColor) 
                          : colors.muted,
                        borderColor: isSelected ? c.color : "transparent",
                        shadowColor: isSelected ? c.color : "transparent",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: isSelected ? 0.3 : 0,
                        shadowRadius: 6,
                        elevation: isSelected ? 4 : 0,
                      },
                    ]}
                  >
                    <Feather
                      name={c.icon as any}
                      size={22}
                      color={isSelected ? c.color : colors.mutedForeground}
                    />
                  </View>
                  <Text
                    style={[
                      styles.categoryName,
                      { color: isSelected ? c.color : colors.mutedForeground },
                    ]}
                    numberOfLines={2}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Payment Mode */}
          <Text style={styles.sectionLabel}>Payment Mode</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
            {(["none", "upi", "card", "cash", "netbanking"] as PaymentMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  { 
                    flex: 1, 
                    minWidth: "18%",
                    alignItems: "center", 
                    paddingVertical: 10, 
                    borderRadius: 12, 
                    borderWidth: 1, 
                    borderColor: colors.border,
                    backgroundColor: colors.card
                  },
                  paymentMode === mode && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => { setPaymentMode(mode); safeHaptics.selectionAsync(); }}
              >
                <Text style={[
                  { fontSize: 12, fontFamily: "Inter_500Medium", color: colors.foreground, textTransform: "capitalize" },
                  paymentMode === mode && { color: "#fff", fontFamily: "Inter_600SemiBold", fontWeight: "600" as const }
                ]} numberOfLines={1} adjustsFontSizeToFit>
                  {mode === "netbanking" ? "Bank" : mode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Note */}
          <Text style={styles.sectionLabel}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="What was this for?"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          {/* Date */}
          <Text style={styles.sectionLabel}>Date</Text>
          <View style={[styles.dateRow, { marginBottom: showCalendar ? 12 : 22 }]}>
            <TouchableOpacity onPress={() => { setShowCalendar(!showCalendar); Keyboard.dismiss(); }} style={{ padding: 4, marginLeft: -4 }}>
              <Feather name="calendar" size={18} color={showCalendar ? colors.primary : colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={styles.dateText}
              value={date}
              onChangeText={(value) => {
                const trimmed = value.trim();
                if (isFutureISODate(trimmed)) {
                  setDate(todayISO());
                  return;
                }
                setDate(value);
              }}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              onFocus={() => setShowCalendar(false)}
              onBlur={() => {
                if (isFutureISODate(date)) setDate(todayISO());
              }}
            />
          </View>
          {showCalendar && (
            <MiniCalendar 
              selectedDate={date} 
              onSelectDate={(d) => {
                if (!isFutureISODate(d)) setDate(d);
                setShowCalendar(false);
              }}
              getTotalForDate={getTotalForDate}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.saveBtn,
          {
            backgroundColor: selectedCat.color,
            opacity: saving || !amount || isFutureISODate(date) ? 0.5 : 1,
          },
        ]}
        onPress={handleSave}
        disabled={saving || !amount || isFutureISODate(date)}
        activeOpacity={0.85}
      >
        <Feather name={editExpense ? "check" : "plus"} size={18} color="#fff" />
        <Text style={styles.saveBtnText}>
          {saving ? "Saving..." : editExpense ? "Update Expense" : "Save Expense"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
