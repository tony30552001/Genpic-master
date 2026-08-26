import React, { useState } from "react";
import { Check, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS } from "./styleSourceData";

function PresetPreview({ preset }) {
  const [failed, setFailed] = useState(false);

  if (!preset.previewUrl || failed) {
    return (
      <span className="flex h-full items-center justify-center gap-2 px-3 text-xs font-medium text-muted-foreground">
        <Palette className="h-4 w-4 shrink-0" aria-hidden="true" />
        {preset.title}
      </span>
    );
  }

  return (
    <img
      src={preset.previewUrl}
      alt={`${preset.title} 預覽`}
      width={640}
      height={320}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:transform-none"
    />
  );
}

export default function StylePresetPicker({
  selectedPresetId,
  onSelect,
  presets = STYLE_PRESETS,
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="風格預設">
      {presets.map((preset) => {
        const isSelected = selectedPresetId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={preset.title}
            data-preset-id={preset.id}
            onClick={() => onSelect?.(preset)}
            className={cn(
              "group min-w-0 overflow-hidden rounded-2xl border bg-background text-left transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected
                ? "border-primary shadow-md ring-1 ring-primary/20"
                : "border-border hover:border-primary/40 hover:bg-muted/20"
            )}
          >
            <span className="relative block aspect-[2.1/1] overflow-hidden bg-muted">
              <PresetPreview preset={preset} />
              <span
                className={cn(
                  "absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-colors",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-white/70 bg-black/20 text-transparent backdrop-blur-sm"
                )}
                aria-hidden="true"
              >
                <Check className="h-4 w-4" />
              </span>
            </span>
            <span className="block px-3 py-3">
              <span className="block truncate text-sm font-semibold text-foreground">
                {preset.title}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {preset.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
