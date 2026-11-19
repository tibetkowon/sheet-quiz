import { listAttemptsByUser, saveAttempt } from "./attemptRepo";
import { getDb } from "./db";
import { getTopFolder, saveTopFolder } from "./topFolderRepo";

const markerKey = (googleUserId: string) => `sheet-quiz-migrated-${googleUserId}`;

function isMigrated(googleUserId: string): boolean {
  try {
    return window.localStorage.getItem(markerKey(googleUserId)) != null;
  } catch {
    return false;
  }
}

function markMigrated(googleUserId: string) {
  try {
    window.localStorage.setItem(markerKey(googleUserId), "1");
  } catch {
    // 표시를 못 남기면 다음 로그인에 다시 시도한다. 업로드는 멱등이라 안전하다.
  }
}

// 이 기기의 기존 IndexedDB 기록을 Firestore로 한 번 올린다. 로컬 데이터는 지우지 않는다.
// shortcut: saveAttempt가 서버 응답을 기다리지 않아 서버가 거부한 쓰기도 완료로 표시된다. 로컬 원본이 남아 있으니 필요하면 표시를 지우고 다시 돌린다.
export async function migrateLocalData(googleUserId: string): Promise<void> {
  if (isMigrated(googleUserId)) return;
  const db = await getDb();
  const attempts = await db.getAllFromIndex("attempts", "googleUserId", googleUserId);
  const remoteById = new Map((await listAttemptsByUser(googleUserId)).map((a) => [a.id, a]));
  let failed = false;
  for (const local of attempts) {
    // saveAttempt는 updatedAt을 비교하지 않으므로, 다른 기기가 쓴 더 새로운 원격본을 덮지 않게 여기서만 비교한다.
    const remote = remoteById.get(local.id);
    if (remote && Date.parse(remote.updatedAt) >= Date.parse(local.updatedAt)) continue;
    // 하나가 실패해도(예: 크기 초과) 나머지는 올리고, 표시는 남기지 않아 다음 로그인에 다시 시도한다.
    await saveAttempt(local).catch((err) => {
      failed = true;
      console.error(err);
    });
  }
  const topFolder = await db.get("topFolder", googleUserId);
  if (topFolder && !(await getTopFolder(googleUserId))) await saveTopFolder(topFolder);
  if (!failed) markMigrated(googleUserId);
}
