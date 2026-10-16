import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogIn } from "@/components/icons/lucideControls";
import { ShieldCheck } from "@/components/icons/lucideContent";
import PixoraWordmark from "@/components/icons/PixoraWordmark";
import ProductGlyph from "@/components/icons/ProductGlyph";
import AccountMenu from "@/components/common/AccountMenu";
import { cn } from "@/lib/utils";

// Equal-width segments let the selection pill slide by index without measuring the DOM.
function HeaderTabs({ tabs, activeTab, onTabChange }) {
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab);

  return (
    <nav
      aria-label="主要功能"
      className="relative hidden grid-flow-col auto-cols-fr rounded-[10px] bg-foreground/[0.06] p-[3px] lg:grid dark:bg-muted"
    >
      {activeIndex >= 0 && (
        <span
          aria-hidden="true"
          className="absolute inset-y-[3px] left-[3px] rounded-lg bg-card shadow-sm transition-transform duration-(--motion-enter) ease-emphasized dark:bg-foreground/10 dark:shadow-none"
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
              "relative flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors duration-(--motion-hover) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "text-primary dark:text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ProductGlyph kind={tab.glyph} active={isActive} className="icon-sm" aria-hidden="true" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

export default function AppHeader({
  tabs,
  activeTab,
  onTabChange,
  user,
  isAdmin,
  isLoading,
  onOpenAdmin,
  onLogin,
  onLogout,
}) {
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab);

  return (
    <header className="relative shrink-0 bg-background pt-[env(safe-area-inset-top)] text-foreground">
      <div className="flex h-12 min-w-0 items-center justify-between gap-2 px-3 sm:px-4 lg:grid lg:h-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 justify-self-start">
          <h1 className="flex shrink-0">
            <PixoraWordmark />
          </h1>
          {activeTabInfo && (
            <span className="flex min-w-0 shrink items-center gap-1.5 text-xs font-medium text-muted-foreground lg:hidden">
              <span aria-hidden="true">/</span>
              <span className="truncate">{activeTabInfo.label}</span>
            </span>
          )}
        </div>

        <HeaderTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />

        <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-end">
          {isAdmin && (
            <>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onOpenAdmin}
                      aria-label="管理中心"
                      className="hidden size-9 rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground lg:inline-flex"
                    >
                      <ShieldCheck className="icon-md" aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">管理中心</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {user && <span aria-hidden="true" className="hidden h-5 w-px bg-border lg:block" />}
            </>
          )}
          {user && <AccountMenu user={user} onLogout={onLogout} />}
          {!user && !isLoading && (
            <Button size="sm" onClick={onLogin} className="gap-1.5">
              <LogIn className="icon-sm" aria-hidden="true" />
              登入
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
