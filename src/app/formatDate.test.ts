import { describe, expect, it } from "vitest";
import { formatIsoDate } from "./formatDate";

describe("formatIsoDate", () => {
  it("formats a timestamp as the local calendar date in YYYY-MM-DD", () => {
    const iso = new Date(2026, 10, 16, 15, 30).toISOString();
    expect(formatIsoDate(iso)).toBe("2026-11-16");
  });

  it("zero-pads single-digit months and days", () => {
    const iso = new Date(2026, 0, 5, 12, 0).toISOString();
    expect(formatIsoDate(iso)).toBe("2026-01-05");
  });

  it("returns the input unchanged when it is not a valid date", () => {
    expect(formatIsoDate("not-a-date")).toBe("not-a-date");
  });
});
