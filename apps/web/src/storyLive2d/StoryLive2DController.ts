import { Howl } from "howler";
import { apiResourceUrl } from "../api";
import { StoryLive2DPlayer } from "./StoryLive2DPlayer";
import type { MediaAsset, ScenarioAction, StoryOverlayState, StoryPlaybackContext } from "./types";

export type ControllerSettings = { bgmVolume: number; seVolume: number; voiceVolume: number; textSpeed: number; fastForward: number };

function mediaUrl(asset?: MediaAsset) {
  return apiResourceUrl(asset?.proxiedUrl ?? asset?.url);
}

function sideToPosition(side?: number, offset = 0) {
  const x = side === 2 ? -20 : side === 3 ? 30 : side === 6 ? 120 : side === 7 ? 70 : 50;
  const y = side === 9 || side === 10 || side === 11 ? 118 : 62;
  return { x: x + offset / 20, y };
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Cancelled", "AbortError"));
    const timer = window.setTimeout(resolve, Math.max(0, ms));
    signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
  });
}

export class StoryLive2DController {
  private abortController = new AbortController();
  private step = 0;
  private layoutMode = 0;
  private overlay: StoryOverlayState = {};
  private bgm?: Howl;
  private sounds = new Map<string, Howl>();
  private speakingTimer?: number;

  constructor(
    readonly player: StoryLive2DPlayer,
    readonly playback: StoryPlaybackContext,
    private settings: ControllerSettings,
    private readonly onOverlay: (state: StoryOverlayState) => void,
    private readonly onStep: (step: number) => void,
    private readonly onWarning: (warning: string) => void
  ) {}

  setSettings(settings: ControllerSettings) {
    this.settings = settings;
    this.bgm?.volume(settings.bgmVolume);
  }

  async execute(index: number) {
    const actions = this.playback.actions ?? [];
    const action = actions[index];
    if (!action) return;
    this.step = index;
    this.onStep(index);
    this.player.setModelQueue(this.playback.modelQueue?.[index] ?? []);
    await wait(Number(action.delay ?? 0) * 1000 / this.settings.fastForward, this.abortController.signal);
    await this.executeAction(action);
  }

  async playFrom(index: number, shouldContinue: () => boolean) {
    for (let current = index; current < (this.playback.actions?.length ?? 0); current += 1) {
      if (!shouldContinue() || this.abortController.signal.aborted) return;
      await this.execute(current);
      const action = this.playback.actions?.[current];
      if (action?.type === "Talk") await wait(Math.max(350, this.settings.textSpeed * String(action.body ?? "").length) / this.settings.fastForward, this.abortController.signal);
      else if (action?.isWait) await wait(Math.max(120, Number(action.duration ?? 0) * 1000) / this.settings.fastForward, this.abortController.signal);
    }
  }

  private async executeAction(action: ScenarioAction) {
    switch (action.type) {
      case "Talk": return this.talk(action);
      case "Sound": return this.sound(action);
      case "CharacterLayout": return this.layout(action);
      case "CharacterMotion": return this.motion(action);
      case "ActionLayoutMode": this.layoutMode = Number(action.characterLayoutMode ?? 0); return;
      case "SpecialEffect": return this.specialEffect(action);
      default: this.onWarning(`Unsupported action: ${action.type}`);
    }
  }

  private async talk(action: ScenarioAction) {
    this.updateOverlay({ speaker: action.windowDisplayName, body: action.body });
    const motions = action.motions ?? [];
    await Promise.all(motions.map(async (motion) => {
      const entry = this.player.findModel(motion.Character2dId);
      if (!entry) return;
      await this.player.applyModel(motion.Character2dId, entry.costume, entry.model.x / Math.max(this.player.app.renderer.width, 1) * 100, entry.model.y / Math.max(this.player.app.renderer.height, 1) * 100, true, motion.MotionName, motion.FacialName, this.layoutMode);
    }));
    const url = mediaUrl(action.voice);
    if (!url) return;
    const speakerId = Number((action.motions?.[0] as any)?.Character2dId ?? 0);
    const voice = new Howl({
      src: [url], volume: this.settings.voiceVolume, html5: false,
      onplay: () => this.startLipSync(speakerId),
      onend: () => this.stopLipSync(speakerId),
      onloaderror: () => this.onWarning(`Voice unavailable: ${action.voice?.identifier}`)
    });
    voice.play();
    this.sounds.set(`voice:${action.index}`, voice);
  }

  private async sound(action: ScenarioAction) {
    const duration = Math.max(0, Number(action.duration ?? 0) * 1000);
    if (Number(action.playMode) === 4) {
      this.bgm?.fade(this.bgm.volume(), this.settings.bgmVolume * Number(action.volume ?? 1), duration || 1);
      return;
    }
    if (Number(action.playMode) === 3 && action.se?.identifier) {
      this.sounds.get(`se:${action.se.identifier}`)?.fade(this.settings.seVolume, 0, duration || 1);
      return;
    }
    if (action.bgm) {
      const url = mediaUrl(action.bgm);
      if (url) {
        const next = new Howl({ src: [url], loop: true, volume: 0, html5: false, onloaderror: () => this.onWarning(`BGM unavailable: ${action.bgm?.identifier}`) });
        next.play();
        next.fade(0, this.settings.bgmVolume * Number(action.volume ?? 1), duration || 100);
        this.bgm?.fade(this.bgm.volume(), 0, duration || 100);
        this.bgm = next;
      }
    }
    if (action.se) {
      const url = mediaUrl(action.se);
      if (url) {
        const se = new Howl({ src: [url], loop: Number(action.playMode) === 2, volume: this.settings.seVolume * Number(action.volume ?? 1), onloaderror: () => this.onWarning(`SE unavailable: ${action.se?.identifier}`) });
        se.play();
        this.sounds.set(`se:${action.se.identifier}`, se);
      }
    }
  }

  private async layout(action: ScenarioAction) {
    const position = sideToPosition(action.sideTo, Number(action.sideToOffsetX ?? 0));
    const visible = Number(action.layoutType ?? 0) !== 3;
    const ok = await this.player.applyModel(action.character2dId, action.costumeType, position.x, position.y, visible, action.motionName, action.facialName, this.layoutMode);
    if (!ok) this.onWarning(`Live2D model unavailable: ${action.costumeType ?? action.character2dId}`);
  }

  private async motion(action: ScenarioAction) {
    const entry = this.player.findModel(action.character2dId, action.costumeType);
    if (!entry) return this.onWarning(`Live2D model unavailable: ${action.costumeType ?? action.character2dId}`);
    await Promise.allSettled([
      action.motionName ? this.player.playMotion(entry, action.motionName) : Promise.resolve(),
      action.facialName ? this.player.playExpression(entry, action.facialName) : Promise.resolve()
    ]);
  }

  private async specialEffect(action: ScenarioAction) {
    const name = String(action.effectName ?? "");
    const raw = action.raw ?? {};
    const duration = Math.max(80, Number(raw.Duration ?? action.duration ?? 0.35) * 1000 / this.settings.fastForward);
    if (name === "ChangeBackground" || name === "ChangeBackgroundStill" || name === "ChangeCardStill") await this.player.setBackground(mediaUrl(action.resource));
    else if (name === "ChangeCameraPosition") {
      const values = String(raw.StringVal ?? "0,0").split(",").map(Number);
      this.player.setCamera(values[0] || 0, values[1] || 0, this.player.camera.zoom);
    } else if (name === "ChangeCameraZoomLevel") this.player.setCamera(this.player.camera.x, this.player.camera.y, Math.max(0.5, Math.min(2.4, Number(raw.StringVal ?? 1) || 1)));
    else if (["BlackIn", "BlackOut"].includes(name)) await this.timedOverlay({ tone: "black" }, duration, name.endsWith("Out"));
    else if (["WhiteIn", "WhiteOut"].includes(name)) await this.timedOverlay({ tone: "white" }, duration, name.endsWith("Out"));
    else if (name === "ShakeScreen") this.updateOverlay({ shakeScreen: true });
    else if (name === "StopShakeScreen") this.updateOverlay({ shakeScreen: false });
    else if (name === "ShakeWindow") this.updateOverlay({ shakeWindow: true });
    else if (name === "StopShakeWindow") this.updateOverlay({ shakeWindow: false });
    else if (name === "Telop") this.updateOverlay({ telop: String(action.body ?? raw.StringVal ?? "") });
    else if (name === "PlaceInfo") this.updateOverlay({ placeInfo: String(action.body ?? raw.StringVal ?? "") });
    else if (name === "FullScreenText") this.updateOverlay({ fullText: String(action.body ?? raw.StringVal ?? "") });
    else if (name === "FullScreenTextHide") this.updateOverlay({ fullText: undefined });
    else if (name === "MemoryIn" || name === "FlashbackIn") this.updateOverlay({ memory: true });
    else if (name === "MemoryOut" || name === "FlashbackOut") this.updateOverlay({ memory: false });
    else if (name.startsWith("AmbientColor")) this.updateOverlay({ ambient: name.endsWith("Evening") ? "evening" : name.endsWith("Night") ? "night" : "normal" });
    else if (name === "Blur") this.updateOverlay({ blur: String(raw.StringVal) === "true" });
    else if (name.startsWith("BlackWipe")) { this.updateOverlay({ wipe: name }); this.player.setWipe(name); await wait(duration, this.abortController.signal); if (name.includes("In")) { this.updateOverlay({ wipe: undefined }); this.player.setWipe(); } }
    else if (["SekaiIn", "SekaiOut", "SekaiInCenter", "SekaiOutCenter"].includes(name)) await this.timedOverlay({ tone: "white" }, duration, name.includes("Out"));
    else if (name === "PlayScenarioEffect") this.updateOverlay({ scenarioEffect: String(raw.StringVal ?? "") });
    else if (name === "StopScenarioEffect") this.updateOverlay({ scenarioEffect: undefined });
    else if (name === "Movie") {
      const video = document.createElement("video");
      video.src = mediaUrl(action.resource);
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      this.player.setMovie(video);
      this.updateOverlay({ movieUrl: video.src });
    }
  }

  private async timedOverlay(value: Partial<StoryOverlayState>, duration: number, persist: boolean) {
    this.updateOverlay(value);
    await wait(duration, this.abortController.signal);
    if (!persist) this.updateOverlay(Object.fromEntries(Object.keys(value).map((key) => [key, undefined])));
  }

  private updateOverlay(next: Partial<StoryOverlayState>) {
    this.overlay = { ...this.overlay, ...next };
    this.player.setVisualState(this.overlay);
    this.onOverlay(this.overlay);
  }

  private startLipSync(cid: number) {
    this.stopLipSync(cid);
    let open = false;
    this.speakingTimer = window.setInterval(() => { open = !open; this.player.setSpeaking(cid, open); }, 90);
  }

  private stopLipSync(cid: number) {
    if (this.speakingTimer) window.clearInterval(this.speakingTimer);
    this.speakingTimer = undefined;
    this.player.setSpeaking(cid, false);
  }

  reset() {
    this.abortController.abort();
    this.abortController = new AbortController();
    this.step = 0;
    this.layoutMode = 0;
    this.overlay = {};
    this.player.setVisualState(this.overlay);
    this.player.setCamera();
    this.player.setWipe();
    this.bgm?.unload();
    for (const sound of this.sounds.values()) sound.unload();
    this.sounds.clear();
    this.onOverlay(this.overlay);
    this.onStep(0);
  }

  destroy() {
    this.reset();
    this.player.destroy();
  }
}
