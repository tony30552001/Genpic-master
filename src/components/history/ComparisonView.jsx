import React, { useState } from 'react';
import { X, ArrowRightLeft, MoveHorizontal } from 'lucide-react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

export default function ComparisonView({ item1, item2, onClose }) {
    const [viewMode, setViewMode] = useState('slider'); // 'slider' | 'side-by-side'

    if (!item1 || !item2) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                            歷史紀錄比對
                        </h2>
                        <p className="text-xs text-slate-500">比較兩次生成的差異</p>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setViewMode('slider')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'slider'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                滑動比對
                            </button>
                            <button
                                onClick={() => setViewMode('side-by-side')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'side-by-side'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                並排顯示
                            </button>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex flex-col lg:flex-row">

                    {/* Visual Comparison Area */}
                    <div className="flex-1 bg-slate-50 relative flex items-center justify-center p-4 overflow-hidden">
                        {viewMode === 'slider' ? (
                            <div className="w-full h-full max-h-[70vh] flex items-center justify-center">
                                <ReactCompareSlider
                                    itemOne={<ReactCompareSliderImage src={item1.imageUrl} alt="Image 1" />}
                                    itemTwo={<ReactCompareSliderImage src={item2.imageUrl} alt="Image 2" />}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    className="rounded-xl shadow-lg border border-slate-200"
                                />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4 w-full h-full">
                                <div className="flex flex-col gap-2 h-full">
                                    <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                                        <img src={item1.imageUrl} className="absolute inset-0 w-full h-full object-contain" alt="1" />
                                        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                            舊版本 (左/上)
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 h-full">
                                    <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                                        <img src={item2.imageUrl} className="absolute inset-0 w-full h-full object-contain" alt="2" />
                                        <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded backdrop-blur-sm">
                                            新版本 (右/下)
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Info Side Panel */}
                    <div className="w-full lg:w-96 bg-white border-l border-slate-100 flex flex-col min-h-0 overflow-y-auto">
                        <div className="p-5 space-y-6">

                            {/* Item 1 Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    <h3 className="text-sm font-bold text-slate-800">版本 A (左/上)</h3>
                                    <span className="text-xs text-slate-400 ml-auto">
                                        {new Date(item1.createdAt?.seconds * 1000).toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-2">
                                    <div>
                                        <span className="font-semibold text-slate-700 block mb-1">Prompt (描述)</span>
                                        <p className="line-clamp-4 hover:line-clamp-none transition-all">{item1.userScript}</p>
                                    </div>
                                    {item1.stylePrompt && (
                                        <div className="pt-2 border-t border-slate-200">
                                            <span className="font-semibold text-slate-700 block mb-1">Style (風格)</span>
                                            <p className="line-clamp-3 hover:line-clamp-none transition-all text-slate-500">{item1.stylePrompt}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-center text-slate-300">
                                <MoveHorizontal className="w-5 h-5" />
                            </div>

                            {/* Item 2 Info */}
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                                    <h3 className="text-sm font-bold text-slate-800">版本 B (右/下)</h3>
                                    <span className="text-xs text-slate-400 ml-auto">
                                        {new Date(item2.createdAt?.seconds * 1000).toLocaleString()}
                                    </span>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-2">
                                    <div>
                                        <span className="font-semibold text-slate-700 block mb-1">Prompt (描述)</span>
                                        <p className="line-clamp-4 hover:line-clamp-none transition-all">{item2.userScript}</p>
                                    </div>
                                    {item2.stylePrompt && (
                                        <div className="pt-2 border-t border-slate-200">
                                            <span className="font-semibold text-slate-700 block mb-1">Style (風格)</span>
                                            <p className="line-clamp-3 hover:line-clamp-none transition-all text-slate-500">{item2.stylePrompt}</p>
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
