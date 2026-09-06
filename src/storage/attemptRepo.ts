import { getDb } from "./db";
import type { StudyAttempt } from "../types/studyAttempt";

export async function saveAttempt(attempt: StudyAttempt): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("attempts", "readwrite");
  const existing = await tx.store.get(attempt.id);
  if (!existing || (existing.result == null && existing.submittedAt == null)) {
    await tx.store.put(attempt);
  }
  await tx.done;
}

export async function getAttempt(id: string): Promise<StudyAttempt | undefined> {
  const db = await getDb();
  return db.get("attempts", id);
}

export async function listAttemptsByUser(googleUserId: string): Promise<StudyAttempt[]> {
  const db = await getDb();
  return db.getAllFromIndex("attempts", "googleUserId", googleUserId);
}

export async function deleteAttempt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("attempts", id);
}
