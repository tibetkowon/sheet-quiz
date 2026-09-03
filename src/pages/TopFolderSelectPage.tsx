import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFolder, listChildFolders, listRootFolders } from "../drive/driveClient";
import { saveTopFolder } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { ErrorBanner } from "../components/ErrorBanner";

interface FolderLevel {
  id: string;
  name: string;
}

export default function TopFolderSelectPage() {
  const { getAccessToken, googleUserId } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState<FolderLevel[]>([{ id: "root", name: "내 드라이브" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = path[path.length - 1];

  const load = useCallback(async () => {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result =
        currentFolder.id === "root"
          ? await listRootFolders(accessToken)
          : await listChildFolders(accessToken, currentFolder.id);
      setFolders(result);
    } catch (err) {
      setError(err instanceof DriveApiError ? err.message : "Drive 폴더 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [currentFolder.id, getAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery("");
  };

  const selectAsTopFolder = async () => {
    if (!googleUserId) return;
    await saveTopFolder({
      googleUserId,
      folderId: currentFolder.id,
      folderName: currentFolder.name,
      updatedAt: new Date().toISOString(),
    });
    navigate("/folders");
  };

  const breadcrumbItems: BreadcrumbItem[] = path.map((level, index) => ({
    label: level.name,
    onClick: index < path.length - 1 ? () => setPath(path.slice(0, index + 1)) : undefined,
  }));

  const visibleFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl px-10 py-7">
      <Breadcrumb items={breadcrumbItems} />

      <div className="mb-5 flex items-center justify-between gap-3">
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="폴더 또는 파일 검색"
          className="flex-1 rounded border border-border bg-sunken px-3.5 py-2.5 text-sm dark:border-border-dark dark:bg-sunken-dark"
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border px-3.5 py-2.5 text-sm dark:border-border-dark"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={() => void selectAsTopFolder()}
          className="rounded bg-accent px-3.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
        >
          이 폴더를 문제은행 최상위 폴더로 선택
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">불러오는 중…</p>
      ) : visibleFolders.length === 0 ? (
        <p className="text-sm text-text-secondary dark:text-text-dark-secondary">
          하위 폴더가 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border dark:divide-border-dark dark:border-border-dark">
          {visibleFolders.map((folder) => (
            <li key={folder.id}>
              <button
                type="button"
                onClick={() => openFolder(folder)}
                className="flex w-full items-center justify-between px-4.5 py-3.5 text-left"
              >
                <span className="text-sm font-medium">{folder.name}</span>
                <span className="font-mono text-xs text-text-secondary dark:text-text-dark-secondary">
                  {folder.modifiedTime}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
