// src/pages/QuizPage.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import { QuizProvider, useQuiz } from "../quiz/QuizContext";
import { AutosaveIndicator } from "../components/AutosaveIndicator";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionNavigatorGrid } from "../components/QuestionNavigatorGrid";

export default function QuizPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    setState("loading");
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

  return (
    <QuizProvider initialAttempt={attempt}>
      <QuizPageContent />
    </QuizProvider>
  );
}

function QuizPageContent() {
  const {
    currentQuestion,
    currentProgress,
    currentIndex,
    questions,
    navigatorItems,
    progressSummary,
    autosaveStatus,
    selectAnswer,
    setHeld,
    toggleReviewMarked,
    goToIndex,
    goPrev,
    goNext,
  } = useQuiz();
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => setShowExplanation(false), [currentIndex]);

  const isSingle = currentQuestion.type === "SINGLE";
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const answeredPercent =
    progressSummary.total > 0 ? (progressSummary.answered / progressSummary.total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between gap-6 border-b border-border px-8 py-3.5 dark:border-border-dark">
        <div className="min-w-0 flex-1">
          <ProgressBar percent={answeredPercent} />
        </div>
        <span className="flex-shrink-0 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
          {progressSummary.answered}/{progressSummary.total} 답변
        </span>
        <AutosaveIndicator status={autosaveStatus} />
      </div>

      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-7 px-8 py-7 pb-28 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-2">
            <span className="font-mono text-[13px] text-text-secondary dark:text-text-dark-secondary">
              문제 {currentQuestion.questionNumber} / {questions.length}
            </span>
            {currentQuestion.category && (
              <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
                {currentQuestion.category}
              </span>
            )}
            <span className="rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
              난이도 {currentQuestion.difficulty}
            </span>
          </div>

          {currentQuestion.scenario && (
            <div className="mb-4.5 rounded-lg bg-sunken p-5 dark:bg-sunken-dark">
              <div className="mb-2 font-mono text-xs font-semibold text-text-secondary dark:text-text-dark-secondary">
                상황
              </div>
              <p className="m-0 text-[15px] leading-[1.75]">{currentQuestion.scenario}</p>
            </div>
          )}

          <p className="mb-1.5 text-base font-semibold leading-[1.6]">{currentQuestion.text}</p>
          {!isSingle && (
            <p className="mb-4 text-[13px] font-semibold text-status-review dark:text-status-review-dark">
              정답 {currentQuestion.requiredAnswerCount}개를 선택하세요 · 현재{" "}
              {currentProgress.selectedAnswers.length}개 선택됨
            </p>
          )}

          <fieldset className="flex flex-col gap-2.5 border-0 p-0">
            <legend className="sr-only">보기 선택</legend>
            {currentQuestion.options.map((option) => {
              const checked = currentProgress.selectedAnswers.includes(option.key);
              return (
                <label
                  key={option.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                    checked
                      ? "border-accent bg-accent-soft dark:border-accent-dark dark:bg-accent-dark-soft"
                      : "border-border dark:border-border-dark"
                  }`}
                >
                  <input
                    type={isSingle ? "radio" : "checkbox"}
                    name={`question-${currentQuestion.id}`}
                    checked={checked}
                    onChange={() => selectAnswer(option.key)}
                    className="mt-0.5"
                  />
                  <span className="text-[14.5px] leading-[1.55]">{option.text}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-6 rounded-lg border border-border bg-surface shadow-card dark:border-border-dark dark:bg-surface-dark">
            <button
              type="button"
              onClick={() => setShowExplanation((prev) => !prev)}
              className="w-full rounded-lg px-5 py-3.5 text-left text-[13.5px] font-semibold text-accent dark:text-accent-dark"
            >
              {showExplanation ? "해설 숨기기" : "해설 보기"}
            </button>
            {showExplanation && (
              <p className="m-0 px-5 pb-4.5 text-sm leading-[1.7] text-text-secondary dark:text-text-dark-secondary">
                {currentQuestion.explanation}
              </p>
            )}
          </div>
        </div>

        <QuestionNavigatorGrid items={navigatorItems} onJump={goToIndex} />
      </div>

      <div className="fixed inset-x-0 bottom-0 flex justify-center gap-2.5 border-t border-border bg-surface px-8 py-3.5 dark:border-border-dark dark:bg-surface-dark">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="rounded border border-border px-4.5 py-2.5 text-sm disabled:opacity-40 dark:border-border-dark"
        >
          이전
        </button>
        <button
          type="button"
          onClick={setHeld}
          className="rounded border border-border px-4.5 py-2.5 text-sm dark:border-border-dark"
        >
          나중에 풀기
        </button>
        <button
          type="button"
          onClick={toggleReviewMarked}
          className={`rounded border px-4.5 py-2.5 text-sm ${
            currentProgress.reviewMarked
              ? "border-status-review bg-status-review text-white dark:border-status-review-dark dark:bg-status-review-dark"
              : "border-border dark:border-border-dark"
          }`}
        >
          다시 볼 문제로 표시
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={isLast}
          className="rounded border border-border px-4.5 py-2.5 text-sm disabled:opacity-40 dark:border-border-dark"
        >
          다음
        </button>
      </div>
    </div>
  );
}
