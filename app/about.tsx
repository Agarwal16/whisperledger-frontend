import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";

import { useColors } from "@/hooks/useColors";

export default function AboutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={colors.text === "#f8fafc" ? ["#0B0D18", "#080A10"] : ["#4f46e5", "#7c3aed"]}
        style={[styles.header, { paddingTop: insets.top + 16, paddingBottom: 24 }]}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>About WhisperLedger</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Story Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Hi, I'm Tanmay 👋</Text>
          
          <Text style={[styles.paragraph, { color: colors.foreground }]}>
            Before building this app, I struggled with keeping track of my daily expenses. I was forced to use a basic notes app, manually typing out every single date, and then writing down my spends, adding the amounts, and figuring out the categories entirely on my own.
          </Text>
          
          <Text style={[styles.paragraph, { color: colors.foreground }]}>
            This constant unstructured manual typing was incredibly tedious. I wanted a dedicated app where I could easily log expenses with just a few taps, assign them to proper categories, and instantly see a breakdown of my spending habits.
          </Text>
        </View>

        {/* Vision Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.primary }]}>Our Vision</Text>
          <Text style={[styles.paragraph, { color: colors.foreground }]}>
            That's why I created <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>WhisperLedger</Text>. Its core purpose is to provide a clean, beautiful interface for you to log and categorize your daily expenses effortlessly, replacing the mess of a standard notes app.
          </Text>
        </View>

        {/* Feature Callout Card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <View style={[styles.iconBg, { backgroundColor: colors.text === "#f8fafc" ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)" }]}>
              <Feather name="zap" size={16} color={colors.primary} />
            </View>
            <Text style={[styles.cardHeaderTitle, { color: colors.foreground }]}>Bonus Feature</Text>
          </View>
          <Text style={[styles.paragraph, { color: colors.mutedForeground, fontSize: 14 }]}>
            As an added bonus feature, WhisperLedger also includes an optional SMS Auto-Sync. If enabled, it securely reads the transactional "whispers" from your incoming bank SMS messages and logs them automatically.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Made with ❤️ by Tanmay Agarwal
          </Text>
          <Text style={[styles.footerText, { color: colors.mutedForeground, marginTop: 4 }]}>
            Version 1.0.0
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  closeBtn: {
    padding: 4,
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 12,
  },
  cardHeaderTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paragraph: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    marginBottom: 12,
  },
  footer: {
    marginTop: 20,
    alignItems: "center",
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
