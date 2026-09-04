import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { restartAttempt } from "../quiz/attemptActions";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";

export default function ResumeSelectPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((found) => {
      if (!found) {
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

  const restart = async () => {
    if (!attemptId) return;
    setRestarting(true);
    await saveAttempt(restartAttempt(attempt));
    navigate(`/quiz/${attemptId}`);
  };

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">이어서 풀어볼까요?</h1>
      <p className="mb-5 text-sm text-text-secondary dark:text-text-dark-secondary">
        {attempt.spreadsheetName} · {attempt.sheetTabName} · {summary.answered}/{summary.total} 답변 완료
      </p>
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={() => navigate(`/quiz/${attemptId}`)}
          className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          이어서 풀기
        </button>
        <button
          type="button"
          onClick={() => void restart()}
          disabled={restarting}
          className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
        >
          {restarting ? "초기화 중…" : "처음부터 다시 풀기"}
        </button>
      </div>
    </div>
  );
}
