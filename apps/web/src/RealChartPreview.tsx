import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api";

export type ChartAssetDetail = {
  region: string;
  musicId: string;
  title: string;
  difficulty: string;
  difficultyId?: string;
  playLevel?: number;
  totalNoteCount?: number;
  durationSeconds?: number;
  bpm?: number;
  jacketUrl: string;
  chartSvgUrl: string;
  chartPngUrl: string;
  sekaiViewerChartSvgUrl: string;
  susUrl: string;
  source: Record<string, string>;
  realDataRequired: true;
};

type RealChartPreviewProps = {
  region: string;
  musicId: string;
  difficulty: string;
  fallbackTitle: string;
  fallbackLevel?: number;
  fallbackNotes?: number;
  formatNumber: (value: number) => string;
};

export function RealChartPreview({
  region,
  musicId,
  difficulty,
  fallbackTitle,
  fallbackLevel,
  fallbackNotes,
  formatNumber
}: RealChartPreviewProps) {
  const [detail, setDetail] = useState<ChartAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [imageSourceIndex, setImageSourceIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage("");
    setDetail(null);
    setImageSourceIndex(0);

    apiGet<ChartAssetDetail>(`/api/master/${region}/music/${musicId}/charts/${encodeURIComponent(difficulty)}`)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "真实谱面图暂不可用");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [difficulty, musicId, region]);

  const imageSources = useMemo(() => {
    if (!detail) return [];
    return [detail.chartSvgUrl, detail.sekaiViewerChartSvgUrl, detail.chartPngUrl].filter(Boolean);
  }, [detail]);
  const imageUrl = imageSources[imageSourceIndex] ?? "";

  return (
    <section className="real-chart-panel">
      <div className="real-chart-toolbar">
        <div>
          <strong>{detail?.title ?? fallbackTitle}</strong>
          <span>
            {detail?.difficulty ?? difficulty}
            {typeof (detail?.playLevel ?? fallbackLevel) === "number" ? ` / Lv.${detail?.playLevel ?? fallbackLevel}` : ""}
            {typeof (detail?.totalNoteCount ?? fallbackNotes) === "number"
              ? ` / ${formatNumber(detail?.totalNoteCount ?? fallbackNotes ?? 0)} notes`
              : ""}
          </span>
        </div>
        <div className="real-chart-actions">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.55, Number((value - 0.15).toFixed(2))))}>
            缩小
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            适应
          </button>
          <button type="button" onClick={() => setZoom((value) => Math.min(2.4, Number((value + 0.15).toFixed(2))))}>
            放大
          </button>
          {imageUrl && (
            <a className="button-link" href={imageUrl} target="_blank" rel="noreferrer">
              打开原图
            </a>
          )}
          {detail?.susUrl && (
            <a className="button-link" href={detail.susUrl} target="_blank" rel="noreferrer">
              SUS
            </a>
          )}
        </div>
      </div>

      <div className="real-chart-canvas">
        {loading && <p className="empty-state">正在加载真实谱面图...</p>}
        {!loading && imageUrl && (
          <img
            src={imageUrl}
            alt={`${detail?.title ?? fallbackTitle} ${detail?.difficulty ?? difficulty} 真实谱面图`}
            style={{ transform: `scale(${zoom})` }}
            onError={() => {
              if (imageSourceIndex < imageSources.length - 1) setImageSourceIndex((value) => value + 1);
              else setMessage("真实谱面图暂不可用，未使用伪造谱面图替代。");
            }}
          />
        )}
        {!loading && (!imageUrl || message) && <p className="empty-state">{message || "真实谱面图暂不可用"}</p>}
      </div>

      <div className="chart-preview-meta">
        <span>谱面 ID {detail?.difficultyId ?? "-"}</span>
        <span>{imageUrl ? "谱面已加载" : "谱面等待加载"}</span>
        {detail?.durationSeconds && <span>时长 {detail.durationSeconds}s</span>}
        {detail?.bpm && <span>BPM {detail.bpm}</span>}
      </div>
    </section>
  );
}
