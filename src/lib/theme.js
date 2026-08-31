const THEME_STORAGE_KEY = "pixora.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener());

const isTheme = (value) => value === "light" || value === "dark";

const readStoredTheme = () => {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : null;
};

const applyTheme = (theme) => {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
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
