import React, { useState, useEffect } from 'react';
import {
    Upload,
    Image as ImageIcon,
    Wand2,
    Save,
    History,
    Layout,
    Loader2,
    Trash2,
    Palette,
    FileText,
    AlertCircle,
    X,
    Tag,
    Bookmark,
    Plus
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
    signInWithCustomToken,
    OAuthProvider,
    signInWithPopup,
    signOut
} from 'firebase/auth';
import { LogIn, LogOut, User as UserIcon } from 'lucide-react';
import {
    getFirestore,
    collection,
    addDoc,
    query,
    orderBy,
    onSnapshot,
    deleteDoc,
    doc,
    serverTimestamp
} from 'firebase/firestore';

// Import local configuration
import {
    firebaseConfig as defaultFirebaseConfig,
    APP_ID,
    GEMINI_API_KEY,
    GEMINI_MODEL_ANALYSIS,
    GEMINI_MODEL_GENERATION
} from './config';

// --- Firebase Configuration & Initialization ---
const getFirebaseConfig = () => {
    // Try to use global injected variable (production/embedded)
    if (typeof window !== 'undefined' && window.__firebase_config) {
        return JSON.parse(window.__firebase_config);
    }
    // Try to use globally defined variable directly (user code style)
    try {
        if (typeof __firebase_config !== 'undefined') {
            return JSON.parse(__firebase_config);
        }
    } catch (e) { }

    return defaultFirebaseConfig;
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const getAppId = () => {
    if (typeof window !== 'undefined' && window.__app_id) return window.__app_id;
    try {
        if (typeof __app_id !== 'undefined') return __app_id;
    } catch (e) { }
    return APP_ID;
};
const appId = getAppId();

export default function InfographicGenerator() {
    // --- State Management ---
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('create'); // 'create', 'history', 'styles'

    // Input States
    const [referenceImage, setReferenceImage] = useState(null); // The file object
    const [referencePreview, setReferencePreview] = useState(null); // Base64 for preview

    const [analyzedStyle, setAnalyzedStyle] = useState(''); // The AI extracted style prompt (English)
    const [analysisResultData, setAnalysisResultData] = useState(null); // Full JSON result (Chinese desc, tags)

    const [userScript, setUserScript] = useState(''); // The user's content text

    // Style Saving States
    const [savedStyles, setSavedStyles] = useState([]);
    const [newStyleName, setNewStyleName] = useState('');
    const [newStyleTags, setNewStyleTags] = useState('');
    const [isSavingStyle, setIsSavingStyle] = useState(false);

    // Process States
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);
    const [errorMsg, setErrorMsg] = useState('');

    // API Key (Use config or empty string)
    const apiKey = GEMINI_API_KEY || "";

    // --- Auth Functions ---
    const handleMicrosoftLogin = async () => {
        const provider = new OAuthProvider('microsoft.com');

        // 如果有設定 Tenant ID，則強制限制為該組織登入
        const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID;
        if (tenantId) {
            provider.setCustomParameters({
                tenant: tenantId
            });
        }

        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Microsoft Login Error:", error);
            setErrorMsg(`登入失敗: ${error.message}`);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            // Auto login as anonymous for browsing usage
            await signInAnonymously(auth);
        } catch (error) {
            console.error("Logout Error:", error);
        }
    };

    // --- Auth & Data Loading ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            // Only auto-sign-in anonymously if absolutely no user session exists
            if (!currentUser) {
                try {
                    let token = null;
                    if (typeof window !== 'undefined' && window.__initial_auth_token) token = window.__initial_auth_token;

                    if (token) {
                        await signInWithCustomToken(auth, token);
                    } else {
                        // Fallback to anonymous:
                        // Check if we just logged out deliberately? 
                        // For now, simpler to just keep app usable.
                        await signInAnonymously(auth);
                    }
                } catch (err) {
                    console.error("Anon Auth failed:", err);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Fetch History & Styles
    useEffect(() => {
        if (!user || !appId) return;

        // Fetch History
        const qHistory = query(
            collection(db, 'artifacts', appId, 'users', user.uid, 'infographics'),
            orderBy('createdAt', 'desc')
        );
        const unsubHistory = onSnapshot(qHistory, (snapshot) => {
            setHistoryItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // Fetch Saved Styles
        const qStyles = query(
            collection(db, 'artifacts', appId, 'users', user.uid, 'styles'),
            orderBy('createdAt', 'desc')
        );
        const unsubStyles = onSnapshot(qStyles, (snapshot) => {
            setSavedStyles(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubHistory();
            unsubStyles();
        };
    }, [user, appId]);

    // --- Helper Functions ---

    // Compress image for Firestore storage (limit 1MB)
    const compressImage = (dataUrl) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Scale down if necessary (max 800px width is usually enough for history)
                const maxWidth = 800;
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to JPEG with compression (0.6 quality) to ensure small size
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
                resolve(compressedDataUrl);
            };
            img.onerror = (err) => reject(err);
        });
    };

    // --- Core Logic Functions ---

    // 1. Image Upload & Pre-processing
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Check size (simple limit ~4MB for API safety)
        if (file.size > 4 * 1024 * 1024) {
            setErrorMsg("圖片過大，請上傳小於 4MB 的圖片。");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setReferenceImage(file);
            setReferencePreview(reader.result);
            setAnalyzedStyle(''); // Reset style when new image uploaded
            setAnalysisResultData(null);
            setErrorMsg('');
        };
        reader.readAsDataURL(file);
    };

    // New function to clear reference
    const handleClearReference = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        setReferenceImage(null);
        setReferencePreview(null);
        setAnalyzedStyle('');
        setAnalysisResultData(null);
        // We intentionally keep userScript so user doesn't lose their text
    };

    // 2. Analyze Style (Using Gemini Multimodal)
    const analyzeImageStyle = async () => {
        if (!referencePreview) {
            setErrorMsg("請先上傳參考圖片。");
            return;
        }

        if (!apiKey) {
            setErrorMsg("請先於 config.js 設定 API Key。");
            return;
        }

        setIsAnalyzing(true);
        setErrorMsg('');

        try {
            const base64Data = referencePreview.split(',')[1];

            // Updated Prompt: Ask for JSON with both style (English & Chinese) and content
            // Note: We ask for Traditional Chinese explicitly
            const promptText = `請擔任專業視覺分析師。請分析這張圖片並回傳一個 JSON 物件，包含以下欄位：
      1. "style_prompt": (英文) 詳細描述圖片的視覺風格、藝術流派、配色方案、光影與材質、構圖特徵。這將用於生成類似風格圖片的 Image Gen Prommpt。
      2. "style_description_zh": (繁體中文) 以優美的文字，詳細描述此風格的視覺特徵、帶給人的感受、適合的使用場景。這將呈現給使用者看作為風格介紹。
      3. "image_content": (繁體中文) 詳細描述圖片中的具體內容、發生的劇情、人物動作、場景細節。這將作為預設的劇情腳本。
      4. "suggested_tags": (Array of Strings) 針對此風格建議的 3-5 個繁體中文標籤 (Tags)。`;

            // Using configured model
            const modelName = GEMINI_MODEL_ANALYSIS;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [
                            { text: promptText },
                            { inlineData: { mimeType: "image/png", data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error('Analysis failed: ' + (errData.error?.message || response.statusText));
            }

            const result = await response.json();
            const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;

            // Parse JSON result
            const analysisResult = JSON.parse(responseText);

            setAnalyzedStyle(analysisResult.style_prompt);
            setAnalysisResultData(analysisResult);
            setUserScript(analysisResult.image_content);

            // Auto-fill tags if suggested
            if (analysisResult.suggested_tags && Array.isArray(analysisResult.suggested_tags)) {
                setNewStyleTags(analysisResult.suggested_tags.join(', '));
            }

        } catch (err) {
            console.error(err);
            setErrorMsg("圖片分析失敗，請確認圖片或 API Key 設定。");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // --- Style Management Functions ---
    const saveCurrentStyle = async () => {
        if (!user || !analyzedStyle) return;
        if (!newStyleName.trim()) {
            setErrorMsg("請輸入風格名稱");
            return;
        }

        setIsSavingStyle(true);
        try {
            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'styles'), {
                name: newStyleName,
                tags: newStyleTags.split(/[,，]/).map(t => t.trim()).filter(Boolean),
                prompt: analyzedStyle,
                description: analysisResultData?.style_description_zh || '',
                previewUrl: referencePreview || '',
                createdAt: serverTimestamp()
            });
            setNewStyleName('');
            setNewStyleTags('');
            alert('風格已儲存！');
        } catch (err) {
            console.error("Save style failed:", err);
            setErrorMsg("儲存風格失敗");
        } finally {
            setIsSavingStyle(false);
        }
    };

    const deleteSavedStyle = async (id, e) => {
        e.stopPropagation();
        if (!user || !confirm('確定要刪除此風格收藏嗎？')) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'styles', id));
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
        setActiveTab('create');
    };

    // 3. Generate Image (Using Imagen)
    const generateInfographic = async () => {
        if (!userScript) {
            setErrorMsg("請輸入您想要生成的內容或劇情。");
            return;
        }

        if (!apiKey) {
            setErrorMsg("請先於 config.js 設定 API Key。");
            return;
        }

        setIsGenerating(true);
        setErrorMsg('');

        try {
            // Combine analyzed style with user script
            const finalPrompt = `Create an image with the following style: ${analyzedStyle || "High quality, professional corporate style"}. The content/subject of the image is: ${userScript}. Ensure the composition is suitable for an infographic or presentation slide.`;

            // Using configured model
            const modelName = GEMINI_MODEL_GENERATION;
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:predict?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instances: [{ prompt: finalPrompt }],
                    parameters: { sampleCount: 1, aspectRatio: "16:9" }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error('Image generation failed: ' + (errData.error?.message || response.statusText));
            }

            const result = await response.json();
            const base64Image = result.predictions[0].bytesBase64Encoded;
            const imageUrl = `data:image/png;base64,${base64Image}`;

            setGeneratedImage(imageUrl);

            // Auto-save to history
            saveToHistory(imageUrl, finalPrompt);

        } catch (err) {
            console.error(err);
            // Show the actual error message from the API if available
            setErrorMsg(`圖片生成失敗: ${err.message || "請確認您有 Imagen API 使用權限"}`);
        } finally {
            setIsGenerating(false);
        }
    };

    // 4. Save to Firestore
    const saveToHistory = async (imgUrl, promptUsed) => {
        if (!user) return;
        try {
            // Compress image before saving to avoid Firestore 1MB limit
            const compressedUrl = await compressImage(imgUrl);

            await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'infographics'), {
                imageUrl: compressedUrl,
                userScript: userScript,
                stylePrompt: analyzedStyle,
                fullPrompt: promptUsed,
                createdAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Save failed:", err);
            // Warning only, don't block user
            // setErrorMsg("警告：圖片無法儲存到歷史紀錄。");
        }
    };

    const deleteHistoryItem = async (id) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'infographics', id));
        } catch (err) {
            console.error("Delete failed:", err);
        }
    };

    const loadFromHistory = (item) => {
        setUserScript(item.userScript);
        setAnalyzedStyle(item.stylePrompt);
        setGeneratedImage(item.imageUrl);
        setActiveTab('create');
    };

    // --- Render Components ---

    return (
        <div className="flex h-screen bg-slate-50 text-slate-800 font-sans overflow-hidden">

            {/* Left Sidebar - Controls */}
            <div className="w-1/3 min-w-[350px] bg-white border-r border-slate-200 flex flex-col h-full shadow-lg z-10">

                {/* Header */}
                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-xl font-bold flex items-center gap-2">
                                <Layout className="w-6 h-6" />
                                企業風格圖產生器
                            </h1>
                            <p className="text-xs text-indigo-100 mt-1 opacity-80">
                                Powered by Gemini & Imagen
                            </p>
                        </div>
                        {/* Auth Status/Button */}
                        <div className="ml-4">
                            {user && !user.isAnonymous ? (
                                <div className="flex items-center gap-3 bg-white/10 px-3 py-1.5 rounded-full border border-white/20 backdrop-blur-sm">
                                    <div className="flex flex-col items-end">
                                        <span className="text-xs font-bold leading-none mb-0.5">{user.displayName || "User"}</span>
                                        <button onClick={handleLogout} className="text-[10px] opacity-80 hover:opacity-100 hover:text-red-200 transition-colors flex items-center gap-1">
                                            <LogOut className="w-2.5 h-2.5" /> 登出
                                        </button>
                                    </div>
                                    <div className="w-9 h-9 rounded-full bg-indigo-200 flex items-center justify-center text-sm font-bold text-indigo-700 border-2 border-white/30 overflow-hidden shadow-inner">
                                        {user.photoURL ? <img src={user.photoURL} alt="User" className="w-full h-full object-cover" /> : (user.displayName?.[0] || 'U')}
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={handleMicrosoftLogin}
                                    className="bg-white text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                                    title="使用公司帳號登入以同步紀錄"
                                >
                                    <LogIn className="w-4 h-4" /> 登入
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'create' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Wand2 className="w-4 h-4" /> 製作區
                    </button>
                    <button
                        onClick={() => setActiveTab('styles')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'styles' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Bookmark className="w-4 h-4" /> 風格庫
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${activeTab === 'history' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50' : 'text-slate-500 hover:text-slate-700'}`}
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

                    {activeTab === 'create' ? (
                        <>
                            {/* Step 1: Style Upload */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</div>
                                    上傳風格範例圖
                                </div>

                                <div className="relative group">
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className={`border-2 border-dashed rounded-xl p-4 transition-all text-center ${referencePreview ? 'border-indigo-300 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'}`}>
                                        {referencePreview ? (
                                            <div className="relative h-32 w-full">
                                                <img src={referencePreview} alt="Reference" className="h-full w-full object-contain rounded-md" />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md pointer-events-none">
                                                    <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">點擊更換</span>
                                                </div>
                                                {/* Clear Button - z-index higher than input */}
                                                <button
                                                    onClick={handleClearReference}
                                                    className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded-full p-1.5 shadow-md z-20 transition-all transform hover:scale-110"
                                                    title="移除圖片與風格"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="py-8 flex flex-col items-center text-slate-400">
                                                <Upload className="w-8 h-8 mb-2" />
                                                <span className="text-sm">點擊上傳或拖曳圖片</span>
                                                <span className="text-xs mt-1">支援 JPG, PNG</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <button
                                    onClick={analyzeImageStyle}
                                    disabled={!referencePreview || isAnalyzing}
                                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
                                >
                                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
                                    {isAnalyzing ? '正在全方位分析...' : '解析風格與內容'}
                                </button>

                                {analyzedStyle && (
                                    <div className="bg-white border border-indigo-100 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 relative">
                                        <div className="flex items-start justify-between">
                                            <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
                                                <Wand2 className="w-4 h-4" />
                                                {analysisResultData?.style_name || '風格分析結果'}
                                            </h3>
                                            <button
                                                onClick={() => setAnalyzedStyle('')}
                                                className="text-slate-400 hover:text-slate-600"
                                                title="清除風格"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <div className="text-xs leading-relaxed text-slate-600 bg-indigo-50/50 p-3 rounded-lg border border-indigo-50">
                                            {analysisResultData?.style_description_zh || analyzedStyle}
                                        </div>

                                        {analysisResultData?.suggested_tags && (
                                            <div className="flex flex-wrap gap-1">
                                                {analysisResultData.suggested_tags.map((tag, i) => (
                                                    <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full flex items-center gap-1">
                                                        <Tag className="w-2.5 h-2.5" /> {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="pt-2 border-t border-slate-100 space-y-2">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={newStyleName}
                                                    onChange={(e) => setNewStyleName(e.target.value)}
                                                    placeholder="為此風格命名..."
                                                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:border-indigo-500 outline-none"
                                                />
                                                <button
                                                    onClick={saveCurrentStyle}
                                                    disabled={isSavingStyle}
                                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    {isSavingStyle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                    收藏
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={newStyleTags}
                                                onChange={(e) => setNewStyleTags(e.target.value)}
                                                placeholder="標籤 (以逗號分隔)..."
                                                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="h-px bg-slate-200 my-2"></div>

                            {/* Step 2: Content Input */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</div>
                                    輸入內容劇情
                                </div>

                                <textarea
                                    value={userScript}
                                    onChange={(e) => setUserScript(e.target.value)}
                                    placeholder="例如：一位穿著西裝的員工正在向團隊展示數據圖表，背景是現代化的辦公室，氣氛積極向上..."
                                    className="w-full h-64 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-y bg-white transition-all"
                                />

                                <button
                                    onClick={generateInfographic}
                                    disabled={!userScript || isGenerating}
                                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 transform active:scale-[0.98]"
                                >
                                    {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
                                    {isGenerating ? 'AI 生成中...' : '開始生成圖片'}
                                </button>
                            </div>
                        </>
                    ) : activeTab === 'styles' ? (
                        // Style Library Tab
                        <div className="space-y-4">
                            {savedStyles.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm flex flex-col items-center gap-2">
                                    <Bookmark className="w-8 h-8 opacity-50" />
                                    尚未收藏任何風格
                                </div>
                            ) : (
                                savedStyles.map((style) => (
                                    <div key={style.id} className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-md transition-all group relative cursor-pointer" onClick={() => applySavedStyle(style)}>
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-slate-700 text-sm">{style.name}</h4>
                                            <button
                                                onClick={(e) => deleteSavedStyle(style.id, e)}
                                                className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
                                            {style.description || "無描述"}
                                        </p>
                                        {style.tags && style.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-2">
                                                {style.tags.map((tag, i) => (
                                                    <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="text-[10px] text-indigo-500 font-medium flex items-center gap-1 mt-2">
                                            點擊套用此風格 <Plus className="w-3 h-3" />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        // History Tab
                        <div className="space-y-4">
                            {historyItems.length === 0 ? (
                                <div className="text-center py-10 text-slate-400 text-sm">
                                    尚無生成紀錄
                                </div>
                            ) : (
                                historyItems.map((item) => (
                                    <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
                                        <div className="aspect-video w-full bg-slate-100 relative cursor-pointer" onClick={() => loadFromHistory(item)}>
                                            <img src={item.imageUrl} alt="Generated" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                        </div>
                                        <div className="p-3">
                                            <p className="text-xs text-slate-500 mb-2 line-clamp-2">{item.userScript}</p>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] text-slate-400">
                                                    {item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toLocaleDateString() : '剛剛'}
                                                </span>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => loadFromHistory(item)}
                                                        className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-md transition-colors"
                                                        title="Reuse Style"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => deleteHistoryItem(item.id)}
                                                        className="p-1.5 hover:bg-red-50 text-red-500 rounded-md transition-colors"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Right Main Panel - Preview */}
            <div className="flex-1 bg-slate-100 p-8 flex flex-col items-center justify-center relative overflow-hidden">

                {/* Decorative Grid Background */}
                <div className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }}>
                </div>

                <div className="max-w-4xl w-full flex flex-col gap-6 relative z-10">

                    {/* Main Preview Card */}
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col min-h-[500px]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-indigo-500" />
                                <span className="font-semibold text-slate-700">生成預覽</span>
                            </div>
                            {generatedImage && (
                                <button
                                    onClick={() => {
                                        // Create a link element, set the href to the blob or data URL, and click it
                                        const link = document.createElement('a');
                                        link.href = generatedImage;
                                        link.download = `generated-infographic-${Date.now()}.png`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }}
                                    className="flex items-center gap-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
                                >
                                    <Save className="w-3.5 h-3.5" /> 下載圖片
                                </button>
                            )}
                        </div>

                        <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
                            {generatedImage ? (
                                <img
                                    src={generatedImage}
                                    alt="AI Result"
                                    className="max-w-full max-h-[600px] object-contain shadow-lg rounded-lg animate-in fade-in zoom-in-95 duration-500"
                                />
                            ) : (
                                <div className="text-center text-slate-400">
                                    {isGenerating ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="relative">
                                                <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <Wand2 className="w-6 h-6 text-indigo-500 animate-pulse" />
                                                </div>
                                            </div>
                                            <p className="text-lg font-medium text-slate-600">正在繪製您的構想...</p>
                                            <p className="text-sm">這通常需要 5-10 秒鐘</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4 opacity-50">
                                            <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center">
                                                <ImageIcon className="w-12 h-12 text-slate-400" />
                                            </div>
                                            <p className="text-lg">請在左側面板上傳參考圖並輸入內容</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Info Footer */}
                        {generatedImage && analyzedStyle && (
                            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-xs text-slate-500">
                                <p className="font-semibold mb-1 text-slate-700">使用風格：</p>
                                <p className="line-clamp-2">{analyzedStyle}</p>
                            </div>
                        )}
                    </div>

                </div>
            </div>

        </div>
    );
}
