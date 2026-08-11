import React from "react";
import { Grid2X2, List, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { VIEW_MODE_OPTIONS, normalizeViewMode } from "./viewMode";

const ICONS = { Grid2X2, List, Table2 };

export default function AssetViewModeToggle({ value, onChange }) {
  const activeValue = normalizeViewMode(value);

  return (
    <div
      role="group"
      aria-label="選擇素材瀏覽模式"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-background p-1"
    >
      {VIEW_MODE_OPTIONS.map(({ id, label, icon }) => {
        const Icon = ICONS[icon];
        return (
          <Button
            key={id}
            type="button"
            variant={activeValue === id ? "default" : "ghost"}
            size="sm"
            onClick={() => onChange(id)}
            aria-pressed={activeValue === id}
            aria-label={`${label}模式`}
            title={`${label}模式`}
            className="min-h-10 min-w-10 gap-1.5 px-2.5 sm:px-3"
          >
            {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
            <span className="hidden sm:inline">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
