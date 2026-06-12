import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const WEEK_DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

interface Props {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  getTotalForDate: (date: string) => number;
}

export default function MiniCalendar({ selectedDate, onSelectDate, getTotalForDate }: Props) {
  const colors = useColors();
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay = today.getDate();
  
  // Use selectedDate to initialize, but allow navigating months independently
  const initDate = new Date(selectedDate);
  if (isNaN(initDate.getTime())) initDate.setTime(Date.now());
  
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth()); // 0-11

  const prevMonth = () => {
    Haptics.selectionAsync();
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };

  const nextMonth = () => {
    if (year > todayYear || (year === todayYear && month >= todayMonth)) return;
    Haptics.selectionAsync();
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const styles = StyleSheet.create({
    container: {
      borderRadius: 16,
      padding: 12,
      marginBottom: 22,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
    },
    navBtn: {
      padding: 6,
    },
    monthText: {
      fontFamily: "Inter_600SemiBold",
      fontWeight: "600" as const,
      fontSize: 15,
    },
    weekRow: {
      flexDirection: "row",
      marginBottom: 8,
    },
    weekdayText: {
      flex: 1,
      textAlign: "center",
      fontFamily: "Inter_500Medium",
      fontSize: 12,
    },
    daysGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    dayCell: {
      width: "14.28%", // 100/7
      aspectRatio: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dayText: {
      fontFamily: "Inter_400Regular",
      fontSize: 14,
    },
    spendText: {
      fontSize: 9,
      fontFamily: "Inter_600SemiBold",
      marginTop: 2,
      textAlign: "center",
    },
    emptySpace: {
      height: 12,
      marginTop: 2,
    },
    dayDisabled: {
      opacity: 0.45,
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Feather name="chevron-left" size={18} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.monthText, { color: colors.foreground }]}>
          {MONTH_NAMES[month]} {year}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Feather name="chevron-right" size={18} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Weekdays */}
      <View style={styles.weekRow}>
        {WEEK_DAYS.map(d => (
          <Text key={d} style={[styles.weekdayText, { color: colors.mutedForeground }]}>{d}</Text>
        ))}
      </View>

      {/* Days Grid */}
      <View style={styles.daysGrid}>
        {days.map((d, i) => {
          if (d === null) return <View key={`empty-${i}`} style={styles.dayCell} />;
          
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isSelected = iso === selectedDate;
          const isFutureDate =
            year > todayYear ||
            (year === todayYear && month > todayMonth) ||
            (year === todayYear && month === todayMonth && d > todayDay);
          const spendAmount = getTotalForDate(iso);
          const hasSpend = spendAmount > 0;
          
          let formattedSpend = "";
          if (hasSpend) {
            formattedSpend = spendAmount >= 1000 
              ? `₹${(spendAmount / 1000).toFixed(1).replace(/\.0$/, "")}k` 
              : `₹${spendAmount}`;
          }

          return (
            <TouchableOpacity 
              key={d} 
              style={[
                styles.dayCell, 
                isFutureDate && styles.dayDisabled,
                isSelected && { backgroundColor: colors.primary, borderRadius: 12 }
              ]}
              disabled={isFutureDate}
              onPress={() => { onSelectDate(iso); Haptics.selectionAsync(); }}
            >
              <Text style={[
                styles.dayText, 
                { color: isSelected ? "#fff" : colors.foreground },
                isSelected && { fontFamily: "Inter_700Bold", fontWeight: "700" as const }
              ]}>
                {d}
              </Text>
              {hasSpend ? (
                <Text 
                  style={[
                    styles.spendText,
                    { color: isSelected ? "rgba(255,255,255,0.9)" : colors.primary }
                  ]}
                  numberOfLines={1} 
                  adjustsFontSizeToFit
                >
                  {formattedSpend}
                </Text>
              ) : (
                <View style={styles.emptySpace} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
