const THEME_STORAGE_KEY = "pixora.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

const isTheme = (value) => value === "light" || value === "dark";

/* 狀態列顏色對齊頂部的主色頁首（--primary）；index.html 的首次繪製腳本使用相同的值。 */
const THEME_COLORS = { light: "#2563eb", dark: "#3b82f6" };

const readStoredTheme = () => {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : null;
};

const applyTheme = (theme) => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
};

export const getTheme = () =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

export const setTheme = (theme) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  emit();
};

export const subscribeTheme = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/* 使用者尚未明確選擇前，跟隨作業系統的即時切換。 */
window.matchMedia(DARK_QUERY).addEventListener("change", (event) => {
  if (readStoredTheme()) return;
  applyTheme(event.matches ? "dark" : "light");
  emit();
});
