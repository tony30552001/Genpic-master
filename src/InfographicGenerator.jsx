import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from "motion/react";
import {
  AlertCircle,
} from "@/components/icons/lucideStatus";
import {
  FileText,
  Library,
  MessageSquare,
  ImagePlus,
  Wand2,
  WandSparkles,
} from "@/components/icons/lucideContent";
import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useTemplates from './hooks/useTemplates';
import useCreateWorkspace from './hooks/useCreateWorkspace';
import useImageVersions from './hooks/useImageVersions';
import useImageRefine from './hooks/useImageRefine';
import { uploadFile } from './services/storageService';
import { STYLE_TRANSFER_PURPOSE, REFERENCE_PURPOSE } from './lib/attachmentPurposes';
import { readFileAsDataUrl } from './lib/imageFile';
import { isNearDuplicatePrompt } from './lib/promptHints';
import { DEFAULT_IMAGE_LANGUAGE } from './config';
import { getLanguageOption } from './lib/imageTextLanguage';
import { getImageModelSetupError, getImageQualityError } from './lib/imageModel';

import { Button } from '@/components/ui/button';


import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import PptMasterStudio from './components/create/PptMasterStudio';
import GenerateBar from './components/create/GenerateBar';
import ExpandedCanvas from './components/create/ExpandedCanvas';
import PreciseEditor from './components/edit/PreciseEditor';
import VersionStrip from './components/create/VersionStrip';
import MobileResultView from './components/create/MobileResultView';
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import AttachmentPicker from './components/create/AttachmentPicker';
import AssetCenter from './components/library/AssetCenter';
import AppHeader from './components/common/AppHeader';
import ChatWorkspace from './components/chat/ChatWorkspace';
import useImageChat from './hooks/useImageChat';
import { DEFAULT_IMAGE_PURPOSE } from './lib/imagePurposes';

export default function InfographicGenerator({
    initialTab = 'general',
    initialLibrarySection = 'images',
    initialLibraryViewMode = 'table',
}) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab);

    // 風格參考圖（只用於風格分析，與內容附圖分開）
    const [referencePreview, setReferencePreview] = useState(null);
    const [referenceUploadId, setReferenceUploadId] = useState(null);
    const [isUploadingStyleReference, setIsUploadingStyleReference] = useState(false);

    const [userScript, setUserScript] = useState('');
    const [optimizedPromptEn, setOptimizedPromptEn] = useState('');

    // 全域設定
    const [imageLanguage, setImageLanguage] = useState(() => {
        try { return getLanguageOption(localStorage.getItem('genpic_image_language')).id; } catch { return DEFAULT_IMAGE_LANGUAGE; }
    });

    // 風格設定相關
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [selectedImageQuality, setImageQuality] = useState();
    const [errorMsg, setErrorMsg] = useState('');
    const [warningMsg, setWarningMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [, setIsInputFocused] = useState(false);
    const [isStyleNameTouched, setIsStyleNameTouched] = useState(false);
    const [isStyleTagsTouched, setIsStyleTagsTouched] = useState(false);
    const [appliedStyleId, setAppliedStyleId] = useState(null);
    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const [canvasOrigin, setCanvasOrigin] = useState(null);
    const [isPreciseEditOpen, setIsPreciseEditOpen] = useState(false);
    const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_QUERY);
    const [paletteStyleTags, setPaletteStyleTags] = useState([]);
    const [imagePurpose, setImagePurpose] = useState('infographic');

    const handlePaletteStyleChange = (tags) => {
        setPaletteStyleTags(tags);
        // 調色盤風格改變時，清除舊的 AI 優化英文 prompt（它是在不知道調色盤的情況下優化的）
        setOptimizedPromptEn('');
    };

    const navigate = useNavigate();
    const { user, profile, isAdmin, handleLogout, isLoading, isProfileLoading, profileError, refreshProfile } = useAuth();
    const modelPolicy = profile?.modelPolicy || null;
    const imageModelConfig = modelPolicy?.defaultModel
        ? profile?.imageModels?.find((model) => model.modelKey === modelPolicy.defaultModel)
        : undefined;
    const imageQuality = selectedImageQuality === undefined
        ? imageModelConfig?.defaultQuality
        : selectedImageQuality;
    const modelSetupError = isProfileLoading
        ? '正在載入圖片模型設定，請稍候。'
        : profileError
            ? '無法載入圖片模型設定，請重新載入設定。'
            : getImageModelSetupError(imageModelConfig);
    const generationConfigError = modelSetupError || getImageQualityError(imageModelConfig, imageQuality);
    // Generation rechecks current settings between independently admitted jobs.
    const generationSettingsRef = useRef({ imageQuality, generationConfigError });
    useEffect(() => {
        generationSettingsRef.current = { imageQuality, generationConfigError };
    }, [imageQuality, generationConfigError]);
    const requireGenerationQuality = () => {
        const current = generationSettingsRef.current;
        if (current.generationConfigError) throw new Error(current.generationConfigError);
        return current.imageQuality;
    };
    const {
        savedStyles,
        newStyleName,
        newStyleTags,
        scope: styleScope,
        sort: styleSort,
        searchQuery: styleSearchQuery,
        isLoadingStyles,
        isSavingStyle,
        isSearching,
        styleError,
        setNewStyleName,
        setNewStyleTags,
        setScope: setStyleScope,
        setSort: setStyleSort,
        setSearchQuery: setStyleSearchQuery,
        saveStyle,
        createStyle,
        deleteStyle,
        searchStyles,
        deleteStyles,
        publishStyle,
        unpublishStyle,
        copyStyle,
        markStyleUsed,
        updateStyle,
    } = useStyles({ user });
    const { historyItems, saveHistoryItem, deleteHistoryItem, deleteHistoryItems } = useHistory({ user });
    const [mobileHeaderActions, setMobileHeaderActions] = useState(null);
    const imageChat = useImageChat({
        enabled: activeTab === 'chat',
        initialSettings: {
            aspectRatio: '16:9',
            quality: null,
            imageLanguage,
            purpose: DEFAULT_IMAGE_PURPOSE,
        },
    });
    const {
        templates,
        saveTemplate,
        updateTemplate,
        removeTemplate,
        removeTemplates,
    } = useTemplates({ user });

    const {
        analyzedStyle, analysisResultData, generatedFilename,
        isAnalyzing, isGenerating, analysisPhase, generationStatus,
        analyzeStyle, generateImage, transformImage, cancelGeneration, clearStyle,
        setAnalyzedStyle, setAnalysisResultData
    } = useImageGeneration();

    const imageVersions = useImageVersions();
    const { activeVersion } = imageVersions;
    const generatedImage = activeVersion?.imageUrl || null;
    const workspace = useCreateWorkspace({
        generateImage,
        transformImage,
        saveHistoryItem,
        onImageCreated: imageVersions.startChain,
    });
    const { refine, isRefining, refineError, clearRefineError } = useImageRefine({
        versions: imageVersions,
        transformImage,
        saveHistoryItem,
    });

    // --- Core Logic Functions ---

    const handleAttachFile = async (file) => {
        try {
            await workspace.attachFile(file);
            setOptimizedPromptEn('');
            setErrorMsg('');
        } catch (err) {
            console.error('Attachment upload failed:', err);
            setErrorMsg(`附圖上傳失敗：${err.message || '請稍後再試'}`);
        }
    };

    const handleAttachCurrentResult = async () => {
        try {
            await workspace.attachImageUrl(generatedImage);
            setOptimizedPromptEn('');
            setErrorMsg('');
        } catch (err) {
            console.error('Attaching current result failed:', err);
            setErrorMsg(`無法使用目前結果：${err.message || '請下載後再上傳'}`);
        }
    };

    const handleClearAttachment = () => {
        workspace.clearAttachment();
        setOptimizedPromptEn('');
    };

    const handleAttachmentPurposeChange = (purposeId) => {
        workspace.setPurpose(purposeId);
        setOptimizedPromptEn('');
    };

    const handleUseStyleTransfer = () => {
        handleAttachmentPurposeChange(
            workspace.purpose.id === STYLE_TRANSFER_PURPOSE ? REFERENCE_PURPOSE : STYLE_TRANSFER_PURPOSE
        );
    };

    const handleStyleReferenceUpload = async (file) => {
        if (file.size > 10 * 1024 * 1024) { setErrorMsg("圖片過大，請上傳小於 10MB 的圖片。"); return; }
        try {
            setIsUploadingStyleReference(true);
            const uploadResult = await uploadFile(file, "image");
            if (!uploadResult?.uploadId) throw new Error('無法完成圖片上傳，請確認已登入');
            const previewUrl = await readFileAsDataUrl(file);
            setReferencePreview(previewUrl);
            setReferenceUploadId(uploadResult.uploadId);
            setErrorMsg('');
        } catch (err) {
            console.error("Style reference upload failed:", err);
            setErrorMsg(`風格參考圖上傳失敗：${err.message || "請稍後再試"}`);
        } finally {
            setIsUploadingStyleReference(false);
        }
    };

    const handleClearStyleReference = () => {
        setReferencePreview(null);
        setReferenceUploadId(null);
        clearStyle();
        setAppliedStyleId(null);
        setOptimizedPromptEn('');
    };
    const analyzeImageStyle = async () => {
        try {
            const analysisResult = await analyzeStyle({ referenceUploadId });
            setAppliedStyleId(null);
            const tags = Array.isArray(analysisResult.suggested_tags) ? analysisResult.suggested_tags : [];
            const autoStyleName = String(analysisResult.style_name || tags[0] || '未命名風格');
            const shouldSetName = !isStyleNameTouched;
            const shouldSetTags = !isStyleTagsTouched;
            const finalStyleName = shouldSetName ? autoStyleName : newStyleName.trim();
            if (shouldSetName) setNewStyleName(autoStyleName);
            if (shouldSetTags) setNewStyleTags(tags.join(', '));
            setAnalysisResultData({ ...analysisResult, style_name: finalStyleName });
            if (analysisResult.embedding_error) { setWarningMsg('向量產生失敗，已略過風格向量寫入。'); } else { setWarningMsg(''); }
            setErrorMsg('');
        } catch (err) {
            console.error("Analysis Failed:", err);
            setErrorMsg(err.message || "圖片分析失敗，請確認 API 是否啟用。");
            setWarningMsg('');
        }
    };

    const saveCurrentStyle = async () => {
        try {
            await saveStyle({ analyzedStyle, analysisResultData, referencePreview });
            alert('風格已儲存！');
            setErrorMsg('');
            setIsStyleNameTouched(false);
            setIsStyleTagsTouched(false);
        } catch (err) {
            console.error("Save style failed:", err);
            setErrorMsg(err.message || "儲存風格失敗");
        }
    };

    const deleteSavedStyle = async (id, e) => {
        if (e) e.stopPropagation();
        if (!user || !confirm('確定要刪除此風格收藏嗎？')) return;
        try { await deleteStyle(id); } catch (err) { console.error("Delete style failed:", err); }
    };

    const applySavedStyle = (styleData) => {
        setAnalyzedStyle(styleData.prompt);
        setAnalysisResultData({ style_prompt: styleData.prompt, style_description_zh: styleData.description, suggested_tags: styleData.tags, styleId: styleData.id });
        setNewStyleName(styleData.name || '');
        setNewStyleTags((styleData.tags || []).join(', '));
        setAppliedStyleId(styleData.id || null);
        setIsStyleNameTouched(true);
        setIsStyleTagsTouched(true);
        // 不再跳頁 — 讓使用者留在目前位置
    };

    const handleStyleNameChange = (value) => { setNewStyleName(value); setIsStyleNameTouched(true); };
    const handleStyleTagsChange = (value) => { setNewStyleTags(value); setIsStyleTagsTouched(true); };
    const handleClearStyle = () => { clearStyle(); setNewStyleName(''); setNewStyleTags(''); setAppliedStyleId(null); setIsStyleNameTouched(false); setIsStyleTagsTouched(false); };

    const handlePublishStyle = async (id) => {
        try {
            await publishStyle(id);
        } catch (err) {
            console.error("Publish style failed:", err);
            setErrorMsg(err.message || "共享風格失敗");
        }
    };

    const handleUnpublishStyle = async (id) => {
        try {
            await unpublishStyle(id);
        } catch (err) {
            console.error("Unpublish style failed:", err);
            setErrorMsg(err.message || "取消共享風格失敗");
        }
    };

    const handleCopyStyle = async (id) => {
        try {
            await copyStyle(id);
            alert("已複製到我的風格庫");
        } catch (err) {
            console.error("Copy style failed:", err);
            setErrorMsg(err.message || "複製風格失敗");
        }
    };

    // ─── Template Functions ───
    const applyTemplate = (template) => {
        if (template.userScript) {
            setUserScript(template.userScript);
            setOptimizedPromptEn(''); // 重置優化 prompt，退回重新優化或套用 template 狀態
        }
        if (template.stylePrompt) {
            setAnalyzedStyle(template.stylePrompt);
            setAnalysisResultData({ style_prompt: template.stylePrompt });
            setAppliedStyleId(template.styleId || null);
        }
        setActiveTab('general');
    };

    const handleDeleteTemplate = async (id, e) => {
        if (e) e.stopPropagation();
        if (!user || !confirm('確定要刪除此範本嗎？')) return;
        try { await removeTemplate(id); } catch (err) { console.error('Delete template failed:', err); }
    };

    const handleLanguageChange = (lang) => {
        setImageLanguage(lang);
        setOptimizedPromptEn('');
        try { localStorage.setItem('genpic_image_language', lang); } catch { /* ignore */ }
    };

    const handleAspectRatioChange = (ratio) => {
        setAspectRatio(ratio);
        setOptimizedPromptEn('');
    };

    const generateInfographic = async () => {
        if (!workspace.canSubmit(userScript)) return;
        try {
            const quality = requireGenerationQuality();
            const { styleId } = await workspace.submit({
                // 若有 AI 智能優化後的英文 prompt 就優先使用，否則使用畫面上的 userScript
                prompt: optimizedPromptEn || userScript,
                userScript,
                stylePrompt: analyzedStyle,
                styleTags: paletteStyleTags,
                styleId: appliedStyleId || analysisResultData?.styleId || null,
                imagePurpose,
                aspectRatio,
                imageQuality: quality,
                imageLanguage,
            });
            if (styleId) {
                markStyleUsed(styleId).catch((err) => {
                    console.warn("Style usage tracking failed:", err);
                });
            }
            setErrorMsg('');
            clearRefineError();
            if (isMobileLayout) setShowMobilePreview(true);
        } catch (err) {
            if (err.name === 'AbortError') {
                setErrorMsg(err.message);
                return;
            }
            console.error("Image Generation Failed:", err);
            setErrorMsg(`${workspace.isTransform ? '圖片修改' : '圖片生成'}失敗: ${err.message || "請稍後再試"}`);
        }
    };

    const loadFromHistory = (item) => {
        setUserScript(item.userScript);
        setOptimizedPromptEn(''); // 歷史紀錄沒有記錄優化後的 prompt，所以清空
        setAnalyzedStyle(item.stylePrompt || '');
        setAnalysisResultData(null);
        imageVersions.startChain({
            jobId: item.jobId || null,
            imageUrl: item.imageUrl,
            instruction: item.userScript || '',
            fromHistory: true,
        });
        clearRefineError();
        setAppliedStyleId(item.styleId || null);
        setActiveTab('general');
    };

    const handleDownload = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = generatedImage;
        const nameFallback = `generated-infographic-${Date.now()}.png`;
        link.download = generatedFilename ? `${generatedFilename}.png` : nameFallback;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleRefine = (instruction, options) =>
        refine(instruction, () => ({ imageQuality: requireGenerationQuality(), imageLanguage }), options);

    const handleSelectVersion = (versionId) => {
        imageVersions.selectVersion(versionId);
        clearRefineError();
    };

    const previewProps = {
        generatedImage,
        isGenerating,
        aspectRatio,
        generationStatus,
        promptSummary: userScript,
        onDownload: handleDownload,
        user,
        isRefining,
        refineError,
        onRefine: handleRefine,
        onPreciseEdit: () => setIsPreciseEditOpen(true),
        isCompressedPreview: Boolean(activeVersion?.fromHistory),
        versionRows: imageVersions.rows,
        activeVersionId: imageVersions.activeVersionId,
        onSelectVersion: handleSelectVersion,
        getVersionLabel: imageVersions.getVersionLabel,
        getVersion: imageVersions.getVersion,
        onExpand: (rect) => setCanvasOrigin({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            scale: Math.min(1, Math.max(0.2, Math.min(rect.width / window.innerWidth, rect.height / window.innerHeight))),
        }),
    };

    const chainPrompt = imageVersions.versions[0]?.instruction;
    const suggestsRefine = Boolean(generatedImage) && !workspace.attachment && isNearDuplicatePrompt(chainPrompt, userScript);

    const focusRefineInput = () => {
        // 手機版的修改輸入列在結果頁裡；同步開啟才能在同一次點擊內叫出鍵盤。
        if (isMobileLayout) flushSync(() => setShowMobilePreview(true));
        const inputs = [...document.querySelectorAll('[data-refine-input]')];
        const input = inputs.find((element) => element.getClientRects().length > 0) || inputs[0];
        input?.scrollIntoView({ block: 'nearest' });
        input?.focus();
    };

    // --- Tab 定義 ---
    const tabs = [
        { id: 'general', label: '快速創作', icon: ImagePlus },
        { id: 'chat', label: '對話創作', icon: MessageSquare },
        { id: 'document', label: '文件創作', icon: FileText },
        { id: 'library', label: '素材中心', icon: Library },
    ];
    // --- Render ---
    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]">

            {/* ═══════════ Top Header Bar ═══════════ */}
            <AppHeader
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                user={user}
                isAdmin={isAdmin}
                isLoading={isLoading}
                onOpenAdmin={() => navigate("/admin")}
                onLogin={() => navigate("/login")}
                onLogout={handleLogout}
                mobileActionsRef={setMobileHeaderActions}
            />

            {/* ═══════════ Main Content Area ═══════════ */}
            <main className="flex-1 min-h-0 flex flex-col">
                {profileError && (
                    <div role="alert" className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
                        <span>{profileError}</span>
                        <Button variant="outline" disabled={isProfileLoading} onClick={() => {
                            void refreshProfile().catch((error) => {
                                console.error('Profile refresh failed:', error);
                            });
                        }}>重新載入設定</Button>
                    </div>
                )}

                {activeTab === 'general' && (
                    <div className="flex-1 flex flex-col min-h-0">

                        {/* Error / Warning Messages */}
                        {(errorMsg || warningMsg) && (
                            <div className="shrink-0 px-4 lg:px-8 pt-3 space-y-2">
                                {errorMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
                                        <AlertCircle className="icon-sm shrink-0" />
                                        <span className="text-sm">{errorMsg}</span>
                                    </div>
                                )}
                                {warningMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-warning/50 bg-warning/10 animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
                                        <AlertCircle className="icon-sm text-warning shrink-0" />
                                        <span className="text-sm text-foreground">{warningMsg}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Two-Column Layout (Controls + Preview) ─── */}
                        <div className="flex-1 min-h-0 flex flex-col gap-3 lg:bg-muted/25 px-4 py-3 lg:px-8 overflow-y-auto lg:overflow-hidden custom-scrollbar">
                            <div className="flex-1 min-h-0 flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-6">
                                {/* Left: Controls (takes 3/5 on large screens) */}
                                <div className="lg:col-span-3 min-h-0 lg:overflow-y-auto lg:custom-scrollbar pl-px pr-1">
                                    <ScriptEditor
                                        userScript={userScript}
                                        onUserScriptChange={setUserScript}
                                        onOptimizedPromptEnChange={setOptimizedPromptEn}
                                        imageLanguage={imageLanguage}
                                        onImageLanguageChange={handleLanguageChange}
                                        imagePurpose={imagePurpose}
                                        aspectRatio={aspectRatio}
                                        onImagePurposeChange={setImagePurpose}
                                        onFocus={() => setIsInputFocused(true)}
                                        onBlur={() => setTimeout(() => setIsInputFocused(false), 100)}
                                        hideGenerate
                                        savedStyles={savedStyles}

                                        // 風格與內容整合
                                        analyzedStyle={analyzedStyle}
                                        onApplyStyle={applySavedStyle}
                                        onClearStyle={handleClearStyle}

                                        styleReferencePreview={referencePreview}
                                        onStyleReferenceUpload={handleStyleReferenceUpload}
                                        onClearStyleReference={handleClearStyleReference}
                                        isUploadingStyleReference={isUploadingStyleReference}

                                        attachmentPurpose={workspace.attachment ? workspace.purpose : null}
                                        onUseStyleTransfer={workspace.attachment ? handleUseStyleTransfer : undefined}
                                        onAttachFile={handleAttachFile}
                                        onAttachCurrentResult={handleAttachCurrentResult}
                                        canAttachCurrentResult={Boolean(generatedImage) && !isGenerating}
                                        isUploadingAttachment={workspace.isUploadingAttachment}
                                        attachmentSlot={
                                            <AttachmentPicker
                                                className={workspace.attachment ? undefined : "max-lg:hidden"}
                                                attachment={workspace.attachment}
                                                isUploading={workspace.isUploadingAttachment}
                                                purposeId={workspace.purpose.id}
                                                onPurposeChange={handleAttachmentPurposeChange}
                                                onAttachFile={handleAttachFile}
                                                onAttachCurrentResult={handleAttachCurrentResult}
                                                canAttachCurrentResult={Boolean(generatedImage) && !isGenerating}
                                                onClear={handleClearAttachment}
                                            />
                                        }

                                        // 風格分析 Props
                                        isAnalyzing={isAnalyzing}
                                        analysisPhase={analysisPhase}
                                        analysisResultData={analysisResultData}
                                        newStyleName={newStyleName}
                                        newStyleTags={newStyleTags}
                                        isSavingStyle={isSavingStyle}
                                        onAnalyze={analyzeImageStyle}
                                        onStyleNameChange={handleStyleNameChange}
                                        onStyleTagsChange={handleStyleTagsChange}
                                        onSaveStyle={saveCurrentStyle}
                                        onSaveTemplate={saveTemplate}
                                        analyzedStyleForTemplate={analyzedStyle}

                                        // 調色盤與快捷鍵
                                        onPaletteStyleChange={handlePaletteStyleChange}
                                        onGenerate={generateInfographic}
                                        paletteStyleTags={paletteStyleTags}
                                    />

                                </div>

                                {/* Right: Preview (takes 2/5 on large screens) */}
                                {!isMobileLayout && (
                                <section
                                    aria-label="圖片預覽"
                                    className="lg:col-span-2 relative flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card bg-dot-grid bg-size-[20px_20px]"
                                >
                                    <ImagePreview {...previewProps} />
                                </section>
                                )}
                            </div>
                        </div>

                        {/* Fixed Bottom Generate Bar */}
                        <GenerateBar
                                aspectRatio={aspectRatio}
                                onAspectRatioChange={handleAspectRatioChange}
                                imageQuality={imageQuality}
                                onImageQualityChange={setImageQuality}
                                imageModelConfig={imageModelConfig}
                                imageLanguage={imageLanguage}
                                onImageLanguageChange={handleLanguageChange}
                                configurationError={modelSetupError}
                                isGenerating={isGenerating}
                                generationStatus={generationStatus}
                                onCancelGeneration={cancelGeneration}
                                onGenerate={generateInfographic}
                                buttonText={workspace.purpose.buttonText}
                                isGeneratingText={workspace.isTransform ? "AI 修改中…" : "AI 生成中…"}
                                ActionIcon={workspace.isTransform ? Wand2 : WandSparkles}
                                aspectRatioLocked={workspace.aspectRatioLocked}
                                onSuggestRefine={suggestsRefine ? focusRefineInput : undefined}
                                compact={isMobileLayout}
                                resultImage={generatedImage}
                                onOpenResult={() => setShowMobilePreview(true)}
                                disabled={!workspace.canSubmit(userScript)}
                            />
                    </div>
                )}

                {/* ─── Document Tab: PPT Master ─── */}
                {activeTab === 'document' && (
                    <div className="flex-1 min-h-0 overflow-hidden px-4 py-3 lg:px-8">
                        <p className="mb-3 text-xs text-muted-foreground">
                            由 AI 逐頁設計版面，直接產出套用專業模板的 PowerPoint。
                        </p>
                        <PptMasterStudio />
                    </div>
                )}

                {/* ─── Chat-to-Image Tab ─── */}
                {activeTab === 'chat' && (
                    <ChatWorkspace
                        chat={imageChat}
                        savedStyles={savedStyles}
                        templates={templates}
                        historyItems={historyItems}
                        imageModelConfig={imageModelConfig}
                        modelSetupError={modelSetupError}
                        user={user}
                        isMobileLayout={isMobileLayout}
                        mobileHeaderActions={mobileHeaderActions}
                    />
                )}

                {/* ─── Unified Asset Center ─── */}
                {activeTab === 'library' && (
                    <div className="flex-1 overflow-y-auto px-4 py-6 custom-scrollbar lg:px-8 2xl:px-12">
                        <AssetCenter
                            initialSection={initialLibrarySection}
                            initialViewMode={initialLibraryViewMode}
                            templates={templates}
                            savedStyles={savedStyles}
                            historyItems={historyItems}
                            historySearchQuery={searchQuery}
                            onHistorySearchChange={setSearchQuery}
                            styleSearchQuery={styleSearchQuery}
                            onStyleSearchChange={(value) => {
                                setStyleSearchQuery(value);
                                searchStyles(value);
                            }}
                            isLoadingStyles={isLoadingStyles}
                            isSearchingStyles={isSearching}
                            styleError={styleError}
                            styleScope={styleScope}
                            onStyleScopeChange={setStyleScope}
                            styleSort={styleSort}
                            onStyleSortChange={setStyleSort}
                            onApplyTemplate={applyTemplate}
                            onDeleteTemplate={handleDeleteTemplate}
                            onDeleteTemplates={removeTemplates}
                            onUpdateTemplate={updateTemplate}
                            onCreateTemplate={saveTemplate}
                            onApplyStyle={applySavedStyle}
                            onDeleteStyle={deleteSavedStyle}
                            onDeleteStyles={deleteStyles}
                            onUpdateStyle={updateStyle}
                            onCreateStyle={createStyle}
                            onPublishStyle={handlePublishStyle}
                            onUnpublishStyle={handleUnpublishStyle}
                            onCopyStyle={handleCopyStyle}
                            onLoadHistory={loadFromHistory}
                            onDeleteHistory={deleteHistoryItem}
                            onDeleteHistoryItems={deleteHistoryItems}
                            onGoCreate={() => setActiveTab('general')}
                        />
                    </div>
                )}
            </main>

            {/* ═══════════ 手機版：生成結果頁 ═══════════ */}
            <AnimatePresence>
            {isMobileLayout && showMobilePreview && generatedImage && (
                <MobileResultView key="mobile-result" onClose={() => setShowMobilePreview(false)}>
                    <div className="p-3">
                        <ImagePreview {...previewProps} />
                    </div>
                </MobileResultView>
            )}
            </AnimatePresence>

            <AnimatePresence>
            {canvasOrigin && activeVersion && (
                <ExpandedCanvas
                    key="expanded-canvas"
                    origin={canvasOrigin}
                    version={activeVersion}
                    parent={imageVersions.getVersion(activeVersion.parentId)}
                    getVersionLabel={imageVersions.getVersionLabel}
                    onClose={() => setCanvasOrigin(null)}
                    isRefining={isRefining}
                    refineError={refineError}
                    onRefine={handleRefine}
                    refineDisabled={isGenerating}
                    generationStatus={generationStatus}
                    versionRows={imageVersions.rows}
                    activeVersionId={imageVersions.activeVersionId}
                    onSelectVersion={handleSelectVersion}
                    getVersion={imageVersions.getVersion}
                />
            )}
            </AnimatePresence>

            <AnimatePresence>
            {isPreciseEditOpen && activeVersion && (
                <PreciseEditor
                    key="precise-editor"
                    imageUrl={activeVersion.imageUrl}
                    title={`精確編輯 · ${imageVersions.getVersionLabel(activeVersion)}`}
                    subtitle={`結果會成為 ${imageVersions.getVersionLabel(activeVersion)} 的新版本`}
                    isGenerating={isRefining}
                    error={refineError}
                    versionStrip={
                        <VersionStrip
                            rail
                            rows={imageVersions.rows}
                            activeVersionId={imageVersions.activeVersionId}
                            onSelectVersion={handleSelectVersion}
                            getVersionLabel={imageVersions.getVersionLabel}
                            getVersion={imageVersions.getVersion}
                        />
                    }
                    onApply={({ instruction, mask }) => void handleRefine(instruction, { mask })}
                    onClose={() => setIsPreciseEditOpen(false)}
                />
            )}
            </AnimatePresence>

            {/* 手機版：圖片已生成時，顯示底部快速預覽入口按鈕 */}
            {isMobileLayout && generatedImage && !showMobilePreview && !isGenerating && activeTab !== 'general' && activeTab !== 'chat' && (
                <button
                    type="button"
                    className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setShowMobilePreview(true)}
                    aria-label="查看生成圖片"
                >
                    <img src={generatedImage} alt="" width={24} height={24} decoding="async" className="w-6 h-6 rounded-md object-cover border border-primary-foreground/30" />
                    查看生成圖片
                </button>
            )}

        </div>
    );
}
