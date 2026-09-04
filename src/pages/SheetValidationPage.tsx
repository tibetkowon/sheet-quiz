import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { getSheetValues, SheetsApiError } from "../sheets/sheetsClient";
import { parseSheetRows } from "../sheets/parseQuestions";
import { validateQuestions } from "../sheets/validateQuestions";
import { createAttemptId, createSetFingerprint } from "../sheets/fingerprint";
import type { ValidationIssue } from "../sheets/types";
import type { Question } from "../types/question";
import { createInitialProgress } from "../types/progress";
import type { StudyAttempt } from "../types/studyAttempt";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { ErrorBanner } from "../components/ErrorBanner";

interface LocationState {
  fileName?: string;
  tabId?: number;
  tabTitle?: string;
  sourceModifiedTime?: string;
  parentFolderId?: string;
  certificationFolderName?: string;
}

export default function SheetValidationPage() {
  const { getAccessToken, markExpired, googleUserId } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";
  const tabTitle = state.tabTitle ?? "";
  const tabId = state.tabId != null ? String(state.tabId) : "";

  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [starting, setStarting] = useState(false);

  const load = useCallback(() => {
    if (!spreadsheetId) return;
    if (!tabTitle) {
      setStatus("error");
      setLoadError("탭 정보를 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.");
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus("error");
      setLoadError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    setStatus("loading");
    setLoadError(null);
    getSheetValues(accessToken, spreadsheetId, tabTitle)
      .then((rawRows) => {
        const { headerIndex, rows } = parseSheetRows(rawRows);
        const result = validateQuestions(headerIndex, rows, {
          sheetName: tabTitle,
          spreadsheetId,
          sheetTabId: tabId,
        });
        setQuestions(result.questions);
        setIssues(result.issues);
        setStatus("done");
      })
      .catch((err) => {
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setStatus("error");
        setLoadError(err instanceof SheetsApiError ? err.message : "Sheet 데이터를 불러오지 못했습니다.");
      });
  }, [spreadsheetId, tabTitle, tabId, getAccessToken, markExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const startQuiz = useCallback(async () => {
    if (!spreadsheetId || !googleUserId) return;
    setStarting(true);
    try {
      const fingerprint = createSetFingerprint(questions);
      const attemptId = createAttemptId(googleUserId, spreadsheetId, tabId, fingerprint);
      const existing = await getAttempt(attemptId);
      if (existing) {
        const hasProgress = existing.progress.some((p) => p.status !== "UNSEEN");
        navigate(hasProgress ? `/quiz/${attemptId}/resume` : `/quiz/${attemptId}`);
        return;
      }
      const now = new Date().toISOString();
      const attempt: StudyAttempt = {
        id: attemptId,
        googleUserId,
        spreadsheetId,
        spreadsheetName: fileName,
        sheetTabId: tabId,
        sheetTabName: tabTitle,
        parentFolderId: state.parentFolderId ?? "",
        certificationFolderName: state.certificationFolderName ?? fileName,
        questionSetFingerprint: fingerprint,
        sourceModifiedTime: state.sourceModifiedTime ?? "",
        lastViewedIndex: 0,
        startedAt: now,
        updatedAt: now,
        progress: questions.map((q) => createInitialProgress(q.id)),
        questionSnapshot: questions,
      };
      await saveAttempt(attempt);
      navigate(`/quiz/${attemptId}`);
    } finally {
      setStarting(false);
    }
  }, [
    spreadsheetId,
    googleUserId,
    questions,
    tabId,
    tabTitle,
    fileName,
    state.parentFolderId,
    state.certificationFolderName,
    state.sourceModifiedTime,
    navigate,
  ]);

  if (status === "loading") {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (status === "error") {
    return (
      <div className="px-10 py-7">
        <ErrorBanner message={loadError ?? "Sheet 데이터를 불러오지 못했습니다."} onRetry={load} />
      </div>
    );
  }

  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  if (errorIssues.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-10 py-7">
        <h1 className="mb-2 font-display text-xl font-semibold">
          시트에서 고칠 부분이 {errorIssues.length}곳 있어요
        </h1>
        <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
          아래 위치를 시트에서 수정한 뒤 다시 검증해 주세요.
        </p>
        <ul className="mb-6 flex flex-col gap-2.5">
          {errorIssues.map((issue, i) => (
            <li
              key={i}
              className="rounded-lg border border-l-3 border-border border-l-status-review bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
            >
              <div className="mb-1 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                {issue.sheetName} · {issue.rowNumber}행
                {issue.questionNumber != null ? ` · 문제 ${issue.questionNumber}번` : ""}
              </div>
              <div className="text-sm">{issue.message}</div>
            </li>
          ))}
        </ul>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={load}
            className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            다시 검증
          </button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
          >
            Google Sheet 원본 열기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">{fileName || "문제 세트"} 검증 완료</h1>
      <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
        {tabTitle} 탭 · 문제 {questions.length}개
        {warningIssues.length > 0 ? ` · 경고 ${warningIssues.length}건` : ""}
      </p>
      {warningIssues.length > 0 && (
        <ul className="mb-6 flex flex-col gap-2">
          {warningIssues.map((issue, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-sunken p-3 text-xs dark:border-border-dark dark:bg-sunken-dark"
            >
              {issue.sheetName} · {issue.rowNumber}행 · {issue.message}
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void startQuiz()}
        disabled={starting}
        className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
      >
        {starting ? "준비 중…" : "풀이 시작"}
      </button>
    </div>
  );
}
