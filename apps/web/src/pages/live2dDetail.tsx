import { ArrowLeft, Box, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { apiGetWithSignal } from "../api";
import { Live2dPlayer, type Live2dDetail } from "../components/Live2dPlayer";

const statusLabels: Record<string, string> = { "region-referenced": "本区已引用", "global-only": "全局共享资产", partial: "部分资源可用", "missing-resource": "资源缺失", "render-failed": "渲染失败" };

export function Live2dDetailPage({ region }: { region: string }) {
  const { modelId = "" } = useParams();
  const location = useLocation();
  const [detail, setDetail] = useState<Live2dDetail | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setError("");
    apiGetWithSignal<Live2dDetail>(`/api/master/${region}/live2d/models/${encodeURIComponent(modelId)}/full`, controller.signal).then(setDetail).catch((value) => { if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : String(value)); });
    return () => controller.abort();
  }, [region, modelId, reload]);
  const back = `/section/live2d${location.search}`;
  if (error) return <section className="live2d-detail-page"><Link className="secondary-link" to={back}><ArrowLeft size={16} />返回目录</Link><p className="warning-text">{error}</p><button type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />重试</button></section>;
  if (!detail) return <p className="empty-state">正在加载 Live2D 模型资料...</p>;
  const model = detail.model;
  return <section className="live2d-detail-page"><Link className="secondary-link" to={back}><ArrowLeft size={16} />返回目录</Link><div className="live2d-detail-heading"><div><span><Box size={16} />{model?.regionReferenceStatus === "region-referenced" ? "当前区服故事已引用" : "全局共享模型资产"}</span><h2>{model?.name || model?.modelPath || model?.id}</h2><p>{model?.modelPath || model?.id}</p></div><span className={`playback-status ${detail.playbackStatus}`}>{statusLabels[detail.playbackStatus ?? ""] ?? detail.playbackStatus}</span></div><Live2dPlayer detail={detail} />{detail.unavailableReason && <p className="warning-text">{detail.unavailableReason}</p>}</section>;
}
