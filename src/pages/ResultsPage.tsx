// src/pages/ResultsPage.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getAttempt } from "../storage/attemptRepo";
import { computeStudyResult, gradeAttempt } from "../quiz/grading";
import { buildResultJson, buildResultMarkdown, downloadTextFile } from "../quiz/export";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { ProgressBar } from "../components/ProgressBar";
import { StatTile } from "../components/StatTile";
import { PageContainer } from "../components/PageContainer";
import type { StudyAttempt } from "../types/studyAttempt";
import { clampAttemptIndex } from "../quiz/clampAttemptIndex";

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
      if (
        !found ||
        !found.questionSnapshot ||
        found.questionSnapshot.length === 0 ||
        !found.result
      ) {
        setState("not-found");
        return;
      }
      setAttempt(clampAttemptIndex(found));
      setState("ready");
    });
  }, [attemptId]);

  if (state === "loading") {
    return (
      <PageContainer maxWidth="48rem">
        <LoadingIndicator />
      </PageContainer>
    );
  }

  if (state === "not-found" || !attempt || !attempt.result || !attempt.questionSnapshot) {
    return (
      <PageContainer maxWidth="48rem" className="break-keep [overflow-wrap:anywhere]">
        <VStack gap={3} align="start">
          <Text color="secondary" as="p">
            제출된 결과를 찾을 수 없습니다. 아직 제출하지 않았다면 문제풀이 화면으로 돌아가
            제출해주세요.
          </Text>
          <Link href="/folders" isStandalone weight="semibold">
            Drive 폴더로 이동
          </Link>
        </VStack>
      </PageContainer>
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
    downloadTextFile(
      `${attempt.sheetTabName}-result.md`,
      buildResultMarkdown(attempt, questions),
      "text/markdown",
    );
  };

  const downloadJson = () => {
    downloadTextFile(
      `${attempt.sheetTabName}-result.json`,
      buildResultJson(attempt, questions),
      "application/json",
    );
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
    <PageContainer maxWidth="48rem" className="break-keep [overflow-wrap:anywhere]">
      <VStack gap={6}>
        <VStack gap={1}>
          <Heading level={1}>풀이 결과</Heading>
          <Text color="secondary" as="p">
            {attempt.spreadsheetName} · {attempt.sheetTabName}
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile label="점수" value={`${result.scorePercent}%`} size="3xl" />
          <StatTile label="정답 / 전체" value={`${result.correctCount}/${questions.length}`} />
          <StatTile label="다시 볼 문제" value={flaggedCount} variant="red" />
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <StatBars
            title="분류별 정답률"
            stats={result.categoryStats.map((stat) => ({
              ...stat,
              displayName: stat.name,
              ariaLabel: `분류: ${stat.name}`,
            }))}
          />
          <StatBars
            title="난이도별 정답률"
            stats={result.difficultyStats.map((stat) => ({
              ...stat,
              displayName: `난이도 ${stat.name}`,
              ariaLabel: `난이도: ${stat.name}`,
            }))}
          />
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button label="Markdown 다운로드" onClick={downloadMarkdown} />
          <Button label="JSON 다운로드" onClick={downloadJson} />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              label={f.label}
              size="sm"
              variant={filter === f.key ? "primary" : "secondary"}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            />
          ))}
        </div>

        <VStack gap={3}>
          {rows.map((question) => {
            const grade = gradeByQuestionId.get(question.id)!;
            const progress = progressByQuestionId.get(question.id);
            const resultBadge = !grade.isAnswered
              ? ({ variant: "neutral", label: "미응답" } as const)
              : grade.isCorrect
                ? ({ variant: "success", label: "정답" } as const)
                : ({ variant: "error", label: "오답" } as const);

            return (
              <Card key={question.id} padding={3}>
                <Collapsible
                  isOpen={expandedId === question.id}
                  onOpenChange={(open) => setExpandedId(open ? question.id : null)}
                  trigger={
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Text type="supporting">{question.questionNumber}</Text>
                      {question.category && <Badge variant="neutral" label={question.category} />}
                      <Badge variant={resultBadge.variant} label={resultBadge.label} />
                      {progress?.reviewMarked && <span aria-label="다시 볼 문제로 표시됨">⚑</span>}
                      <div className="basis-full">
                        <Text as="div" display="block">
                          {question.text}
                        </Text>
                      </div>
                    </div>
                  }
                >
                  {/* 접힌 문제의 상세는 DOM에 두지 않는다(문제가 많은 시트에서 화면이 무거워지지 않도록). */}
                  {expandedId === question.id && (
                    <VStack gap={2} paddingBlockStart={3}>
                      {question.options.map((option) => {
                        const isCorrectOption = grade.correctAnswers.includes(option.key);
                        const isSelected = grade.selectedAnswers.includes(option.key);
                        return (
                          <Card
                            key={option.key}
                            padding={3}
                            variant={isCorrectOption ? "green" : isSelected ? "red" : "default"}
                          >
                            <VStack gap={1} align="start">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Text type="code">{option.key}</Text>
                                <Text>{option.text}</Text>
                                {isCorrectOption && <Badge variant="success" label="정답" />}
                                {isSelected && !isCorrectOption && (
                                  <Badge variant="error" label="선택함" />
                                )}
                              </div>
                              {option.explanation && (
                                <Text type="supporting" as="p">
                                  {option.explanation}
                                </Text>
                              )}
                            </VStack>
                          </Card>
                        );
                      })}
                      {question.explanation && (
                        <Card variant="muted" padding={3}>
                          <VStack gap={1} align="start">
                            <Text weight="semibold" as="div" display="block">
                              해설
                            </Text>
                            <Text as="p">{question.explanation}</Text>
                          </VStack>
                        </Card>
                      )}
                    </VStack>
                  )}
                </Collapsible>
              </Card>
            );
          })}
        </VStack>
      </VStack>
    </PageContainer>
  );
}

function StatBars({
  title,
  stats,
}: {
  title: string;
  stats: { name: string; displayName: string; ariaLabel: string; correct: number; total: number }[];
}) {
  return (
    <VStack gap={3}>
      <Heading level={2}>{title}</Heading>
      {stats.map((stat) => (
        <VStack key={stat.name} gap={1}>
          <div className="flex flex-wrap justify-between gap-x-2">
            <Text>{stat.displayName}</Text>
            <Text type="supporting">
              {stat.correct}/{stat.total}
            </Text>
          </div>
          <ProgressBar
            percent={stat.total > 0 ? (stat.correct / stat.total) * 100 : 0}
            label={stat.ariaLabel}
          />
        </VStack>
      ))}
    </VStack>
  );
}
