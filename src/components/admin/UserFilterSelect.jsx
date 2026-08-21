import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const matchesKeyword = (user, keyword) => {
  if (!keyword) return true;
  const haystack = `${user.displayName || ""} ${user.email || ""}`.toLowerCase();
  return haystack.includes(keyword);
};

/**
 * Searchable single-select for a provider-scoped user list. The full option list
 * already lives in memory, so filtering stays client side.
 */
export default function UserFilterSelect({
  label,
  users,
  value,
  onChange,
  disabled = false,
  allLabel = "全部",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const containerRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  const selected = useMemo(
    () => users.find((item) => item.id === value) || null,
    [users, value]
  );

  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return users.filter((item) => matchesKeyword(item, normalized));
  }, [users, keyword]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    searchRef.current?.focus();
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const select = (nextValue) => {
    setIsOpen(false);
    setKeyword("");
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-[220px]"
      >
        <span className="shrink-0 text-muted-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? selected.displayName : allLabel}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border bg-popover p-2 shadow-lg">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜尋姓名或 Email"
              aria-label={`搜尋${label}`}
              className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <ul id={listId} role="listbox" className="mt-2 max-h-60 overflow-y-auto">
            <li>
              <button
                type="button"
                role="option"
                aria-selected={!selected}
                onClick={() => select("")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !selected && "bg-muted"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", selected && "invisible")} aria-hidden="true" />
                {allLabel}
              </button>
            </li>
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  onClick={() => select(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    item.id === value && "bg-muted"
                  )}
                >
                  <Check
                    className={cn("h-3.5 w-3.5 shrink-0", item.id !== value && "invisible")}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {item.displayName}
                      {item.isActive ? "" : "（已停用）"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-center text-xs text-muted-foreground">找不到符合的使用者</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
