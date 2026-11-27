import React from "react";
import { MAX_CHARACTERS, MAX_CHARACTER_IMAGES, MIN_CHARACTER_IMAGES, canHaveStartFrame } from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";
import { referenceCharacter } from "./storyboardActions";

const actionClass = "min-h-7 w-fit rounded-md px-1.5 text-left text-xs text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground disabled:opacity-60";

function startFrameHint(eligible, locked, selected) {
  if (!eligible) return "開啟場景轉換後，可以把參考圖設為這一幕的首影格";
  if (locked) return "已附加首影格，第 1 幕不能再設定首影格";
  if (selected) return "這一幕會從首影格開始，再點一次可取消";
  return "點選參考圖，設為這一幕的首影格";
}

export default function ReferenceStrip({
  shot, index, label, previews, characters, frame, startFrameLocked, busy,
  onSetStartFrame, onGenerateFrame, onPromoteReference,
}) {
  const eligible = canHaveStartFrame(shot, index);
  const locked = index === 0 && startFrameLocked;
  const selectable = eligible && !locked;
  const generated = shot.startFrameUploadId && !shot.references.some((item) => item.uploadId === shot.startFrameUploadId);
  return (
    <div className="relative col-start-2 flex flex-col gap-1">
      <div className="flex flex-wrap gap-2" role="group" aria-label={`${label}參考圖`}>
        {shot.references.map((reference) => {
          const { uploadId, label: imageLabel } = reference;
          const selected = shot.startFrameUploadId === uploadId;
          const linked = referenceCharacter(characters, reference);
          const tagged = linked?.uploadIds.includes(uploadId) && shot.characterIds.includes(linked.id);
          const full = linked ? !linked.uploadIds.includes(uploadId) && linked.uploadIds.length >= MAX_CHARACTER_IMAGES : characters.length >= MAX_CHARACTERS;
          const working = frame?.shotId === shot.id && frame.referenceUploadId === uploadId && frame.pending;
          return (
            <div key={imageLabel} className="flex flex-col items-start">
              <button
                type="button"
                className={cn(
                  "relative flex size-14 items-center justify-center overflow-hidden rounded-lg border bg-muted text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  selectable && "press-feedback",
                  selected ? "border-primary ring-1 ring-primary" : "border-border"
                )}
                onClick={() => onSetStartFrame(selected ? null : uploadId)}
                disabled={busy || (!selectable && !selected)}
                aria-pressed={selectable || selected ? selected : undefined}
                aria-label={selectable ? `${imageLabel}設為${label}首影格` : selected ? `取消${label}首影格` : imageLabel}
              >
                {previews[uploadId] ? <img src={previews[uploadId]} alt="" className="size-full object-cover" /> : imageLabel}
                {selected && <span className="absolute inset-x-0 bottom-0 bg-primary text-[10px] font-semibold text-primary-foreground">首影格</span>}
              </button>
              {onGenerateFrame && (
                <button type="button" className={actionClass} disabled={!selectable || busy} aria-busy={working || undefined}
                  aria-label={`用 ${imageLabel} 產生乾淨首影格`} onClick={() => void onGenerateFrame(shot.id, uploadId)}>
                  {working ? "產生首影格中…" : "產生乾淨首影格"}
                </button>
              )}
              {onPromoteReference && (
                <>
                  <button type="button" className={actionClass} disabled={busy || tagged || full}
                    aria-label={`${imageLabel} 設為角色參考`} onClick={() => onPromoteReference(shot.id, reference)}>
                    {tagged ? `已加入 @${linked.name}` : linked ? `加入 @${linked.name}` : full ? "角色名額已滿" : "設為角色參考"}
                  </button>
                  {!linked && characters.some((item) => item.uploadIds.length < MAX_CHARACTER_IMAGES) && (
                    <select className={actionClass} value="" aria-label={`將 ${imageLabel} 加入既有角色`} disabled={busy}
                      onChange={(event) => onPromoteReference(shot.id, reference, event.target.value)}>
                      <option value="" disabled>加入既有角色…</option>
                      {characters.filter((item) => item.uploadIds.length < MAX_CHARACTER_IMAGES).map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  )}
                  {tagged && linked.uploadIds.length < MIN_CHARACTER_IMAGES && (
                    <span className="max-w-36 text-[11px] text-muted-foreground">請在全片設定補一張不同角度的圖</span>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      {generated && (
        <div className="flex items-center gap-2 text-xs">
          {previews[shot.startFrameUploadId] && <img src={previews[shot.startFrameUploadId]} alt="" className="aspect-video w-20 rounded-lg object-cover" />}
          <span>已設為乾淨首影格</span>
          <button type="button" className={actionClass} disabled={busy} onClick={() => onSetStartFrame(null)}>取消首影格</button>
        </div>
      )}
      {frame?.shotId === shot.id && frame.error && <p role="alert" className="text-xs text-destructive">{frame.error}</p>}
      <p className="text-[11px] text-muted-foreground">{startFrameHint(eligible, locked, !generated && Boolean(shot.startFrameUploadId))}</p>
    </div>
  );
}
