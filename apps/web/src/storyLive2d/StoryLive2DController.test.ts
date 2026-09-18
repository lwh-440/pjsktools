import { afterEach, describe, expect, it, vi } from "vitest";

const howler = vi.hoisted(() => ({
  Howl: vi.fn(function(this: any) {
    Object.assign(this, {
      play: vi.fn(), pause: vi.fn(), stop: vi.fn(), unload: vi.fn(), fade: vi.fn(), once: vi.fn(),
      playing: vi.fn(() => false), volume: vi.fn()
    });
  })
}));

vi.mock("howler", () => howler);
import { StoryLive2DController } from "./StoryLive2DController";

afterEach(() => vi.unstubAllGlobals());

describe("StoryLive2DController cancellation", () => {
  it("does not continue a pending model load after reset", async () => {
    let finishLoading: (failures: string[]) => void = () => undefined;
    const player = {
      loadModels: vi.fn(() => new Promise<string[]>((resolve) => { finishLoading = resolve; })),
      setModelQueue: vi.fn(),
      setVisualState: vi.fn(),
      setCamera: vi.fn(),
      setWipe: vi.fn(),
      destroy: vi.fn()
    } as any;
    const controller = new StoryLive2DController(player, {
      actions: [{ index: 0, type: "Talk", body: "Delayed action" }],
      live2dModels: [],
      modelQueue: [[]]
    } as any, { bgmVolume: 0.3, seVolume: 0.8, voiceVolume: 0.8, textSpeed: 55, fastForward: 1 }, vi.fn(), vi.fn(), vi.fn());

    const pending = controller.execute(0);
    controller.reset();
    finishLoading([]);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(player.setModelQueue).not.toHaveBeenCalled();
  });

  it("does not create a voice while Talk is paused during a pending motion", async () => {
    let finishMotion: () => void = () => undefined;
    const player = {
      findModel: vi.fn(() => ({ costume: "costume", model: { x: 0, y: 0 } })),
      applyModel: vi.fn(() => new Promise<void>((resolve) => { finishMotion = resolve; })),
      app: { renderer: { width: 100, height: 100 } },
      setVisualState: vi.fn(), setCamera: vi.fn(), setWipe: vi.fn(), setSpeaking: vi.fn(), destroy: vi.fn()
    } as any;
    const controller = new StoryLive2DController(player, { actions: [] } as any, {
      bgmVolume: 0.3, seVolume: 0.8, voiceVolume: 0.8, textSpeed: 55, fastForward: 1
    }, vi.fn(), vi.fn(), vi.fn());

    const pending = (controller as any).talk({
      index: 0,
      type: "Talk",
      motions: [{ Character2dId: 1, MotionName: "wave" }],
      voice: { identifier: "voice", url: "https://example.test/voice.mp3" }
    }, 0);
    controller.pause();
    finishMotion();
    await Promise.resolve();

    expect(howler.Howl).not.toHaveBeenCalled();
    controller.reset();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
  it("previews the first Talk without voice, then plays that voice once from the readable step", async () => {
    howler.Howl.mockClear();
    vi.stubGlobal("window", { setTimeout, clearTimeout, setInterval, clearInterval });
    const onOverlay = vi.fn();
    const player = {
      loadModels: vi.fn(async () => []),
      setModelQueue: vi.fn(),
      findModel: vi.fn(() => ({ costume: "costume", model: { x: 0, y: 0 } })),
      applyModel: vi.fn(async () => undefined),
      app: { renderer: { width: 100, height: 100 } },
      setVisualState: vi.fn(), setCamera: vi.fn(), setWipe: vi.fn(), setSpeaking: vi.fn(), destroy: vi.fn()
    } as any;
    const controller = new StoryLive2DController(player, {
      actions: [{
        index: 0,
        type: "Talk",
        windowDisplayName: "Miku",
        body: "Only play this once.",
        motions: [{ Character2dId: 1, MotionName: "wave" }],
        voice: { identifier: "voice", url: "https://example.test/voice.mp3" }
      }],
      live2dModels: [],
      modelQueue: [[]]
    } as any, { bgmVolume: 0.3, seVolume: 0.8, voiceVolume: 0.8, textSpeed: 1, fastForward: 4 }, onOverlay, vi.fn(), vi.fn());

    await controller.initializeThrough(0, { previewTalk: true });

    expect(onOverlay).toHaveBeenLastCalledWith({ speaker: "Miku", body: "Only play this once." });
    expect(player.applyModel).toHaveBeenCalledTimes(1);
    expect(howler.Howl).not.toHaveBeenCalled();

    await controller.playFrom(0, () => false);

    expect(player.applyModel).toHaveBeenCalledTimes(2);
    expect(howler.Howl).toHaveBeenCalledTimes(1);
    controller.pause();
    controller.resume();
    expect(howler.Howl).toHaveBeenCalledTimes(1);
  });
});
