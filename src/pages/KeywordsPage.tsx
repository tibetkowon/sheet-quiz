import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useLatestRequest } from "../app/useLatestRequest";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
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

  return (
    <PageContainer maxWidth="42rem" className="[overflow-wrap:anywhere]">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-2 min-h-11 text-sm underline"
      >
        뒤로 가기
      </button>
      <h1 className="mb-5 font-display text-xl font-semibold">키워드 정리</h1>
      {result === "loading" ? (
        <p className="text-sm">불러오는 중…</p>
      ) : result === "missing" ? (
        <p className="text-sm">
          이 시트에 '키워드' 탭이 없습니다. 시트에 '키워드' 탭을 추가하면 시험 전에 키워드 정리본을
          볼 수 있습니다.
        </p>
      ) : !result.ok ? (
        <ErrorBanner message={result.error} onRetry={load} />
      ) : result.groups.length === 0 ? (
        <p className="text-sm">키워드가 아직 없습니다</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {result.groups.map(({ category, entries }) => (
            <details
              key={category}
              className="rounded-lg border border-border bg-surface dark:border-border-dark dark:bg-surface-dark"
            >
              <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
                {category}
              </summary>
              <ul className="flex flex-col gap-2 px-4 pb-4 text-sm">
                {entries.map(({ keyword, description }, index) => (
                  <li key={index}>
                    <strong>{keyword}</strong>
                    {description && (
                      <p className="text-text-secondary dark:text-text-dark-secondary">
                        {description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
