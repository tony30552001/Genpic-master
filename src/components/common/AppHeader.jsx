import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LogIn, Menu } from "@/components/icons/lucideControls";
import { ShieldCheck } from "@/components/icons/lucideContent";
import PixoraWordmark from "@/components/icons/PixoraWordmark";
import AccountMenu from "@/components/common/AccountMenu";
import MobileNavDrawer from "@/components/common/MobileNavDrawer";
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
  mobileActionsRef,
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const activeTabInfo = tabs.find((tab) => tab.id === activeTab);

  return (
    <header className="relative shrink-0 bg-background pt-[env(safe-area-inset-top)] text-foreground lg:border-b lg:border-border lg:bg-card">
      <div className="flex h-12 min-w-0 items-center justify-between gap-1 px-1.5 sm:px-3 lg:grid lg:h-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-2 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-1 justify-self-start">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            aria-label="開啟選單"
            aria-expanded={isDrawerOpen}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground press-feedback active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="icon-md" aria-hidden="true" />
          </button>
          <h1 className="flex min-w-0 shrink items-center">
            <span className="hidden lg:flex">
              <PixoraWordmark />
            </span>
            {activeTabInfo && (
              <span className="truncate text-base font-semibold lg:hidden">{activeTabInfo.label}</span>
            )}
          </h1>
        </div>

        <SegmentedTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={onTabChange}
          ariaLabel="主要功能"
          className="hidden lg:grid"
          renderIcon={({ icon: Icon }) => <Icon className="icon-sm" aria-hidden="true" />}
        />

        <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-end pr-1.5 sm:pr-0">
          <div ref={mobileActionsRef} className="-mr-1 flex items-center empty:hidden lg:hidden" />
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
      <AnimatePresence>
        {isDrawerOpen && (
          <MobileNavDrawer
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={onTabChange}
            isAdmin={isAdmin}
            onOpenAdmin={onOpenAdmin}
            onClose={() => setIsDrawerOpen(false)}
          />
        )}
      </AnimatePresence>
    </header>
  );
}
