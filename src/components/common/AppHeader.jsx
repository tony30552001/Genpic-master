import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogIn } from "@/components/icons/lucideControls";
import { ShieldCheck } from "@/components/icons/lucideContent";
import PixoraWordmark from "@/components/icons/PixoraWordmark";
import AccountMenu from "@/components/common/AccountMenu";
import SegmentedTabs from "@/components/common/SegmentedTabs";

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
    <header className="relative shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)] text-foreground">
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

        <SegmentedTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          ariaLabel="主要功能"
          className="hidden lg:grid"
          renderIcon={({ icon: Icon }) => <Icon className="icon-sm" aria-hidden="true" />}
        />

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
