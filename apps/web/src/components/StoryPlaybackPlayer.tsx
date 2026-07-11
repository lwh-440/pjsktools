import { Pause, Play, RefreshCw, RotateCcw, SkipBack, SkipForward, Volume2, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { preloadStory } from "../storyLive2d/preload";
import { StoryLive2DController, type ControllerSettings } from "../storyLive2d/StoryLive2DController";
import { StoryLive2DPlayer } from "../storyLive2d/StoryLive2DPlayer";
import type { PreloadProgress, StoryOverlayState, StoryPlaybackContext } from "../storyLive2d/types";

export type { StoryPlaybackContext } from "../storyLive2d/types";

const initialProgress: PreloadProgress = { stage: "idle", completed: 0, total: 0, status: "idle" };

export function StoryPlaybackPlayer({ playback }: { playback: StoryPlaybackContext | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<StoryLive2DController | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);
  const playingRef = useRef(false);
  const actions = useMemo(() => [...(playback?.actions ?? [])].sort((a, b) => a.index - b.index), [playback]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [overlay, setOverlay] = useState<StoryOverlayState>({});
  const [progress, setProgress] = useState<PreloadProgress>(initialProgress);
  const [runtimeStatus, setRuntimeStatus] = useState<"idle" | "loading" | "ready" | "degraded" | "failed">("idle");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [settings, setSettings] = useState<ControllerSettings>({ bgmVolume: 0.3, seVolume: 0.8, voiceVolume: 0.8, textSpeed: 55, fastForward: 1 });

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { controllerRef.current?.setSettings(settings); }, [settings]);

  useEffect(() => {
    void initialize();
    return dispose;
  }, [playback]);

  async function initialize() {
    dispose();
    setStep(0);
    setPlaying(false);
    setOverlay({});
    setWarnings(playback?.warnings ?? []);
    if (!playback || !hostRef.current || !actions.length) {
      setRuntimeStatus(playback?.unavailableReason ? "failed" : "idle");
      return;
    }
    const abort = new AbortController();
    loadAbortRef.current = abort;
    setRuntimeStatus("loading");
    setProgress({ stage: "scenario", completed: 1, total: 1, status: "loaded" });
    try {
      await preloadStory(playback, abort.signal, setProgress);
      if (abort.signal.aborted || !hostRef.current) return;
      const player = new StoryLive2DPlayer(hostRef.current);
      setProgress({ stage: "model-data", completed: 0, total: playback.live2dModels?.length ?? 0, status: "loading" });
      const modelWarnings = await player.loadModels(playback.live2dModels ?? [], (completed, total, info) => setProgress({ stage: "render-model", completed, total, info, status: "loading" }));
      const controller = new StoryLive2DController(player, playback, settings, setOverlay, setStep, (warning) => setWarnings((current) => [...new Set([...current, warning])]));
      controllerRef.current = controller;
      setWarnings((current) => [...new Set([...current, ...modelWarnings])]);
      setProgress({ stage: "render-model", completed: (playback.live2dModels?.length ?? 0) - modelWarnings.length, total: playback.live2dModels?.length ?? 0, status: modelWarnings.length ? "failed" : "loaded", info: modelWarnings.length ? `${modelWarnings.length} models unavailable` : undefined });
      setRuntimeStatus(modelWarnings.length || !(playback.live2dModels?.length) ? "degraded" : "ready");
      await controller.execute(0);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return;
      setWarnings((current) => [...current, error instanceof Error ? error.message : String(error)]);
      setRuntimeStatus("failed");
    }
  }

  function dispose() {
    playingRef.current = false;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    controllerRef.current?.destroy();
    controllerRef.current = null;
  }

  async function jump(nextStep: number) {
    const safe = Math.min(Math.max(0, nextStep), Math.max(0, actions.length - 1));
    setPlaying(false);
    playingRef.current = false;
    await controllerRef.current?.execute(safe);
  }

  async function togglePlay() {
    if (!controllerRef.current || runtimeStatus === "loading") return;
    if (playing) {
      setPlaying(false);
      playingRef.current = false;
      return;
    }
    setPlaying(true);
    playingRef.current = true;
    try {
      await controllerRef.current.playFrom(step, () => playingRef.current && autoPlay);
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setWarnings((current) => [...current, error instanceof Error ? error.message : String(error)]);
    } finally {
      setPlaying(false);
      playingRef.current = false;
    }
  }

  async function reset() {
    setPlaying(false);
    playingRef.current = false;
    controllerRef.current?.reset();
    await controllerRef.current?.execute(0);
  }

  const current = actions[step];
  const preloadPercent = progress.total ? Math.round(progress.completed / progress.total * 100) : progress.status === "loaded" ? 100 : 0;

  return (
    <section className="story-player story-player-v2">
      <article className={`story-stage ${overlay.shakeScreen ? "is-shaking" : ""}`}>
        <div ref={hostRef} className="story-live2d-canvas" />
        {overlay.scenarioEffect && <div className={`story-scenario-effect effect-${overlay.scenarioEffect}`} />}
        {overlay.telop && <div className="story-telop">{overlay.telop}</div>}
        {overlay.placeInfo && <div className="story-place-info">{overlay.placeInfo}</div>}
        {overlay.fullText && <div className="story-full-text">{overlay.fullText}</div>}
        <div className={`story-dialog-box ${overlay.shakeWindow ? "is-shaking" : ""}`}>
          <strong>{overlay.speaker || current?.windowDisplayName || "Story"}</strong>
          <p>{overlay.body || current?.body || "播放后显示真实台词。"}</p>
        </div>
        {runtimeStatus === "loading" && <div className="story-loading-overlay"><strong>正在加载 {progress.stage}</strong><progress value={preloadPercent} max="100" /><span>{preloadPercent}% {progress.info ?? ""}</span></div>}
        {runtimeStatus === "failed" && <div className="story-runtime-fallback"><strong>Live2D 运行时不可用</strong><span>文本、背景与资源诊断仍可查看。</span></div>}
      </article>

      <article className="panel story-player-controls">
        <div className="story-player-title">
          <div><strong>{playback?.scenarioInfo?.episodeTitle ?? playback?.scenarioInfo?.scenarioId ?? "故事播放器"}</strong><small>{playback?.playbackVersion ?? "story-live2d-v2-reference"} / {runtimeStatus}</small></div>
          <span>{actions.length ? `${step + 1} / ${actions.length}` : "无可播放 action"}</span>
        </div>
        <div className="button-row">
          <button type="button" onClick={() => jump(step - 1)} disabled={!actions.length || runtimeStatus === "loading"}><SkipBack size={16} />上一句</button>
          <button type="button" onClick={togglePlay} disabled={!actions.length || runtimeStatus === "loading"}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "暂停" : "播放"}</button>
          <button type="button" onClick={() => jump(step + 1)} disabled={!actions.length || runtimeStatus === "loading"}><SkipForward size={16} />下一句</button>
          <button type="button" className="secondary" onClick={reset}><RotateCcw size={16} />重置</button>
          <button type="button" className="secondary" onClick={initialize}><RefreshCw size={16} />重试资源</button>
        </div>
        <label className="check-row"><input type="checkbox" checked={autoPlay} onChange={(event) => setAutoPlay(event.target.checked)} />自动连续播放</label>
        <label className="story-volume"><span><Zap size={16} />速度 {settings.fastForward}x</span><input type="range" min="1" max="4" step="1" value={settings.fastForward} onChange={(event) => setSettings((current) => ({ ...current, fastForward: Number(event.target.value) }))} /></label>
        <label className="story-volume"><span>文本速度</span><input type="range" min="15" max="100" step="5" value={settings.textSpeed} onChange={(event) => setSettings((current) => ({ ...current, textSpeed: Number(event.target.value) }))} /></label>
        {(["bgmVolume", "seVolume", "voiceVolume"] as const).map((key) => <label className="story-volume" key={key}><span><Volume2 size={16} />{key === "bgmVolume" ? "BGM" : key === "seVolume" ? "SE" : "Voice"}</span><input type="range" min="0" max="1" step="0.05" value={settings[key]} onChange={(event) => setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}

        {playback?.unavailableReason && <p className="warning-text">{playback.unavailableReason}</p>}
        {warnings.slice(0, 8).map((warning, index) => <p className="warning-text" key={`${warning}-${index}`}>{warning}</p>)}
        <details>
          <summary>运行时与资源诊断</summary>
          <div className="story-diagnostics">
            <span>Action {String(playback?.playbackDiagnostics?.actionCount ?? actions.length)}</span>
            <span>模型 {playback?.live2dModels?.length ?? 0}</span>
            <span>媒体 {playback?.mediaAssets?.length ?? 0}</span>
            <span>未支持 {playback?.unsupportedActions?.length ?? 0}</span>
          </div>
          <div className="result-tags"><span>Action 状态</span>{Object.entries(playback?.actionSupport?.status ?? {}).slice(0, 30).map(([key, value]) => <code key={key}>{key}:{value}</code>)}</div>
          <div className="result-tags"><span>运行时</span>{(playback?.runtimeRequirements ?? []).map((item) => <code key={item}>{item}</code>)}</div>
          <div className="result-tags"><span>预加载</span><code>{progress.stage}:{progress.status}</code><code>{progress.completed}/{progress.total}</code></div>
        </details>
      </article>
    </section>
  );
}
