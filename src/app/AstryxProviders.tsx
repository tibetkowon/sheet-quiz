import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { LinkProvider } from "@astryxdesign/core/Link";
import koKR from "@astryxdesign/core/locales/ko-KR.generated.js";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { ThemeModeContext } from "./ThemeModeContext";
import { useTheme } from "./useTheme";

export function AstryxProviders({ children }: { children: ReactNode }) {
  const themeMode = useTheme();

  return (
    <ThemeModeContext.Provider value={themeMode}>
      <InternationalizationProvider locale="ko-KR" messages={{ "ko-KR": koKR }}>
        <Theme theme={neutralTheme} mode={themeMode.theme}>
          <LinkProvider component={Link}>{children}</LinkProvider>
        </Theme>
      </InternationalizationProvider>
    </ThemeModeContext.Provider>
  );
}
