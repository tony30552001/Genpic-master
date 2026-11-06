import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "@/components/icons/lucideControls";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TemplateLibrary from "@/components/templates/TemplateLibrary";
import StyleLibrary from "@/components/styles/StyleLibrary";
import { AnimatePresence } from "motion/react";
import AssetMetadataSheet from "./AssetMetadataSheet";
import AssetViewModeToggle from "./AssetViewModeToggle";
import ImageGallery from "./ImageGallery";
import QuickApplyStrip from "./QuickApplyStrip";
import { normalizeViewMode } from "./viewMode";

const SECTIONS = [
  { id: "images", label: "圖片", searchLabel: "圖片" },
  { id: "templates", label: "範本", searchLabel: "範本" },
  { id: "styles", label: "風格", searchLabel: "風格" },
];

const normalizeSection = (value) =>
  SECTIONS.some((item) => item.id === value) ? value : "images";

export default function AssetCenter({
  initialSection = "images",
  initialViewMode = "table",
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
  onCreateTemplate,
  onApplyStyle,
  onDeleteStyle,
  onDeleteStyles,
  onUpdateStyle,
  onCreateStyle,
  onPublishStyle,
  onUnpublishStyle,
  onCopyStyle,
  onLoadHistory,
  onDeleteHistory,
  onDeleteHistoryItems,
  onGoCreate,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef(null);
  const section = normalizeSection(searchParams.get("section") || initialSection);
  const viewMode = normalizeViewMode(searchParams.get("view") || initialViewMode);

  const updateLibraryQuery = (nextSection = section, nextViewMode = viewMode) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("section", nextSection);
    nextParams.set("view", nextViewMode);
    setSearchParams(nextParams, { replace: true });
  };

  const setSection = (value) => updateLibraryQuery(normalizeSection(value), viewMode);
  const setViewMode = (value) => updateLibraryQuery(section, normalizeViewMode(value));

  const [templateSearchQuery, setTemplateSearchQuery] = useState("");
  const [editingAsset, setEditingAsset] = useState(null);
  const [metadataError, setMetadataError] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const counts = {
    images: historyItems.length,
    templates: templates.length,
    styles: savedStyles.length,
  };

  const activeSearchQuery =
    section === "images"
      ? historySearchQuery
      : section === "templates"
        ? templateSearchQuery
        : styleSearchQuery;

  const handleSearchChange = (value) => {
    if (section === "images") onHistorySearchChange?.(value);
    if (section === "templates") setTemplateSearchQuery(value);
    if (section === "styles") onStyleSearchChange?.(value);
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

  return (
    <div className="mx-auto flex w-full max-w-[1760px] flex-col gap-4">
      {/* 分頁＋搜尋：sticky 吸頂，長列表操作不迷路 */}
      <div className="sticky top-0 z-20 -mx-1 space-y-2 bg-background/80 px-1 py-2 backdrop-blur-md">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 icon-sm -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              ref={searchInputRef}
              value={activeSearchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder={
                section === "images"
                  ? "搜尋提示詞、風格或日期…"
                  : `搜尋${SECTIONS.find((item) => item.id === section)?.searchLabel}…`
              }
              aria-label="搜尋素材"
              autoComplete="off"
              className="h-11 pl-10 pr-16"
            />
            <kbd className="pointer-events-none absolute right-3.5 top-1/2 hidden h-6 -translate-y-1/2 items-center rounded-md border border-border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
              /
            </kbd>
          </div>
          <Tabs value={section} onValueChange={setSection}>
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:inline-flex sm:w-fit" aria-label="素材中心分類">
              {SECTIONS.map(({ id, label }) => (
                <TabsTrigger key={id} value={id} className="min-h-11 gap-1.5 lg:min-h-9 lg:px-4">
                  <span>{label}</span>
                  <span className="ml-0.5 text-[11px] tabular-nums text-muted-foreground">{counts[id]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {section !== "images" && <AssetViewModeToggle value={viewMode} onChange={setViewMode} />}
        </div>
        {section === "images" && (
          <QuickApplyStrip
            templates={templates}
            savedStyles={savedStyles}
            onApplyTemplate={onApplyTemplate}
            onApplyStyle={onApplyStyle}
          />
        )}
      </div>

      {section === "images" && (
        <div className="animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none" key="images">
          <ImageGallery
            historyItems={historyItems}
            savedStyles={savedStyles}
            searchQuery={historySearchQuery}
            onEdit={onLoadHistory}
            onDelete={onDeleteHistory}
            onDeleteItems={onDeleteHistoryItems}
            onCreateStyle={onCreateStyle}
            onCreateTemplate={onCreateTemplate}
            onGoCreate={onGoCreate}
          />
        </div>
      )}

      {section === "templates" && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none" key="templates">
          <TemplateLibrary
            templates={templates}
            viewMode={viewMode}
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
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none" key="styles">
          <StyleLibrary
            savedStyles={savedStyles}
            viewMode={viewMode}
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

      <AnimatePresence>
        {editingAsset && (
          <AssetMetadataSheet
            key={`${editingAsset.type}-${editingAsset.asset.id}`}
            asset={editingAsset.asset}
            type={editingAsset.type}
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
        )}
      </AnimatePresence>
    </div>
  );
}
