const HEADER_ALIASES: Record<string, string> = {
  번호: "question_no",
  question_no: "question_no",
  분류: "category",
  영역: "category",
  category: "category",
  난이도: "difficulty",
  difficulty: "difficulty",
  유형: "question_type",
  question_type: "question_type",
  상황: "scenario",
  scenario: "scenario",
  문제: "question",
  question: "question",
  "보기 A": "option_a",
  option_a: "option_a",
  "보기 B": "option_b",
  option_b: "option_b",
  "보기 C": "option_c",
  option_c: "option_c",
  "보기 D": "option_d",
  option_d: "option_d",
  "보기 E": "option_e",
  option_e: "option_e",
  "보기 F": "option_f",
  option_f: "option_f",
  정답: "correct_answers",
  correct_answers: "correct_answers",
  "정답 개수": "required_answer_count",
  required_answer_count: "required_answer_count",
  해설: "explanation",
  explanation: "explanation",
  "보기 A 해설": "option_a_explanation",
  option_a_explanation: "option_a_explanation",
  "보기 B 해설": "option_b_explanation",
  option_b_explanation: "option_b_explanation",
  "보기 C 해설": "option_c_explanation",
  option_c_explanation: "option_c_explanation",
  "보기 D 해설": "option_d_explanation",
  option_d_explanation: "option_d_explanation",
  "보기 E 해설": "option_e_explanation",
  option_e_explanation: "option_e_explanation",
  "보기 F 해설": "option_f_explanation",
  option_f_explanation: "option_f_explanation",
  "핵심 키워드": "key_points",
  key_points: "key_points",
  "관련 주제": "related_topics",
  related_topics: "related_topics",
  "참고 URL": "source_url",
  source_url: "source_url",
  상태: "status",
  status: "status",
  "세트 ID": "set_id",
  set_id: "set_id",
  출제일: "published_at",
  published_at: "published_at",
};

export const REQUIRED_HEADER_KEYS = [
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
] as const;

export function buildHeaderIndex(headerRow: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  headerRow.forEach((raw, i) => {
    const alias = raw.trim();
    if (!Object.prototype.hasOwnProperty.call(HEADER_ALIASES, alias)) return;
    const key = HEADER_ALIASES[alias];
    if (key && !(key in index)) {
      index[key] = i;
    }
  });
  return index;
}
