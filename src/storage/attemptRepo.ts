import { getDb } from "./db";
import type { StudyAttempt } from "../types/studyAttempt";

export async function saveAttempt(attempt: StudyAttempt): Promise<void> {
  const db = await getDb();
  await db.put("attempts", attempt);
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
