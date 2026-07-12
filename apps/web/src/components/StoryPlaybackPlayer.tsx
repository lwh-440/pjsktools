import { Eye, EyeOff, Pause, Play, RefreshCw, RotateCcw, SkipBack, SkipForward, Volume2, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiResourceUrl } from "../api";
import { StoryLive2DController, type ControllerSettings } from "../storyLive2d/StoryLive2DController";
import { StoryLive2DPlayer } from "../storyLive2d/StoryLive2DPlayer";
import type { PreloadProgress, ScenarioAction, StoryOverlayState, StoryPlaybackContext } from "../storyLive2d/types";

export type { StoryPlaybackContext } from "../storyLive2d/types";
const initialProgress: PreloadProgress = { stage: "idle", completed: 0, total: 0, status: "idle" };

function textOverlay(action?: ScenarioAction): StoryOverlayState {
  if (!action) return {};
  if (action.type === "Talk") return { speaker: action.windowDisplayName, body: action.body };
  if (action.effectName === "Telop") return { telop: action.body };
  if (action.effectName === "PlaceInfo") return { placeInfo: action.body };
  if (action.effectName === "FullScreenText") return { fullText: action.body };
  return {};
}

export function StoryPlaybackPlayer({ playback }: { playback: StoryPlaybackContext | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<StoryLive2DController | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const playingRef = useRef(false);
  const actions = useMemo(() => [...(playback?.actions ?? [])].sort((a, b) => a.index - b.index), [playback]);
  const firstReadableIndex = Math.max(0, actions.findIndex((action) => action.type === "Talk"));
  const [step, setStep] = useState(firstReadableIndex);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [textMode, setTextMode] = useState(false);
  const [overlay, setOverlay] = useState<StoryOverlayState>(() => textOverlay(actions[firstReadableIndex]));
  const [progress, setProgress] = useState<PreloadProgress>(initialProgress);
  const [runtimeStatus, setRuntimeStatus] = useState<"idle" | "loading" | "ready" | "partial-ready" | "failed">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [settings, setSettings] = useState<ControllerSettings>({ bgmVolume: 0.3, seVolume: 0.8, voiceVolume: 0.8, textSpeed: 55, fastForward: 1 });

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { controllerRef.current?.setSettings(settings); }, [settings]);
  useEffect(() => { void initialize(); return dispose; }, [playback]);

  async function initialize() {
    dispose();
    const readable = Math.max(0, actions.findIndex((action) => action.type === "Talk"));
    setStep(readable); setPlaying(false); setOverlay(textOverlay(actions[readable]));
    setWarnings([...(playback?.warnings ?? []), ...(playback?.missingResources ?? [])]);
    if (!playback || !actions.length) { setRuntimeStatus("failed"); return; }
    if (!hostRef.current) return;
    const abort = new AbortController();
    loadAbortRef.current = abort;
    setRuntimeStatus("loading");
    setProgress({ stage: "scenario", completed: 1, total: 1, status: "loaded", info: "文本已就绪" });
    let player: StoryLive2DPlayer | null = null;
    try {
      player = new StoryLive2DPlayer(hostRef.current);
      const background = playback.essentialAssets?.find((asset) => asset.kind === "background");
      if (background?.proxiedUrl || background?.url) await player.setBackground(apiResourceUrl(background.proxiedUrl ?? background.url));
      if (abort.signal.aborted) return player.destroy();
      const initialCostumes = new Set((playback.modelQueue ?? []).slice(0, 2).flat());
      const initialModels = (playback.live2dModels ?? []).filter((model) => !initialCostumes.size || initialCostumes.has(model.costumeType)).slice(0, 3);
      setProgress({ stage: "model-data", completed: 0, total: initialModels.length, status: "loading", info: "文本模式仍可使用" });
      const modelWarnings = await player.loadModels(initialModels, (completed, total, info) => setProgress({ stage: "render-model", completed, total, info, status: "loading" }));
      if (abort.signal.aborted) return player.destroy();
      const controller = new StoryLive2DController(player, playback, settings, setOverlay, setStep, (warning) => setWarnings((current) => [...new Set([...current, warning])]));
      controllerRef.current = controller;
      setWarnings((current) => [...new Set([...current, ...modelWarnings])]);
      setProgress({ stage: "render-model", completed: initialModels.length - modelWarnings.length, total: initialModels.length, status: modelWarnings.length ? "failed" : "loaded" });
      setRuntimeStatus(modelWarnings.length || playback.playbackStatus === "partial-ready" ? "partial-ready" : "ready");
      await controller.execute(0);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      player?.destroy();
      setWarnings((current) => [...new Set([...current, error instanceof Error ? error.message : String(error)])]);
      setRuntimeStatus("partial-ready");
      setTextMode(true);
    }
  }

  function dispose() {
    playingRef.current = false;
    loadAbortRef.current?.abort(); loadAbortRef.current = null;
    controllerRef.current?.destroy(); controllerRef.current = null;
  }

  async function jump(nextStep: number) {
    const safe = Math.min(Math.max(0, nextStep), Math.max(0, actions.length - 1));
    setPlaying(false); playingRef.current = false;
    if (controllerRef.current && !textMode) await controllerRef.current.execute(safe);
    else { setStep(safe); setOverlay(textOverlay(actions[safe])); }
  }

  async function togglePlay() {
    if (playing) { setPlaying(false); playingRef.current = false; return; }
    setPlaying(true); playingRef.current = true;
    if (!controllerRef.current || textMode) {
      for (let current = step; current < actions.length && playingRef.current; current += 1) {
        setStep(current); setOverlay(textOverlay(actions[current]));
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(350, settings.textSpeed * String(actions[current].body ?? "").length) / settings.fastForward));
        if (!autoPlay) break;
      }
    } else {
      try { await controllerRef.current.playFrom(step, () => playingRef.current && autoPlay); }
      catch (error) { if ((error as DOMException)?.name !== "AbortError") setWarnings((current) => [...current, error instanceof Error ? error.message : String(error)]); }
    }
    setPlaying(false); playingRef.current = false;
  }

  async function reset() {
    setPlaying(false); playingRef.current = false;
    if (controllerRef.current && !textMode) { controllerRef.current.reset(); await controllerRef.current.execute(0); }
    else { setStep(firstReadableIndex); setOverlay(textOverlay(actions[firstReadableIndex])); }
  }

  const current = actions[step];
  const progressValue = actions.length ? Math.round((step + 1) / actions.length * 100) : 0;
  const preloadPercent = progress.total ? Math.round(progress.completed / progress.total * 100) : progress.status === "loaded" ? 100 : 0;
  return <section className={`story-player story-player-v3 ${textMode ? "text-mode" : ""}`}>
    <article className={`story-stage ${overlay.shakeScreen ? "is-shaking" : ""}`}>
      <div ref={hostRef} className="story-live2d-canvas" />
      {overlay.scenarioEffect && <div className={`story-scenario-effect effect-${overlay.scenarioEffect}`} />}
      {overlay.telop && <div className="story-telop">{overlay.telop}</div>}{overlay.placeInfo && <div className="story-place-info">{overlay.placeInfo}</div>}{overlay.fullText && <div className="story-full-text">{overlay.fullText}</div>}
      <div className={`story-dialog-box ${overlay.shakeWindow ? "is-shaking" : ""}`}><strong>{overlay.speaker || current?.windowDisplayName || "旁白"}</strong><p>{overlay.body || current?.body || "本段没有对白。"}</p></div>
      {runtimeStatus === "loading" && <div className="story-loading-badge"><span>正在加载 {progress.stage}</span><progress value={preloadPercent} max="100" /></div>}
      {textMode && <div className="story-text-mode-badge">文本模式</div>}
    </article>
    <article className="story-player-controls">
      <div className="story-player-title"><div><strong>{playback?.scenarioInfo?.episodeTitle ?? playback?.scenarioInfo?.scenarioId ?? "故事播放器"}</strong><small>{runtimeStatus} · {step + 1}/{actions.length}</small></div><button type="button" className="secondary" onClick={() => setTextMode((value) => !value)}>{textMode ? <Eye size={16} /> : <EyeOff size={16} />}{textMode ? "显示舞台" : "文本模式"}</button></div>
      <progress className="story-action-progress" value={progressValue} max="100" />
      <div className="story-primary-controls"><button type="button" onClick={() => void jump(step - 1)} disabled={!actions.length}><SkipBack size={17} />上一句</button><button type="button" onClick={() => void togglePlay()} disabled={!actions.length}>{playing ? <Pause size={18} /> : <Play size={18} />}{playing ? "暂停" : "播放"}</button><button type="button" onClick={() => void jump(step + 1)} disabled={!actions.length}><SkipForward size={17} />下一句</button><button type="button" className="secondary" onClick={() => void reset()}><RotateCcw size={16} />重置</button><button type="button" className="secondary" onClick={() => void initialize()}><RefreshCw size={16} />重试舞台</button></div>
      <div className="story-settings-row"><label className="check-row"><input type="checkbox" checked={autoPlay} onChange={(event) => setAutoPlay(event.target.checked)} />自动连续</label><label><span><Zap size={15} />{settings.fastForward}x</span><input type="range" min="1" max="4" step="1" value={settings.fastForward} onChange={(event) => setSettings((current) => ({ ...current, fastForward: Number(event.target.value) }))} /></label>{(["bgmVolume", "seVolume", "voiceVolume"] as const).map((key) => <label key={key}><span><Volume2 size={15} />{key === "bgmVolume" ? "BGM" : key === "seVolume" ? "SE" : "语音"}</span><input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(event) => setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
      {(playback?.unavailableReason || warnings.length > 0) && <p className="story-resource-note">部分画面或声音暂不可用，文本播放不受影响。</p>}
    </article>
  </section>;
}
