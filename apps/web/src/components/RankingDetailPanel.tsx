import { ArtImage } from "./ui";

export type RankingTracePoint = { timestamp: number; userId?: string; score: number; rank: number };
export type RankingEntry = {
  rank: number; userId: string; name: string; playerName?: string; score: number; updatedAt?: string; hourlyGrowth?: number;
  cardId?: number; leaderCardId?: number; cardLevel?: number; leaderCardLevel?: number; cardMasterRank?: number; leaderCardMasterRank?: number;
  cardDefaultImage?: string; leaderCardDefaultImage?: string; leaderCardImageUrl?: string; leaderCardImageCandidates?: string[];
  leaderCharacterImageCandidates?: string[]; leaderAssetStatus?: "matched" | "card-master-missing" | "asset-unavailable";
};
export type RankingPlayerDetail = RankingEntry & {
  timestamp?: number; profileWord?: string; profileHonors?: unknown[]; intervalSeconds?: number; inTop100Range?: boolean;
  rankHourlyGrowth?: number; playerTrace?: RankingTracePoint[]; rankTrace?: RankingTracePoint[]; next?: RankingEntry;
  churnSource?: string; churnStatus?: string; churn1h?: number; churn20min?: number; churn48h?: number; growth1h?: number;
  hourlyChurn?: Array<{ hour: string; count: number }>; recentScoreChanges?: Array<{ timestamp: number; delta: number }>;
  parkingPeriods?: Array<{ startTime?: number; sinceMs?: number; endTime?: number; durationSeconds?: number }>;
  churnUpdatedAt?: string; observedPtUpdates?: number;
};

function formatNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "-";
}

function formatTime(value?: number | string) {
  if (!value) return "-";
  const numeric = typeof value === "number" ? value : Date.parse(value);
  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(milliseconds);
}

function traceStats(trace: RankingTracePoint[]) {
  if (!trace.length) return { minScore: 0, maxScore: 1, start: 0, end: 1, points: "" };
  const sorted = [...trace].sort((a, b) => a.timestamp - b.timestamp);
  const minScore = Math.min(...sorted.map((point) => point.score));
  const maxScore = Math.max(...sorted.map((point) => point.score));
  const start = sorted[0].timestamp;
  const end = sorted.at(-1)!.timestamp;
  const points = sorted.map((point) => `${(((point.timestamp - start) / Math.max(1, end - start)) * 100).toFixed(2)},${(100 - ((point.score - minScore) / Math.max(1, maxScore - minScore)) * 100).toFixed(2)}`).join(" ");
  return { minScore, maxScore, start, end, points };
}

function durationLabel(seconds?: number) {
  if (!seconds || seconds < 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}小时${minutes}分钟` : `${minutes}分钟`;
}

export function RankingDetailPanel({ detail, mode, leaderCardFallbackUrl, onModeChange }: { detail: RankingPlayerDetail; mode: "player" | "line"; leaderCardFallbackUrl?: string; onModeChange: (mode: "player" | "line") => void }) {
  const activeTrace = (mode === "player" ? detail.playerTrace : detail.rankTrace) ?? [];
  const stats = traceStats(activeTrace);
  const currentScore = mode === "player" ? detail.score : activeTrace.at(-1)?.score ?? detail.score;
  const growth = mode === "player" ? detail.growth1h ?? detail.hourlyGrowth : detail.rankHourlyGrowth;
  const playerName = detail.playerName ?? detail.name;
  const hasChurn = mode === "player" && typeof detail.churn1h === "number" && ["fresh", "stale-refreshing"].includes(detail.churnStatus ?? "");
  const leaderCandidates = [...(detail.leaderCardImageCandidates ?? []), ...(detail.leaderCharacterImageCandidates ?? []), leaderCardFallbackUrl].filter((item): item is string => Boolean(item));
  const heatmap = [...(detail.hourlyChurn ?? [])].sort((a, b) => Date.parse(a.hour) - Date.parse(b.hour)).slice(-48);

  return <div className="focus-detail live-detail">
    <section className="live-detail-card">
      <div className="live-detail-title"><div><h3>实时排名详情</h3><span className="range-badge">{detail.inTop100Range ? "T100 玩家追踪" : "普通档位追踪"}</span></div><div className="live-tabs"><button type="button" className={mode === "player" ? "" : "secondary"} onClick={() => onModeChange("player")}>玩家追踪</button><button type="button" className={mode === "line" ? "" : "secondary"} onClick={() => onModeChange("line")}>档线追踪</button></div></div>
      <div className="live-player-card"><div className="live-player-main">{mode === "player" ? <ArtImage src={detail.leaderCardImageUrl} srcCandidates={leaderCandidates} label={`${playerName} 当前队长`} variant="avatar" eager /> : <div className="art-fallback avatar"><span>T{detail.rank}</span></div>}<div><span className="focus-player-name">{mode === "line" ? `T${detail.rank} 档线` : playerName}</span><div className="live-rank-line"><strong>{mode === "line" ? `T${detail.rank}` : `#${detail.rank}`}</strong><b>{formatNumber(currentScore)} pt</b></div><small>采集时间 {formatTime(detail.timestamp ?? activeTrace.at(-1)?.timestamp)}</small>{mode === "player" && <small>队长卡 {detail.leaderCardId ?? detail.cardId ?? "-"} / Lv.{detail.leaderCardLevel ?? detail.cardLevel ?? "-"} / Master Rank {detail.leaderCardMasterRank ?? detail.cardMasterRank ?? "-"}</small>}</div></div><div className="honor-strip"><span>{mode === "player" ? detail.profileWord || "暂无公开签名" : `T${detail.rank} 档线`}</span><span>轨迹采集间隔 {detail.intervalSeconds ? `${Math.round(detail.intervalSeconds / 60)} 分钟` : "-"}</span><span>{hasChurn ? `近 1H 周回 ${detail.churn1h}` : `近 1H PT 更新 ${detail.observedPtUpdates ?? 0}`}</span></div></div>
      <div className="live-metric-grid"><div><span>{mode === "player" ? "玩家时速" : "档线时速"}</span><strong className="positive">{growth ? `+${formatNumber(growth)} pt/h` : "-"}</strong></div><div><span>{hasChurn ? "近 1H 周回" : "近 1H PT 更新次数"}</span><strong>{hasChurn ? detail.churn1h : detail.observedPtUpdates ?? 0}</strong><small>{hasChurn ? `20分钟×3：${(detail.churn20min ?? 0) * 3}` : "采样变化次数，不能代表实际周回场次"}</small></div><div><span>{hasChurn ? "48H 周回" : "相邻玩家"}</span><strong>{hasChurn ? detail.churn48h : detail.next ? `#${detail.next.rank}` : "-"}</strong><small>{hasChurn ? detail.churnStatus : detail.next ? `${formatNumber(detail.next.score)} pt` : "暂无"}</small></div></div>
      {mode === "player" && <div className="churn-source-note"><strong>{hasChurn ? "服务端周回统计" : "周回数据不可用"}</strong><span>{hasChurn ? `更新于 ${formatTime(detail.churnUpdatedAt)}${detail.churnStatus === "stale-refreshing" ? "，正在后台刷新" : ""}` : `状态：${detail.churnStatus ?? "source-unavailable"}。当前仅展示 Haruki 轨迹中的 PT 更新次数。`}</span></div>}
      <div className="trace-chart"><div className="trace-y-axis"><span>{formatNumber(stats.maxScore)}</span><span>{formatNumber(Math.round((stats.maxScore + stats.minScore) / 2))}</span><span>{formatNumber(stats.minScore)}</span></div><div className="trace-plot">{activeTrace.length > 1 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="积分随采集时间变化折线图"><polyline points={stats.points} /></svg> : <p className="empty-state">暂无足够趋势数据。</p>}</div><div className="trace-x-axis"><span>{formatTime(stats.start)}</span><strong>时间</strong><span>{formatTime(stats.end)}</span></div></div>
    </section>
    {hasChurn && <section className="focus-section"><h3>48 小时周回热力图</h3><div className="churn-heatmap">{heatmap.map((hour) => <div key={hour.hour} className={`churn-cell churn-level-${Math.min(4, Math.ceil(hour.count / 5))}`} title={`${formatTime(hour.hour)} · ${hour.count} 回`}><strong>{hour.count}</strong><small>{new Date(hour.hour).getHours()}时</small></div>)}</div>{!heatmap.length && <p className="empty-state">暂无小时周回分布。</p>}</section>}
    {hasChurn && <section className="focus-section"><h3>近期分数变化</h3><div className="trace-table">{(detail.recentScoreChanges ?? []).slice(-24).reverse().map((change) => <div key={`${change.timestamp}-${change.delta}`}><span>{formatTime(change.timestamp)}</span><strong>周回变化</strong><b>+{formatNumber(change.delta)} pt</b></div>)}{!(detail.recentScoreChanges ?? []).length && <p className="empty-state">暂无近期变化记录。</p>}</div></section>}
    {hasChurn && (detail.parkingPeriods ?? []).length > 0 && <section className="focus-section"><h3>停车时段</h3><div className="trace-table">{detail.parkingPeriods!.slice(-12).reverse().map((period, index) => <div key={`${period.startTime ?? period.sinceMs}-${index}`}><span>{formatTime(period.startTime ?? period.sinceMs)}</span><strong>{period.endTime ? `至 ${formatTime(period.endTime)}` : "仍在停车"}</strong><b>{durationLabel(period.durationSeconds)}</b></div>)}</div></section>}
    <section className="focus-section"><h3>轨迹采样记录</h3><div className="trace-table">{activeTrace.slice(-24).map((point) => <div key={`${point.timestamp}-${point.rank}-${point.score}`}><span>{formatTime(point.timestamp)}</span><strong>#{point.rank}</strong><b>{formatNumber(point.score)} pt</b></div>)}{!activeTrace.length && <p className="empty-state">暂无采样记录。</p>}</div></section>
  </div>;
}
