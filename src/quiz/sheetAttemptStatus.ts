import type { StudyAttempt } from "../types/studyAttempt";

export interface SheetAttemptStatus {
  attemptedTabs: number;
  submittedTabs: number;
  inProgressTabs: number;
}

// 탭 수는 서로 다른 sheetTabId 기준이다. 한 탭이 제출과 풀이 중에 모두 들 수 있다.
export function summarizeAttemptsBySheet(
  attempts: StudyAttempt[],
): Map<string, SheetAttemptStatus> {
  const tabs = new Map<string, Map<string, { submitted: boolean; inProgress: boolean }>>();
  for (const attempt of attempts) {
    const sheetTabs = tabs.get(attempt.spreadsheetId) ?? new Map();
    const tab = sheetTabs.get(attempt.sheetTabId) ?? { submitted: false, inProgress: false };
    if (attempt.submittedAt || attempt.result) tab.submitted = true;
    else tab.inProgress = true;
    sheetTabs.set(attempt.sheetTabId, tab);
    tabs.set(attempt.spreadsheetId, sheetTabs);
  }

  const summary = new Map<string, SheetAttemptStatus>();
  for (const [spreadsheetId, sheetTabs] of tabs) {
    const flags = [...sheetTabs.values()];
    summary.set(spreadsheetId, {
      attemptedTabs: flags.length,
      submittedTabs: flags.filter((f) => f.submitted).length,
      inProgressTabs: flags.filter((f) => f.inProgress).length,
    });
  }
  return summary;
}
