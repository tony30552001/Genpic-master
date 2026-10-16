import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import * as M from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import {
  MoreHorizontal,
} from "@/components/icons/lucideControls";
import {
  AlertCircle,
} from "@/components/icons/lucideStatus";
import {
  ShieldCheck,
} from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useDocumentAnalysis from './hooks/useDocumentAnalysis';
import useTemplates from './hooks/useTemplates';
import useCreateWorkspace from './hooks/useCreateWorkspace';
import useImageVersions from './hooks/useImageVersions';
import useImageRefine from './hooks/useImageRefine';
import { uploadFile } from './services/storageService';
import { STYLE_TRANSFER_PURPOSE, REFERENCE_PURPOSE } from './lib/attachmentPurposes';
import { readFileAsDataUrl } from './lib/imageFile';
import { isNearDuplicatePrompt } from './lib/promptHints';
import { DEFAULT_IMAGE_LANGUAGE } from './config';
import { getImageModelSetupError, getImageQualityError } from './lib/imageModel';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';


import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import DocumentUploader from './components/create/DocumentUploader';
import DocumentScenes from './components/create/DocumentScenes';
import PptMasterStudio from './components/create/PptMasterStudio';
import GenerateBar from './components/create/GenerateBar';
import ExpandedCanvas from './components/create/ExpandedCanvas';
import MobileResultView from './components/create/MobileResultView';
import { MOBILE_LAYOUT_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import SettingsPanel from './components/settings/SettingsPanel';
import AttachmentPicker from './components/create/AttachmentPicker';
import AssetCenter from './components/library/AssetCenter';
import AppHeader from './components/common/AppHeader';

export default function InfographicGenerator({
    initialTab = 'general',
    initialLibrarySection = 'overview',
    initialLibraryViewMode = 'table',
}) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab);
    const [documentAnalysisMode, setDocumentAnalysisMode] = useState('storyboard');

    // 風格參考圖（只用於風格分析，與內容附圖分開）
    const [referencePreview, setReferencePreview] = useState(null);
    const [referenceUploadId, setReferenceUploadId] = useState(null);
    const [isUploadingStyleReference, setIsUploadingStyleReference] = useState(false);

    const [userScript, setUserScript] = useState('');
    const [optimizedPromptEn, setOptimizedPromptEn] = useState('');

    // 全域設定
    const [imageLanguage, setImageLanguage] = useState(() => {
        try { return localStorage.getItem('genpic_image_language') || DEFAULT_IMAGE_LANGUAGE; } catch { return DEFAULT_IMAGE_LANGUAGE; }
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
    const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_QUERY);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const [paletteStyleTags, setPaletteStyleTags] = useState([]);
    const [imagePurpose, setImagePurpose] = useState('infographic');
    const [documentStyleOverride, setDocumentStyleOverride] = useState(null);

    useEffect(() => {
        if (!mobileMoreOpen) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setMobileMoreOpen(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mobileMoreOpen]);

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
        : profileError || getImageModelSetupError(imageModelConfig);
    const generationConfigError = modelSetupError || getImageQualityError(imageModelConfig, imageQuality);
    // A storyboard batch rechecks current settings between independently admitted jobs.
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
    const {
        templates,
        saveTemplate,
        updateTemplate,
        removeTemplate,
        removeTemplates,
    } = useTemplates({ user });

    const {
        isAnalyzing: isAnalyzingDocument, analysisPhase: documentAnalysisPhase,
        documentResult, analyzeDocument, clearDocument, updateScene, removeScene,
        scenes,
    } = useDocumentAnalysis();
    const documentStyle =
        documentAnalysisMode === "storyboard"
            ? documentStyleOverride || documentResult?.recommended_style || null
            : null;
    const hasActiveDocumentResult =
        documentAnalysisMode === "storyboard" && Boolean(documentResult);

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
            setErrorMsg(err.message || '上傳失敗，請稍後再試。');
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
            setErrorMsg(err.message || "上傳失敗，請稍後再試。");
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

    const handleRefine = (instruction) =>
        refine(instruction, () => ({ imageQuality: requireGenerationQuality(), imageLanguage }));

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

    const handleAnalyzeDocument = async (file, sceneCount) => {
        try {
            setErrorMsg('');
            const result = await analyzeDocument(file, sceneCount);
            setDocumentStyleOverride(null);
            return result;
        } catch (err) {
            console.error("Document Analysis Failed:", err);
            setErrorMsg(err.message || "文件分鏡失敗，請稍後重試。");
            throw err;
        }
    };

    const handleClearDocument = () => {
        clearDocument();
        setDocumentStyleOverride(null);
    };

    const handleApplyDocumentStyle = (styleData) => {
        setDocumentStyleOverride(styleData);
    };

    const handleClearDocumentStyle = () => {
        setDocumentStyleOverride(null);
    };

    const handleGenerateScene = async (sceneIndex) => {
        const scene = scenes[sceneIndex];
        if (!scene) return;
        try {
            setErrorMsg('');
            const quality = requireGenerationQuality();
            const styleForDocument = documentStyle;
            const stylePrompt = styleForDocument?.prompt || '';
            // 呼叫圖片生成（帶入語系設定）
            // 使用英文的 visual_prompt 作為生成提示詞，若無則退回使用 scene_description
            const promptToUse = scene.visual_prompt || scene.scene_description;

            const result = await generateImage({
                userScript: promptToUse,
                analyzedStyle: stylePrompt,
                purpose: 'storyboard',
                aspectRatio,
                imageQuality: quality,
                imageLanguage,
            });

            // 1. 更新 DocumentAnalysis 的狀態 (顯示在卡片上)
            updateScene(sceneIndex, {
                generatedImage: result.imageUrl
            });

            // 取得檔名（背景非同步完成），並更新到場景中
            if (result.filenamePromise) {
                result.filenamePromise.then((aiFilename) => {
                    updateScene(sceneIndex, {
                        generatedFilename: aiFilename
                    });
                }).catch(() => { });
            }

            // 2. 寫入歷史紀錄
            await saveHistoryItem({
                jobId: result.jobId,
                imageUrl: result.imageUrl,
                userScript: scene.scene_description,
                stylePrompt,
                fullPrompt: result.finalPrompt,
                styleId: styleForDocument?.id || null,
                sceneNumber: scene.scene_number,
                documentTitle: documentResult?.title,
                source: 'document',
            });
            if (styleForDocument?.id) {
                markStyleUsed(styleForDocument.id).catch((err) => {
                    console.warn("Style usage tracking failed:", err);
                });
            }

            setErrorMsg('');
        } catch (err) {
            console.error("Scene Generation Failed:", err);
            setErrorMsg(`場景 ${sceneIndex + 1} 生成失敗: ${err.message}`);
        }
    };

    const handleGenerateAllScenes = async () => {
        if (!scenes || scenes.length === 0) return;
        try {
            setErrorMsg('');
            requireGenerationQuality();
            for (let i = 0; i < scenes.length; i++) await handleGenerateScene(i);
        } catch (err) {
            console.error("Batch Generation Failed:", err);
            setErrorMsg(`批次生成失敗: ${err.message}`);
        }
    };

    const activeDocumentPanel = hasActiveDocumentResult ? (
        <DocumentScenes
            documentResult={documentResult}
            onUpdateScene={updateScene}
            onRemoveScene={removeScene}
            onGenerateScene={handleGenerateScene}
            onGenerateAll={handleGenerateAllScenes}
            onClear={handleClearDocument}
            isGenerating={isGenerating}
            generationDisabled={Boolean(generationConfigError)}
            savedStyles={savedStyles}
            documentStyle={documentStyle}
            isDocumentStyleOverride={Boolean(documentStyleOverride)}
            onApplyStyle={handleApplyDocumentStyle}
            onClearStyle={handleClearDocumentStyle}
            imageLanguage={imageLanguage}
            aspectRatio={aspectRatio}
        />
    ) : (
        <DocumentUploader
            onAnalyze={handleAnalyzeDocument}
            isAnalyzing={isAnalyzingDocument}
            analysisPhase={documentAnalysisPhase}
            disabled={isAnalyzingDocument}
        />
    );

    // --- Tab 定義 ---
    const tabs = [
        { id: 'general', label: '一般創作', shortLabel: '創作', glyph: 'create' },
        { id: 'document', label: '文件創作', shortLabel: '文件', glyph: 'document' },
        { id: 'library', label: '素材中心', shortLabel: '素材', glyph: 'library' },
        { id: 'settings', label: '設定', shortLabel: '設定', glyph: 'settings' },
    ];
    const mobilePrimaryTabs = tabs.filter((tab) =>
        ['general', 'library'].includes(tab.id)
    );
    const mobileSecondaryTabs = tabs.filter((tab) =>
        ['document', 'settings'].includes(tab.id)
    );
    const isMobileMoreActive = mobileSecondaryTabs.some((tab) => tab.id === activeTab);
    // --- Render ---
    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">

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

                {/* ─── Create & Document Tabs Share Similar Container ─── */}
                {(activeTab === 'general' || activeTab === 'document') && (
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

                        {/* ─── Document Sub-Tab: Full-Width Layout ─── */}
                        {activeTab === 'document' && (
                            <div className="flex-1 min-h-0 px-4 lg:px-8 py-3">
                                <Tabs
                                    value={documentAnalysisMode}
                                    onValueChange={setDocumentAnalysisMode}
                                    className="flex h-full min-h-0 flex-col"
                                >
                                    <div className="shrink-0">
                                        <TabsList className="grid h-10 w-full max-w-md grid-cols-2">
                                            <TabsTrigger value="storyboard" className="gap-2 text-xs sm:text-sm">
                                                <ProductGlyph kind="document" active={documentAnalysisMode === "storyboard"} className="icon-sm" aria-hidden="true" />
                                                文件分鏡
                                            </TabsTrigger>
                                            <TabsTrigger value="pptmaster" className="gap-2 text-xs sm:text-sm">
                                                <ProductGlyph kind="deck" active={documentAnalysisMode === "pptmaster"} className="icon-sm" aria-hidden="true" />
                                                設計簡報
                                            </TabsTrigger>
                                        </TabsList>
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {documentAnalysisMode === "pptmaster"
                                                ? "由 AI 逐頁設計版面，直接產出套用專業模板的 PowerPoint。"
                                                : "分析文件內容並提取可生成圖片的分鏡腳本。"}
                                        </p>
                                    </div>
                                    <TabsContent
                                        value="storyboard"
                                        className="mt-3 min-h-0 flex-1 overflow-y-auto custom-scrollbar"
                                    >
                                        {documentAnalysisMode === "storyboard" && activeDocumentPanel}
                                    </TabsContent>
                                    <TabsContent
                                        value="pptmaster"
                                        className="mt-3 min-h-0 flex-1 overflow-hidden"
                                    >
                                        {documentAnalysisMode === "pptmaster" && <PptMasterStudio />}
                                    </TabsContent>
                                </Tabs>
                            </div>
                        )}

                        {/* ─── Two-Column Layout (Controls + Preview) for other tabs ─── */}
                        {activeTab === 'general' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3 bg-muted/25 px-4 py-3 lg:px-8 overflow-y-auto lg:overflow-hidden custom-scrollbar">
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
                                            attachmentSlot={
                                                <AttachmentPicker
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
                                    <div className="lg:col-span-2 min-h-0 flex items-center justify-center relative overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40">
                                        {/* Decorative grid background */}
                                        <div
                                            className={`absolute inset-0 bg-muted/35 transition-opacity duration-300 ${isGenerating ? 'opacity-0' : 'opacity-100'}`}
                                            style={{
                                                backgroundImage: 'linear-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.06) 1px, transparent 1px)',
                                                backgroundSize: '24px 24px'
                                            }}
                                        />
                                        <div className="relative z-10 max-h-full w-full max-w-2xl overflow-y-auto p-6">
                                            <ImagePreview {...previewProps} />
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Fixed Bottom Generate Bar */}
                        {(activeTab === 'general' ||
                            (hasActiveDocumentResult && documentAnalysisMode === "storyboard")) && (
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
                                onCancelGeneration={activeTab === 'general' ? cancelGeneration : undefined}
                                onGenerate={
                                    hasActiveDocumentResult
                                        ? handleGenerateAllScenes
                                        : generateInfographic
                                }
                                buttonText={
                                    hasActiveDocumentResult
                                        ? `批次生成所有圖片 (${scenes?.length || 0})`
                                        : workspace.purpose.buttonText
                                }
                                isGeneratingText={
                                    hasActiveDocumentResult
                                        ? "批次生成中…"
                                        : workspace.isTransform ? "AI 修改中…" : "AI 生成中…"
                                }
                                actionKind={hasActiveDocumentResult ? "document" : workspace.isTransform ? "transform" : "create"}
                                aspectRatioLocked={!hasActiveDocumentResult && workspace.aspectRatioLocked}
                                onSuggestRefine={!hasActiveDocumentResult && suggestsRefine ? focusRefineInput : undefined}
                                compact={isMobileLayout}
                                resultImage={hasActiveDocumentResult ? undefined : generatedImage}
                                onOpenResult={() => setShowMobilePreview(true)}
                                disabled={
                                    hasActiveDocumentResult
                                        ? !scenes || scenes.length === 0
                                        : !workspace.canSubmit(userScript)
                                }
                            />
                        )}
                    </div>
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
                            onApplyStyle={applySavedStyle}
                            onDeleteStyle={deleteSavedStyle}
                            onDeleteStyles={deleteStyles}
                            onUpdateStyle={updateStyle}
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

                {/* ─── Settings Tab ─── */}
                {activeTab === 'settings' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <SettingsPanel
                            imageLanguage={imageLanguage}
                            onImageLanguageChange={handleLanguageChange}
                            imageModelConfig={imageModelConfig}
                            configurationError={modelSetupError}
                            user={user}
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

            {/* 手機版：圖片已生成時，顯示底部快速預覽入口按鈕 */}
            {isMobileLayout && generatedImage && !showMobilePreview && !isGenerating && activeTab !== 'general' && (
                <button
                    type="button"
                    className="fixed bottom-[calc(64px+env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setShowMobilePreview(true)}
                    aria-label="查看生成圖片"
                >
                    <img src={generatedImage} alt="" width={24} height={24} decoding="async" className="w-6 h-6 rounded-md object-cover border border-primary-foreground/30" />
                    查看生成圖片
                </button>
            )}

            {/* ═══════════ 手機版底部導航欄（Bottom Navigation Bar）═══════════ */}
            <nav className="relative z-40 shrink-0 bg-card border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden pb-[env(safe-area-inset-bottom)]">
                <AnimatePresence>
                {mobileMoreOpen && (
                    <M.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96, transition: OVERLAY_EXIT }}
                        transition={OVERLAY_ENTER}
                        className="absolute inset-x-3 bottom-full z-50 mb-2 origin-bottom rounded-xl border border-border bg-card p-2 shadow-xl ring-1 ring-border/40"
                        role="menu"
                        aria-label="更多功能"
                    >
                        <div className="grid grid-cols-3 gap-2">
                            {mobileSecondaryTabs.map((tab) => {
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        role="menuitem"
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setMobileMoreOpen(false);
                                        }}
                                        aria-pressed={isActive}
                                        className={`flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isActive
                                            ? 'border-primary/30 bg-primary/10 text-primary'
                                            : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                                            }`}
                                    >
                                        <ProductGlyph
                                            kind={tab.glyph}
                                            active={isActive}
                                            className="icon-sm"
                                            aria-hidden="true"
                                        />
                                        {tab.shortLabel}
                                    </button>
                                );
                            })}
                            {isAdmin && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setMobileMoreOpen(false);
                                        navigate('/admin');
                                    }}
                                    className="flex min-h-11 touch-manipulation flex-col items-center justify-center gap-1 rounded-lg border border-transparent px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <ShieldCheck className="icon-sm" aria-hidden="true" />
                                    管理中心
                                </button>
                            )}
                        </div>
                    </M.div>
                )}
                </AnimatePresence>
                <div className="flex items-stretch h-16">
                    {mobilePrimaryTabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                type="button"
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id);
                                    setMobileMoreOpen(false);
                                }}
                                aria-pressed={isActive}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 relative active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {/* 活躍指示器 */}
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
                                )}
                                <ProductGlyph
                                    kind={tab.glyph}
                                    active={isActive}
                                    className="icon-md"
                                    aria-hidden="true"
                                />
                                <span className={`text-[10px] font-medium leading-none transition-colors ${isActive ? 'font-semibold' : ''
                                    }`}>
                                    {tab.shortLabel}
                                </span>
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => setMobileMoreOpen((open) => !open)}
                        aria-expanded={mobileMoreOpen}
                        aria-haspopup="menu"
                        aria-pressed={isMobileMoreActive}
                        aria-label="更多功能"
                        className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 active:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${isMobileMoreActive || mobileMoreOpen
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {(isMobileMoreActive || mobileMoreOpen) && (
                            <span className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
                        )}
                        <MoreHorizontal className="icon-md" aria-hidden="true" />
                        <span className={`text-[10px] font-medium leading-none transition-colors ${isMobileMoreActive ? 'font-semibold' : ''
                            }`}>
                            更多
                        </span>
                    </button>
                </div>
            </nav>
        </div>
    );
}
