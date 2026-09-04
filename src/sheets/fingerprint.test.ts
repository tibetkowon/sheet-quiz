import { describe, expect, it } from "vitest";
import { createAttemptId, createQuestionId, createSetFingerprint } from "./fingerprint";

describe("createQuestionId", () => {
  it("is stable for the same inputs", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    const b = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    expect(a).toBe(b);
  });

  it("changes when the question text changes", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "EC2란 무엇인가?");
    const b = createQuestionId("sheet-1", "tab-1", 3, "S3란 무엇인가?");
    expect(a).not.toBe(b);
  });

  it("changes when the question number changes", () => {
    const a = createQuestionId("sheet-1", "tab-1", 3, "동일한 문제");
    const b = createQuestionId("sheet-1", "tab-1", 4, "동일한 문제");
    expect(a).not.toBe(b);
  });

  it("does not depend on row order alone (two different sheets stay distinct)", () => {
    const a = createQuestionId("sheet-1", "tab-1", 1, "문제");
    const b = createQuestionId("sheet-2", "tab-1", 1, "문제");
    expect(a).not.toBe(b);
  });
});

describe("createSetFingerprint", () => {
  const base = [
    {
      questionNumber: 1,
      text: "문제 1",
      options: [
        { key: "A", text: "보기 A" },
        { key: "B", text: "보기 B" },
      ],
      correctAnswers: ["A"],
    },
    {
      questionNumber: 2,
      text: "문제 2",
      options: [
        { key: "A", text: "보기 A" },
        { key: "B", text: "보기 B" },
      ],
      correctAnswers: ["B"],
    },
  ];

  it("is stable regardless of question array order", () => {
    const forward = createSetFingerprint(base);
    const reversed = createSetFingerprint([...base].reverse());
    expect(forward).toBe(reversed);
  });

  it("changes when a correct answer changes", () => {
    const original = createSetFingerprint(base);
    const changed = createSetFingerprint([
      { ...base[0], correctAnswers: ["B"] },
      base[1],
    ]);
    expect(original).not.toBe(changed);
  });

  it("changes when option text changes", () => {
    const original = createSetFingerprint(base);
    const changed = createSetFingerprint([
      { ...base[0], options: [{ key: "A", text: "변경된 보기" }, base[0].options[1]] },
      base[1],
    ]);
    expect(original).not.toBe(changed);
  });
});

describe("createAttemptId", () => {
  it("is stable for the same inputs", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    expect(a).toBe(b);
  });

  it("changes when the fingerprint changes", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-1", "sheet-1", "0", "fp-2");
    expect(a).not.toBe(b);
  });

  it("keeps different users' attempts on the same sheet separate", () => {
    const a = createAttemptId("user-1", "sheet-1", "0", "fp-1");
    const b = createAttemptId("user-2", "sheet-1", "0", "fp-1");
    expect(a).not.toBe(b);
  });
});
