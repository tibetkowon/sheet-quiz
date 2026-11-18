import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LinkProvider } from "@astryxdesign/core/Link";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { ThemeModeContext } from "./ThemeModeContext";
import { useTheme } from "./useTheme";

export function AstryxProviders({ children }: { children: ReactNode }) {
  const themeMode = useTheme();

  return (
    <ThemeModeContext.Provider value={themeMode}>
      <Theme theme={neutralTheme} mode={themeMode.theme}>
        <LinkProvider component={Link}>{children}</LinkProvider>
      </Theme>
    </ThemeModeContext.Provider>
  );
}
