import { describe, expect, it } from "vitest";
import speechTts from "../speechTts.js";

const {
  DEFAULT_SPEECH_VOICE,
  SPEECH_VOICES,
  buildSsml,
  buildSubtitleCues,
  countNarrationCharacters,
  formatSrt,
  isValidSpeechVoice,
} = speechTts;

describe("speechTts helpers", () => {
  it("lists the three supported zh-TW voices and escapes SSML", () => {
    expect(SPEECH_VOICES.map((voice) => voice.id)).toEqual([
      "zh-TW-HsiaoChenNeural",
      "zh-TW-YunJheNeural",
      "zh-TW-HsiaoYuNeural",
    ]);
    expect(isValidSpeechVoice(DEFAULT_SPEECH_VOICE)).toBe(true);
    expect(isValidSpeechVoice("en-US-JennyNeural")).toBe(false);
    expect(buildSsml('確認 <水壓> & "溫度"', "zh-TW-YunJheNeural")).toContain(
      '<voice name="zh-TW-YunJheNeural">確認 &lt;水壓&gt; &amp; &quot;溫度&quot;</voice>'
    );
  });

  it("groups word and punctuation boundary events into timed cues", () => {
    const boundaries = [
      { type: "word", text: "每天", startSeconds: 0.05, endSeconds: 0.4 },
      { type: "word", text: "開店前", startSeconds: 0.4, endSeconds: 0.9 },
      { type: "punctuation", text: "，", startSeconds: 0.9, endSeconds: 0.95 },
      { type: "word", text: "先確認", startSeconds: 1.0, endSeconds: 1.5 },
      { type: "word", text: "咖啡機水壓", startSeconds: 1.5, endSeconds: 2.3 },
      { type: "punctuation", text: "。", startSeconds: 2.3, endSeconds: 2.35 },
      { type: "word", text: "再開啟", startSeconds: 2.5, endSeconds: 2.9 },
      { type: "word", text: "電源", startSeconds: 2.9, endSeconds: 3.3 },
      { type: "punctuation", text: "。", startSeconds: 3.3, endSeconds: 3.35 },
    ];
    const cues = buildSubtitleCues("每天開店前，先確認咖啡機水壓。再開啟電源。", boundaries, 3.6);
    expect(cues).toEqual([
      { start: 0.05, end: 2.35, text: "每天開店前，先確認咖啡機水壓。" },
      { start: 2.5, end: 3.35, text: "再開啟電源。" },
    ]);
  });

  it("splits long phrases on weak punctuation once past soft break length", () => {
    const boundaries = [
      { type: "word", text: "請先戴上手套與護目鏡", startSeconds: 0.0, endSeconds: 1.6 },
      { type: "punctuation", text: "，", startSeconds: 1.6, endSeconds: 1.65 },
      { type: "word", text: "再開啟清洗開關", startSeconds: 1.8, endSeconds: 3.0 },
      { type: "punctuation", text: "。", startSeconds: 3.0, endSeconds: 3.05 },
    ];
    const cues = buildSubtitleCues("請先戴上手套與護目鏡，再開啟清洗開關。", boundaries, 3.2);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("請先戴上手套與護目鏡，");
    expect(cues[1].text).toBe("再開啟清洗開關。");
  });

  it("falls back to sentence boundaries when word boundaries are absent", () => {
    const boundaries = [
      { type: "sentence", text: "第一句旁白。", startSeconds: 0.0, endSeconds: 1.5 },
      { type: "sentence", text: "第二句旁白。", startSeconds: 1.6, endSeconds: 3.1 },
    ];
    expect(buildSubtitleCues("第一句旁白。第二句旁白。", boundaries, 3.2)).toEqual([
      { start: 0, end: 1.5, text: "第一句旁白。" },
      { start: 1.6, end: 3.1, text: "第二句旁白。" },
    ]);
  });

  it("formats SRT timestamps and counts narration characters", () => {
    const srt = formatSrt([
      { start: 0.05, end: 2.35, text: "步驟 1：檢查水壓" },
      { start: 65.5, end: 68.125, text: "步驟 2：啟動預熱" },
    ]);
    expect(srt).toBe(
      "1\n00:00:00,050 --> 00:00:02,350\n步驟 1：檢查水壓\n\n" +
      "2\n00:01:05,500 --> 00:01:08,125\n步驟 2：啟動預熱\n"
    );
    expect(countNarrationCharacters("  測試旁白  ")).toBe(4);
  });
});
