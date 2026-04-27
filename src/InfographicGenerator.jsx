import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, History, Bookmark, Wand2,
    FileText, LogIn, LogOut, User, Settings, LayoutTemplate, X
} from 'lucide-react';

import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useDocumentAnalysis from './hooks/useDocumentAnalysis';
import useTemplates from './hooks/useTemplates';
import { requestBlobSas } from './services/storageService';
import { DEFAULT_IMAGE_MODEL } from './config';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';


import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import StyleLibrary from './components/styles/StyleLibrary';
import HistoryPanel from './components/history/HistoryPanel';
import DocumentUploader from './components/create/DocumentUploader';
import DocumentScenes from './components/create/DocumentScenes';
import GenerateBar from './components/create/GenerateBar';
import SettingsPanel from './components/settings/SettingsPanel';
import TemplateLibrary from './components/templates/TemplateLibrary';

const GENERAL_FLOW_STEPS = [
    { id: 'content', label: '內容', description: '描述畫面' },
    { id: 'style', label: '風格/參考', description: '補充素材' },
    { id: 'generate', label: '生成', description: '確認輸出' },
];

export default function InfographicGenerator({ initialTab = 'general' }) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab);

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
        try { return localStorage.getItem('genpic_image_language') || 'en'; } catch { return 'en'; }
    });
    const [imageModel, setImageModel] = useState(() => {
        try { return localStorage.getItem('genpic_image_model') || DEFAULT_IMAGE_MODEL; } catch { return DEFAULT_IMAGE_MODEL; }
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
    const [showMobilePreview, setShowMobilePreview] = useState(false);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

    const navigate = useNavigate();
    const { user, handleLogout, isLoading } = useAuth();
    const {
        savedStyles, newStyleName, newStyleTags, isSavingStyle, isSearching,
        setNewStyleName, setNewStyleTags, saveStyle, deleteStyle, searchStyles, deleteStyles
    } = useStyles({ user });
    const { historyItems, saveHistoryItem, deleteHistoryItem, deleteHistoryItems } = useHistory({ user });
    const { templates, saveTemplate, removeTemplate, removeTemplates } = useTemplates({ user });

    const {
        isAnalyzing: isAnalyzingDocument, analysisPhase: documentAnalysisPhase,
        documentResult, analyzeDocument, clearDocument, updateScene, removeScene,
        scenes,
    } = useDocumentAnalysis();

    const {
        analyzedStyle, analysisResultData, generatedImage, generatedFilename,
        isAnalyzing, isGenerating, analysisPhase, generationStatus,
        analyzeStyle, generateImage, cancelGeneration, clearStyle,
        setAnalyzedStyle, setAnalysisResultData, setGeneratedImage
    } = useImageGeneration();

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

        // 清除 AI 生成的英文 prompt (如果有的話)
        setOptimizedPromptEn('');
    };

    const analyzeImageStyle = async () => {
        try {
            const analysisResult = await analyzeStyle({ referencePreview, imageUrl: referenceBlobSasUrl });
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
        e.stopPropagation();
        if (!user || !confirm('確定要刪除此風格收藏嗎？')) return;
        try { await deleteStyle(id); } catch (err) { console.error("Delete style failed:", err); }
    };

    const applySavedStyle = (styleData) => {
        setAnalyzedStyle(styleData.prompt);
        setAnalysisResultData({ style_prompt: styleData.prompt, style_description_zh: styleData.description, suggested_tags: styleData.tags });
        setNewStyleName(styleData.name || '');
        setNewStyleTags((styleData.tags || []).join(', '));
        setIsStyleNameTouched(true);
        setIsStyleTagsTouched(true);
        // 不再跳頁 — 讓使用者留在目前位置
    };

    const handleStyleNameChange = (value) => { setNewStyleName(value); setIsStyleNameTouched(true); };
    const handleStyleTagsChange = (value) => { setNewStyleTags(value); setIsStyleTagsTouched(true); };
    const handleClearStyle = () => { clearStyle(); setNewStyleName(''); setNewStyleTags(''); setIsStyleNameTouched(false); setIsStyleTagsTouched(false); };

    // ─── Template Functions ───
    const applyTemplate = (template) => {
        if (template.userScript) {
            setUserScript(template.userScript);
            setOptimizedPromptEn(''); // 重置優化 prompt，退回重新優化或套用 template 狀態
        }
        if (template.stylePrompt) {
            setAnalyzedStyle(template.stylePrompt);
            setAnalysisResultData({ style_prompt: template.stylePrompt });
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

    const handleModelChange = (model) => {
        setImageModel(model);
        try { localStorage.setItem('genpic_image_model', model); } catch { /* ignore */ }
    };

    const generateInfographic = async () => {
        try {
            // 如果存在 AI 智能優化後的英文 prompt 就優先使用，否則使用畫面上的中文 userScript
            const finalScriptToUse = optimizedPromptEn || userScript;

            const { imageUrl, finalPrompt } = await generateImage({
                userScript: finalScriptToUse,
                analyzedStyle,
                aspectRatio,
                imageSize,
                imageLanguage,
                contentImageUrl: contentBlobSasUrl,
                model: imageModel
            });
            await saveHistoryItem({ imageUrl, userScript, stylePrompt: analyzedStyle, fullPrompt: finalPrompt, styleId: analysisResultData?.styleId || null });
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

    const handleAnalyzeDocument = async (file, sceneCount, mode) => {
        try {
            setErrorMsg('');
            const result = await analyzeDocument(file, sceneCount, mode);
            return result;
        } catch (err) {
            console.error("Document Analysis Failed:", err);
            setErrorMsg(err.message || "文件分析失敗，請稍後重試。");
            throw err;
        }
    };

    const handleGenerateScene = async (sceneIndex) => {
        const scene = scenes[sceneIndex];
        if (!scene) return;
        try {
            setErrorMsg('');
            // 呼叫圖片生成（帶入語系設定）
            // 使用英文的 visual_prompt 作為生成提示詞，若無則退回使用 scene_description
            const promptToUse = scene.visual_prompt || scene.scene_description;

            const result = await generateImage({
                userScript: promptToUse,
                analyzedStyle,
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
                stylePrompt: analyzedStyle,
                fullPrompt: result.finalPrompt,
                sceneNumber: scene.scene_number,
                documentTitle: documentResult?.title
            });

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

    // --- Tab 定義 ---
    const tabs = [
        { id: 'general', label: '一般創作', shortLabel: '創作', icon: Wand2 },
        { id: 'document', label: '文件分析', shortLabel: '文件', icon: FileText },
        { id: 'templates', label: '範本', shortLabel: '範本', icon: LayoutTemplate },
        { id: 'styles', label: '風格庫', shortLabel: '風格', icon: Bookmark },
        { id: 'history', label: '紀錄', shortLabel: '紀錄', icon: History },
        { id: 'settings', label: '設定', shortLabel: '設定', icon: Settings },
    ];
    const activeTabInfo = tabs.find(t => t.id === activeTab);

    // --- Render ---
    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden">

            {/* ═══════════ Top Header Bar ═══════════ */}
            <header className="shrink-0 border-b border-border bg-primary text-white shadow-md">
                <div className="flex items-center justify-between px-4 lg:px-8 h-14">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                            <Wand2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold leading-tight">Pixora 智繪</h1>
                            <p className="text-[10px] text-white/70 leading-none hidden sm:block">AI 智能視覺創作平台</p>
                        </div>
                        {/* 手機版：顯示當前頁面名稱 badge */}
                        {activeTabInfo && (
                            <span className="sm:hidden flex items-center gap-1 ml-1 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-medium backdrop-blur-sm">
                                <activeTabInfo.icon className="w-3 h-3" />
                                {activeTabInfo.label}
                            </span>
                        )}
                    </div>

                    {/* 桌面版：Inline Main Tabs */}
                    <nav className="hidden sm:flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-lg p-1">
                        {tabs.map((tab) => (
                            <button
                                type="button"
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                aria-pressed={activeTab === tab.id}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${activeTab === tab.id
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
                    <div className="flex items-center gap-3">
                        {user && (
                            <div className="flex items-center gap-3 pl-3 border-l border-white/20">
                                <div className="flex flex-col items-end hidden md:flex">
                                    <span className="text-xs font-bold leading-tight">{user.displayName}</span>
                                    <span className="text-[10px] text-white/70 leading-tight">{user.email}</span>
                                </div>
                                <div className="w-8 h-8 rounded-full bg-white/20 border border-white/30 overflow-hidden flex items-center justify-center">
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
                                     className="h-10 w-10 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
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
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 lg:px-8 py-3">
                                {documentResult ? (
                                    <DocumentScenes
                                        documentResult={documentResult}
                                        onUpdateScene={updateScene}
                                        onRemoveScene={removeScene}
                                        onGenerateScene={handleGenerateScene}
                                        onGenerateAll={handleGenerateAllScenes}
                                        onClear={clearDocument}
                                        isGenerating={isGenerating}
                                        savedStyles={savedStyles}
                                        analyzedStyle={analyzedStyle}
                                        onApplyStyle={applySavedStyle}
                                        onClearStyle={handleClearStyle}
                                    />
                                ) : (
                                    <div className="max-w-3xl mx-auto py-8">
                                        <DocumentUploader
                                            onAnalyze={handleAnalyzeDocument}
                                            isAnalyzing={isAnalyzingDocument}
                                            analysisPhase={documentAnalysisPhase}
                                            disabled={isAnalyzingDocument}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── Two-Column Layout (Controls + Preview) for other tabs ─── */}
                        {activeTab === 'general' && (
                            <div className="flex-1 min-h-0 flex flex-col gap-3 bg-muted/25 px-4 py-3 lg:px-8 overflow-y-auto lg:overflow-hidden custom-scrollbar">
                                <section className="shrink-0 rounded-2xl border border-border bg-card px-4 py-3 shadow-md ring-1 ring-border/40">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h2 className="text-sm font-semibold text-foreground">一般創作工作區</h2>
                                                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                                                    Guided flow
                                                </Badge>
                                            </div>
                                            <p className="text-xs leading-relaxed text-muted-foreground">
                                                依序完成內容、參考風格與輸出設定，讓生成前的操作更清楚。
                                            </p>
                                        </div>

                                        <ol className="grid grid-cols-3 gap-2 lg:min-w-[360px]" aria-label="一般創作流程">
                                            {GENERAL_FLOW_STEPS.map((step, index) => (
                                                <li
                                                    key={step.id}
                                                    className="rounded-xl border border-border/80 bg-muted/35 px-3 py-2 shadow-sm"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                                            {index + 1}
                                                        </span>
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-xs font-semibold text-foreground">
                                                                {step.label}
                                                            </span>
                                                            <span className="hidden truncate text-xs text-muted-foreground sm:block">
                                                                {step.description}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                </section>

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
                                activeTab === 'document' && documentResult
                                    ? handleGenerateAllScenes
                                    : generateInfographic
                            }
                            buttonText={
                                activeTab === 'document' && documentResult
                                    ? `批次生成所有圖片 (${scenes?.length || 0})`
                                    : "開始生成圖片"
                            }
                            isGeneratingText={
                                activeTab === 'document' && documentResult
                                    ? "批次生成中…"
                                    : "AI 生成中…"
                            }
                            disabled={
                                (activeTab === 'document' && (!scenes || scenes.length === 0)) ||
                                (activeTab === 'general' && !userScript && !contentImagePreview)
                            }
                        />
                    </div>
                )}

                {/* ─── Templates Tab ─── */}
                {activeTab === 'templates' && (
                    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 custom-scrollbar">
                        <div className="max-w-5xl mx-auto">
                            <TemplateLibrary
                                templates={templates}
                                onApplyTemplate={applyTemplate}
                                onDeleteTemplate={handleDeleteTemplate}
                                onDeleteTemplates={removeTemplates}
                            />
                        </div>
                    </div>
                )}

                {/* ─── Styles Tab ─── */}
                {activeTab === 'styles' && (
                    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 custom-scrollbar">
                        <div className="max-w-5xl mx-auto">
                            <StyleLibrary
                                savedStyles={savedStyles}
                                isSearching={isSearching}
                                searchQuery={searchQuery}
                                onSearchChange={(value) => { setSearchQuery(value); searchStyles(value); }}
                                onApplyStyle={applySavedStyle}
                                onDeleteStyle={deleteSavedStyle}
                                onDeleteStyles={deleteStyles}
                            />
                        </div>
                    </div>
                )}

                {/* ─── History Tab ─── */}
                {activeTab === 'history' && (
                    <div className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 custom-scrollbar">
                        <div className="max-w-5xl mx-auto">
                            <HistoryPanel
                                historyItems={historyItems}
                                savedStyles={savedStyles}
                                searchQuery={searchQuery}
                                onSearchChange={setSearchQuery}
                                onLoad={loadFromHistory}
                                onDelete={deleteHistoryItem}
                                onDeleteItems={deleteHistoryItems}
                                onGoCreate={() => setActiveTab('general')}
                                onGoStyles={() => setActiveTab('styles')}
                            />
                        </div>
                    </div>
                )}

                {/* ─── Settings Tab ─── */}
                {activeTab === 'settings' && (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <SettingsPanel
                            imageLanguage={imageLanguage}
                            onImageLanguageChange={handleLanguageChange}
                            imageModel={imageModel}
                            onImageModelChange={handleModelChange}
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
            <nav className="sm:hidden shrink-0 bg-card border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.06)] z-40 pb-[env(safe-area-inset-bottom)]">
                <div className="flex items-stretch h-16">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                type="button"
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
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
                </div>
            </nav>
        </div>
    );
}

