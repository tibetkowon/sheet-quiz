import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useLatestRequest } from "../app/useLatestRequest";
import { useAuth } from "../auth/AuthContext";
import { DriveReconnectNotice } from "../components/DriveReconnectNotice";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";
import { parseKeywordRows, type ParseKeywordResult } from "../sheets/parseKeywordRows";
import { getSheetValues, SheetsApiError } from "../sheets/sheetsClient";

export default function KeywordsPage() {
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const { key } = useLocation();
  const navigate = useNavigate();
  const { getAccessToken, markExpired, googleUserId, status } = useAuth();
  const beginRequest = useLatestRequest(JSON.stringify([key, googleUserId, status]));
  const [result, setResult] = useState<ParseKeywordResult | "loading" | "missing">("loading");

  const load = useCallback(() => {
    const isLatest = beginRequest();
    if (!spreadsheetId) return;
    const token = getAccessToken();
    if (!token) {
      setResult({
        ok: false,
        error:
          "Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.",
      });
      return;
    }
    setResult("loading");
    getSheetValues(token, spreadsheetId, "키워드")
      .then((rows) => {
        if (isLatest()) setResult(parseKeywordRows(rows));
      })
      .catch((err) => {
        if (!isLatest()) return;
        if (err instanceof SheetsApiError && err.status === 400) {
          setResult("missing");
          return;
        }
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setResult({
          ok: false,
          error:
            err instanceof SheetsApiError ? err.message : "Sheet 데이터를 불러오지 못했습니다.",
        });
      });
  }, [beginRequest, spreadsheetId, getAccessToken, markExpired]);

  useEffect(() => {
    load();
  }, [load]);

  if (typeof result === "object" && !result.ok && googleUserId && status !== "connected") {
    return <DriveReconnectNotice />;
  }

  return (
    <PageContainer maxWidth="42rem" className="break-keep [overflow-wrap:anywhere]">
      <VStack gap={4} align="start">
        <Button label="뒤로 가기" variant="ghost" size="sm" onClick={() => navigate(-1)} />
        <Heading level={1}>키워드 정리</Heading>
        {result === "loading" ? (
          <LoadingIndicator />
        ) : result === "missing" ? (
          <Text as="p">
            이 시트에 '키워드' 탭이 없습니다. 시트에 '키워드' 탭을 추가하면 시험 전에 키워드
            정리본을 볼 수 있습니다.
          </Text>
        ) : !result.ok ? (
          <ErrorBanner message={result.error} onRetry={load} />
        ) : result.groups.length === 0 ? (
          <Text as="p">키워드가 아직 없습니다</Text>
        ) : (
          <VStack gap={3} width="100%">
            {result.groups.map(({ category, entries }) => (
              <Card key={category} padding={3}>
                <Collapsible trigger={category} defaultIsOpen={false}>
                  <VStack as="ul" gap={0} paddingBlockStart={3}>
                    {entries.map(({ keyword, description }, index) => (
                      <li
                        key={index}
                        className="list-none border-t border-[var(--color-border)] py-3"
                      >
                        <Text weight="semibold" as="div" display="block">
                          {keyword}
                        </Text>
                        {description && (
                          <Text color="secondary" as="p" display="block">
                            {description}
                          </Text>
                        )}
                      </li>
                    ))}
                  </VStack>
                </Collapsible>
              </Card>
            ))}
          </VStack>
        )}
      </VStack>
    </PageContainer>
  );
}
