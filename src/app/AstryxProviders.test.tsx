import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Link } from "@astryxdesign/core/Link";
import { beforeEach, describe, expect, it } from "vitest";
import { AstryxProviders } from "./AstryxProviders";
import { useThemeMode } from "./ThemeModeContext";

function renderProviders() {
  return render(
    <MemoryRouter>
      <AstryxProviders>
        <Link href="/history">기록</Link>
      </AstryxProviders>
    </MemoryRouter>,
  );
}

describe("AstryxProviders", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.classList.remove("dark");
  });

  it("applies the dark mode saved in localStorage on first render", () => {
    window.localStorage.setItem("sheet-quiz-theme", "dark");
    renderProviders();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applies light mode when nothing is saved", () => {
    renderProviders();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("renders Astryx links as router links with the given href", () => {
    renderProviders();
    expect(screen.getByRole("link", { name: "기록" })).toHaveAttribute(
      "href",
      "/history",
    );
  });

  it("switches the Astryx theme when a descendant toggles the mode", () => {
    function Toggle() {
      const { toggleTheme } = useThemeMode();
      return <button onClick={toggleTheme}>토글</button>;
    }
    render(
      <MemoryRouter>
        <AstryxProviders>
          <Toggle />
        </AstryxProviders>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "토글" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
