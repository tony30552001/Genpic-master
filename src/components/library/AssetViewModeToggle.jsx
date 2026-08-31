import { Button } from "@/components/ui/button";
import ViewModeGlyph from "@/components/icons/ViewModeGlyph";
import { VIEW_MODE_OPTIONS, normalizeViewMode } from "./viewMode";

export default function AssetViewModeToggle({ value, onChange }) {
  const activeValue = normalizeViewMode(value);

  return (
    <div
      role="group"
      aria-label="選擇素材瀏覽模式"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background p-1"
    >
      <span className="flex h-9 w-9 items-center justify-center text-primary" aria-hidden="true">
        <ViewModeGlyph mode={activeValue} className="icon-md" />
      </span>
      {VIEW_MODE_OPTIONS.map(({ id, label }) => (
          <Button
            key={id}
            type="button"
            variant={activeValue === id ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(id)}
            aria-pressed={activeValue === id}
            aria-label={`${label}模式`}
            title={`${label}模式`}
            className="min-h-10 min-w-10 px-2.5 text-xs sm:px-3"
          >
            <span>{label}</span>
          </Button>
      ))}
    </div>
  );
}
