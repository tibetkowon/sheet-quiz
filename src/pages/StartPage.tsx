import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { AUTH_ERROR_MESSAGES } from "../auth/googleAuthError";

export default function StartPage() {
  const { status, error, connect } = useAuth();
  const navigate = useNavigate();

  const handleConnect = async () => {
    const success = await connect();
    if (success) navigate("/folders");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-10">
      <div className="w-full max-w-[460px] text-center">
        <h1 className="mb-3 font-display text-3xl font-bold tracking-tight">풀이장</h1>
        <p className="mb-8 text-[15px] leading-7 text-text-secondary dark:text-text-dark-secondary">
          Google Drive에 저장된 시트 문제은행을 연결해 자격증 문제를 한 문제씩
          풀고, 채점과 해설을 확인하는 개인용 도구입니다. 서버 없이 브라우저에서만
          동작하며, 시트 데이터는 어디로도 전송되지 않습니다.
        </p>

        {error && <ErrorBanner message={AUTH_ERROR_MESSAGES[error.code]} onRetry={handleConnect} />}

        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={status === "connecting"}
          className="w-full rounded bg-accent px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-60 dark:bg-accent-dark"
        >
          {status === "connecting" ? "연결하는 중…" : "Google Drive 연결"}
        </button>
        <p className="mt-2.5 text-xs text-text-secondary dark:text-text-dark-secondary">
          읽기 권한만 요청합니다. 계정 정보는 브라우저에만 저장됩니다.
        </p>
      </div>
    </div>
  );
}
