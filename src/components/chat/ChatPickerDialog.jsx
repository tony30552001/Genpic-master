import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Searchable list for choosing one saved style or template from the "+" menu. */
export default function ChatPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  emptyText,
  items,
  onSelect,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 pr-10">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="rounded-none border-t">
          <CommandInput placeholder={placeholder} />
          <CommandList className="max-h-80">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.id}`}
                  onSelect={() => {
                    onSelect(item.value);
                    onOpenChange(false);
                  }}
                  className="flex-col items-start gap-0.5"
                >
                  <span className="text-sm font-medium">{item.label}</span>
                  {item.description && (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{item.description}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
