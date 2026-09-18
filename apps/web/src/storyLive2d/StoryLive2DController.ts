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

export class StoryLive2DController {
  private abortController = new AbortController();
  private generation = 0;
  private step = 0;
  private layoutMode = 0;
  private overlay: StoryOverlayState = {};
  private bgm?: Howl;
  private fadingBgm = new Set<Howl>();
  private sounds = new Map<string, Howl>();
  private speakingTimer?: number;
  private speakingCharacterId?: number;
  private paused = false;
  private pausedSounds = new Set<Howl>();
  private resumeWaiters = new Set<() => void>();
  private pauseCurrentWait?: () => void;

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

  pause() {
    if (this.paused) return;
    this.paused = true;
    for (const sound of this.activeSounds()) {
      if (!sound.playing()) continue;
      sound.pause();
      this.pausedSounds.add(sound);
    }
    if (this.speakingCharacterId !== undefined) this.stopLipSync(this.speakingCharacterId);
    this.pauseCurrentWait?.();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    for (const sound of this.pausedSounds) {
      if (this.fadingBgm.delete(sound)) {
        sound.stop();
        sound.unload();
        continue;
      }
      sound.play();
    }
    this.pausedSounds.clear();
    for (const resolve of this.resumeWaiters) resolve();
    this.resumeWaiters.clear();
  }

  async execute(index: number, generation = this.generation, options: { previewTalk?: boolean } = {}) {
    this.assertActive(generation);
    const actions = this.playback.actions ?? [];
    const action = actions[index];
    if (!action) return;
    this.step = index;
    this.onStep(index);
    const queuedCostumes = this.playback.modelQueue?.[index] ?? [];
    const queuedModels = (this.playback.live2dModels ?? []).filter((model) => queuedCostumes.includes(model.costumeType));
    const loadFailures = await this.player.loadModels(queuedModels);
    this.assertActive(generation);
    for (const failure of loadFailures) this.onWarning(`Live2D model unavailable: ${failure}`);
    await this.waitUntilResumed(generation);
    this.player.setModelQueue(queuedCostumes);
    await this.wait(Number(action.delay ?? 0) * 1000 / this.settings.fastForward, generation);
    await this.waitUntilResumed(generation);
    await this.executeAction(action, generation, options);
  }

  async initializeThrough(index: number, options: { previewTalk?: boolean } = {}) {
    const generation = this.generation;
    const last = Math.min(Math.max(0, index), Math.max(0, (this.playback.actions?.length ?? 1) - 1));
    for (let current = 0; current <= last; current += 1) {
      this.assertActive(generation);
      await this.execute(current, generation, { previewTalk: Boolean(options.previewTalk && current === last) });
    }
  }

  async playFrom(index: number, shouldContinue: () => boolean) {
    const generation = this.generation;
    for (let current = index; current < (this.playback.actions?.length ?? 0); current += 1) {
      if (current !== index && !shouldContinue()) return;
      this.assertActive(generation);
      await this.execute(current, generation);
      const action = this.playback.actions?.[current];
      if (action?.type === "Talk") await this.wait(Math.max(350, this.settings.textSpeed * String(action.body ?? "").length) / this.settings.fastForward, generation);
      else if (action?.isWait) await this.wait(Math.max(120, Number(action.duration ?? 0) * 1000) / this.settings.fastForward, generation);
    }
  }

  private async executeAction(action: ScenarioAction, generation: number, options: { previewTalk?: boolean } = {}) {
    this.assertActive(generation);
    switch (action.type) {
      case "Talk": return this.talk(action, generation, options);
      case "Sound": return this.sound(action);
      case "CharacterLayout": return this.layout(action, generation);
      case "CharacterMotion": return this.motion(action, generation);
      case "ActionLayoutMode": this.layoutMode = Number(action.characterLayoutMode ?? 0); return;
      case "SpecialEffect": return this.specialEffect(action, generation);
      default: this.onWarning(`Unsupported action: ${action.type}`);
    }
  }

  private async talk(action: ScenarioAction, generation: number, options: { previewTalk?: boolean } = {}) {
    this.updateOverlay({ speaker: action.windowDisplayName, body: action.body });
    const motions = action.motions ?? [];
    await Promise.all(motions.map(async (motion) => {
      const entry = this.player.findModel(motion.Character2dId);
      if (!entry) return;
      await this.player.applyModel(motion.Character2dId, entry.costume, entry.model.x / Math.max(this.player.app.renderer.width, 1) * 100, entry.model.y / Math.max(this.player.app.renderer.height, 1) * 100, true, motion.MotionName, motion.FacialName, this.layoutMode);
    }));
    if (options.previewTalk) return;
    await this.waitUntilResumed(generation);
    this.assertActive(generation);
    const url = mediaUrl(action.voice);
    if (!url) return;
    const speakerId = Number((action.motions?.[0] as any)?.Character2dId ?? 0);
    let voice: Howl;
    voice = new Howl({
      src: [url], format: ["mp3"], volume: this.settings.voiceVolume, html5: false,
      onplay: () => {
        if (this.paused) {
          voice.pause();
          this.pausedSounds.add(voice);
          return;
        }
        this.startLipSync(speakerId);
      },
      onend: () => this.stopLipSync(speakerId),
      onloaderror: () => this.onWarning(`Voice unavailable: ${action.voice?.identifier}`)
    });
    this.playSound(voice);
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
        let next: Howl;
        next = new Howl({
          src: [url], format: ["mp3"], loop: true, volume: 0, html5: false,
          onplay: () => this.pauseSoundIfNeeded(next),
          onloaderror: () => this.onWarning(`BGM unavailable: ${action.bgm?.identifier}`)
        });
        this.playSound(next);
        next.fade(0, this.settings.bgmVolume * Number(action.volume ?? 1), duration || 100);
        const previous = this.bgm;
        if (previous) {
          this.fadingBgm.add(previous);
          previous.fade(previous.volume(), 0, duration || 100);
          previous.once("fade", () => {
            if (!this.paused && this.fadingBgm.delete(previous)) {
              previous.stop();
              previous.unload();
            }
          });
        }
        this.bgm = next;
      }
    }
    if (action.se) {
      const url = mediaUrl(action.se);
      if (url) {
        let se: Howl;
        se = new Howl({
          src: [url], format: ["mp3"], loop: Number(action.playMode) === 2, volume: this.settings.seVolume * Number(action.volume ?? 1),
          onplay: () => this.pauseSoundIfNeeded(se),
          onloaderror: () => this.onWarning(`SE unavailable: ${action.se?.identifier}`)
        });
        this.playSound(se);
        this.sounds.set(`se:${action.se.identifier}`, se);
      }
    }
  }

  private async layout(action: ScenarioAction, generation: number) {
    const position = sideToPosition(action.sideTo, Number(action.sideToOffsetX ?? 0));
    const visible = Number(action.layoutType ?? 0) !== 3;
    const ok = await this.player.applyModel(action.character2dId, action.costumeType, position.x, position.y, visible, action.motionName, action.facialName, this.layoutMode);
    this.assertActive(generation);
    if (!ok) this.onWarning(`Live2D model unavailable: ${action.costumeType ?? action.character2dId}`);
  }

  private async motion(action: ScenarioAction, generation: number) {
    const entry = this.player.findModel(action.character2dId, action.costumeType);
    if (!entry) return this.onWarning(`Live2D model unavailable: ${action.costumeType ?? action.character2dId}`);
    await Promise.allSettled([
      action.motionName ? this.player.playMotion(entry, action.motionName) : Promise.resolve(),
      action.facialName ? this.player.playExpression(entry, action.facialName) : Promise.resolve()
    ]);
    this.assertActive(generation);
  }

  private async specialEffect(action: ScenarioAction, generation: number) {
    const name = String(action.effectName ?? "");
    const raw = action.raw ?? {};
    const duration = Math.max(80, Number(raw.Duration ?? action.duration ?? 0.35) * 1000 / this.settings.fastForward);
    if (name === "ChangeBackground" || name === "ChangeBackgroundStill" || name === "ChangeCardStill") {
      try {
        await this.player.setBackground(mediaUrl(action.resource));
        this.assertActive(generation);
      } catch (error) {
        this.onWarning(`Background unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    else if (name === "ChangeCameraPosition") {
      const values = String(raw.StringVal ?? "0,0").split(",").map(Number);
      this.player.setCamera(values[0] || 0, values[1] || 0, this.player.camera.zoom);
    } else if (name === "ChangeCameraZoomLevel") this.player.setCamera(this.player.camera.x, this.player.camera.y, Math.max(0.5, Math.min(2.4, Number(raw.StringVal ?? 1) || 1)));
    else if (["BlackIn", "BlackOut"].includes(name)) await this.timedOverlay({ tone: "black" }, duration, name.endsWith("Out"), generation);
    else if (["WhiteIn", "WhiteOut"].includes(name)) await this.timedOverlay({ tone: "white" }, duration, name.endsWith("Out"), generation);
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
    else if (name.startsWith("BlackWipe")) { this.updateOverlay({ wipe: name }); this.player.setWipe(name); await this.wait(duration, generation); this.assertActive(generation); if (name.includes("In")) { this.updateOverlay({ wipe: undefined }); this.player.setWipe(); } }
    else if (["SekaiIn", "SekaiOut", "SekaiInCenter", "SekaiOutCenter"].includes(name)) await this.timedOverlay({ tone: "white" }, duration, name.includes("Out"), generation);
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

  private async timedOverlay(value: Partial<StoryOverlayState>, duration: number, persist: boolean, generation: number) {
    this.updateOverlay(value);
    await this.wait(duration, generation);
    this.assertActive(generation);
    if (!persist) this.updateOverlay(Object.fromEntries(Object.keys(value).map((key) => [key, undefined])));
  }

  private updateOverlay(next: Partial<StoryOverlayState>) {
    this.overlay = { ...this.overlay, ...next };
    this.player.setVisualState(this.overlay);
    this.onOverlay(this.overlay);
  }

  private startLipSync(cid: number) {
    this.stopLipSync(cid);
    this.speakingCharacterId = cid;
    let open = false;
    this.speakingTimer = window.setInterval(() => { open = !open; this.player.setSpeaking(cid, open); }, 90);
  }

  private stopLipSync(cid: number) {
    if (this.speakingTimer) window.clearInterval(this.speakingTimer);
    this.speakingTimer = undefined;
    if (this.speakingCharacterId === cid) this.speakingCharacterId = undefined;
    this.player.setSpeaking(cid, false);
  }

  private activeSounds() {
    return new Set([this.bgm, ...this.fadingBgm, ...this.sounds.values()].filter((sound): sound is Howl => Boolean(sound)));
  }

  private playSound(sound: Howl) {
    sound.play();
    this.pauseSoundIfNeeded(sound);
  }

  private pauseSoundIfNeeded(sound: Howl) {
    if (!this.paused) return;
    sound.pause();
    this.pausedSounds.add(sound);
  }

  private assertActive(generation: number) {
    if (generation !== this.generation || this.abortController.signal.aborted) throw new DOMException("Cancelled", "AbortError");
  }

  private waitUntilResumed(generation: number) {
    const signal = this.abortController.signal;
    if (generation !== this.generation || signal.aborted) return Promise.reject(new DOMException("Cancelled", "AbortError"));
    if (!this.paused) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal.removeEventListener("abort", abort);
        if (generation !== this.generation) reject(new DOMException("Cancelled", "AbortError"));
        else resolve();
      };
      const abort = () => {
        this.resumeWaiters.delete(resume);
        reject(new DOMException("Cancelled", "AbortError"));
      };
      this.resumeWaiters.add(resume);
      signal.addEventListener("abort", abort, { once: true });
    });
  }

  private async wait(ms: number, generation: number) {
    let remaining = Math.max(0, ms);
    while (true) {
      await this.waitUntilResumed(generation);
      const signal = this.abortController.signal;
      const startedAt = performance.now();
      const completed = await new Promise<boolean>((resolve, reject) => {
        if (signal.aborted) return reject(new DOMException("Cancelled", "AbortError"));
        let settled = false;
        const finish = (didComplete: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          signal.removeEventListener("abort", abort);
          if (this.pauseCurrentWait === pause) this.pauseCurrentWait = undefined;
          resolve(didComplete);
        };
        const pause = () => finish(false);
        const abort = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (this.pauseCurrentWait === pause) this.pauseCurrentWait = undefined;
          reject(new DOMException("Cancelled", "AbortError"));
        };
        const timer = window.setTimeout(() => finish(true), remaining);
        this.pauseCurrentWait = pause;
        signal.addEventListener("abort", abort, { once: true });
        if (this.paused) pause();
      });
      if (completed) return;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
    }
  }

  reset() {
    this.generation += 1;
    this.abortController.abort();
    this.abortController = new AbortController();
    this.paused = false;
    this.pausedSounds.clear();
    this.resumeWaiters.clear();
    this.pauseCurrentWait = undefined;
    this.step = 0;
    this.layoutMode = 0;
    this.overlay = {};
    this.player.setVisualState(this.overlay);
    this.player.setCamera();
    this.player.setWipe();
    this.bgm?.unload();
    for (const sound of this.fadingBgm) sound.unload();
    this.fadingBgm.clear();
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
