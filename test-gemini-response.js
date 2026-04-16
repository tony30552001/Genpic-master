/**
 * 測試腳本：用 Janet 的圖片呼叫 Gemini，印出原始 JSON 回傳
 * 執行方式：
 *   $env:GOOGLE_API_KEY="你的金鑰"; node test-gemini-response.js
 *
 * 目的：確認 Gemini 是否對這張圖片回傳非字串欄位（會觸發舊版 bug）
 */

const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const IMAGE_PATH = process.argv[2] || "C:\\Users\\tony.lin\\Downloads\\圖片4_0.png";

const STYLE_ANALYSIS_PROMPT = `請擔任專業視覺分析師。請分析這張圖片並回傳一個 JSON 物件，包含以下欄位：
1. "style_prompt": (英文) 詳細描述圖片的視覺風格、藝術流派、配色方案、光影與材質、構圖特徵。這將用於生成類似風格圖片的 Image Gen Prompt。
2. "style_description_zh": (繁體中文) 以優美的文字，詳細描述此風格的視覺特徵、帶給人的感受、適合的使用場景。這將呈現給使用者看作為風格介紹。
3. "image_content": (繁體中文) 條列式描述圖片中呈現的具體內容與資訊（標題、圖表、文字、人物等）。
4. "suggested_tags": 陣列形式，5-8 個繁體中文標籤，描述風格特徵（例如：["科技感", "3D立體", "藍色調"]）。

重要：請直接回傳 JSON，不要加 markdown 或說明文字。`;

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("❌ 請設定 GOOGLE_API_KEY 環境變數");
    console.error("   Windows PowerShell: $env:GOOGLE_API_KEY='your-key'; node test-gemini-response.js");
    process.exit(1);
  }

  if (!fs.existsSync(IMAGE_PATH)) {
    console.error(`❌ 找不到圖片: ${IMAGE_PATH}`);
    console.error("   用法: node test-gemini-response.js <圖片路徑>");
    process.exit(1);
  }

  console.log(`📷 載入圖片: ${IMAGE_PATH}`);
  const imageBuffer = fs.readFileSync(IMAGE_PATH);
  const base64Data = imageBuffer.toString("base64");
  const ext = path.extname(IMAGE_PATH).toLowerCase();
  const mimeType = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";

  const client = new GoogleGenAI({ apiKey });

  console.log("🤖 呼叫 Gemini (gemini-2.0-flash-exp)...\n");

  const result = await client.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: [
      {
        role: "user",
        parts: [
          { text: STYLE_ANALYSIS_PROMPT },
          { inlineData: { mimeType, data: base64Data } },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  // 取得原始文字
  let rawText = "";
  if (typeof result?.text === "string") rawText = result.text;
  else if (typeof result?.text === "function") rawText = result.text();
  else {
    const candidates = result?.candidates;
    if (candidates?.[0]?.content?.parts) {
      rawText = candidates[0].content.parts.map((p) => p.text).filter(Boolean).join("\n");
    }
  }

  console.log("=== 原始回傳文字 ===");
  console.log(rawText);
  console.log("\n=== 解析後的 JSON ===");

  let parsed;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch (e) {
    console.error("❌ JSON 解析失敗:", e.message);
    process.exit(1);
  }

  console.log(JSON.stringify(parsed, null, 2));

  console.log("\n=== 欄位型別檢查 ===");
  const fields = ["style_prompt", "style_description_zh", "image_content", "suggested_tags"];
  let hasProblems = false;
  for (const field of fields) {
    const val = parsed[field];
    const type = Array.isArray(val) ? "array" : typeof val;
    const expected = field === "suggested_tags" ? "array/string" : "string";
    const isOk =
      field === "suggested_tags"
        ? Array.isArray(val) || typeof val === "string"
        : typeof val === "string";
    const status = isOk ? "✅" : "❌ 非預期型別！";
    if (!isOk) hasProblems = true;
    console.log(`  ${status} ${field}: ${type} ${!isOk ? `(值: ${JSON.stringify(val).slice(0, 80)})` : ""}`);
  }

  if (hasProblems) {
    console.log("\n⚠️  發現非字串欄位 — 這就是觸發 ErrorBoundary crash 的原因！");
    console.log("   修復後的 sanitizeAnalysisResult() 會將這些欄位轉為字串，防止 crash。");
  } else {
    console.log("\n✅ 這次呼叫 Gemini 回傳格式正常。");
    console.log("   注意：Gemini 的回傳不穩定，同一張圖多次呼叫可能得到不同結構。");
    console.log("   建議多執行幾次，或換其他圖片試試。");
  }
}

main().catch((err) => {
  console.error("❌ 執行失敗:", err.message);
  process.exit(1);
});
