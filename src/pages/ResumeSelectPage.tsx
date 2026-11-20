import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLatestRequest } from "../app/useLatestRequest";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { restartAttempt } from "../quiz/attemptActions";
import { summarizeProgress } from "../quiz/navigation";
import type { StudyAttempt } from "../types/studyAttempt";
import { clampAttemptIndex } from "../quiz/clampAttemptIndex";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";

export default function ResumeSelectPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "not-found" | "error" | "ready">("loading");
  const [attempt, setAttempt] = useState<StudyAttempt | null>(null);
  const [restarting, setRestarting] = useState(false);

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
      <PageContainer maxWidth="28rem">
        <LoadingIndicator />
      </PageContainer>
    );
  }

  if (state === "error") {
    return (
      <PageContainer maxWidth="28rem">
        <ErrorBanner message="풀이 기록을 불러오지 못했습니다." onRetry={load} />
      </PageContainer>
    );
  }

  if (state === "not-found" || !attempt) {
    return (
      <PageContainer maxWidth="28rem" className="break-keep">
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

  const restart = async () => {
    if (!attemptId) return;
    setRestarting(true);
    await saveAttempt(restartAttempt(attempt), { allowSubmittedOverwrite: true });
    navigate(`/quiz/${attemptId}`);
  };

  return (
    <PageContainer maxWidth="28rem" className="break-keep">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={1}>이어서 풀어볼까요?</Heading>
          <div title={`${attempt.spreadsheetName} · ${attempt.sheetTabName}`}>
            <Text color="secondary" maxLines={1} display="block">
              {attempt.spreadsheetName} · {attempt.sheetTabName}
            </Text>
          </div>
          <Text color="secondary">
            {summary.answered}/{summary.total} 답변 완료
          </Text>
        </VStack>
        <div className="flex flex-wrap gap-2.5">
          <Button
            label="이어서 풀기"
            variant="primary"
            onClick={() => navigate(`/quiz/${attemptId}`)}
          />
          <Button
            label={restarting ? "초기화 중…" : "처음부터 다시 풀기"}
            isDisabled={restarting}
            onClick={() => void restart()}
          />
        </div>
      </VStack>
    </PageContainer>
  );
}
