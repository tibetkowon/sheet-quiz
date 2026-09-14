import { Link } from "react-router-dom";
import { useTheme } from "./useTheme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-bg text-text dark:bg-bg-dark dark:text-text-dark">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-4 dark:border-border-dark sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white dark:bg-accent-dark">
            풀
          </span>
          <span className="font-display text-[17px] font-semibold">풀이장</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-text-secondary dark:text-text-dark-secondary sm:text-[13px]">
          <Link to="/folders" className="hover:text-text dark:hover:text-text-dark">
            자격증
          </Link>
          <Link to="/history" className="hover:text-text dark:hover:text-text-dark">
            기록
          </Link>
          <Link to="/settings" className="hover:text-text dark:hover:text-text-dark">
            설정
          </Link>
        </nav>
        <button
          type="button"
          onClick={toggleTheme}
          className="shrink-0 whitespace-nowrap rounded border border-border bg-sunken px-3 py-1.5 text-xs text-text-secondary dark:border-border-dark dark:bg-sunken-dark dark:text-text-dark-secondary sm:text-[13px]"
        >
          {theme === "dark" ? "라이트 모드" : "다크 모드"}
        </button>
      </header>
      <main>{children}</main>
    </div>
  );
}
