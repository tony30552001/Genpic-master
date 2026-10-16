import { cn } from "@/lib/utils";

// Equal-width segments let the selection pill slide by index without measuring the DOM.
export default function SegmentedTabs({ tabs, activeTab, onTabChange, renderIcon, ariaLabel, className }) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "relative grid grid-flow-col auto-cols-fr rounded-[10px] bg-foreground/[0.06] p-[3px] dark:bg-muted",
        className
      )}
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-[3px] left-[3px] rounded-lg bg-card shadow-sm transition-transform duration-(--motion-enter) ease-emphasized motion-reduce:transition-none dark:bg-foreground/10 dark:shadow-none"
          style={{
            width: `calc((100% - 6px) / ${tabs.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
      )}
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-pressed={isActive}
            className={cn(
              "relative flex h-8 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors duration-(--motion-hover) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "text-primary dark:text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {renderIcon?.(tab, isActive)}
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
