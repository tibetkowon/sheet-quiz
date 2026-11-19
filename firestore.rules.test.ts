// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

// emulators:exec 아래에서만 실행한다 (pnpm e2e). 그 외에는 skip.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("firestore.rules", () => {
  let env: RulesTestEnvironment;
  const path = "users/alice/attempts/a1";

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: "demo-sheet-quiz",
      firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("본인 uid 경로는 읽고 쓸 수 있다", async () => {
    const ref = doc(env.authenticatedContext("alice").firestore(), path);
    await assertSucceeds(setDoc(ref, { v: 1 }));
    const snap = await assertSucceeds(getDoc(ref));
    expect(snap.data()).toEqual({ v: 1 });
  });

  it("다른 uid는 읽고 쓸 수 없다", async () => {
    const ref = doc(env.authenticatedContext("bob").firestore(), path);
    await assertFails(setDoc(ref, { v: 2 }));
    await assertFails(getDoc(ref));
  });

  it("비로그인은 읽고 쓸 수 없다", async () => {
    const ref = doc(env.unauthenticatedContext().firestore(), path);
    await assertFails(setDoc(ref, { v: 3 }));
    await assertFails(getDoc(ref));
  });
});
