import React, { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp } from "lucide-react";

const TEMPLATES = [
  {
    id: "t1",
    title: "晨光咖啡館",
    text: "晨光鋪滿的木質咖啡館，咖啡漩渦與奶泡紋理清晰可見，近距離拍攝",
  },
  {
    id: "t2",
    title: "雲端浮島",
    text: "雲海之上懸停著碎片群島與霧瀑，遠景遼闊，薄霧光環",
  },
  {
    id: "t3",
    title: "童話氣球遊行",
    text: "童話小鎮的氣球遊行，小朋友在空中歡呼，甜美彩色氣球串",
  },
  {
    id: "t4",
    title: "水彩山嵐湖",
    text: "山嵐繚繞的湖面與杉林倒影，水彩暈染層次柔和",
  },
  {
    id: "t5",
    title: "像素霓虹街機",
    text: "8-bit 霓虹街機廊，雨後水漬倒影，速度感強",
  },
  {
    id: "t6",
    title: "3D 爆炸結構",
    text: "金屬質感相機機身剖面展開示意，結構層次分明",
  },
  {
    id: "t7",
    title: "電影感追逐",
    text: "未來城市磁浮列車疾駛追逐，高對比光影，電影感構圖",
  },
  {
    id: "t8",
    title: "復古旅行海報",
    text: "復古假日海報，手繪字體與色塊構成，紙質顆粒感",
  },
  {
    id: "t9",
    title: "玻璃未來展廳",
    text: "全玻璃展廳展示未來設備，空間極簡，線條乾淨",
  },
  {
    id: "t10",
    title: "陶瓷茶具特寫",
    text: "手作陶瓷茶壺特寫，釉色層次與微小裂紋清晰，背景簡潔",
  },
  {
    id: "t11",
    title: "布料質感時裝",
    text: "層疊布料的時裝造型，材質細節細膩，背景簡潔",
  },
  {
    id: "t12",
    title: "紙雕城市模型",
    text: "紙雕建築群模型，幾何建築層次清晰，光影溫潤",
  },
];

/**
 * PromptTemplates — 可收折的常用提示詞範本區
 * 點擊範本卡片將文字填入 prompt 輸入框。
 */
export default function PromptTemplates({ onFill }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <Lightbulb
          className="h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <span className="flex-1 text-sm font-medium text-foreground">
          常用提示詞範本
        </span>
        <span className="text-xs text-muted-foreground">
          {isOpen ? "收起" : "展開"}
        </span>
        {isOpen ? (
          <ChevronUp
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onFill?.(tpl.text)}
              className="group rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <p className="text-xs font-semibold text-foreground transition-colors group-hover:text-primary">
                {tpl.title}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                {tpl.text}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
