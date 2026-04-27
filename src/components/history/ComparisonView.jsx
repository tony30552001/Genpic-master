import React, { useState } from 'react';
import { X, ArrowRightLeft, MoveHorizontal } from 'lucide-react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

export default function ComparisonView({ item1, item2, onClose }) {
    const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'side-by-side'

    if (!item1 || !item2) return null;

    const formatDate = (seconds) =>
        seconds ? new Intl.DateTimeFormat("zh-TW", {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(new Date(seconds * 1000)) : "剛剛";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
                    <div>
                        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-primary" aria-hidden="true" />
                            歷史紀錄比對
                        </h2>
                        <p className="text-xs text-muted-foreground">比較兩次生成的差異</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-muted p-1 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setViewMode('slider')}
                                aria-pressed={viewMode === 'slider'}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${viewMode === 'slider'
                                        ? 'bg-background text-primary shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                滑動比對
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('side-by-side')}
                                aria-pressed={viewMode === 'side-by-side'}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${viewMode === 'side-by-side'
                                        ? 'bg-background text-primary shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                並排顯示
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label="關閉歷史紀錄比對"
                        >
                            <X className="w-5 h-5" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

                    {/* Visual Comparison Area */}
                    <div className="flex-1 bg-muted/50 relative flex items-center justify-center p-4 overflow-hidden">
                        {viewMode === 'slider' ? (
                            <div className="w-full h-full max-h-[70vh] flex items-center justify-center">
                                <ReactCompareSlider
                                    itemOne={<ReactCompareSliderImage src={item1.imageUrl} alt="Image 1" />}
                                    itemTwo={<ReactCompareSliderImage src={item2.imageUrl} alt="Image 2" />}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    className="rounded-xl shadow-lg border border-border"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 w-full h-full">
                                <div className="flex flex-col gap-2 h-full">
                                    <div className="flex-1 relative rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                                        <img src={item1.imageUrl} width={640} height={360} className="absolute inset-0 w-full h-full object-contain" alt="版本 A 生成圖片" />
                                        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                            舊版本 (左/上)
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 h-full">
                                    <div className="flex-1 relative rounded-xl overflow-hidden border border-border bg-background shadow-sm">
                                        <img src={item2.imageUrl} width={640} height={360} className="absolute inset-0 w-full h-full object-contain" alt="版本 B 生成圖片" />
                                        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                            新版本 (右/下)
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Info Side Panel */}
                    <div className="w-full lg:w-96 bg-card border-l border-border flex flex-col min-h-0 overflow-y-auto">
                        <div className="p-5 space-y-6">

                            {/* Item 1 Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-2 h-2 rounded-full bg-primary" aria-hidden="true"></span>
                                    <h3 className="text-sm font-bold text-foreground">版本 A (左/上)</h3>
                                    <span className="text-xs text-muted-foreground ml-auto">
                                        {formatDate(item1.createdAt?.seconds)}
                                    </span>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg border border-border text-xs text-muted-foreground space-y-2">
                                    <div>
                                        <span className="font-semibold text-foreground block mb-1">Prompt (描述)</span>
                                        <p className="line-clamp-4 hover:line-clamp-none">{item1.userScript}</p>
                                    </div>
                                    {item1.stylePrompt && (
                                        <div className="pt-2 border-t border-border">
                                            <span className="font-semibold text-foreground block mb-1">Style (風格)</span>
                                            <p className="line-clamp-3 hover:line-clamp-none text-muted-foreground">{item1.stylePrompt}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-center text-muted-foreground/40">
                                <MoveHorizontal className="w-5 h-5" aria-hidden="true" />
                            </div>

                            {/* Item 2 Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-2 h-2 rounded-full bg-brand-clay" aria-hidden="true"></span>
                                    <h3 className="text-sm font-bold text-foreground">版本 B (右/下)</h3>
                                    <span className="text-xs text-muted-foreground ml-auto">
                                        {formatDate(item2.createdAt?.seconds)}
                                    </span>
                                </div>
                                <div className="bg-muted/50 p-3 rounded-lg border border-border text-xs text-muted-foreground space-y-2">
                                    <div>
                                        <span className="font-semibold text-foreground block mb-1">Prompt (描述)</span>
                                        <p className="line-clamp-4 hover:line-clamp-none">{item2.userScript}</p>
                                    </div>
                                    {item2.stylePrompt && (
                                        <div className="pt-2 border-t border-border">
                                            <span className="font-semibold text-foreground block mb-1">Style (風格)</span>
                                            <p className="line-clamp-3 hover:line-clamp-none text-muted-foreground">{item2.stylePrompt}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
