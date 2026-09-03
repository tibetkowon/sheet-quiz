import { getDb } from "./db";

export interface TopFolderSelection {
  googleUserId: string;
  folderId: string;
  folderName: string;
  updatedAt: string;
}

export async function saveTopFolder(selection: TopFolderSelection): Promise<void> {
  const db = await getDb();
  await db.put("topFolder", selection);
}

export async function getTopFolder(
  googleUserId: string,
): Promise<TopFolderSelection | undefined> {
  const db = await getDb();
  return db.get("topFolder", googleUserId);
}

export async function clearTopFolder(googleUserId: string): Promise<void> {
  const db = await getDb();
  await db.delete("topFolder", googleUserId);
}
