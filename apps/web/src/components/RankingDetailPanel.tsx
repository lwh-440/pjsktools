import { ArtImage } from "./ui";

export type RankingTracePoint = { timestamp: number; userId?: string; score: number; rank: number };
export type RankingEntry = {
  rank: number; userId: string; name: string; playerName?: string; profileWord?: string; score: number; updatedAt?: string; hourlyGrowth?: number;
  cardId?: number; leaderCardId?: number; cardLevel?: number; leaderCardLevel?: number; cardMasterRank?: number; leaderCardMasterRank?: number;
  cardDefaultImage?: string; leaderCardDefaultImage?: string; leaderCardImageUrl?: string; leaderCardImageCandidates?: string[];
  leaderCharacterImageCandidates?: string[]; leaderAssetStatus?: "matched" | "card-master-missing" | "asset-unavailable";
};
export type RankingPlayerDetail = RankingEntry & {
  timestamp?: number; profileWord?: string; profileHonors?: unknown[]; intervalSeconds?: number; inTop100Range?: boolean;
  rankHourlyGrowth?: number; playerTrace?: RankingTracePoint[]; rankTrace?: RankingTracePoint[]; next?: RankingEntry;
  churnSource?: string; churnStatus?: string; churn1h?: number; churn20min?: number; churn48h?: number; growth1h?: number;
  hourlyChurn?: Array<{ hour: string; count: number }>; recentScoreChanges?: Array<{ timestamp: number; delta: number }>;
  parkingPeriods?: Array<{ startTime?: number; sinceMs?: number; endTime?: number; durationSeconds?: number; active?: boolean }>;
  churnUpdatedAt?: string; observedPtUpdates?: number; traceCompleteness?: "complete" | "partial" | "unavailable";
};

function formatNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "-";
}

export function formatCompactScore(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value >= 10000 ? `${(value / 10000).toFixed(value >= 100000 ? 0 : 1)}万` : new Intl.NumberFormat("zh-CN").format(value);
}

export function formatParkingPeriod(period: { startTime?: number; sinceMs?: number; endTime?: number; durationSeconds?: number; active?: boolean }) {
  const start = formatTime(period.startTime ?? period.sinceMs);
  const end = period.active && !period.endTime ? "至今" : period.endTime ? formatTime(period.endTime) : "结束时间未知";
  const minutes = typeof period.durationSeconds === "number" && Number.isFinite(period.durationSeconds) && period.durationSeconds >= 0 ? `${Math.round(period.durationSeconds / 60)}min` : "时长未知";
  return `${start}-${end} ${minutes}`;
}

export function buildHourlyChurnTable(points: Array<{ hour: string; count: number }>) {
  const valid = points.map((p) => new Date(p.hour).getTime()).filter(Number.isFinite);
  const anchor = valid.length ? Math.max(...valid) : Date.now();
  const d = new Date(anchor); const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
  const start = new Date(end.getTime() - 47 * 3600_000);
  const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const map = new Map(points.map((p) => [new Date(p.hour).setMinutes(0, 0, 0), p]));
  const rows: Array<{ date: string; cells: Array<{ hour: string; count: number } | undefined> }> = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor <= lastDate) {
    const day = new Date(cursor);
    rows.push({
      date: dateKey(day),
      cells: Array.from({ length: 24 }, (_, hour) => {
        const slot = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
        return slot < start || slot > end ? undefined : map.get(slot.getTime());
      })
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    rows,
    maxCount: Math.max(0, ...points.filter((p) => new Date(p.hour).getTime() >= start.getTime()).map((p) => p.count))
  };
}

function formatTime(value?: number | string) {
  if (value === undefined || value === null || value === "") return "-";
  const numeric = typeof value === "number" ? value : Date.parse(value);
  const milliseconds = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(milliseconds);
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
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "-";
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
  const hourlyChurn = detail.hourlyChurn ?? [];
  const heatmapTable = buildHourlyChurnTable(hourlyChurn);
  const heatmapDateLabel = (key: string) => {
    const parts = key.split("-");
    return parts.length === 3 ? `${parts[1]}/${parts[2]}` : key;
  };
  const recentScoreChanges = [...(detail.recentScoreChanges ?? [])]
    .filter((change) => Number.isFinite(change.timestamp) && Number.isFinite(change.delta))
    .sort((left, right) => right.timestamp - left.timestamp);

  return <div className="focus-detail live-detail">
    <section className="live-detail-card">
      <div className="live-detail-title"><div><span className="live-detail-kicker">实时数据</span><span className="range-badge">{detail.inTop100Range ? "T100 玩家追踪" : "普通档位追踪"}</span></div><div className="live-tabs"><button type="button" className={mode === "player" ? "" : "secondary"} onClick={() => onModeChange("player")}>玩家追踪</button><button type="button" className={mode === "line" ? "" : "secondary"} onClick={() => onModeChange("line")}>档线追踪</button></div></div>
      <div className="live-player-card"><div className="live-player-main">{mode === "player" ? <ArtImage src={detail.leaderCardImageUrl} srcCandidates={leaderCandidates} label={`${playerName} 当前队长`} variant="avatar" eager /> : <div className="art-fallback avatar"><span>T{detail.rank}</span></div>}<div><span className="focus-player-name">{mode === "line" ? `T${detail.rank} 档线` : playerName}</span>{mode === "player" && <small className="live-player-signature">{detail.profileWord || "暂无公开签名"}</small>}<div className="live-rank-line"><strong>{mode === "line" ? `T${detail.rank}` : `#${detail.rank}`}</strong><b>{formatNumber(currentScore)} pt</b></div><small>采集时间 {formatTime(detail.timestamp ?? activeTrace.at(-1)?.timestamp)}</small>{mode === "player" && <small>队长卡 {detail.leaderCardId ?? detail.cardId ?? "-"} / Lv.{detail.leaderCardLevel ?? detail.cardLevel ?? "-"} / Master Rank {detail.leaderCardMasterRank ?? detail.cardMasterRank ?? "-"}</small>}</div></div></div>
      <div className={`live-metric-grid ${mode === "line" ? "live-line-metric-grid" : ""}`}><div><span>{mode === "player" ? "玩家时速" : "档线时速"}</span><strong className="positive">{typeof growth === "number" ? `+${formatNumber(growth)} pt/h` : "-"}</strong></div>{mode === "line" ? <div><span>相邻玩家</span><strong>{detail.next ? `#${detail.next.rank}` : "-"}</strong><small>{detail.next ? `${detail.next.playerName ?? detail.next.name} · ${formatNumber(detail.next.score)} pt` : "暂无相邻玩家数据"}</small></div> : <><div><span>近1H 周回数</span><strong>{hasChurn ? detail.churn1h : "—"}</strong><small>{hasChurn ? `20分钟×3：${(detail.churn20min ?? 0) * 3}` : "暂无统计"}</small></div><div><span>{hasChurn ? "48H 周回" : "相邻玩家"}</span><strong>{hasChurn ? detail.churn48h : detail.next ? `#${detail.next.rank}` : "-"}</strong><small>{hasChurn ? detail.churnStatus : detail.next ? `${formatNumber(detail.next.score)} pt` : "暂无"}</small></div></>}</div>
      {mode === "player" && <div className="churn-source-note"><strong>{hasChurn ? "服务端周回统计" : "周回统计暂缺"}</strong><span title={hasChurn ? undefined : `原始状态：${detail.churnStatus ?? "source-unavailable"}`} aria-label={hasChurn ? undefined : `真实周回统计暂缺。原始状态：${detail.churnStatus ?? "source-unavailable"}`}>{hasChurn ? `更新于 ${formatTime(detail.churnUpdatedAt)}${detail.churnStatus === "stale-refreshing" ? "，正在后台刷新" : ""}` : "当前接口未返回真实周回数据。"}</span></div>}
      <div className="trace-chart"><div className="trace-y-axis"><span title={String(stats.maxScore)}>{formatCompactScore(stats.maxScore)}</span><span title={String(Math.round((stats.maxScore + stats.minScore) / 2))}>{formatCompactScore(Math.round((stats.maxScore + stats.minScore) / 2))}</span><span title={String(stats.minScore)}>{formatCompactScore(stats.minScore)}</span></div><div className="trace-plot">{activeTrace.length > 1 ? <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="积分随采集时间变化折线图"><polyline points={stats.points} /></svg> : <p className="empty-state">暂无足够趋势数据。</p>}</div><div className="trace-x-axis"><span>{formatTime(stats.start)}</span><strong>时间</strong><span>{formatTime(stats.end)}</span></div></div>
    </section>
    {mode === "player" && <section className="focus-section churn-heatmap-section"><h3>48 小时周回热力图</h3><p className="heatmap-caption">行是日期，列为本地小时；空白表示该时段没有采样。</p>{hourlyChurn.length > 0 ? <div className="churn-heatmap-scroll"><table className="churn-heatmap" aria-label="48小时周回次数热力图"><thead><tr><th scope="col">日期</th>{Array.from({ length: 24 }, (_, hour) => <th scope="col" key={hour}>{String(hour).padStart(2, "0")}</th>)}</tr></thead><tbody>{heatmapTable.rows.map((row) => <tr key={row.date}><th scope="row">{heatmapDateLabel(row.date)}</th>{row.cells.map((point, hour) => { const count = point && Number.isFinite(point.count) ? point.count : undefined; const level = count === undefined || heatmapTable.maxCount <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / heatmapTable.maxCount) * 4))); return <td key={`${row.date}-${hour}`} className={`churn-cell ${count === undefined ? "churn-empty" : `churn-level-${level}`}`} title={point && count !== undefined ? `${formatTime(point.hour)} · ${count} 回` : "该时段没有采样"} aria-label={point && count !== undefined ? `${heatmapDateLabel(row.date)} ${String(hour).padStart(2, "0")}时 ${count} 回` : `${heatmapDateLabel(row.date)} ${String(hour).padStart(2, "0")}时 无采样`}>{count === undefined ? "—" : count}</td>; })}</tr>)}</tbody></table></div> : <p className="empty-state">暂无真实周回数据，当前接口未返回 hourlyChurn。</p>}</section>}
    {mode === "player" && <details className="calculation-details focus-section recent-score-changes-details"><summary>近期分数变化{Array.isArray(detail.recentScoreChanges) ? `（${recentScoreChanges.length} 条）` : ""}</summary>{Array.isArray(detail.recentScoreChanges) ? (recentScoreChanges.length > 0 ? <div className="recent-score-change-list">{recentScoreChanges.map((change, index) => <div key={`${change.timestamp}-${change.delta}-${index}`}><time>{formatTime(change.timestamp)}</time><span>积分变化</span><strong className={change.delta >= 0 ? "positive" : "negative"}>{change.delta >= 0 ? "+" : ""}{formatNumber(change.delta)} pt</strong></div>)}</div> : <p className="empty-state">近期没有记录到分数变化。</p>) : <p className="empty-state">当前接口未返回近期分数变化。</p>}</details>}
    {hasChurn && (detail.parkingPeriods ?? []).length > 0 && <details className="calculation-details focus-section parking-periods-details"><summary>停车时段（{detail.parkingPeriods!.length} 段）</summary><div className="parking-period-list">{detail.parkingPeriods!.slice().reverse().map((period, index) => <p key={`${period.startTime ?? period.sinceMs ?? "unknown"}-${period.endTime ?? "open"}-${index}`}>{formatParkingPeriod(period)}</p>)}</div></details>}
  </div>;
}
