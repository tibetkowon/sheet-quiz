import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { useLatestRequest } from "../app/useLatestRequest";
import { deleteAttempt, listAttemptsByUser } from "../storage/attemptRepo";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function HistoryPage() {
  const { googleUserId } = useAuth();
  const navigate = useNavigate();
  const [attempts, setAttempts] = useState<StudyAttempt[] | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const beginRequest = useLatestRequest(googleUserId);

  const load = useCallback(() => {
    const isLatest = beginRequest();
    if (!googleUserId) return;
    setLoadError(null);
    setDeleteError(null);
    listAttemptsByUser(googleUserId)
      .then((found) => {
        if (!isLatest()) return;
        setAttempts(found.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      })
      .catch(() => {
        if (!isLatest()) return;
        setLoadError("풀이 기록을 불러오지 못했습니다. 다시 시도해주세요.");
      });
  }, [googleUserId, beginRequest]);

  useEffect(() => {
    setAttempts(null);
    load();
  }, [load]);

  if (!googleUserId) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 계정을 연결하면 저장된 풀이 기록을 볼 수 있습니다.
        </p>
        <Link to="/" className="text-sm font-semibold text-accent dark:text-accent-dark">
          시작 화면으로 이동
        </Link>
      </div>
    );
  }

  if (attempts === null && loadError) {
    return (
      <div className="mx-auto max-w-2xl px-10 py-7">
        <ErrorBanner message={loadError} onRetry={load} />
      </div>
    );
  }

  if (attempts === null) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 풀이 기록을 삭제할까요? 되돌릴 수 없습니다.")) return;
    const isLatest = beginRequest();
    setDeleteError(null);
    try {
      await deleteAttempt(id);
      if (isLatest()) load();
    } catch {
      if (!isLatest()) return;
      setDeleteError("풀이 기록을 삭제하지 못했습니다. 삭제 버튼을 눌러 다시 시도해주세요.");
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-5 font-display text-xl font-semibold">저장된 풀이 기록</h1>
      {loadError && <ErrorBanner message={loadError} onRetry={load} />}
      {deleteError && <ErrorBanner message={deleteError} />}
      {attempts.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          아직 저장된 풀이 기록이 없습니다.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {attempts.map((attempt) => {
            const summary = summarizeProgress(attempt.progress);
            const isSubmitted = Boolean(attempt.result);
            return (
              <li
                key={attempt.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {attempt.certificationFolderName} · {attempt.sheetTabName}
                  </div>
                  <div className="text-xs text-text-secondary dark:text-text-dark-secondary">
                    {isSubmitted
                      ? `제출완료 · ${attempt.result!.scorePercent}%`
                      : `진행 중 · ${summary.answered}/${summary.total}`}
                    {" · "}
                    {new Date(attempt.updatedAt).toLocaleDateString("ko-KR")}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(isSubmitted ? `/results/${attempt.id}` : `/quiz/${attempt.id}`)}
                    aria-label={`${attempt.certificationFolderName} ${attempt.sheetTabName} ${isSubmitted ? "결과 보기" : "이어서 풀기"}`}
                    className="rounded border border-border px-3 py-1.5 text-xs dark:border-border-dark"
                  >
                    {isSubmitted ? "결과 보기" : "이어서 풀기"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(attempt.id)}
                    aria-label={`${attempt.certificationFolderName} ${attempt.sheetTabName} 삭제`}
                    className="rounded border border-danger px-3 py-1.5 text-xs text-danger"
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
