import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// index.html의 첫 인라인 스크립트(React 마운트 전 테마 적용)를 그대로 꺼내 실행한다.
const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";

function runBootScript(): void {
  new Function(script)();
}

describe("index.html theme boot script", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("applies dark before React mounts when dark is saved", () => {
    window.localStorage.setItem("sheet-quiz-theme", "dark");
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("pins light when light is saved, so an OS dark preference cannot flash the page dark", () => {
    window.localStorage.setItem("sheet-quiz-theme", "light");
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("pins light when nothing is saved yet, matching the app default", () => {
    runBootScript();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("does not throw and leaves the theme to React when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(runBootScript).not.toThrow();
    vi.restoreAllMocks();
  });
});
