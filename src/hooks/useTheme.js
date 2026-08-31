import { useCallback, useSyncExternalStore } from "react";
import { getTheme, setTheme, subscribeTheme } from "@/lib/theme";

const useTheme = () => {
  const theme = useSyncExternalStore(subscribeTheme, getTheme);

  const toggleTheme = useCallback(() => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
  }, []);

  return { theme, toggleTheme };
};

export default useTheme;
