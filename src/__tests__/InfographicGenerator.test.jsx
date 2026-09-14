import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: null,
  profileError: "",
  isProfileLoading: false,
  document: null,
  generateImage: vi.fn(),
  runTransform: vi.fn(),
  saveHistoryItem: vi.fn(),
  setTransformError: vi.fn(),
  script: null,
  scenes: null,
  bar: null,
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
    analyzedStyle: "", generateImage: mocks.generateImage, isGenerating: false,
    setAnalyzedStyle: vi.fn(), setAnalysisResultData: vi.fn(),
  }),
}));
vi.mock("../hooks/useImageTransform", () => ({
  default: () => ({
    sourcePreview: "source-image", runTransform: mocks.runTransform, isTransforming: false,
    prompt: "transform scene", mode: "style_transfer", aspectRatio: "1:1",
    setTransformError: mocks.setTransformError,
  }),
}));
vi.mock("../hooks/useDocumentAnalysis", () => ({
  default: () => ({
    documentResult: mocks.document, scenes: mocks.document?.scenes || [],
    updateScene: vi.fn(),
  }),
}));
vi.mock("../components/create/ScriptEditor", () => ({
  default: (props) => {
    mocks.script = props;
    return <input aria-label="Script" value={props.userScript} onChange={(event) => props.onUserScriptChange(event.target.value)} />;
  },
}));
vi.mock("../components/create/DocumentScenes", () => ({
  default: (props) => { mocks.scenes = props; return <div>Document scenes</div>; },
}));
vi.mock("../components/create/GenerateBar", async (importOriginal) => {
  const { default: GenerateBar } = await importOriginal();
  return { default: (props) => { mocks.bar = props; return <GenerateBar {...props} />; } };
});
vi.mock("../components/create/ImagePreview", () => ({ default: () => null }));
vi.mock("../components/create/DocumentUploader", () => ({ default: () => null }));
vi.mock("../components/create/PptMasterStudio", () => ({ default: () => null }));
vi.mock("../components/create/ImageTransformPanel", () => ({ default: () => null }));
vi.mock("../components/library/AssetCenter", () => ({ default: () => null }));
vi.mock("../components/common/ThemeToggle", () => ({ default: () => null }));
vi.mock("../components/settings/SettingsPanel", () => ({ default: () => null }));

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
  jobId, model: flare.modelKey, imageUrl: `data:image/png;base64,${jobId}`,
  finalPrompt: "assembled generation", mergedPrompt: "assembled transform",
});

function mount(tab) {
  if (tab === "document") {
    mocks.document = {
      title: "Document",
      scenes: [
        { scene_number: 1, scene_description: "First", visual_prompt: "first scene" },
        { scene_number: 2, scene_description: "Second", visual_prompt: "second scene" },
      ],
    };
  }
  const ui = <MemoryRouter><InfographicGenerator initialTab={tab} /></MemoryRouter>;
  const rendered = render(ui);
  if (tab === "general") fireEvent.change(screen.getByRole("textbox", { name: "Script" }), { target: { value: "User scene" } });
  return { ...rendered, changePolicy: (profile) => {
    mocks.profile = profile;
    rendered.rerender(<MemoryRouter><InfographicGenerator initialTab={tab} /></MemoryRouter>);
  } };
}

const invoke = (tab) => tab === "document"
  ? mocks.scenes.onGenerateScene(0)
  : tab === "general" ? mocks.script.onGenerate() : mocks.bar.onGenerate();

describe("creation orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile = profileFor(flare);
    mocks.profileError = "";
    mocks.isProfileLoading = false;
    mocks.document = null;
    mocks.generateImage.mockResolvedValue(completed("default-job"));
    mocks.runTransform.mockResolvedValue(completed("default-transform-job"));
    mocks.saveHistoryItem.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each(["general", "document", "image-transform"])("saves %s history using the submitted job after policy changes", async (tab) => {
    let finish;
    const request = tab === "image-transform" ? mocks.runTransform : mocks.generateImage;
    request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { changePolicy } = mount(tab);
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

  it("keeps every storyboard scene's job independent across a policy switch", async () => {
    const { changePolicy } = mount("document");
    let finishFirst;
    mocks.generateImage
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ ...completed("scene-2"), model: gpt.modelKey });
    let pending;
    await act(async () => { pending = mocks.bar.onGenerate(); });
    changePolicy(profileFor(gpt));
    await act(async () => { finishFirst(completed("scene-1")); await pending; });
    expect(mocks.generateImage.mock.calls.map(([input]) => input.imageQuality)).toEqual(["auto", "medium"]);
    expect(mocks.saveHistoryItem.mock.calls.map(([input]) => input.jobId)).toEqual(["scene-1", "scene-2"]);
    expect(mocks.saveHistoryItem.mock.calls.map(([input]) => input.source)).toEqual(["document", "document"]);
  });

  it.each(["general", "document", "image-transform"])("guards programmatic %s callbacks and disabled controls when metadata is absent", async (tab) => {
    mocks.profile = { modelPolicy: { defaultModel: null, allowedModels: [] }, imageModels: [gpt] };
    mount(tab);
    expect(screen.getByRole("alert")).toHaveTextContent("請聯絡管理員");
    expect(screen.getByRole("button", { name: tab === "image-transform" ? "開始 AI 轉換" : tab === "document" ? "批次生成所有圖片 (2)" : "開始生成圖片" })).toBeDisabled();
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.runTransform).not.toHaveBeenCalled();
    expect(mocks.saveHistoryItem).not.toHaveBeenCalled();
    if (tab === "document") expect(mocks.scenes.generationDisabled).toBe(true);
    if (tab === "image-transform") expect(mocks.setTransformError).toHaveBeenLastCalledWith(expect.stringContaining("請聯絡管理員"));
  });

  it.each(["general", "document", "image-transform"])("requires choosing again for explicit unsupported quality in %s", async (tab) => {
    const { changePolicy } = mount(tab);
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為最高" }));
    changePolicy(profileFor(gpt));
    expect(screen.getByRole("alert")).toHaveTextContent("請重新選擇圖片品質");
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.runTransform).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為高" }));
    await act(async () => { await invoke(tab); });
    const request = tab === "image-transform" ? mocks.runTransform : mocks.generateImage;
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ imageQuality: "high" }));
  });

  it.each(["general", "document", "image-transform"])("blocks %s with retained stale metadata during and after a failed refresh", async (tab) => {
    const { changePolicy } = mount(tab);
    mocks.isProfileLoading = true;
    changePolicy(mocks.profile);
    expect(mocks.bar.configurationError).toContain("正在載入");
    await act(async () => { await invoke(tab); });
    mocks.isProfileLoading = false;
    mocks.profileError = "Catalog refresh failed";
    changePolicy(mocks.profile);
    expect(mocks.bar.configurationError).toBe("Catalog refresh failed");
    expect(screen.getByRole("button", { name: tab === "image-transform" ? "開始 AI 轉換" : tab === "document" ? "批次生成所有圖片 (2)" : "開始生成圖片" })).toBeDisabled();
    await act(async () => { await invoke(tab); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
    expect(mocks.runTransform).not.toHaveBeenCalled();
    expect(mocks.saveHistoryItem).not.toHaveBeenCalled();

    mocks.profileError = "";
    const updated = { ...flare, supportedQualities: ["low", "high"], defaultQuality: "high" };
    changePolicy({ ...profileFor(flare), imageModels: [updated] });
    await act(async () => { await invoke(tab); });
    const request = tab === "image-transform" ? mocks.runTransform : mocks.generateImage;
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ imageQuality: "high" }));
  });

  it("requires choosing again when catalog capabilities change without a policy switch", async () => {
    const { changePolicy } = mount("general");
    fireEvent.click(screen.getByRole("button", { name: "設定圖片品質為最高" }));
    changePolicy({
      ...profileFor(flare),
      imageModels: [{ ...flare, supportedQualities: ["low", "high"], defaultQuality: "high" }],
    });
    expect(screen.getByRole("alert")).toHaveTextContent("請重新選擇圖片品質");
    await act(async () => { await invoke("general"); });
    expect(mocks.generateImage).not.toHaveBeenCalled();
  });
});
