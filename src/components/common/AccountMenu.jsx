import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, LogOut } from "@/components/icons/lucideControls";
import ThemeGlyph from "@/components/icons/ThemeGlyph";
import useTheme from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

function getInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.every((word) => /^[a-z]/i.test(word))) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0]?.[0] ?? "?").toUpperCase();
}

function UserAvatar({ user, className }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted font-semibold text-muted-foreground after:absolute after:inset-0 after:rounded-full after:border after:border-foreground/10",
        className
      )}
    >
      {user.photoURL ? (
        <img src={user.photoURL} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden="true">{getInitials(user.displayName)}</span>
      )}
    </span>
  );
}

export default function AccountMenu({ user, onLogout }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="帳號選單"
        className="group flex h-9 min-w-0 items-center gap-2 rounded-full border border-border bg-card p-0.5 text-sm font-medium text-foreground press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=open]:bg-muted lg:pr-2.5"
      >
        <UserAvatar user={user} className="size-8 text-xs" />
        <span className="hidden max-w-32 truncate lg:inline">{user.displayName}</span>
        <ChevronDown
          className="hidden icon-sm text-muted-foreground transition-transform duration-(--motion-enter) ease-emphasized group-data-[state=open]:rotate-180 lg:block"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <UserAvatar user={user} className="size-10 text-sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-foreground">{user.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            toggleTheme();
          }}
        >
          <ThemeGlyph isDark={isDark} className="icon-sm text-muted-foreground" />
          {isDark ? "切換至淺色模式" : "切換至深色模式"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout}>
          <LogOut className="icon-sm" aria-hidden="true" />
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
