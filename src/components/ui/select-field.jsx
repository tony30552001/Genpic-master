import * as React from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Radix Select forbids "" as an item value, so a clearable choice uses this sentinel.
const EMPTY_VALUE = "__empty__"

/**
 * Single-choice field built on the shared Select primitive.
 * `emptyLabel` adds a leading option that maps to the empty string;
 * without it, an empty `value` shows `placeholder`.
 */
const SelectField = ({
  value,
  onValueChange,
  options,
  placeholder,
  emptyLabel,
  className,
  contentClassName,
  disabled,
  required,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}) => {
  const normalized = value === "" || value == null ? "" : String(value)
  const current = emptyLabel !== undefined && normalized === "" ? EMPTY_VALUE : normalized

  return (
    <Select
      value={current}
      onValueChange={(next) => onValueChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectTrigger
        id={id}
        className={className}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {emptyLabel !== undefined && <SelectItem value={EMPTY_VALUE}>{emptyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.value} value={String(option.value)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { SelectField }
