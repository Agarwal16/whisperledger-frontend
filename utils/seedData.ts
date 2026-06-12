import AsyncStorage from "@react-native-async-storage/async-storage";
import { CategoryId, Expense } from "@/context/ExpenseContext";

const SEED_KEY = "@expense_tracker_seeded_v2";
const STORAGE_KEY = "@expense_tracker_expenses";

function e(
  day: number,
  amount: number,
  categoryId: CategoryId,
  note: string,
  idx: number = 0
): Expense {
  const date = `2026-04-${String(day).padStart(2, "0")}`;
  return {
    id: `seed_2026_04_${day}_${note.replace(/\s+/g, "_")}_${idx}`,
    amount,
    categoryId,
    note,
    date,
    createdAt: new Date(date).getTime() + idx * 1000,
  };
}

const APRIL_EXPENSES: Expense[] = [
  // 1st April
  e(1, 110, "food_outside", "Lunch", 1),
  e(1, 80, "groceries", "Bread + Paneer", 2),
  e(1, 110, "food_outside", "Coconut Water", 3),
  e(1, 132, "travel", "Auto", 4),
  e(1, 20000, "rent", "Ghar Rent", 5),
  e(1, 800, "other", "Cook", 6),
  e(1, 6900, "rent", "Sayan Rent", 7),
  e(1, 2000, "transfer", "Card Payment", 8),

  // 2nd April
  e(2, 140, "travel", "Auto", 1),
  e(2, 42, "groceries", "Kitchen", 2),
  e(2, 355, "food_outside", "Dinner", 3),

  // 3rd April
  e(3, 43, "groceries", "Dal", 1),
  e(3, 89, "groceries", "Bottle", 2),

  // 4th April
  e(4, 417, "utilities", "Maid", 1),
  e(4, 136, "utilities", "Cleaning Items", 2),
  e(4, 50, "utilities", "Plumber", 3),
  e(4, 250, "food_outside", "Biryani", 4),
  e(4, 3355, "entertainment", "Concert", 5),

  // 5th April
  e(5, 1100, "shopping", "Kitchen + Bedsheet", 1),
  e(5, 300, "food_outside", "Lunch", 2),
  e(5, 49000, "transfer", "Investment", 3),
  e(5, 7000, "transfer", "Papa", 4),

  // 6th April
  e(6, 162, "travel", "Travelling", 1),

  // 7th April
  e(7, 270, "groceries", "Kitchen", 1),
  e(7, 166, "travel", "Travelling", 2),

  // 8th April
  e(8, 170, "food_outside", "Lunch", 1),
  e(8, 163, "travel", "Travelling", 2),
  e(8, 220, "groceries", "Kitchen", 3),
  e(8, 128, "groceries", "Kitchen", 4),

  // 9th April
  e(9, 160, "travel", "Travelling", 1),
  e(9, 110, "food_outside", "Snacks", 2),

  // 10th April
  e(10, 165, "travel", "Travelling", 1),
  e(10, 1000, "other", "Cook", 2),
  e(10, 34, "groceries", "Kitchen", 3),

  // 11th April
  e(11, 334, "groceries", "Groceries", 1),
  e(11, 90, "groceries", "Kitchen", 2),
  e(11, 605, "entertainment", "Movie", 3),
  e(11, 161, "travel", "Travelling", 4),
  e(11, 150, "food_outside", "Food", 5),

  // 12th April
  e(12, 428, "travel", "Travelling", 1),
  e(12, 212, "food_outside", "Lunch", 2),
  e(12, 902, "shopping", "Face Care", 3),
  e(12, 127, "groceries", "Kitchen", 4),
  e(12, 190, "shopping", "Body Wash", 5),
  e(12, 129, "groceries", "Kitchen", 6),

  // 13th April
  e(13, 204, "travel", "Travelling", 1),
  e(13, 360, "food_outside", "Breakfast + Lunch", 2),
  e(13, 173, "groceries", "Kitchen", 3),
  e(13, 500, "utilities", "Light Bill", 4),

  // 14th April
  e(14, 910, "utilities", "Electricity", 1),
  e(14, 78, "food_outside", "Snacks", 2),
  e(14, 19000, "transfer", "Card Payment", 3),

  // 15th April
  e(15, 162, "travel", "Travelling", 1),
  e(15, 220, "entertainment", "Poker", 2),
  e(15, 112, "groceries", "Kitchen", 3),

  // 16th April
  e(16, 95, "groceries", "Kitchen", 1),
  e(16, 156, "travel", "Travelling", 2),

  // 17th April
  e(17, 173, "travel", "Travelling", 1),
  e(17, 276, "groceries", "Kitchen", 2),

  // 18th April
  e(18, 182, "entertainment", "Bat + Ball", 1),
  e(18, 372, "food_outside", "Pizza", 2),

  // 19th April
  e(19, 76, "groceries", "Kitchen", 1),
  e(19, 91, "groceries", "Kitchen", 2),
  e(19, 245, "food_outside", "Lunch", 3),
];

export async function seedAprilExpenses() {
  const already = await AsyncStorage.getItem(SEED_KEY);
  if (already) return;

  const existing = await AsyncStorage.getItem(STORAGE_KEY);
  const current: Expense[] = existing ? JSON.parse(existing) : [];

  const existingIds = new Set(current.map((exp) => exp.id));
  const toAdd = APRIL_EXPENSES.filter((exp) => !existingIds.has(exp.id));

  const merged = [...toAdd, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  await AsyncStorage.setItem(SEED_KEY, "1");
}
