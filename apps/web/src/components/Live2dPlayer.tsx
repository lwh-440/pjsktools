import { Move, Pause, Play, RefreshCw, RotateCcw, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiResourceUrl } from "../api";
import { Live2DRuntimeStage } from "../live2d/Live2DRuntimeStage";

type AssetFile = { name: string; url: string; group?: string; index?: number };
export type Live2dDetail = {
  model?: { id: string; name?: string; model3JsonUrl?: string; modelPath?: string; regionReferenceStatus?: string };
  assets?: { model3JsonUrl?: string; proxiedModel3JsonUrl?: string; rewrittenModel3JsonUrl?: string; motionFiles?: AssetFile[]; expressionFiles?: AssetFile[]; textureFiles?: AssetFile[] };
  assetCounts?: { motions: number; expressions: number; textures: number };
  playbackStatus?: string;
  unavailableReason?: string;
};

function label(file: AssetFile) { return file.name.replace(/\.(motion3|exp3)\.json$/i, ""); }

export function Live2dPlayer({ detail }: { detail: Live2dDetail | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Live2DRuntimeStage | null>(null);
  const modelRef = useRef<any>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragRef = useRef<{ x: number; y: number; modelX: number; modelY: number } | null>(null);
  const [loadKey, setLoadKey] = useState(0);
  const [status, setStatus] = useState("正在等待模型资料");
  const [runtimeStatus, setRuntimeStatus] = useState<"idle" | "loading" | "ready" | "render-failed" | "failed">("idle");
  const [scaleFactor, setScaleFactor] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [motionGroup, setMotionGroup] = useState("all");
  const [selectedMotion, setSelectedMotion] = useState("");
  const [selectedExpression, setSelectedExpression] = useState("");
  const [autoIdle, setAutoIdle] = useState(true);
  const modelUrl = apiResourceUrl(detail?.assets?.rewrittenModel3JsonUrl ?? detail?.assets?.proxiedModel3JsonUrl ?? detail?.assets?.model3JsonUrl);
  const motions = detail?.assets?.motionFiles ?? [];
  const expressions = detail?.assets?.expressionFiles ?? [];
  const groups = useMemo(() => ["all", ...new Set(motions.map((motion) => motion.group).filter((value): value is string => Boolean(value)))], [motions]);
  const visibleMotions = motionGroup === "all" ? motions : motions.filter((motion) => motion.group === motionGroup);

  useEffect(() => {
    if (!hostRef.current) return;
    const stage = new Live2DRuntimeStage(hostRef.current);
    stageRef.current = stage;
    return () => { abortRef.current?.abort(); stage.destroy(); stageRef.current = null; modelRef.current = null; };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !modelUrl) { setRuntimeStatus("idle"); setStatus(detail?.unavailableReason ?? "该模型缺少可加载的 model3 资源"); return; }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    stage.destroyModel(modelRef.current);
    modelRef.current = null;
    setRuntimeStatus("loading"); setSelectedMotion(""); setSelectedExpression("");
    stage.loadModel(modelUrl, abort.signal, (progress) => setStatus(progress.message)).then(async (model) => {
      if (abort.signal.aborted) return;
      modelRef.current = model;
      model.eventMode = "static"; model.cursor = "grab";
      model.on?.("pointerdown", (event: any) => { const point = event.global; if (point) dragRef.current = { x: point.x, y: point.y, modelX: model.x, modelY: model.y }; });
      model.on?.("pointermove", (event: any) => { const drag = dragRef.current; const point = event.global; if (drag && point) model.position.set(drag.modelX + point.x - drag.x, drag.modelY + point.y - drag.y); });
      const release = () => { dragRef.current = null; };
      model.on?.("pointerup", release); model.on?.("pointerupoutside", release);
      const fitted = stage.fit(model); setBaseScale(fitted); setScaleFactor(1);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (!stage.hasVisiblePixels()) { setRuntimeStatus("render-failed"); setStatus("模型资源已加载，但画布没有可见内容"); return; }
      setRuntimeStatus("ready"); setStatus("模型已加载，可以拖拽、播放动作或切换表情");
      const idle = motions.find((motion) => /idle|wait|stand/i.test(`${motion.group} ${motion.name}`)) ?? motions[0];
      if (autoIdle && idle) void playMotion(idle, model);
    }).catch((error) => { if (error?.name !== "AbortError") { setRuntimeStatus("failed"); setStatus(error instanceof Error ? error.message : String(error)); } });
    return () => abort.abort();
  }, [modelUrl, loadKey]);

  useEffect(() => { modelRef.current?.scale?.set?.(baseScale * scaleFactor); }, [baseScale, scaleFactor]);

  async function playMotion(file: AssetFile, model = modelRef.current) {
    if (!model) return;
    const group = file.group ?? "Motion";
    const groupItems = motions.filter((item) => (item.group ?? "Motion") === group);
    const index = file.index ?? Math.max(0, groupItems.findIndex((item) => item.url === file.url));
    await (model.motion?.(group, index) ?? model.internalModel?.motionManager?.startMotion?.(group, index));
    setSelectedMotion(file.url); setStatus(`正在播放：${group} / ${label(file)}`);
  }

  async function applyExpression(file: AssetFile) {
    if (!modelRef.current) return;
    const index = file.index ?? Math.max(0, expressions.findIndex((item) => item.url === file.url));
    await (modelRef.current.expression?.(index) ?? modelRef.current.internalModel?.motionManager?.expressionManager?.setExpression?.(index));
    setSelectedExpression(file.url); setStatus(`当前表情：${label(file)}`);
  }

  const ready = runtimeStatus === "ready";
  return <section className="live2d-preview-layout">
    <article className="live2d-stage-panel"><div ref={hostRef} className="live2d-stage" /><div className={`live2d-stage-status ${runtimeStatus}`}><span>{status}</span>{runtimeStatus === "loading" && <progress />}{["failed", "render-failed"].includes(runtimeStatus) && <button type="button" onClick={() => setLoadKey((value) => value + 1)}><RefreshCw size={15} />重试</button>}</div></article>
    <aside className="live2d-controls">
      <section><h3>视图</h3><p><Move size={15} />拖拽模型调整位置</p><label><span><ZoomIn size={15} />缩放</span><input type="range" min="0.45" max="1.8" step="0.05" value={scaleFactor} onChange={(event) => setScaleFactor(Number(event.target.value))} /></label><button type="button" className="secondary" disabled={!ready} onClick={() => { if (stageRef.current && modelRef.current) { const value = stageRef.current.fit(modelRef.current); setBaseScale(value); setScaleFactor(1); } }}><RotateCcw size={15} />复位视图</button></section>
      <section><div className="panel-heading compact-heading"><h3>动作</h3><label className="check-row"><input type="checkbox" checked={autoIdle} onChange={(event) => setAutoIdle(event.target.checked)} />自动待机</label></div><div className="segmented">{groups.map((group) => <button key={group} type="button" className={motionGroup === group ? "active" : ""} onClick={() => setMotionGroup(group)}>{group === "all" ? "全部" : group}</button>)}</div><div className="live2d-button-grid">{visibleMotions.map((motion) => <button key={`${motion.group}:${motion.url}`} type="button" disabled={!ready} className={selectedMotion === motion.url ? "active" : ""} onClick={() => void playMotion(motion)}><Play size={13} />{label(motion)}</button>)}</div>{!motions.length && <p className="empty-state">该模型没有动作定义。</p>}</section>
      <section><h3>表情</h3><div className="live2d-button-grid">{expressions.map((expression) => <button key={expression.url} type="button" disabled={!ready} className={selectedExpression === expression.url ? "active" : ""} onClick={() => void applyExpression(expression)}>{label(expression)}</button>)}</div>{!expressions.length && <p className="empty-state">该模型没有表情定义。</p>}</section>
      <details><summary>运行诊断</summary><div className="runtime-diagnostics"><span>状态：{runtimeStatus}</span><span>动作：{motions.length}</span><span>表情：{expressions.length}</span><span>纹理：{detail?.assets?.textureFiles?.length ?? 0}</span><span>资源状态：{detail?.playbackStatus ?? "unknown"}</span></div></details>
    </aside>
  </section>;
}
