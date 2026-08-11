import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  FileText,
  History,
  Library,
  Palette,
  Search,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplateLibrary from "@/components/templates/TemplateLibrary";
import StyleLibrary from "@/components/styles/StyleLibrary";
import HistoryPanel from "@/components/history/HistoryPanel";
import AssetMetadataSheet from "./AssetMetadataSheet";

const SECTIONS = [
  { id: "overview", label: "全部資產", icon: Library },
  { id: "templates", label: "範本", icon: FileText },
  { id: "styles", label: "風格庫", icon: Palette },
  { id: "history", label: "紀錄", icon: History },
];

const getSeconds = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return value > 1e12 ? value / 1000 : value;
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isNaN(milliseconds) ? 0 : milliseconds / 1000;
  }
  if (value instanceof Date) return value.getTime() / 1000;
  return typeof value.seconds === "number" ? value.seconds : 0;
};

const getAssetDate = (asset) =>
  asset.updatedAt || asset.publishedAt || asset.createdAt || null;

const TYPE_META = {
  template: {
    label: "範本",
    actionLabel: "套用範本",
    badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300",
    emptyHint: "把常用的腳本與風格組合存成範本，下次一鍵套用。",
  },
  style: {
    label: "風格",
    actionLabel: "套用風格",
    badgeClass: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    emptyHint: "分析參考圖後儲存風格，就能在這裡集中管理。",
  },
  history: {
    label: "紀錄",
    actionLabel: "載入設定",
    badgeClass: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300",
    emptyHint: "完成一次生成後，結果會自動保存在這裡。",
  },
};

// 相對時間：7 天內顯示「N 天前」等，跨年補上年份
const formatAssetDate = (value) => {
  const seconds = getSeconds(value);
  if (seconds <= 0) return "最近";
  const date = new Date(seconds * 1000);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMs < 0 || diffDays >= 7) {
    const sameYear = date.getFullYear() === now.getFullYear();
    return new Intl.DateTimeFormat("zh-TW", {
      ...(sameYear ? {} : { year: "numeric" }),
      month: "short",
      day: "numeric",
    }).format(date);
  }
  const formatter = new Intl.RelativeTimeFormat("zh-TW", { numeric: "auto" });
  if (diffDays >= 1) return formatter.format(-diffDays, "day");
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours >= 1) return formatter.format(-diffHours, "hour");
  return "剛剛";
};

const normalizeAsset = (type, item) => ({
  id: item.id,
  type,
  title: item.name || item.userScript || "未命名資產",
  description: item.description || item.userScript || "",
  previewUrl: item.previewUrl || item.imageUrl || "",
  date: getAssetDate(item),
  item,
});

function OverviewAssetCard({ asset, onOpen, onPrimaryAction, index = 0 }) {
  const meta = TYPE_META[asset.type];

  return (
    <article
      className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md motion-reduce:transform-none animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <button
        type="button"
        onClick={() => onOpen(asset)}
        className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`查看${asset.title}`}
      >
        {/* 媒體區：風格/紀錄用 16:9 預覽圖，範本用品牌色帶＋icon */}
        {asset.previewUrl ? (
          <div className="relative aspect-[16/9] overflow-hidden bg-muted">
            <img
              src={asset.previewUrl}
              alt=""
              width={640}
              height={360}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
            />
            <Badge className={`absolute left-3 top-3 backdrop-blur-sm ${meta.badgeClass}`}>
              {meta.label}
            </Badge>
          </div>
        ) : (
          <div className="relative">
            <div className="h-1.5 bg-primary" />
            <div className="flex h-16 items-center justify-center bg-muted/40">
              {asset.type === "style" ? (
                <Palette className="h-6 w-6 text-primary/50" aria-hidden="true" />
              ) : asset.type === "history" ? (
                <History className="h-6 w-6 text-primary/50" aria-hidden="true" />
              ) : (
                <FileText className="h-6 w-6 text-primary/50" aria-hidden="true" />
              )}
            </div>
          </div>
        )}

        <div className="min-w-0 px-4 pt-3">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{asset.title}</h3>
            {!asset.previewUrl && (
              <Badge className={`shrink-0 text-[10px] ${meta.badgeClass}`}>
                {meta.label}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {asset.description || "尚無描述"}
          </p>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-3 pt-3">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {formatAssetDate(asset.date)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onPrimaryAction(asset.item)}
          className="gap-1.5"
          aria-label={`${meta.actionLabel} ${asset.title}`}
        >
          {meta.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </article>
  );
}

function OverviewSection({ type, title, description, icon: Icon, assets, onOpenSection, onOpenAsset, onPrimaryAction, onGoCreate }) {
  return (
    <section className="space-y-3" aria-labelledby={`overview-${type}-title`}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
          </span>
          <div className="min-w-0">
            <h2 id={`overview-${type}-title`} className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onOpenSection} className="shrink-0 gap-1.5 text-xs">
          查看全部
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>

      {assets.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset, index) => (
            <OverviewAssetCard
              key={`${asset.type}-${asset.id}`}
              asset={asset}
              index={index}
              onOpen={onOpenAsset}
              onPrimaryAction={onPrimaryAction}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground/50">
            {React.createElement(Icon, { className: "h-6 w-6", "aria-hidden": true })}
          </span>
          <div>
            <p className="text-sm font-medium text-muted-foreground">目前還沒有{title}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">{TYPE_META[type].emptyHint}</p>
          </div>
          {onGoCreate && (
            <Button type="button" size="sm" onClick={onGoCreate} className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              開始創作
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export default function AssetCenter({
  initialSection = "overview",
  templates = [],
  savedStyles = [],
  historyItems = [],
  historySearchQuery = "",
  onHistorySearchChange,
  styleSearchQuery = "",
  onStyleSearchChange,
  isLoadingStyles,
  isSearchingStyles,
  styleError,
  styleScope,
  onStyleScopeChange,
  styleSort,
  onStyleSortChange,
  onApplyTemplate,
  onDeleteTemplate,
  onDeleteTemplates,
  onUpdateTemplate,
  onApplyStyle,
  onDeleteStyle,
  onDeleteStyles,
  onUpdateStyle,
  onPublishStyle,
  onUnpublishStyle,
  onCopyStyle,
  onLoadHistory,
  onDeleteHistory,
  onDeleteHistoryItems,
  onGoCreate,
}) {
  const normalizeSection = (value) =>
    SECTIONS.some((item) => item.id === value) ? value : "overview";
  const [section, setSectionState] = useState(() => normalizeSection(initialSection));
  const navigate = useNavigate();
  const searchInputRef = useRef(null);

  // URL → state：瀏覽器返回鍵或外部 deep-link 變更時同步（render 期間調整 state，避免 effect 內 setState）
  const [lastUrlSection, setLastUrlSection] = useState(() => normalizeSection(initialSection));
  const urlSection = normalizeSection(initialSection);
  if (urlSection !== lastUrlSection) {
    setLastUrlSection(urlSection);
    setSectionState(urlSection);
  }

  // state → URL：tab 切換寫回 ?section=，重新整理保持上下文
  const setSection = (value) => {
    const next = normalizeSection(value);
    setSectionState(next);
    if (next !== urlSection) {
      navigate(`?section=${next}`, { replace: true });
    }
  };
  const [overviewSearchQuery, setOverviewSearchQuery] = useState("");
  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [editingAsset, setEditingAsset] = useState(null);
  const [metadataError, setMetadataError] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const counts = {
    templates: templates.length,
    styles: savedStyles.length,
    history: historyItems.length,
  };

  const allAssets = useMemo(
    () => [
      ...templates.map((item) => normalizeAsset("template", item)),
      ...savedStyles.map((item) => normalizeAsset("style", item)),
      ...historyItems.map((item) => normalizeAsset("history", item)),
    ]
      .sort((a, b) => getSeconds(b.date) - getSeconds(a.date))
      .filter((asset) => {
        const query = overviewSearchQuery.trim().toLowerCase();
        if (!query) return true;
        return [asset.title, asset.description, asset.item.tags?.join(" "), asset.item.stylePrompt]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      }),
    [historyItems, overviewSearchQuery, savedStyles, templates]
  );

  const overviewByType = {
    templates: allAssets.filter((asset) => asset.type === "template").slice(0, 3),
    styles: allAssets.filter((asset) => asset.type === "style").slice(0, 3),
    history: allAssets.filter((asset) => asset.type === "history").slice(0, 3),
  };

  const activeSearchQuery = section === "overview"
    ? overviewSearchQuery
    : section === "templates"
      ? templateSearchQuery
      : section === "styles"
        ? styleSearchQuery
        : historySearchQuery;

  const handleSearchChange = (value) => {
    if (section === "overview") setOverviewSearchQuery(value);
    if (section === "templates") setTemplateSearchQuery(value);
    if (section === "styles") onStyleSearchChange?.(value);
    if (section === "history") onHistorySearchChange?.(value);
  };

  // 「/」快捷鍵聚焦搜尋（正在輸入時不觸發）
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTyping) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleEdit = (type, asset) => {
    setMetadataError("");
    setEditingAsset({ type, asset });
  };

  const handleSaveMetadata = async (data) => {
    if (!editingAsset) return;
    setIsSavingMetadata(true);
    setMetadataError("");
    try {
      if (editingAsset.type === "template") {
        const template = editingAsset.asset;
        await onUpdateTemplate?.(template.id, {
          ...data,
          userScript: template.userScript ?? null,
          stylePrompt: template.stylePrompt ?? null,
          styleId: template.styleId ?? null,
          previewUrl: template.previewUrl ?? null,
          category: template.category || "general",
        });
      } else {
        await onUpdateStyle?.(editingAsset.asset.id, data);
      }
      setEditingAsset(null);
    } catch (error) {
      setMetadataError(error.message || "儲存變更失敗");
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleOpenOverviewAsset = (asset) => {
    if (asset.type === "template") {
      setSection("templates");
      return;
    }
    if (asset.type === "style") {
      setSection("styles");
      return;
    }
    setSection("history");
  };

  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-5">
      {/* 品牌 header：漸層光暈＋display 字級 */}
      <Card className="relative overflow-hidden border-border/80 shadow-sm">
        <div
          className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
          aria-hidden="true"
        />
        <CardHeader className="relative gap-5 bg-transparent pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                  <Library className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance sm:text-3xl">素材中心</h1>
                  <p className="mt-1 text-sm text-muted-foreground text-pretty">
                    在同一個工作區管理可重複使用的範本、風格與生成紀錄。
                  </p>
                </div>
              </div>
            </div>
            <Button type="button" onClick={onGoCreate} className="w-full gap-2 sm:w-auto">
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              開始創作
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* 分頁＋搜尋：sticky 吸頂，長列表操作不迷路 */}
      <div className="sticky top-0 z-20 -mx-1 space-y-3 bg-background/80 px-1 py-3 backdrop-blur-md">
        <Tabs value={section} onValueChange={setSection}>
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4" aria-label="素材中心分類">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <TabsTrigger key={id} value={id} className="min-h-11 gap-1.5">
                {React.createElement(Icon, { className: "h-4 w-4", "aria-hidden": true })}
                <span>{label}</span>
                {id !== "overview" && (
                  <span className="ml-0.5 text-[11px] tabular-nums text-muted-foreground">{counts[id]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            ref={searchInputRef}
            value={activeSearchQuery}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={section === "overview" ? "搜尋全部資產…" : `搜尋${SECTIONS.find((item) => item.id === section)?.label}…`}
            aria-label="搜尋素材"
            autoComplete="off"
            className="h-11 pl-10 pr-16"
          />
          <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden h-6 -translate-y-1/2 items-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
            /
          </kbd>
        </div>
      </div>

      {section === "overview" && (
        <div className="space-y-8 animate-in fade-in duration-200 motion-reduce:animate-none" key="overview">
          <section className="grid gap-3 sm:grid-cols-3" aria-label="素材摘要">
            {[
              { id: "templates", label: "可重複使用範本", value: counts.templates, icon: FileText },
              { id: "styles", label: "已儲存風格", value: counts.styles, icon: Palette },
              { id: "history", label: "生成紀錄", value: counts.history, icon: History },
            ].map(({ id, label, value, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className="group flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 text-left transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:bg-muted/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`查看${label}`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-background text-primary shadow-sm">
                  {React.createElement(Icon, { className: "h-5 w-5", "aria-hidden": true })}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted-foreground">{label}</span>
                  <span className="mt-1 block text-2xl font-semibold tabular-nums text-foreground">{value}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-[transform,color] group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none" aria-hidden="true" />
              </button>
            ))}
          </section>

          <OverviewSection
            type="template"
            title="範本"
            description="快速套用常用的內容與風格組合"
            icon={FileText}
            assets={overviewByType.templates}
            onOpenSection={() => setSection("templates")}
            onOpenAsset={handleOpenOverviewAsset}
            onPrimaryAction={onApplyTemplate}
            onGoCreate={onGoCreate}
          />
          <OverviewSection
            title="風格庫"
            description="集中管理個人收藏與共享視覺風格"
            icon={Palette}
            type="style"
            assets={overviewByType.styles}
            onOpenSection={() => setSection("styles")}
            onOpenAsset={handleOpenOverviewAsset}
            onPrimaryAction={onApplyStyle}
            onGoCreate={onGoCreate}
          />
          <OverviewSection
            title="紀錄"
            description="回看最近生成結果，載入設定繼續編輯"
            icon={History}
            type="history"
            assets={overviewByType.history}
            onOpenSection={() => setSection("history")}
            onOpenAsset={handleOpenOverviewAsset}
            onPrimaryAction={onLoadHistory}
            onGoCreate={onGoCreate}
          />
        </div>
      )}

      {section === "templates" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none" key="templates">
          <TemplateLibrary
          templates={templates}
          searchQuery={templateSearchQuery}
          onSearchChange={setTemplateSearchQuery}
          hideSearch
          onApplyTemplate={onApplyTemplate}
          onDeleteTemplate={onDeleteTemplate}
          onDeleteTemplates={onDeleteTemplates}
          onEditTemplate={(template) => handleEdit("template", template)}
          />
        </div>
      )}

      {section === "styles" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none" key="styles">
          <StyleLibrary
          savedStyles={savedStyles}
          isLoading={isLoadingStyles}
          isSearching={isSearchingStyles}
          error={styleError}
          searchQuery={styleSearchQuery}
          onSearchChange={onStyleSearchChange}
          hideSearch
          scope={styleScope}
          onScopeChange={onStyleScopeChange}
          sort={styleSort}
          onSortChange={onStyleSortChange}
          onApplyStyle={onApplyStyle}
          onDeleteStyle={onDeleteStyle}
          onDeleteStyles={onDeleteStyles}
          onUpdateStyle={onUpdateStyle}
          onPublishStyle={onPublishStyle}
          onUnpublishStyle={onUnpublishStyle}
          onCopyStyle={onCopyStyle}
          onGoCreate={onGoCreate}
          onEditStyle={(style) => handleEdit("style", style)}
          />
        </div>
      )}

      {section === "history" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none" key="history">
          <HistoryPanel
          historyItems={historyItems}
          savedStyles={savedStyles}
          searchQuery={historySearchQuery}
          onSearchChange={onHistorySearchChange}
          hideSearch
          onLoad={onLoadHistory}
          onDelete={onDeleteHistory}
          onDeleteItems={onDeleteHistoryItems}
          onGoCreate={onGoCreate}
          />
        </div>
      )}

      <AssetMetadataSheet
        key={editingAsset ? `${editingAsset.type}-${editingAsset.asset.id}` : "asset-metadata-sheet"}
        asset={editingAsset?.asset}
        type={editingAsset?.type}
        error={metadataError}
        isSaving={isSavingMetadata}
        onClose={() => {
          if (!isSavingMetadata) {
            setEditingAsset(null);
            setMetadataError("");
          }
        }}
        onSave={handleSaveMetadata}
      />
    </div>
  );
}
