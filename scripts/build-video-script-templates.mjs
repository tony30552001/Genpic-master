// Regenerates public/templates/*.docx from src/lib/videoScriptTemplate.js.
// Run after changing the template content: corepack pnpm templates:video
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import {
  SCRIPT_EXAMPLE,
  SCRIPT_TEMPLATE_FILES,
  SCRIPT_TEMPLATE_LIMITS,
  SCRIPT_TEMPLATE_NOTES,
  sceneText,
} from "../src/lib/videoScriptTemplate.js";

const publicDir = new URL("../public/", import.meta.url);
const HINT_COLOR = "6B7280";

// Preface paragraphs must never be bold: a short all-bold paragraph is read as a scene heading.
const text = (value, options = {}) => new Paragraph({ children: [new TextRun({ text: value, ...options })] });
const lines = (value, options) => value.split("\n").map((line) => text(line, options));
const hint = (value) => text(value, { color: HINT_COLOR, italics: true });
const heading = (value) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(value)] });

const buildDocument = (children) =>
  new Document({
    creator: "Pixora",
    styles: {
      default: {
        document: { run: { font: { ascii: "Calibri", hAnsi: "Calibri", eastAsia: "Microsoft JhengHei" }, size: 22 } },
      },
    },
    sections: [{ children }],
  });

const template = buildDocument([
  text("影片腳本範本", { size: 36 }),
  hint("第一個「標題 1」之前的文字是全片設定。請把括號內的說明換成你的內容，完成後刪除所有灰色說明。"),
  ...SCRIPT_TEMPLATE_NOTES.map((note) => hint(`・${note}`)),
  hint(`限制：${SCRIPT_TEMPLATE_LIMITS.map(({ label, value }) => `${label} ${value}`).join("；")}。`),
  text(""),
  text("人物：（每位固定人物的外觀、髮型、服裝與配件）"),
  text("場景：（地點、主要設備與工具的外觀）"),
  text("畫面風格：（寫實或動畫、光線、16:9 或 9:16）"),
  text("禁止事項：（全片都不能出現的錯誤）"),
  heading("場景一：（場景標題）"),
  hint("（在此插入參考圖：插入 > 圖片。圖片要放在這個標題下方、下一個標題之前。）"),
  text("（這一場畫面中誰在哪裡、做什麼動作、動作的順序與方向。）"),
  text("鏡頭：（景別、角度、運鏡）"),
  text("長度：5 秒。"),
  heading("場景二：（場景標題）"),
  hint("（在此插入參考圖）"),
  text("（這一場畫面中的動作。需要出現在畫面上的文字請用「」框起來。）"),
  text("鏡頭：（景別、角度、運鏡）"),
  text("長度：5 秒。"),
]);

const example = buildDocument([
  ...lines(SCRIPT_EXAMPLE.preface),
  ...SCRIPT_EXAMPLE.scenes.flatMap((scene) => [heading(scene.title), ...lines(sceneText(scene))]),
]);

await mkdir(new URL("templates/", publicDir), { recursive: true });
for (const [key, document] of [
  ["template", template],
  ["example", example],
]) {
  const target = new URL(`.${SCRIPT_TEMPLATE_FILES[key]}`, publicDir);
  await writeFile(target, await Packer.toBuffer(document));
  console.log(`wrote ${fileURLToPath(target)}`);
}
