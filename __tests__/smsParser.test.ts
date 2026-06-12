/**
 * Unit tests for the enhanced SMS categorization engine.
 * Tests realistic Indian bank SMS formats from HDFC, SBI, ICICI, Axis, GPay, PhonePe.
 */

import { classifyCategory, cleanMerchantName, classifyCategoryWithCorrections } from "../utils/smsParser";

describe("classifyCategory — Enhanced AI Classifier", () => {
  // ─── Food & Dining ───────────────────────────────────────────────────────
  test("classifies Swiggy order correctly", () => {
    expect(classifyCategory("Rs.349 debited to Swiggy")).toBe("food_outside");
  });

  test("classifies Zomato correctly", () => {
    expect(classifyCategory("paid to Zomato via UPI")).toBe("food_outside");
  });

  test("classifies Starbucks correctly", () => {
    expect(classifyCategory("₹480 spent at Starbucks Coffee")).toBe("food_outside");
  });

  test("classifies restaurant correctly", () => {
    expect(classifyCategory("dinner at restaurant Rs 1200 paid")).toBe("food_outside");
  });

  // ─── Groceries ──────────────────────────────────────────────────────────
  test("classifies BigBasket correctly", () => {
    expect(classifyCategory("₹2100 paid to bigbasket")).toBe("groceries");
  });

  test("classifies Blinkit correctly", () => {
    expect(classifyCategory("Rs 456 debited for blinkit order")).toBe("groceries");
  });

  test("classifies Zepto correctly", () => {
    expect(classifyCategory("₹299 paid to zepto")).toBe("groceries");
  });

  test("classifies supermarket correctly", () => {
    expect(classifyCategory("purchase at supermarket dmart")).toBe("groceries");
  });

  // ─── Subscriptions ─────────────────────────────────────────────────────
  test("classifies Netflix correctly (highest weight)", () => {
    expect(classifyCategory("Rs 649 debited for netflix subscription")).toBe("subscriptions");
  });

  test("classifies Spotify correctly", () => {
    expect(classifyCategory("₹119 paid to spotify premium")).toBe("subscriptions");
  });

  test("classifies Amazon Prime correctly", () => {
    expect(classifyCategory("₹1499 debited for amazon prime subscription")).toBe("subscriptions");
  });

  // ─── Travel ────────────────────────────────────────────────────────────
  test("classifies Uber correctly", () => {
    expect(classifyCategory("₹245 paid to uber")).toBe("travel");
  });

  test("classifies IRCTC correctly", () => {
    expect(classifyCategory("Rs 1800 debited for irctc train ticket")).toBe("travel");
  });

  test("classifies Ola correctly", () => {
    expect(classifyCategory("₹180 paid to olacabs")).toBe("travel");
  });

  // ─── Fuel (higher priority than travel) ────────────────────────────────
  test("classifies petrol (fuel) correctly with higher priority than travel", () => {
    expect(classifyCategory("Rs 2000 paid at HP petrol pump")).toBe("fuel");
  });

  test("classifies diesel correctly", () => {
    expect(classifyCategory("₹3500 for diesel at HPCL")).toBe("fuel");
  });

  // ─── Investment ─────────────────────────────────────────────────────────
  test("classifies Zerodha (invest) correctly", () => {
    expect(classifyCategory("₹5000 transferred to zerodha")).toBe("invest");
  });

  test("classifies SIP correctly", () => {
    expect(classifyCategory("₹2000 auto-debited for sip mutual fund")).toBe("invest");
  });

  test("classifies Groww correctly", () => {
    expect(classifyCategory("₹10000 paid to groww equity")).toBe("invest");
  });

  // ─── Health ─────────────────────────────────────────────────────────────
  test("classifies pharmacy correctly", () => {
    expect(classifyCategory("₹850 paid at apollo pharmacy")).toBe("health");
  });

  test("classifies pharmeasy correctly", () => {
    expect(classifyCategory("₹340 debited for pharmeasy")).toBe("health");
  });

  // ─── Shopping ───────────────────────────────────────────────────────────
  test("classifies Amazon (shopping) correctly", () => {
    expect(classifyCategory("₹1299 paid to amazon")).toBe("shopping");
  });

  test("classifies Flipkart correctly", () => {
    expect(classifyCategory("₹3500 debited for flipkart order")).toBe("shopping");
  });

  // ─── Rent ───────────────────────────────────────────────────────────────
  test("classifies rent correctly (high priority)", () => {
    expect(classifyCategory("₹18000 transferred for rent payment")).toBe("rent");
  });

  // ─── Education ──────────────────────────────────────────────────────────
  test("classifies school fees correctly", () => {
    expect(classifyCategory("₹25000 for school fees payment")).toBe("education");
  });

  test("classifies Udemy correctly", () => {
    expect(classifyCategory("₹499 paid to udemy course")).toBe("education");
  });

  // ─── Utilities ──────────────────────────────────────────────────────────
  test("classifies electricity bill correctly", () => {
    expect(classifyCategory("₹1200 paid for electricity bescom")).toBe("utilities");
  });

  test("classifies Jio internet correctly", () => {
    expect(classifyCategory("₹599 recharge for jio fiber wifi")).toBe("utilities");
  });

  // ─── Entertainment ──────────────────────────────────────────────────────
  test("classifies movie tickets correctly", () => {
    expect(classifyCategory("₹800 for movie pvr cinema tickets")).toBe("entertainment");
  });

  test("classifies BookMyShow correctly", () => {
    expect(classifyCategory("₹1600 paid to bookmyshow")).toBe("entertainment");
  });

  // ─── Default (other) ─────────────────────────────────────────────────────
  test("returns other for unrecognized text", () => {
    expect(classifyCategory("payment processed successfully")).toBe("other");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Merchant Name Cleanup Tests
// ─────────────────────────────────────────────────────────────────────────────
describe("cleanMerchantName — Enhanced Pipeline", () => {
  test("strips VPA email format", () => {
    const result = cleanMerchantName("q1234567890@ybl");
    expect(result).not.toContain("@");
  });

  test("strips GPAY prefix and maps AMZN to Amazon", () => {
    const result = cleanMerchantName("GPAY*AMZN*PAYMENTS");
    expect(result).toBe("Amazon");
  });

  test("strips UPI/ prefix", () => {
    const result = cleanMerchantName("UPI/SWIGGY/ORDER123");
    expect(result).toBe("Swiggy");
  });

  test("maps FLIPKART correctly", () => {
    const result = cleanMerchantName("FLIPKART INTERNET");
    expect(result).toBe("Flipkart");
  });

  test("maps STARBUCKS correctly", () => {
    const result = cleanMerchantName("*STARBUCKS*INDIA*");
    expect(result).toBe("Starbucks");
  });

  test("maps IRCTC correctly", () => {
    const result = cleanMerchantName("IRCTC PAYMENT");
    expect(result).toBe("IRCTC");
  });

  test("title-cases unknown merchants", () => {
    const result = cleanMerchantName("local kirana store");
    expect(result).toBe("Local Kirana Store");
  });

  test("handles empty string gracefully", () => {
    const result = cleanMerchantName("");
    expect(result).toBe("Unknown Merchant");
  });

  test("truncates very long merchant names", () => {
    const result = cleanMerchantName("This Is A Very Long Merchant Name That Goes Beyond Thirty Characters");
    expect(result.length).toBeLessThanOrEqual(32); // 30 chars + "…"
  });

  test("strips numeric ref numbers from merchant", () => {
    const result = cleanMerchantName("MERCHANT 1234567890");
    expect(result).not.toMatch(/\d{6,}/);
  });
});
