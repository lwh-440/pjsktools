import { Application } from "pixi.js";
import { Live2DModel } from "@sekai-world/pixi-live2d-display-mulmotion/cubism4";

export type RuntimeModel = any;
export type RuntimeProgress = { stage: "runtime" | "model" | "render"; message: string };

export class Live2DRuntimeStage {
  readonly app: Application;
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  constructor(private readonly host: HTMLElement) {
    this.app = new Application({ backgroundAlpha: 0, antialias: true, resizeTo: host });
    host.replaceChildren(this.app.view as HTMLCanvasElement);
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.destroyed) this.app.renderer.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    });
    this.resizeObserver.observe(host);
  }

  async loadModel(url: string, signal?: AbortSignal, onProgress?: (progress: RuntimeProgress) => void) {
    onProgress?.({ stage: "runtime", message: "正在初始化 Cubism 运行时" });
    if (signal?.aborted || this.destroyed) throw new DOMException("Live2D load cancelled", "AbortError");
    onProgress?.({ stage: "model", message: "正在加载模型与纹理" });
    const model = await (Live2DModel as any).from(url, { autoInteract: false });
    if (signal?.aborted || this.destroyed) {
      model.destroy?.({ children: true });
      throw new DOMException("Live2D load cancelled", "AbortError");
    }
    this.app.stage.addChild(model);
    onProgress?.({ stage: "render", message: "正在准备画布" });
    return model;
  }

  fit(model: RuntimeModel, scaleMultiplier = 0.9) {
    const width = Math.max(1, this.app.renderer.width);
    const height = Math.max(1, this.app.renderer.height);
    const bounds = model.getLocalBounds?.() ?? { width: 1000, height: 1800 };
    const scale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * scaleMultiplier;
    model.anchor?.set?.(0.5, 0.5);
    model.scale.set(scale);
    model.position.set(width / 2, height * 0.55);
    return scale;
  }

  hasVisiblePixels() {
    try {
      const canvas = this.app.view as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) return true;
      const width = Math.min(canvas.width, 96);
      const height = Math.min(canvas.height, 96);
      const pixels = context.getImageData(0, 0, width, height).data;
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) return true;
      return false;
    } catch {
      return true;
    }
  }

  destroyModel(model?: RuntimeModel) {
    if (!model) return;
    this.app.stage.removeChild(model);
    model.destroy?.({ children: true });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.app.destroy(true, { children: true, texture: false, baseTexture: false });
    this.host.replaceChildren();
  }
}
