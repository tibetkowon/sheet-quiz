import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuth } from "../auth/AuthContext";
import { AUTH_ERROR_MESSAGES } from "../auth/googleAuthError";
import { ErrorBanner } from "./ErrorBanner";
import { PageContainer } from "./PageContainer";

export function DriveReconnectNotice() {
  const { status, error, connect } = useAuth();
  return (
    <PageContainer maxWidth="42rem" className="break-keep">
      {error && <ErrorBanner message={AUTH_ERROR_MESSAGES[error.code]} />}
      <VStack gap={3} align="start">
        <Text color="secondary" as="p">
          Google Drive 연결이 끊어졌습니다. 다시 연결하면 이 화면을 계속 볼 수 있습니다.
        </Text>
        <Button
          label="드라이브 다시 연결"
          variant="primary"
          isDisabled={status === "connecting"}
          onClick={() => void connect()}
        />
      </VStack>
    </PageContainer>
  );
}
