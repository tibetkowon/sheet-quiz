import { useNavigate } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageContainer } from "../components/PageContainer";
import { AUTH_ERROR_MESSAGES } from "../auth/googleAuthError";

export default function StartPage() {
  const { status, error, connect } = useAuth();
  const navigate = useNavigate();

  const handleConnect = async () => {
    const success = await connect();
    if (success) navigate("/folders");
  };

  return (
    <PageContainer maxWidth="524px" className="flex min-h-screen flex-col items-center justify-center [overflow-wrap:anywhere]">
      <VStack gap={5} align="center" maxWidth={460}>
        <Heading level={1}>풀이장</Heading>
        <div className="text-center break-keep">
          <Text color="secondary" as="p">
            Google Drive에 저장된 시트 문제은행을 연결해 자격증 문제를 한 문제씩
            풀고, 채점과 해설을 확인하는 개인용 도구입니다. 서버 없이 브라우저에서만
            동작하며, 시트 데이터는 어디로도 전송되지 않습니다.
          </Text>
        </div>

        {error && <ErrorBanner message={AUTH_ERROR_MESSAGES[error.code]} onRetry={handleConnect} />}

        <Button
          label={status === "connecting" ? "연결하는 중…" : "Google Drive 연결"}
          variant="primary"
          size="lg"
          width="100%"
          isDisabled={status === "connecting"}
          onClick={() => void handleConnect()}
        />
        <div className="text-center break-keep">
          <Text type="supporting" as="p">
            읽기 권한만 요청합니다. 계정 정보는 브라우저에만 저장됩니다.
          </Text>
        </div>
      </VStack>
    </PageContainer>
  );
}
