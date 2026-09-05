// src/pages/ResultsPage.tsx
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAttempt } from "../storage/attemptRepo";
import { computeStudyResult, gradeAttempt } from "../quiz/grading";
import { buildResultJson, buildResultMarkdown, downloadTextFile } from "../quiz/export";
import { ProgressBar } from "../components/ProgressBar";
import type { StudyAttempt } from "../types/studyAttempt";

type ResultFilter = "all" | "correct" | "incorrect" | "unanswered" | "flagged";

const FILTERS: { key: ResultFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "correct", label: "정답" },
  { key: "incorrect", label: "오답" },
  { key: "unanswered", label: "미응답" },
  { key: "flagged", label: "다시 볼 문제" },
];

export default function ResultsPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);

  useEffect(() => {
    if (!attemptId) return;
    getAttempt(attemptId).then((found) => {
      if (!found || !found.questionSnapshot || found.questionSnapshot.length === 0 || !found.result) {
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

  if (state === "not-found" || !attempt || !attempt.result || !attempt.questionSnapshot) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          제출된 결과를 찾을 수 없습니다. 아직 제출하지 않았다면 문제풀이 화면으로 돌아가 제출해주세요.
        </p>
        <Link to="/folders" className="text-sm font-semibold text-accent dark:text-accent-dark">
          Drive 폴더로 이동
        </Link>
      </div>
    );
  }

  return <ResultsPageContent attempt={attempt} questions={attempt.questionSnapshot} />;
}

function ResultsPageContent({
  attempt,
  questions,
}: {
  attempt: StudyAttempt;
  questions: NonNullable<StudyAttempt["questionSnapshot"]>;
}) {
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const result = computeStudyResult(questions, attempt.progress);
  const downloadMarkdown = () => {
    downloadTextFile(`${attempt.sheetTabName}-result.md`, buildResultMarkdown(attempt, questions), "text/markdown");
  };

  const downloadJson = () => {
    downloadTextFile(`${attempt.sheetTabName}-result.json`, buildResultJson(attempt, questions), "application/json");
  };

  const progressByQuestionId = new Map(attempt.progress.map((p) => [p.questionId, p]));
  const grades = gradeAttempt(questions, attempt.progress);
  const gradeByQuestionId = new Map(grades.map((g) => [g.questionId, g]));
  const flaggedCount = attempt.progress.filter((p) => p.reviewMarked).length;

  const rows = questions.filter((question) => {
    const grade = gradeByQuestionId.get(question.id);
    const progress = progressByQuestionId.get(question.id);
    if (!grade) return false;
    if (filter === "correct") return grade.isCorrect;
    if (filter === "incorrect") return grade.isAnswered && !grade.isCorrect;
    if (filter === "unanswered") return !grade.isAnswered;
    if (filter === "flagged") return progress?.reviewMarked ?? false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <div className="mb-7 grid grid-cols-3 gap-3.5">
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">점수</div>
          <div className="font-display text-3xl font-bold">{result.scorePercent}%</div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">정답 / 전체</div>
          <div className="font-mono text-2xl font-semibold">
            {result.correctCount}/{questions.length}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-surface p-5 shadow-card dark:border-border-dark dark:bg-surface-dark">
          <div className="mb-1.5 text-xs text-text-secondary dark:text-text-dark-secondary">다시 볼 문제</div>
          <div className="font-mono text-2xl font-semibold text-status-review dark:text-status-review-dark">
            {flaggedCount}
          </div>
        </div>
      </div>

      <div className="mb-7 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2.5 text-sm font-semibold text-text-secondary dark:text-text-dark-secondary">
            분류별 정답률
          </div>
          <div className="flex flex-col gap-2.5">
            {result.categoryStats.map((stat) => (
              <div key={stat.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>{stat.name}</span>
                  <span className="font-mono text-text-secondary dark:text-text-dark-secondary">
                    {stat.correct}/{stat.total}
                  </span>
                </div>
                <ProgressBar percent={stat.total > 0 ? (stat.correct / stat.total) * 100 : 0} label={`분류: ${stat.name}`} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2.5 text-sm font-semibold text-text-secondary dark:text-text-dark-secondary">
            난이도별 정답률
          </div>
          <div className="flex flex-col gap-2.5">
            {result.difficultyStats.map((stat) => (
              <div key={stat.name}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span>난이도 {stat.name}</span>
                  <span className="font-mono text-text-secondary dark:text-text-dark-secondary">
                    {stat.correct}/{stat.total}
                  </span>
                </div>
                <ProgressBar percent={stat.total > 0 ? (stat.correct / stat.total) * 100 : 0} label={`난이도: ${stat.name}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2.5">
        <button
          type="button"
          onClick={downloadMarkdown}
          className="rounded border border-border px-3.5 py-2 text-xs dark:border-border-dark"
        >
          Markdown 다운로드
        </button>
        <button
          type="button"
          onClick={downloadJson}
          className="rounded border border-border px-3.5 py-2 text-xs dark:border-border-dark"
        >
          JSON 다운로드
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] ${
              filter === f.key
                ? "border-accent bg-accent-soft text-accent dark:border-accent-dark dark:bg-accent-dark-soft dark:text-accent-dark"
                : "border-border bg-sunken text-text-secondary dark:border-border-dark dark:bg-sunken-dark dark:text-text-dark-secondary"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((question) => {
          const grade = gradeByQuestionId.get(question.id)!;
          const progress = progressByQuestionId.get(question.id);
          const isExpanded = expandedId === question.id;
          const resultLabel = !grade.isAnswered ? "미응답" : grade.isCorrect ? "정답" : "오답";
          const resultColorClass = !grade.isAnswered
            ? "text-text-secondary dark:text-text-dark-secondary"
            : grade.isCorrect
              ? "text-status-answered dark:text-status-answered-dark"
              : "text-status-review dark:text-status-review-dark";

          return (
            <div
              key={question.id}
              className="overflow-hidden rounded-lg border border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
              style={{ clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)" }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : question.id)}
                aria-expanded={isExpanded}
                aria-controls={`question-detail-${question.id}`}
                className="flex w-full items-center gap-3 px-4.5 py-3.5 text-left"
              >
                <span className="w-7 font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {question.questionNumber}
                </span>
                {question.category && (
                  <span className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-text-secondary dark:bg-sunken-dark dark:text-text-dark-secondary">
                    {question.category}
                  </span>
                )}
                <span className="flex-1 truncate text-[13.5px] text-text-secondary dark:text-text-dark-secondary">
                  {question.text}
                </span>
                {progress?.reviewMarked && <span aria-label="다시 볼 문제로 표시됨">⚑</span>}
                <span className={`text-xs font-semibold ${resultColorClass}`}>{resultLabel}</span>
              </button>
              {isExpanded && (
                <div id={`question-detail-${question.id}`} className="flex flex-col gap-2 px-4.5 pb-4 pl-14">
                  {question.options.map((option) => {
                    const isCorrectOption = grade.correctAnswers.includes(option.key);
                    const isSelected = grade.selectedAnswers.includes(option.key);
                    return (
                      <div
                        key={option.key}
                        className={`rounded border px-3 py-2 text-[13px] ${
                          isCorrectOption
                            ? "border-status-answered dark:border-status-answered-dark"
                            : isSelected
                              ? "border-status-review dark:border-status-review-dark"
                              : "border-border dark:border-border-dark"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{option.key}</span>
                          <span>{option.text}</span>
                          {isCorrectOption && (
                            <span className="text-xs font-semibold text-status-answered dark:text-status-answered-dark">
                              정답
                            </span>
                          )}
                          {isSelected && !isCorrectOption && (
                            <span className="text-xs font-semibold text-status-review dark:text-status-review-dark">
                              선택함
                            </span>
                          )}
                        </div>
                        {option.explanation && (
                          <p className="m-0 mt-1 text-xs text-text-secondary dark:text-text-dark-secondary">
                            {option.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <p className="m-0 mt-1 text-[13.5px] leading-[1.65] text-text-secondary dark:text-text-dark-secondary">
                    {question.explanation}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
