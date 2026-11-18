import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { submitAttempt } from "../quiz/attemptActions";
import { computeStudyResult } from "../quiz/grading";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";
import { clampAttemptIndex } from "../quiz/clampAttemptIndex";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";

type TileVariant = "default" | "green" | "yellow" | "muted" | "red";

function StatTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: TileVariant;
}) {
  return (
    <Card variant={variant}>
      <VStack gap={1} align="start">
        <Text type="supporting">{label}</Text>
        <Text size="2xl" weight="semibold">
          {value}
        </Text>
      </VStack>
    </Card>
  );
}

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
      setAttempt(clampAttemptIndex(found));
      setState("ready");
    });
  }, [attemptId]);

  if (state === "loading") {
    return (
      <PageContainer maxWidth="28rem">
        <LoadingIndicator />
      </PageContainer>
    );
  }

  if (state === "not-found" || !attempt) {
    return (
      <PageContainer maxWidth="28rem" className="break-keep [overflow-wrap:anywhere]">
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

  const summary = summarizeProgress(attempt.progress);
  const answeredCount = attempt.progress.filter((p) => p.selectedAnswers.length > 0).length;
  const unansweredCount = summary.total - answeredCount;

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
    <PageContainer maxWidth="28rem" className="break-keep [overflow-wrap:anywhere]">
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={1}>제출하기 전에 확인하세요</Heading>
          <Text color="secondary" as="p">
            제출 후에도 결과 화면에서 문제별 해설을 다시 볼 수 있습니다.
          </Text>
        </VStack>
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile label="전체" value={summary.total} variant="default" />
          <StatTile label="답변완료" value={answeredCount} variant="green" />
          <StatTile label="보류" value={summary.held} variant="yellow" />
          <StatTile label="미응답" value={unansweredCount} variant="muted" />
          <div className="col-span-2">
            <StatTile label="다시 볼 문제" value={summary.flagged} variant="red" />
          </div>
        </div>
        <div className="flex gap-2.5">
          <div className="min-w-0 flex-1">
            <Button
              label="계속 풀기"
              size="lg"
              width="100%"
              onClick={() => navigate(`/quiz/${attemptId}`)}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Button
              label={submitting ? "제출 중…" : "제출하기"}
              variant="primary"
              size="lg"
              width="100%"
              isDisabled={submitting}
              onClick={() => void submit()}
            />
          </div>
        </div>
      </VStack>
    </PageContainer>
  );
}
