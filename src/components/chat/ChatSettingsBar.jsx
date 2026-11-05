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
  "h-8 w-auto shrink-0 gap-1 rounded-full border-0 bg-transparent px-2.5 text-xs font-medium shadow-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 [&>svg]:hidden";

function SettingSelect({ label, showLabel = false, value, onChange, options, disabled }) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={TRIGGER_CLASS}>
        {showLabel && <span className="font-normal text-muted-foreground">{label}</span>}
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

/** Aspect ratio, in-image text, purpose and quality as ghost selects in the chat input footer. */
export default function ChatSettingsBar({ settings, quality, supportedQualities, onChange, disabled, className }) {
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <SettingSelect
        label="比例"
        value={settings.aspectRatio}
        onChange={(aspectRatio) => onChange({ aspectRatio })}
        options={ASPECT_RATIO_OPTIONS}
        disabled={disabled}
      />
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
      {supportedQualities.length > 0 && (
        <SettingSelect
          label="品質"
          showLabel
          value={quality}
          onChange={(nextQuality) => onChange({ quality: nextQuality })}
          options={supportedQualities.map((id) => ({ id, label: IMAGE_QUALITY_LABELS[id] || id }))}
          disabled={disabled}
        />
      )}
    </div>
  );
}
