import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { auth, firestore } from "../firebase";
import type { StudyAttempt } from "../types/studyAttempt";
import { withTimeout } from "./withTimeout";

async function userRef() {
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return doc(firestore, "users", uid);
}

export interface SaveAttemptOptions {
  allowSubmittedOverwrite?: boolean;
}

export function shouldWriteAttempt(
  existing: StudyAttempt | undefined,
  incoming: StudyAttempt,
  options: SaveAttemptOptions = {},
): boolean {
  // updatedAt은 기기마다 시계가 달라 비교하지 않는다(시계가 늦은 기기의 저장이 조용히 버려진다).
  if (!existing) return true;
  return (
    !!options.allowSubmittedOverwrite ||
    incoming.result != null ||
    incoming.submittedAt != null ||
    (existing.result == null && existing.submittedAt == null)
  );
}

export async function saveAttempt(
  attempt: StudyAttempt,
  options: SaveAttemptOptions = {},
): Promise<void> {
  if (new Blob([JSON.stringify(attempt)]).size > 900_000) {
    throw new Error("문제 수가 너무 많아 저장할 수 없습니다. 시트를 나눠주세요.");
  }
  const ref = doc(await userRef(), "attempts", attempt.id);
  // 캐시를 먼저 읽는다: 오프라인·beforeunload flush에서 네트워크를 기다리지 않기 위해서다.
  const snap = await getDocFromCache(ref).catch(() => getDoc(ref));
  if (!shouldWriteAttempt(snap.data() as StudyAttempt | undefined, attempt, options)) return;
  // shortcut: 서버 응답을 기다리지 않는다(오프라인이면 setDoc이 끝나지 않음). 서버 거부는 로그만 남는다.
  // 화면의 "저장됨"은 "이 기기에 저장됨"이라는 뜻이다. 거부를 사용자에게 알려야 하면 await하고 오프라인 표시를 따로 둔다.
  void setDoc(ref, attempt).catch(console.error);
}

export function getAttempt(id: string): Promise<StudyAttempt | undefined> {
  return withTimeout(
    (async () => {
      const snap = await getDoc(doc(await userRef(), "attempts", id));
      return snap.data() as StudyAttempt | undefined;
    })(),
  );
}

export function listAttemptsByUser(googleUserId: string): Promise<StudyAttempt[]> {
  return withTimeout(
    (async () => {
      const snap = await getDocs(
        query(collection(await userRef(), "attempts"), where("googleUserId", "==", googleUserId)),
      );
      return snap.docs.map((d) => d.data() as StudyAttempt);
    })(),
  );
}

export async function deleteAttempt(id: string): Promise<void> {
  await deleteDoc(doc(await userRef(), "attempts", id));
}
