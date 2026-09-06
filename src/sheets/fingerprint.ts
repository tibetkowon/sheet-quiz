function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createQuestionId(
  spreadsheetId: string,
  sheetTabId: string,
  questionNumber: number,
  text: string,
): string {
  return `${spreadsheetId}:${sheetTabId}:${questionNumber}:${fnv1aHash(text)}`;
}

interface FingerprintQuestion {
  questionNumber: number;
  text: string;
  scenario?: string;
  options: Array<{ key: string; text: string }>;
  correctAnswers: string[];
}

export function createSetFingerprint(questions: FingerprintQuestion[]): string {
  const material = questions
    .slice()
    .sort((a, b) => a.questionNumber - b.questionNumber)
    .map((q) =>
      [
        q.questionNumber,
        q.text,
        ...(q.scenario ? [q.scenario] : []),
        q.options.map((o) => `${o.key}:${o.text}`).join("|"),
        q.correctAnswers.slice().sort().join(","),
      ].join(""),
    )
    .join("");
  return fnv1aHash(material);
}

export function createAttemptId(
  googleUserId: string,
  spreadsheetId: string,
  sheetTabId: string,
  fingerprint: string,
): string {
  return `${googleUserId}:${spreadsheetId}:${sheetTabId}:${fingerprint}`;
}
