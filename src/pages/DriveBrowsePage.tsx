import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFile, DriveFolder, listChildFolders, listSheetFiles } from "../drive/driveClient";
import { getTopFolder, TopFolderSelection } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

interface FolderLevel {
  id: string;
  name: string;
}

interface LocationState {
  trail?: FolderLevel[];
}

export default function DriveBrowsePage() {
  const { getAccessToken, googleUserId, status, markExpired } = useAuth();
  const { folderId } = useParams<{ folderId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [topFolder, setTopFolder] = useState<TopFolderSelection | null | undefined>(undefined);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!googleUserId) return;
    void getTopFolder(googleUserId)
      .then((saved) => setTopFolder(saved ?? null))
      .catch(() => {
        setTopFolder(null);
        setError("저장된 최상위 폴더를 불러오지 못했습니다.");
      });
  }, [googleUserId]);

  const currentFolderId = folderId ?? topFolder?.folderId ?? null;
  const trail = (location.state as LocationState | null)?.trail ?? [];

  const load = useCallback(async () => {
    if (!currentFolderId) return;
    const accessToken = getAccessToken();
    if (!accessToken) {
      setLoading(false);
      setError("Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [folderResult, fileResult] = await Promise.all([
        listChildFolders(accessToken, currentFolderId),
        listSheetFiles(accessToken, currentFolderId),
      ]);
      setFolders(folderResult);
      setFiles(fileResult);
    } catch (err) {
      if (err instanceof DriveApiError && err.status === 401) markExpired();
      setError(err instanceof DriveApiError ? err.message : "폴더 내용을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, getAccessToken, markExpired]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    navigate(`/folders/${folder.id}`, { state: { trail: [...trail, { id: folder.id, name: folder.name }] } });
  };

  const openFile = (file: DriveFile) => {
    navigate(`/sheets/${file.id}/tabs`, { state: { fileName: file.name } });
  };

  if (status !== "connected") {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          Google 연결이 필요합니다. 시작 화면에서 다시 연결해주세요.
        </p>
      </div>
    );
  }

  if (topFolder === undefined) {
    return <p className="px-10 py-7 text-sm">불러오는 중…</p>;
  }

  if (topFolder === null) {
    return (
      <div className="px-10 py-7">
        <p className="mb-4 text-sm text-text-secondary dark:text-text-dark-secondary">
          먼저 문제은행 최상위 폴더를 선택해주세요.
        </p>
      </div>
    );
  }

  const breadcrumbItems: BreadcrumbItem[] = [
    {
      label: topFolder.folderName,
      onClick:
        trail.length > 0
          ? () => navigate(`/folders/${topFolder.folderId}`, { state: { trail: [] } })
          : undefined,
    },
    ...trail.map((level, index) => ({
      label: level.name,
      onClick:
        index < trail.length - 1
          ? () => navigate(`/folders/${level.id}`, { state: { trail: trail.slice(0, index + 1) } })
          : undefined,
    })),
  ];

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={breadcrumbItems} />
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">불러오는 중…</p>
      ) : folders.length === 0 && files.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          하위 폴더나 Sheet 파일이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
          {folders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">📁 {folder.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {folder.modifiedTime}
                </span>
              </button>
            </li>
          ))}
          {files.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                onClick={() => openFile(file)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{file.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {file.modifiedTime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
