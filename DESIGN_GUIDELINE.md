# GenPic Master — Design Guideline (shadcn/ui Edition)

> 版本 v2.0 | 最後更新：2026-02-10  
> 此文件定義了 GenPic Master 的視覺設計語言、元件規範與互動模式。  
> **UI 元件層基於 [shadcn/ui](https://ui.shadcn.com)**，搭配 Tailwind CSS Variables 主題系統。

---

## 一、設計原則 (Design Principles)

| 原則 | 說明 | 實踐範例 |
|:---|:---|:---|
| **專業信賴感** | 企業級產品需傳達穩重與專業，避免過度花俏 | 使用中性色搭配單一品牌主色；避免超過 3 種飽和色同時出現 |
| **漸進式揭露** | 將複雜功能拆成步驟引導，降低認知負荷 | Step 1→2→3 的分鏡製作流程；非當前步驟的控制項折疊 |
| **效率優先** | 核心使用者是企業員工，操作效率 > 視覺裝飾 | 快捷鍵、拖放上傳、一鍵套用風格 |
| **一致性** | 同類元素在所有頁面表現一致 | 統一使用 shadcn/ui 元件 variants，避免自訂 one-off 樣式 |
| **無障礙** | 滿足 WCAG 2.1 AA 級以上對比度 | shadcn/ui 元件內建 ARIA 支援；文字 / 背景對比度 ≥ 4.5:1 |
| **可組合** | 元件是無狀態 primitives，由 composition 組裝功能 | 使用 `cn()` 合併樣式；用 `cva` 定義 variants |

---

## 二、技術架構 (UI Stack)

| 層級 | 技術 | 說明 |
|:---|:---|:---|
| **元件庫** | [shadcn/ui](https://ui.shadcn.com) | Copy-paste 元件，完全擁有原始碼，可自訂 |
| **Primitive 層** | [Radix UI](https://www.radix-ui.com) | shadcn/ui 底層的無樣式無障礙 primitives |
| **樣式引擎** | [Tailwind CSS v3](https://tailwindcss.com) | Utility-first CSS，搭配 CSS Variables |
| **Variant 管理** | [cva](https://cva.style) (class-variance-authority) | 定義元件的 variant / size 等可選樣式 |
| **Class 合併** | `cn()` = `clsx` + `tailwind-merge` | 智慧合併 Tailwind class，解決衝突 |
| **圖標** | [Lucide React](https://lucide.dev) | 一致的 1.5px stroke 風格 |
| **動畫** | [tailwindcss-animate](https://github.com/jamiebuilds/tailwindcss-animate) | shadcn/ui 的動畫基礎 |

### 2.1 關鍵路徑

```
src/
├── components/
│   └── ui/          ← shadcn/ui 元件 (button.jsx, card.jsx, ...)
├── lib/
│   └── utils.js     ← cn() 工具函式
├── hooks/           ← 自訂 React Hooks
└── ...
```

### 2.2 安裝元件的方式

```bash
# 安裝單一元件（會自動寫入 src/components/ui/）
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add dialog
npx shadcn@latest add tabs

# 批次安裝建議的核心元件
npx shadcn@latest add button card dialog tabs input textarea \
  label badge alert tooltip dropdown-menu separator scroll-area \
  skeleton avatar sheet
```

### 2.3 `cn()` 使用規範

```jsx
import { cn } from "@/lib/utils";

// ✅ 正確：用 cn() 合併條件式 class
<div className={cn("p-4 rounded-lg", isActive && "bg-primary text-primary-foreground")} />

// ❌ 錯誤：字串拼接（無法解決 Tailwind 衝突）
<div className={`p-4 rounded-lg ${isActive ? "bg-primary" : ""}`} />
```

---

## 三、色彩系統 (Color System — CSS Variables)

> 所有色彩透過 **HSL CSS Variables** 定義於 `src/index.css`。  
> Tailwind 透過 `hsl(var(--token-name))` 引用，支援原生 Dark Mode 切換。

### 3.1 shadcn/ui 核心語義色

| Token | Light 值 (HSL) | 對應色碼 | 用途 |
|:---|:---|:---|:---|
| `--background` | `0 0% 100%` | `#FFFFFF` | 頁面背景 |
| `--foreground` | `215 25% 13%` | `#0F172A` | 主體文字 |
| `--card` | `0 0% 100%` | `#FFFFFF` | 卡片背景 |
| `--card-foreground` | `215 25% 13%` | `#0F172A` | 卡片內文字 |
| `--popover` | `0 0% 100%` | `#FFFFFF` | 彈出式內容背景 |
| `--primary` | `243 76% 59%` | `#4F46E5` | 主互動色 (indigo-600) |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Primary 上的文字 |
| `--secondary` | `214 32% 91%` | `#E2E8F0` | 次要背景 (slate-200) |
| `--secondary-foreground` | `215 25% 13%` | `#0F172A` | Secondary 上的文字 |
| `--muted` | `210 40% 96%` | `#F1F5F9` | 柔和背景 (slate-100) |
| `--muted-foreground` | `215 16% 47%` | `#64748B` | 次要文字 (slate-500) |
| `--accent` | `210 40% 96%` | `#F1F5F9` | 強調背景 |
| `--destructive` | `0 72% 51%` | `#DC2626` | 危險操作 (red-600) |
| `--border` | `214 32% 91%` | `#E2E8F0` | 邊框 |
| `--input` | `214 32% 82%` | `#CBD5E1` | 輸入框邊框 |
| `--ring` | `243 76% 59%` | `#4F46E5` | Focus ring |
| `--radius` | — | `0.5rem` | 全域圓角基礎值 |

### 3.2 GenPic 品牌擴充色

| Token | Light 值 (HSL) | 對應色碼 | 用途 |
|:---|:---|:---|:---|
| `--brand-primary` | `243 76% 59%` | `#4F46E5` | 與 primary 同步 |
| `--brand-primary-hover` | `243 75% 51%` | `#4338CA` | Primary 的 hover |
| `--brand-primary-light` | `229 100% 94%` | `#E0E7FF` | 點綴背景、Step 圓圈 |
| `--brand-secondary` | `271 81% 56%` | `#9333EA` | 漸層起點、次要強調 |
| `--brand-accent` | `330 81% 60%` | `#EC4899` | CTA 漸層終點 |

### 3.3 語義擴充色

| Token | Light 值 (HSL) | 用途 |
|:---|:---|:---|
| `--success` / `--success-foreground` | `142 71% 45%` / `138 76% 97%` | 成功狀態 |
| `--warning` / `--warning-foreground` | `48 96% 53%` / `55 92% 95%` | 警告狀態 |
| `--info` / `--info-foreground` | `217 91% 60%` / `214 100% 97%` | 資訊提示 |

### 3.4 漸層 (Gradients)

| 名稱 | Tailwind Class | 使用場景 |
|:---|:---|:---|
| Header 背景 | `bg-gradient-header` | 頂部 Header |
| CTA 按鈕 | `bg-gradient-cta` | 「開始生成圖片」按鈕 |
| CTA hover | `bg-gradient-cta-hover` | CTA hover 狀態 |

### 3.5 Dark Mode

已在 `index.css` 預定義 `.dark` 變體。啟用方式：

```jsx
// 在 <html> 加上 class="dark" 即可切換
<html className={isDark ? "dark" : ""}>
```

Tailwind 已設定 `darkMode: ["class"]`，所有 shadcn/ui 元件自動響應。

---

## 四、排版 (Typography)

### 4.1 字體堆疊

```css
font-family: 'Inter', 'Noto Sans TC', -apple-system, BlinkMacSystemFont,
             'Segoe UI', 'Helvetica Neue', sans-serif;
```

| 字型 | 角色 |
|:---|:---|
| **Inter** | 主體英文字型，現代幾何無襯線，Variable Font |
| **Noto Sans TC** | 中文回退，Google 開源繁體 |
| **JetBrains Mono** | 等寬字型（Prompt 輸入、程式碼區塊） |

### 4.2 字級量表 (Type Scale)

基於 4px 基礎網格：

| 等級 | 大小 | 行高 | 字重 | Tailwind | shadcn 用法 |
|:---|:---|:---|:---|:---|:---|
| Display | 30px | 36px | 700 | `text-3xl font-bold` | 落地頁主標 |
| H1 | 24px | 32px | 600 | `text-2xl font-semibold tracking-tight` | `DialogTitle`、頁面標題 |
| H2 | 20px | 28px | 600 | `text-xl font-semibold` | `CardTitle`、Header 產品名 |
| H3 | 16px | 24px | 600 | `text-base font-semibold` | `Label`、步驟標題 |
| Body | 14px | 22px | 400 | `text-sm` | `CardDescription`、主體文字 |
| Caption | 12px | 16px | 400 | `text-xs text-muted-foreground` | 輔助說明、時間 |
| Micro | 10px | 14px | 500 | `text-[10px] font-medium` | `Badge` 內文、Tag |

### 4.3 排版規則

- **段落間距**：`space-y-4`（16px）或 `space-y-8`（32px）
- **行長限制**：中文 ≤ 35 字/行，英文 ≤ 75 字元
- **文字截斷**：超過 2 行使用 `line-clamp-2`
- **次要文字**：一律使用 `text-muted-foreground`（非硬編碼色碼）

---

## 五、間距與佈局 (Spacing & Layout)

### 5.1 間距量表

| Token | 值 | Tailwind | 常見用途 |
|:---|:---|:---|:---|
| `space-1` | 4px | `p-1 / gap-1` | 圖標與文字間微距 |
| `space-1.5` | 6px | `p-1.5` | 小按鈕內距 |
| `space-2` | 8px | `p-2 / gap-2` | 行內元素間距 |
| `space-3` | 12px | `p-3` | 緊湊卡片內距 |
| `space-4` | 16px | `p-4 / gap-4` | 標準控件間距 |
| `space-6` | 24px | `p-6` | `CardContent` 內距 |
| `space-8` | 32px | `p-8 / gap-8` | Section 之間 |
| `space-12` | 48px | `p-12` | 大區塊間距 |

### 5.2 主佈局結構

```
Desktop (md+):  Sheet/Sidebar (1/3, min 350px) │ Main Panel
Mobile (<md):   Sidebar (60dvh) / Main Panel (40dvh)
```

| 面向 | 規格 |
|:---|:---|
| **斷點** | `md: 768px` / `xl: 1280px` |
| **桌面 Sidebar** | `w-1/3` + `min-w-sidebar`，固定 `h-screen` |
| **桌面 Main Panel** | `flex-1`，滿版高度 |
| **手機 Sidebar** | `h-[60dvh]`（輸入焦點時改用 shadcn `Sheet` 全屏展開） |
| **最大內容寬度** | `max-w-4xl mx-auto` |

---

## 六、元件規範 (Component Specifications)

> **核心原則**：所有 UI 元件優先使用 shadcn/ui。  
> 只有 shadcn/ui 未提供的場景才自訂，且須遵循 `cva` + `cn()` 模式。

### 6.1 按鈕 (Button)

使用 `shadcn/ui Button`，透過 `variant` 和 `size` 控制：

| Variant | 用途 | 範例 |
|:---|:---|:---|
| `default` | 主要操作 | 「解析風格與內容」 |
| `destructive` | 危險操作 | 「刪除」 |
| `outline` | 次要操作 | 「下載圖片」 |
| `secondary` | 輔助操作 | 比例選擇器中的選項 |
| `ghost` | 幽靈按鈕 | Tab、刪除圖標 |
| `link` | 連結樣式 | 內文連結 |

| Size | 尺寸 | 用途 |
|:---|:---|:---|
| `default` | `h-10 px-4 py-2` | 標準按鈕 |
| `sm` | `h-9 px-3` | Tab、卡片內小按鈕 |
| `lg` | `h-11 px-8` | CTA 按鈕 |
| `icon` | `h-10 w-10` | 純圖標按鈕 |

#### CTA 按鈕（自訂 Variant）

生成圖片按鈕不適用標準 variant，額外定義 `gradient` variant：

```jsx
// 在 button.jsx 中新增 variant
const buttonVariants = cva("...", {
  variants: {
    variant: {
      // ... 原有 variants
      gradient: "bg-gradient-cta hover:bg-gradient-cta-hover text-white shadow-md hover:shadow-lg active:scale-[0.98] transition-all",
    },
  },
});

// 使用方式
<Button variant="gradient" size="lg">
  <Wand2 className="mr-2 h-5 w-5" />
  開始生成圖片
</Button>
```

### 6.2 卡片 (Card)

使用 `shadcn/ui Card` 系列元件：

```jsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

<Card>
  <CardHeader>
    <CardTitle>風格分析結果</CardTitle>
    <CardDescription>AI 已分析參考圖的風格特徵</CardDescription>
  </CardHeader>
  <CardContent>
    {/* 內容 */}
  </CardContent>
  <CardFooter>
    <Button variant="outline">收藏此風格</Button>
  </CardFooter>
</Card>
```

#### Preview Card（生成預覽 — 自訂組合）

```jsx
<Card className="min-h-[500px] shadow-xl rounded-2xl">
  <CardHeader className="border-b">
    <CardTitle className="flex items-center gap-2">
      <ImageIcon className="h-5 w-5 text-primary" />
      生成預覽
    </CardTitle>
  </CardHeader>
  <CardContent className="flex-1 flex items-center justify-center bg-muted p-8">
    {/* 圖片或 Loading */}
  </CardContent>
  <CardFooter className="border-t text-xs text-muted-foreground">
    使用風格：{style}
  </CardFooter>
</Card>
```

### 6.3 Tabs（導航分頁）

使用 `shadcn/ui Tabs`：

```jsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs defaultValue="create">
  <TabsList className="w-full">
    <TabsTrigger value="create" className="flex-1">
      <Wand2 className="mr-2 h-4 w-4" /> 製作區
    </TabsTrigger>
    <TabsTrigger value="styles" className="flex-1">
      <Bookmark className="mr-2 h-4 w-4" /> 風格庫
    </TabsTrigger>
    <TabsTrigger value="history" className="flex-1">
      <History className="mr-2 h-4 w-4" /> 紀錄
    </TabsTrigger>
  </TabsList>
  <TabsContent value="create">{/* ... */}</TabsContent>
  <TabsContent value="styles">{/* ... */}</TabsContent>
  <TabsContent value="history">{/* ... */}</TabsContent>
</Tabs>
```

### 6.4 輸入控件

| 元件 | shadcn/ui | 用途 |
|:---|:---|:---|
| 文字輸入 | `<Input />` | 風格命名、搜尋、標籤 |
| 多行輸入 | `<Textarea />` | Prompt / 腳本輸入 |
| 標籤 | `<Label />` | 所有 Input 的標籤 |

```jsx
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

<div className="space-y-2">
  <Label htmlFor="style-name">風格名稱</Label>
  <Input id="style-name" placeholder="為此風格命名..." />
</div>

<Textarea
  placeholder="例如：一位穿著西裝的員工正在向團隊展示…"
  className="min-h-[128px] md:min-h-[256px] resize-y"
/>
```

### 6.5 對話框與面板

| 場景 | 元件 | 說明 |
|:---|:---|:---|
| 確認刪除 | `AlertDialog` | 需要使用者確認的破壞性操作 |
| 設定 / 進階選項 | `Dialog` | 模態視窗，帶標題和操作按鈕 |
| 行動版控制面板 | `Sheet` | 從底部或側邊滑入，取代手機版 Sidebar |
| 操作選單 | `DropdownMenu` | 右鍵選單、更多操作 |

```jsx
// 刪除確認
import { AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="ghost" size="icon"><Trash2 className="h-4 w-4" /></Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>確定要刪除嗎？</AlertDialogTitle>
      <AlertDialogDescription>此操作無法復原。</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>取消</AlertDialogCancel>
      <AlertDialogAction className="bg-destructive">刪除</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 6.6 Badge (標籤 / 標記)

```jsx
import { Badge } from "@/components/ui/badge";

// Variants: default, secondary, destructive, outline
<Badge variant="secondary">#扁平插畫</Badge>
<Badge variant="outline">16:9</Badge>
```

### 6.7 Alert (提示訊息)

```jsx
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";

<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>錯誤</AlertTitle>
  <AlertDescription>{errorMsg}</AlertDescription>
</Alert>

<Alert>
  <CheckCircle2 className="h-4 w-4" />
  <AlertTitle>成功</AlertTitle>
  <AlertDescription>圖片已儲存至風格庫</AlertDescription>
</Alert>
```

### 6.8 Skeleton (載入佔位)

```jsx
import { Skeleton } from "@/components/ui/skeleton";

// 圖片生成中佔位
<div className="space-y-3">
  <Skeleton className="h-[300px] w-full rounded-xl" />
  <Skeleton className="h-4 w-3/4" />
  <Skeleton className="h-4 w-1/2" />
</div>
```

### 6.9 Tooltip (工具提示)

```jsx
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon"><Save className="h-4 w-4" /></Button>
    </TooltipTrigger>
    <TooltipContent>下載圖片</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### 6.10 ScrollArea (捲動區域)

取代自訂 scrollbar：

```jsx
import { ScrollArea } from "@/components/ui/scroll-area";

<ScrollArea className="h-[calc(100vh-200px)]">
  {/* 長列表內容 */}
</ScrollArea>
```

### 6.11 File Upload Zone (自訂元件)

shadcn/ui 未提供 Dropzone，此為自訂元件，但遵循 shadcn 風格：

```jsx
<div
  className={cn(
    "border-2 border-dashed rounded-xl p-4 transition-all text-center cursor-pointer",
    "hover:border-primary/50 hover:bg-accent",
    hasFile ? "border-primary/30 bg-primary/5" : "border-input"
  )}
>
  {/* ... */}
</div>
```

### 6.12 元件對照表 (Migration Map)

| 現有自訂元件 | → shadcn/ui 替代 |
|:---|:---|
| 手寫 `<button className="bg-indigo-600 ...">` | `<Button variant="default">` |
| 手寫 Tab bar (`flex border-b`) | `<Tabs>` / `<TabsList>` |
| 手寫 Card (`bg-white border rounded-xl`) | `<Card>` |
| 手寫 Input (`border rounded-lg focus:ring`) | `<Input>` |
| 手寫 Error alert (`bg-red-50 text-red-600`) | `<Alert variant="destructive">` |
| 手寫 Tag (`text-[10px] px-2 rounded-full`) | `<Badge variant="secondary">` |
| `.custom-scrollbar` | `<ScrollArea>` |
| `window.confirm()` | `<AlertDialog>` |
| 手寫 Tooltip (`title` 屬性) | `<Tooltip>` |
| 手機版 `isInputFocused` toggle | `<Sheet>` 從底部滑入 |

---

## 七、圖標 (Iconography)

| 屬性 | 規範 |
|:---|:---|
| **函式庫** | [Lucide React](https://lucide.dev) — shadcn/ui 預設圖標庫 |
| **標準尺寸** | `h-4 w-4` — 按鈕內、行內 |
| **大尺寸** | `h-5 w-5` — 標題、CTA |
| **特大尺寸** | `h-6 w-6` — Header Logo |
| **按鈕內間距** | `mr-2`（文字在右）或 `ml-2`（文字在左） |
| **顏色** | 繼承 `currentColor`，或用 `text-muted-foreground` |

---

## 八、動畫與過渡 (Motion)

### 8.1 原則

- shadcn/ui 元件（Dialog、Sheet、DropdownMenu）已內建 Radix 進出場動畫
- 使用 `tailwindcss-animate` 提供的 utility classes
- 尊重 `prefers-reduced-motion: reduce`

### 8.2 過渡規範

| 場景 | 使用方式 |
|:---|:---|
| Button hover/active | shadcn/ui 內建 `transition-colors` |
| Card hover 陰影 | `transition-shadow hover:shadow-md` |
| Dialog 進出場 | Radix 內建（fade + scale） |
| Sheet 滑入 | Radix 內建（slide from edge） |
| Accordion 展開 | `animate-accordion-down` / `animate-accordion-up` |
| 生成結果淡入 | `animate-fade-in` (自訂) |
| Loading spinner | Lucide `Loader2` + `animate-spin` |

### 8.3 自訂動畫 (Tailwind Config)

```js
keyframes: {
  fadeIn:          { "0%": { opacity: 0 }, "100%": { opacity: 1 } },
  slideUp:         { "0%": { opacity: 0, transform: "translateY(8px)" }, "100%": { opacity: 1, transform: "translateY(0)" } },
  "accordion-down": { from: { height: 0 }, to: { height: "var(--radix-accordion-content-height)" } },
  "accordion-up":   { from: { height: "var(--radix-accordion-content-height)" }, to: { height: 0 } },
},
animation: {
  "fade-in":        "fadeIn 0.5s ease-out",
  "slide-up":       "slideUp 0.3s ease-out",
  "accordion-down": "accordion-down 0.2s ease-out",
  "accordion-up":   "accordion-up 0.2s ease-out",
},
```

---

## 九、響應式設計 (Responsive Design)

### 9.1 斷點定義

| 斷點 | 寬度 | 典型裝置 |
|:---|:---|:---|
| Default | < 768px | 手機 |
| `md` | ≥ 768px | 平板 |
| `lg` | ≥ 1024px | 筆電 |
| `xl` | ≥ 1280px | 桌機寬螢幕 |

### 9.2 關鍵響應式行為

| 元件 | Mobile (< md) | Desktop (≥ md) |
|:---|:---|:---|
| 主佈局 | 垂直堆疊 `flex-col` | 水平並排 `flex-row` |
| 控制面板 | 使用 shadcn `Sheet` (bottom) | 左側 Sidebar |
| Tab 內距 | `sm` size | `default` size |
| Textarea | `min-h-[128px]` | `min-h-[256px]` |
| Dialog | 全屏 variant | 標準置中 |

### 9.3 觸控優化

- 所有 Button、Icon Button 最小觸控區域 **44×44px**（shadcn/ui 的 `size="icon"` 為 `h-10 w-10 = 40px`，需在行動版加 `p-1`）
- 使用 shadcn `Sheet` 取代手動 viewport 切割
- hover-only 交互在行動版自動降級

---

## 十、無障礙 (Accessibility)

> shadcn/ui 基於 Radix UI，大部分無障礙已內建。以下列出額外需遵守的規範：

| 項目 | 規範 |
|:---|:---|
| **對比度** | 文字/背景 ≥ 4.5:1 (AA)；`text-muted-foreground` 在 light 模式下為 4.6:1 ✅ |
| **Focus Ring** | shadcn/ui 內建 `focus-visible:ring-2 ring-ring`，不得覆蓋或移除 |
| **Alt 文字** | 所有 `<img>` 必須有 `alt`；裝飾圖用 `alt=""` + `aria-hidden` |
| **語義 HTML** | shadcn `<Button>` 渲染為 `<button>`；`<AlertDialog>` 提供完整 ARIA role |
| **鍵盤導航** | Radix 元件已支援箭頭鍵、Escape、Enter；自訂元件需手動處理 |
| **Loading 狀態** | 加 `aria-live="polite"` 或使用 shadcn `Skeleton` 佔位 |
| **色彩無障礙** | 永遠搭配圖標或文字，不僅靠顏色 |

---

## 十一、圓角系統 (Border Radius)

透過 `--radius` CSS Variable 統一管理。shadcn/ui 自動計算：

| Token | 計算邏輯 | 預設值 | 適用 |
|:---|:---|:---|:---|
| `rounded-lg` | `var(--radius)` | 8px | Button、Input、Alert |
| `rounded-md` | `var(--radius) - 2px` | 6px | Badge、小元件 |
| `rounded-sm` | `var(--radius) - 4px` | 4px | 微型元件 |
| `rounded-xl` | 手動 12px | 12px | Card |
| `rounded-2xl` | 手動 16px | 16px | Preview Card |
| `rounded-full` | 999px | ∞ | Avatar、Pill |

修改 `--radius` 即可全域調整所有元件圓角。

---

## 十二、陰影系統 (Elevation)

| 等級 | Tailwind | 用途 |
|:---|:---|:---|
| Level 0 | `shadow-none` | 靜態內容 |
| Level 1 | `shadow-sm` | 次要按鈕、Popover |
| Level 2 | `shadow-md` | Hover 卡片、標準 Dialog |
| Level 3 | `shadow-lg` | Hover CTA、Sheet |
| Level 4 | `shadow-xl` | Preview Card、Sidebar |

---

## 十三、空狀態 (Empty States)

使用 shadcn/ui 元件組合：

```jsx
<div className="flex flex-col items-center justify-center py-10 text-center">
  <div className="rounded-full bg-muted p-4 mb-4">
    <Bookmark className="h-8 w-8 text-muted-foreground" />
  </div>
  <p className="text-sm text-muted-foreground">尚未收藏任何風格</p>
  <Button variant="outline" size="sm" className="mt-4">
    <Plus className="mr-2 h-4 w-4" /> 新增風格
  </Button>
</div>
```

---

## 十四、命名慣例 (Naming Conventions)

### 檔案結構

```
src/
├── components/
│   ├── ui/                    ← shadcn/ui 元件（勿手動修改結構）
│   │   ├── button.jsx
│   │   ├── card.jsx
│   │   └── ...
│   ├── infographic-generator/ ← 業務元件（按功能分拆）
│   │   ├── style-panel.jsx
│   │   ├── preview-panel.jsx
│   │   └── history-panel.jsx
│   └── layout/                ← 佈局元件
│       ├── app-header.jsx
│       └── app-sidebar.jsx
├── hooks/                     ← 自訂 Hooks
├── lib/
│   └── utils.js               ← cn() 工具
└── ...
```

### 命名規則

| 類型 | 命名 | 範例 |
|:---|:---|:---|
| shadcn/ui 元件檔 | kebab-case `.jsx` | `button.jsx`, `alert-dialog.jsx` |
| 業務元件檔 | kebab-case `.jsx` | `style-panel.jsx` |
| React 元件名 | PascalCase | `StylePanel`, `PreviewCard` |
| Hooks | camelCase `use*` | `useStyleLibrary`, `useGeneration` |
| Props | camelCase | `isLoading`, `onStyleSelect` |
| CSS Variable | `--kebab-case` | `--brand-primary`, `--muted-foreground` |
| Tailwind token | kebab-case | `bg-brand-primary`, `text-muted-foreground` |

---

## 十五、建議的 shadcn/ui 元件安裝清單

依功能優先級排列：

### P0 — 核心元件（立即安裝）

```bash
npx shadcn@latest add button card tabs input textarea label badge alert \
  separator tooltip scroll-area skeleton
```

### P1 — 進階互動

```bash
npx shadcn@latest add dialog alert-dialog sheet dropdown-menu \
  select avatar popover command
```

### P2 — 未來功能

```bash
npx shadcn@latest add accordion progress slider toggle switch \
  navigation-menu breadcrumb
```

---

## 十六、未來擴充點 (Roadmap Hooks)

| Phase | 設計準備 |
|:---|:---|
| **Dark Mode** | ✅ CSS Variables 已定義 `.dark` 變體，只需切換 `<html>` class |
| **多語系 (i18n)** | 確保佈局彈性，shadcn/ui 元件不硬編碼文字 |
| **Design System 元件庫** | 可直接從 shadcn/ui 元件匯出 Storybook stories |
| **品牌白標 (White-label)** | 修改 `:root` CSS Variables 即可換膚，零程式碼改動 |
| **表單驗證** | 搭配 `react-hook-form` + `zod` + shadcn `<Form>` 元件 |
| **Data Table** | shadcn/ui `DataTable` + TanStack Table |

---

## 附錄 A：色彩對比度驗證表

| 前景 | 背景 | 對比度 | 結果 |
|:---|:---|:---|:---|
| `foreground` (slate-900) | `background` (white) | 15.4:1 | ✅ AAA |
| `muted-foreground` (slate-500) | `background` (white) | 4.6:1 | ✅ AA |
| `primary-foreground` (white) | `primary` (indigo-600) | 5.2:1 | ✅ AA |
| `destructive-foreground` (white) | `destructive` (red-600) | 5.1:1 | ✅ AA |
| `muted-foreground` (dark) | `background` (dark) | 5.0:1 | ✅ AA |

---

## 附錄 B：設計 QA 檢查清單

在每次 PR 中確認：

- [ ] 新 UI 元素使用 shadcn/ui 元件（非手寫 HTML）
- [ ] 所有顏色引用 CSS Variable（非硬編碼色碼）
- [ ] 條件式 class 使用 `cn()`（非字串拼接）
- [ ] Button 有正確的 `variant` 和 `size`
- [ ] 所有 `<Button>` disabled 狀態正常
- [ ] 圖片有 `alt` 文字
- [ ] 文字對比度 ≥ 4.5:1
- [ ] 行動版觸控區域 ≥ 44×44px
- [ ] Loading 狀態使用 `Skeleton` 或 `Loader2` + `animate-spin`
- [ ] 空狀態有引導文案和 CTA
- [ ] 破壞性操作使用 `AlertDialog` 確認
- [ ] Dark mode 下 UI 正常運作（若已啟用）

---

## 附錄 C：從舊版遷移檢查清單

將現有 `InfographicGenerator.jsx` 遷移至 shadcn/ui 的步驟：

1. [ ] 安裝 P0 核心元件
2. [ ] 將手寫 Tab bar 替換為 `<Tabs>` 
3. [ ] 將手寫 Button 替換為 `<Button variant="...">` 
4. [ ] 將 error alert 替換為 `<Alert variant="destructive">`
5. [ ] 將手寫 Input/Textarea 替換為 shadcn 版本
6. [ ] 將 Tag span 替換為 `<Badge>`
7. [ ] 將 `.custom-scrollbar` 替換為 `<ScrollArea>`
8. [ ] 將 `window.confirm` 替換為 `<AlertDialog>`
9. [ ] 將手寫 Card 替換為 `<Card>` 系列
10. [ ] 在行動版使用 `<Sheet>` 取代 viewport hack
11. [ ] 所有硬編碼色碼 (`#4F46E5`, `bg-indigo-600`) 改為 CSS Variable 引用 (`bg-primary`)
