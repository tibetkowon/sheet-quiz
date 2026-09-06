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

  it("정답 순서와 해설 변경은 무시하고 입력 배열은 변경하지 않습니다", () => {
    const question = {
      questionNumber: 1,
      text: "복수 정답",
      options: [{ key: "A", text: "보기 A" }, { key: "B", text: "보기 B" }],
      correctAnswers: ["B", "A"],
      explanation: "원래 해설",
    };
    Object.freeze(question.correctAnswers);
    const fingerprint = createSetFingerprint([question]);
    const changed = { ...question, correctAnswers: ["A", "B"], explanation: "수정된 해설" };
    expect(createSetFingerprint([changed])).toBe(fingerprint);
    expect(question.correctAnswers).toEqual(["B", "A"]);
  });

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

  it("상황이 없는 세트는 기존 fingerprint를 유지합니다", () => {
    expect(createSetFingerprint(base)).toBe("7e01acde");
    expect(createSetFingerprint(base.map((q) => ({ ...q, scenario: "" })))).toBe("7e01acde");
    expect(createSetFingerprint(base.map((q) => ({ ...q, scenario: undefined })))).toBe(
      "7e01acde",
    );
  });

  it("상황 추가와 변경을 반영하고 제거하면 기존 fingerprint로 돌아갑니다", () => {
    const original = createSetFingerprint(base);
    const withScenario = [{ ...base[0], scenario: "첫 번째 상황" }, base[1]];
    const fingerprint = createSetFingerprint(withScenario);
    expect(fingerprint).not.toBe(original);
    expect(createSetFingerprint([{ ...base[0], scenario: "다른 상황" }, base[1]])).not.toBe(
      fingerprint,
    );
    expect(createSetFingerprint([base[0], { ...base[1], scenario: "첫 번째 상황" }])).not.toBe(
      fingerprint,
    );
    expect(createSetFingerprint([...withScenario].reverse())).toBe(fingerprint);
    expect(createSetFingerprint([{ ...withScenario[0], scenario: "" }, base[1]])).toBe(original);
    expect(withScenario[0]).toHaveProperty("scenario", "첫 번째 상황");
  });

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
