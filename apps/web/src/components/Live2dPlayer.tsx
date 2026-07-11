import { Move, RotateCcw, ZoomIn } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiResourceUrl } from "../api";

type Live2dAssetFile = { name: string; url: string; group?: string };

export type Live2dDetail = {
  model?: { id: string; name?: string; model3JsonUrl?: string; modelBaseUrl?: string; modelPath?: string };
  assets?: {
    model3JsonUrl?: string;
    proxiedModel3JsonUrl?: string;
    rewrittenModel3JsonUrl?: string;
    motionFiles?: Live2dAssetFile[];
    proxiedMotionFiles?: Live2dAssetFile[];
    expressionFiles?: Live2dAssetFile[];
    proxiedExpressionFiles?: Live2dAssetFile[];
    textureFiles?: Live2dAssetFile[];
  };
  runtimeRequired?: string[];
  unavailableReason?: string;
};

function proxied(url?: string) {
  if (!url) return "";
  return apiResourceUrl(url.startsWith("/api/") ? url : `/api/assets/proxy?url=${encodeURIComponent(url)}`);
}

function displayName(file: Live2dAssetFile) {
  return file.name.replace(/\.(motion3|exp3)\.json$/i, "");
}

export function Live2dPlayer({ detail }: { detail: Live2dDetail | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const dragRef = useRef<{ x: number; y: number; modelX: number; modelY: number } | null>(null);
  const [status, setStatus] = useState("选择模型后加载 Live2D。");
  const [scale, setScale] = useState(0.22);
  const [motionGroup, setMotionGroup] = useState("all");
  const [selectedMotion, setSelectedMotion] = useState("");
  const [selectedExpression, setSelectedExpression] = useState("");
  const modelUrl = apiResourceUrl(detail?.assets?.rewrittenModel3JsonUrl ?? detail?.assets?.proxiedModel3JsonUrl) || proxied(detail?.assets?.model3JsonUrl ?? detail?.model?.model3JsonUrl);
  const motions = detail?.assets?.proxiedMotionFiles?.length ? detail.assets.proxiedMotionFiles : detail?.assets?.motionFiles ?? [];
  const expressions = detail?.assets?.proxiedExpressionFiles?.length ? detail.assets.proxiedExpressionFiles : detail?.assets?.expressionFiles ?? [];
  const groups = useMemo(() => ["all", ...new Set(motions.map((motion) => motion.group).filter((value): value is string => Boolean(value)))], [motions]);
  const visibleMotions = motionGroup === "all" ? motions : motions.filter((motion) => motion.group === motionGroup);

  useEffect(() => {
    let disposed = false;
    async function mount() {
      if (!hostRef.current || !modelUrl) return setStatus(detail?.unavailableReason ?? "真实 model3.json 暂不可用。");
      try {
        setStatus("正在加载 Live2D 运行时...");
        const PIXI = await import("pixi.js");
        const runtime = await import("@sekai-world/pixi-live2d-display-mulmotion/cubism4");
        if (disposed || !hostRef.current) return;
        const app = new PIXI.Application({ backgroundAlpha: 0, resizeTo: hostRef.current, antialias: true });
        hostRef.current.replaceChildren(app.view as HTMLCanvasElement);
        const model = await (runtime as any).Live2DModel.from(modelUrl, { autoInteract: false });
        if (disposed) return app.destroy(true);
        model.anchor?.set?.(0.5, 0.52);
        model.eventMode = "static";
        model.interactive = true;
        model.cursor = "grab";
        model.on?.("pointerdown", (event: any) => {
          const point = event.global ?? event.data?.global;
          if (!point) return;
          model.cursor = "grabbing";
          dragRef.current = { x: point.x, y: point.y, modelX: model.x, modelY: model.y };
        });
        model.on?.("pointermove", (event: any) => {
          if (!dragRef.current) return;
          const point = event.global ?? event.data?.global;
          if (point) model.position.set(dragRef.current.modelX + point.x - dragRef.current.x, dragRef.current.modelY + point.y - dragRef.current.y);
        });
        const release = () => { model.cursor = "grab"; dragRef.current = null; };
        model.on?.("pointerup", release);
        model.on?.("pointerupoutside", release);
        app.stage.addChild(model);
        appRef.current = app;
        modelRef.current = model;
        fitModel(app, model, scale);
        setStatus("Live2D 模型已加载。");
      } catch (error) {
        setStatus(`播放器加载失败，已降级为资源索引：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    void mount();
    return () => {
      disposed = true;
      dragRef.current = null;
      modelRef.current?.destroy?.({ children: true });
      appRef.current?.destroy?.(true, { children: true, texture: false, baseTexture: false });
      modelRef.current = null;
      appRef.current = null;
      hostRef.current?.replaceChildren();
    };
  }, [modelUrl]);

  useEffect(() => { modelRef.current?.scale?.set?.(scale); }, [scale]);

  function fitModel(app: any, model: any, value: number) {
    model.position.set(app.renderer.width / 2, app.renderer.height * 0.72);
    model.scale.set(value);
  }

  async function playMotion(file: Live2dAssetFile) {
    try {
      if (!modelRef.current) throw new Error("模型尚未加载");
      const group = file.group ?? "Motion";
      const index = Math.max(0, motions.filter((item) => item.group === file.group).findIndex((item) => item.url === file.url));
      await modelRef.current.motion?.(group, index);
      setSelectedMotion(file.url);
      setStatus(`正在播放动作：${group} / ${displayName(file)}`);
    } catch (error) { setStatus(`动作播放失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  async function applyExpression(file: Live2dAssetFile) {
    try {
      if (!modelRef.current) throw new Error("模型尚未加载");
      const index = Math.max(0, expressions.findIndex((item) => item.url === file.url));
      await modelRef.current.expression?.(index);
      setSelectedExpression(file.url);
      setStatus(`已切换表情：${displayName(file)}`);
    } catch (error) { setStatus(`表情切换失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  return <section className="live2d-player-grid">
    <article className="live2d-stage-panel"><div ref={hostRef} className="live2d-stage" /><p className="empty-state">{status}</p></article>
    <article className="panel live2d-controls">
      <h3>播放器控制</h3>
      <div className="control-hint"><Move size={16} />拖拽模型移动视图</div>
      <label><span><ZoomIn size={16} />缩放</span><input type="range" min="0.08" max="0.6" step="0.01" value={scale} onChange={(event) => setScale(Number(event.target.value))} /></label>
      <button type="button" onClick={() => appRef.current && modelRef.current && fitModel(appRef.current, modelRef.current, scale)}><RotateCcw size={16} />重置视图</button>
      <div className="segmented">{groups.map((group) => <button key={group} type="button" className={motionGroup === group ? "active" : ""} onClick={() => setMotionGroup(group)}>{group === "all" ? "全部动作" : group}</button>)}</div>
      <div className="live2d-button-grid">{visibleMotions.map((motion) => <button key={`${motion.group}:${motion.url}`} type="button" className={selectedMotion === motion.url ? "active" : ""} onClick={() => playMotion(motion)}>{displayName(motion)}</button>)}{!motions.length && <p className="empty-state">真实动作资源暂不可用。</p>}</div>
      <h4>表情</h4>
      <div className="live2d-button-grid">{expressions.map((expression) => <button key={expression.url} type="button" className={selectedExpression === expression.url ? "active" : ""} onClick={() => applyExpression(expression)}>{displayName(expression)}</button>)}{!expressions.length && <p className="empty-state">真实表情资源暂不可用。</p>}</div>
      <div className="runtime-diagnostics"><strong>运行时诊断</strong><span>model3: {modelUrl ? "可用" : "暂不可用"}</span><span>动作: {motions.length}</span><span>表情: {expressions.length}</span><span>纹理: {detail?.assets?.textureFiles?.length ?? 0}</span><small>{detail?.runtimeRequired?.join(" / ") ?? "pixi.js 7 / mulmotion / Cubism runtime"}</small></div>
      {detail?.unavailableReason && <p className="warning-text">{detail.unavailableReason}</p>}
    </article>
  </section>;
}
