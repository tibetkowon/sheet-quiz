import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Item } from "@astryxdesign/core/Item";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { Folder } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useLatestRequest } from "../app/useLatestRequest";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFolder, listChildFolders, listRootFolders } from "../drive/driveClient";
import { saveTopFolder } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { formatIsoDate } from "../app/formatDate";
import { DriveReconnectNotice } from "../components/DriveReconnectNotice";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";

interface FolderLevel {
  id: string;
  name: string;
}

export default function TopFolderSelectPage() {
  const { getAccessToken, googleUserId, markExpired, status } = useAuth();
  const navigate = useNavigate();
  const [path, setPath] = useState<FolderLevel[]>([{ id: "root", name: "내 드라이브" }]);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentFolder = path[path.length - 1];

  const requestScope = JSON.stringify([currentFolder.id, googleUserId, status]);
  const beginRequest = useLatestRequest(requestScope);
  const beginSelection = useLatestRequest(requestScope);

  const load = useCallback(async () => {
    const isLatest = beginRequest();
    const accessToken = getAccessToken();
    if (!accessToken) {
      setLoading(false);
      setError(
        "Google 연결이 필요합니다. 상단의 '풀이장' 로고를 눌러 시작 화면에서 다시 연결해주세요.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result =
        currentFolder.id === "root"
          ? await listRootFolders(accessToken)
          : await listChildFolders(accessToken, currentFolder.id);
      if (!isLatest()) return;
      setFolders(result);
    } catch (err) {
      if (!isLatest()) return;
      if (err instanceof DriveApiError && err.status === 401) {
        markExpired();
      }
      setError(
        err instanceof DriveApiError ? err.message : "Drive 폴더 목록을 불러오지 못했습니다.",
      );
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [currentFolder.id, getAccessToken, markExpired, beginRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    setPath((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery("");
  };

  const selectAsTopFolder = async () => {
    if (!googleUserId) return;
    const isLatest = beginSelection();
    try {
      await saveTopFolder({
        googleUserId,
        folderId: currentFolder.id,
        folderName: currentFolder.name,
        updatedAt: new Date().toISOString(),
      });
      if (isLatest()) navigate("/folders");
    } catch {
      if (!isLatest()) return;
      setError("최상위 폴더 저장에 실패했습니다. 다시 시도해주세요.");
    }
  };

  if (error && googleUserId && status !== "connected") return <DriveReconnectNotice />;

  const breadcrumbItems: BreadcrumbItem[] = path.map((level, index) => ({
    label: level.name,
    onClick: index < path.length - 1 ? () => setPath(path.slice(0, index + 1)) : undefined,
  }));

  const visibleFolders = folders.filter((folder) =>
    folder.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <PageContainer maxWidth="48rem">
      <Breadcrumb items={breadcrumbItems} />

      <div className="mb-5 flex min-w-0 flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <TextInput
            label="폴더 또는 파일 검색"
            isLabelHidden
            placeholder="폴더 또는 파일 검색"
            value={searchQuery}
            onChange={setSearchQuery}
          />
        </div>
        <Button label="새로고침" onClick={() => void load()} />
        <div className="w-full sm:w-auto">
          <Button
            label="이 폴더를 문제은행 최상위 폴더로 선택"
            variant="primary"
            width="100%"
            onClick={() => void selectAsTopFolder()}
          />
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingIndicator />
      ) : visibleFolders.length === 0 ? (
        <Text color="secondary" as="p">
          하위 폴더가 없습니다.
        </Text>
      ) : (
        <Card padding={0}>
          <VStack as="ul" gap={0}>
            {visibleFolders.map((folder) => (
              <Item
                key={folder.id}
                as="li"
                label={folder.name}
                labelLines={2}
                startContent={<Folder size={20} aria-hidden="true" />}
                description={formatIsoDate(folder.modifiedTime)}
                onClick={() => openFolder(folder)}
              />
            ))}
          </VStack>
        </Card>
      )}
    </PageContainer>
  );
}
