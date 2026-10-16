import { useCallback, useState } from "react";
import { CornerDownLeft } from "@/components/icons/lucideControls";
import { Square } from "@/components/icons/lucideContent";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Multi-line message form; `onSubmit` receives the textarea value. */
export const PromptInput = ({ className, onSubmit, children, ...props }) => {
  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();
      const text = new FormData(event.currentTarget).get("message") || "";
      onSubmit({ text: String(text) }, event);
    },
    [onSubmit]
  );

  return (
    <form className={cn("w-full", className)} onSubmit={handleSubmit} {...props}>
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
};

/** Enter sends, Shift+Enter breaks the line, and IME composition never sends. */
export const PromptInputTextarea = ({ onKeyDown, className, ...props }) => {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown = useCallback(
    (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey) return;
      if (isComposing || event.nativeEvent.isComposing) return;
      event.preventDefault();
      const { form } = event.currentTarget;
      if (form?.querySelector('button[type="submit"]')?.disabled) return;
      form?.requestSubmit();
    },
    [onKeyDown, isComposing]
  );

  return (
    <InputGroupTextarea
      className={cn("field-sizing-content max-h-48 min-h-16", className)}
      name="message"
      onCompositionStart={() => setIsComposing(true)}
      onCompositionEnd={() => setIsComposing(false)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
};

export const PromptInputHeader = ({ className, ...props }) => (
  <InputGroupAddon align="block-end" className={cn("order-first flex-wrap gap-1", className)} {...props} />
);

export const PromptInputFooter = ({ className, ...props }) => (
  <InputGroupAddon align="block-end" className={cn("justify-between gap-1", className)} {...props} />
);

export const PromptInputTools = ({ className, ...props }) => (
  <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
);

export const PromptInputButton = ({ variant = "ghost", size = "icon-sm", className, ...props }) => (
  <InputGroupButton className={className} size={size} type="button" variant={variant} {...props} />
);

/**
 * Sends the message, or stops the reply while `status` is `submitted` or
 * `streaming` and `onStop` is given.
 */
export const PromptInputSubmit = ({ className, status, onStop, onClick, ...props }) => {
  const isBusy = status === "submitted" || status === "streaming";
  const canStop = isBusy && Boolean(onStop);

  const handleClick = (event) => {
    if (canStop) {
      event.preventDefault();
      onStop();
      return;
    }
    onClick?.(event);
  };

  return (
    <InputGroupButton
      aria-label={canStop ? "停止回覆" : "送出訊息"}
      className={className}
      onClick={handleClick}
      size="icon-sm"
      type={canStop ? "button" : "submit"}
      variant="default"
      {...props}
    >
      {canStop ? (
        <Square className="size-3.5 fill-current" aria-hidden="true" />
      ) : isBusy ? (
        <Spinner />
      ) : (
        <CornerDownLeft className="size-4" aria-hidden="true" />
      )}
    </InputGroupButton>
  );
};
