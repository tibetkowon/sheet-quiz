import { createContext, useContext } from "react";
import type { useTheme } from "./useTheme";

export const ThemeModeContext = createContext<ReturnType<typeof useTheme> | null>(null);

// useTheme()을 컴포넌트마다 호출하면 상태가 따로 생겨 Astryx 테마와 토글이 어긋난다.
export function useThemeMode(): ReturnType<typeof useTheme> {
  const value = useContext(ThemeModeContext);
  if (!value) throw new Error("useThemeMode must be used inside AstryxProviders");
  return value;
}
