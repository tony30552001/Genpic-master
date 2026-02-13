import React from "react";
import {
    Globe,
    Languages,
    Image as ImageIcon,
    Info,
    Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const LANGUAGE_OPTIONS = [
    {
        id: "en",
        label: "English",
        labelZh: "英文",
        flag: "🇺🇸",
        description: "Generate images with English text, suitable for international use.",
    },
    {
        id: "zh-TW",
        label: "繁體中文",
        labelZh: "繁體中文",
        flag: "🇹🇼",
        description: "生成包含繁體中文文字的圖片，適合台灣市場。",
    },
    {
        id: "zh-CN",
        label: "简体中文",
        labelZh: "簡體中文",
        flag: "🇨🇳",
        description: "生成包含简体中文文字的图片，适合中国大陆市场。",
    },
    {
        id: "ja",
        label: "日本語",
        labelZh: "日文",
        flag: "🇯🇵",
        description: "日本語のテキストを含む画像を生成します。",
    },
    {
        id: "ko",
        label: "한국어",
        labelZh: "韓文",
        flag: "🇰🇷",
        description: "한국어 텍스트가 포함된 이미지를 생성합니다.",
    },
    {
        id: "es",
        label: "Español",
        labelZh: "西班牙文",
        flag: "🇪🇸",
        description: "Generar imágenes con texto en español.",
    },
    {
        id: "fr",
        label: "Français",
        labelZh: "法文",
        flag: "🇫🇷",
        description: "Générer des images avec du texte en français.",
    },
    {
        id: "de",
        label: "Deutsch",
        labelZh: "德文",
        flag: "🇩🇪",
        description: "Bilder mit deutschem Text generieren.",
    },
    {
        id: "none",
        label: "No Text",
        labelZh: "無文字",
        flag: "🚫",
        description: "圖片中不包含任何文字，純圖像模式。",
    },
];

/**
 * 設定面板 — 全域語系選擇
 * 控制生成圖片中文字的語言
 */
export default function SettingsPanel({ imageLanguage, onImageLanguageChange }) {
    const currentLang = LANGUAGE_OPTIONS.find((l) => l.id === imageLanguage) || LANGUAGE_OPTIONS[0];

    return (
        <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            {/* 標題 */}
            <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    生成設定
                </h2>
                <p className="text-sm text-muted-foreground">
                    配置全域的圖片生成偏好設定
                </p>
            </div>

            {/* 語系設定 */}
            <Card className="border-border/60">
                <CardContent className="p-5 space-y-4">
                    {/* 區塊標題 */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Languages className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-sm text-foreground">圖片文字語系</h3>
                            <p className="text-xs text-muted-foreground">
                                決定 AI 生成圖片中顯示文字的語言
                            </p>
                        </div>
                    </div>

                    {/* 目前選擇 */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
                        <span className="text-lg">{currentLang.flag}</span>
                        <span className="text-sm font-medium text-foreground">{currentLang.label}</span>
                        <Badge variant="outline" className="text-[10px] ml-auto">
                            目前選擇
                        </Badge>
                    </div>

                    {/* 語系選項列表 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {LANGUAGE_OPTIONS.map((lang) => {
                            const isSelected = imageLanguage === lang.id;
                            return (
                                <button
                                    key={lang.id}
                                    onClick={() => onImageLanguageChange(lang.id)}
                                    className={`text-left p-3 rounded-xl border-2 transition-all duration-200 group ${isSelected
                                            ? "border-primary bg-primary/5 shadow-sm"
                                            : "border-border/40 hover:border-primary/40 hover:bg-muted/50"
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-lg">{lang.flag}</span>
                                        <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                                            {lang.label}
                                        </span>
                                        {isSelected && (
                                            <Check className="w-4 h-4 text-primary ml-auto" />
                                        )}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">
                                        {lang.description}
                                    </p>
                                </button>
                            );
                        })}
                    </div>

                    {/* 說明 */}
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/50 rounded-lg border border-border/30">
                        <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="text-xs text-muted-foreground space-y-1">
                            <p>
                                <strong>語系設定影響：</strong>
                            </p>
                            <ul className="list-disc list-inside space-y-0.5 ml-1">
                                <li>AI 生成圖片中出現的文字標題和說明會使用所選語言</li>
                                <li>Prompt 會自動附加語言指令，引導 AI 使用對應語言產出</li>
                                <li>選擇「無文字」模式會指示 AI 不在圖片中放置任何文字</li>
                            </ul>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
