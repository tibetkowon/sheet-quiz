import { DriveApiError } from "./driveApiError";

export interface DriveFolder {
  id: string;
  name: string;
  modifiedTime: string;
}

interface DriveFilesListResponse {
  files: DriveFolder[];
}

export async function listChildFolders(
  accessToken: string,
  parentId: string,
): Promise<DriveFolder[]> {
  const query = [
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
  ].join(" and ");

  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime)",
    orderBy: "name",
    pageSize: "1000",
  });

  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    throw new DriveApiError(401, "Google 연결이 만료되었습니다.");
  }
  if (!response.ok) {
    throw new DriveApiError(response.status, "Drive 폴더 목록을 불러오지 못했습니다.");
  }

  const data = (await response.json()) as DriveFilesListResponse;
  return data.files ?? [];
}

export function listRootFolders(accessToken: string): Promise<DriveFolder[]> {
  return listChildFolders(accessToken, "root");
}
