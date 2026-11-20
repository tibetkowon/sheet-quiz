import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, firestore } from "../firebase";
import { withTimeout } from "./withTimeout";

export interface TopFolderSelection {
  googleUserId: string;
  folderId: string;
  folderName: string;
  updatedAt: string;
}

async function userRef() {
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("로그인이 필요합니다.");
  return doc(firestore, "users", uid);
}

export async function saveTopFolder(selection: TopFolderSelection): Promise<void> {
  // shortcut: saveAttempt처럼 서버 응답을 기다리지 않는다(오프라인에서 멈추지 않고, 선택 직후 화면 전환이 서버 왕복에 막히지 않게). 서버 거부는 로그만 남는다. 거부를 알려야 하면 await한다.
  void setDoc(doc(await userRef(), "topFolder", selection.googleUserId), selection).catch(
    console.error,
  );
}

export function getTopFolder(googleUserId: string): Promise<TopFolderSelection | undefined> {
  return withTimeout(
    (async () => {
      const snap = await getDoc(doc(await userRef(), "topFolder", googleUserId));
      return snap.data() as TopFolderSelection | undefined;
    })(),
  );
}

export async function clearTopFolder(googleUserId: string): Promise<void> {
  await deleteDoc(doc(await userRef(), "topFolder", googleUserId));
}
