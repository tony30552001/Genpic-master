import React, { useState } from "react";
import { Check, Loader2 } from "@/components/icons/lucideStatus";
import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { IMAGE_ROLES } from "@/hooks/useImageModelAdmin";
import { CardHead, CardLoadState, ROW_GRID } from "./modelCardParts";

const SELECT_CLASS = "h-9 min-w-0 text-sm";
const llmOptionLabel = (model) => `${model.label}（${model.modelName}）`;

function RoleRow({ label, description, warning, saved, pending, children }) {
  return (
    <li className={cn(ROW_GRID, "px-4 py-2.5 transition-opacity duration-(--motion-hover)", pending && "opacity-60")}>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{label}</span>
          {pending && <Loader2 className="icon-xs shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-label="儲存中" />}
          <span
            aria-hidden={!saved}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-xs font-normal text-success transition-opacity motion-reduce:transition-none",
              saved ? "opacity-100 duration-(--motion-enter) ease-emphasized" : "opacity-0 duration-(--motion-exit) ease-exit"
            )}
          >
            <Check className="icon-xs" aria-hidden="true" />已儲存
          </span>
        </p>
        <p className={cn("truncate text-xs", warning ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {warning ? `⚠ ${warning}` : description}
        </p>
      </div>
      {children}
    </li>
  );
}

function GroupLabel({ children }) {
  return (
    <li className="px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground first:pt-2" aria-hidden="true">
      {children}
    </li>
  );
}

function VideoPolicyForm({ video, saved }) {
  const [videoQuota, setVideoQuota] = useState(String(video.settings.dailyQuotaPerUser));
  const [submitsPerMinute, setSubmitsPerMinute] = useState(String(video.settings.submitsPerMinute));

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          每人每日生成額度
          <Input type="number" min="1" max="100" value={videoQuota} onChange={(event) => setVideoQuota(event.target.value)} />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          每個模型每分鐘送出上限
          <Input type="number" min="1" max="40" value={submitsPerMinute} onChange={(event) => setSubmitsPerMinute(event.target.value)} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {video.settings.allowedModels.length} 個模型開放；模型清單於右側切換。
        </p>
        <Button
          type="button"
          size="sm"
          disabled={video.isSavingPolicy}
          onClick={() => void video.saveSettings({
            allowedModels: video.settings.allowedModels,
            dailyQuotaPerUser: Number(videoQuota),
            submitsPerMinute: Number(submitsPerMinute),
          }).catch(() => {})}
        >
          {saved ? <Check aria-hidden="true" /> : null}
          儲存影片政策
        </Button>
      </div>
    </li>
  );
}

export default function ModelAssignments({ image, llm, video, savedRow, className }) {
  const imageModels = image.catalog?.models ?? [];
  const llmModels = llm.settings?.models ?? [];
  const assignmentByRole = Object.fromEntries((llm.settings?.assignments ?? []).map((item) => [item.role, item]));
  return (
    <section aria-labelledby="model-assignments-title" className={className}>
      <CardHead id="model-assignments-title" title="功能指派" />
      <div className={cn(ROW_GRID, "hidden border-b border-border px-4 py-2 text-xs text-muted-foreground sm:grid")} aria-hidden="true">
        <span>功能</span><span>主要模型</span><span>備援模型</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <ul className="pb-2">
          <GroupLabel>圖片</GroupLabel>
          <CardLoadState state={image} retryLabel="重新載入圖片模型設定">
            {IMAGE_ROLES.map((role) => {
              const value = image.policy?.[role.field];
              const isRegistered = imageModels.some((model) => model.modelKey === value);
              return (
                <RoleRow
                  key={role.field}
                  label={role.label}
                  description={role.description}
                  warning={imageModels.length === 0 ? "請先在右側新增圖片模型" : !isRegistered ? "尚未指派，此功能無法使用" : ""}
                  saved={savedRow === role.field}
                  pending={image.isSavingPolicy}
                >
                  <SelectField
                    aria-label={`${role.label}模型`}
                    className={cn(SELECT_CLASS, "sm:col-span-2", !isRegistered && "border-warning")}
                    value={isRegistered ? value : ""}
                    disabled={image.isSavingPolicy || imageModels.length === 0}
                    placeholder="選擇模型"
                    onValueChange={(modelKey) => image.assignImageRole(role.field, modelKey)}
                    options={imageModels.map((model) => ({ value: model.modelKey, label: model.label }))}
                  />
                </RoleRow>
              );
            })}
          </CardLoadState>
          <GroupLabel>文字</GroupLabel>
          <CardLoadState state={llm} retryLabel="重新載入文字模型設定">
            {(llm.settings?.roles ?? []).map((role) => {
              const assignment = assignmentByRole[role.id] || {};
              const pending = llm.pendingRole === role.id;
              const fallbackOptions = llmModels.filter((model) => model.id !== assignment.modelId);
              return (
                <RoleRow
                  key={role.id}
                  label={role.label}
                  description={role.description}
                  warning={llmModels.length === 0 ? "請先在右側新增文字模型" : !assignment.modelId ? "尚未指派，此功能無法使用" : ""}
                  saved={savedRow === role.id}
                  pending={pending}
                >
                  <SelectField
                    aria-label={`${role.label}主要模型`}
                    className={cn(SELECT_CLASS, !assignment.modelId && "border-warning")}
                    value={assignment.modelId || ""}
                    disabled={pending || llmModels.length === 0}
                    placeholder="選擇模型"
                    onValueChange={(value) => llm.assignRole(role, "modelId", value)}
                    options={llmModels.map((model) => ({ value: model.id, label: llmOptionLabel(model) }))}
                  />
                  <SelectField
                    aria-label={`${role.label}備援模型`}
                    className={SELECT_CLASS}
                    value={assignment.fallbackModelId || ""}
                    disabled={pending || !assignment.modelId || fallbackOptions.length === 0}
                    emptyLabel="無備援"
                    onValueChange={(value) => llm.assignRole(role, "fallbackModelId", value)}
                    options={fallbackOptions.map((model) => ({ value: model.id, label: llmOptionLabel(model) }))}
                  />
                </RoleRow>
              );
            })}
          </CardLoadState>
          <GroupLabel>影片</GroupLabel>
          <CardLoadState state={video} retryLabel="重新載入影片政策">
            {video.settings && (
              <VideoPolicyForm
                key={`${video.settings.dailyQuotaPerUser}:${video.settings.submitsPerMinute}`}
                video={video}
                saved={savedRow === "video-policy"}
              />
            )}
          </CardLoadState>
        </ul>
      </div>
    </section>
  );
}
