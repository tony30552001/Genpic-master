import { ArrowDown } from "@/components/icons/lucideControls";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export const Conversation = ({ className, ...props }) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export const ConversationContent = ({ className, ...props }) => (
  <StickToBottom.Content className={cn("flex flex-col gap-8 p-4", className)} {...props} />
);

export const ConversationEmptyState = ({ className, title, description, icon, children, ...props }) => (
  <div
    className={cn("flex size-full flex-col items-center justify-center gap-3 p-8 text-center", className)}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </>
    )}
  </div>
);

export const ConversationScrollButton = ({ className, ...props }) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      aria-label="捲動到最新訊息"
      className={cn("absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-sm", className)}
      onClick={() => scrollToBottom()}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDown className="size-4" aria-hidden="true" />
    </Button>
  );
};
