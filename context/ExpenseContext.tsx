import AsyncStorage from "@react-native-async-storage/async-storage";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  Timestamp,
} from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import * as Notifications from "expo-notifications";

import { scheduleSMSApprovalNotification } from "@/utils/notifications";
import { fetchAndParseSMS } from "@/utils/smsParser";

import { db } from "../lib/firebase";
import { useAuth } from "./AuthContext";

export type PaymentMode = "none" | "cash" | "upi" | "card" | "netbanking";

export type CategoryId =
  | "travel"
  | "groceries"
  | "rent"
  | "food_outside"
  | "transfer"
  | "utilities"
  | "shopping"
  | "health"
  | "entertainment"
  | "invest"
  | "education"
  | "bills"
  | "subscriptions"
  | "personal_care"
  | "gifts"
  | "family"
  | "fuel"
  | "pets"
  | "other";

export interface Category {
  id: CategoryId;
  label: string;
  icon: string;
  color: string;
  lightColor: string;
}

export const CATEGORIES: Category[] = [
  { id: "travel", label: "Travel", icon: "navigation", color: "#3b82f6", lightColor: "#dbeafe" },
  { id: "groceries", label: "Groceries", icon: "shopping-bag", color: "#10b981", lightColor: "#d1fae5" },
  { id: "rent", label: "Rent", icon: "home", color: "#8b5cf6", lightColor: "#ede9fe" },
  { id: "food_outside", label: "Food Outside", icon: "coffee", color: "#f59e0b", lightColor: "#fef3c7" },
  { id: "transfer", label: "Transfer", icon: "send", color: "#ec4899", lightColor: "#fce7f3" },
  { id: "utilities", label: "Utilities", icon: "zap", color: "#06b6d4", lightColor: "#cffafe" },
  { id: "shopping", label: "Shopping", icon: "tag", color: "#f97316", lightColor: "#ffedd5" },
  { id: "health", label: "Health", icon: "heart", color: "#ef4444", lightColor: "#fee2e2" },
  { id: "entertainment", label: "Entertainment", icon: "film", color: "#a855f7", lightColor: "#f3e8ff" },
  { id: "invest", label: "Investment", icon: "trending-up", color: "#0ea5e9", lightColor: "#e0f2fe" },
  { id: "education", label: "Education", icon: "book-open", color: "#2563eb", lightColor: "#dbeafe" },
  { id: "bills", label: "Bills", icon: "file-text", color: "#0f766e", lightColor: "#ccfbf1" },
  { id: "subscriptions", label: "Subscriptions", icon: "repeat", color: "#7c3aed", lightColor: "#ede9fe" },
  { id: "personal_care", label: "Personal Care", icon: "scissors", color: "#db2777", lightColor: "#fce7f3" },
  { id: "gifts", label: "Gifts", icon: "gift", color: "#ea580c", lightColor: "#ffedd5" },
  { id: "family", label: "Family", icon: "users", color: "#1d4ed8", lightColor: "#dbeafe" },
  { id: "fuel", label: "Fuel", icon: "truck", color: "#4b5563", lightColor: "#e5e7eb" },
  { id: "pets", label: "Pets", icon: "smile", color: "#16a34a", lightColor: "#dcfce7" },
  { id: "other", label: "Other", icon: "more-horizontal", color: "#64748b", lightColor: "#f1f5f9" },
];

export interface Expense {
  id: string;
  amount: number;
  categoryId: CategoryId;
  paymentMode?: PaymentMode;
  note: string;
  date: string; // ISO date string YYYY-MM-DD
  createdAt: number;
  smsId?: string;
}

interface ExpenseContextType {
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  addMultipleExpenses: (newItems: Omit<Expense, "id" | "createdAt">[]) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  updateExpense: (id: string, updates: Partial<Omit<Expense, "id" | "createdAt">>) => Promise<void>;
  getExpensesForDate: (date: string) => Expense[];
  getExpensesForMonth: (year: number, month: number) => Expense[];
  getTotalForDate: (date: string) => number;
  getTotalForMonth: (year: number, month: number) => number;
  getCategoryTotalsForMonth: (year: number, month: number) => Record<CategoryId, number>;
  isLoading: boolean;
}

const ExpenseContext = createContext<ExpenseContextType | null>(null);

export function ExpenseProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthReady) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      setExpenses([]);
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, `users/${user.uid}/expenses`),
      orderBy("createdAt", "desc")
    );

    const normalizeDateStr = (dateStr: any) => {
      if (!dateStr || typeof dateStr !== "string" || !dateStr.includes("-")) return dateStr;
      const parts = dateStr.split("-");
      if (parts.length !== 3) return dateStr;
      return `${parts[0]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    };

    const unsubscribe = onSnapshot(q, {
      next: (snapshot) => {
        const loadedExpenses: Expense[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          loadedExpenses.push({
            id: doc.id,
            ...data,
            date: normalizeDateStr(data.date || ""),
          } as Expense);
        });
        setExpenses(loadedExpenses);
        AsyncStorage.setItem(`@expenses_${user.uid}`, JSON.stringify(loadedExpenses)).catch(() => null);
        setIsLoading(false);
      },
      error: async (err) => {
        console.warn("⚠️ Firestore snapshot listener failed (likely permission-denied/offline). Falling back to local cache.", err);
        try {
          const cached = await AsyncStorage.getItem(`@expenses_${user.uid}`);
          if (cached) {
            const parsed = JSON.parse(cached) as Expense[];
            const sanitized = parsed.map((e) => ({
              ...e,
              date: normalizeDateStr(e.date || ""),
            }));
            setExpenses(sanitized);
          }
        } catch (storageErr) {
          console.error("Local storage read failed:", storageErr);
        }
        setIsLoading(false);
      }
    });

    // SMS Auto-Sync Check
    const checkSMS = async () => {
      const autoSyncEnabled = await AsyncStorage.getItem("@auto_sync_enabled");
      if (autoSyncEnabled === "true") {
        try {
          const lastSyncStr = await AsyncStorage.getItem("@last_sms_sync_time");
          let minDateMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
          if (lastSyncStr) minDateMs = parseInt(lastSyncStr, 10);
          
          const parsedExpenses = await fetchAndParseSMS(minDateMs);
          if (parsedExpenses.length > 0) {
            const deletedStr = await AsyncStorage.getItem("@deleted_sms_ids");
            const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
            
            for (const e of parsedExpenses) {
              if (e.smsId) {
                if (deletedIds.includes(e.smsId)) continue;
                if (expenses.some((existing) => existing.smsId === e.smsId)) continue;
                
                await scheduleSMSApprovalNotification(e.amount, e.merchant, e.smsId);
              }
            }
            await AsyncStorage.setItem("@last_sms_sync_time", Date.now().toString());
          }
        } catch (e) {
          console.log("Auto sync check failed", e);
        }
      }
    };
    checkSMS();

    return unsubscribe;
  }, [user, isAuthReady]);

  const addExpense = useCallback(async (expense: Omit<Expense, "id" | "createdAt">) => {
    if (!user) return;
    const localId = Math.random().toString(36).substring(2, 9);
    const newExpense: Expense = { id: localId, ...expense, createdAt: Date.now() };
    
    // Optimistic UI Update
    setExpenses((prev) => [newExpense, ...prev]);
    
    try {
      const cached = await AsyncStorage.getItem(`@expenses_${user.uid}`);
      const list = cached ? JSON.parse(cached) : [];
      await AsyncStorage.setItem(`@expenses_${user.uid}`, JSON.stringify([newExpense, ...list]));
    } catch (err) {
      console.error("Local storage save failed:", err);
    }

    // Background Firestore Sync
    try {
      await addDoc(collection(db, `users/${user.uid}/expenses`), {
        ...expense,
        createdAt: newExpense.createdAt,
      });
    } catch (e) {
      console.warn("⚠️ Background Firestore Sync failed (offline or permission denied):", e);
    }
  }, [user]);

  const addMultipleExpenses = useCallback(async (newItems: Omit<Expense, "id" | "createdAt">[]) => {
    if (!user || newItems.length === 0) return;
    const timestamp = Date.now();
    const preparedItems = newItems.map((item, idx) => ({
      id: Math.random().toString(36).substring(2, 9) + idx,
      ...item,
      createdAt: timestamp + idx,
    }));

    // Optimistic UI Update
    setExpenses((prev) => [...preparedItems, ...prev]);

    try {
      const cached = await AsyncStorage.getItem(`@expenses_${user.uid}`);
      const list = cached ? JSON.parse(cached) : [];
      await AsyncStorage.setItem(`@expenses_${user.uid}`, JSON.stringify([...preparedItems, ...list]));
    } catch (err) {
      console.error("Local storage batch save failed:", err);
    }

    // Sync to Firestore in background
    try {
      const batchPromises = preparedItems.map(item => {
        const { id, ...firebaseData } = item;
        return addDoc(collection(db, `users/${user.uid}/expenses`), firebaseData);
      });
      await Promise.all(batchPromises);
    } catch (e) {
      console.warn("⚠️ Background Firestore Batch Sync failed:", e);
    }
  }, [user]);

  const deleteExpense = useCallback(async (id: string) => {
    if (!user) return;
    
    // Optimistic UI Update
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    
    try {
      const expToDelete = expenses.find(e => e.id === id);
      if (expToDelete?.smsId) {
        const deletedStr = await AsyncStorage.getItem("@deleted_sms_ids");
        const deletedIds = deletedStr ? JSON.parse(deletedStr) : [];
        if (!deletedIds.includes(expToDelete.smsId)) {
          deletedIds.push(expToDelete.smsId);
          await AsyncStorage.setItem("@deleted_sms_ids", JSON.stringify(deletedIds));
        }
      }
      
      const cached = await AsyncStorage.getItem(`@expenses_${user.uid}`);
      if (cached) {
        const list = JSON.parse(cached) as Expense[];
        await AsyncStorage.setItem(`@expenses_${user.uid}`, JSON.stringify(list.filter(e => e.id !== id)));
      }
    } catch (e) {
      console.error("Local storage deletion/blacklist failed:", e);
    }

    // Background Firestore Sync
    try {
      await deleteDoc(doc(db, `users/${user.uid}/expenses`, id));
    } catch (e) {
      console.warn("⚠️ Background Firestore deletion failed:", e);
    }
  }, [user, expenses]);

  const updateExpense = useCallback(async (id: string, updates: Partial<Omit<Expense, "id" | "createdAt">>) => {
    if (!user) return;
    
    // Optimistic UI Update
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e));
    
    try {
      const cached = await AsyncStorage.getItem(`@expenses_${user.uid}`);
      if (cached) {
        const list = JSON.parse(cached) as Expense[];
        const updatedList = list.map(e => e.id === id ? { ...e, ...updates } : e);
        await AsyncStorage.setItem(`@expenses_${user.uid}`, JSON.stringify(updatedList));
      }
    } catch (e) {
      console.error("Local storage update failed:", e);
    }

    // Background Firestore Sync
    try {
      await updateDoc(doc(db, `users/${user.uid}/expenses`, id), updates);
    } catch (e) {
      console.warn("⚠️ Background Firestore update failed:", e);
    }
  }, [user]);

  const getExpensesForDate = useCallback((date: string) => {
    return expenses.filter((e) => e.date === date);
  }, [expenses]);

  const getExpensesForMonth = useCallback((year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return expenses.filter((e) => e.date.startsWith(prefix));
  }, [expenses]);

  const getTotalForDate = useCallback((date: string) => {
    return expenses.filter((e) => e.date === date).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const getTotalForMonth = useCallback((year: number, month: number) => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return expenses.filter((e) => e.date.startsWith(prefix)).reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const getCategoryTotalsForMonth = useCallback((year: number, month: number): Record<CategoryId, number> => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const result = {} as Record<CategoryId, number>;
    CATEGORIES.forEach((c) => { result[c.id] = 0; });
    expenses.filter((e) => e.date.startsWith(prefix)).forEach((e) => {
      const catId = CATEGORIES.some((c) => c.id === e.categoryId) ? e.categoryId : "other";
      result[catId] = (result[catId] || 0) + Number(e.amount || 0);
    });
    return result;
  }, [expenses]);

  return (
    <ExpenseContext.Provider
      value={{
        expenses,
        addExpense,
        addMultipleExpenses,
        deleteExpense,
        updateExpense,
        getExpensesForDate,
        getExpensesForMonth,
        getTotalForDate,
        getTotalForMonth,
        getCategoryTotalsForMonth,
        isLoading,
      }}
    >
      {children}
    </ExpenseContext.Provider>
  );
}

export function useExpenses() {
  const ctx = useContext(ExpenseContext);
  if (!ctx) throw new Error("useExpenses must be used within ExpenseProvider");
  return ctx;
}
