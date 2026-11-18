import { useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { useLocation } from "react-router-dom";
import { AppShell as AstryxAppShell } from "@astryxdesign/core/AppShell";
import { IconButton } from "@astryxdesign/core/IconButton";
import { MobileNav, MobileNavToggle } from "@astryxdesign/core/MobileNav";
import { SideNavItem } from "@astryxdesign/core/SideNav";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { useThemeMode } from "./ThemeModeContext";

const NAV_ITEMS = [
  { label: "자격증", href: "/folders" },
  { label: "기록", href: "/history" },
  { label: "설정", href: "/settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useThemeMode();
  const { pathname } = useLocation();
  // 직접 만든 드로어는 Astryx 기본 드로어와 달리 항목을 눌러도 닫히지 않아 열림 상태를 직접 관리한다.
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const isDark = theme === "dark";
  // 퀴즈 화면은 하단에 고정된 버튼 바가 있어 테마 버튼이 그 위로 올라가야 가려지지 않는다.
  const hasQuizActionBar = /^\/quiz\/[^/]+$/.test(pathname);

  return (
    <>
      <AstryxAppShell
        height="auto"
        variant="surface"
        topNav={
          <TopNav
            label="주요 메뉴"
            heading={
              <TopNavHeading
                logo={<img src="/favicon.svg" alt="" className="h-8 w-8" />}
                heading="풀이장"
                headingHref="/"
              />
            }
            startContent={NAV_ITEMS.map(({ label, href }) => (
              <TopNavItem key={href} label={label} href={href} isSelected={isCurrent(href)} />
            ))}
            endContent={<MobileNavToggle label="메뉴 열기" />}
          />
        }
        // 기본 드로어는 상단 바의 로고/이름을 그대로 복사해 중복된다.
        mobileNav={{
          hasToggle: false,
          isOpen: isDrawerOpen,
          onOpenChange: setIsDrawerOpen,
          content: (
            <MobileNav header="메뉴">
              {NAV_ITEMS.map(({ label, href }) => (
                <SideNavItem
                  key={href}
                  label={label}
                  href={href}
                  isSelected={isCurrent(href)}
                  onClick={() => setIsDrawerOpen(false)}
                />
              ))}
            </MobileNav>
          ),
        }}
      >
        {children}
      </AstryxAppShell>
      {/* 상단 바(햄버거 옆)에 두면 모바일에서 오조작이 잦아 우측 하단에 띄운다. */}
      <div
        className={`fixed right-4 z-20 ${
          hasQuizActionBar
            ? "bottom-40 sm:bottom-24"
            : "bottom-[max(1rem,env(safe-area-inset-bottom))]"
        }`}
      >
        <IconButton
          label={isDark ? "라이트 모드" : "다크 모드"}
          icon={isDark ? <Sun /> : <Moon />}
          variant="secondary"
          onClick={toggleTheme}
        />
      </div>
    </>
  );
}
