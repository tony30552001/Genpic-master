import React from "react";
import {
    Languages,
    Check,
    Cpu,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import LineSettings from "./LineSettings";
import useLineConfig from "../../hooks/useLineConfig";
import { DEFAULT_IMAGE_MODEL, IMAGE_MODEL_OPTIONS } from "../../config";

const LANGUAGE_OPTIONS = [
    {
        id: "en",
        label: "English",
        labelZh: "英文",
        code: "EN",
        description: "Generate images with English text, suitable for international use.",
    },
    {
        id: "zh-TW",
        label: "繁體中文",
        labelZh: "繁體中文",
        code: "繁",
        description: "生成包含繁體中文文字的圖片，適合台灣市場。",
    },
    {
        id: "zh-CN",
        label: "简体中文",
        labelZh: "簡體中文",
        code: "简",
        description: "生成包含简体中文文字的图片，适合中国大陆市场。",
    },
    {
        id: "ja",
        label: "日本語",
        labelZh: "日文",
        code: "日",
        description: "日本語のテキストを含む画像を生成します。",
    },
    {
        id: "ko",
        label: "한국어",
        labelZh: "韓文",
        code: "韓",
        description: "한국어 텍스트가 포함된 이미지를 생성합니다.",
    },
    {
        id: "es",
        label: "Español",
        labelZh: "西班牙文",
        code: "ES",
        description: "Generar imágenes con texto en español.",
    },
    {
        id: "fr",
        label: "Français",
        labelZh: "法文",
        code: "FR",
        description: "Générer des images avec du texte en français.",
    },
    {
        id: "de",
        label: "Deutsch",
        labelZh: "德文",
        code: "DE",
        description: "Bilder mit deutschem Text generieren.",
    },
    {
        id: "none",
        label: "No Text",
        labelZh: "無文字",
        code: "無",
        description: "圖片中不包含任何文字，純圖像模式。",
    },
];

const findImageModel = (modelId) =>
    IMAGE_MODEL_OPTIONS.find((model) => model.id === modelId)
    || IMAGE_MODEL_OPTIONS.find((model) => model.id === DEFAULT_IMAGE_MODEL)
    || IMAGE_MODEL_OPTIONS[0];

/**
 * 設定面板 — 全域生成偏好與整合設定
 */
export default function SettingsPanel({ imageLanguage, onImageLanguageChange, imageModel, onImageModelChange, user }) {
    const currentLang = LANGUAGE_OPTIONS.find((l) => l.id === imageLanguage) || LANGUAGE_OPTIONS[0];
    const currentModel = findImageModel(imageModel);
    const lineConfigHook = useLineConfig({ user });

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 lg:py-8">
            <div className="max-w-3xl space-y-2">
                <Badge variant="outline" className="w-fit text-[11px]">
                    Settings
                </Badge>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    生成與整合設定
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    管理全域圖片生成偏好、輸出語系與分享整合。預設模型已調整為 Nano Banana 2；既有使用者的模型選擇會保留。
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="border-border/60 lg:col-span-2">
                    <CardContent className="space-y-6 p-5 sm:p-6">
                        <section className="space-y-4" aria-labelledby="image-model-heading">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Cpu className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <div>
                                        <h3 id="image-model-heading" className="text-base font-semibold text-foreground">
                                            生成偏好
                                        </h3>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            選擇預設圖片模型與輸出文字語系。
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="w-fit text-[11px]">
                                    目前模型：{currentModel.label}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2" role="group" aria-label="圖片生成模型">
                                {IMAGE_MODEL_OPTIONS.map((model) => {
                                    const isSelected = currentModel.id === model.id;
                                    const isDefault = model.id === DEFAULT_IMAGE_MODEL;

                                    return (
                                        <button
                                            type="button"
                                            key={model.id}
                                            onClick={() => onImageModelChange(model.id)}
                                            aria-pressed={isSelected}
                                            className={cn(
                                                "min-h-[132px] rounded-2xl border p-4 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                isSelected
                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                    : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={cn("text-sm font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                                                            {model.label}
                                                        </span>
                                                        {isDefault && (
                                                            <Badge variant="outline" className="text-[10px]">
                                                                預設
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs leading-relaxed text-muted-foreground">
                                                        {model.description}
                                                    </p>
                                                </div>
                                                {isSelected && (
                                                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {model.sizes.map((size) => (
                                                    <Badge key={size} variant="secondary" className="text-[10px]">
                                                        {size}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                Nano Banana 2 可手動選擇 1K / 2K / 4K；GPT Image 2 會依圖片比例自動映射最佳像素尺寸。
                            </p>
                        </section>

                        <section className="space-y-4 border-t border-border/60 pt-5" aria-labelledby="image-language-heading">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Languages className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <div>
                                        <h3 id="image-language-heading" className="text-base font-semibold text-foreground">
                                            圖片文字語系
                                        </h3>
                                        <p className="text-sm leading-relaxed text-muted-foreground">
                                            決定生成圖片中標題、標籤與說明文字的語言。
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="w-fit text-[11px]">
                                    目前語系：{currentLang.label}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 md:grid-cols-3" role="group" aria-label="圖片文字語系">
                                {LANGUAGE_OPTIONS.map((lang) => {
                                    const isSelected = currentLang.id === lang.id;

                                    return (
                                        <button
                                            type="button"
                                            key={lang.id}
                                            onClick={() => onImageLanguageChange(lang.id)}
                                            aria-pressed={isSelected}
                                            className={cn(
                                                "min-h-[76px] rounded-xl border p-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                                isSelected
                                                    ? "border-primary bg-primary/5 shadow-sm"
                                                    : "border-border/60 hover:border-primary/40 hover:bg-muted/40"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold",
                                                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                                )}>
                                                    {lang.code}
                                                </span>
                                                <span className={cn("text-xs font-semibold", isSelected ? "text-primary" : "text-foreground")}>
                                                    {lang.label}
                                                </span>
                                                {isSelected && (
                                                    <Check className="ml-auto h-3.5 w-3.5 text-primary" aria-hidden="true" />
                                                )}
                                            </div>
                                            <p className="mt-1.5 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
                                                {lang.description}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="rounded-xl bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                                Prompt 會自動附加語言指令；選擇「無文字」會要求模型避免輸出任何文字、標籤或標題。
                            </p>
                        </section>
                    </CardContent>
                </Card>

                <aside className="space-y-3">
                    <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">分享與整合</h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                            綁定 LINE 官方帳號後，可在分享流程中直接推送圖片。
                        </p>
                    </div>
                    <LineSettings useLineConfigHook={lineConfigHook} />
                </aside>
            </div>
        </div>
    );
}
