import React, { useRef, useState } from "react";
import { Plus, Trash2, X } from "@/components/icons/lucideControls";
import { ImagePlus } from "@/components/icons/lucideContent";
import { Loader2 } from "@/components/icons/lucideStatus";
import { SelectField } from "@/components/ui/select-field";
import { MAX_CHARACTER_IMAGES, MIN_CHARACTER_IMAGES } from "@/lib/videoStoryboard";

const NO_LABEL = "none";

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-border bg-transparent px-2.5 text-[13px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none";

const thumbButton =
  "absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Uploads picked files, keeping the successes and surfacing the first failure. */
const uploadAll = async (files, uploadImage) => {
  const results = await Promise.allSettled(files.map((file) => uploadImage(file)));
  const failure = results.find((result) => result.status === "rejected");
  return {
    uploadIds: results.filter((result) => result.status === "fulfilled").map((result) => result.value),
    error: failure ? failure.reason?.message || "角色參考圖上傳失敗" : "",
  };
};

function ImageStrip({ name, uploadIds, previews, uploading, keepMinimum = false, onAdd, onRemove }) {
  const inputRef = useRef(null);
  const remaining = MAX_CHARACTER_IMAGES - uploadIds.length;
  // A saved character must keep a frontal image plus one reference.
  const canRemove = !keepMinimum || uploadIds.length > MIN_CHARACTER_IMAGES;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {uploadIds.map((uploadId, index) => (
        <span key={uploadId} className="relative size-11 shrink-0">
          {previews[uploadId] ? (
            <img src={previews[uploadId]} alt="" className="size-full rounded-lg border border-border object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
              {name.trim().slice(0, 1) || "?"}
            </span>
          )}
          {index === 0 && (
            <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-black/55 text-center text-[10px] leading-4 text-white">
              正面
            </span>
          )}
          {canRemove && (
            <button
              type="button"
              className={thumbButton}
              onClick={() => onRemove(uploadId)}
              aria-label={`移除第 ${index + 1} 張圖`}
            >
              <X className="size-3" aria-hidden="true" />
            </button>
          )}
        </span>
      ))}
      {remaining > 0 && (
        <>
          <button
            type="button"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-dashed border-border text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            aria-label={uploadIds.length === 0 ? "上傳正面圖" : "加入參考圖"}
          >
            {uploading
              ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              : <ImagePlus className="size-4" aria-hidden="true" />}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = [...event.target.files];
              event.target.value = "";
              if (files.length) onAdd(files.slice(0, remaining), files.length - remaining);
            }}
          />
        </>
      )}
    </div>
  );
}

const skippedMessage = (skipped) => (skipped > 0 ? `每個角色最多 ${MAX_CHARACTER_IMAGES} 張圖，已略過 ${skipped} 張` : "");

function CharacterRow({ character, index, previews, labelOptions, actions }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const addImages = async (files, skipped) => {
    setUploading(true);
    setError("");
    const result = await uploadAll(files, actions.uploadImage);
    setUploading(false);
    setError(result.error || skippedMessage(skipped));
    if (result.uploadIds.length) {
      actions.updateCharacter(character.id, { uploadIds: [...character.uploadIds, ...result.uploadIds] });
    }
  };
  return (
    <li className="storyboard-enter flex flex-col gap-2 rounded-xl border border-border p-2.5" style={{ "--i": index }}>
      <div className="flex items-start gap-2">
        <ImageStrip
          name={character.name}
          uploadIds={character.uploadIds}
          previews={previews}
          uploading={uploading}
          keepMinimum
          onAdd={addImages}
          onRemove={(uploadId) =>
            actions.updateCharacter(character.id, { uploadIds: character.uploadIds.filter((item) => item !== uploadId) })}
        />
        <button
          type="button"
          className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => actions.removeCharacter(character.id)}
          aria-label={`移除角色「${character.name}」`}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {character.uploadIds.length < MIN_CHARACTER_IMAGES && (
        <p className="text-xs text-muted-foreground">已沿用分鏡參考圖作為正面圖；請再加入一張不同角度的圖。</p>
      )}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
        <input
          className={fieldClass}
          value={character.name}
          maxLength={30}
          placeholder="名稱"
          onChange={(event) => actions.updateCharacter(character.id, { name: event.target.value })}
          aria-label="角色名稱"
        />
        <input
          className={fieldClass}
          value={character.description}
          maxLength={300}
          placeholder="外觀描述"
          onChange={(event) => actions.updateCharacter(character.id, { description: event.target.value })}
          aria-label={`「${character.name}」的外觀描述`}
        />
      </div>
      {labelOptions.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">對應腳本的</span>
          <SelectField
            aria-label={`「${character.name}」對應的腳本圖片`}
            value={character.imageLabel || NO_LABEL}
            onValueChange={(value) => actions.updateCharacter(character.id, { imageLabel: value === NO_LABEL ? null : value })}
            options={[{ value: NO_LABEL, label: "不對應" }, ...labelOptions]}
            className="h-7 w-auto min-w-0 gap-1 rounded-lg px-2 text-xs"
          />
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function NewCharacterForm({ previews, actions, onDone }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [uploadIds, setUploadIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const missing = Math.max(0, MIN_CHARACTER_IMAGES - uploadIds.length);
  const ready = name.trim() && missing === 0 && !uploading;

  const addImages = async (files, skipped) => {
    setUploading(true);
    setError("");
    const result = await uploadAll(files, actions.uploadImage);
    setUploading(false);
    setError(result.error || skippedMessage(skipped));
    setUploadIds((current) => [...current, ...result.uploadIds]);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!ready) return;
    actions.addCharacter({ name: name.trim(), description: description.trim(), uploadIds, imageLabel: null });
    onDone();
  };

  return (
    <form className="storyboard-enter flex flex-col gap-2 rounded-xl border border-dashed border-primary/50 p-2.5" onSubmit={submit}>
      <ImageStrip
        name={name}
        uploadIds={uploadIds}
        previews={previews}
        uploading={uploading}
        onAdd={addImages}
        onRemove={(uploadId) => setUploadIds((current) => current.filter((item) => item !== uploadId))}
      />
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
        <input
          className={fieldClass}
          value={name}
          maxLength={30}
          placeholder="名稱，例如：咖啡師"
          onChange={(event) => setName(event.target.value)}
          aria-label="新角色名稱"
          autoFocus
        />
        <input
          className={fieldClass}
          value={description}
          maxLength={300}
          placeholder="外觀描述（選填）"
          onChange={(event) => setDescription(event.target.value)}
          aria-label="新角色外觀描述"
        />
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {missing > 0 ? `先上傳正面圖，再加 1–3 張參考圖（還差 ${missing} 張）` : "第一張是正面圖"}
        </span>
        <button
          type="button"
          className="h-7 shrink-0 rounded-lg px-2.5 text-xs text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onDone}
        >
          取消
        </button>
        <button
          type="submit"
          className="h-7 shrink-0 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          disabled={!ready}
        >
          加入角色
        </button>
      </div>
    </form>
  );
}

/**
 * Characters and products whose look must hold across shots. Kling sends their
 * images as elements when there is a start frame; otherwise the compiled
 * prompt describes them in text (the board footer says which).
 */
export default function CharacterList({ characters, imageLabels, actions }) {
  const [adding, setAdding] = useState(false);
  const labelOptionsFor = (character) =>
    [...new Set([...imageLabels, ...(character.imageLabel ? [character.imageLabel] : [])])]
      .filter((label) => !characters.some((item) => item.id !== character.id && item.imageLabel === label))
      .map((label) => ({ value: label, label: `@${label}` }));

  return (
    <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold">角色與產品</h3>
        <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">固定外觀，讓每一幕看起來是同一個</p>
      </div>
      {characters.length > 0 && (
        <ul className="flex flex-col gap-2">
          {characters.map((character, index) => (
            <CharacterRow
              key={character.id}
              character={character}
              index={index}
              previews={actions.previews}
              labelOptions={labelOptionsFor(character)}
              actions={actions}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <NewCharacterForm previews={actions.previews} actions={actions} onDone={() => setAdding(false)} />
      ) : (
        actions.canAddCharacter && (
          <button
            type="button"
            className="flex h-8.5 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-dashed border-border text-xs text-muted-foreground press-feedback hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAdding(true)}
          >
            <Plus className="size-3.5" aria-hidden="true" />新增角色或產品
          </button>
        )
      )}
    </div>
  );
}
