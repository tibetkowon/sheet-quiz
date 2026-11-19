import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageContainer } from "../components/PageContainer";
import { clearTopFolder } from "../storage/topFolderRepo";
import { deleteAttempt, listAttemptsByUser } from "../storage/attemptRepo";

export default function SettingsPage() {
  const { googleUserId, email, disconnect } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const resetTopFolder = async () => {
    if (!googleUserId) return;
    setBusy(true);
    setError(null);
    try {
      await clearTopFolder(googleUserId);
      navigate("/folders/select");
    } catch {
      setError("폴더 설정을 초기화하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  const deleteAllData = async () => {
    if (!googleUserId) return;
    setBusy(true);
    setError(null);
    try {
      const attempts = await listAttemptsByUser(googleUserId);
      const results = await Promise.allSettled(
        attempts.map((attempt) => deleteAttempt(attempt.id)),
      );
      if (results.some((result) => result.status === "rejected")) {
        setError("일부 풀이 기록을 삭제하지 못했습니다. 다시 시도해주세요.");
        return;
      }
      await clearTopFolder(googleUserId);
      disconnect();
      navigate("/");
    } catch {
      setError("전체 데이터 삭제를 완료하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  if (!googleUserId) {
    return (
      <PageContainer maxWidth="28rem" className="break-keep [overflow-wrap:anywhere]">
        <Text color="secondary" as="p">
          Google 계정을 연결하면 설정을 볼 수 있습니다.
        </Text>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="28rem" className="break-keep [overflow-wrap:anywhere]">
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={1}>설정</Heading>
          <Text color="secondary">{email}</Text>
        </VStack>

        {error && <ErrorBanner message={error} />}

        <Card>
          <VStack gap={3} align="start">
            <VStack gap={1}>
              <Heading level={2}>최상위 폴더 재설정</Heading>
              <Text type="supporting" as="p">
                문제은행으로 사용할 Drive 최상위 폴더를 다시 선택합니다.
              </Text>
            </VStack>
            <Button
              label="폴더 다시 선택"
              isDisabled={busy}
              onClick={() => void resetTopFolder()}
            />
          </VStack>
        </Card>

        <Card>
          <VStack gap={3} align="start">
            <VStack gap={1}>
              <Heading level={2}>전체 데이터 삭제</Heading>
              <Text type="supporting" as="p">
                저장된 모든 풀이 기록과 폴더 설정을 삭제하고 연결을 해제합니다. 모든 기기에서 풀이
                기록이 삭제됩니다.
              </Text>
            </VStack>
            <Button
              label="모든 데이터 삭제"
              variant="destructive"
              isDisabled={busy}
              onClick={() => setIsConfirmOpen(true)}
            />
          </VStack>
        </Card>
      </VStack>
      <AlertDialog
        isOpen={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title="모든 데이터 삭제"
        description="저장된 모든 풀이 기록과 폴더 설정을 삭제할까요? 모든 기기에서 풀이 기록이 삭제되며 되돌릴 수 없습니다."
        actionLabel="모두 삭제"
        cancelLabel="취소"
        onAction={() => {
          setIsConfirmOpen(false);
          void deleteAllData();
        }}
      />
    </PageContainer>
  );
}
