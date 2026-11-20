// src/pages/QuizPage.tsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxList, CheckboxListItem } from "@astryxdesign/core/CheckboxList";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Drawer, DrawerHeader } from "@astryxdesign/core/Drawer";
import { Link } from "@astryxdesign/core/Link";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLatestRequest } from "../app/useLatestRequest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import type { StudyAttempt } from "../types/studyAttempt";
import { clampAttemptIndex } from "../quiz/clampAttemptIndex";
import { QuizProvider, useQuiz } from "../quiz/QuizContext";
import { AutosaveIndicator } from "../components/AutosaveIndicator";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionNavigatorGrid } from "../components/QuestionNavigatorGrid";

export default function QuizPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [state, setState] = useState<"loading" | "not-found" | "error" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);

  const beginRequest = useLatestRequest(attemptId);

  const load = useCallback(() => {
    if (!attemptId) return;
    const isLatest = beginRequest();
    setState("loading");
    getAttempt(attemptId)
      .then((found) => {
        if (!isLatest()) return;
        if (!found || !found.questionSnapshot || found.questionSnapshot.length === 0) {
          setState("not-found");
          return;
        }
        setAttempt(clampAttemptIndex(found));
        setState("ready");
      })
      .catch(() => {
        if (!isLatest()) return;
        setState("error");
      });
  }, [attemptId, beginRequest]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === "loading") {
    return (
      <PageContainer>
        <LoadingIndicator />
      </PageContainer>
    );
  }

  if (state === "error") {
    return (
      <PageContainer>
        <ErrorBanner message="풀이 기록을 불러오지 못했습니다." onRetry={load} />
      </PageContainer>
    );
  }

  if (state === "not-found" || !attempt) {
    return (
      <PageContainer maxWidth="42rem" className="break-keep">
        <VStack gap={3} align="start">
          <Text color="secondary" as="p">
            풀이 기록을 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.
          </Text>
          <Link href="/folders" isStandalone weight="semibold">
            Drive 폴더로 이동
          </Link>
        </VStack>
      </PageContainer>
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
    attempt,
    currentQuestion,
    currentProgress,
    currentIndex,
    questions,
    navigatorItems,
    progressSummary,
    autosaveStatus,
    selectAnswer,
    toggleHeld,
    toggleReviewMarked,
    goToIndex,
    goPrev,
    goNext,
    goNextUnseen,
    goNextHeld,
    goNextFlagged,
  } = useQuiz();
  const navigate = useNavigate();
  const [showExplanation, setShowExplanation] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);

  const goSubmit = async () => {
    await saveAttempt(attempt);
    navigate(`/quiz/${attempt.id}/submit`);
  };

  useEffect(() => setShowExplanation(false), [currentIndex]);

  const isSingle = currentQuestion.type === "SINGLE";
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;
  const answeredPercent =
    progressSummary.total > 0 ? (progressSummary.answered / progressSummary.total) * 100 : 0;
  const selected = currentProgress.selectedAnswers;
  const isHeld = currentProgress.status === "SKIPPED";
  // 시트의 번호가 1부터 시작하지 않으면(예: 31~45) 번호와 전체 개수만으로는 위치를 알 수 없어 몇 번째인지 함께 보여준다.
  const questionLabel =
    currentQuestion.questionNumber === currentIndex + 1
      ? `문제 ${currentQuestion.questionNumber} / ${questions.length}`
      : `문제 ${currentQuestion.questionNumber} (${questions.length}문제 중 ${currentIndex + 1}번째)`;
  const jumpTo = (index: number) => {
    goToIndex(index);
    setIsListOpen(false);
  };
  const renderNavigatorPanel = (hasTitle: boolean) => (
    <VStack gap={3}>
      <QuestionNavigatorGrid items={navigatorItems} onJump={jumpTo} hasTitle={hasTitle} />
      <Card padding={3}>
        <VStack gap={2}>
          <Button
            label="다음 미응답 문제로 이동"
            size="sm"
            width="100%"
            isDisabled={progressSummary.unseen === 0}
            onClick={() => {
              goNextUnseen();
              setIsListOpen(false);
            }}
          />
          <Button
            label="다음 보류 문제로 이동"
            size="sm"
            width="100%"
            isDisabled={progressSummary.held === 0}
            onClick={() => {
              goNextHeld();
              setIsListOpen(false);
            }}
          />
          <Button
            label="다음 다시 볼 문제로 이동"
            size="sm"
            width="100%"
            isDisabled={progressSummary.flagged === 0}
            onClick={() => {
              goNextFlagged();
              setIsListOpen(false);
            }}
          />
        </VStack>
      </Card>
    </VStack>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3.5 sm:gap-6 sm:px-8">
        <div className="min-w-0 flex-1">
          <ProgressBar percent={answeredPercent} />
        </div>
        <Text type="supporting">
          {progressSummary.answered}/{progressSummary.total} 답변
        </Text>
        <AutosaveIndicator status={autosaveStatus} />
        <div className="lg:hidden">
          <Button label="문제 목록" size="sm" onClick={() => setIsListOpen(true)} />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1180px] grid-cols-1 gap-7 px-4 py-7 pb-64 sm:px-8 sm:pb-40 lg:grid-cols-[1fr_300px] lg:pb-28">
        <div className="min-w-0 break-keep [overflow-wrap:anywhere]">
          <VStack gap={4}>
            <div className="flex flex-wrap items-center gap-2">
              <Text type="supporting">{questionLabel}</Text>
              {currentQuestion.category && (
                <Badge variant="neutral" label={currentQuestion.category} />
              )}
              <Badge variant="neutral" label={`난이도 ${currentQuestion.difficulty}`} />
              {isHeld && <Badge variant="warning" label="보류 중" />}
            </div>

            {currentQuestion.scenario && (
              <Card variant="muted">
                <VStack gap={2} align="start">
                  <Text type="supporting" weight="semibold">
                    상황
                  </Text>
                  <Text as="p">{currentQuestion.scenario}</Text>
                </VStack>
              </Card>
            )}

            <VStack gap={1} align="start">
              <Text type="large" weight="semibold" as="p">
                {currentQuestion.text}
              </Text>
              {!isSingle && (
                <Text color="accent" weight="semibold" as="p">
                  정답 {currentQuestion.requiredAnswerCount}개를 선택하세요 · 현재 {selected.length}
                  개 선택됨
                </Text>
              )}
            </VStack>

            <div className="overflow-hidden rounded-[var(--radius-container)] [&_[data-astryx-pressable]]:rounded-none [&_[role=radiogroup]]:gap-0 [&_[role=radiogroup]>[data-astryx-pressable]]:px-4 [&_ul]:gap-0 [&_[data-astryx-pressable]]:py-3.5 [&_[data-astryx-pressable]+[data-astryx-pressable]]:shadow-[inset_0_1px_0_0_var(--color-border-emphasized)]">
              <Card padding={0}>
                {isSingle ? (
                  <RadioList
                    label="보기 선택"
                    isLabelHidden
                    value={selected[0] ?? ""}
                    onChange={selectAnswer}
                  >
                    {currentQuestion.options.map((option) => (
                      <RadioListItem key={option.key} value={option.key} label={option.text} />
                    ))}
                  </RadioList>
                ) : (
                  <CheckboxList
                    label="보기 선택"
                    isLabelHidden
                    value={selected}
                    onChange={(next) => {
                      // 목록 전체가 아니라 바뀐 보기 하나만 토글 동작에 넘긴다.
                      const changed = currentQuestion.options.find(
                        (option) => next.includes(option.key) !== selected.includes(option.key),
                      );
                      if (changed) selectAnswer(changed.key);
                    }}
                  >
                    {currentQuestion.options.map((option) => (
                      <CheckboxListItem
                        key={option.key}
                        value={option.key}
                        // 문자열 라벨은 한 줄로 잘려서, 긴 보기를 끝까지 읽을 수 있게 요소로 감싼다.
                        label={<span className="whitespace-normal">{option.text}</span>}
                      />
                    ))}
                  </CheckboxList>
                )}
              </Card>
            </div>

            <Card padding={3}>
              <Collapsible
                trigger="해설 보기"
                isOpen={showExplanation}
                onOpenChange={setShowExplanation}
              >
                <div className="pt-3">
                  <Text color="secondary" as="p">
                    {currentQuestion.explanation}
                  </Text>
                </div>
              </Collapsible>
            </Card>
          </VStack>
        </div>

        <div className="hidden lg:block">{renderNavigatorPanel(true)}</div>
      </div>

      <Drawer label="문제 목록" isOpen={isListOpen} onOpenChange={setIsListOpen} padding={4}>
        <DrawerHeader title="문제 목록" onOpenChange={setIsListOpen} />
        {isListOpen && renderNavigatorPanel(false)}
      </Drawer>

      <div className="fixed inset-x-0 bottom-0 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] bg-[var(--color-background-surface)] px-4 py-3.5 sm:flex sm:flex-wrap sm:justify-center sm:gap-2.5 sm:px-8">
        <Button label="이전" size="lg" isDisabled={isFirst} onClick={goPrev} />
        <Button label="다음" size="lg" isDisabled={isLast} onClick={goNext} />
        <div
          className={
            isHeld
              ? "[&>button]:border [&>button]:border-[var(--color-border-yellow)] [&>button]:bg-[var(--color-background-yellow)] [&>button]:text-[var(--color-text-yellow)]"
              : ""
          }
        >
          <Button
            label="나중에 풀기"
            size="lg"
            width="100%"
            aria-pressed={isHeld}
            onClick={toggleHeld}
          />
        </div>
        <Button
          label="다시 볼 문제로 표시"
          size="lg"
          variant={currentProgress.reviewMarked ? "destructive" : "secondary"}
          aria-pressed={currentProgress.reviewMarked}
          onClick={toggleReviewMarked}
        />
        <div className="col-span-2 sm:col-auto [&>*]:w-full sm:[&>*]:w-auto">
          <Button label="제출하기" variant="primary" size="lg" onClick={() => void goSubmit()} />
        </div>
      </div>
    </div>
  );
}
