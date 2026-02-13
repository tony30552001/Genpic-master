import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle, History, Bookmark, Wand2,
    FileText, Palette, PenLine, LogIn, LogOut, User, Settings
} from 'lucide-react';

import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useDocumentAnalysis from './hooks/useDocumentAnalysis';
import { requestBlobSas } from './services/storageService';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

import StyleAnalyzer from './components/create/StyleAnalyzer';
import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import StyleLibrary from './components/styles/StyleLibrary';
import HistoryPanel from './components/history/HistoryPanel';
import DocumentUploader from './components/create/DocumentUploader';
import DocumentScenes from './components/create/DocumentScenes';
import GenerateBar from './components/create/GenerateBar';
import SettingsPanel from './components/settings/SettingsPanel';

export default function InfographicGenerator({ initialTab = 'create' }) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab);
    const [createSubTab, setCreateSubTab] = useState('style');

    // Input States
    const [referenceImage, setReferenceImage] = useState(null);
    const [referencePreview, setReferencePreview] = useState(null);
    const [referenceBlobUrl, setReferenceBlobUrl] = useState(null);
    const [referenceBlobSasUrl, setReferenceBlobSasUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [userScript, setUserScript] = useState('');

    // 全域設定
    const [imageLanguage, setImageLanguage] = useState(() => {
        try { return localStorage.getItem('genpic_image_language') || 'en'; } catch { return 'en'; }
    });

    // 風格設定相關
    const [aspectRatio, setAspectRatio] = useState('16:9');
    const [imageSize, setImageSize] = useState('1K');
    const [errorMsg, setErrorMsg] = useState('');
    const [warningMsg, setWarningMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [isStyleNameTouched, setIsStyleNameTouched] = useState(false);
    const [isStyleTagsTouched, setIsStyleTagsTouched] = useState(false);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

    const navigate = useNavigate();
    const { user, handleMicrosoftLogin, handleLogout, isLoading } = useAuth();
    const {
        savedStyles, newStyleName, newStyleTags, isSavingStyle, isSearching,
        setNewStyleName, setNewStyleTags, saveStyle, deleteStyle, searchStyles
    } = useStyles({ user });
    const { historyItems, saveHistoryItem, deleteHistoryItem } = useHistory({ user });

    const {
        isAnalyzing: isAnalyzingDocument, analysisPhase: documentAnalysisPhase,
        documentResult, analyzeDocument, clearDocument, updateScene, removeScene,
        scenes, totalScenes,
    } = useDocumentAnalysis();

    const {
        analyzedStyle, analysisResultData, generatedImage,
        isAnalyzing, isGenerating, analysisPhase,
        analyzeStyle, generateImage, clearStyle,
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

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { setErrorMsg("圖片過大，請上傳小於 4MB 的圖片。"); return; }
        try {
            setIsUploading(true);
            setUploadProgress(0);
            const safeName = `${Date.now()}-${file.name}`.replace(/\s+/g, "-");
            const sas = await requestBlobSas({ fileName: safeName, contentType: file.type, container: "uploads" });
            const blobUrl = await uploadBlobWithProgress({ blobUrl: sas.blobUrl, sasToken: sas.sasToken, file, contentType: file.type, onProgress: setUploadProgress });
            const blobSasUrl = `${sas.blobUrl}?${sas.sasToken}`;
            const reader = new FileReader();
            reader.onloadend = () => {
                setReferenceImage(file);
                setReferencePreview(reader.result);
                setReferenceBlobUrl(blobUrl);
                setReferenceBlobSasUrl(blobSasUrl);
                setAnalyzedStyle('');
                setAnalysisResultData(null);
                setErrorMsg('');
                setWarningMsg('');
                setIsStyleNameTouched(false);
                setIsStyleTagsTouched(false);
                setTimeout(() => { setIsUploading(false); setUploadProgress(0); }, 1500);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Upload failed:", err);
            setErrorMsg(err.message || "上傳失敗，請稍後再試。");
        } finally {
            if (!referencePreview) setIsUploading(false);
        }
    };

    const handleClearReference = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        setReferenceImage(null);
        setReferencePreview(null);
        setReferenceBlobUrl(null);
        setReferenceBlobSasUrl(null);
        setIsUploading(false);
        setUploadProgress(0);
        setWarningMsg('');
        setIsStyleNameTouched(false);
        setIsStyleTagsTouched(false);
        clearStyle();
    };

    const analyzeImageStyle = async () => {
        try {
            const analysisResult = await analyzeStyle({ referencePreview, imageUrl: referenceBlobSasUrl });
            setUserScript(analysisResult.image_content || '');
            const tags = Array.isArray(analysisResult.suggested_tags) ? analysisResult.suggested_tags : [];
            const autoStyleName = analysisResult.style_name || tags[0] || '未命名風格';
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
            await saveStyle({ analyzedStyle, analysisResultData, referencePreview, referenceBlobUrl });
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

    const handleLanguageChange = (lang) => {
        setImageLanguage(lang);
        try { localStorage.setItem('genpic_image_language', lang); } catch { }
    };

    const generateInfographic = async () => {
        try {
            const { imageUrl, finalPrompt } = await generateImage({ userScript, analyzedStyle, aspectRatio, imageSize, imageLanguage });
            await saveHistoryItem({ imageUrl, userScript, stylePrompt: analyzedStyle, fullPrompt: finalPrompt, styleId: analysisResultData?.styleId || null });
            setErrorMsg('');
        } catch (err) {
            console.error("Image Generation Failed:", err);
            setErrorMsg(`圖片生成失敗: ${err.message || "請確認模型名稱支援圖片生成"}`);
        }
    };

    const loadFromHistory = (item) => {
        setUserScript(item.userScript);
        setAnalyzedStyle(item.stylePrompt || '');
        setAnalysisResultData(null);
        setGeneratedImage(item.imageUrl);
        setActiveTab('create');
    };

    const handleDownload = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `generated-infographic-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleAnalyzeDocument = async (file) => {
        try {
            setErrorMsg('');
            const result = await analyzeDocument(file);
            if (result.scenes && result.scenes.length > 0) setUserScript(result.scenes[0].scene_description || '');
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
            // 呼叫圖片生成
            const result = await generateImage({
                userScript: scene.scene_description,
                analyzedStyle,
                aspectRatio,
                imageSize
            });

            // 1. 更新 DocumentAnalysis 的狀態 (顯示在卡片上)
            updateScene(sceneIndex, {
                generatedImage: result.imageUrl
            });

            // 2. 寫入歷史紀錄
            await saveHistoryItem({
                imageUrl: result.imageUrl,
                userScript: scene.scene_description,
                stylePrompt: analyzedStyle,
                fullPrompt: result.finalPrompt,
                sceneNumber: scene.scene_number,
                documentTitle: documentResult?.title
            });

            // 3. 更新主預覽圖 (選用，讓使用者看到最新生成的圖)
            setGeneratedImage(result.imageUrl);

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

    // --- Status indicators for sub tabs ---
    const hasStyle = !!analyzedStyle || !!referencePreview;
    const hasContent = !!userScript;
    const hasDocument = !!documentResult;

    // --- Render ---
    return (
        <div className="h-[100dvh] flex flex-col bg-background text-foreground font-sans overflow-hidden">

            {/* ═══════════ Top Header Bar ═══════════ */}
            <header className="shrink-0 border-b border-border bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 text-white shadow-md">
                <div className="flex items-center justify-between px-4 lg:px-8 h-14">
                    {/* Logo */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur flex items-center justify-center">
                            <Wand2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-base font-bold leading-tight">企業風格圖產生器</h1>
                            <p className="text-[10px] text-white/70 leading-none hidden sm:block">Powered by Gemini &amp; Imagen</p>
                        </div>
                    </div>

                    {/* Inline Main Tabs */}
                    <nav className="hidden sm:flex items-center gap-1 bg-white/10 backdrop-blur-sm rounded-lg p-1">
                        {[
                            { id: 'create', label: '製作區', icon: Wand2 },
                            { id: 'styles', label: '風格庫', icon: Bookmark },
                            { id: 'history', label: '紀錄', icon: History },
                            { id: 'settings', label: '設定', icon: Settings },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === tab.id
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
                                        <img src={user.photoURL} alt="User Avatar" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-4 h-4" />
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={handleLogout}
                                    className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all"
                                    title="登出系統"
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

                {/* Mobile Tabs */}
                <div className="sm:hidden flex border-t border-white/20">
                    {[
                        { id: 'create', label: '製作區', icon: Wand2 },
                        { id: 'styles', label: '風格庫', icon: Bookmark },
                        { id: 'history', label: '紀錄', icon: History },
                        { id: 'settings', label: '設定', icon: Settings },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-all ${activeTab === tab.id
                                ? 'bg-white/20 text-white'
                                : 'text-white/60 hover:text-white'
                                }`}
                        >
                            <tab.icon className="w-3.5 h-3.5" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* ═══════════ Main Content Area ═══════════ */}
            <main className="flex-1 min-h-0 flex flex-col">

                {/* ─── Create Tab ─── */}
                {activeTab === 'create' && (
                    <div className="flex-1 flex flex-col min-h-0">

                        {/* Error / Warning Messages */}
                        {(errorMsg || warningMsg) && (
                            <div className="shrink-0 px-4 lg:px-8 pt-3 space-y-2">
                                {errorMsg && (
                                    <Alert variant="destructive" className="py-2">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertDescription className="text-sm">{errorMsg}</AlertDescription>
                                    </Alert>
                                )}
                                {warningMsg && (
                                    <Alert className="py-2 border-warning bg-warning/10">
                                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                                        <AlertDescription className="text-sm text-yellow-700">{warningMsg}</AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}

                        {/* Sub Tabs Bar */}
                        <div className="shrink-0 px-4 lg:px-8 pt-3 pb-1">
                            <div className="inline-flex items-center gap-1 bg-muted rounded-lg p-1">
                                {[
                                    { id: 'style', label: '風格', icon: Palette, active: hasStyle },
                                    { id: 'content', label: '內容', icon: PenLine, active: hasContent },
                                    { id: 'document', label: '文件分析', icon: FileText, active: hasDocument },
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setCreateSubTab(tab.id)}
                                        className={`relative flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${createSubTab === tab.id
                                            ? 'bg-background text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                                            }`}
                                    >
                                        <tab.icon className="w-4 h-4" />
                                        {tab.label}
                                        {tab.active && (
                                            <span className="w-2 h-2 bg-primary rounded-full ml-1 animate-pulse" />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ─── Document Sub-Tab: Full-Width Layout ─── */}
                        {createSubTab === 'document' && (
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
                        {createSubTab !== 'document' && (
                            <>
                                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-0 lg:gap-6 px-4 lg:px-8 py-3">

                                    {/* Left: Controls (takes 3/5 on large screens) */}
                                    <div className="lg:col-span-3 overflow-y-auto custom-scrollbar pr-1">
                                        {createSubTab === 'style' && (
                                            <StyleAnalyzer
                                                referencePreview={referencePreview}
                                                isUploading={isUploading}
                                                uploadProgress={uploadProgress}
                                                isAnalyzing={isAnalyzing}
                                                analyzedStyle={analyzedStyle}
                                                analysisResultData={analysisResultData}
                                                newStyleName={newStyleName}
                                                newStyleTags={newStyleTags}
                                                isSavingStyle={isSavingStyle}
                                                analysisPhase={analysisPhase}
                                                onImageUpload={handleImageUpload}
                                                onClearReference={handleClearReference}
                                                onAnalyze={analyzeImageStyle}
                                                onStyleNameChange={handleStyleNameChange}
                                                onStyleTagsChange={handleStyleTagsChange}
                                                onSaveStyle={saveCurrentStyle}
                                                onClearStyle={handleClearStyle}
                                            />
                                        )}
                                        {createSubTab === 'content' && (
                                            <ScriptEditor
                                                userScript={userScript}
                                                onUserScriptChange={setUserScript}
                                                onFocus={() => setIsInputFocused(true)}
                                                onBlur={() => setTimeout(() => setIsInputFocused(false), 100)}
                                                hideGenerate
                                                savedStyles={savedStyles}
                                                analyzedStyle={analyzedStyle}
                                                onApplyStyle={applySavedStyle}
                                            />
                                        )}
                                    </div>

                                    {/* Right: Preview (takes 2/5 on large screens) */}
                                    <div className="lg:col-span-2 hidden lg:flex items-center justify-center relative rounded-2xl bg-muted/40 border border-border/50 overflow-hidden">
                                        {/* Decorative grid background */}
                                        <div
                                            className="absolute inset-0 opacity-[0.03]"
                                            style={{
                                                backgroundImage: 'linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)',
                                                backgroundSize: '24px 24px'
                                            }}
                                        />
                                        <div className="relative z-10 w-full max-w-2xl p-6">
                                            <ImagePreview
                                                generatedImage={generatedImage}
                                                isGenerating={isGenerating}
                                                analyzedStyle={analyzedStyle}
                                                onDownload={handleDownload}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Mobile-only Preview (shows below controls) */}
                                <div className="lg:hidden px-4 pb-3">
                                    {generatedImage && (
                                        <div className="rounded-xl bg-muted/40 border border-border/50 p-3">
                                            <ImagePreview
                                                generatedImage={generatedImage}
                                                isGenerating={isGenerating}
                                                analyzedStyle={analyzedStyle}
                                                onDownload={handleDownload}
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Fixed Bottom Generate Bar */}
                        {/* Fixed Bottom Generate Bar */}
                        <GenerateBar
                            aspectRatio={aspectRatio}
                            onAspectRatioChange={setAspectRatio}
                            imageSize={imageSize}
                            onImageSizeChange={setImageSize}
                            isGenerating={isGenerating}
                            onGenerate={
                                createSubTab === 'document' && documentResult
                                    ? handleGenerateAllScenes
                                    : generateInfographic
                            }
                            buttonText={
                                createSubTab === 'document' && documentResult
                                    ? `批次生成所有圖片 (${scenes?.length || 0})`
                                    : "開始生成圖片"
                            }
                            isGeneratingText={
                                createSubTab === 'document' && documentResult
                                    ? "批次生成中..."
                                    : "AI 生成中..."
                            }
                            disabled={
                                (createSubTab === 'document' && (!scenes || scenes.length === 0)) ||
                                (createSubTab !== 'document' && !userScript && !hasDocument)
                            }
                        />
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
                                onGoCreate={() => setActiveTab('create')}
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
                        />
                    </div>
                )}
            </main>
        </div>
    );
}
