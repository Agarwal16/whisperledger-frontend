/**
 * Unit tests for expense calculation utilities.
 * Tests monthly totals, category aggregation, and spending projection math.
 */

import type { Expense, CategoryId } from "../context/ExpenseContext";

// ─── Helper to build test expenses ────────────────────────────────────────────
function makeExpense(
  id: string,
  amount: number,
  categoryId: CategoryId,
  date: string
): Expense {
  return {
    id,
    amount,
    categoryId,
    paymentMode: "upi",
    note: "test",
    date,
    createdAt: new Date(date).getTime(),
  };
}

// ─── Expense calculation helpers (pure functions) ─────────────────────────────
function getTotalForMonth(expenses: Expense[], year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return expenses
    .filter((e) => e.date.startsWith(prefix))
    .reduce((sum, e) => sum + Number(e.amount || 0), 0);
}

function getCategoryTotalsForMonth(
  expenses: Expense[],
  year: number,
  month: number
): Record<CategoryId, number> {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const result: Partial<Record<CategoryId, number>> = {};
  expenses
    .filter((e) => e.date.startsWith(prefix))
    .forEach((e) => {
      result[e.categoryId] = (result[e.categoryId] || 0) + Number(e.amount);
    });
  return result as Record<CategoryId, number>;
}

function projectMonthlyTotal(
  expenses: Expense[],
  year: number,
  month: number,
  dayOfMonth: number,
  daysInMonth: number
): number {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthExpenses = expenses.filter((e) => e.date.startsWith(prefix));
  const spentSoFar = monthExpenses.reduce((s, e) => s + Number(e.amount), 0);
  if (dayOfMonth === 0) return 0;
  const dailyRate = spentSoFar / dayOfMonth;
  return dailyRate * daysInMonth;
}

// ─── Tests ──────────────────────────────────────────────────────────────────
const testExpenses: Expense[] = [
  makeExpense("1", 500, "food_outside", "2025-01-05"),
  makeExpense("2", 1200, "groceries", "2025-01-10"),
  makeExpense("3", 800, "travel", "2025-01-15"),
  makeExpense("4", 3000, "rent", "2025-01-01"),
  makeExpense("5", 350, "food_outside", "2025-01-20"),
  makeExpense("6", 200, "shopping", "2025-02-01"),
  makeExpense("7", 999, "subscriptions", "2025-02-05"),
  makeExpense("8", 100, "health", "2025-02-10"),
];

describe("getTotalForMonth", () => {
  test("calculates January total correctly", () => {
    const total = getTotalForMonth(testExpenses, 2025, 1);
    expect(total).toBe(500 + 1200 + 800 + 3000 + 350); // = 5850
  });

  test("calculates February total correctly", () => {
    const total = getTotalForMonth(testExpenses, 2025, 2);
    expect(total).toBe(200 + 999 + 100); // = 1299
  });

  test("returns 0 for a month with no expenses", () => {
    const total = getTotalForMonth(testExpenses, 2025, 3);
    expect(total).toBe(0);
  });

  test("returns 0 for empty expenses array", () => {
    const total = getTotalForMonth([], 2025, 1);
    expect(total).toBe(0);
  });

  test("does not include expenses from other months", () => {
    const total = getTotalForMonth(testExpenses, 2025, 1);
    // Should not include Feb expenses (999, 200, 100)
    expect(total).not.toContain(999);
    expect(total).toBe(5850);
  });
});

describe("getCategoryTotalsForMonth", () => {
  test("returns correct totals per category for January", () => {
    const totals = getCategoryTotalsForMonth(testExpenses, 2025, 1);
    expect(totals.food_outside).toBe(500 + 350); // = 850
    expect(totals.groceries).toBe(1200);
    expect(totals.travel).toBe(800);
    expect(totals.rent).toBe(3000);
  });

  test("categories with no expenses are undefined (not 0)", () => {
    const totals = getCategoryTotalsForMonth(testExpenses, 2025, 1);
    expect(totals.entertainment).toBeUndefined();
  });

  test("returns empty object for month with no expenses", () => {
    const totals = getCategoryTotalsForMonth(testExpenses, 2025, 6);
    expect(Object.keys(totals).length).toBe(0);
  });
});

describe("projectMonthlyTotal — Spending Projection", () => {
  test("projects correctly when halfway through month", () => {
    // ₹3000 spent in 15 days → ₹6000 projected for 30 days
    const projected = projectMonthlyTotal(testExpenses, 2025, 1, 15, 30);
    expect(projected).toBeCloseTo(5850 * (30 / 15), 0); // 11700
  });

  test("returns 0 when dayOfMonth is 0 (avoid division by zero)", () => {
    const projected = projectMonthlyTotal(testExpenses, 2025, 1, 0, 31);
    expect(projected).toBe(0);
  });

  test("returns actual total when full month is complete", () => {
    // dayOfMonth == daysInMonth → rate * daysInMonth == spentSoFar
    const projected = projectMonthlyTotal(testExpenses, 2025, 1, 31, 31);
    expect(projected).toBeCloseTo(5850, 0);
  });

  test("returns 0 for month with no expenses", () => {
    const projected = projectMonthlyTotal(testExpenses, 2025, 6, 15, 30);
    expect(projected).toBe(0);
  });
});
