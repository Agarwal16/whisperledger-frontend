import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { db } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { CategoryId, CATEGORIES, useExpenses } from "./ExpenseContext";
import { sendBudgetAlert } from "@/utils/notifications";

export interface Budget {
  id: string;
  categoryId: CategoryId;
  monthlyLimit: number; // in INR
  month: string; // "YYYY-MM" format
}

export interface BudgetStatus extends Budget {
  spent: number;
  remaining: number;
  percentage: number;
  status: "safe" | "warning" | "critical" | "exceeded";
}

interface BudgetContextType {
  budgets: Budget[];
  budgetStatuses: BudgetStatus[];
  setBudget: (categoryId: CategoryId, monthlyLimit: number, month: string) => Promise<void>;
  deleteBudget: (categoryId: CategoryId, month: string) => Promise<void>;
  getBudgetForCategory: (categoryId: CategoryId, month: string) => Budget | null;
  checkAndAlertBudgets: () => Promise<void>;
  isLoading: boolean;
}

const BudgetContext = createContext<BudgetContextType | null>(null);

const BUDGETS_CACHE_KEY = (uid: string) => `@budgets_${uid}`;
const ALERTED_KEY = (uid: string, month: string) => `@budget_alerted_${uid}_${month}`;

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady } = useAuth();
  const { getCategoryTotalsForMonth } = useExpenses();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load budgets from cache/Firestore
  useEffect(() => {
    if (!isAuthReady) {
      setIsLoading(true);
      return;
    }

    if (!user) {
      setBudgets([]);
      setIsLoading(false);
      return;
    }

    const loadBudgets = async () => {
      // First load from cache for instant display
      try {
        const cached = await AsyncStorage.getItem(BUDGETS_CACHE_KEY(user.uid));
        if (cached) setBudgets(JSON.parse(cached));
      } catch (e) {
        console.warn("[BudgetContext] Cache load failed:", e);
      }
      setIsLoading(false);

      // Then sync from Firestore in background
      try {
        const snap = await getDocs(
          collection(db, `users/${user.uid}/budgets`)
        );
        const firestoreBudgets: Budget[] = [];
        snap.forEach((d) => {
          firestoreBudgets.push({ id: d.id, ...d.data() } as Budget);
        });
        setBudgets(firestoreBudgets);
        await AsyncStorage.setItem(
          BUDGETS_CACHE_KEY(user.uid),
          JSON.stringify(firestoreBudgets)
        );
      } catch (e) {
        console.warn("[BudgetContext] Firestore load failed:", e);
      }
    };

    loadBudgets();
  }, [user, isAuthReady]);

  const setBudget = useCallback(
    async (categoryId: CategoryId, monthlyLimit: number, month: string) => {
      if (!user) return;
      const id = `${categoryId}_${month}`;
      const budget: Budget = { id, categoryId, monthlyLimit, month };

      // Optimistic update
      setBudgets((prev) => {
        const filtered = prev.filter((b) => b.id !== id);
        return [...filtered, budget];
      });

      // Persist locally
      try {
        const cached = await AsyncStorage.getItem(BUDGETS_CACHE_KEY(user.uid));
        const list: Budget[] = cached ? JSON.parse(cached) : [];
        const filtered = list.filter((b) => b.id !== id);
        await AsyncStorage.setItem(
          BUDGETS_CACHE_KEY(user.uid),
          JSON.stringify([...filtered, budget])
        );
      } catch (e) {
        console.warn("[BudgetContext] Local save failed:", e);
      }

      // Sync to Firestore
      try {
        await setDoc(doc(db, `users/${user.uid}/budgets`, id), budget);
      } catch (e) {
        console.warn("[BudgetContext] Firestore save failed:", e);
      }
    },
    [user]
  );

  const deleteBudget = useCallback(
    async (categoryId: CategoryId, month: string) => {
      if (!user) return;
      const id = `${categoryId}_${month}`;

      setBudgets((prev) => prev.filter((b) => b.id !== id));

      try {
        const cached = await AsyncStorage.getItem(BUDGETS_CACHE_KEY(user.uid));
        if (cached) {
          const list: Budget[] = JSON.parse(cached);
          await AsyncStorage.setItem(
            BUDGETS_CACHE_KEY(user.uid),
            JSON.stringify(list.filter((b) => b.id !== id))
          );
        }
      } catch (e) {
        console.warn("[BudgetContext] Local delete failed:", e);
      }

      try {
        await deleteDoc(doc(db, `users/${user.uid}/budgets`, id));
      } catch (e) {
        console.warn("[BudgetContext] Firestore delete failed:", e);
      }
    },
    [user]
  );

  const getBudgetForCategory = useCallback(
    (categoryId: CategoryId, month: string): Budget | null => {
      return budgets.find((b) => b.categoryId === categoryId && b.month === month) ?? null;
    },
    [budgets]
  );

  // Compute budget statuses for current month
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const categoryTotals = getCategoryTotalsForMonth(
    now.getFullYear(),
    now.getMonth() + 1
  );

  const budgetStatuses: BudgetStatus[] = budgets
    .filter((b) => b.month === currentMonth)
    .map((b) => {
      const spent = categoryTotals[b.categoryId] || 0;
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

  const [isAlertedLoaded, setIsAlertedLoaded] = useState(false);
  const alertedInMemory = React.useRef<Record<string, number[]>>({});

  // Sync in-memory alerted state with AsyncStorage on startup or user change
  useEffect(() => {
    if (!user) {
      alertedInMemory.current = {};
      setIsAlertedLoaded(false);
      return;
    }
    setIsAlertedLoaded(false);
    AsyncStorage.getItem(ALERTED_KEY(user.uid, currentMonth))
      .then((raw) => {
        if (raw) {
          alertedInMemory.current = JSON.parse(raw);
        } else {
          alertedInMemory.current = {};
        }
        setIsAlertedLoaded(true);
      })
      .catch(() => {
        alertedInMemory.current = {};
        setIsAlertedLoaded(true);
      });
  }, [user?.uid, currentMonth]);

  // Check and fire push alerts at threshold milestones (50%, 80%, 100%)
  const checkAndAlertBudgets = useCallback(async () => {
    if (!user) return;
    const alertedKey = ALERTED_KEY(user.uid, currentMonth);
    
    // Copy the in-memory state to avoid async race conditions
    const alerted = { ...alertedInMemory.current };
    let hasChanges = false;

    for (const status of budgetStatuses) {
      const prev = alerted[status.categoryId] || [];
      const thresholds = [50, 80, 100];

      // A. Re-arm thresholds: if percentage drops below a previously triggered threshold, remove it
      const originalLength = prev.length;
      const updatedPrev = prev.filter((t) => status.percentage >= t);
      if (updatedPrev.length !== originalLength) {
        alerted[status.categoryId] = updatedPrev;
        hasChanges = true;
      }

      // B. Identify all new thresholds that are crossed but not yet alerted
      const crossedNewThresholds = thresholds.filter(
        (t) => status.percentage >= t && !updatedPrev.includes(t)
      );

      if (crossedNewThresholds.length > 0) {
        // Only trigger one notification for the HIGHEST crossed milestone (avoid multiple alerts)
        const highestNewThreshold = Math.max(...crossedNewThresholds);
        const cat = CATEGORIES.find((c) => c.id === status.categoryId);
        await sendBudgetAlert(
          cat?.label || status.categoryId,
          highestNewThreshold,
          status.remaining,
          status.monthlyLimit
        );

        // Mark all crossed thresholds as alerted so we don't alert them again
        crossedNewThresholds.forEach((t) => {
          if (!updatedPrev.includes(t)) {
            updatedPrev.push(t);
          }
        });
        alerted[status.categoryId] = updatedPrev;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      alertedInMemory.current = alerted;
      try {
        await AsyncStorage.setItem(alertedKey, JSON.stringify(alerted));
      } catch (e) {
        // ignore
      }
    }
  }, [user, budgetStatuses, currentMonth]);

  // Auto-check on budget status changes
  useEffect(() => {
    if (user && isAlertedLoaded && budgetStatuses.length > 0) {
      checkAndAlertBudgets();
    }
  }, [isAlertedLoaded, JSON.stringify(budgetStatuses.map((s) => `${s.categoryId}:${s.percentage.toFixed(0)}`))]);

  return (
    <BudgetContext.Provider
      value={{
        budgets,
        budgetStatuses,
        setBudget,
        deleteBudget,
        getBudgetForCategory,
        checkAndAlertBudgets,
        isLoading,
      }}
    >
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudgets() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useBudgets must be used within BudgetProvider");
  return ctx;
}
