import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, Wand2,
    FileText, LogIn, LogOut, User, Settings, X, ImagePlay, ShieldCheck, MoreHorizontal, ChevronDown, Library
} from 'lucide-react';

import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useDocumentAnalysis from './hooks/useDocumentAnalysis';
import useTemplates from './hooks/useTemplates';
import useImageTransform from './hooks/useImageTransform';
import { requestBlobSas } from './services/storageService';
import { DEFAULT_IMAGE_LANGUAGE, DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from './config';
import { cn } from './lib/utils';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';


import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import DocumentUploader from './components/create/DocumentUploader';
import DocumentScenes from './components/create/DocumentScenes';
import PptMasterStudio from './components/create/PptMasterStudio';
import GenerateBar from './components/create/GenerateBar';
import SettingsPanel from './components/settings/SettingsPanel';
import ImageTransformPanel from './components/create/ImageTransformPanel';
import AssetCenter from './components/library/AssetCenter';

export default function InfographicGenerator({
    initialTab = 'general',
    initialLibrarySection = 'overview',
    initialLibraryViewMode = 'table',
}) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab);
    const [documentAnalysisMode, setDocumentAnalysisMode] = useState('storyboard');

    // Input States
    const [, setReferenceImage] = useState(null);
    const [referencePreview, setReferencePreview] = useState(null);
    const [, setReferenceBlobUrl] = useState(null);
    const [referenceBlobSasUrl, setReferenceBlobSasUrl] = useState(null);


    const [userScript, setUserScript] = useState('');
    const [optimizedPromptEn, setOptimizedPromptEn] = useState('');

    // Content Image States
    const [, setContentImage] = useState(null);
    const [contentImagePreview, setContentImagePreview] = useState(null);
    const [, setContentBlobUrl] = useState(null);
    const [contentBlobSasUrl, setContentBlobSasUrl] = useState(null);
    const [isUploadingContent, setIsUploadingContent] = useState(false);
    const [, setContentUploadProgress] = useState(0);

    // 全域設定
    const [imageLanguage, setImageLanguage] = useState(() => {
        try { return localStorage.getItem('genpic_image_language') || DEFAULT_IMAGE_LANGUAGE; } catch { return DEFAULT_IMAGE_LANGUAGE; }
    });

    // 風格設定相關
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [imageSize, setImageSize] = useState('1K');
    const [errorMsg, setErrorMsg] = useState('');
    const [warningMsg, setWarningMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [, setIsInputFocused] = useState(false);
    const [isStyleNameTouched, setIsStyleNameTouched] = useState(false);
    const [isStyleTagsTouched, setIsStyleTagsTouched] = useState(false);
    const [appliedStyleId, setAppliedStyleId] = useState(null);
    const [showMobilePreview, setShowMobilePreview] = useState(false);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const [compactNavSection, setCompactNavSection] = useState(null);
    const [paletteStyle, setPaletteStyle] = useState('');
    const [documentStyleOverride, setDocumentStyleOverride] = useState(null);

    useEffect(() => {
        if (!mobileMoreOpen && !compactNavSection) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setMobileMoreOpen(false);
                setCompactNavSection(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [compactNavSection, mobileMoreOpen]);

    const handlePaletteStyleChange = (styleStr) => {
        setPaletteStyle(styleStr);
        // 調色盤風格改變時，清除舊的 AI 優化英文 prompt（它是在不知道調色盤的情況下優化的）
        setOptimizedPromptEn('');
    };

    const navigate = useNavigate();
    const { user, profile, isAdmin, handleLogout, isLoading } = useAuth();
    const modelPolicy = profile?.modelPolicy || null;
    const imageModel = modelPolicy?.defaultModel || DEFAULT_IMAGE_MODEL;
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
        analyzedStyle, analysisResultData, generatedImage, generatedFilename,
        isAnalyzing, isGenerating, analysisPhase, generationStatus,
        analyzeStyle, generateImage, cancelGeneration, clearStyle,
        setAnalyzedStyle, setAnalysisResultData, setGeneratedImage
    } = useImageGeneration();

    const {
        sourcePreview: transformSourcePreview,
        isUploadingSource: isUploadingTransformSource,
        sourceUploadProgress: transformSourceUploadProgress,
        handleSourceImageUpload: handleTransformSourceUpload,
        clearSource: clearTransformSource,
        mode: transformMode, setMode: setTransformMode,
        prompt: transformPrompt, setPrompt: setTransformPrompt,
        aspectRatio: transformAspectRatio, setAspectRatio: setTransformAspectRatio,
        paletteSelected: transformPaletteSelected, setPaletteSelected: setTransformPaletteSelected,
        setAppliedStylePrompt: setTransformAppliedStylePrompt,
        appliedStyleName: transformAppliedStyleName, setAppliedStyleName: setTransformAppliedStyleName,
        appliedStyleId: transformAppliedStyleId, setAppliedStyleId: setTransformAppliedStyleId,
        result: transformResult,
        isTransforming,
        transformError, setTransformError,
        runTransform,
        cancelTransform,
    } = useImageTransform();

    const handleApplyStyleForTransform = (styleData) => {
        setTransformAppliedStylePrompt(styleData.prompt || '');
        setTransformAppliedStyleName(styleData.name || '');
        setTransformAppliedStyleId(styleData.id || null);
    };

    const handleClearAppliedStyleForTransform = () => {
        setTransformAppliedStylePrompt('');
        setTransformAppliedStyleName('');
        setTransformAppliedStyleId(null);
    };

    const handleTransform = async () => {
        try {
            setTransformError('');
            const result = await runTransform({ model: imageModel });
            if (result?.imageUrl) {
                await saveHistoryItem({
                    imageUrl: result.imageUrl,
                    userScript: transformPrompt || `圖片轉換 (${transformMode})`,
                    stylePrompt: transformAppliedStyleName || '',
                    fullPrompt: result.mergedPrompt || transformPrompt,
                    model: result.model || imageModel,
                    source: 'image-transform',
                });
                if (transformAppliedStyleId) {
                    markStyleUsed(transformAppliedStyleId).catch(() => {});
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                setTransformError(err.message);
                return;
            }
            console.error('Image transform failed:', err);
            setTransformError(`轉換失敗: ${err.message || '請稍後再試'}`);
        }
    };

    const handleDownloadTransformResult = () => {
        if (!transformResult) return;
        const link = document.createElement('a');
        link.href = transformResult;
        link.download = `pixora-transform-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- Core Logic Functions ---

    const uploadBlobWithProgress = ({ blobUrl, sasToken, file, contentType, onProgress }) =>
        new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', `${blobUrl}?${sasToken}`, true);
            xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
            };
            xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve(blobUrl) : reject(new Error(`Upload failed: ${xhr.status}`));
            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.send(file);
        });



    const handleContentImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setErrorMsg("圖片過大，請上傳小於 10MB 的圖片。"); return; }
        try {
            setIsUploadingContent(true);
            setContentUploadProgress(0);
            const safeName = `content-${Date.now()}-${file.name}`.replace(/\s+/g, "-");
            // 加入超時保護，避免 auth 過期時 Promise 永遠 pending
            const sasPromise = requestBlobSas({ fileName: safeName, contentType: file.type, container: "uploads" });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('上傳請求逾時，請確認網路連線或重新登入')), 30000));
            const sas = await Promise.race([sasPromise, timeoutPromise]);
            if (!sas || !sas.blobUrl || !sas.sasToken) throw new Error('無法取得上傳授權，請確認已登入');
            const blobUrl = await uploadBlobWithProgress({ blobUrl: sas.blobUrl, sasToken: sas.sasToken, file, contentType: file.type, onProgress: setContentUploadProgress });
            const blobSasUrl = `${sas.blobUrl}?${sas.sasToken}`;
            const reader = new FileReader();
            reader.onloadend = () => {
                setContentImage(file);
                setContentImagePreview(reader.result);
                setContentBlobUrl(blobUrl);
                setContentBlobSasUrl(blobSasUrl);

                // 同步設定為風格參考圖，以便進行風格分析
                setReferenceImage(file);
                setReferencePreview(reader.result);
                setReferenceBlobUrl(blobUrl);
                setReferenceBlobSasUrl(blobSasUrl);

                setErrorMsg('');
                setAppliedStyleId(null);
                setTimeout(() => { setIsUploadingContent(false); setContentUploadProgress(0); }, 1500);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Content Upload failed:", err);
            setErrorMsg(err.message || "上傳失敗，請稍後再試。");
            setIsUploadingContent(false);
            setContentUploadProgress(0);
        }
    };

    const handleClearContentImage = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        setContentImage(null);
        setContentImagePreview(null);
        setContentBlobUrl(null);
        setContentBlobSasUrl(null);
        setIsUploadingContent(false);
        setContentUploadProgress(0);

        // 同步清除風格參考
        setReferenceImage(null);
        setReferencePreview(null);
        setReferenceBlobUrl(null);
        setReferenceBlobSasUrl(null);
        clearStyle(); // 清除已分析的風格
        setAppliedStyleId(null);

        // 清除 AI 生成的英文 prompt (如果有的話)
        setOptimizedPromptEn('');
    };

    const analyzeImageStyle = async () => {
        try {
            const analysisResult = await analyzeStyle({ referencePreview, imageUrl: referenceBlobSasUrl });
            setAppliedStyleId(null);
            setUserScript(typeof analysisResult.image_content === 'string' ? analysisResult.image_content : String(analysisResult.image_content || ''));
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
        try { localStorage.setItem('genpic_image_language', lang); } catch { /* ignore */ }
    };

    const generateInfographic = async () => {
        try {
            // 如果存在 AI 智能優化後的英文 prompt 就優先使用，否則使用畫面上的中文 userScript
            const finalScriptToUse = optimizedPromptEn || userScript;
            // 合併風格庫風格與調色盤快選風格
            const mergedStyle = [analyzedStyle, paletteStyle].filter(Boolean).join('，');

            const { imageUrl, finalPrompt, model } = await generateImage({
                userScript: finalScriptToUse,
                analyzedStyle: mergedStyle,
                aspectRatio,
                imageSize,
                imageLanguage,
                contentImageUrl: contentBlobSasUrl,
                model: imageModel
            });
            await saveHistoryItem({
                imageUrl,
                userScript,
                stylePrompt: mergedStyle,
                fullPrompt: finalPrompt,
                styleId: appliedStyleId || analysisResultData?.styleId || null,
                model: model || imageModel,
                source: 'general',
            });
            if (appliedStyleId) {
                markStyleUsed(appliedStyleId).catch((err) => {
                    console.warn("Style usage tracking failed:", err);
                });
            }
            setErrorMsg('');
            setShowMobilePreview(true); // 手機版：生成後自動顯示預覽
        } catch (err) {
            if (err.name === 'AbortError') {
                setErrorMsg(err.message);
                return;
            }
            console.error("Image Generation Failed:", err);
            setErrorMsg(`圖片生成失敗: ${err.message || "請確認模型名稱支援圖片生成"}`);
        }
    };

    const loadFromHistory = (item) => {
        setUserScript(item.userScript);
        setOptimizedPromptEn(''); // 歷史紀錄沒有記錄優化後的 prompt，所以清空
        setAnalyzedStyle(item.stylePrompt || '');
        setAnalysisResultData(null);
        setGeneratedImage(item.imageUrl);
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
            const styleForDocument = documentStyle;
            const stylePrompt = styleForDocument?.prompt || '';
            // 呼叫圖片生成（帶入語系設定）
            // 使用英文的 visual_prompt 作為生成提示詞，若無則退回使用 scene_description
            const promptToUse = scene.visual_prompt || scene.scene_description;

            const result = await generateImage({
                userScript: promptToUse,
                analyzedStyle: stylePrompt,
                aspectRatio,
                imageSize,
                imageLanguage,
                model: imageModel,
                updatePreview: false
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
                imageUrl: result.imageUrl,
                userScript: scene.scene_description,
                stylePrompt,
                fullPrompt: result.finalPrompt,
                styleId: styleForDocument?.id || null,
                model: result.model || imageModel,
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
            savedStyles={savedStyles}
            documentStyle={documentStyle}
            isDocumentStyleOverride={Boolean(documentStyleOverride)}
            onApplyStyle={handleApplyDocumentStyle}
            onClearStyle={handleClearDocumentStyle}
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
        { id: 'general', label: '一般創作', shortLabel: '創作', icon: Wand2 },
        { id: 'document', label: '文件創作', shortLabel: '文件', icon: FileText },
        { id: 'image-transform', label: '圖片轉換', shortLabel: '轉換', icon: ImagePlay },
        { id: 'library', label: '素材中心', shortLabel: '素材', icon: Library },
        { id: 'settings', label: '設定', shortLabel: '設定', icon: Settings },
    ];
    const activeTabInfo = tabs.find(t => t.id === activeTab);
    const mobilePrimaryTabs = tabs.filter((tab) =>
        ['general', 'library'].includes(tab.id)
    );
    const mobileSecondaryTabs = tabs.filter((tab) =>
        ['document', 'image-transform', 'settings'].includes(tab.id)
    );
    const isMobileMoreActive = mobileSecondaryTabs.some((tab) => tab.id === activeTab);
    const compactNavGroups = [
        { id: 'create', label: '創作', icon: Wand2, tabIds: ['general', 'document', 'image-transform'] },
        { id: 'library', label: '素材中心', icon: Library, tabIds: ['library'] },
        { id: 'more', label: '更多', icon: MoreHorizontal, tabIds: ['settings'] },
    ];
    const compactActiveGroup = compactNavGroups.find((group) => group.tabIds.includes(activeTab))?.id;
    const compactOpenGroup = compactNavGroups.find((group) => group.id === compactNavSection);
    const setCompactActiveTab = (tabId) => {
        setActiveTab(tabId);
        setCompactNavSection(null);
        setMobileMoreOpen(false);
    };

    // --- Render ---
    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden">

            {/* ═══════════ Top Header Bar ═══════════ */}
            <header className="relative shrink-0 border-b border-border bg-primary text-white shadow-md">
                <div className="flex min-w-0 items-center justify-between gap-2 px-3 h-14 sm:px-4 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:px-8">
                    {/* Logo */}
                    <div className="flex min-w-0 flex-1 items-center gap-2 justify-self-start sm:gap-3">
                        <div className="w-8 h-8 shrink-0 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                            <Wand2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="truncate text-sm font-bold leading-tight sm:text-base">Pixora 智繪</h1>
                            <p className="text-[10px] text-white/70 leading-none hidden sm:block">AI 智能視覺創作平台</p>
                        </div>
                        {/* 手機版：顯示當前頁面名稱 badge */}
                        {activeTabInfo && (
                            <span className="sm:hidden flex min-w-0 shrink items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-medium backdrop-blur-sm">
                                <activeTabInfo.icon className="w-3 h-3 shrink-0" />
                                <span className="truncate">{activeTabInfo.label}</span>
                            </span>
                        )}
                    </div>

                    {/* 平板版：Compact Main Navigation */}
                    <nav className="hidden w-fit items-center justify-center gap-1 px-3 md:flex xl:hidden" aria-label="主要功能">
                        {compactNavGroups.map((group) => {
                            const GroupIcon = group.icon;
                            const isOpen = compactNavSection === group.id;
                            const isActive = compactActiveGroup === group.id;
                            return (
                                <button
                                    type="button"
                                    key={group.id}
                                    onClick={() => setCompactNavSection(isOpen ? null : group.id)}
                                    aria-expanded={isOpen}
                                    aria-haspopup="menu"
                                    aria-pressed={isActive}
                                    className={cn(
                                        'flex min-w-0 shrink items-center justify-center gap-1 rounded-md px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80',
                                        isActive || isOpen
                                            ? 'bg-white text-primary shadow-sm'
                                            : 'text-white/80 hover:bg-white/10 hover:text-white'
                                    )}
                                >
                                    <GroupIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="truncate">{group.label}</span>
                                    <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
                                </button>
                            );
                        })}
                    </nav>

                    {/* 桌面版：Inline Main Tabs */}
                    <nav className="hidden w-fit items-center justify-center gap-0.5 rounded-lg bg-white/10 p-1 xl:flex" aria-label="主要功能">
                        {tabs.map((tab) => (
                            <button
                                type="button"
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                aria-pressed={activeTab === tab.id}
                                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${activeTab === tab.id
                                    ? 'bg-white text-primary shadow-sm'
                                    : 'text-white/80 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    {/* User Controls */}
                    <div className="flex min-w-0 shrink-0 items-center gap-2 justify-self-end sm:gap-3">
                        {isAdmin && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate("/admin")}
                                className="hidden gap-1.5 text-white/90 hover:bg-white/10 hover:text-white xl:flex"
                                title="開啟管理中心"
                            >
                                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                                管理中心
                            </Button>
                        )}
                        {user && (
                            <div className="flex items-center gap-2 pl-2 border-l border-white/20 sm:gap-3 sm:pl-3">
                                <div className="hidden flex-col items-end xl:flex">
                                    <span className="text-xs font-bold leading-tight">{user.displayName}</span>
                                    <span className="text-[10px] text-white/70 leading-tight">{user.email}</span>
                                </div>
                                <div className="w-8 h-8 shrink-0 rounded-full bg-white/20 border border-white/30 overflow-hidden flex items-center justify-center">
                                    {user.photoURL ? (
                                        <img src={user.photoURL} alt="使用者頭像" width={32} height={32} className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-4 h-4" />
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                     size="icon"
                                     onClick={handleLogout}
                                     className="h-10 w-10 shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
                                     title="登出系統"
                                     aria-label="登出系統"
                                 >
                                    <LogOut className="w-4 h-4" />
                                </Button>
                            </div>
                        )}
                        {!user && !isLoading && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => navigate("/login")}
                                className="gap-1.5 bg-white/20 hover:bg-white/30 text-white border-0"
                            >
                                <LogIn className="w-4 h-4" />
                                登入
                            </Button>
                        )}
                    </div>
                </div>

                {compactOpenGroup && (
                    <div
                        className="absolute inset-x-4 top-full z-50 mt-2 rounded-xl border border-white/20 bg-card p-2 text-foreground shadow-xl ring-1 ring-black/10"
                        role="menu"
                        aria-label={`${compactOpenGroup.label}功能`}
                    >
                        <div className="flex items-center justify-between border-b border-border px-2 pb-2">
                            <span className="text-xs font-semibold text-muted-foreground">{compactOpenGroup.label}</span>
                            <button
                                type="button"
                                onClick={() => setCompactNavSection(null)}
                                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                aria-label="關閉功能選單"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
                            {compactOpenGroup.tabIds.map((tabId) => {
                                const tab = tabs.find((item) => item.id === tabId);
                                if (!tab) return null;
                                const TabIcon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        type="button"
                                        key={tab.id}
                                        role="menuitem"
                                        onClick={() => setCompactActiveTab(tab.id)}
                                        aria-pressed={isActive}
                                        className={cn(
                                            'flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            isActive
                                                ? 'border-primary/30 bg-primary/10 text-primary'
                                                : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        <TabIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        <span className="truncate">{tab.label}</span>
                                    </button>
                                );
                            })}
                            {compactOpenGroup.id === 'more' && isAdmin && (
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        setCompactNavSection(null);
                                        navigate('/admin');
                                    }}
                                    className="flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-left text-sm font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                                    <span className="truncate">管理中心</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </header>

            {/* ═══════════ Main Content Area ═══════════ */}
            <main className="flex-1 min-h-0 flex flex-col">

                {/* ─── Create & Document Tabs Share Similar Container ─── */}
                {(activeTab === 'general' || activeTab === 'document') && (
                    <div className="flex-1 flex flex-col min-h-0">

                        {/* Error / Warning Messages */}
                        {(errorMsg || warningMsg) && (
                            <div className="shrink-0 px-4 lg:px-8 pt-3 space-y-2">
                                {errorMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-destructive/50 bg-destructive/5 text-destructive">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span className="text-sm">{errorMsg}</span>
                                    </div>
                                )}
                                {warningMsg && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-warning/50 bg-warning/10">
                                        <AlertCircle className="h-4 w-4 text-warning shrink-0" />
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
                                                <FileText className="h-4 w-4" aria-hidden="true" />
                                                文件分鏡
                                            </TabsTrigger>
                                            <TabsTrigger value="pptmaster" className="gap-2 text-xs sm:text-sm">
                                                <Wand2 className="h-4 w-4" aria-hidden="true" />
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
                                        className="mt-3 min-h-0 flex-1 overflow-y-auto custom-scrollbar"
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
                                            onFocus={() => setIsInputFocused(true)}
                                            onBlur={() => setTimeout(() => setIsInputFocused(false), 100)}
                                            hideGenerate
                                            savedStyles={savedStyles}

                                            // 風格與內容整合
                                            analyzedStyle={analyzedStyle}
                                            onApplyStyle={applySavedStyle}
                                            onClearStyle={handleClearStyle}

                                            contentImagePreview={contentImagePreview}
                                            onContentImageUpload={handleContentImageUpload}
                                            onClearContentImage={handleClearContentImage}
                                            isUploadingContent={isUploadingContent}

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
                                            paletteStyle={paletteStyle}
                                        />

                                        <section className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40 lg:hidden">
                                            <div className="border-b border-border bg-muted/30 px-4 py-3">
                                                <h3 className="text-sm font-semibold text-foreground">預覽與結果</h3>
                                                <p className="text-xs text-muted-foreground">
                                                    生成前可先確認比例，生成後結果會在此顯示。
                                                </p>
                                            </div>
                                            <div className="bg-background p-3">
                                                <ImagePreview
                                                    generatedImage={generatedImage}
                                                    isGenerating={isGenerating}
                                                    aspectRatio={aspectRatio}
                                                    generationStatus={generationStatus}
                                                    analyzedStyle={analyzedStyle}
                                                    onDownload={handleDownload}
                                                    user={user}
                                                />
                                            </div>
                                        </section>
                                    </div>

                                    {/* Right: Preview (takes 2/5 on large screens) */}
                                    <div className="lg:col-span-2 min-h-0 hidden lg:flex items-center justify-center relative overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40">
                                        {/* Decorative grid background */}
                                        <div
                                            className={`absolute inset-0 bg-muted/35 transition-opacity duration-300 ${isGenerating ? 'opacity-0' : 'opacity-100'}`}
                                            style={{
                                                backgroundImage: 'linear-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.06) 1px, transparent 1px)',
                                                backgroundSize: '24px 24px'
                                            }}
                                        />
                                        <div className="relative z-10 w-full max-w-2xl p-6">
                                            <ImagePreview
                                                generatedImage={generatedImage}
                                                isGenerating={isGenerating}
                                                aspectRatio={aspectRatio}
                                                generationStatus={generationStatus}
                                                analyzedStyle={analyzedStyle}
                                                onDownload={handleDownload}
                                                user={user}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Fixed Bottom Generate Bar */}
                        {(activeTab === 'general' ||
                            (hasActiveDocumentResult && documentAnalysisMode === "storyboard")) && (
                            <GenerateBar
                                aspectRatio={aspectRatio}
                                onAspectRatioChange={setAspectRatio}
                                imageSize={imageSize}
                                onImageSizeChange={setImageSize}
                                imageModel={imageModel}
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
                                        : "開始生成圖片"
                                }
                                isGeneratingText={
                                    hasActiveDocumentResult
                                        ? "批次生成中…"
                                        : "AI 生成中…"
                                }
                                disabled={
                                    hasActiveDocumentResult
                                        ? !scenes || scenes.length === 0
                                        : !userScript && !contentImagePreview
                                }
                            />
                        )}
                    </div>
                )}

                {/* ─── Image Transform Tab ─── */}
                {activeTab === 'image-transform' && (
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <ImageTransformPanel
                            sourcePreview={transformSourcePreview}
                            isUploadingSource={isUploadingTransformSource}
                            sourceUploadProgress={transformSourceUploadProgress}
                            onSourceImageUpload={handleTransformSourceUpload}
                            onClearSource={clearTransformSource}
                            mode={transformMode}
                            onModeChange={setTransformMode}
                            prompt={transformPrompt}
                            onPromptChange={setTransformPrompt}
                            aspectRatio={transformAspectRatio}
                            onAspectRatioChange={setTransformAspectRatio}
                            paletteSelected={transformPaletteSelected}
                            onPaletteSelectedChange={setTransformPaletteSelected}
                            savedStyles={savedStyles}
                            appliedStyleName={transformAppliedStyleName}
                            appliedStyleId={transformAppliedStyleId}
                            onApplyStyle={handleApplyStyleForTransform}
                            onClearAppliedStyle={handleClearAppliedStyleForTransform}
                            globalModelLabel={IMAGE_MODEL_OPTIONS.find(m => m.id === imageModel)?.label || imageModel}
                            result={transformResult}
                            isTransforming={isTransforming}
                            transformError={transformError}
                            onTransform={handleTransform}
                            onCancelTransform={cancelTransform}
                            onDownloadResult={handleDownloadTransformResult}
                        />
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
                            imageModel={imageModel}
                            modelPolicy={modelPolicy}
                            user={user}
                        />
                    </div>
                )}
            </main>

            {/* ═══════════ 手機版：生成圖片 Bottom Sheet ═══════════ */}
            {showMobilePreview && generatedImage && (
                <div
                    className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mobile-preview-title"
                >
                    {/* 半透明遮罩 */}
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => setShowMobilePreview(false)}
                        aria-label="關閉生成圖片預覽"
                    />
                    {/* Sheet 主體 */}
                    <div
                        className="relative z-10 flex max-h-[85dvh] flex-col rounded-t-2xl bg-card text-card-foreground shadow-2xl animate-in slide-in-from-bottom duration-300 motion-reduce:animate-none"
                        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
                    >
                        {/* Sheet Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                            <h2 id="mobile-preview-title" className="text-sm font-semibold text-foreground">生成結果</h2>
                            <button
                                type="button"
                                onClick={() => setShowMobilePreview(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                aria-label="關閉預覽"
                            >
                                <X className="w-4 h-4" aria-hidden="true" />
                            </button>
                        </div>
                        {/* 圖片內容（可捲動） */}
                        <div className="flex-1 overflow-y-auto overscroll-contain">
                            <ImagePreview
                                generatedImage={generatedImage}
                                isGenerating={isGenerating}
                                aspectRatio={aspectRatio}
                                generationStatus={generationStatus}
                                analyzedStyle={analyzedStyle}
                                onDownload={handleDownload}
                                user={user}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* 手機版：圖片已生成時，顯示底部快速預覽入口按鈕 */}
            {generatedImage && !showMobilePreview && !isGenerating && activeTab !== 'general' && (
                <button
                    type="button"
                    className="sm:hidden fixed bottom-[calc(64px+env(safe-area-inset-bottom)+1rem)] right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lg transition-[box-shadow,transform] hover:bg-primary/90 active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => setShowMobilePreview(true)}
                    aria-label="查看生成圖片"
                >
                    <img src={generatedImage} alt="" width={24} height={24} decoding="async" className="w-6 h-6 rounded-md object-cover border border-primary-foreground/30" />
                    查看生成圖片
                </button>
            )}

            {/* ═══════════ 手機版底部導航欄（Bottom Navigation Bar）═══════════ */}
            <nav className="relative z-40 shrink-0 bg-card border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] md:hidden pb-[env(safe-area-inset-bottom)]">
                {mobileMoreOpen && (
                    <div
                        className="absolute inset-x-3 bottom-full z-50 mb-2 rounded-xl border border-border bg-card p-2 shadow-xl ring-1 ring-border/40"
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
                                        <tab.icon className="h-4 w-4" aria-hidden="true" />
                                        {tab.shortLabel}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
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
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {/* 活躍指示器 */}
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-primary" />
                                )}
                                <span className={`flex items-center justify-center w-6 h-6 rounded-lg transition-colors duration-200 ${isActive ? 'bg-primary/10' : ''
                                    }`}>
                                    <tab.icon className={`transition-colors duration-200 ${isActive ? 'w-4 h-4' : 'w-4 h-4'
                                        }`} />
                                </span>
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
                        className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${isMobileMoreActive || mobileMoreOpen
                            ? 'text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        {(isMobileMoreActive || mobileMoreOpen) && (
                            <span className="absolute top-0 left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-primary" />
                        )}
                        <span className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-200 ${isMobileMoreActive || mobileMoreOpen ? 'bg-primary/10' : ''
                            }`}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                        </span>
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
