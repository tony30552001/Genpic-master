import { useState } from "react";
import {
  CloudCheck,
} from "@/components/icons/lucideStatus";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { describeTemplatePreview } from "./templatePreviewManifest";

/**
 * 還沒開始生成時，右側舞台不該是空的：這裡把當前設定收攏成一張「簡報藍圖」，
 * 並把選定風格的樣張放大呈現，讓左側每一次選擇都能立刻看到後果。
 */
function StyleSample({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className="aspect-video w-full rounded-lg border border-border bg-white object-contain"
    />
  );
}

export default function DeckBlueprint({ title, items = [], styleId, styleName }) {
  const samples = styleId ? describeTemplatePreview("styles", styleId) : [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <ProductGlyph kind="deck" className="icon-sm text-primary" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">簡報藍圖</h3>
        <span className="shrink-0 text-xs text-muted-foreground">產生前的設定總覽</span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto custom-scrollbar p-4">
        <p className="line-clamp-3 text-balance text-base font-medium leading-snug text-foreground">{title}</p>

        <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex min-w-0 items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="truncate text-sm font-medium text-foreground">{item.value}</dd>
                </div>
              </div>
            );
          })}
        </dl>

        <div className="space-y-2 border-t border-border pt-4">
          <h4 className="text-sm font-medium text-foreground">
            {samples.length > 0 ? `${styleName} 樣張` : "設計風格樣張"}
          </h4>
          {samples.length > 0 ? (
            <>
              <div className="space-y-2">
                {samples.map((src, index) => (
                  <StyleSample key={src} src={src} alt={`${styleName}樣張第 ${index + 1} 頁`} />
                ))}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                樣張只是參考，不是保證：版面由 AI 逐次設計，重跑會得到不同排列。可以參考的是配色、字級與裝飾語彙。
              </p>
            </>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
              尚未指定設計風格，AI 會依主題挑選最合適的一套。想先看樣張，可在左側「設計外觀」選定風格。
            </p>
          )}
        </div>

        <p className="flex items-start gap-1.5 border-t border-border pt-4 text-xs text-muted-foreground">
          <CloudCheck className="mt-0.5 icon-sm shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            生成在雲端逐頁進行，約需 5–15 分鐘。開始之後這裡會即時長出每一頁的縮圖，
            你也可以切換頁籤或關閉瀏覽器，回來會自動接續。
          </span>
        </p>
      </div>
    </div>
  );
}
