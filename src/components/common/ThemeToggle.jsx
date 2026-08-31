import { Button } from "@/components/ui/button";
import ThemeGlyph from "@/components/icons/ThemeGlyph";
import { cn } from "@/lib/utils";
import useTheme from "@/hooks/useTheme";

const ThemeToggle = ({ className }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "切換至淺色模式" : "切換至深色模式";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        "h-10 w-10 shrink-0 rounded-lg transition-[background-color,color,transform] active:scale-[0.97] motion-reduce:transform-none",
        className
      )}
      title={label}
      aria-label={label}
    >
      <ThemeGlyph isDark={isDark} className="icon-md" aria-hidden="true" />
    </Button>
  );
};

export default ThemeToggle;
