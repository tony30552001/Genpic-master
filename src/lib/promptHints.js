// 規則型 prompt 提示。規則刻意保守：寧可漏報，也不要誤報。

// 只有「整張圖」範圍的說法才算數；「標題不要文字」這類局部描述前面接的是名詞，不會命中。
const WHOLE_IMAGE_SCOPE =
  "(?:^|[\\s，,。.！!？?；;：:、（）()「」『』\"'\\-]|請|並且?|而且|且|但|也|都|完全|一律|全部|整張(?:圖片?)?|全圖|插圖|示意圖|海報|圖像|圖(?:片(?:中|上|裡|內)?|中|上|裡|內)|畫面(?:中|上|裡|內)?)";
const NEGATE = "(?:不要|不需要|不用|不能|不可以?|避免|無|沒有|没有|不含|不包含|不帶|移除|去掉|去除|刪除|删除|拿掉)";
const REMOVE = "(?:移除|去掉|去除|刪除|删除|拿掉|不要)";
const TEXT = "(?:文字|字樣)";
// 「不要文字太多」「不要文字框」是在描述文字本身，不是要求無文字。
const NOT_TEXT_QUALIFIER = "(?!太|過|很|那麼|這麼|超|重疊|遮|擠|模糊|變形|錯|亂|跑|歪|被|框|方塊|泡泡|雲)";

const ZH_NO_TEXT_PATTERNS = [
  // 不要文字、不要有任何文字、無文字、移除所有文字
  new RegExp(`${WHOLE_IMAGE_SCOPE}${NEGATE}(?:有|出現|顯示|任何|所有|全部)*的?${TEXT}${NOT_TEXT_QUALIFIER}`),
  // 把文字移除、把圖中的文字都去掉
  new RegExp(`把(?:圖片?|畫面)?(?:中|上|裡|內)?的?(?:所有|全部|任何)?的?${TEXT}(?:都|全部|一律)?${REMOVE}`),
  // 所有文字都拿掉、文字全部移除
  new RegExp(`${WHOLE_IMAGE_SCOPE}(?:所有|全部|任何)?的?${TEXT}(?:都|全部|一律)${REMOVE}`),
];

const EN_NO_TEXT = /\b(?:no|without|zero|remove(?: all)?(?: the)?)\s+(?:any\s+)?(?:text|words|lettering|typography)\b|\btext-free\b/i;
const EN_LOCAL_SUBJECT = /\b(?:title|heading|header|sign|label|banner|logo|button|caption)\s+(?:with\s+)?$/i;

/** 判斷 prompt 是否要求整張圖不要出現文字。 */
export function detectNoTextIntent(text) {
  if (typeof text !== "string" || !text.trim()) return false;
  if (ZH_NO_TEXT_PATTERNS.some((pattern) => pattern.test(text))) return true;

  const match = EN_NO_TEXT.exec(text);
  return Boolean(match) && !EN_LOCAL_SUBJECT.test(text.slice(0, match.index));
}

const NEAR_DUPLICATE_THRESHOLD = 0.8;

const normalizeForComparison = (text) =>
  typeof text === "string" ? text.trim().replace(/\s+/g, " ").toLowerCase() : "";

/** 以字元層級的編輯距離判斷兩段 prompt 是否幾乎相同（相似度 ≥ 0.8）。 */
export function isNearDuplicatePrompt(prev, next) {
  const a = [...normalizeForComparison(prev)];
  const b = [...normalizeForComparison(next)];
  if (!a.length || !b.length) return false;
  const longest = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) / longest < NEAR_DUPLICATE_THRESHOLD) return false;

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        previousRow[j] + 1,
        row[j - 1] + 1,
        previousRow[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previousRow = row;
  }
  return 1 - previousRow[b.length] / longest >= NEAR_DUPLICATE_THRESHOLD;
}
