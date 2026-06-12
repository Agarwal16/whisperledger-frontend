import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { CATEGORIES, CategoryId } from "@/context/ExpenseContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  totals: Record<CategoryId, number>;
  totalSpend: number;
}

export default function CategoryBreakdownBar({ totals, totalSpend }: Props) {
  const colors = useColors();

  const sorted = CATEGORIES.map((c) => ({
    ...c,
    total: totals[c.id] || 0,
  }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  if (sorted.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 32 }}>
        <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
        <Text
          style={{
            color: colors.mutedForeground,
            marginTop: 8,
            fontFamily: "Inter_400Regular",
            fontSize: 14,
          }}
        >
          No expenses this month
        </Text>
      </View>
    );
  }

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 14,
      gap: 10,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      fontWeight: "500" as const,
      color: colors.foreground,
      width: 90,
    },
    barTrack: {
      flex: 1,
      height: 8,
      backgroundColor: colors.muted,
      borderRadius: 4,
      overflow: "hidden",
    },
    barFill: {
      height: "100%",
      borderRadius: 4,
    },
    amount: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
      minWidth: 72,
      textAlign: "right",
    },
  });

  return (
    <View>
      {sorted.map((c) => {
        const pct = totalSpend > 0 ? c.total / totalSpend : 0;
        return (
          <View key={c.id} style={styles.row}>
            <View style={[styles.iconWrap, { backgroundColor: colors.text === "#f8fafc" ? `${c.color}1c` : c.lightColor }]}>
              <Feather name={c.icon as any} size={16} color={c.color} />
            </View>
            <Text style={styles.label} numberOfLines={1}>{c.label}</Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.round(pct * 100)}%`, backgroundColor: c.color },
                ]}
              />
            </View>
            <Text style={[styles.amount, { color: c.color }]}>
              ₹{Number(c.total || 0).toLocaleString("en-IN")}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
