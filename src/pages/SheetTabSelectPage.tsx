import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useLatestRequest } from "../app/useLatestRequest";
import { listSheetTabs, pickQuestionTab, SheetsApiError, SheetTab } from "../sheets/sheetsClient";
import { ErrorBanner } from "../components/ErrorBanner";

interface LocationState {
  fileName?: string;
  sourceModifiedTime?: string;
  parentFolderId?: string;
  certificationFolderName?: string;
}

export default function SheetTabSelectPage() {
  const { getAccessToken, markExpired, googleUserId, status } = useAuth();
  const { spreadsheetId } = useParams<{ spreadsheetId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as LocationState | null) ?? {};
  const fileName = state.fileName ?? "";
  const sourceModifiedTime = state.sourceModifiedTime;
  const parentFolderId = state.parentFolderId;
  const certificationFolderName = state.certificationFolderName;

  const [tabs, setTabs] = useState<SheetTab[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const beginRequest = useLatestRequest(JSON.stringify([location.key, googleUserId, status]));

  useEffect(() => {
    const isLatest = beginRequest();
    setTabs(null);
    setError(null);
    if (!spreadsheetId) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    listSheetTabs(accessToken, spreadsheetId)
      .then((result) => {
        if (!isLatest()) return;
        setTabs(result);
        const { autoSelected } = pickQuestionTab(result);
        if (autoSelected) {
          navigate(`/sheets/${spreadsheetId}/validate`, {
            replace: true,
            state: {
              fileName,
              sourceModifiedTime,
              parentFolderId,
              certificationFolderName,
              tabId: autoSelected.sheetId,
              tabTitle: autoSelected.title,
            },
          });
        }
      })
      .catch((err) => {
        if (!isLatest()) return;
        if (err instanceof SheetsApiError && err.status === 401) markExpired();
        setError(err instanceof SheetsApiError ? err.message : "Sheet 탭 목록을 불러오지 못했습니다.");
      });
  }, [
    beginRequest,
    spreadsheetId,
    getAccessToken,
    markExpired,
    navigate,
    fileName,
    sourceModifiedTime,
    parentFolderId,
    certificationFolderName,
  ]);

  const selectTab = (tab: SheetTab) => {
    navigate(`/sheets/${spreadsheetId}/validate`, {
      state: {
        fileName,
        sourceModifiedTime,
        parentFolderId,
        certificationFolderName,
        tabId: tab.sheetId,
        tabTitle: tab.title,
      },
    });
  };

  if (error) {
    return (
      <div className="px-10 py-7">
        <ErrorBanner message={error} />
      </div>
    );
  }

  if (!tabs) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  const { candidates } = pickQuestionTab(tabs);

  if (tabs.length === 0) {
    return (
      <div className="px-10 py-7">
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          이 Sheet 파일에 탭이 없습니다. 다른 파일을 선택해주세요.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-10 py-7">
      <h1 className="mb-4 font-display text-xl font-semibold">문제 탭을 선택해주세요</h1>
      <ul className="flex flex-col gap-2">
        {candidates.map((tab) => (
          <li key={tab.sheetId}>
            <button
              type="button"
              onClick={() => selectTab(tab)}
              className="w-full rounded-lg border border-border px-4 py-3 text-left text-sm dark:border-border-dark"
            >
              {tab.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
