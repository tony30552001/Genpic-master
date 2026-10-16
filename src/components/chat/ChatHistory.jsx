import { ChevronDown } from "@/components/icons/lucideControls";
import { History } from "@/components/icons/lucideContent";
import { Check } from "@/components/icons/lucideStatus";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Dropdown listing the user's chats, newest first, with paging. */
export default function ChatHistory({ chats, activeChatId, hasMore, isLoading, onOpen, onLoadMore }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" aria-label="對話紀錄">
          <History className="size-4" aria-hidden="true" />
          <span className="hidden whitespace-nowrap sm:inline">對話紀錄</span>
          <ChevronDown className="size-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-y-auto">
        <DropdownMenuLabel>最近的對話</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {chats.length === 0 && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {isLoading ? "載入中…" : "還沒有對話紀錄"}
          </p>
        )}
        {chats.map((item) => (
          <DropdownMenuItem key={item.id} onSelect={() => onOpen(item.id)} className="items-start">
            <Check
              className={item.id === activeChatId ? "mt-0.5 size-4 text-primary" : "mt-0.5 size-4 opacity-0"}
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.title || "未命名對話"}</span>
              <span className="text-[11px] text-muted-foreground">{dateFormatter.format(new Date(item.updatedAt))}</span>
            </span>
          </DropdownMenuItem>
        ))}
        {hasMore && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isLoading}
              onSelect={(event) => {
                event.preventDefault();
                void onLoadMore();
              }}
              className="justify-center text-xs text-muted-foreground"
            >
              {isLoading ? "載入中…" : "載入更多"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
