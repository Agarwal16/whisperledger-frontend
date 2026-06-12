import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";

import { CATEGORIES, CategoryId, useExpenses, PaymentMode } from "@/context/ExpenseContext";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { safeHaptics } from "@/utils/haptics";
import * as Haptics from "expo-haptics";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ─── Markdown renderer ───────────────────────────────────────────────────────
function renderMarkdown(text: string, baseStyle: any, boldColor?: string) {
  const parts: { text: string; bold: boolean; italic: boolean }[] = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex)
      parts.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true, italic: false });
    else if (match[2] !== undefined) parts.push({ text: match[2], bold: false, italic: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length)
    parts.push({ text: text.slice(lastIndex), bold: false, italic: false });
  return (
    <Text style={baseStyle}>
      {parts.map((p, i) => (
        <Text
          key={i}
          style={[
            baseStyle,
            p.bold && { fontWeight: "700", color: boldColor || baseStyle.color },
            p.italic && { fontStyle: "italic" },
          ]}
        >
          {p.text}
        </Text>
      ))}
    </Text>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  timestamp: Date;
  customCard?: {
    type: "expense_success" | "budget_analysis" | "support_success" | "help_guide";
    title: string;
    body: string;
    metadata?: any;
  };
}

interface ParsedExpense {
  amount: number;
  categoryId: CategoryId;
  note: string;
  date: string;
  paymentMode?: PaymentMode;
}

interface ConvState {
  step: "idle" | "awaiting_category" | "awaiting_support_desc" | "awaiting_confirmation" | "awaiting_bulk_confirmation";
  amount?: number;
  categoryId?: CategoryId;
  note?: string;
  date?: string;
  bulkExpenses?: ParsedExpense[];
}

// ─── Category keywords ────────────────────────────────────────────────────────
const CATEGORY_KEYWORDS: Record<CategoryId, string[]> = {
  travel: ["travel","taxi","cab","uber","ola","flight","train","bus","ticket","fuel","petrol","diesel","auto","metro"],
  groceries: ["grocery","groceries","supermarket","milk","egg","veg","vegetable","fruit","reliance","blinkit","zepto","instamart","bazaar","mart"],
  rent: ["rent","lease","landlord","flat","room","pg"],
  food_outside: ["food","restaurant","swiggy","zomato","cafe","coffee","starbucks","tea","lunch","dinner","breakfast","pizza","burger","biryani","dhaba"],
  transfer: ["transfer","send","sent","wire","gpay","phonepe","paytm"],
  utilities: ["utility","utilities","electricity","water","gas","internet","wifi","broadband","power"],
  shopping: ["shopping","clothes","dress","shoe","shoes","amazon","flipkart","myntra","zara","h&m"],
  health: ["health","doctor","medicine","hospital","pharmacy","medical","clinic","checkup"],
  entertainment: ["movie","film","cinema","theatre","show","concert","game","gaming","party","clubbing"],
  invest: ["invest","investment","stock","mutual fund","sip","crypto","shares","equity"],
  education: ["education","school","college","fees","book","books","course","tuition"],
  bills: ["bill","recharge","mobile","dth","broadband","payment"],
  subscriptions: ["netflix","spotify","youtube","premium","subscription","prime","hotstar"],
  personal_care: ["personal care","scissors","salon","spa","haircut","makeup","parlour"],
  gifts: ["gift","gifts","present","birthday","anniversary","wedding"],
  family: ["family","home","parents","wife","child","children","kid","kids"],
  fuel: ["fuel","truck","petrol","diesel","gasoline"],
  pets: ["pet","pets","dog","cat","vet","pedigree"],
  other: ["other","misc","miscellaneous","cash"],
};

// ─── Note extraction ──────────────────────────────────────────────────────────
// Only keep meaningful descriptive words, strip all action/amount words
function extractNote(text: string, amount: number): string {
  const stopWords = new Set([
    "i","me","my","the","a","an","and","or","but","in","on","at","to","for",
    "of","with","by","from","up","about","into","then","that","this","is","are",
    "was","were","have","has","had","do","did","will","would","can","could",
    "should","may","might","shall","spent","add","log","pay","paid","cost",
    "worth","rupees","rs","inr","on","for","today","yesterday","now","just",
    "please","pls","kindly","note","description","under","category","some",
    "amount","money","bucks","paisa",
  ]);

  return text
    .replace(new RegExp(`\\b${amount}\\b`, "g"), "")
    .replace(/[₹\d,]+(\.\d{1,2})?/g, "")
    .replace(/\b(spent|add|log|pay|paid|cost|worth|rupees|rs\.?|inr|₹|on|for|today|yesterday|please|pls|kindly|note|description|under|category)\b/gi, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 4) // max 4 meaningful words
    .join(" ")
    .trim();
}

// ─── Helper utilities for date and transaction parsing ────────────────────────
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTransactionLine(line: string, fallbackDate?: string): (ParsedExpense & { dateExplicitlyMatched: boolean }) | null {
  const lower = line.toLowerCase().trim();
  if (!lower) return null;

  // 1. Parse Amount
  const amountRegex = /(?:spent|add|log|pay|paid|cost|worth|rupees|rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)|([,\d]+(?:\.\d{1,2})?)\s*(?:rupees|rs\.?|inr|₹|spent|on)/i;
  const amountMatch = line.match(amountRegex) || line.match(/\b(\d+(?:\.\d{1,2})?)\b/);
  if (!amountMatch) return null;

  const rawAmt = amountMatch[1] || amountMatch[2] || amountMatch[0];
  const amount = parseFloat(rawAmt.replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) return null;

  // 2. Parse Date
  let date = fallbackDate || todayISO();
  let matchedDateText = "";
  let dateExplicitlyMatched = false;

  if (/\b(today)\b/i.test(line)) {
    date = todayISO();
    matchedDateText = "today";
    dateExplicitlyMatched = true;
  } else if (/\b(yesterday)\b/i.test(line)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    matchedDateText = "yesterday";
    dateExplicitlyMatched = true;
  } else if (/\b(day before yesterday)\b/i.test(line)) {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    matchedDateText = "day before yesterday";
    dateExplicitlyMatched = true;
  } else {
    const dmyRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;
    const dmyMatch = line.match(dmyRegex);
    if (dmyMatch) {
      let day = parseInt(dmyMatch[1], 10);
      let month = parseInt(dmyMatch[2], 10);
      let year = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : new Date().getFullYear();
      if (year < 100) year += 2000;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        matchedDateText = dmyMatch[0];
        dateExplicitlyMatched = true;
      }
    } else {
      const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const monthsFull = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
      
      let foundMonthIdx = -1;
      let monthKeyword = "";
      for (let i = 0; i < 12; i++) {
        if (lower.includes(monthsFull[i])) {
          foundMonthIdx = i;
          monthKeyword = monthsFull[i];
          break;
        } else if (lower.includes(months[i])) {
          foundMonthIdx = i;
          monthKeyword = months[i];
          break;
        }
      }

      if (foundMonthIdx !== -1) {
        const regexAround = new RegExp(`(\\b\\d{1,2}(?:st|nd|rd|th)?\\b)?\\s*${monthKeyword}\\s*(\\b\\d{1,2}(?:st|nd|rd|th)?\\b)?(?:\\s*,?\\s*(\\b\\d{2,4}\\b))?`, "i");
        const matchAround = line.match(regexAround);
        if (matchAround) {
          const rawDay = matchAround[1] || matchAround[2];
          const rawYear = matchAround[3];
          if (rawDay) {
            const day = parseInt(rawDay.replace(/(st|nd|rd|th)/g, ""), 10);
            let year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();
            if (year < 100) year += 2000;
            if (day >= 1 && day <= 31) {
              date = `${year}-${String(foundMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              matchedDateText = matchAround[0];
              dateExplicitlyMatched = true;
            }
          }
        }
      }
    }
  }

  // 3. Category Detection
  let matchedCat: CategoryId | null = null;
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) { matchedCat = catId as CategoryId; break; }
  }
  if (!matchedCat) {
    const lm = CATEGORIES.find((c) => lower.includes(c.label.toLowerCase()));
    if (lm) matchedCat = lm.id;
  }
  if (!matchedCat) matchedCat = "other";

  // 4. Payment Mode Detection
  let matchedPaymentMode: PaymentMode = "upi";
  const bracketMatch = line.match(/[\(\[\{]([a-zA-Z\s\d]+)[\)\]\}]/);
  if (bracketMatch) {
    const bracketContent = bracketMatch[1].toLowerCase().trim();
    if (bracketContent.includes("upi") || bracketContent.includes("gpay") || bracketContent.includes("phonepe") || bracketContent.includes("paytm")) {
      matchedPaymentMode = "upi";
    } else if (bracketContent.includes("card") || bracketContent.includes("credit") || bracketContent.includes("debit")) {
      matchedPaymentMode = "card";
    } else if (bracketContent.includes("cash")) {
      matchedPaymentMode = "cash";
    } else if (bracketContent.includes("netbanking") || bracketContent.includes("bank") || bracketContent.includes("net banking") || bracketContent.includes("transfer")) {
      matchedPaymentMode = "netbanking";
    }
  } else {
    if (/\b(card|credit|debit)\b/i.test(line)) {
      matchedPaymentMode = "card";
    } else if (/\b(cash)\b/i.test(line)) {
      matchedPaymentMode = "cash";
    } else if (/\b(netbanking|bank|transfer)\b/i.test(line)) {
      matchedPaymentMode = "netbanking";
    } else if (/\b(upi|gpay|phonepe|paytm)\b/i.test(line)) {
      matchedPaymentMode = "upi";
    }
  }

  // 5. Note Extraction
  let cleanNote = line;
  if (bracketMatch) {
    cleanNote = cleanNote.replace(bracketMatch[0], "");
  }
  if (matchedDateText) cleanNote = cleanNote.replace(matchedDateText, "");
  cleanNote = cleanNote.replace(amountMatch[0], "");
  
  const catLabel = CATEGORIES.find((c) => c.id === matchedCat)?.label || "Other";
  let note = extractNote(cleanNote, amount);
  if (!note || note.length < 2) note = catLabel;

  return {
    amount,
    categoryId: matchedCat,
    note,
    date,
    paymentMode: matchedPaymentMode,
    dateExplicitlyMatched
  };
}

function extractDateFromText(text: string): string | null {
  const lower = text.toLowerCase();
  
  if (/\b(today)\b/i.test(text)) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (/\b(yesterday)\b/i.test(text)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (/\b(day before yesterday)\b/i.test(text)) {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // Numeric formats: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
  const dmyRegex = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/;
  const dmyMatch = text.match(dmyRegex);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    let year = dmyMatch[3] ? parseInt(dmyMatch[3], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Month names
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const monthsFull = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  
  let foundMonthIdx = -1;
  let monthKeyword = "";
  for (let i = 0; i < 12; i++) {
    if (lower.includes(monthsFull[i])) {
      foundMonthIdx = i;
      monthKeyword = monthsFull[i];
      break;
    } else if (lower.includes(months[i])) {
      foundMonthIdx = i;
      monthKeyword = months[i];
      break;
    }
  }

  if (foundMonthIdx !== -1) {
    const regexAround = new RegExp(`(\\b\\d{1,2}(?:st|nd|rd|th)?\\b)?\\s*${monthKeyword}\\s*(\\b\\d{1,2}(?:st|nd|rd|th)?\\b)?(?:\\s*,?\\s*(\\b\\d{2,4}\\b))?`, "i");
    const matchAround = text.match(regexAround);
    if (matchAround) {
      const rawDay = matchAround[1] || matchAround[2];
      const rawYear = matchAround[3];
      if (rawDay) {
        const day = parseInt(rawDay.replace(/(st|nd|rd|th)/g, ""), 10);
        let year = rawYear ? parseInt(rawYear, 10) : new Date().getFullYear();
        if (year < 100) year += 2000;
        if (day >= 1 && day <= 31) {
          return `${year}-${String(foundMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
      }
    }
  }

  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ChatbotScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const { addExpense, addMultipleExpenses, getCategoryTotalsForMonth, getTotalForMonth, expenses } = useExpenses();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [typing, setTyping] = useState(false);
  const [convState, setConvState] = useState<ConvState>({ step: "idle" });
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => setKeyboardHeight(e.endCoordinates.height)
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0)
    );
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Welcome message
  useEffect(() => {
    const firstName = user?.name?.split(" ")[0] || "friend";
    const hour = new Date().getHours();
    const g = hour < 12 ? "Good morning" : hour < 17 ? "Hey" : "Good evening";
    setMessages([{
      id: "welcome",
      sender: "bot",
      text: `${g}, ${firstName}! 😊 I'm **WhisperBot** — your personal finance buddy.\n\nI can help you:\n💸 Log expenses (\"spent 200 on lunch\")\n📊 Analyse your spending\n📄 Download your PDF statement\n🆘 Raise a support ticket\n💬 Just chat — I'm here!\n\nWhat's on your mind?`,
      timestamp: new Date(),
    }]);
  }, [user]);

  const addMessage = useCallback((sender: "user" | "bot", text: string, card?: Message["customCard"]) => {
    setMessages((prev) => [
      ...prev,
      { id: Math.random().toString(), sender, text, timestamp: new Date(), customCard: card },
    ]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = async () => {
    const clean = inputText.trim();
    if (!clean) return;
    setInputText("");
    addMessage("user", clean);
    setTyping(true);
    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => processUserMessage(clean), 800);
  };

  // ─── AGENT: multi-task detection ──────────────────────────────────────────
  // Returns a list of detected intent tokens from user message
  function detectIntents(lower: string): string[] {
    const intents: string[] = [];

    // Abuse check first
    const abusiveWords = ["fuck","shit","bastard","bitch","asshole","idiot","stupid","dumb","moron",
      "bc","mc","chutiya","madarchod","bhenchod","harami","sala","gandu","randi","kamine","bkl","mf"];
    if (abusiveWords.some((w) => lower.includes(w))) intents.push("abuse");

    // Support — must be checked before "help" to avoid cheatsheet conflict
    if (
      (lower.includes("raise") && (lower.includes("support") || lower.includes("ticket"))) ||
      lower.includes("report issue") ||
      lower.includes("i have a problem") ||
      lower.includes("i have an issue") ||
      lower.includes("complaint") ||
      (lower.includes("need help") && lower.includes("support")) ||
      lower === "support"
    ) intents.push("support");

    // PDF / statement
    if (lower.includes("pdf") || lower.includes("statement") || lower.includes("download report") ||
      lower.includes("download my") || lower.includes("get report") || lower.includes("generate pdf"))
      intents.push("pdf");

    // Universal spend and analysis query
    const queryPhrases = [
      "how much", "spending", "spent", "total for", "kitna spend", "my spend", 
      "what did i spend", "expense list", "show transaction", "tell me my spend",
      "analyse", "analyze", "breakdown", "overview", "monthly report", "how am i doing", 
      "show spending", "show budget"
    ];
    if (queryPhrases.some((p) => lower.includes(p))) {
      intents.push("spend_query");
    }

    // Expense log
    const expenseRegex = /(?:spent|paid|pay|add|log|cost|worth|₹|rs\.?\s*\d|\d\s*rs\.?|inr)\s*[\d,]+|[\d,]+\s*(?:rupees|rs\.?|inr|₹)/i;
    if (expenseRegex.test(lower)) intents.push("expense");

    // Greeting
    const greetWords = ["hi","hello","hey","namaste","hii","hlo","gm","good morning","good evening","good night"];
    if (!intents.length && greetWords.some((g) => lower === g || lower.startsWith(g + " ") || lower.endsWith(" " + g)))
      intents.push("greeting");

    // Mood
    const sadWords = ["sad","depressed","upset","stressed","anxious","worried","lonely","bored","dukhi","pareshan"];
    if (sadWords.some((w) => lower.includes(w))) intents.push("sad");
    const happyWords = ["happy","excited","great day","awesome","fantastic","khush","mast","blessed"];
    if (happyWords.some((w) => lower.includes(w))) intents.push("happy");

    // Joke
    if (lower.includes("joke") || lower.includes("funny") || lower.includes("make me laugh") || lower.includes("entertain")) intents.push("joke");

    // Thanks
    if (lower.includes("thank") || lower.includes("shukriya") || lower.includes("love you") || lower.includes("good bot") || lower.includes("great bot")) intents.push("thanks");

    // Motivation
    if (lower.includes("motivat") || lower.includes("inspire") || lower.includes("i give up") || lower.includes("feeling lost") || lower.includes("advice")) intents.push("motivate");

    // How are you
    if (lower.includes("how are you") || lower.includes("how r u") || lower.includes("wassup") ||
      lower.includes("whats up") || lower.includes("what's up") || lower.includes("kya haal") || lower.includes("kaisa"))
      intents.push("how_are_you");

    // Security/privacy
    if (lower.includes("secure") || lower.includes("privacy") || lower.includes("safe") || lower.includes("data safe")) intents.push("security");

    // SMS sync
    if (lower.includes("sms") || lower.includes("auto detect") || lower.includes("auto sync")) intents.push("sms");

    // Profile settings guidance
    if (
      lower.includes("change name") || lower.includes("edit name") || lower.includes("update name") || lower.includes("set name") ||
      lower.includes("change username") || lower.includes("set username") ||
      lower.includes("profile picture") || lower.includes("profile photo") || lower.includes("avatar") ||
      lower.includes("change picture") || lower.includes("change photo") ||
      lower.includes("auto-sync") || lower.includes("auto sync") || lower.includes("gpay sync") || lower.includes("sms sync") ||
      lower.includes("sign out") || lower.includes("logout") || lower.includes("theme") || lower.includes("light mode") || lower.includes("dark mode")
    ) intents.push("profile_guide");

    // Ledger / expense management guidance
    if (
      lower.includes("delete expense") || lower.includes("delete transaction") || lower.includes("remove expense") || lower.includes("remove transaction") ||
      lower.includes("edit expense") || lower.includes("edit transaction") || lower.includes("change expense") || lower.includes("change transaction") ||
      lower.includes("update transaction") || lower.includes("correct transaction") || lower.includes("modify transaction") || lower.includes("delete log")
    ) intents.push("ledger_guide");

    // Help / cheatsheet — only if no other intents
    if (!intents.length && (lower.includes("help") || lower === "/help" || lower.includes("what can you do") || lower.includes("commands")))
      intents.push("help");

    return intents;
  }

  // ─── MAIN PROCESSOR ───────────────────────────────────────────────────────
  const processUserMessage = async (text: string) => {
    const lower = text.toLowerCase().trim();
    const firstName = user?.name?.split(" ")[0] || "friend";

    // ── Context: awaiting support description ──────────────────────────────
    if (convState.step === "awaiting_support_desc") {
      setConvState({ step: "idle" });
      try {
        if (user) {
          await addDoc(collection(db, "support_cases"), {
            userId: user.uid,
            userEmail: user.email || "",
            userName: user.name || "Valued User",
            subject: "Chatbot Support Query",
            message: text,
            status: "received",
            createdAt: serverTimestamp(),
          });
        }
        addMessage("bot", `Done! ✅ Your ticket has been filed with our team.`, {
          type: "support_success",
          title: "Support Ticket Raised",
          body: `Issue:\n"${text}"\n\nStatus: Pending\nWe'll review it soon!`,
        });
        addMessage("bot", `Anything else I can help with, ${firstName}? 😊`);
      } catch (err: any) {
        addMessage("bot", `Oops, couldn't file the ticket: ${err.message}. Try again?`);
      }
      setTyping(false);
      return;
    }

    // ── Context: awaiting category ─────────────────────────────────────────
    if (convState.step === "awaiting_category") {
      const { amount, note, date } = convState;
      let matchedCat: CategoryId | null = null;
      for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some((k) => lower.includes(k))) { matchedCat = catId as CategoryId; break; }
      }
      if (!matchedCat) {
        const lm = CATEGORIES.find((c) => lower.includes(c.label.toLowerCase()));
        if (lm) matchedCat = lm.id;
      }
      if (!matchedCat) matchedCat = "other";

      const catLabel = CATEGORIES.find((c) => c.id === matchedCat)?.label || "Other";
      setConvState({ step: "awaiting_confirmation", amount, categoryId: matchedCat, note, date });
      addMessage("bot", `Got it — **${catLabel}** it is! 👍\n\n₹${amount} for "${note || "—"}" on **${date?.split("-").reverse().join("/")}** under **${catLabel}**. Shall I save this?`);
      setTyping(false);
      return;
    }

    // ── Context: awaiting confirmation ────────────────────────────────────
    if (convState.step === "awaiting_confirmation") {
      const { amount, categoryId, note, date } = convState;
      const catLabel = CATEGORIES.find((c) => c.id === categoryId)?.label || "Other";
      const YES = ["yes","yeah","y","ok","okay","sure","confirm","save","log","haan","ha","bilkul","✅","👍"];
      const NO  = ["no","nope","n","cancel","discard","stop","nahi","❌","👎","nah"];
      if (YES.some((w) => lower === w || lower.includes(w))) {
        setConvState({ step: "idle" });
        await executeAddExpense(amount!, categoryId!, note || "", date);
        return;
      }
      if (NO.some((w) => lower === w || lower.includes(w))) {
        setConvState({ step: "idle" });
        addMessage("bot", `Alright, I've discarded that! 🗑️ Let me know whenever you want to log something.`);
        setTyping(false);
        return;
      }
      addMessage("bot", `Just say **Yes** to save ₹${amount} under **${catLabel}**, or **No** to cancel. 😊`);
      setTyping(false);
      return;
    }

    // ── Context: awaiting bulk confirmation ───────────────────────────────
    if (convState.step === "awaiting_bulk_confirmation") {
      const { bulkExpenses } = convState;
      const YES = ["yes","yeah","y","ok","okay","sure","confirm","save","log","haan","ha","bilkul","✅","👍"];
      const NO  = ["no","nope","n","cancel","discard","stop","nahi","❌","👎","nah"];
      if (YES.some((w) => lower === w || lower.includes(w))) {
        setConvState({ step: "idle" });
        if (bulkExpenses && bulkExpenses.length > 0) {
          setTyping(true);
          try {
            const preparedItems = bulkExpenses.map(item => ({
              ...item,
              paymentMode: item.paymentMode || ("upi" as const),
            }));
            await addMultipleExpenses(preparedItems);
            safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            addMessage("bot", `Done! ✅ Successfully logged all **${bulkExpenses.length}** expenses! 💸`, {
              type: "expense_success",
              title: "Bulk Expenses Logged ✅",
              body: `Successfully imported ${bulkExpenses.length} transactions from bulk input.`,
            });
          } catch (err: any) {
            addMessage("bot", `Failed to save bulk expenses: ${err.message}`);
          } finally {
            setTyping(false);
          }
        }
        return;
      }
      if (NO.some((w) => lower === w || lower.includes(w))) {
        setConvState({ step: "idle" });
        addMessage("bot", `Cancelled! 🗑️ I've discarded all parsed transactions.`);
        setTyping(false);
        return;
      }
      addMessage("bot", `Just say **Yes** to log all **${bulkExpenses?.length || 0}** transactions, or **No** to cancel. 😊`);
      setTyping(false);
      return;
    }

    // ── Agent: bulk parsing execution ─────────────────────────────────────
    if (convState.step === "idle") {
      const rawLines = text.split(/[\n\.;\+]+/).map(l => l.trim()).filter(l => l.length > 0);
      const parsedItems: ParsedExpense[] = [];
      let lastActiveDate = todayISO();
      
      for (const line of rawLines) {
        const parsed = parseTransactionLine(line, lastActiveDate);
        if (parsed) {
          parsedItems.push(parsed);
          if (parsed.dateExplicitlyMatched) {
            lastActiveDate = parsed.date;
          }
        }
      }

      if (parsedItems.length > 1) {
        const catLabel = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)?.label || "Other";
        const formatDate = (iso: string) => {
          const parts = iso.split("-");
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        };
        
        let summaryText = `Wow, I detected **${parsedItems.length}** transactions in your message! 📊\n\n`;
        parsedItems.forEach((exp, idx) => {
          summaryText += `${idx + 1}. 📅 **${formatDate(exp.date)}** | 💸 **₹${exp.amount}** | 📝 *${exp.note}* (${catLabel(exp.categoryId)}) [${(exp.paymentMode || "upi").toUpperCase()}]\n`;
        });
        summaryText += `\nShall I log all **${parsedItems.length}** expenses for you?`;
        
        setConvState({ step: "awaiting_bulk_confirmation", bulkExpenses: parsedItems });
        addMessage("bot", summaryText);
        setTyping(false);
        return;
      }
    }

    // ── Agent: detect intents and run them all ─────────────────────────────
    const intents = detectIntents(lower);

    if (intents.length === 0) {
      // Pure casual fallback
      const fallbacks = [
        `I'm not sure I caught that, ${firstName} 😅 Try telling me an expense like "spent 200 on lunch", or just say "help" to see what I can do!`,
        `Hmm, let me think... 🤔 I'm best at logging expenses, analysing budgets, and downloading statements. What did you need?`,
        `I'm still learning! 😄 Try things like "how much on food", "download statement", or just vent — I'm a good listener too 💙`,
      ];
      addMessage("bot", fallbacks[Math.floor(Math.random() * fallbacks.length)]);
      setTyping(false);
      return;
    }

    // Run each intent in sequence
    for (const intent of intents) {
      switch (intent) {

        case "abuse": {
          const replies = [
            `Hey ${firstName}, easy there! 😅 I know life gets frustrating — but I'm on your side. Take a breath and tell me what's really bothering you 💙`,
            `Haha, noted! 😄 I've been called worse by my training data, trust me. But seriously — what's up?`,
            `That energy! 😮 Look, I'm not going anywhere — I'm your buddy. Vent if you need to, just maybe minus the swear words? 😂 What's actually going on?`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "greeting": {
          const replies = [
            `Heyy ${firstName}! 😊 Great to see you! How's your day going?`,
            `Hi hi ${firstName}! 👋 What's up? Need to log something or just here to chat?`,
            `Namaste ${firstName}! 🙏 Always happy to help. What's on your mind?`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "how_are_you": {
          const replies = [
            `I'm doing great, ${firstName}! 😊 Just here keeping an eye on your finances (like a good friend should). How are YOU doing?`,
            `Living my best bot life! 🚀 Always happy to chat. How about you — good day?`,
            `Never been better! 😄 More importantly — how are YOU?`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "sad": {
          const replies = [
            `Hey, I hear you 💙 Bad days happen to everyone. I'm right here if you want to talk — sometimes just venting helps. What's going on?`,
            `Aww ${firstName} 🫂 I'm sorry you're feeling this way. You're not alone. Tell me what's bothering you?`,
            `That sounds tough 😔 Take your time — I'm not going anywhere. What's up?`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "happy": {
          const replies = [
            `That's the energy! 🔥 Keep it going, ${firstName}! What's making you feel good today?`,
            `Yessss! 🎉 Love that for you! What's the occasion?`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "joke": {
          const jokes = [
            `Why did the man put his money in the blender?\n\nBecause he wanted to make some *liquid assets*! 😂💸`,
            `I told my wallet I loved it.\nIt said: "Prove it — stop spending me!" 💔😂`,
            `A bank called me. They said my balance is outstanding.\n\nI said: "Thanks, I've always been exceptional!" 😄`,
            `What do you call someone who's great with money?\n\nMe, in theory. Reality is a different story 😅`,
          ];
          addMessage("bot", jokes[Math.floor(Math.random() * jokes.length)]);
          break;
        }

        case "thanks": {
          const replies = [
            `Aww, you're going to make me blush! 😊 Just doing my job — keeping you financially fit and emotionally supported 💙`,
            `Thank YOU for trusting me, ${firstName}! That means a lot. Now go save some money! 😄`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "motivate": {
          const replies = [
            `Here's a thought 💡\n\nEvery rupee you save today is future-you saying thank you. Small steps, big changes. You've got this! 💪`,
            `You know what's amazing about you? You're showing up — even on the hard days. That's half the battle won already 🌟`,
            `Don't be too hard on yourself, ${firstName} 🫂 Progress isn't always visible, but it's always happening when you keep trying.`,
          ];
          addMessage("bot", replies[Math.floor(Math.random() * replies.length)]);
          break;
        }

        case "security": {
          addMessage("bot", `Your data is 100% safe with me, ${firstName} 🔒\n\nAll expenses live in your personal encrypted Firestore database — only YOU can access them. We never sell, share, or analyse your data externally. Your financial life is your business, and I take that seriously! 💙`);
          break;
        }

        case "sms": {
          addMessage("bot", `📲 **Smart SMS Auto-Sync!**\n\nWith your permission, I scan incoming bank/UPI SMS alerts, extract the amount & merchant, and ask you to confirm before logging. It's like having a personal finance secretary — free and way cooler 😎`);
          break;
        }

        case "profile_guide": {
          addMessage("bot", `I can definitely guide you with your profile & display options! ⚙️\n\nGo to the **Profile** tab, and you can:\n\n✏️ **Change Name**: Tap the edit pencil icon next to your name.\n\n📷 **Change Avatar**: Tap your user profile picture circle to pick a square image (under 5MB).\n\n🌓 **Display Mode**: Toggle Dark, Light, or System Auto theme under **Theme Preference**!\n\n📲 **Auto-Sync**: Switch the 'Auto-Sync SMS Expenses' toggle to automatically log GPay/bank texts.\n\n🚪 **Sign Out**: Tap the Sign Out button at the bottom of the section.`);
          break;
        }

        case "ledger_guide": {
          addMessage("bot", `Need to modify or delete your transactions? I've got you! 📝\n\nGo to the **History** tab (or **Home** tab) and locate the transaction row:\n\n✏️ **Edit**: Tap the **Edit** button on the transaction to change the amount, category, date, or note.\n\n🗑️ **Delete**: Tap the red **Trash** icon to permanently remove that expense log.`);
          break;
        }

        case "support": {
          setConvState({ step: "awaiting_support_desc" });
          addMessage("bot", `Of course, ${firstName}! I'll raise a ticket to our team right now 🛠️\n\nJust describe your issue in your next message — as much detail as you like — and I'll file it instantly.`);
          break;
        }

        case "help": {
          addMessage("bot", `Sure ${firstName}! Here's everything I can do for you 💡`, {
            type: "help_guide",
            title: "WhisperBot Cheat Sheet",
            body: `💸 Log Expenses:\n  "Spent 150 on coffee"\n  "Log 500 for groceries"\n\n📊 Check Spending:\n  "How much on food this month?"\n  "Show my budget breakdown"\n\n📄 Get Statement:\n  "Download my statement"\n  "Generate PDF"\n\n🆘 Raise Support:\n  "Raise a support ticket"\n  "I have an issue"\n\n💬 Just Chat:\n  How was your day?\n  Tell me a joke 😄`,
          });
          break;
        }

        case "pdf": {
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          const monthExpenses = expenses
            .filter((e) => {
              const [ey, em] = e.date.split("-").map(Number);
              return ey === year && em === month;
            })
            .map((e) => ({
              date: e.date,
              note: e.note,
              categoryId: e.categoryId,
              paymentMode: e.paymentMode,
              amount: e.amount,
            }));

          if (monthExpenses.length === 0) {
            addMessage("bot", `No expenses logged for this month yet, ${firstName} 🤔 Add some transactions first, then I'll generate a beautiful PDF for you!`);
          } else {
            addMessage("bot", `Generating your statement now... ⏳`);
            const { generateAndSharePDF } = await import("@/utils/pdfGenerator");
            const result = await generateAndSharePDF(
              year, month, monthExpenses,
              user ? { uid: user.uid, name: user.name, email: user.email } : null
            );
            if (result === "success") {
              addMessage("bot", `Your statement is ready! 📄 Check the popup to save or share it.`);
            } else {
              addMessage("bot", `Something went wrong generating the PDF 😔 Try again or visit the Analytics tab.`);
            }
          }
          break;
        }

        case "spend_query": {
          const now = new Date();
          const targetDate = extractDateFromText(text);
          
          // Detect category
          let foundCatId: CategoryId | null = null;
          for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some((k) => lower.includes(k))) { foundCatId = catId as CategoryId; break; }
          }
          if (!foundCatId) {
            const lm = CATEGORIES.find((c) => lower.includes(c.label.toLowerCase()));
            if (lm) foundCatId = lm.id;
          }

          const formatDate = (iso: string) => {
            const parts = iso.split("-");
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
          };

          if (targetDate) {
            // DAILY QUERY
            const dayExpenses = expenses.filter((e) => e.date === targetDate);
            const formattedDateText = formatDate(targetDate);

            if (foundCatId) {
              // Specific category on specific day
              const cat = CATEGORIES.find((c) => c.id === foundCatId)!;
              const catExpenses = dayExpenses.filter((e) => e.categoryId === foundCatId);
              const sum = catExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);

              if (sum > 0) {
                let msg = `You spent a total of **₹${sum.toLocaleString("en-IN")}** on **${cat.label}** on **${formattedDateText}** 📊\n\n`;
                catExpenses.forEach((e, idx) => {
                  msg += `• ₹${e.amount} for *${e.note || cat.label}*\n`;
                });
                addMessage("bot", msg);
              } else {
                addMessage("bot", `You haven't logged any expenses for **${cat.label}** on **${formattedDateText}**! 💸`);
              }
            } else {
              // Total spending on a specific day
              const sum = dayExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
              
              if (sum > 0) {
                let msg = `Your total spending on **${formattedDateText}** was **₹${sum.toLocaleString("en-IN")}** across **${dayExpenses.length}** transactions: 💸\n\n`;
                dayExpenses.forEach((e, idx) => {
                  const catLabel = CATEGORIES.find((c) => c.id === e.categoryId)?.label || "Other";
                  msg += `${idx + 1}. **₹${e.amount}** — *${e.note || catLabel}* (${catLabel})\n`;
                });
                addMessage("bot", msg);
              } else {
                addMessage("bot", `You have no transactions logged for **${formattedDateText}**! 🌱`);
              }
            }
          } else {
            // MONTHLY QUERY (default to current month)
            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const monthExpenses = expenses.filter((e) => {
              const prefix = `${year}-${String(month).padStart(2, "0")}`;
              return e.date.startsWith(prefix);
            });

            if (foundCatId) {
              // Monthly category query
              const cat = CATEGORIES.find((c) => c.id === foundCatId)!;
              const catExpenses = monthExpenses.filter((e) => e.categoryId === foundCatId);
              const sum = catExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
              const total = monthExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
              const pct = total > 0 ? Math.round((sum / total) * 100) : 0;

              if (sum > 0) {
                let msg = `You've spent **₹${sum.toLocaleString("en-IN")}** on **${cat.label}** this month 📊\n`;
                msg += `That's **${pct}%** of your total monthly spend (₹${total.toLocaleString("en-IN")}).\n\nRecent logs:\n`;
                catExpenses.slice(0, 5).forEach((e) => {
                  msg += `• **₹${e.amount}** on ${formatDate(e.date)} — *${e.note || cat.label}*\n`;
                });
                addMessage("bot", msg);
              } else {
                addMessage("bot", `You haven't logged anything under **${cat.label}** this month yet! 🎉`);
              }
            } else {
              // General monthly spending query (falls back to analysis card!)
              const total = monthExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
              const catTotals = getCategoryTotalsForMonth(year, month);
              const activeCats = Object.entries(catTotals)
                .filter(([_, v]) => v > 0)
                .sort((a, b) => b[1] - a[1]);

              if (total > 0) {
                const topEntry = activeCats[0];
                const topCat = CATEGORIES.find((c) => c.id === topEntry?.[0]);
                let msg = `Here's your spending snapshot this month 📊\n\n**Total:** ₹${total.toLocaleString("en-IN")}`;
                if (topCat) msg += `\n**Biggest:** ${topCat.label} (₹${topEntry[1].toLocaleString("en-IN")}, ${Math.round((topEntry[1] / total) * 100)}%)\n\nFull breakdown 👇`;
                addMessage("bot", msg, {
                  type: "budget_analysis",
                  title: "Monthly Budget Overview",
                  body: JSON.stringify(
                    activeCats.map(([catId, amount]) => {
                      const cat = CATEGORIES.find((c) => c.id === catId)!;
                      return { label: cat.label, amount, percentage: Math.round((amount / total) * 100), color: cat.color };
                    })
                  ),
                });
              } else {
                addMessage("bot", `You haven't logged any expenses this month yet! 🌱 Start by telling me what you've spent 😄`);
              }
            }
          }
          break;
        }

        case "expense": {
          const parsed = parseTransactionLine(text);
          if (!parsed) break;

          const { amount, categoryId, note, date } = parsed;

          if (categoryId === "other") {
            setConvState({ step: "awaiting_category", amount, note, date });
            addMessage("bot", `Got it — **₹${amount}**${note ? ` for *${note}*` : ""} on **${date.split("-").reverse().join("/")}**! 👌\n\nWhich category should I file this under? (e.g. Food, Groceries, Travel, Shopping...)`);
          } else {
            const catLabel = CATEGORIES.find((c) => c.id === categoryId)?.label || "Other";
            setConvState({ step: "awaiting_confirmation", amount, categoryId, note, date });
            addMessage("bot", `Noted! **₹${amount}**${note ? ` — *${note}*` : ""} under **${catLabel}** on **${date.split("-").reverse().join("/")}** 📝\n\nShall I save this? (Yes / No)`);
          }
          break;
        }
      }
    }

    setTyping(false);
  };

  const executeAddExpense = async (amount: number, categoryId: CategoryId, note: string, customDate?: string) => {
    setTyping(true);
    try {
      const today = new Date();
      const isoDate = customDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const catLabel = CATEGORIES.find((c) => c.id === categoryId)?.label || "Other";
      await addExpense({
        amount,
        categoryId,
        note: note.trim() || catLabel,
        date: isoDate,
        paymentMode: "upi",
      });
      safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      addMessage("bot", `Done! ₹${amount} logged 💸`, {
        type: "expense_success",
        title: "Expense Logged ✅",
        body: `Amount: ₹${amount}\nCategory: ${catLabel}\nNote: ${note || catLabel}\nDate: ${isoDate}`,
        metadata: { categoryId, amount, note, date: isoDate },
      });
    } catch (err: any) {
      addMessage("bot", `Failed to save: ${err.message}`);
    } finally {
      setTyping(false);
    }
  };

  // ─── Suggestion chips ─────────────────────────────────────────────────────
  const getSuggestions = () => {
    if (convState.step === "awaiting_confirmation")
      return [{ text: "Yes, save it ✅", icon: "check" }, { text: "No, cancel ❌", icon: "x" }];
    if (convState.step === "awaiting_bulk_confirmation")
      return [{ text: "Yes, log all ✅", icon: "check" }, { text: "No, cancel ❌", icon: "x" }];
    if (convState.step === "awaiting_category")
      return [
        { text: "Food Outside", icon: "coffee" },
        { text: "Groceries", icon: "shopping-bag" },
        { text: "Travel", icon: "navigation" },
        { text: "Shopping", icon: "gift" },
        { text: "Other", icon: "hash" },
      ];
    return [
      { text: "Spent 150 on coffee", icon: "coffee" },
      { text: "Show my budget", icon: "bar-chart-2" },
      { text: "Download statement", icon: "download" },
      { text: "Raise support ticket", icon: "life-buoy" },
      { text: "Tell me a joke", icon: "smile" },
    ];
  };
  const suggestions = getSuggestions();

  // ─── Styles ───────────────────────────────────────────────────────────────
  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 16,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    avatar: {
      width: 38, height: 38, borderRadius: 12,
      backgroundColor: "rgba(16, 185, 129, 0.12)",
      alignItems: "center", justifyContent: "center",
      borderWidth: 1, borderColor: "rgba(16, 185, 129, 0.25)",
    },
    headerTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground },
    headerSub: { fontSize: 11, color: "#10b981", fontFamily: "Inter_600SemiBold", marginTop: 2, flexDirection: "row", alignItems: "center", gap: 4 },
    listContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, flexGrow: 1 },
    bubbleWrap: { flexDirection: "row", marginBottom: 14, maxWidth: "82%" },
    userWrap: { alignSelf: "flex-end" },
    botWrap: { alignSelf: "flex-start" },
    bubble: {
      borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    userBubble: { borderBottomRightRadius: 4, overflow: "hidden" },
    botBubble: {
      backgroundColor: colors.card, borderBottomLeftRadius: 4,
      borderWidth: 1, borderColor: "rgba(99, 102, 241, 0.25)",
    },
    userText: { color: "#fff", fontSize: 14, lineHeight: 21, fontFamily: "Inter_500Medium" },
    botText: { color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
    timeText: { fontSize: 9, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginTop: 6, alignSelf: "flex-end" },
    typingWrap: {
      flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
      backgroundColor: colors.card, borderRadius: 16,
      paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, marginLeft: 16,
      borderWidth: 1, borderColor: colors.border, gap: 6,
    },
    typingText: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_500Medium" },
    card: {
      backgroundColor: colors.background, borderRadius: 12, borderWidth: 1,
      borderColor: "rgba(99, 102, 241, 0.25)", padding: 12, marginTop: 10,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
      width: SCREEN_WIDTH - 68,
    },
    cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    cardTitle: { fontSize: 13, fontWeight: "700", fontFamily: "Inter_700Bold", color: colors.foreground },
    cardBody: { fontSize: 12.5, lineHeight: 18, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    chipsScroll: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.background },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
      backgroundColor: "rgba(99, 102, 241, 0.08)",
      borderWidth: 1, borderColor: "rgba(99, 102, 241, 0.35)",
      marginRight: 8, flexDirection: "row", alignItems: "center", gap: 6,
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
    },
    chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    inputArea: {
      backgroundColor: colors.card,
      borderTopWidth: 1, borderTopColor: colors.border,
      paddingHorizontal: 16, paddingTop: 10,
      paddingBottom: insets.bottom > 0 ? insets.bottom : 10,
      flexDirection: "row", alignItems: "center", gap: 12,
    },
    inputWrap: {
      flex: 1, minHeight: 48, maxHeight: 120, backgroundColor: colors.muted,
      borderRadius: 24, paddingHorizontal: 18, paddingVertical: Platform.OS === "ios" ? 8 : 4,
      flexDirection: "row", alignItems: "center",
    },
    input: { flex: 1, color: colors.foreground, fontFamily: "Inter_400Regular", fontSize: 14 },
    sendBtn: {
      width: 48, height: 48, borderRadius: 24,
      backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
      shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },
  });

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Feather name="message-circle" size={20} color="#10b981" />
        </View>
        <View>
          <Text style={styles.headerTitle}>WhisperBot</Text>
          <Text style={styles.headerSub}>🟢 Secure Finance Intelligence</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.select({ ios: insets.bottom + 49, default: 0 })}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isUser = item.sender === "user";
            return (
              <View style={[styles.bubbleWrap, isUser ? styles.userWrap : styles.botWrap]}>
                {isUser ? (
                  <LinearGradient
                    colors={["#6366f1", "#4f46e5"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.bubble, styles.userBubble]}
                  >
                    {renderMarkdown(item.text, styles.userText, "#fff")}
                    <Text style={[styles.timeText, { color: "rgba(255,255,255,0.72)" }]}>
                      {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </LinearGradient>
                ) : (
                  <View style={[styles.bubble, styles.botBubble]}>
                    {renderMarkdown(item.text, styles.botText, colors.primary)}
                    {item.customCard && (
                      <View style={styles.card}>
                        <View style={styles.cardTitleRow}>
                          <Feather
                            name={
                              item.customCard.type === "expense_success" ? "check-circle" :
                              item.customCard.type === "budget_analysis" ? "bar-chart-2" :
                              item.customCard.type === "support_success" ? "mail" : "help-circle"
                            }
                            size={16} color={colors.primary}
                          />
                          <Text style={styles.cardTitle}>{item.customCard.title}</Text>
                        </View>
                        {item.customCard.type === "budget_analysis" ? (
                          <View style={{ gap: 8, marginTop: 4 }}>
                            {JSON.parse(item.customCard.body).map((d: any, i: number) => (
                              <View key={i} style={{ gap: 4 }}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                  <Text style={{ fontSize: 11.5, fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{d.label}</Text>
                                  <Text style={{ fontSize: 11.5, fontFamily: "Inter_700Bold", color: colors.mutedForeground }}>₹{d.amount.toLocaleString("en-IN")} ({d.percentage}%)</Text>
                                </View>
                                <View style={{ height: 6, backgroundColor: colors.muted, borderRadius: 3, overflow: "hidden" }}>
                                  <View style={{ height: "100%", width: `${d.percentage}%`, backgroundColor: d.color }} />
                                </View>
                              </View>
                            ))}
                          </View>
                        ) : (
                          <Text style={styles.cardBody}>{item.customCard.body}</Text>
                        )}
                      </View>
                    )}
                    <Text style={styles.timeText}>
                      {item.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />

        {typing && (
          <View style={styles.typingWrap}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.typingText}>WhisperBot is typing...</Text>
          </View>
        )}

        {/* Suggestion Chips */}
        <View style={{ height: 54, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }}>
          <FlatList
            horizontal
            data={suggestions}
            keyExtractor={(item) => item.text}
            contentContainerStyle={styles.chipsScroll}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.chip}
                activeOpacity={0.7}
                onPress={() => {
                  if (convState.step === "awaiting_confirmation" || convState.step === "awaiting_category" || convState.step === "awaiting_bulk_confirmation") {
                    setInputText("");
                    addMessage("user", item.text);
                    setTyping(true);
                    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setTimeout(() => processUserMessage(item.text), 800);
                  } else {
                    setInputText(item.text);
                    setTimeout(() => inputRef.current?.focus(), 80);
                  }
                }}
              >
                <Feather name={item.icon as any} size={13} color={colors.primary} />
                <Text style={styles.chipText}>{item.text}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Input Bar */}
        <View style={[
          styles.inputArea,
          Platform.OS === "android" && keyboardHeight > 0
            ? { marginBottom: keyboardHeight - tabBarHeight }
            : undefined,
        ]}>
          <View style={styles.inputWrap}>
            <TextInput
              ref={inputRef}
              style={[styles.input, { paddingVertical: Platform.OS === "ios" ? 4 : 0 }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message WhisperBot..."
              placeholderTextColor={colors.mutedForeground}
              multiline={true}
              blurOnSubmit={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendBtn, !inputText.trim() && { opacity: 0.5 }]}
            activeOpacity={0.8}
            disabled={!inputText.trim()}
            onPress={handleSend}
          >
            <Feather name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
