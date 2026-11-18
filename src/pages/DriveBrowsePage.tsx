import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card } from "@astryxdesign/core/Card";
import { Item } from "@astryxdesign/core/Item";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { FileSpreadsheet, Folder } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useLatestRequest } from "../app/useLatestRequest";
import { DriveApiError } from "../drive/driveApiError";
import { DriveFile, DriveFolder, listChildFolders, listSheetFiles } from "../drive/driveClient";
import { getTopFolder, TopFolderSelection } from "../storage/topFolderRepo";
import { Breadcrumb, BreadcrumbItem } from "../components/Breadcrumb";
import { formatIsoDate } from "../app/formatDate";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { PageContainer } from "../components/PageContainer";

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

  const beginTopFolderRequest = useLatestRequest(googleUserId);

  useEffect(() => {
    const isLatest = beginTopFolderRequest();
    setTopFolder(undefined);
    if (!googleUserId) return;
    void getTopFolder(googleUserId)
      .then((saved) => {
        if (isLatest()) setTopFolder(saved ?? null);
      })
      .catch(() => {
        if (!isLatest()) return;
        setTopFolder(null);
        setError("저장된 최상위 폴더를 불러오지 못했습니다.");
      });
  }, [googleUserId, beginTopFolderRequest]);

  const currentFolderId = folderId ?? topFolder?.folderId ?? null;
  const trail = (location.state as LocationState | null)?.trail ?? [];

  const beginRequest = useLatestRequest(JSON.stringify([currentFolderId, googleUserId, status]));

  const load = useCallback(async () => {
    const isLatest = beginRequest();
    if (!currentFolderId) return;
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
    setFolders([]);
    setFiles([]);
    try {
      const [folderResult, fileResult] = await Promise.all([
        listChildFolders(accessToken, currentFolderId),
        listSheetFiles(accessToken, currentFolderId),
      ]);
      if (!isLatest()) return;
      setFolders(folderResult);
      setFiles(fileResult);
    } catch (err) {
      if (!isLatest()) return;
      if (err instanceof DriveApiError && err.status === 401) markExpired();
      setError(err instanceof DriveApiError ? err.message : "폴더 내용을 불러오지 못했습니다.");
    } finally {
      if (isLatest()) setLoading(false);
    }
  }, [currentFolderId, getAccessToken, markExpired, beginRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = (folder: DriveFolder) => {
    navigate(`/folders/${folder.id}`, {
      state: { trail: [...trail, { id: folder.id, name: folder.name }] },
    });
  };

  const openFile = (file: DriveFile) => {
    const certificationFolderName =
      trail.length > 0 ? trail[trail.length - 1].name : (topFolder?.folderName ?? "");
    navigate(`/sheets/${file.id}/tabs`, {
      state: {
        fileName: file.name,
        sourceModifiedTime: file.modifiedTime,
        parentFolderId: currentFolderId ?? "",
        certificationFolderName,
      },
    });
  };

  if (status !== "connected") {
    return (
      <PageContainer maxWidth="48rem" className="break-keep">
        <Text color="secondary" as="p">
          Google 연결이 필요합니다. 시작 화면에서 다시 연결해주세요.
        </Text>
      </PageContainer>
    );
  }

  if (topFolder === undefined) {
    return (
      <PageContainer maxWidth="48rem">
        <LoadingIndicator />
      </PageContainer>
    );
  }

  if (topFolder === null) {
    return (
      <PageContainer maxWidth="48rem" className="break-keep">
        <VStack gap={3} align="start">
          <Text color="secondary" as="p">
            먼저 문제은행 최상위 폴더를 선택해주세요.
          </Text>
          <Link href="/folders/select" isStandalone weight="semibold">
            최상위 폴더 선택하러 가기
          </Link>
        </VStack>
      </PageContainer>
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
    <PageContainer maxWidth="48rem">
      <Breadcrumb items={breadcrumbItems} />
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading ? (
        <LoadingIndicator />
      ) : folders.length === 0 && files.length === 0 ? (
        <Text color="secondary" as="p">
          하위 폴더나 Sheet 파일이 없습니다.
        </Text>
      ) : (
        <Card padding={0}>
          <VStack as="ul" gap={0}>
            {folders.map((folder) => (
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
            {files.map((file) => (
              <Item
                key={file.id}
                as="li"
                label={file.name}
                labelLines={2}
                startContent={<FileSpreadsheet size={20} aria-hidden="true" />}
                description={formatIsoDate(file.modifiedTime)}
                onClick={() => openFile(file)}
              />
            ))}
          </VStack>
        </Card>
      )}
    </PageContainer>
  );
}
