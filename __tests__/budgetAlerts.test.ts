/**
 * Unit tests for budget threshold calculation and alert logic.
 */

describe("Budget Threshold Calculations", () => {
  function computeStatus(spent: number, limit: number) {
    const remaining = Math.max(0, limit - spent);
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    const status =
      percentage >= 100
        ? "exceeded"
        : percentage >= 80
        ? "critical"
        : percentage >= 50
        ? "warning"
        : "safe";
    return { spent, remaining, percentage, status };
  }

  // ─── Status Classification ─────────────────────────────────────────────
  test("returns safe when below 50%", () => {
    const s = computeStatus(1000, 5000);
    expect(s.status).toBe("safe");
    expect(s.percentage).toBe(20);
  });

  test("returns warning when at exactly 50%", () => {
    const s = computeStatus(2500, 5000);
    expect(s.status).toBe("warning");
    expect(s.percentage).toBe(50);
  });

  test("returns warning between 50% and 80%", () => {
    const s = computeStatus(3000, 5000);
    expect(s.status).toBe("warning");
    expect(s.percentage).toBe(60);
  });

  test("returns critical at exactly 80%", () => {
    const s = computeStatus(4000, 5000);
    expect(s.status).toBe("critical");
    expect(s.percentage).toBe(80);
  });

  test("returns critical between 80% and 100%", () => {
    const s = computeStatus(4500, 5000);
    expect(s.status).toBe("critical");
    expect(s.percentage).toBe(90);
  });

  test("returns exceeded at exactly 100%", () => {
    const s = computeStatus(5000, 5000);
    expect(s.status).toBe("exceeded");
    expect(s.percentage).toBe(100);
  });

  test("returns exceeded when over 100%", () => {
    const s = computeStatus(6000, 5000);
    expect(s.status).toBe("exceeded");
    expect(s.percentage).toBe(120);
  });

  // ─── Remaining Amount ─────────────────────────────────────────────────
  test("calculates remaining amount correctly", () => {
    const s = computeStatus(3000, 5000);
    expect(s.remaining).toBe(2000);
  });

  test("remaining is 0 when exceeded (not negative)", () => {
    const s = computeStatus(7000, 5000);
    expect(s.remaining).toBe(0);
  });

  test("remaining is exact limit when nothing spent", () => {
    const s = computeStatus(0, 5000);
    expect(s.remaining).toBe(5000);
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────
  test("handles zero limit gracefully (no division by zero)", () => {
    const s = computeStatus(100, 0);
    expect(s.percentage).toBe(0);
    expect(s.status).toBe("safe");
  });

  test("handles zero spent correctly", () => {
    const s = computeStatus(0, 1000);
    expect(s.status).toBe("safe");
    expect(s.percentage).toBe(0);
    expect(s.remaining).toBe(1000);
  });

  // ─── Threshold Alert Trigger Logic ────────────────────────────────────
  test("should alert at 50% if not previously alerted", () => {
    const previouslyAlerted: number[] = [];
    const percentage = 55;
    const thresholds = [50, 80, 100];
    const toAlert = thresholds.filter(
      (t) => percentage >= t && !previouslyAlerted.includes(t)
    );
    expect(toAlert).toEqual([50]);
  });

  test("should alert at 80% without re-alerting 50%", () => {
    const previouslyAlerted: number[] = [50];
    const percentage = 82;
    const thresholds = [50, 80, 100];
    const toAlert = thresholds.filter(
      (t) => percentage >= t && !previouslyAlerted.includes(t)
    );
    expect(toAlert).toEqual([80]);
  });

  test("should alert at 100% without re-alerting lower thresholds", () => {
    const previouslyAlerted: number[] = [50, 80];
    const percentage = 100;
    const thresholds = [50, 80, 100];
    const toAlert = thresholds.filter(
      (t) => percentage >= t && !previouslyAlerted.includes(t)
    );
    expect(toAlert).toEqual([100]);
  });

  test("should not alert if all thresholds already sent", () => {
    const previouslyAlerted: number[] = [50, 80, 100];
    const percentage = 115;
    const thresholds = [50, 80, 100];
    const toAlert = thresholds.filter(
      (t) => percentage >= t && !previouslyAlerted.includes(t)
    );
    expect(toAlert).toEqual([]);
  });
});
