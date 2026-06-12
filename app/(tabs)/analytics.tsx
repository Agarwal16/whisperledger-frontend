import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import React, { useState, useRef } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useBudgets } from "@/context/BudgetContext";
import { useTheme } from "@/context/ThemeContext";
import { CATEGORIES, CategoryId, useExpenses } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getLast6Months(year: number, month: number) {
  const months: { year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i;
    let y = year;
    if (m <= 0) { m += 12; y -= 1; }
    months.push({ year: y, month: m });
  }
  return months;
}

function getPrevMonth(year: number, month: number) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d} ${MONTH_NAMES[parseInt(m, 10) - 1].substring(0, 3)} ${y}`;
}

// Projection text helper calculation inlined in render function.

export default function AnalyticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { getCategoryTotalsForMonth, getTotalForMonth, getExpensesForMonth } = useExpenses();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [drillCategory, setDrillCategory] = useState<CategoryId | null>(null);
  const [drillPaymentMode, setDrillPaymentMode] = useState<string | null>(null);
  const [downloadingStatement, setDownloadingStatement] = useState(false);
  const [showStatementMonthPicker, setShowStatementMonthPicker] = useState(false);
  const isGeneratingRef = useRef(false);

  const params = useLocalSearchParams<{ tab?: string }>();
  const [activeSegment, setActiveSegment] = useState<"charts" | "budgets">("charts");
  const { isDark } = useTheme();
  const { budgets, setBudget, deleteBudget, getBudgetForCategory } = useBudgets();
  const [showSetModal, setShowSetModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(null);
  const [limitInput, setLimitInput] = useState("");

  React.useEffect(() => {
    if (params.tab === "budgets") {
      setActiveSegment("budgets");
    }
  }, [params.tab]);

  const totals = getCategoryTotalsForMonth(year, month);
  const totalSpend = getTotalForMonth(year, month);
  const expensesThisMonth = getExpensesForMonth(year, month);

  const selectedMonthStr = `${year}-${String(month).padStart(2, "0")}`;
  
  const monthBudgetStatuses = budgets
    .filter((b) => b.month === selectedMonthStr)
    .map((b) => {
      const spent = totals[b.categoryId] || 0;
      const remaining = Math.max(0, b.monthlyLimit - spent);
      const percentage = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
      const status =
        percentage >= 100
          ? "exceeded"
          : percentage >= 80
          ? "critical"
          : percentage >= 50
          ? "warning"
          : "safe";
      return { ...b, spent, remaining, percentage, status };
    });

  const handleSetBudget = async () => {
    if (!selectedCategory) return;
    const limit = parseFloat(limitInput.replace(/,/g, ""));
    if (Number.isNaN(limit) || limit <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid budget limit.");
      return;
    }
    await setBudget(selectedCategory, limit, selectedMonthStr);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowSetModal(false);
    setSelectedCategory(null);
    setLimitInput("");
  };

  const handleDeleteBudget = (categoryId: CategoryId) => {
    Alert.alert(
      "Remove Budget",
      "Remove this budget limit?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await deleteBudget(categoryId, selectedMonthStr);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const openSetModal = (categoryId: CategoryId) => {
    const existing = getBudgetForCategory(categoryId, selectedMonthStr);
    setSelectedCategory(categoryId);
    setLimitInput(existing ? String(existing.monthlyLimit) : "");
    setShowSetModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const statusColor = (status: string) => {
    if (status === "exceeded") return "#ef4444";
    if (status === "critical") return "#f59e0b";
    if (status === "warning") return "#fbbf24";
    return colors.success;
  };

  const statusBg = (status: string) => {
    if (status === "exceeded") return isDark ? "rgba(239,68,68,0.1)" : "#fee2e2";
    if (status === "critical") return isDark ? "rgba(245,158,11,0.1)" : "#fef3c7";
    if (status === "warning") return isDark ? "rgba(251,191,36,0.08)" : "#fefce8";
    return isDark ? "rgba(16,185,129,0.08)" : "#d1fae5";
  };

  const categoriesWithBudget = monthBudgetStatuses.map((s) => s.categoryId);
  const categoriesWithoutBudget = CATEGORIES.filter(
    (c) => !categoriesWithBudget.includes(c.id)
  );

  const prev = getPrevMonth(year, month);
  const prevTotalSpend = getTotalForMonth(prev.year, prev.month);

  const last6 = getLast6Months(now.getFullYear(), now.getMonth() + 1);
  const barMax = Math.max(...last6.map((m) => getTotalForMonth(m.year, m.month)), 1);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const prevMonthNav = () => {
    Haptics.selectionAsync();
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonthNav = () => {
    Haptics.selectionAsync();
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  const topCategory = CATEGORIES.find(
    (c) => totals[c.id] === Math.max(...CATEGORIES.map((x) => totals[x.id] || 0))
  );

  const trackedDaysCount = new Set(expensesThisMonth.map((e) => e.date)).size;
  const avgPerDay = trackedDaysCount > 0 ? totalSpend / trackedDaysCount : 0;
  const daysInSelectedMonth = new Date(year, month, 0).getDate();
  const noSpendDays = Math.max(daysInSelectedMonth - trackedDaysCount, 0);

  const monthChangePct =
    prevTotalSpend > 0 ? ((totalSpend - prevTotalSpend) / prevTotalSpend) * 100 : 0;
  const monthChangeLabel =
    prevTotalSpend <= 0
      ? "No previous data"
      : `${monthChangePct >= 0 ? "+" : ""}${Math.round(monthChangePct)}% vs last month`;

  const byDate: Record<string, number> = {};
  for (const e of expensesThisMonth) byDate[e.date] = (byDate[e.date] || 0) + Number(e.amount || 0);
  const peakDayEntry = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
  const peakDayDate = peakDayEntry?.[0] || null;
  const peakDayAmount = peakDayEntry?.[1] || 0;

  const firstHalfSpend = expensesThisMonth
    .filter((e) => parseInt(e.date.split("-")[2], 10) <= 15)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const secondHalfSpend = totalSpend - firstHalfSpend;

  const paymentModeOrder = ["upi", "card", "cash", "netbanking", "none"] as const;
  const paymentModeTotals: { key: string; label: string; amount: number }[] = paymentModeOrder.map((mode) => {
    const amount = expensesThisMonth
      .filter((e) => (e.paymentMode || "none") === mode)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return { key: mode, label: mode === "netbanking" ? "Bank" : mode.toUpperCase(), amount };
  });

  const sortedCats = [...CATEGORIES]
    .filter((cat) => (totals[cat.id] || 0) > 0)
    .sort((a, b) => (totals[b.id] || 0) - (totals[a.id] || 0));

  const drillCat = drillCategory ? CATEGORIES.find((c) => c.id === drillCategory) : null;
  const drillExpenses = drillCategory
    ? expensesThisMonth.filter((e) => e.categoryId === drillCategory).sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const drillPaymentExpenses = drillPaymentMode
    ? expensesThisMonth
        .filter((e) => (e.paymentMode || "none") === drillPaymentMode)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];

  const downloadMonthlyStatement = async () => {
    if (isGeneratingRef.current) return;
    if (expensesThisMonth.length === 0) {
      Alert.alert("No data", "No expenses found for this month.");
      return;
    }

    isGeneratingRef.current = true;
    setDownloadingStatement(true);
    try {
      const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
      const safeMonth = `${year}-${String(month).padStart(2, "0")}`;
      const fileName = `WhisperLedger-Statement-${safeMonth}.pdf`;

      // Build rows
      const sorted = expensesThisMonth.slice().sort((a, b) => a.date.localeCompare(b.date));
      const rows = sorted.map((e, idx) => {
        const cat = CATEGORIES.find((c) => c.id === e.categoryId)?.label || "Other";
        const note = (e.note || "Expense").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const stripe = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
        return `<tr style="background:${stripe}"><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${idx + 1}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;white-space:nowrap">${e.date}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${note}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0">${cat}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center">${(e.paymentMode || "—").toUpperCase()}</td><td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a">₹${Number(e.amount || 0).toLocaleString("en-IN")}</td></tr>`;
      }).join("");

      const catRows = sortedCats.map((cat, idx) => {
        const pct = totalSpend > 0 ? Math.round(((totals[cat.id] || 0) / totalSpend) * 100) : 0;
        const stripe = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
        return `<tr style="background:${stripe}"><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0">${cat.label}</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">₹${Number(totals[cat.id] || 0).toLocaleString("en-IN")}</td><td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">${pct}%</td></tr>`;
      }).join("");

      const generatedOn = new Date().toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" });
      const avgDay = expensesThisMonth.length > 0 ? Math.round(totalSpend / expensesThisMonth.length) : 0;

      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f1f5f9;color:#0f172a;padding:0}
  .page{max-width:800px;margin:0 auto;background:#fff}
  /* Header Band */
  .header-band{background:#1e3a8a;padding:36px 40px 28px;color:#fff}
  .bank-name{font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.7;margin-bottom:8px}
  .doc-title{font-size:26px;font-weight:700;letter-spacing:-.5px}
  .doc-subtitle{font-size:13px;opacity:.75;margin-top:4px}
  .header-meta{display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.2)}
  .meta-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;opacity:.6;margin-bottom:4px}
  .meta-val{font-size:14px;font-weight:600}
  /* Summary Bar */
  .summary-bar{display:flex;background:#0f172a;padding:0}
  .sum-cell{flex:1;padding:20px 24px;border-right:1px solid rgba(255,255,255,0.08)}
  .sum-cell:last-child{border-right:none}
  .sum-label{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px}
  .sum-val{font-size:20px;font-weight:700;color:#fff}
  .sum-note{font-size:10px;color:#64748b;margin-top:2px}
  /* Sections */
  .section{padding:28px 40px}
  .section-title{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:600;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #e2e8f0}
  /* Tables */
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  thead tr{background:#1e3a8a;color:#fff}
  thead th{padding:10px 12px;text-align:left;font-weight:600;font-size:10px;letter-spacing:.5px;text-transform:uppercase}
  thead th:last-child{text-align:right}
  /* Footer */
  .footer{background:#0f172a;padding:20px 40px;display:flex;justify-content:space-between;align-items:center}
  .footer-brand{color:#fff;font-size:13px;font-weight:700;letter-spacing:1px}
  .footer-note{color:#64748b;font-size:10px;text-align:right}
</style></head><body>
<div class="page">
  <!-- Header -->
  <div class="header-band">
    <div class="bank-name">WhisperLedger</div>
    <div class="doc-title">Monthly Expense Statement</div>
    <div class="doc-subtitle">${monthLabel}</div>
    <div class="header-meta">
      <div><div class="meta-label">Account Holder</div><div class="meta-val">${user?.name || "Valued User"}</div><div style="font-size:11px;opacity:0.7">${user?.email || ""}</div></div>
      <div><div class="meta-label">Statement Period</div><div class="meta-val">${monthLabel}</div></div>
      <div><div class="meta-label">Generated On</div><div class="meta-val">${generatedOn}</div></div>
    </div>
  </div>

  <!-- Summary Bar -->
  <div class="summary-bar">
    <div class="sum-cell">
      <div class="sum-label">Total Spent</div>
      <div class="sum-val">₹${Number(totalSpend || 0).toLocaleString("en-IN")}</div>
      <div class="sum-note">${monthLabel}</div>
    </div>
    <div class="sum-cell">
      <div class="sum-label">Avg per Transaction</div>
      <div class="sum-val">₹${Number(avgDay || 0).toLocaleString("en-IN")}</div>
      <div class="sum-note">across ${expensesThisMonth.length} entries</div>
    </div>
    <div class="sum-cell">
      <div class="sum-label">Top Category</div>
      <div class="sum-val" style="font-size:15px">${sortedCats[0]?.label || "—"}</div>
      <div class="sum-note">₹${Number(totals[sortedCats[0]?.id] || 0).toLocaleString("en-IN")}</div>
    </div>
  </div>

  <!-- Category Breakdown -->
  <div class="section">
    <div class="section-title">Category Breakdown</div>
    <table>
      <thead><tr><th>Category</th><th style="text-align:right">Amount</th><th style="text-align:center">Share</th></tr></thead>
      <tbody>${catRows || "<tr><td colspan='3' style='padding:12px;text-align:center;color:#94a3b8'>No data</td></tr>"}</tbody>
    </table>
  </div>

  <!-- Transaction Details -->
  <div class="section" style="padding-top:0">
    <div class="section-title">Transaction Details</div>
    <table>
      <thead><tr><th>#</th><th>Date</th><th>Description</th><th>Category</th><th style="text-align:center">Mode</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#eff6ff"><td colspan="5" style="padding:10px 12px;font-weight:700;font-size:13px">TOTAL</td><td style="padding:10px 12px;text-align:right;font-weight:700;font-size:14px;color:#1e3a8a">₹${Number(totalSpend || 0).toLocaleString("en-IN")}</td></tr></tfoot>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">WhisperLedger</div>
    <div class="footer-note">whisperledger.support@gmail.com<br/>This is a personal expense summary. Not a bank statement.</div>
  </div>
</div>
</body></html>`;

      if (Platform.OS === "web") {
        const win = window.open("", "_blank");
        if (!win) throw new Error("Popup blocked");
        win.document.write(html);
        win.document.close();
        win.focus();
        win.print();
      } else {
        // Generate PDF file with a 10-second safety timeout
        const printPromise = Print.printToFileAsync({ html, base64: false });
        const timeoutPromise = new Promise<{ uri: string }>((_, reject) => 
          setTimeout(() => reject(new Error("Print process timed out after 10 seconds. Please try again.")), 10000)
        );
        const { uri } = await Promise.race([printPromise, timeoutPromise]);

        // Show action sheet: Save to downloads OR send email from support directly
        Alert.alert(
          "PDF Statement Ready",
          "Choose an option:",
          [
            {
              text: "💾 Save to Downloads",
              onPress: async () => {
                try {
                  const fs = FileSystem as any;
                  if (Platform.OS === "android" && fs && fs.StorageAccessFramework) {
                    const permissions = await fs.StorageAccessFramework.requestDirectoryPermissionsAsync();
                    if (permissions.granted) {
                      const fileUri = await fs.StorageAccessFramework.createFileAsync(
                        permissions.directoryUri,
                        fileName,
                        'application/pdf'
                      );
                      const base64Data = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
                      await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: "base64" });
                      Alert.alert("Saved Successfully", "Your statement has been saved directly to your local storage!");
                    } else {
                      // Fallback
                      await Sharing.shareAsync(uri);
                    }
                  } else {
                    // iOS or Fallback if native module is not built yet
                    await Sharing.shareAsync(uri);
                  }
                } catch (err) {
                  console.warn("Save PDF Error:", err);
                  await Sharing.shareAsync(uri);
                }
              },
            },
            {
              text: "📧 Send Email",
              onPress: async () => {
                try {
                  if (!user || !user.email) {
                    Alert.alert("Error", "You must be logged in to receive emails.");
                    return;
                  }

                  const categoryTotals = sortedCats.map((cat) => ({
                    label: cat.label,
                    amount: totals[cat.id] || 0
                  }));

                  const expenses = expensesThisMonth.map((e) => {
                    const categoryLabel = CATEGORIES.find((c) => c.id === e.categoryId)?.label || "Other";
                    return {
                      date: e.date,
                      note: e.note || "Expense",
                      categoryLabel,
                      paymentMode: e.paymentMode || "none",
                      amount: e.amount
                    };
                  });

                  await addDoc(collection(db, "statement_requests"), {
                    userId: user.uid,
                    userEmail: user.email,
                    userName: user.name || "Valued User",
                    monthLabel,
                    totalSpend,
                    transactionCount: expensesThisMonth.length,
                    categoryTotals,
                    expenses,
                    createdAt: serverTimestamp(),
                    status: "pending"
                  });

                  Alert.alert(
                    "Email Queued",
                    "Your monthly statement has been generated and queued for delivery to your registered email address."
                  );
                } catch (err: any) {
                  console.warn("Queue Email Error:", err);
                  Alert.alert("Failed", "Could not send the email from support: " + err.message);
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      }
    } catch (e) {
      console.warn("Failed to download statement:", e);
      Alert.alert("Failed", "Could not generate the PDF statement.");
    } finally {
      isGeneratingRef.current = false;
      setDownloadingStatement(false);
    }
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 14,
      paddingBottom: 12,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      marginBottom: 10,
    },
    headerTitle: { fontSize: 24, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground },
    monthNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginHorizontal: 16,
      marginTop: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.2 : 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    navBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      alignItems: "center",
      justifyContent: "center",
    },
    monthLabel: {
      fontSize: 15,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    statementCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginHorizontal: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    statementHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 14,
    },
    statementIconBg: {
      width: 38,
      height: 38,
      borderRadius: 10,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.15)" : "rgba(99, 102, 241, 0.08)",
      alignItems: "center",
      justifyContent: "center",
    },
    statementTitle: {
      fontSize: 14,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    statementSubText: {
      fontSize: 11,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    statementMonthPicker: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statementMonthText: {
      fontSize: 12,
      fontWeight: "600",
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    statementDownloadBtn: {
      borderRadius: 12,
      overflow: "hidden",
    },
    statementDownloadGrad: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
      gap: 8,
    },
    statementDownloadText: {
      color: "#fff",
      fontFamily: "Inter_700Bold",
      fontSize: 13,
    },
    statsRow: { flexDirection: "row", marginHorizontal: 16, gap: 10, marginBottom: 10 },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    statLabel: { fontSize: 10.5, color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
    statValue: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 4 },
    statSub: { fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 3 },
    statSubPositive: { fontSize: 11, color: "#16a34a", fontFamily: "Inter_500Medium", marginTop: 3 },
    statSubNegative: { fontSize: 11, color: "#dc2626", fontFamily: "Inter_500Medium", marginTop: 3 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginHorizontal: 16,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    cardTitle: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold", color: colors.foreground, marginBottom: 14 },
    insightRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10, gap: 10 },
    insightBox: { flex: 1, backgroundColor: colors.muted, borderRadius: 12, padding: 12 },
    insightLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_500Medium", letterSpacing: 0.3 },
    insightValue: { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "700", color: colors.foreground, marginTop: 4 },
    payRow: { marginBottom: 12 },
    payTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    payLabel: { fontSize: 12, color: colors.foreground, fontFamily: "Inter_500Medium" },
    payAmt: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    payTrack: { height: 7, borderRadius: 4, backgroundColor: colors.muted, overflow: "hidden" },
    payFill: { height: "100%", borderRadius: 4, backgroundColor: colors.primary },
    trendBars: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110, marginTop: 10 },
    trendBarCol: { flex: 1, alignItems: "center", gap: 6 },
    trendBar: { width: "100%" },
    trendLabel: { fontSize: 10, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    catRow: {
      flexDirection: "row", alignItems: "center", paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    catIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 12 },
    catLabel: { flex: 1, fontSize: 14, fontWeight: "500", fontFamily: "Inter_500Medium", color: colors.foreground },
    catAmt: { fontSize: 14, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground, marginRight: 8 },
    catPct: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", width: 34, textAlign: "right" },
    barBg: { height: 4, borderRadius: 2, backgroundColor: colors.muted, marginTop: 4, marginLeft: 48 },
    scrollContent: { paddingBottom: Platform.OS === "web" ? 34 + 84 : insets.bottom + 84 },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: colors.text === "#f8fafc" ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.04)",
      borderRadius: 12,
      padding: 3,
      marginHorizontal: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    segmentBtnActive: {
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
    segmentBtnTextActive: {
      color: "#fff",
      fontFamily: "Inter_700Bold",
    },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    modalSheet: {
      backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: "80%",
      paddingBottom: insets.bottom + 16,
    },
    modalHandle: {
      width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2,
      alignSelf: "center", marginTop: 12, marginBottom: 4,
    },
    modalHeader: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground },
    modalSubtitle: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    expRow: {
      flexDirection: "row", alignItems: "center",
      paddingHorizontal: 20, paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    expNote: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    expDate: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 2 },
    expAmt: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground },
    emptyBudgetCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 32,
      marginHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.2 : 0.04,
      shadowRadius: 8,
      elevation: 3,
      marginBottom: 20,
    },
    emptyBudgetIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.text === "#f8fafc" ? "rgba(99, 102, 241, 0.15)" : "rgba(99, 102, 241, 0.08)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyBudgetTitle: {
      fontSize: 16,
      fontWeight: "700",
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      textAlign: "center",
    },
    emptyBudgetSubtitle: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      marginTop: 8,
      lineHeight: 18,
      paddingHorizontal: 10,
    },
    allBudgetedCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.02,
      shadowRadius: 6,
      elevation: 2,
    },
    allBudgetedTitle: {
      fontSize: 14,
      fontWeight: "600",
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 8,
    },
    allBudgetedSubtitle: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      marginTop: 4,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerTop}>
          <Text style={s.headerTitle}>Insights</Text>
        </View>
        <View style={s.segmentRow}>
          <TouchableOpacity
            style={[s.segmentBtn, activeSegment === "charts" && s.segmentBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveSegment("charts"); }}
            activeOpacity={0.8}
          >
            <Text style={[s.segmentBtnText, activeSegment === "charts" && s.segmentBtnTextActive]}>
              Charts
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.segmentBtn, activeSegment === "budgets" && s.segmentBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveSegment("budgets"); }}
            activeOpacity={0.8}
          >
            <Text style={[s.segmentBtnText, activeSegment === "budgets" && s.segmentBtnTextActive]}>
              Budgets
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={s.monthNav}>
          <TouchableOpacity style={s.navBtn} onPress={prevMonthNav} activeOpacity={0.7}>
            <Feather name="chevron-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={s.monthLabel}>{MONTH_NAMES[month - 1]} {year}</Text>
          <TouchableOpacity style={s.navBtn} onPress={nextMonthNav} activeOpacity={0.7}>
            <Feather name="chevron-right" size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {activeSegment === "charts" ? (
          <>
            {/* Unified Premium Statement Card */}
            <View style={s.statementCard}>
              <View style={s.statementHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={s.statementIconBg}>
                    <Feather name="file-text" size={18} color={colors.primary} />
                  </View>
                  <View>
                    <Text style={s.statementTitle}>Monthly Report</Text>
                    <Text style={s.statementSubText}>Statements & reports export</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={s.statementMonthPicker}
                  activeOpacity={0.75}
                  onPress={() => setShowStatementMonthPicker(true)}
                >
                  <Text style={s.statementMonthText}>
                    {MONTH_NAMES[month - 1].substring(0, 3)} {year}
                  </Text>
                  <Feather name="chevron-down" size={12} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[s.statementDownloadBtn, downloadingStatement && { opacity: 0.75 }]}
                activeOpacity={0.8}
                disabled={downloadingStatement}
                onPress={downloadMonthlyStatement}
              >
                <LinearGradient
                  colors={["#6366f1", "#7c3aed"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.statementDownloadGrad}
                >
                  <Feather name="download" size={14} color="#fff" />
                  <Text style={s.statementDownloadText}>
                    {downloadingStatement ? "Preparing Statement..." : `Download PDF Statement`}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Dashboard Stats Row 1 */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit>TOTAL SPENT</Text>
                <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>₹{Number(totalSpend || 0).toLocaleString("en-IN")}</Text>
                <Text style={s.statSub} numberOfLines={1}>
                  {expensesThisMonth.length} transaction{expensesThisMonth.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit>AVG / ACTIVE DAY</Text>
                <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>₹{Number(Math.round(avgPerDay) || 0).toLocaleString("en-IN")}</Text>
                <Text style={s.statSub} numberOfLines={1}>{trackedDaysCount} active days</Text>
              </View>
            </View>

            {/* Dashboard Stats Row 2 */}
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit>VS LAST MONTH</Text>
                <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>₹{Number(prevTotalSpend || 0).toLocaleString("en-IN")}</Text>
                <Text
                  style={
                    prevTotalSpend <= 0
                      ? s.statSub
                      : monthChangePct >= 0
                        ? s.statSubNegative
                        : s.statSubPositive
                  }
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {monthChangeLabel}
                </Text>
              </View>
              <View style={s.statCard}>
                <Text style={s.statLabel} numberOfLines={1} adjustsFontSizeToFit>NO-SPEND DAYS</Text>
                <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit>{noSpendDays}</Text>
                <Text style={s.statSub} numberOfLines={1}>Out of {daysInSelectedMonth} days</Text>
              </View>
            </View>

            {totalSpend > 0 && topCategory && (
              <View style={[s.statsRow, { marginBottom: 14 }]}>
                <TouchableOpacity
                  style={[s.statCard, { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }]}
                  activeOpacity={0.75}
                  onPress={() => { Haptics.selectionAsync(); setDrillCategory(topCategory.id); }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.text === "#f8fafc" ? `${topCategory.color}1c` : topCategory.lightColor, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={topCategory.icon as any} size={20} color={topCategory.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.statLabel, { color: colors.mutedForeground }]}>TOP CATEGORY</Text>
                    <Text style={[s.statValue, { fontSize: 16, marginTop: 2 }]} numberOfLines={1}>{topCategory.label}</Text>
                    <Text style={s.statSub} numberOfLines={1}>
                      ₹{Number(totals[topCategory.id] || 0).toLocaleString("en-IN")} · {Math.round(((totals[topCategory.id] || 0) / totalSpend) * 100)}%
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )}

            {/* 6-Month Trend Chart */}
            <View style={s.card}>
              <Text style={s.cardTitle}>6-Month Trend</Text>
              <View style={s.trendBars}>
                {last6.map((m, i) => {
                  const amt = getTotalForMonth(m.year, m.month);
                  const pct = barMax > 0 ? amt / barMax : 0;
                  const isCurrent = m.year === year && m.month === month;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={s.trendBarCol}
                      activeOpacity={0.75}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setYear(m.year);
                        setMonth(m.month);
                      }}
                    >
                      <View style={{ flex: 1, justifyContent: "flex-end", alignItems: "center", width: "100%" }}>
                        {/* Rounded bar track */}
                        <View style={{
                          width: 18,
                          height: "100%",
                          backgroundColor: colors.text === "#f8fafc" ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
                          borderRadius: 9,
                          overflow: "hidden",
                          justifyContent: "flex-end",
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}>
                          {pct > 0 ? (
                            <LinearGradient
                              colors={isCurrent ? ["#6366f1", "#8b5cf6"] : [colors.mutedForeground + "40", colors.mutedForeground + "20"]}
                              style={{
                                height: `${Math.max(pct * 100, 10)}%`,
                                borderRadius: 9,
                              }}
                            />
                          ) : (
                            <View style={{
                              height: 6,
                              backgroundColor: colors.border,
                              borderRadius: 3,
                            }} />
                          )}
                        </View>
                      </View>
                      <Text style={[s.trendLabel, { color: isCurrent ? colors.primary : colors.mutedForeground, marginTop: 4, fontFamily: isCurrent ? "Inter_700Bold" : "Inter_400Regular" }]}>
                        {MONTH_NAMES[m.month - 1].substring(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Spending Insights grid */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Spending Insights</Text>
              <View style={s.insightRow}>
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>PEAK SPEND DAY</Text>
                  <Text style={s.insightValue} numberOfLines={1} adjustsFontSizeToFit>
                    {peakDayDate ? `₹${peakDayAmount.toLocaleString("en-IN")}` : "₹0"}
                  </Text>
                  <Text style={s.statSub} numberOfLines={1}>{peakDayDate ? formatDate(peakDayDate) : "No spend entries"}</Text>
                </View>
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>TXN / ACTIVE DAY</Text>
                  <Text style={s.insightValue} numberOfLines={1} adjustsFontSizeToFit>
                    {trackedDaysCount > 0 ? (expensesThisMonth.length / trackedDaysCount).toFixed(1) : "0.0"}
                  </Text>
                  <Text style={s.statSub} numberOfLines={1}>Txn density score</Text>
                </View>
              </View>
              <View style={s.insightRow}>
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>1ST HALF MONTH</Text>
                  <Text style={s.insightValue} numberOfLines={1} adjustsFontSizeToFit>₹{Math.round(firstHalfSpend).toLocaleString("en-IN")}</Text>
                  <Text style={s.statSub}>Days 1 - 15</Text>
                </View>
                <View style={s.insightBox}>
                  <Text style={s.insightLabel}>2ND HALF MONTH</Text>
                  <Text style={s.insightValue} numberOfLines={1} adjustsFontSizeToFit>₹{Math.round(secondHalfSpend).toLocaleString("en-IN")}</Text>
                  <Text style={s.statSub}>Days 16 - End</Text>
                </View>
              </View>
            </View>

            {/* Payment Mode split */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Payment Mode Split</Text>
              {paymentModeTotals.filter((p) => p.amount > 0).length === 0 && (
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 }}>
                  No payment data found this month
                </Text>
              )}
              {paymentModeTotals.filter((p) => p.amount > 0).map((p) => {
                const pct = totalSpend > 0 ? (p.amount / totalSpend) * 100 : 0;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={s.payRow}
                    activeOpacity={0.75}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDrillPaymentMode(p.key);
                    }}
                  >
                    <View style={s.payTop}>
                      <Text style={s.payLabel}>{p.label}</Text>
                      <Text style={s.payAmt}>₹{Math.round(p.amount).toLocaleString("en-IN")} ({Math.round(pct)}%)</Text>
                    </View>
                    <View style={s.payTrack}>
                      <View style={[s.payFill, { width: `${pct}%` }]} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Category breakdown */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Category Breakdown</Text>
              {sortedCats.length === 0 && (
                <Text style={{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 20 }}>
                  No expenses this month
                </Text>
              )}
              {sortedCats.map((cat, idx) => {
                const amt = totals[cat.id] || 0;
                const pct = totalSpend > 0 ? amt / totalSpend : 0;
                const isLast = idx === sortedCats.length - 1;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.7}
                    onPress={() => { Haptics.selectionAsync(); setDrillCategory(cat.id); }}
                    style={[s.catRow, isLast && { borderBottomWidth: 0 }]}
                  >
                    <View style={[s.catIcon, { backgroundColor: colors.text === "#f8fafc" ? `${cat.color}1c` : cat.lightColor }]}>
                      <Feather name={cat.icon as any} size={18} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Text style={s.catLabel}>{cat.label}</Text>
                        <Text style={s.catAmt}>₹{Number(amt || 0).toLocaleString("en-IN")}</Text>
                        <Text style={s.catPct}>{Math.round(pct * 100)}%</Text>
                      </View>
                      <View style={[s.barBg, { marginLeft: 0, marginTop: 6 }]}>
                        <View style={{ height: 4, width: `${pct * 100}%`, backgroundColor: cat.color, borderRadius: 2 }} />
                      </View>
                    </View>
                    <Feather name="chevron-right" size={14} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            {/* Budgets Summary Strip */}
            {monthBudgetStatuses.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  marginHorizontal: 16,
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {[
                  {
                    label: "Active Budgets",
                    value: String(monthBudgetStatuses.length),
                    icon: "target",
                  },
                  {
                    label: "On Track",
                    value: String(monthBudgetStatuses.filter((s) => s.status === "safe").length),
                    icon: "check-circle",
                    good: true,
                  },
                  {
                    label: "Exceeded",
                    value: String(monthBudgetStatuses.filter((s) => s.status === "exceeded").length),
                    icon: "alert-circle",
                    bad: true,
                  },
                ].map((item) => (
                  <View
                    key={item.label}
                    style={{
                      flex: 1,
                      backgroundColor: colors.card,
                      borderRadius: 14,
                      padding: 12,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: colors.border,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.04,
                      shadowRadius: 6,
                      elevation: 2,
                    }}
                  >
                    <Feather
                      name={item.icon as any}
                      size={16}
                      color={
                        item.good
                          ? colors.success
                          : item.bad
                          ? colors.destructive
                          : colors.primary
                      }
                    />
                    <Text
                      style={{
                        fontSize: 18,
                        fontFamily: "Inter_700Bold",
                        color: colors.foreground,
                        marginTop: 4,
                      }}
                    >
                      {item.value}
                    </Text>
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Inter_400Regular",
                        color: colors.mutedForeground,
                        textAlign: "center",
                      }}
                    >
                      {item.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Empty State when no budgets exist */}
            {monthBudgetStatuses.length === 0 && (
              <View style={s.emptyBudgetCard}>
                <View style={s.emptyBudgetIcon}>
                  <Feather name="target" size={30} color={colors.primary} />
                </View>
                <Text style={s.emptyBudgetTitle}>No active budgets</Text>
                <Text style={s.emptyBudgetSubtitle}>
                  Set monthly spending limits for categories to stay on track and prevent overspending.
                </Text>
              </View>
            )}

            {/* Active Budget Cards list */}
            {monthBudgetStatuses.length > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    fontFamily: "Inter_600SemiBold",
                    color: colors.mutedForeground,
                    letterSpacing: 0.8,
                    marginBottom: 10,
                  }}
                >
                  ACTIVE BUDGETS
                </Text>

                {monthBudgetStatuses
                  .sort((a, b) => b.percentage - a.percentage)
                  .map((status) => {
                    const cat = CATEGORIES.find((c) => c.id === status.categoryId)!;
                    const sc = statusColor(status.status);
                    const sbg = statusBg(status.status);

                    return (
                      <View
                        key={status.id}
                        style={{
                          backgroundColor: colors.card,
                          borderRadius: 16,
                          padding: 16,
                          marginBottom: 12,
                          borderWidth: 1,
                          borderColor: status.status !== "safe" ? sc + "50" : colors.border,
                          shadowColor: "#000",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: colors.text === "#f8fafc" ? 0.15 : 0.02,
                          shadowRadius: 6,
                          elevation: 2,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            marginBottom: 12,
                          }}
                        >
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 12,
                              backgroundColor: cat.color + "20",
                              alignItems: "center",
                              justifyContent: "center",
                              marginRight: 12,
                            }}
                          >
                            <Feather name={cat.icon as any} size={18} color={cat.color} />
                          </View>

                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 15,
                                fontFamily: "Inter_600SemiBold",
                                color: colors.foreground,
                              }}
                            >
                              {cat.label}
                            </Text>
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 6,
                                marginTop: 2,
                              }}
                            >
                              <View
                                style={{
                                  paddingHorizontal: 7,
                                  paddingVertical: 2,
                                  borderRadius: 6,
                                  backgroundColor: sbg,
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontFamily: "Inter_600SemiBold",
                                    color: sc,
                                  }}
                                >
                                  {status.status === "exceeded"
                                    ? "Exceeded"
                                    : status.status === "critical"
                                    ? "Critical"
                                    : status.status === "warning"
                                    ? "Warning"
                                    : "On Track"}
                                </Text>
                              </View>
                              <Text
                                style={{
                                  fontSize: 11,
                                  color: colors.mutedForeground,
                                  fontFamily: "Inter_400Regular",
                                }}
                              >
                                {Math.round(status.percentage)}% used
                              </Text>
                            </View>
                          </View>

                          <View style={{ alignItems: "flex-end", flexDirection: "row", gap: 8 }}>
                            <TouchableOpacity
                              onPress={() => openSetModal(status.categoryId)}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                backgroundColor: colors.text === "#f8fafc" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.03)",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Feather name="edit-2" size={13} color={colors.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleDeleteBudget(status.categoryId)}
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 8,
                                backgroundColor: colors.text === "#f8fafc" ? "rgba(239,68,68,0.1)" : "#fee2e2",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <Feather name="trash-2" size={13} color="#ef4444" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Progress Bar */}
                        <View
                          style={{
                            height: 8,
                            backgroundColor: colors.muted,
                            borderRadius: 4,
                            overflow: "hidden",
                            marginBottom: 8,
                          }}
                        >
                          <View
                            style={{
                              height: "100%",
                              width: `${Math.min(100, status.percentage)}%`,
                              backgroundColor: sc,
                              borderRadius: 4,
                            }}
                          />
                        </View>

                        {/* Amount row */}
                        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontFamily: "Inter_500Medium",
                              color: colors.foreground,
                            }}
                          >
                            ₹{status.spent.toLocaleString("en-IN")} spent
                          </Text>
                          <Text
                            style={{
                              fontSize: 13,
                              fontFamily: "Inter_400Regular",
                              color: colors.mutedForeground,
                            }}
                          >
                            of ₹{status.monthlyLimit.toLocaleString("en-IN")}
                          </Text>
                        </View>

                        {/* Inline ProjectionText render logic */}
                        {(() => {
                          if (status.percentage < 50) return null;
                          const now = new Date();
                          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                          const dayOfMonth = now.getDate();
                          const dailyRate = status.spent / dayOfMonth;
                          const projectedTotal = dailyRate * daysInMonth;
                          const overshoot = projectedTotal - status.monthlyLimit;

                          if (overshoot <= 0) return null;

                          return (
                            <Text style={{ fontSize: 11, color: colors.warning, fontFamily: "Inter_500Medium", marginTop: 6 }}>
                              📈 At this rate, you'll overspend by ₹{Math.round(overshoot).toLocaleString("en-IN")}
                            </Text>
                          );
                        })()}
                      </View>
                    );
                  })}
              </View>
            )}

            {/* Add Budget */}
            <View style={{ marginHorizontal: 16, marginBottom: 24 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  fontFamily: "Inter_600SemiBold",
                  color: colors.mutedForeground,
                  letterSpacing: 0.8,
                  marginBottom: 10,
                }}
              >
                {monthBudgetStatuses.length > 0 ? "ADD MORE BUDGETS" : "SET YOUR FIRST BUDGET"}
              </Text>

              {categoriesWithoutBudget.length > 0 ? (
                <View
                  style={{
                    backgroundColor: colors.card,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: colors.border,
                    overflow: "hidden",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: colors.text === "#f8fafc" ? 0.1 : 0.01,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  {categoriesWithoutBudget.map((cat, index) => (
                    <React.Fragment key={cat.id}>
                      {index > 0 && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: colors.border,
                            marginHorizontal: 16,
                          }}
                        />
                      )}
                      <TouchableOpacity
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                          gap: 12,
                        }}
                        onPress={() => openSetModal(cat.id)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 10,
                            backgroundColor: cat.color + "18",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Feather name={cat.icon as any} size={16} color={cat.color} />
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            fontFamily: "Inter_500Medium",
                            color: colors.foreground,
                          }}
                        >
                          {cat.label}
                        </Text>
                        <Feather name="plus-circle" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              ) : (
                <View style={s.allBudgetedCard}>
                  <View style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: colors.text === "#f8fafc" ? "rgba(16, 185, 129, 0.15)" : "rgba(16, 185, 129, 0.08)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Feather name="check" size={20} color={colors.success} />
                  </View>
                  <Text style={s.allBudgetedTitle}>All Categories Budgeted</Text>
                  <Text style={s.allBudgetedSubtitle}>
                    You have set budget limits for all categories this month!
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Set Budget Modal */}
      <Modal
        visible={showSetModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSetModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowSetModal(false)}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} />
          </TouchableOpacity>
          <View
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Platform.OS === "ios" ? insets.bottom + 24 : 24,
            }}
          >
            {selectedCategory && (() => {
              const cat = CATEGORIES.find((c) => c.id === selectedCategory)!;
              return (
                <>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <View
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: 13,
                        backgroundColor: cat.color + "20",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name={cat.icon as any} size={20} color={cat.color} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground }}>
                        {cat.label} Budget
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                        Set monthly limit for {MONTH_NAMES[month - 1]} {year}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 8 }}>
                    Monthly Limit (₹)
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: colors.input,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      marginBottom: 20,
                    }}
                  >
                    <Text style={{ fontSize: 18, color: colors.primary, fontFamily: "Inter_600SemiBold", marginRight: 8 }}>₹</Text>
                    <TextInput
                      value={limitInput}
                      onChangeText={setLimitInput}
                      keyboardType="numeric"
                      autoFocus
                      placeholder="5000"
                      placeholderTextColor={colors.mutedForeground}
                      style={{
                        flex: 1,
                        fontSize: 20,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.foreground,
                        paddingVertical: 14,
                      }}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSetBudget}
                    activeOpacity={0.85}
                    style={{ borderRadius: 14, overflow: "hidden" }}
                  >
                    <LinearGradient
                      colors={["#6366f1", "#7c3aed"]}
                      style={{
                        paddingVertical: 16,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" }}>
                        Set Budget
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showStatementMonthPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowStatementMonthPicker(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowStatementMonthPicker(false)}>
          <Pressable style={[s.modalSheet, { maxHeight: "72%" }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>Select Statement Month</Text>
                <Text style={s.modalSubtitle}>You can download for any month immediately</Text>
              </View>
              <TouchableOpacity onPress={() => setShowStatementMonthPicker(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={last6.slice().reverse()}
              keyExtractor={(item) => `${item.year}-${item.month}`}
              renderItem={({ item }) => {
                const selected = item.year === year && item.month === month;
                return (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setYear(item.year);
                      setMonth(item.month);
                      setShowStatementMonthPicker(false);
                    }}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 14,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 15 }}>
                      {MONTH_NAMES[item.month - 1]} {item.year}
                    </Text>
                    {selected && <Feather name="check" size={16} color={colors.primary} />}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!drillCategory}
        animationType="slide"
        transparent
        onRequestClose={() => setDrillCategory(null)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setDrillCategory(null)}>
          <Pressable style={[s.modalSheet, { flexShrink: 1 }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                {drillCat && (
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.text === "#f8fafc" ? `${drillCat.color}1c` : drillCat.lightColor, alignItems: "center", justifyContent: "center" }}>
                    <Feather name={drillCat.icon as any} size={18} color={drillCat.color} />
                  </View>
                )}
                <View>
                  <Text style={s.modalTitle}>{drillCat?.label}</Text>
                  <Text style={s.modalSubtitle}>
                    ₹{(totals[drillCategory!] || 0).toLocaleString("en-IN")} · {drillExpenses.length} transactions
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDrillCategory(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              style={{ flexShrink: 1 }}
              data={drillExpenses}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={true}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 32, fontFamily: "Inter_400Regular" }}>No expenses</Text>
              }
              renderItem={({ item: exp }) => (
                <View style={s.expRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.expNote}>{exp.note || drillCat?.label}</Text>
                    <Text style={s.expDate}>{formatDate(exp.date)}</Text>
                  </View>
                  <Text style={[s.expAmt, { color: drillCat?.color }]}>
                    ₹{Number(exp.amount || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!drillPaymentMode}
        animationType="slide"
        transparent
        onRequestClose={() => setDrillPaymentMode(null)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setDrillPaymentMode(null)}>
          <Pressable style={[s.modalSheet, { flexShrink: 1 }]} onPress={(e) => e.stopPropagation()}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <View>
                <Text style={s.modalTitle}>
                  {(drillPaymentMode || "").toUpperCase() === "NETBANKING"
                    ? "Bank"
                    : (drillPaymentMode || "NONE").toUpperCase()}
                </Text>
                <Text style={s.modalSubtitle}>
                  ₹{paymentModeTotals.find((x) => x.key === drillPaymentMode)?.amount.toLocaleString("en-IN") || "0"} · {drillPaymentExpenses.length} transactions
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDrillPaymentMode(null)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              style={{ flexShrink: 1 }}
              data={drillPaymentExpenses}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={true}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              ListEmptyComponent={
                <Text style={{ color: colors.mutedForeground, textAlign: "center", padding: 32, fontFamily: "Inter_400Regular" }}>No expenses</Text>
              }
              renderItem={({ item: exp }) => (
                <View style={s.expRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.expNote}>{exp.note || "Expense"}</Text>
                    <Text style={s.expDate}>{formatDate(exp.date)}</Text>
                  </View>
                  <Text style={s.expAmt}>
                    ₹{Number(exp.amount || 0).toLocaleString("en-IN")}
                  </Text>
                </View>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
