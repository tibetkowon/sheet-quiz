import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { AstryxProviders } from "./AstryxProviders";

function renderShell(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AstryxProviders>
        <AppShell>
          <h1>본문 제목</h1>
        </AppShell>
      </AstryxProviders>
    </MemoryRouter>,
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("links the main destinations from the primary navigation", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(within(nav).getByRole("link", { name: "자격증" })).toHaveAttribute("href", "/folders");
    expect(within(nav).getByRole("link", { name: "기록" })).toHaveAttribute("href", "/history");
    expect(within(nav).getByRole("link", { name: "설정" })).toHaveAttribute("href", "/settings");
  });

  it("links the product name back to the start page", () => {
    renderShell("/history");
    expect(screen.getByRole("link", { name: /풀이장/ })).toHaveAttribute("href", "/");
  });

  it("shows the app logo image next to the product name", () => {
    const { container } = renderShell();
    const logo = container.querySelector("img[src='/favicon.svg']");
    expect(logo).toBeInTheDocument();
    expect(logo).toHaveAttribute("alt", "");
  });

  it("marks the link of the current route as the current page", () => {
    renderShell("/history");
    expect(screen.getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "설정" })).not.toHaveAttribute("aria-current");
  });

  it("toggles the color mode with a button that names the next mode", () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "다크 모드" }));
    expect(screen.getByRole("button", { name: "라이트 모드" })).toBeVisible();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("keeps the color mode toggle out of the top navigation bar", () => {
    renderShell();
    const nav = screen.getByRole("navigation", { name: "주요 메뉴" });
    expect(
      within(nav).queryByRole("button", { name: "다크 모드" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다크 모드" })).toBeVisible();
  });

  it("renders the page content inside exactly one main landmark", () => {
    renderShell();
    const main = screen.getByRole("main");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(within(main).getByRole("heading", { name: "본문 제목" })).toBeInTheDocument();
  });

  describe("on a narrow screen", () => {
    beforeEach(() => {
      // jsdom에는 <dialog>의 모달 API가 없어 열림 속성만 흉내 낸다.
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute("open", "");
      };
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute("open");
      };
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("lists the destinations in the drawer without repeating the product name", () => {
      renderShell();
      fireEvent.click(screen.getByRole("button", { name: "메뉴 열기" }));
      const drawer = screen.getByRole("dialog");
      expect(within(drawer).getByRole("link", { name: "기록" })).toHaveAttribute(
        "href",
        "/history",
      );
      expect(within(drawer).queryByRole("link", { name: /풀이장/ })).not.toBeInTheDocument();
    });
  });
});
