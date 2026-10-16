"use client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { memo } from "react";
import { Streamdown } from "streamdown";

export const Message = ({
  className,
  from,
  ...props
}) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props} />
);

export const MessageContent = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      "flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}>
    {children}
  </div>
);

export const MessageActions = ({
  className,
  children,
  ...props
}) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export const MessageAction = ({
  tooltip,
  children,
  label,
  className,
  variant = "ghost",
  ...props
}) => {
  const button = (
    <Button className={cn("size-8 p-0", className)} size="icon" type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
};

const streamdownPlugins = { cjk };

export const MessageResponse = memo(({
  className,
  ...props
}) => (
  <Streamdown
    className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
    plugins={streamdownPlugins}
    {...props} />
), (prevProps, nextProps) =>
  prevProps.children === nextProps.children &&
  nextProps.isAnimating === prevProps.isAnimating);

MessageResponse.displayName = "MessageResponse";
