import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { submitAttempt } from "../quiz/attemptActions";
import { computeStudyResult } from "../quiz/grading";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function SubmitConfirmPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((found) => {
      if (!found || !found.questionSnapshot || found.questionSnapshot.length === 0) {
        setState("not-found");
        return;
      }
      setAttempt(found);
      setState("ready");
    });
  }, [attemptId]);

  if (state === "loading") {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (state === "not-found" || !attempt) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          풀이 기록을 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.
        </p>
        <Link to="/folders" className="text-sm font-semibold text-accent dark:text-accent-dark">
          Drive 폴더로 이동
        </Link>
      </div>
    );
  }

  const summary = summarizeProgress(attempt.progress);

  const submit = async () => {
    if (!attemptId || !attempt.questionSnapshot) return;
    setSubmitting(true);
    try {
      const result = computeStudyResult(attempt.questionSnapshot, attempt.progress);
      const submitted = submitAttempt(attempt, result);
      await saveAttempt(submitted);
      navigate(`/results/${attemptId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">제출하기 전에 확인하세요</h1>
      <p className="mb-5 text-[13.5px] text-text-secondary dark:text-text-dark-secondary">
        제출 후에도 결과 화면에서 문제별 해설을 다시 볼 수 있습니다.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <div className="rounded-lg border border-border bg-surface p-4 dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-text-secondary dark:text-text-dark-secondary">전체</div>
          <div className="font-mono text-xl font-semibold">{summary.total}</div>
        </div>
        <div className="rounded-lg border border-status-answered bg-surface p-4 dark:border-status-answered-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-answered dark:text-status-answered-dark">답변완료</div>
          <div className="font-mono text-xl font-semibold text-status-answered dark:text-status-answered-dark">
            {summary.answered}
          </div>
        </div>
        <div className="rounded-lg border border-status-held bg-surface p-4 dark:border-status-held-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-held dark:text-status-held-dark">보류</div>
          <div className="font-mono text-xl font-semibold text-status-held dark:text-status-held-dark">
            {summary.held}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-sunken p-4 dark:border-border-dark dark:bg-sunken-dark">
          <div className="mb-1 text-xs text-text-secondary dark:text-text-dark-secondary">미응답</div>
          <div className="font-mono text-xl font-semibold">{summary.unseen}</div>
        </div>
        <div className="col-span-2 rounded-lg border border-status-review bg-surface p-4 dark:border-status-review-dark dark:bg-surface-dark">
          <div className="mb-1 text-xs text-status-review dark:text-status-review-dark">다시 볼 문제</div>
          <div className="font-mono text-xl font-semibold text-status-review dark:text-status-review-dark">
            {summary.flagged}
          </div>
        </div>
      </div>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => navigate(`/quiz/${attemptId}`)}
          className="flex-1 rounded border border-border px-4 py-3 text-sm dark:border-border-dark"
        >
          계속 풀기
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting}
          className="flex-1 rounded bg-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
        >
          {submitting ? "제출 중…" : "제출하기"}
        </button>
      </div>
    </div>
  );
}
