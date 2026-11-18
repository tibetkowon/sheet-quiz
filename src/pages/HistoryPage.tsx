import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuth } from "../auth/AuthContext";
import { formatIsoDate } from "../app/formatDate";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";
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
      <PageContainer maxWidth="42rem" className="break-keep">
        <VStack gap={3} align="start">
          <Text color="secondary" as="p">
            Google 계정을 연결하면 저장된 풀이 기록을 볼 수 있습니다.
          </Text>
          <Link href="/" isStandalone weight="semibold">
            시작 화면으로 이동
          </Link>
        </VStack>
      </PageContainer>
    );
  }

  if (attempts === null && loadError) {
    return (
      <PageContainer maxWidth="42rem">
        <ErrorBanner message={loadError} onRetry={load} />
      </PageContainer>
    );
  }

  if (attempts === null) {
    return (
      <PageContainer maxWidth="42rem">
        <LoadingIndicator />
      </PageContainer>
    );
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
    <PageContainer maxWidth="42rem" className="break-keep">
      <VStack gap={4}>
        <Heading level={1}>저장된 풀이 기록</Heading>
        {loadError && <ErrorBanner message={loadError} onRetry={load} />}
        {deleteError && <ErrorBanner message={deleteError} />}
        {attempts.length === 0 ? (
          <Text color="secondary" as="p">
            아직 저장된 풀이 기록이 없습니다.
          </Text>
        ) : (
          <VStack as="ul" gap={3}>
            {attempts.map((attempt) => {
              const summary = summarizeProgress(attempt.progress);
              const isSubmitted = Boolean(attempt.result);
              const name = `${attempt.certificationFolderName} ${attempt.sheetTabName}`;
              return (
                <li key={attempt.id} className="min-w-0 list-none">
                  <Card>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div title={`${attempt.certificationFolderName} · ${attempt.sheetTabName}`}>
                          <Text weight="semibold" maxLines={1} display="block">
                            {attempt.certificationFolderName} · {attempt.sheetTabName}
                          </Text>
                        </div>
                        <Text type="supporting" as="div">
                          {isSubmitted
                            ? `제출완료 · ${attempt.result!.scorePercent}%`
                            : `진행 중 · ${summary.answered}/${summary.total}`}
                          {" · "}
                          {formatIsoDate(attempt.updatedAt)}
                        </Text>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <Button
                          size="sm"
                          label={isSubmitted ? "결과 보기" : "이어서 풀기"}
                          aria-label={`${name} ${isSubmitted ? "결과 보기" : "이어서 풀기"}`}
                          onClick={() =>
                            navigate(isSubmitted ? `/results/${attempt.id}` : `/quiz/${attempt.id}`)
                          }
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          label="삭제"
                          aria-label={`${name} 삭제`}
                          onClick={() => void handleDelete(attempt.id)}
                        />
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </VStack>
        )}
      </VStack>
    </PageContainer>
  );
}
