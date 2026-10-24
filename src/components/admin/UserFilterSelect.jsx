import { useState } from "react";
import { ChevronsUpDown } from "@/components/icons/lucideControls";
import { Check } from "@/components/icons/lucideStatus";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const ALL_VALUE = "__all__";

const matchesSearch = (itemValue, search, keywords) =>
  itemValue === ALL_VALUE ||
  `${keywords?.join(" ") ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())
    ? 1
    : 0;

/**
 * Searchable single-select for a provider-scoped user list. The full option list
 * already lives in memory, so cmdk filters it client side.
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
  const selected = users.find((item) => item.id === value) || null;

  const select = (nextValue) => {
    setIsOpen(false);
    if (nextValue !== value) onChange(nextValue);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`${label}：${selected ? selected.displayName : allLabel}`}
          className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-background px-3 text-xs text-foreground transition-colors duration-(--motion-hover) ease-emphasized hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:w-[220px]"
        >
          <span className="shrink-0 text-muted-foreground">{label}</span>
          <span className="min-w-0 flex-1 truncate text-left">
            {selected ? selected.displayName : allLabel}
          </span>
          <ChevronsUpDown className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))]">
        <Command filter={matchesSearch}>
          <CommandInput placeholder="搜尋姓名或 Email" aria-label={`搜尋${label}`} className="h-9 text-xs" />
          <CommandList className="max-h-60">
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">找不到符合的使用者</CommandEmpty>
            <CommandItem value={ALL_VALUE} onSelect={() => select("")} className="text-xs">
              <Check className={cn("icon-sm shrink-0", selected && "invisible")} aria-hidden="true" />
              {allLabel}
            </CommandItem>
            {users.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                keywords={[item.displayName, item.email]}
                onSelect={() => select(item.id)}
                className="text-xs"
              >
                <Check className={cn("icon-sm shrink-0", item.id !== value && "invisible")} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {item.displayName}
                    {item.isActive ? "" : "（已停用）"}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.email}</span>
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
