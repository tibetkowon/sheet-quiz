import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFolder, listChildFolders } from "../drive/driveClient";
import { getTopFolder, TopFolderSelection } from "../storage/topFolderRepo";
import { Breadcrumb } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

export default function CertificationFoldersPage() {
  const { getAccessToken, googleUserId } = useAuth();
  const [topFolder, setTopFolder] = useState<TopFolderSelection | null | undefined>(undefined);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleUserId) return;
    void getTopFolder(googleUserId).then((saved) => setTopFolder(saved ?? null));
  }, [googleUserId]);

  useEffect(() => {
    if (!topFolder) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    listChildFolders(accessToken, topFolder.folderId)
      .then(setFolders)
      .catch((err) =>
        setError(err instanceof DriveApiError ? err.message : "자격증 폴더 목록을 불러오지 못했습니다."),
      );
  }, [topFolder, getAccessToken]);

  if (topFolder === undefined) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (topFolder === null) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          먼저 문제은행 최상위 폴더를 선택해주세요.
        </p>
        <Link to="/folders/select" className="text-sm font-semibold text-accent dark:text-accent-dark">
          최상위 폴더 선택하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={[{ label: "내 드라이브" }, { label: topFolder.folderName }]} />
      {error && <ErrorBanner message={error} />}
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
        {folders.map((folder) => (
          <li key={folder.id} className="flex items-center justify-between px-4.5 py-3.5">
            <span className="text-sm font-medium">{folder.name}</span>
            <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
              {folder.modifiedTime}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
