import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { useAuth } from "../auth/AuthContext";
import { useLatestRequest } from "../app/useLatestRequest";
import { getSheetValues, SheetsApiError } from "../sheets/sheetsClient";
import { parseSheetRows } from "../sheets/parseQuestions";
import { validateQuestions } from "../sheets/validateQuestions";
import { createAttemptId, createSetFingerprint } from "../sheets/fingerprint";
import { buildValidationIssuesMarkdown } from "../sheets/validationExport";
import type { ValidationIssue } from "../sheets/types";
import { downloadTextFile } from "../quiz/export";
import type { Question } from "../types/question";
import { createInitialProgress } from "../types/progress";
import type { StudyAttempt } from "../types/studyAttempt";
import { getAttempt, saveAttempt } from "../storage/attemptRepo";
import { DriveReconnectNotice } from "../components/DriveReconnectNotice";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";

interface LocationState {
  fileName?: string;
  tabId?: number;
  tabTitle?: string;
  sourceModifiedTime?: string;
  parentFolderId?: string;
  certificationFolderName?: string;
}

export default function SheetValidationPage() {
  const { getAccessToken, markExpired, googleUserId, status: authStatus } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";
  const tabTitle = state.tabTitle ?? "";
  const tabId = state.tabId != null ? String(state.tabId) : "";

  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const beginRequest = useLatestRequest(JSON.stringify([location.key, googleUserId, authStatus]));

  const load = useCallback(() => {
    const isLatest = beginRequest();
    setStarting(false);
    if (!spreadsheetId) return;
    if (!tabTitle) {
      setStatus("error");
      setLoadError("탭 정보를 찾을 수 없습니다. Sheet 파일을 다시 선택해주세요.");
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) {
      setStatus("error");
      setLoadError(
        "Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.",
      );
      return;
    }
    setStatus("loading");
    setLoadError(null);
    getSheetValues(accessToken, spreadsheetId, tabTitle)
      .then((rawRows) => {
        if (!isLatest()) return;
        const { headerIndex, rows } = parseSheetRows(rawRows);
        const result = validateQuestions(headerIndex, rows, {
          sheetName: tabTitle,
          spreadsheetId,
          sheetTabId: tabId,
        });
        setQuestions(result.questions);
        setIssues(result.issues);
        setStatus("done");
      })
      .catch((err) => {
        if (!isLatest()) return;
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setStatus("error");
        setLoadError(
          err instanceof SheetsApiError ? err.message : "Sheet 데이터를 불러오지 못했습니다.",
        );
      });
  }, [spreadsheetId, tabTitle, tabId, getAccessToken, markExpired, beginRequest]);

  useEffect(() => {
    load();
  }, [load]);

  const startQuiz = useCallback(async () => {
    if (!spreadsheetId || !googleUserId) return;
    const isLatest = beginRequest();
    setStarting(true);
    try {
      const fingerprint = createSetFingerprint(questions);
      const attemptId = createAttemptId(googleUserId, spreadsheetId, tabId, fingerprint);
      const existing = await getAttempt(attemptId);
      if (!isLatest()) return;
      if (existing) {
        const hasProgress = existing.progress.some((p) => p.status !== "UNSEEN");
        navigate(hasProgress ? `/quiz/${attemptId}/resume` : `/quiz/${attemptId}`);
        return;
      }
      const now = new Date().toISOString();
      const attempt: StudyAttempt = {
        id: attemptId,
        googleUserId,
        spreadsheetId,
        spreadsheetName: fileName,
        sheetTabId: tabId,
        sheetTabName: tabTitle,
        parentFolderId: state.parentFolderId ?? "",
        certificationFolderName: state.certificationFolderName ?? fileName,
        questionSetFingerprint: fingerprint,
        sourceModifiedTime: state.sourceModifiedTime ?? "",
        lastViewedIndex: 0,
        startedAt: now,
        updatedAt: now,
        progress: questions.map((q) => createInitialProgress(q.id)),
        questionSnapshot: questions,
      };
      await saveAttempt(attempt);
      if (!isLatest()) return;
      navigate(`/quiz/${attemptId}`);
    } finally {
      if (isLatest()) setStarting(false);
    }
  }, [
    beginRequest,
    spreadsheetId,
    googleUserId,
    questions,
    tabId,
    tabTitle,
    fileName,
    state.parentFolderId,
    state.certificationFolderName,
    state.sourceModifiedTime,
    navigate,
  ]);

  const keywordsButton = (
    <Button label="키워드 보기" onClick={() => navigate(`/sheets/${spreadsheetId}/keywords`)} />
  );

  if (status === "loading") {
    return (
      <PageContainer maxWidth="42rem">
        <VStack gap={4} align="start">
          <LoadingIndicator />
          {keywordsButton}
        </VStack>
      </PageContainer>
    );
  }

  if (status === "error") {
    if (googleUserId && authStatus !== "connected") return <DriveReconnectNotice />;
    return (
      <PageContainer maxWidth="42rem" className="[overflow-wrap:anywhere]">
        <VStack gap={4} align="start">
          <ErrorBanner
            message={loadError ?? "Sheet 데이터를 불러오지 못했습니다."}
            onRetry={load}
          />
          {keywordsButton}
        </VStack>
      </PageContainer>
    );
  }

  const errorIssues = issues.filter((i) => i.severity === "error");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  const copyIssuesList = async () => {
    await navigator.clipboard.writeText(
      buildValidationIssuesMarkdown(errorIssues.length > 0 ? errorIssues : issues),
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadIssuesList = () => {
    downloadTextFile(
      "sheet-validation-issues.md",
      buildValidationIssuesMarkdown(errorIssues.length > 0 ? errorIssues : issues),
      "text/markdown",
    );
  };

  if (errorIssues.length > 0) {
    return (
      <PageContainer maxWidth="42rem" className="break-keep [overflow-wrap:anywhere]">
        <VStack gap={5} align="start">
          <VStack gap={1}>
            <Heading level={1}>시트에서 고칠 부분이 {errorIssues.length}곳 있어요</Heading>
            <Text weight="semibold" as="div" display="block">
              {fileName || "문제 세트"}
            </Text>
            <Text color="secondary" as="p">
              아래 위치를 시트에서 수정한 뒤 다시 검증해 주세요.
            </Text>
          </VStack>
          <VStack as="ul" gap={3} width="100%">
            {errorIssues.map((issue, i) => (
              <li key={i} className="list-none">
                <Card variant="red">
                  <VStack gap={1} align="start">
                    <Badge variant="error" label="오류" />
                    <Text type="supporting" as="div">
                      {issue.sheetName} · {issue.rowNumber}행
                      {issue.questionNumber != null ? ` · 문제 ${issue.questionNumber}번` : ""}
                    </Text>
                    <Text as="div">{issue.message}</Text>
                  </VStack>
                </Card>
              </li>
            ))}
          </VStack>
          <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
            <Button label="다시 검증" variant="primary" onClick={load} />
            <Button
              label={copied ? "복사됨" : "오류 목록 복사"}
              onClick={() => void copyIssuesList()}
            />
            <Button label="Markdown 다운로드" onClick={downloadIssuesList} />
            <Button
              label="Google Sheet 원본 열기"
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`}
              target="_blank"
              rel="noreferrer"
            />
            {keywordsButton}
          </div>
        </VStack>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="42rem" className="break-keep [overflow-wrap:anywhere]">
      <VStack gap={5} align="start">
        <VStack gap={1}>
          <Heading level={1}>검증 완료</Heading>
          <Text weight="semibold" as="div" display="block">
            {fileName || "문제 세트"}
          </Text>
          <Text color="secondary" as="p">
            {tabTitle} 탭 · 문제 {questions.length}개
            {warningIssues.length > 0 ? ` · 경고 ${warningIssues.length}건` : ""}
          </Text>
        </VStack>
        {warningIssues.length > 0 && (
          <VStack as="ul" gap={2} width="100%">
            {warningIssues.map((issue, i) => (
              <li key={i} className="list-none">
                <Card variant="yellow" padding={3}>
                  <VStack gap={1} align="start">
                    <Badge variant="warning" label="경고" />
                    <Text type="supporting" as="div">
                      {issue.sheetName} · {issue.rowNumber}행 · {issue.message}
                    </Text>
                  </VStack>
                </Card>
              </li>
            ))}
          </VStack>
        )}
        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row sm:flex-wrap">
          {questions.length === 0 ? (
            <Text color="secondary" as="p">
              이 시트에는 풀 수 있는 문제가 없습니다. 문제 데이터를 추가한 뒤 다시 검증해주세요.
            </Text>
          ) : (
            <Button
              label={starting ? "준비 중…" : "풀이 시작"}
              variant="primary"
              isDisabled={starting}
              onClick={() => void startQuiz()}
            />
          )}
          {keywordsButton}
        </div>
      </VStack>
    </PageContainer>
  );
}
