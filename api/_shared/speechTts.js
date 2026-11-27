const sdk = require("microsoft-cognitiveservices-speech-sdk");

const DEFAULT_SPEECH_VOICE = "zh-TW-HsiaoChenNeural";

const SPEECH_VOICES = Object.freeze([
  { id: "zh-TW-HsiaoChenNeural", label: "曉臻（女聲・溫和自然）" },
  { id: "zh-TW-YunJheNeural", label: "雲哲（男聲・清晰沉穩）" },
  { id: "zh-TW-HsiaoYuNeural", label: "曉雨（女聲・親切明快）" },
]);

const SPEECH_VOICE_IDS = new Set(SPEECH_VOICES.map((voice) => voice.id));

const isValidSpeechVoice = (value) =>
  typeof value === "string" && SPEECH_VOICE_IDS.has(value);

const TICKS_PER_SECOND = 10_000_000;
const STRONG_PUNCTUATION = /[。！？!?；;\n]$/u;
const WEAK_PUNCTUATION = /[，,、：:]$/u;
const MAX_CUE_CHARS = 18;
const SOFT_BREAK_CHARS = 8;
const MIN_CUE_SECONDS = 0.15;
const PCM_BYTES_PER_SECOND = 24_000 * 2;
const WAV_HEADER_BYTES = 44;

class SpeechTtsError extends Error {
  constructor(message, code = "speech_tts_failed", status = 502) {
    super(message);
    this.name = "SpeechTtsError";
    this.code = code;
    this.status = status;
  }
}

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildSsml = (text, voice = DEFAULT_SPEECH_VOICE) => {
  const chosen = isValidSpeechVoice(voice) ? voice : DEFAULT_SPEECH_VOICE;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-TW">` +
    `<voice name="${chosen}">${escapeXml(text.trim())}</voice>` +
    `</speak>`
  );
};

const roundTime = (seconds) => Math.max(0, Math.round(seconds * 1000) / 1000);

const countNarrationCharacters = (text) => String(text || "").trim().length;

const clampCue = (start, end, durationSeconds, text) => {
  const clean = text.trim();
  if (!clean) return null;
  const maxEnd = Math.max(MIN_CUE_SECONDS, durationSeconds || 0);
  const safeStart = roundTime(Math.min(Math.max(0, start), Math.max(0, maxEnd - MIN_CUE_SECONDS)));
  const safeEnd = roundTime(Math.min(maxEnd, Math.max(safeStart + MIN_CUE_SECONDS, end)));
  return { start: safeStart, end: safeEnd, text: clean };
};

/**
 * Groups Azure Speech word/punctuation or sentence boundary events into
 * readable Traditional Chinese subtitle cues. Timestamps always come directly
 * from synthesis boundary events rather than character-rate estimation.
 */
const buildSubtitleCues = (text, boundaries, durationSeconds) => {
  const cleanText = String(text || "").trim();
  if (!cleanText) return [];
  const totalDuration = Math.max(MIN_CUE_SECONDS, Number(durationSeconds) || 0);
  const items = Array.isArray(boundaries) ? boundaries : [];

  const wordEvents = items.filter((item) => item.type === "word" || item.type === "punctuation");
  if (wordEvents.length) {
    const cues = [];
    let buffer = "";
    let cueStart = null;
    let cueEnd = 0;

    const flush = () => {
      if (!buffer.trim() || cueStart === null) return;
      const cue = clampCue(cueStart, cueEnd, totalDuration, buffer);
      if (cue) cues.push(cue);
      buffer = "";
      cueStart = null;
      cueEnd = 0;
    };

    for (const event of wordEvents) {
      const piece = String(event.text || "");
      if (!piece) continue;
      const start = Math.max(0, Number(event.startSeconds) || 0);
      const end = Math.max(start, Number(event.endSeconds) || start);
      const isAsciiWord = /^[A-Za-z0-9]/.test(piece);
      const needsSpace =
        buffer.length > 0 &&
        isAsciiWord &&
        /[A-Za-z0-9]$/.test(buffer);
      const nextBuffer = needsSpace ? `${buffer} ${piece}` : `${buffer}${piece}`;

      if (cueStart === null) cueStart = start;
      cueEnd = Math.max(cueEnd, end);

      if (
        buffer.trim().length >= MAX_CUE_CHARS &&
        event.type !== "punctuation" &&
        !STRONG_PUNCTUATION.test(piece) &&
        !WEAK_PUNCTUATION.test(piece)
      ) {
        flush();
        cueStart = start;
        cueEnd = Math.max(start + MIN_CUE_SECONDS, end);
        buffer = piece;
        continue;
      }

      buffer = nextBuffer;
      const charLength = buffer.trim().length;
      if (
        STRONG_PUNCTUATION.test(piece) ||
        (WEAK_PUNCTUATION.test(piece) && charLength >= SOFT_BREAK_CHARS) ||
        charLength >= MAX_CUE_CHARS
      ) {
        flush();
      }
    }
    flush();
    if (cues.length) return cues;
  }

  const sentenceEvents = items.filter((item) => item.type === "sentence" && String(item.text || "").trim());
  if (sentenceEvents.length) {
    const cues = sentenceEvents
      .map((event) =>
        clampCue(
          Number(event.startSeconds) || 0,
          Number(event.endSeconds) || totalDuration,
          totalDuration,
          String(event.text)
        )
      )
      .filter(Boolean);
    if (cues.length) return cues;
  }

  const fallback = clampCue(0, totalDuration, totalDuration, cleanText);
  return fallback ? [fallback] : [];
};

const formatSrtTimestamp = (seconds) => {
  const totalMs = Math.max(0, Math.round((Number(seconds) || 0) * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(secs).padStart(2, "0")},` +
    `${String(ms).padStart(3, "0")}`
  );
};

const formatSrt = (cues) =>
  (cues || [])
    .filter((cue) => cue && String(cue.text || "").trim())
    .map(
      (cue, index) =>
        `${index + 1}\n${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}\n${String(cue.text).trim()}`
    )
    .join("\n\n") + (cues?.length ? "\n" : "");

const createSpeechConfig = ({ apiKey, region, endpoint }) => {
  if (!apiKey || (!region && !endpoint)) {
    throw new SpeechTtsError(
      "尚未設定 Azure AI Speech 語音服務，請聯絡管理員至後台設定",
      "speech_unconfigured",
      503
    );
  }
  const speechConfig = endpoint
    ? sdk.SpeechConfig.fromEndpoint(new URL(endpoint), apiKey)
    : sdk.SpeechConfig.fromSubscription(apiKey, region);
  speechConfig.speechSynthesisOutputFormat =
    sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
  speechConfig.setProperty(
    sdk.PropertyId.SpeechServiceResponse_RequestSentenceBoundary,
    "true"
  );
  return speechConfig;
};

const boundaryKind = (value) => {
  if (value === sdk.SpeechSynthesisBoundaryType.Sentence) return "sentence";
  if (value === sdk.SpeechSynthesisBoundaryType.Punctuation) return "punctuation";
  return "word";
};

const pcmDurationSeconds = (buffer) =>
  buffer.length > WAV_HEADER_BYTES
    ? roundTime((buffer.length - WAV_HEADER_BYTES) / PCM_BYTES_PER_SECOND)
    : 0;

/**
 * Synthesizes Traditional Chinese narration via Azure AI Speech and extracts
 * subtitle cues from its word/sentence boundary events.
 */
const synthesizeSpeech = async ({ text, voice = DEFAULT_SPEECH_VOICE, config }) => {
  const clean = String(text || "").trim();
  if (!clean) throw new SpeechTtsError("旁白文字不可空白", "speech_invalid_input", 400);
  const chosenVoice = isValidSpeechVoice(voice) ? voice : DEFAULT_SPEECH_VOICE;
  const speechConfig = createSpeechConfig(config || {});
  const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
  const boundaries = [];

  synthesizer.wordBoundary = (_sender, event) => {
    const startSeconds = Number(event.audioOffset || 0) / TICKS_PER_SECOND;
    const durationSeconds = Number(event.duration || 0) / TICKS_PER_SECOND;
    boundaries.push({
      type: boundaryKind(event.boundaryType),
      text: event.text || "",
      startSeconds,
      endSeconds: startSeconds + durationSeconds,
    });
  };

  try {
    const result = await new Promise((resolve, reject) => {
      synthesizer.speakSsmlAsync(
        buildSsml(clean, chosenVoice),
        (res) => resolve(res),
        (err) => reject(err)
      );
    });

    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
      const details = result.errorDetails || "Azure AI Speech 合成失敗";
      throw new SpeechTtsError(`旁白合成失敗：${details}`, "speech_synthesis_failed", 502);
    }

    const audioBuffer = Buffer.from(result.audioData);
    const sdkDuration = Number(result.audioDuration || 0) / TICKS_PER_SECOND;
    const durationSeconds = roundTime(sdkDuration > 0 ? sdkDuration : pcmDurationSeconds(audioBuffer));
    if (!audioBuffer.length || durationSeconds <= 0) {
      throw new SpeechTtsError("旁白合成沒有產生有效音訊", "speech_empty_audio", 502);
    }

    const cues = buildSubtitleCues(clean, boundaries, durationSeconds);
    return {
      audioBuffer,
      contentType: "audio/wav",
      durationSeconds,
      cues,
      characters: countNarrationCharacters(clean),
      voice: chosenVoice,
    };
  } catch (caught) {
    if (caught instanceof SpeechTtsError) throw caught;
    throw new SpeechTtsError(
      `無法連線 Azure AI Speech 服務：${caught?.message || "未知錯誤"}`,
      "speech_unreachable",
      502
    );
  } finally {
    synthesizer.close();
  }
};

const TEST_TEXT = "Pixora 智繪台灣中文旁白測試成功。";

const testSpeechConfig = async ({ config, voice = DEFAULT_SPEECH_VOICE }) => {
  const result = await synthesizeSpeech({ text: TEST_TEXT, voice, config });
  return {
    voice: result.voice,
    durationSeconds: result.durationSeconds,
    cueCount: result.cues.length,
    characters: result.characters,
  };
};

module.exports = {
  DEFAULT_SPEECH_VOICE,
  SPEECH_VOICES,
  SPEECH_VOICE_IDS,
  SpeechTtsError,
  buildSsml,
  buildSubtitleCues,
  countNarrationCharacters,
  formatSrt,
  isValidSpeechVoice,
  synthesizeSpeech,
  testSpeechConfig,
};
