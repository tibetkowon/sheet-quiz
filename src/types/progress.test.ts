import { describe, expect, it } from "vitest";
import { createInitialProgress } from "./progress";

describe("createInitialProgress", () => {
  it("starts UNSEEN with no answers and no review mark", () => {
    const progress = createInitialProgress("q-1");
    expect(progress).toMatchObject({
      questionId: "q-1",
      selectedAnswers: [],
      status: "UNSEEN",
      reviewMarked: false,
    });
  });

  it("sets updatedAt to an ISO timestamp", () => {
    const progress = createInitialProgress("q-1");
    expect(() => new Date(progress.updatedAt).toISOString()).not.toThrow();
  });
});
