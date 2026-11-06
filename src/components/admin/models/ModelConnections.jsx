import React, { useState } from "react";
import { Pencil, Plus, Trash2 } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { IMAGE_ROLES } from "@/hooks/useImageModelAdmin";
import { CardHead, CardLoadState } from "./modelCardParts";

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "image", label: "圖片" },
  { id: "text", label: "文字" },
];

const usageText = (labels) => (labels.length === 0 ? "未使用" : labels.length > 2 ? `${labels.length} 個功能` : labels.join("、"));

function KindBadge({ kind }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-medium",
        kind === "image" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}
      aria-hidden="true"
    >
      {kind === "image" ? "圖" : "文"}
    </span>
  );
}

function AllowSwitch({ id, checked, disabled, label, reason, onToggle }) {
  const reasonId = reason ? `${id}-reason` : undefined;
  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`開放 ${label}`}
        aria-describedby={reasonId}
        title={reason}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors duration-(--motion-hover) ease-emphasized focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        {/* The thumb stretches toward its travel direction while pressed, like a physical toggle. */}
        <span
          aria-hidden="true"
          className={cn(
            "h-4 w-4 rounded-full bg-background shadow-sm transition-[width,translate] duration-(--motion-hover) ease-emphasized group-enabled:group-active:w-5 motion-reduce:transition-none",
            checked ? "translate-x-4 group-enabled:group-active:translate-x-3" : "translate-x-0.5"
          )}
        />
      </button>
      {reason && <span id={reasonId} className="sr-only">{reason}</span>}
    </>
  );
}

function ConnectionRow({ kind, label, detail, status, children, onEdit, onDelete, disabled }) {
  return (
    <li className="relative flex items-center gap-3 px-4 py-2.5">
      <KindBadge kind={kind} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          {status}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">{detail}</p>
      </div>
      {children}
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" disabled={disabled} aria-label={`編輯 ${label}`} onClick={onEdit}>
        <Pencil aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-destructive" disabled={disabled} aria-label={`刪除 ${label}`} onClick={onDelete}>
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  );
}

export default function ModelConnections({ image, llm, onAdd, onEdit, onDelete, onTestImage, className }) {
  const [filter, setFilter] = useState("all");
  const imageModels = image.catalog?.models ?? [];
  const llmModels = llm.settings?.models ?? [];
  const policy = image.policy;
  const llmRoles = llm.settings?.roles ?? [];
  const assignments = llm.settings?.assignments ?? [];
  const showImage = filter !== "text";
  const showText = filter !== "image";
  const isEmpty = !image.isLoading && !llm.isLoading && imageModels.length === 0 && llmModels.length === 0;

  return (
    <section aria-labelledby="model-connections-title" className={className}>
      <CardHead id="model-connections-title" title="模型連線">
        <div className="flex items-center gap-2">
          <div role="group" aria-label="篩選模型類型" className="flex rounded-lg bg-muted p-0.5">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => setFilter(item.id)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-xs press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === item.id ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" className="h-8 gap-1.5 px-3">
                <Plus aria-hidden="true" />新增模型
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!image.catalog} onSelect={() => onAdd("image")}>圖片模型</DropdownMenuItem>
              <DropdownMenuItem disabled={!llm.settings} onSelect={() => onAdd("text")}>文字模型</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHead>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        {image.missingPolicyKeys.length > 0 && (
          <div role="status" className="mx-4 mt-3 space-y-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-xs [overflow-wrap:anywhere]">
            <p>⚠ 開放清單引用了未登錄的模型，政策無法儲存。請登錄同名識別碼的模型或移除：</p>
            <div className="flex flex-wrap gap-2">
              {image.missingPolicyKeys.map((key) => (
                <Button key={key} type="button" size="xs" variant="outline" className="font-mono" disabled={image.isSavingPolicy}
                  onClick={() => image.toggleAllowed(key)}>
                  移除未登錄模型 {key}
                </Button>
              ))}
            </div>
          </div>
        )}
        {isEmpty && (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">尚未設定模型連線，請點「新增模型」。</p>
        )}
        <ul className="divide-y divide-border/60 py-1">
          {showImage && (
            <CardLoadState state={image} retryLabel="重新載入圖片模型設定">
              {imageModels.map((model) => {
                const roles = IMAGE_ROLES.filter((role) => policy?.[role.field] === model.modelKey);
                const isAllowed = Boolean(policy?.allowedModels.includes(model.modelKey));
                const isTesting = image.testingKey === model.modelKey;
                const supportsLow = model.supportedQualities.includes("low");
                return (
                  <ConnectionRow
                    key={model.modelKey}
                    kind="image"
                    label={model.label}
                    detail={`${model.deploymentName} · ${usageText(roles.map((role) => role.label))}`}
                    disabled={Boolean(image.testingKey)}
                    onEdit={() => onEdit("image", model)}
                    onDelete={() => onDelete("image", model)}
                  >
                    <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden="true">開放</span>
                    <AllowSwitch
                      id={`allow-${model.modelKey}`}
                      checked={isAllowed}
                      label={model.label}
                      disabled={image.isSavingPolicy || roles.length > 0}
                      reason={roles.length > 0 ? `${roles.map((role) => role.label).join("、")}使用中，無法關閉` : undefined}
                      onToggle={() => image.toggleAllowed(model.modelKey)}
                    />
                    {isTesting ? (
                      <Button type="button" size="xs" variant="outline" className="shrink-0" aria-label="停止等待測試" onClick={image.stopTest}>
                        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />停止等待
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="shrink-0"
                        disabled={Boolean(image.testingKey) || !supportsLow}
                        title={supportsLow ? "以 low 品質產生一張圖並計費" : "此模型未設定支援 low 品質，無法測試"}
                        aria-label={`付費生成測試 ${model.label}`}
                        onClick={() => onTestImage(model)}
                      >
                        付費測試
                      </Button>
                    )}
                  </ConnectionRow>
                );
              })}
            </CardLoadState>
          )}
          {showText && (
            <CardLoadState state={llm} retryLabel="重新載入文字模型設定">
              {llmModels.map((model) => {
                const roles = llmRoles.filter((role) =>
                  assignments.some((item) => item.role === role.id && (item.modelId === model.id || item.fallbackModelId === model.id))
                );
                const result = llm.testResults[model.id];
                const isTesting = llm.testingId === model.id;
                return (
                  <ConnectionRow
                    key={model.id}
                    kind="text"
                    label={model.label}
                    detail={`${model.modelName} · ${usageText(roles.map((role) => role.label))}`}
                    status={result && (
                      <span className={cn("shrink-0 text-xs font-normal tabular-nums", result.success ? "text-success" : "text-destructive")}>
                        ● {result.success ? `${result.latencyMs} ms` : "失敗"}
                      </span>
                    )}
                    onEdit={() => onEdit("text", model)}
                    onDelete={() => onDelete("text", model)}
                  >
                    <Button type="button" size="xs" variant="outline" className="shrink-0" disabled={isTesting}
                      aria-label={`測試 ${model.label}`} onClick={() => llm.testModel(model)}>
                      {isTesting && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
                      測試
                    </Button>
                  </ConnectionRow>
                );
              })}
            </CardLoadState>
          )}
        </ul>
      </div>
    </section>
  );
}
