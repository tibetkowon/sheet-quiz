import { describe, expect, it } from "vitest";
import { buildHeaderIndex, REQUIRED_HEADER_KEYS } from "./headerMap";

describe("buildHeaderIndex", () => {
  it.each(["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"])(
    "상속된 속성 %s를 헤더 별칭으로 허용하지 않습니다",
    (header) => {
      expect(buildHeaderIndex(["번호", ` ${header} `, "문제"])).toEqual({
        question_no: 0,
        question: 2,
      });
    },
  );

  it("같은 필드의 별칭이 중복되면 첫 번째 열을 사용합니다", () => {
    expect(buildHeaderIndex(["문제", "question", "영역", "분류", "category"])).toEqual({
      question: 0, category: 2,
    });
  });

  it("maps Korean headers to normalized keys", () => {
    const index = buildHeaderIndex([
      "번호",
      "분류",
      "난이도",
      "유형",
      "문제",
      "보기 A",
      "보기 B",
      "보기 C",
      "보기 D",
      "정답",
      "해설",
    ]);
    expect(index).toEqual({
      question_no: 0,
      category: 1,
      difficulty: 2,
      question_type: 3,
      question: 4,
      option_a: 5,
      option_b: 6,
      option_c: 7,
      option_d: 8,
      correct_answers: 9,
      explanation: 10,
    });
  });

  it("maps English aliases to the same normalized keys", () => {
    const index = buildHeaderIndex([
      "question_no",
      "category",
      "difficulty",
      "question_type",
      "question",
      "option_a",
      "option_b",
      "correct_answers",
      "explanation",
    ]);
    expect(index.question_no).toBe(0);
    expect(index.category).toBe(1);
  });

  it("does not depend on header order", () => {
    const index = buildHeaderIndex(["해설", "문제", "번호"]);
    expect(index).toEqual({ explanation: 0, question: 1, question_no: 2 });
  });

  it("trims whitespace and ignores unknown headers", () => {
    const index = buildHeaderIndex([" 번호 ", "출처(무시)", "문제"]);
    expect(index).toEqual({ question_no: 0, question: 2 });
  });

  it("maps every optional and required header alias", () => {
    const index = buildHeaderIndex([
      "세트 ID",
      "출제일",
      "상황",
      "보기 E",
      "보기 F",
      "정답 개수",
      "보기 A 해설",
      "보기 B 해설",
      "보기 C 해설",
      "보기 D 해설",
      "보기 E 해설",
      "보기 F 해설",
      "핵심 키워드",
      "관련 주제",
      "참고 URL",
      "상태",
      "영역",
    ]);
    expect(index).toEqual({
      set_id: 0,
      published_at: 1,
      scenario: 2,
      option_e: 3,
      option_f: 4,
      required_answer_count: 5,
      option_a_explanation: 6,
      option_b_explanation: 7,
      option_c_explanation: 8,
      option_d_explanation: 9,
      option_e_explanation: 10,
      option_f_explanation: 11,
      key_points: 12,
      related_topics: 13,
      source_url: 14,
      status: 15,
      category: 16,
    });
  });

  it("lists the required header keys per the spec", () => {
    expect(REQUIRED_HEADER_KEYS).toEqual([
      "question_no",
      "category",
      "difficulty",
      "question_type",
      "question",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_answers",
      "explanation",
    ]);
  });
});
