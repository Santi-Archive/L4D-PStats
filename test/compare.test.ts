import { describe, expect, it } from "vitest";
import { leadOf, tally, type CompareRow } from "@/lib/compare";

/** A row with the boilerplate filled in, so each test states only its point. */
function row(p: Partial<CompareRow> & Pick<CompareRow, "better">): CompareRow {
  return {
    label: "metric",
    a: "",
    b: "",
    aValue: null,
    bValue: null,
    ...p,
  };
}

describe("which side leads", () => {
  it("gives the lead to the larger number when larger is better", () => {
    expect(leadOf(row({ better: "high", aValue: 10, bValue: 4 }))).toBe("a");
    expect(leadOf(row({ better: "high", aValue: 4, bValue: 10 }))).toBe("b");
  });

  // The rule that actually matters: deaths, incaps and friendly fire are all
  // rows where the bigger number is the worse player, and a table that
  // awarded them to the larger value would look entirely normal while being
  // backwards.
  it("gives the lead to the smaller number when smaller is better", () => {
    expect(leadOf(row({ better: "low", aValue: 2, bValue: 9 }))).toBe("a");
    expect(leadOf(row({ better: "low", aValue: 9, bValue: 2 }))).toBe("b");
  });

  it("ties a row with no better direction, whatever the numbers", () => {
    expect(leadOf(row({ better: "none", aValue: 999, bValue: 1 }))).toBe("tie");
  });

  it("ties equal values rather than favouring the first side", () => {
    expect(leadOf(row({ better: "high", aValue: 7, bValue: 7 }))).toBe("tie");
    expect(leadOf(row({ better: "low", aValue: 0, bValue: 0 }))).toBe("tie");
  });

  // A null is "no such value", not a low one. A player who has never fired a
  // shot has no accuracy; they have not lost the accuracy row.
  it("never awards a lead against a missing value", () => {
    expect(leadOf(row({ better: "high", aValue: 5, bValue: null }))).toBe("tie");
    expect(leadOf(row({ better: "high", aValue: null, bValue: 5 }))).toBe("tie");
    expect(leadOf(row({ better: "low", aValue: null, bValue: null }))).toBe(
      "tie",
    );
  });

  it("treats zero as a real value, not a missing one", () => {
    expect(leadOf(row({ better: "low", aValue: 0, bValue: 3 }))).toBe("a");
    expect(leadOf(row({ better: "high", aValue: 0, bValue: 3 }))).toBe("b");
  });
});

describe("tally", () => {
  it("counts led rows per side and ignores ties", () => {
    const t = tally([
      {
        label: "one",
        rows: [
          row({ better: "high", aValue: 5, bValue: 1 }), // a
          row({ better: "low", aValue: 5, bValue: 1 }), // b
          row({ better: "none", aValue: 5, bValue: 1 }), // tie
        ],
      },
      {
        label: "two",
        rows: [
          row({ better: "high", aValue: 2, bValue: 2 }), // tie
          row({ better: "high", aValue: 9, bValue: 2 }), // a
          row({ better: "high", aValue: null, bValue: 2 }), // tie
        ],
      },
    ]);
    expect(t).toEqual({ a: 2, b: 1 });
  });

  it("is zero on both sides for an empty comparison", () => {
    expect(tally([])).toEqual({ a: 0, b: 0 });
  });
});
