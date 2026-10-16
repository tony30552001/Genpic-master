import { IMAGE_QUALITY_LABELS } from "@/config";
import { IMAGE_PURPOSE_OPTIONS } from "@/lib/imagePurposes";
import { LANGUAGE_OPTIONS } from "@/lib/imageTextLanguage";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ASPECT_RATIO_OPTIONS = [
  { id: "16:9", label: "16:9" },
  { id: "4:3", label: "4:3" },
  { id: "1:1", label: "1:1" },
  { id: "9:16", label: "9:16" },
];

const TRIGGER_CLASS =
  "h-8 w-auto gap-1.5 rounded-full border-border/70 bg-background px-3 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-ring";

function SettingSelect({ label, value, onChange, options, disabled }) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={TRIGGER_CLASS}>
        <span className="text-muted-foreground">{label}</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Aspect ratio, quality, in-image text and purpose as compact selects under the chat input. */
export default function ChatSettingsBar({ settings, quality, supportedQualities, onChange, disabled, className }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <SettingSelect
        label="比例"
        value={settings.aspectRatio}
        onChange={(aspectRatio) => onChange({ aspectRatio })}
        options={ASPECT_RATIO_OPTIONS}
        disabled={disabled}
      />
      {supportedQualities.length > 0 && (
        <SettingSelect
          label="品質"
          value={quality}
          onChange={(nextQuality) => onChange({ quality: nextQuality })}
          options={supportedQualities.map((id) => ({ id, label: IMAGE_QUALITY_LABELS[id] || id }))}
          disabled={disabled}
        />
      )}
      <SettingSelect
        label="圖中文字"
        value={settings.imageLanguage}
        onChange={(imageLanguage) => onChange({ imageLanguage })}
        options={LANGUAGE_OPTIONS.map((option) => ({ id: option.id, label: option.shortLabel }))}
        disabled={disabled}
      />
      <SettingSelect
        label="用途"
        value={settings.purpose}
        onChange={(purpose) => onChange({ purpose })}
        options={IMAGE_PURPOSE_OPTIONS}
        disabled={disabled}
      />
    </div>
  );
}
