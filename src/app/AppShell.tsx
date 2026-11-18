import type { ReactNode } from "react";
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
  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const isDark = theme === "dark";

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
          content: (
            <MobileNav header="메뉴">
              {NAV_ITEMS.map(({ label, href }) => (
                <SideNavItem key={href} label={label} href={href} isSelected={isCurrent(href)} />
              ))}
            </MobileNav>
          ),
        }}
      >
        {children}
      </AstryxAppShell>
      {/* 상단 바(햄버거 옆)에 두면 모바일에서 오조작이 잦아 우측 하단에 띄운다. */}
      <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-10">
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
