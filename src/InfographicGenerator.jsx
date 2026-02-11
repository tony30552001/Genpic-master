import React, { useEffect, useState } from 'react';
import { AlertCircle, History, Bookmark, Wand2, FileText } from 'lucide-react';

import useAuth from './hooks/useAuth';
import useStyles from './hooks/useStyles';
import useHistory from './hooks/useHistory';
import useImageGeneration from './hooks/useImageGeneration';
import useDocumentAnalysis from './hooks/useDocumentAnalysis';
import { requestBlobSas, uploadBlob } from './services/storageService';

import AppHeader from './components/layout/AppHeader';
import StyleAnalyzer from './components/create/StyleAnalyzer';
import ScriptEditor from './components/create/ScriptEditor';
import ImagePreview from './components/create/ImagePreview';
import StyleLibrary from './components/styles/StyleLibrary';
import HistoryPanel from './components/history/HistoryPanel';
import DocumentUploader from './components/create/DocumentUploader';
import DocumentScenes from './components/create/DocumentScenes';

export default function InfographicGenerator({ initialTab = 'create' }) {
    // --- State Management ---
    const [activeTab, setActiveTab] = useState(initialTab); // 'create', 'history', 'styles'

    // Input States
    const [referenceImage, setReferenceImage] = useState(null); // The file object
    const [referencePreview, setReferencePreview] = useState(null); // Base64 for preview
    const [referenceBlobUrl, setReferenceBlobUrl] = useState(null);
    const [referenceBlobSasUrl, setReferenceBlobSasUrl] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [userScript, setUserScript] = useState(''); // The user's content text

    // 文件分析相關狀態
    const [showDocumentAnalysis, setShowDocumentAnalysis] = useState(false);

    // 風格設定相關
    const [aspectRatio, setAspectRatio] = useState('16:9'); // 16:9, 4:3, 1:1, 9:16
    const [imageSize, setImageSize] = useState('1K'); // 1K, 2K, 4K
    const [resolutionLevel, setResolutionLevel] = useState('standard'); // standard (faster), high (slower)
    const [errorMsg, setErrorMsg] = useState('');
    const [warningMsg, setWarningMsg] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false); // For mobile UI optimization
    const [isStyleNameTouched, setIsStyleNameTouched] = useState(false);
    const [isStyleTagsTouched, setIsStyleTagsTouched] = useState(false);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);
    const { user, handleMicrosoftLogin, handleLogout } = useAuth();
    const {
        savedStyles,
        newStyleName,
        newStyleTags,
        isSavingStyle,
        isSearching,
        setNewStyleName,
        setNewStyleTags,
        saveStyle,
        deleteStyle,
        searchStyles
    } = useStyles({ user });
    const { historyItems, saveHistoryItem, deleteHistoryItem } = useHistory({ user });
    
    // 文件分析 hook
    const {
        isAnalyzing: isAnalyzingDocument,
        analysisPhase: documentAnalysisPhase,
        documentResult,
        analyzeDocument,
        clearDocument,
        updateScene,
        removeScene,
        scenes,
        totalScenes,
    } = useDocumentAnalysis();
    
    const {
        analyzedStyle,
        analysisResultData,
        generatedImage,
        isAnalyzing,
        isGenerating,
        analysisPhase, // 新增：分析階段狀態
        analyzeStyle,
        generateImage,
        clearStyle,
        setAnalyzedStyle,
        setAnalysisResultData,
        setGeneratedImage
    } = useImageGeneration();

    // --- Core Logic Functions ---

    // 1. Image Upload & Pre-processing
    const uploadBlobWithProgress = ({ blobUrl, sasToken, file, contentType, onProgress }) =>
        new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', `${blobUrl}?${sasToken}`, true);
            xhr.setRequestHeader('x-ms-blob-type', 'BlockBlob');
            xhr.setRequestHeader('Content-Type', contentType);

            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    onProgress(percent);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(blobUrl);
                } else {
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            };

            xhr.onerror = () => reject(new Error('Upload failed'));
            xhr.send(file);
        });

    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 4 * 1024 * 1024) {
            setErrorMsg("圖片過大，請上傳小於 4MB 的圖片。");
            return;
        }

        try {
            setIsUploading(true);
            setUploadProgress(0);
            const safeName = `${Date.now()}-${file.name}`.replace(/\s+/g, "-");
            const sas = await requestBlobSas({
                fileName: safeName,
                contentType: file.type,
                container: "uploads"
            });
            const blobUrl = await uploadBlobWithProgress({
                blobUrl: sas.blobUrl,
                sasToken: sas.sasToken,
                file,
                contentType: file.type,
                onProgress: setUploadProgress
            });
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
                setTimeout(() => {
                    setIsUploading(false);
                    setUploadProgress(0);
                }, 1500);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error("Upload failed:", err);
            setErrorMsg(err.message || "上傳失敗，請稍後再試。");
        } finally {
            if (!referencePreview) {
                setIsUploading(false);
            }
        }
    };

    // New function to clear reference
    const handleClearReference = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
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
        // We intentionally keep userScript so user doesn't lose their text
    };

    // 2. Analyze Style (via API)
    const analyzeImageStyle = async () => {
        try {
            const analysisResult = await analyzeStyle({
                referencePreview,
                imageUrl: referenceBlobSasUrl
            });
            setUserScript(analysisResult.image_content || '');

            const tags = Array.isArray(analysisResult.suggested_tags)
                ? analysisResult.suggested_tags
                : [];
            const autoStyleName =
                analysisResult.style_name ||
                tags[0] ||
                '未命名風格';
            const shouldSetName = !isStyleNameTouched;
            const shouldSetTags = !isStyleTagsTouched;
            const finalStyleName = shouldSetName ? autoStyleName : newStyleName.trim();
            if (shouldSetName) {
                setNewStyleName(autoStyleName);
            }
            if (shouldSetTags) {
                setNewStyleTags(tags.join(', '));
            }
            setAnalysisResultData({
                ...analysisResult,
                style_name: finalStyleName
            });

            if (analysisResult.embedding_error) {
                setWarningMsg('向量產生失敗，已略過風格向量寫入。');
            } else {
                setWarningMsg('');
            }
            setErrorMsg('');
        } catch (err) {
            console.error("Analysis Failed:", err);
            setErrorMsg(err.message || "圖片分析失敗，請確認 API 是否啟用。");
            setWarningMsg('');
        }
    };

    // --- Style Management Functions ---
    const saveCurrentStyle = async () => {
        try {
            await saveStyle({
                analyzedStyle,
                analysisResultData,
                referencePreview,
                referenceBlobUrl
            });
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
        try {
            await deleteStyle(id);
        } catch (err) {
            console.error("Delete style failed:", err);
        }
    };

    const applySavedStyle = (styleData) => {
        setAnalyzedStyle(styleData.prompt);
        setAnalysisResultData({
            style_prompt: styleData.prompt,
            style_description_zh: styleData.description,
            suggested_tags: styleData.tags
        });
        setNewStyleName(styleData.name || '');
        setNewStyleTags((styleData.tags || []).join(', '));
        setIsStyleNameTouched(true);
        setIsStyleTagsTouched(true);
        setActiveTab('create');
    };

    const handleStyleNameChange = (value) => {
        setNewStyleName(value);
        setIsStyleNameTouched(true);
    };

    const handleStyleTagsChange = (value) => {
        setNewStyleTags(value);
        setIsStyleTagsTouched(true);
    };

    const handleClearStyle = () => {
        clearStyle();
        setNewStyleName('');
        setNewStyleTags('');
        setIsStyleNameTouched(false);
        setIsStyleTagsTouched(false);
    };

    // 3. Generate Image (via API)
    const generateInfographic = async () => {
        try {
            const { imageUrl, finalPrompt } = await generateImage({
                userScript,
                analyzedStyle,
                aspectRatio,
                imageSize
            });

            await saveHistoryItem({
                imageUrl,
                userScript,
                stylePrompt: analyzedStyle,
                fullPrompt: finalPrompt,
                styleId: analysisResultData?.styleId || null
            });
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

    // 4. Document Analysis Handlers
    const handleAnalyzeDocument = async (file) => {
        try {
            setErrorMsg('');
            const result = await analyzeDocument(file);
            // 將第一個場景的內容填入 userScript
            if (result.scenes && result.scenes.length > 0) {
                setUserScript(result.scenes[0].scene_description || '');
            }
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
            const finalPrompt = `Create an image with the following style: ${
                analyzedStyle || "High quality, professional corporate style"
            }. ${scene.visual_prompt || scene.scene_description}. Ensure the composition is suitable for an infographic or presentation slide.`;

            const result = await generateImage({
                userScript: scene.scene_description,
                analyzedStyle,
                aspectRatio,
                imageSize,
            });

            await saveHistoryItem({
                imageUrl: result.imageUrl,
                userScript: scene.scene_description,
                stylePrompt: analyzedStyle,
                fullPrompt: finalPrompt,
                sceneNumber: scene.scene_number,
            });
            
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
            // 這裡可以實作批次佇列機制，目前依序生成
            for (let i = 0; i < scenes.length; i++) {
                await handleGenerateScene(i);
            }
        } catch (err) {
            console.error("Batch Generation Failed:", err);
            setErrorMsg(`批次生成失敗: ${err.message}`);
        }
    };

    // --- Render Components ---

    return (
        <div className="flex flex-col md:flex-row h-[100dvh] md:h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">

            {/* Left Sidebar - Controls */}
            <div className={`w-full md:w-1/3 md:min-w-[350px] bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col shadow-lg z-10 order-1 relative transition-all duration-300 ${isInputFocused ? 'h-full' : 'h-[60%] md:h-full'}`}>

                <AppHeader
                    user={user}
                    onLogin={async () => {
                        try {
                            await handleMicrosoftLogin();
                        } catch (error) {
                            console.error("Microsoft Login Error:", error);
                            setErrorMsg(`登入失敗: ${error.message}`);
                        }
                    }}
                    onLogout={handleLogout}
                />

                {/* Tabs */}
                <div className="flex border-b border-slate-200 shrink-0">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`flex-1 py-2 md:py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Wand2 className="w-4 h-4" /> 製作區
                    </button>
                    <button
                        onClick={() => setActiveTab('styles')}
                        className={`flex-1 py-2 md:py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'styles' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Bookmark className="w-4 h-4" /> 風格庫
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-2 md:py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <History className="w-4 h-4" /> 紀錄
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">

                    {errorMsg && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-start gap-2 animate-pulse">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {errorMsg}
                        </div>
                    )}

                    {warningMsg && (
                        <div className="bg-amber-50 text-amber-700 p-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {warningMsg}
                        </div>
                    )}

                    {activeTab === 'create' ? (
                        <>
                            {/* 文件分析區塊 */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                        <FileText className="w-4 h-4" />
                                        文件分析
                                    </h3>
                                    {documentResult && (
                                        <button
                                            onClick={() => {
                                                clearDocument();
                                                setShowDocumentAnalysis(false);
                                            }}
                                            className="text-xs text-red-500 hover:text-red-700"
                                        >
                                            清除分析
                                        </button>
                                    )}
                                    {!documentResult && (
                                        <button
                                            onClick={() => setShowDocumentAnalysis(!showDocumentAnalysis)}
                                            className="text-xs text-indigo-600 hover:text-indigo-800"
                                        >
                                            {showDocumentAnalysis ? "收起" : "展開"}
                                        </button>
                                    )}
                                </div>

                                {(showDocumentAnalysis || documentResult) && (
                                    <>
                                        {!documentResult ? (
                                            <DocumentUploader
                                                onAnalyze={handleAnalyzeDocument}
                                                isAnalyzing={isAnalyzingDocument}
                                                analysisPhase={documentAnalysisPhase}
                                                disabled={isAnalyzingDocument}
                                            />
                                        ) : (
                                            <DocumentScenes
                                                documentResult={documentResult}
                                                onUpdateScene={updateScene}
                                                onRemoveScene={removeScene}
                                                onGenerateScene={handleGenerateScene}
                                                onGenerateAll={handleGenerateAllScenes}
                                                onClear={clearDocument}
                                                isGenerating={isGenerating}
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            {!documentResult && <div className="h-px bg-slate-200 my-2"></div>}

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

                            <div className="h-px bg-slate-200 my-2"></div>

                            <ScriptEditor
                                userScript={userScript}
                                onUserScriptChange={setUserScript}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => setTimeout(() => setIsInputFocused(false), 100)}
                                aspectRatio={aspectRatio}
                                onAspectRatioChange={setAspectRatio}
                                imageSize={imageSize}
                                onImageSizeChange={setImageSize}
                                isGenerating={isGenerating}
                                onGenerate={generateInfographic}
                            />
                        </>
                    ) : activeTab === 'styles' ? (
                        <StyleLibrary
                            savedStyles={savedStyles}
                            isSearching={isSearching}
                            searchQuery={searchQuery}
                            onSearchChange={(value) => {
                                setSearchQuery(value);
                                searchStyles(value);
                            }}
                            onApplyStyle={applySavedStyle}
                            onDeleteStyle={deleteSavedStyle}
                        />
                    ) : (
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
                    )}
                </div>
            </div>

            {/* Right Main Panel - Preview */}
            <div className={`w-full md:flex-1 bg-slate-100 p-4 md:p-8 flex-col items-center justify-center relative overflow-hidden order-2 shadow-inner transition-all duration-300 ${isInputFocused ? 'hidden md:flex' : 'flex h-[40%] md:h-full'}`}>

                {/* Decorative Grid Background */}
                <div className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }}>
                </div>

                <div className="max-w-4xl w-full flex flex-col gap-6 relative z-10">

                    <ImagePreview
                        generatedImage={generatedImage}
                        isGenerating={isGenerating}
                        analyzedStyle={analyzedStyle}
                        onDownload={handleDownload}
                    />

                </div>
            </div>

        </div>
    );
}
