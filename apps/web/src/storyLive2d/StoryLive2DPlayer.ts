import { Application, Container, Graphics, Sprite, Texture, filters } from "pixi.js";
import { apiResourceUrl } from "../api";
import type { StoryModel, StoryOverlayState } from "./types";

type ModelEntry = { definition: StoryModel; model: any; cid: number; costume: string; hidden: boolean; xPercent: number; yPercent: number; layoutMode: number };

export class StoryLive2DPlayer {
  readonly app: Application;
  readonly root = new Container();
  readonly layers = {
    background: new Container(),
    live2d: new Container(),
    sceneEffect: new Container(),
    memory: new Container(),
    ambient: new Container(),
    wipe: new Container(),
    fullcolor: new Container(),
    movie: new Container()
  };
  readonly models = new Map<string, ModelEntry>();
  camera = { x: 0, y: 0, zoom: 1 };
  private background?: Sprite;
  private overlay?: Graphics;
  private movieElement?: HTMLVideoElement;
  private movieSprite?: Sprite;
  private resizeObserver?: ResizeObserver;
  private resizeFrame?: number;
  private visualState: StoryOverlayState = {};
  private wipeDirection?: string;
  private readonly canvas: HTMLCanvasElement;

  constructor(private readonly host: HTMLElement) {
    this.app = new Application({ backgroundAlpha: 0, antialias: true, resizeTo: host });
    this.canvas = this.app.view as HTMLCanvasElement;
    host.replaceChildren(this.canvas);
    this.app.stage.addChild(this.root);
    this.root.addChild(
      this.layers.background,
      this.layers.live2d,
      this.layers.sceneEffect,
      this.layers.memory,
      this.layers.ambient,
      this.layers.wipe,
      this.layers.fullcolor,
      this.layers.movie
    );
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = requestAnimationFrame(() => this.syncViewport());
    });
    this.resizeObserver.observe(host);
    this.syncViewport();
  }

  async loadModels(definitions: StoryModel[], onProgress?: (completed: number, total: number, info?: string) => void) {
    const runtime = await import("@sekai-world/pixi-live2d-display-mulmotion/cubism4");
    const Live2DModel = (runtime as any).Live2DModel;
    let completed = 0;
    const failures: string[] = [];
    for (const definition of definitions) {
      if (!definition.rewrittenModel3JsonUrl || !definition.costumeType) continue;
      try {
        const model = await Live2DModel.from(apiResourceUrl(definition.rewrittenModel3JsonUrl), { autoInteract: false });
        model.anchor?.set?.(0.5, 0.5);
        model.visible = false;
        model.eventMode = "none";
        this.layers.live2d.addChild(model);
        const entry = { definition, model, cid: Number(definition.character2dId ?? 0), costume: definition.costumeType, hidden: true, xPercent: 50, yPercent: 62, layoutMode: 0 };
        this.models.set(definition.costumeType, entry);
        this.layoutModel(entry, 50, 62, 0);
      } catch (error) {
        failures.push(`${definition.costumeType}: ${error instanceof Error ? error.message : String(error)}`);
      }
      completed += 1;
      onProgress?.(completed, definitions.length, definition.costumeType);
    }
    return failures;
  }

  setModelQueue(costumes: string[]) {
    for (const [costume, entry] of this.models) {
      if (!costumes.includes(costume)) {
        entry.model.visible = false;
        entry.hidden = true;
      }
    }
  }

  findModel(cid?: number, costume?: string) {
    if (costume && this.models.has(costume)) return this.models.get(costume);
    return [...this.models.values()].find((entry) => entry.cid === Number(cid));
  }

  private layoutModel(entry: ModelEntry, xPercent: number, yPercent: number, layoutMode: number) {
    const width = this.app.renderer.width || Math.max(1, this.host.clientWidth) || 1280;
    const height = this.app.renderer.height || Math.max(1, this.host.clientHeight) || 720;
    const bounds = entry.model.getLocalBounds?.() ?? { width: 1000, height: 1800 };
    const scale = Math.min(width / Math.max(bounds.width, 1), height / Math.max(bounds.height, 1)) * (layoutMode === 3 ? 0.72 : 0.9);
    entry.xPercent = xPercent;
    entry.yPercent = yPercent;
    entry.layoutMode = layoutMode;
    entry.model.scale.set(scale);
    entry.model.position.set(width * xPercent / 100, height * yPercent / 100);
  }

  async applyModel(cid: number | undefined, costume: string | undefined, x: number, y: number, visible: boolean, motion?: string, expression?: string, layoutMode = 0) {
    const entry = this.findModel(cid, costume);
    if (!entry) return false;
    entry.model.visible = visible;
    entry.hidden = !visible;
    this.layoutModel(entry, x, y, layoutMode);
    if (visible) {
      await Promise.allSettled([
        motion ? this.playMotion(entry, motion) : Promise.resolve(),
        expression ? this.playExpression(entry, expression) : Promise.resolve()
      ]);
    }
    return true;
  }

  async playMotion(entry: ModelEntry, name: string) {
    const clean = name.replaceAll(" ", "");
    const definitions = entry.model.internalModel?.motionManager?.definitions ?? {};
    const matched = Object.entries(definitions).flatMap(([group, items]) =>
      (Array.isArray(items) ? items : []).map((item: any, index) => ({
        group,
        index,
        file: String(item?.File ?? item?.file ?? item?.Name ?? item?.name ?? "").replaceAll(" ", "")
      }))
    ).find((item) => item.file.includes(clean) || clean.includes(item.file.replace(/\.(motion3|mtn)\.json$/i, "")));
    const group = matched?.group ?? Object.keys(definitions)[0];
    if (!group) throw new Error(`Motion group unavailable for ${name}`);
    const index = matched?.index ?? 0;
    if (entry.model.motion) await entry.model.motion(group, index);
    else await entry.model.internalModel?.motionManager?.startMotion?.(group, index);
  }

  async playExpression(entry: ModelEntry, name: string) {
    const clean = name.replaceAll(" ", "");
    const expressions = entry.definition.expressions ?? [];
    const index = Math.max(0, expressions.findIndex((item) => item === clean));
    if (entry.model.expression) await entry.model.expression(index);
    else await entry.model.internalModel?.motionManager?.expressionManager?.setExpression?.(index);
  }

  setSpeaking(cid: number | undefined, active: boolean) {
    const entry = this.findModel(cid);
    const core = entry?.model?.internalModel?.coreModel;
    if (!core?.setParameterValueById) return;
    core.setParameterValueById("ParamMouthOpenY", active ? 0.65 : 0);
  }

  async setBackground(url?: string) {
    if (!url) return;
    const texture = await Texture.fromURL(url);
    this.background?.destroy();
    this.background = new Sprite(texture);
    this.background.width = this.app.renderer.width;
    this.background.height = this.app.renderer.height;
    this.layers.background.removeChildren();
    this.layers.background.addChild(this.background);
    this.render();
  }

  setCamera(x = 0, y = 0, zoom = 1) {
    this.camera = { x, y, zoom };
    this.root.pivot.set(this.app.renderer.width / 2, this.app.renderer.height / 2);
    this.root.position.set(this.app.renderer.width / 2 + x, this.app.renderer.height / 2 + y);
    this.root.scale.set(zoom);
    this.render();
  }

  setVisualState(state: StoryOverlayState) {
    this.visualState = { ...state };
    this.layers.memory.alpha = state.memory ? 0.28 : 0;
    this.layers.ambient.alpha = state.ambient && state.ambient !== "normal" ? 0.22 : 0;
    const color = state.ambient === "evening" ? 0xffb45e : 0x638dff;
    this.fillLayer(this.layers.ambient, color, state.ambient && state.ambient !== "normal" ? 0.22 : 0);
    this.fillLayer(this.layers.memory, 0xffd88a, state.memory ? 0.2 : 0);
    this.root.filters = state.blur ? [new filters.BlurFilter(5)] : [];
    if (state.tone) this.fillLayer(this.layers.fullcolor, state.tone === "black" ? 0x000000 : 0xffffff, 1);
    else this.layers.fullcolor.removeChildren();
    this.render();
  }

  setWipe(direction?: string) {
    this.wipeDirection = direction;
    this.layers.wipe.removeChildren();
    if (!direction) return;
    const value = new Graphics();
    value.beginFill(0x000000, 1).drawRect(0, 0, this.app.renderer.width, this.app.renderer.height).endFill();
    this.layers.wipe.addChild(value);
    this.render();
  }

  setMovie(video?: HTMLVideoElement) {
    this.layers.movie.removeChildren();
    this.movieElement = video;
    this.movieSprite = undefined;
    if (!video) { this.render(); return; }
    const sprite = Sprite.from(video);
    sprite.width = this.app.renderer.width;
    sprite.height = this.app.renderer.height;
    this.movieSprite = sprite;
    this.layers.movie.addChild(sprite);
    void video.play().catch(() => undefined);
    this.render();
  }

  private fillLayer(layer: Container, color: number, alpha: number) {
    layer.removeChildren();
    if (!alpha) return;
    const value = new Graphics();
    value.beginFill(color, alpha).drawRect(0, 0, this.app.renderer.width, this.app.renderer.height).endFill();
    layer.addChild(value);
    this.overlay = value;
  }

  syncViewport() {
    const width = Math.max(1, Math.round(this.host.clientWidth));
    const height = Math.max(1, Math.round(this.host.clientHeight));
    if (this.app.renderer.width !== width || this.app.renderer.height !== height) this.app.renderer.resize(width, height);
    if (this.background) { this.background.width = width; this.background.height = height; }
    if (this.movieSprite) { this.movieSprite.width = width; this.movieSprite.height = height; }
    for (const entry of this.models.values()) this.layoutModel(entry, entry.xPercent, entry.yPercent, entry.layoutMode);
    this.setVisualState(this.visualState);
    this.setWipe(this.wipeDirection);
    this.setCamera(this.camera.x, this.camera.y, this.camera.zoom);
    this.render();
  }

  hasVisiblePixels() {
    try {
      const context2d = this.canvas.getContext("2d");
      if (context2d) return [...context2d.getImageData(0, 0, Math.min(96, this.canvas.width), Math.min(96, this.canvas.height)).data].some((value, index) => index % 4 === 3 && value > 8);
      const gl = this.canvas.getContext("webgl2") ?? this.canvas.getContext("webgl");
      if (!gl) return true;
      const width = Math.min(96, this.canvas.width); const height = Math.min(96, this.canvas.height);
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      for (let index = 3; index < pixels.length; index += 4) if (pixels[index] > 8) return true;
      return false;
    } catch { return true; }
  }

  private render() {
    try { this.app.renderer.render(this.app.stage); } catch { /* Pixi schedules a render when the context is not ready yet. */ }
  }

  destroy() {
    if (this.resizeFrame) cancelAnimationFrame(this.resizeFrame);
    this.resizeObserver?.disconnect();
    this.movieElement?.pause();
    for (const entry of this.models.values()) entry.model.destroy?.({ children: true });
    this.models.clear();
    this.app.destroy(true, { children: true, texture: false, baseTexture: false });
    if (this.host.contains(this.canvas)) this.host.replaceChildren();
  }
}
