import { describe, expect, it } from "vitest";
import { detectNoTextIntent } from "../promptHints";

describe("detectNoTextIntent", () => {
  it.each([
    "不要文字",
    "公車盲區示意圖，不要有任何文字",
    "職安插圖，畫面中不要出現文字",
    "無文字版本的工地場景",
    "請移除所有文字",
    "把文字移除",
    "把圖中的文字都去掉",
    "所有文字都拿掉",
    "插圖不含文字，只要人物",
    "A forklift safety scene, no text",
    "illustration without any text",
    "Remove all the text",
    "text-free poster",
  ])("detects whole-image no-text intent: %s", (prompt) => {
    expect(detectNoTextIntent(prompt)).toBe(true);
  });

  it.each([
    "",
    "   ",
    null,
    "一張繁體中文的資訊圖表，標題寫「安全第一」",
    "標題不要文字，用圖示表示",
    "背景不要文字",
    "標題文字都移除",
    "不要文字太多",
    "不要文字框",
    "文字要清楚",
    "a title with no text",
    "a sign without text next to the road",
    "context matters",
  ])("does not flag local or unrelated text requests: %s", (prompt) => {
    expect(detectNoTextIntent(prompt)).toBe(false);
  });
});
