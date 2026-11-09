import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: null,
  profileError: "",
  isProfileLoading: false,
  generateImage: vi.fn(),
  transformImage: vi.fn(),
  uploadFile: vi.fn(),
  saveHistoryItem: vi.fn(),
  script: null,
  bar: null,
  preview: null,
  imageUrlToFile: vi.fn(),
  chatArgs: null,
  chatWorkspace: null,
}));

vi.mock("../hooks/useAuth", () => ({
  default: () => ({
    user: { id: "user-1", displayName: "Admin" }, profile: mocks.profile, isAdmin: true,
    isLoading: false, isProfileLoading: mocks.isProfileLoading, profileError: mocks.profileError, refreshProfile: vi.fn(),
  }),
}));
vi.mock("../hooks/useStyles", () => ({ default: () => ({ savedStyles: [] }) }));
vi.mock("../hooks/useTemplates", () => ({ default: () => ({ templates: [] }) }));
vi.mock("../hooks/useHistory", () => ({
  default: () => ({ historyItems: [], saveHistoryItem: mocks.saveHistoryItem }),
}));
vi.mock("../hooks/useImageGeneration", () => ({
  default: () => ({
    analyzedStyle: "", generateImage: mocks.generateImage, transformImage: mocks.transformImage,
    isGenerating: false, setAnalyzedStyle: vi.fn(), setAnalysisResultData: vi.fn(),
  }),
}));
vi.mock("../services/storageService", () => ({ uploadFile: mocks.uploadFile }));
vi.mock("../lib/imageFile", async (importOriginal) => ({
  ...(await importOriginal()),
  readFileAsDataUrl: vi.fn(async () => "data:image/png;base64,attached"),
  readImageSize: vi.fn(async () => ({ width: 1200, height: 900 })),
  imageUrlToFile: mocks.imageUrlToFile,
}));
vi.mock("../components/create/ScriptEditor", () => ({
  default: (props) => {
    mocks.script = props;
    return <input aria-label="Script" value={props.userScript} onChange={(event) => props.onUserScriptChange(event.target.value)} />;
  },
}));
vi.mock("../components/create/GenerateBar", async (importOriginal) => {
  const { default: GenerateBar } = await importOriginal();
  return { default: (props) => { mocks.bar = props; return <GenerateBar {...props} />; } };
});
vi.mock("../components/create/ImagePreview", () => ({ default: (props) => { mocks.preview = props; return null; } }));
vi.mock("../components/create/PptMasterStudio", () => ({ default: () => null }));
vi.mock("../components/library/AssetCenter", () => ({ default: () => null }));
vi.mock("../hooks/useImageChat", () => ({
  default: (args) => { mocks.chatArgs = args; return { id: "chat-state" }; },
}));
vi.mock("../components/chat/ChatWorkspace", () => ({
  default: (props) => { mocks.chatWorkspace = props; return <div>Chat workspace</div>; },
}));

import InfographicGenerator from "../InfographicGenerator";

const gpt = {
  modelKey: "gpt-image-2", label: "GPT Image 2", apiType: "azure-openai-images-v1",
  supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
};
const flare = {
  modelKey: "gpt-image-2.5-flare", label: "Flare", apiType: "azure-openai-images-v1",
  supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"], defaultQuality: "auto",
};
const profileFor = (model) => ({
  modelPolicy: { allowedModels: [gpt.modelKey, flare.modelKey], defaultModel: model.modelKey },
  imageModels: [gpt, flare],
});
const completed = (jobId) => ({
  images: [{
    jobId, model: flare.modelKey, imageUrl: `data:image/png;base64,${jobId}`,
    finalPrompt: "assembled generation",
  }],
  failures: [],
});

async function attach(purpose) {
  const file = new File(["image"], "photo.png", { type: "image/png" });
  await act(async () => { await mocks.script.imageInputsSlot.props.onAttachFile(file); });
  if (purpose) act(() => { mocks.script.imageInputsSlot.props.onPurposeChange(purpose); });
}

async function mount(tab) {
  const ui = <MemoryRouter><InfographicGenerator initialTab={tab === "refine" ? "general" : tab} /></MemoryRouter>;
  const rendered = render(ui);
  fireEvent.change(screen.getByRole("textbox", { name: "Script" }), { target: { value: "User scene" } });
  if (tab === "refine") await attach("refine");
  return { ...rendered, changePolicy: (profile) => {
    mocks.profile = profile;
    rendered.rerender(<MemoryRouter><InfographicGenerator initialTab={tab === "refine" ? "general" : tab} /></MemoryRouter>);
  } };
}

const invoke = () => mocks.script.onGenerate();
const requestFor = (tab) => tab === "refine" ? mocks.transformImage : mocks.generateImage;
const buttonFor = (tab) => tab === "refine" ? "修改這張" : "開始生成圖片";

describe("creation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.profile = profileFor(flare);
    mocks.profileError = "";
    mocks.isProfileLoading = false;
    mocks.generateImage.mockResolvedValue(completed("default-job"));
    mocks.transformImage.mockResolvedValue(completed("default-transform-job"));
    mocks.uploadFile.mockResolvedValue({ uploadId: "upload-1" });
    mocks.saveHistoryItem.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the chat workspace without the generate bar and loads chats only on that tab", () => {
    localStorage.setItem("genpic_image_language", "none");
    render(<MemoryRouter><InfographicGenerator initialTab="chat" /></MemoryRouter>);

    expect(screen.getByText("Chat workspace")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "開始生成圖片" })).toBeNull();
    expect(mocks.chatArgs).toMatchObject({
      enabled: true,
      initialSettings: { aspectRatio: "16:9", quality: null, imageLanguage: "none", purpose: "infographic" },
    });
    expect(mocks.chatWorkspace).toMatchObject({
      chat: { id: "chat-state" },
      imageModelConfig: flare,
      modelSetupError: "",
    });
  });

  it("falls back to the default language when the stored one is no longer offered", () => {
    localStorage.setItem("genpic_image_language", "fr");
    render(<MemoryRouter><InfographicGenerator initialTab="chat" /></MemoryRouter>);

    expect(mocks.chatArgs.initialSettings.imageLanguage).toBe("zh-TW");
  });

  it.each(["general", "refine"])("saves %s history using the submitted job after policy changes", async (tab) => {
    let finish;
    const request = requestFor(tab);
    request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { changePolicy } = await mount(tab);
    let pending;
    await act(async () => { pending = invoke(tab); });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toMatchObject({ imageQuality: "auto" });
    expect(request.mock.calls[0][0]).not.toHaveProperty("model");
    changePolicy(profileFor(gpt));
    await act(async () => { finish(completed(`original-${tab}`)); await pending; });
    expect(mocks.saveHistoryItem).toHaveBeenCalledWith(expect.objectContaining({
      jobId: `original-${tab}`, imageUrl: `data:image/png;base64,original-${tab}`, source: tab,
    }));
    expect(mocks.saveHistoryItem.mock.calls[0][0]).not.toHaveProperty("model");
  });

  it.each(["general", "refine"])("guards programmatic %s callbacks and disabled controls when metadata is absent", async (tab) => {
    mocks.profile = { modelPolicy: { defaultModel: null, allowedModels: [] }, imageModels: [gpt] };
    await mount(tab);
    expect(screen.getByRole("alert")).toHaveTextContent("請聯絡管理員");
    expect(screen.getByRole("button", { name: buttonFor(tab) })).toBeDisabled();
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.transformImage).not.toHaveBeenCalled();
    expect(mocks.saveHistoryItem).not.toHaveBeenCalled();
  });

  it.each(["general", "refine"])("requires choosing again for explicit unsupported quality in %s", async (tab) => {
    const { changePolicy } = await mount(tab);
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為最高" }));
    changePolicy(profileFor(gpt));
    expect(screen.getByRole("alert")).toHaveTextContent("請重新選擇圖片品質");
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.transformImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為高" }));
    await act(async () => { await invoke(tab); });
    const request = requestFor(tab);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ imageQuality: "high" }));
  });

  it.each(["general", "refine"])("blocks %s with retained stale metadata during and after a failed refresh", async (tab) => {
    const { changePolicy } = await mount(tab);
    mocks.isProfileLoading = true;
    changePolicy(mocks.profile);
    expect(mocks.bar.configurationError).toContain("正在載入");
    await act(async () => { await invoke(tab); });
    mocks.isProfileLoading = false;
    mocks.profileError = "Catalog refresh failed";
    changePolicy(mocks.profile);
    expect(mocks.bar.configurationError).toBe("無法載入圖片模型設定，請重新載入設定。");
    expect(screen.getByRole("button", { name: buttonFor(tab) })).toBeDisabled();
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.transformImage).not.toHaveBeenCalled();
    expect(mocks.saveHistoryItem).not.toHaveBeenCalled();

    mocks.profileError = "";
    const updated = { ...flare, supportedQualities: ["low", "high"], defaultQuality: "high" };
    changePolicy({ ...profileFor(flare), imageModels: [updated] });
    await act(async () => { await invoke(tab); });
    const request = requestFor(tab);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ imageQuality: "high" }));
  });

  it("shares the no-text mode between the generate bar, the editor and the request", async () => {
    await mount("general");
    fireEvent.click(screen.getByRole("button", { name: "無文字" }));
    expect(mocks.script.imageLanguage).toBe("none");
    expect(localStorage.getItem("genpic_image_language")).toBe("none");
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ imageLanguage: "none" }));
    act(() => { mocks.script.onImageLanguageChange("zh-TW"); });
    expect(screen.getByRole("button", { name: "繁中" })).toHaveAttribute("aria-pressed", "true");
  });

  it("generates the chosen number of variants and reports the ones that failed", async () => {
    await mount("general");
    expect(mocks.bar.variantCount).toBe(1);
    act(() => { mocks.bar.onVariantCountChange(3); });
    mocks.generateImage.mockResolvedValueOnce({
      ...completed("variant-1"), failures: [new Error("quota"), new Error("quota")],
    });
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ count: 3 }));
    expect(screen.getByText("3 張中有 2 張生成失敗，已顯示其餘成功的圖片。")).toBeInTheDocument();
  });

  it("requires choosing again when catalog capabilities change without a policy switch", async () => {
    const { changePolicy } = await mount("general");
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為最高" }));
    changePolicy({
      ...profileFor(flare),
      imageModels: [{ ...flare, supportedQualities: ["low", "high"], defaultQuality: "high" }],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("請重新選擇圖片品質");
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });

  it("sends an attachment used as content reference to generation", async () => {
    await mount("general");
    await attach();
    expect(mocks.bar.aspectRatioLocked).toBe(false);
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ referenceUploadId: "upload-1" }));
    expect(mocks.transformImage).not.toHaveBeenCalled();
  });

  it("routes transform purposes through image-transform with the source aspect ratio", async () => {
    await mount("general");
    await attach("bg_replace");
    expect(mocks.bar.aspectRatioLocked).toBe(true);
    expect(screen.getByRole("button", { name: "換背景" })).toBeEnabled();
    await act(async () => { await invoke("general"); });
    expect(mocks.transformImage).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: "upload-1", mode: "bg_replace", prompt: "User scene", aspectRatio: "4:3",
    }));
    expect(mocks.saveHistoryItem).toHaveBeenCalledWith(expect.objectContaining({ source: "bg_replace" }));
  });

  it("returns to plain generation when the attachment is removed", async () => {
    await mount("general");
    await attach("refine");
    expect(mocks.script.attachmentPurpose.id).toBe("refine");
    act(() => { mocks.script.imageInputsSlot.props.onClearAttachment(); });
    expect(mocks.script.attachmentPurpose).toBeNull();
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ referenceUploadId: null }));
  });

  it("keeps the style reference image out of the content reference", async () => {
    await mount("general");
    const file = new File(["style"], "style.png", { type: "image/png" });
    await act(async () => { await mocks.script.imageInputsSlot.props.onStyleReferenceUpload(file); });
    expect(mocks.script.imageInputsSlot.props.styleReferencePreview).toBe("data:image/png;base64,attached");
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).toHaveBeenCalledWith(expect.objectContaining({ referenceUploadId: null }));
  });

  it("refines the shown result into a version chain, uploading each version once", async () => {
    mocks.imageUrlToFile.mockResolvedValue(new File(["v1"], "v1.png", { type: "image/png" }));
    mocks.transformImage
      .mockResolvedValueOnce(completed("refine-1"))
      .mockResolvedValueOnce(completed("refine-2"));
    await mount("general");
    await act(async () => { await invoke("general"); });
    expect(mocks.preview.generatedImage).toBe("data:image/png;base64,default-job");

    let ok;
    await act(async () => { ok = await mocks.preview.onRefine("把衣服改成黃色"); });
    expect(ok).toBe(true);
    expect(mocks.imageUrlToFile).toHaveBeenCalledWith("data:image/png;base64,default-job", expect.any(String));
    expect(mocks.transformImage).toHaveBeenCalledWith(expect.objectContaining({
      uploadId: "upload-1", mode: "refine", prompt: "把衣服改成黃色", aspectRatio: "4:3", imageQuality: "auto",
    }));
    expect(mocks.saveHistoryItem).toHaveBeenLastCalledWith(expect.objectContaining({ jobId: "refine-1", source: "refine" }));
    expect(mocks.preview.generatedImage).toBe("data:image/png;base64,refine-1");

    const [root] = mocks.preview.versionRows[0].items;
    act(() => { mocks.preview.onSelectVersion(root.id); });
    expect(mocks.preview.generatedImage).toBe("data:image/png;base64,default-job");
    await act(async () => { await mocks.preview.onRefine("換成夜景"); });
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
    expect(mocks.preview.versionRows.map((row) => row.items.length)).toEqual([2, 1]);
    expect(mocks.preview.versionRows[1].fromId).toBe(root.id);
  });

  it("shows refinement failures inline and keeps the current image", async () => {
    mocks.imageUrlToFile.mockResolvedValue(new File(["v1"], "v1.png", { type: "image/png" }));
    mocks.transformImage.mockRejectedValueOnce(new Error("模型忙碌"));
    await mount("general");
    await act(async () => { await invoke("general"); });
    await act(async () => { await mocks.preview.onRefine("改色"); });
    expect(mocks.preview.refineError).toBe("模型忙碌");
    expect(mocks.preview.generatedImage).toBe("data:image/png;base64,default-job");
  });

  it("suggests refining when the prompt barely changes after a result", async () => {
    await mount("general");
    expect(mocks.bar.onSuggestRefine).toBeUndefined();
    await act(async () => { await invoke("general"); });
    expect(mocks.bar.onSuggestRefine).toEqual(expect.any(Function));
    fireEvent.change(screen.getByRole("textbox", { name: "Script" }), { target: { value: "User scenes" } });
    expect(mocks.bar.onSuggestRefine).toEqual(expect.any(Function));
    fireEvent.change(screen.getByRole("textbox", { name: "Script" }), { target: { value: "完全不同的海報主題" } });
    expect(mocks.bar.onSuggestRefine).toBeUndefined();
  });

  it("opens the expanded canvas from the preview and closes it with Esc", async () => {
    await mount("general");
    await act(async () => { await invoke("general"); });
    act(() => { mocks.preview.onExpand({ left: 0, top: 0, width: 400, height: 300 }); });
    expect(document.querySelector("[data-expanded-canvas]")).toHaveTextContent("v1");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-expanded-canvas]")).toBeNull());
  });

  describe("phone layout", () => {
    beforeEach(() => {
      mocks.preview = null;
      vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
        matches: query === "(max-width: 1023.98px)", media: query,
        addEventListener: () => {}, removeEventListener: () => {},
      }));
    });

    it("opens the result full screen after generating and leaves it with the back button", async () => {
      await mount("general");
      expect(mocks.preview).toBeNull();
      expect(mocks.bar.compact).toBe(true);
      await act(async () => { await invoke("general"); });
      const view = document.querySelector("[data-mobile-result]");
      expect(view).not.toBeNull();
      expect(mocks.preview.generatedImage).toBe("data:image/png;base64,default-job");

      fireEvent.click(screen.getByRole("button", { name: "編輯" }));
      await waitFor(() => expect(document.querySelector("[data-mobile-result]")).toBeNull());
      fireEvent.click(screen.getByRole("button", { name: "查看生成結果" }));
      expect(document.querySelector("[data-mobile-result]")).not.toBeNull();
    });

    it("opens the result view when the refine hint is tapped", async () => {
      await mount("general");
      await act(async () => { await invoke("general"); });
      fireEvent.click(screen.getByRole("button", { name: "編輯" }));
      await waitFor(() => expect(document.querySelector("[data-mobile-result]")).toBeNull());

      fireEvent.click(screen.getByRole("button", { name: /只改一小部分/ }));
      expect(document.querySelector("[data-mobile-result]")).not.toBeNull();
    });
  });
});
