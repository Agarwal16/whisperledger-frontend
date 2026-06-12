import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { 
  Alert, 
  ScrollView, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View, 
  Modal, 
  TextInput, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform 
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { db } from "@/lib/firebase";

const FAQS = [
  {
    q: "How does the SMS Auto-Sync work?",
    a: "When you enable Auto-Sync, WhisperLedger reads your incoming transactional SMS messages (like those from your bank or UPI apps) and automatically converts them into expenses. It works entirely in the background, so you never miss a payment."
  },
  {
    q: "Is my financial data private?",
    a: "Absolutely. All SMS parsing and data storage happens strictly on your device. We do not send your financial data, messages, or habits to any server. Your privacy is guaranteed."
  },
  {
    q: "Can I edit or delete auto-synced expenses?",
    a: "Yes! If an expense is categorized incorrectly, you can easily edit it in your History. If you delete an auto-synced expense, WhisperLedger will remember not to sync that specific transaction again."
  },
  {
    q: "Why does it ask for SMS permissions?",
    a: "Android requires explicit permission for any app to read your SMS messages. We only look for transaction-related keywords to automate your ledger."
  },
  {
    q: "Can I track expenses manually?",
    a: "Of course! You can always add expenses manually by tapping the + button on the Home or Today tabs, just like a traditional expense tracker."
  }
];

function AccordionItem({ item, isExpanded, onPress }: { item: typeof FAQS[0], isExpanded: boolean, onPress: () => void }) {
  const colors = useColors();
  
  return (
    <View style={[styles.accordionItem, { borderBottomColor: colors.border }]}>
      <TouchableOpacity 
        style={styles.accordionHeader} 
        onPress={onPress}
        activeOpacity={0.7}
      >
        <Text style={[styles.question, { color: colors.foreground }]}>{item.q}</Text>
        <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
      </TouchableOpacity>
      {isExpanded && (
        <View style={styles.accordionBody}>
          <Text style={[styles.answer, { color: colors.mutedForeground }]}>{item.a}</Text>
        </View>
      )}
    </View>
  );
}

export default function FAQScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmitSupport = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Required Fields", "Please enter both a subject and details for your ticket.");
      return;
    }

    if (!user) {
      Alert.alert("Authentication Required", "Please log in to submit a support ticket.");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "support_cases"), {
        userId: user.uid,
        userEmail: user.email || "",
        userName: user.name || "Valued User",
        subject: subject.trim(),
        message: message.trim(),
        status: "received",
        createdAt: serverTimestamp(),
      });

      setModalVisible(false);
      setSubject("");
      setMessage("");
      
      Alert.alert(
        "Ticket Submitted Successfully",
        "We have received your support request. Our team will review it and reply directly to your registered email address shortly."
      );
    } catch (e: any) {
      console.warn("Support case submission failed:", e);
      Alert.alert("Submission Error", "Could not submit support ticket: " + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Help & FAQ</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.faqList}>
          {FAQS.map((faq, index) => (
            <AccordionItem 
              key={index} 
              item={faq} 
              isExpanded={expandedIndex === index}
              onPress={() => setExpandedIndex(expandedIndex === index ? null : index)}
            />
          ))}
        </View>

        <View style={[styles.supportBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Feather name="life-buoy" size={24} color={colors.primary} style={{ marginBottom: 12 }} />
          <Text style={[styles.supportTitle, { color: colors.foreground }]}>Still need help?</Text>
          <Text style={[styles.supportDesc, { color: colors.mutedForeground }]}>
            If you have an issue or a feature request, feel free to reach out to me directly.
          </Text>
          <TouchableOpacity 
            style={[styles.emailBtn, { backgroundColor: colors.primary }]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.8}
          >
            <Feather name="message-square" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.emailBtnText}>Write Support Message</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Support Composer Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Support Ticket</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Feather name="x" size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
              <Text style={[styles.inputLabel, { color: colors.foreground }]}>Subject</Text>
              <TextInput
                style={[styles.textInput, { 
                  color: colors.foreground, 
                  borderColor: colors.border,
                  backgroundColor: colors.muted 
                }]}
                placeholder="Brief summary of the issue..."
                placeholderTextColor={colors.mutedForeground}
                value={subject}
                onChangeText={setSubject}
                editable={!sending}
              />

              <Text style={[styles.inputLabel, { color: colors.foreground, marginTop: 16 }]}>Message Details</Text>
              <TextInput
                style={[styles.textInput, styles.textArea, { 
                  color: colors.foreground, 
                  borderColor: colors.border,
                  backgroundColor: colors.muted 
                }]}
                placeholder="Please describe your issue or feedback in detail..."
                placeholderTextColor={colors.mutedForeground}
                value={message}
                onChangeText={setMessage}
                multiline={true}
                numberOfLines={6}
                textAlignVertical="top"
                editable={!sending}
              />

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                onPress={handleSubmitSupport}
                disabled={sending}
                activeOpacity={0.8}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="send" size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.submitBtnText}>Submit Ticket</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  closeBtn: {
    padding: 4,
    marginLeft: -4,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  faqList: {
    marginBottom: 32,
  },
  accordionItem: {
    borderBottomWidth: 1,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  question: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    paddingRight: 16,
    lineHeight: 22,
  },
  accordionBody: {
    paddingBottom: 16,
    paddingRight: 24,
  },
  answer: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  supportBox: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    marginTop: 16,
  },
  supportTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  supportDesc: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emailBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emailBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 450,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 19,
    fontFamily: "Inter_600SemiBold",
  },
  inputLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
    alignSelf: "flex-start",
  },
  textInput: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  textArea: {
    height: 120,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
