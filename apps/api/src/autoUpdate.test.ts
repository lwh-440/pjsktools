import { afterEach, describe, expect, it, vi } from "vitest";
import { startLoop } from "./autoUpdate.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("startLoop", () => {
  it("runs immediately and skips overlapping intervals", async () => {
    vi.useFakeTimers();
    let finish: (() => void) | undefined;
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const logger = { info: vi.fn(), warn: vi.fn() } as any;

    const timer = startLoop("master", 10_000, task, logger);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { job: "master" },
      "auto update skipped because previous run is still active"
    );

    finish?.();
    await vi.runAllTicks();
    clearInterval(timer);
  });
});
