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
