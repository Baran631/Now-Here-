import { useCallback, useEffect, useState } from "react";

const THEME_STORAGE_KEY = "now-here-theme";
const NIGHT_THEME = "night";
const DAY_THEME = "day";

function getPreferredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === NIGHT_THEME || storedTheme === DAY_THEME) return storedTheme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? NIGHT_THEME : DAY_THEME;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === NIGHT_THEME ? "dark" : "light";
}

export function initTheme() {
  applyTheme(getPreferredTheme());
}

export default function useTheme() {
  const [theme, setThemeState] = useState(() => getPreferredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return undefined;

    function handleSystemThemeChange(event) {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === NIGHT_THEME || storedTheme === DAY_THEME) return;
      setThemeState(event.matches ? NIGHT_THEME : DAY_THEME);
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const nextTheme = current === NIGHT_THEME ? DAY_THEME : NIGHT_THEME;
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      return nextTheme;
    });
  }, []);

  return {
    isNight: theme === NIGHT_THEME,
    theme,
    toggleTheme,
  };
}
