import { describe, expect, it, vi } from "vitest";
import { StoryLive2DController } from "./StoryLive2DController";

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
});
