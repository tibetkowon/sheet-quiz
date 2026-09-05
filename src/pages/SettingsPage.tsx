import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { clearTopFolder } from "../storage/topFolderRepo";
import { deleteAttempt, listAttemptsByUser } from "../storage/attemptRepo";

export default function SettingsPage() {
  const { googleUserId, email, disconnect } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const resetTopFolder = async () => {
    if (!googleUserId) return;
    setBusy(true);
    try {
      await clearTopFolder(googleUserId);
      navigate("/folders/select");
    } finally {
      setBusy(false);
    }
  };

  const deleteAllData = async () => {
    if (!googleUserId) return;
    if (!window.confirm("저장된 모든 풀이 기록과 폴더 설정을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    const attempts = await listAttemptsByUser(googleUserId);
    await Promise.allSettled(attempts.map((attempt) => deleteAttempt(attempt.id)));
    await clearTopFolder(googleUserId).catch(() => undefined);
    setBusy(false);
    disconnect();
    navigate("/");
  };

  if (!googleUserId) {
    return (
      <div className="px-10 py-7">
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 계정을 연결하면 설정을 볼 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-10 py-7">
      <h1 className="mb-2 font-display text-xl font-semibold">설정</h1>
      <p className="mb-6 text-sm text-text-secondary dark:text-text-dark-secondary">{email}</p>

      <div className="mb-4 rounded-lg border border-border bg-surface p-5 dark:border-border-dark dark:bg-surface-dark">
        <div className="mb-1 text-sm font-semibold">최상위 폴더 재설정</div>
        <p className="mb-3 text-xs text-text-secondary dark:text-text-dark-secondary">
          문제은행으로 사용할 Drive 최상위 폴더를 다시 선택합니다.
        </p>
        <button
          type="button"
          onClick={() => void resetTopFolder()}
          disabled={busy}
          className="rounded border border-border px-3.5 py-2 text-xs disabled:opacity-60 dark:border-border-dark"
        >
          폴더 다시 선택
        </button>
      </div>

      <div className="mb-4 rounded-lg border border-danger bg-surface p-5 dark:bg-surface-dark">
        <div className="mb-1 text-sm font-semibold text-danger">전체 데이터 삭제</div>
        <p className="mb-3 text-xs text-text-secondary dark:text-text-dark-secondary">
          저장된 모든 풀이 기록과 폴더 설정을 브라우저에서 삭제하고 연결을 해제합니다.
        </p>
        <button
          type="button"
          onClick={() => void deleteAllData()}
          disabled={busy}
          className="rounded border border-danger px-3.5 py-2 text-xs text-danger disabled:opacity-60"
        >
          모든 데이터 삭제
        </button>
      </div>
    </div>
  );
}
