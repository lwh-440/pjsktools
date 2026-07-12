import { ArrowLeft, ChevronDown, CircleAlert, Music2, Pause, Play, RefreshCw, Search, SkipBack, SkipForward, Users, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiGet, apiGetWithSignal, apiResourceUrl } from "../api";
import { ArtImage, Pagination } from "../components/ui";

type VirtualLiveSummary = {
  id: string;
  name: string;
  virtualLiveType?: string;
  startAt?: number;
  endAt?: number;
  imageUrl?: string;
  imageCandidates?: string[];
  scheduleCount?: number;
  setlistCount?: number;
  rewardCount?: number;
};

type Catalog = { items: VirtualLiveSummary[]; total: number; capabilityStatus?: string; warnings?: string[] };
type SetlistSummary = { index: number; id: string; seq: number; type: string; assetbundleName?: string; music?: { id: string; title: string; jacketCandidates?: string[] }; musicVocal?: { id: string; assetbundleName?: string }; playbackLoading?: string };
type Detail = { live: VirtualLiveSummary; schedules: any[]; characters: any[]; resolvedRewards: any[]; setlistSummaries: SetlistSummary[]; detailReadiness?: any; capabilityStatus?: string };
type StepResult = { stepIndex: number; step: any; music?: any; musicVocal?: any; mcEvents?: any[]; playbackQueue?: Array<{ type: string; label: string; time?: number; url: string }>; warnings?: string[]; playbackStatus?: string; unavailableReason?: string };

const filterStorageKey = "pjsktools:virtual-live-filters";
const scrollStorageKey = "pjsktools:virtual-live-scroll";
const stepCache = new Map<string, StepResult>();

function dateText(value?: number) {
  if (!value) return "时间未公开";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(value);
}

function liveStatus(live: VirtualLiveSummary) {
  const now = Date.now();
  if (live.startAt && now < live.startAt) return "upcoming";
  if (live.endAt && now > live.endAt) return "ended";
  return "active";
}

const statusLabels: Record<string, string> = { active: "进行中", upcoming: "即将开始", ended: "已结束" };
const typeLabels: Record<string, string> = { normal: "普通 Live", archive: "回放 Live", cheerful_carnival: "欢乐嘉年华", virtual_live: "Virtual Live" };
const stepLabels: Record<string, string> = { music: "歌曲", mc: "MC", mc_timeline: "MC 时间线" };

export function VirtualLiveCatalogPage({ region }: { region: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const saved = useMemo(() => {
    try { return JSON.parse(sessionStorage.getItem(filterStorageKey) ?? "{}"); } catch { return {}; }
  }, []);
  const [query, setQuery] = useState(searchParams.get("q") ?? saved.query ?? "");
  const [type, setType] = useState(searchParams.get("type") ?? saved.type ?? "all");
  const [status, setStatus] = useState(searchParams.get("status") ?? saved.status ?? "all");
  const [sort, setSort] = useState(searchParams.get("sort") ?? saved.sort ?? "time-desc");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? saved.page ?? 1));
  const [pageSize, setPageSize] = useState(Number(saved.pageSize ?? 24));

  const load = async () => {
    setLoading(true);
    setError("");
    try { setCatalog(await apiGet(`/api/master/${region}/virtual-lives/context`)); }
    catch (value) { setError(value instanceof Error ? value.message : String(value)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [region]);
  useEffect(() => {
    const next: Record<string, string> = {};
    if (query) next.q = query;
    if (type !== "all") next.type = type;
    if (status !== "all") next.status = status;
    if (sort !== "time-desc") next.sort = sort;
    if (page > 1) next.page = String(page);
    setSearchParams(next, { replace: true });
    sessionStorage.setItem(filterStorageKey, JSON.stringify({ query, type, status, sort, page, pageSize }));
  }, [query, type, status, sort, page, pageSize]);
  useEffect(() => {
    const scroll = Number(sessionStorage.getItem(scrollStorageKey) ?? 0);
    if (scroll > 0) requestAnimationFrame(() => window.scrollTo({ top: scroll }));
  }, [catalog]);

  const types = Array.from(new Set((catalog?.items ?? []).map((item) => item.virtualLiveType).filter(Boolean))).sort() as string[];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return [...(catalog?.items ?? [])].filter((item) => {
      if (type !== "all" && item.virtualLiveType !== type) return false;
      if (status !== "all" && liveStatus(item) !== status) return false;
      return !normalized || `${item.id} ${item.name}`.toLowerCase().includes(normalized);
    }).sort((left, right) => {
      if (sort === "id-asc") return Number(left.id) - Number(right.id);
      if (sort === "id-desc") return Number(right.id) - Number(left.id);
      const delta = Number(left.startAt ?? 0) - Number(right.startAt ?? 0);
      return sort === "time-asc" ? delta : -delta;
    });
  }, [catalog, query, type, status, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { setPage(1); }, [query, type, status, sort, region]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return <section className="virtual-live-catalog-page">
    <div className="virtual-live-page-heading"><div><h2>虚拟 Live</h2><p>选择一场 Live 查看资料、节目单和按需回放。</p></div><button type="button" onClick={load}><RefreshCw size={16} />刷新</button></div>
    <div className="virtual-live-filterbar">
      <label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 Live 名称或 ID" /></label>
      <select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部类型</option>{types.map((value) => <option key={value} value={value}>{typeLabels[value] ?? value}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="active">进行中</option><option value="upcoming">即将开始</option><option value="ended">已结束</option></select>
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="time-desc">时间从新到旧</option><option value="time-asc">时间从旧到新</option><option value="id-desc">ID 从大到小</option><option value="id-asc">ID 从小到大</option></select>
    </div>
    {loading && !catalog && <p className="empty-state">正在加载 Virtual Live 目录...</p>}
    {error && <p className="warning-text">{error}</p>}
    <p className="catalog-result-count">共 {filtered.length} 场</p>
    <div className="virtual-live-catalog-grid">{items.map((live) => <button type="button" key={live.id} className="virtual-live-catalog-card" onClick={() => { sessionStorage.setItem(scrollStorageKey, String(window.scrollY)); navigate(`/section/virtualLives/${live.id}${location.search}`); }}>
      <ArtImage src={live.imageUrl} srcCandidates={live.imageCandidates} label={live.name} variant="wide" />
      <div><span className={`virtual-live-status ${liveStatus(live)}`}>{statusLabels[liveStatus(live)]}</span><h3>{live.name}</h3><p>{dateText(live.startAt)}</p><small>{typeLabels[live.virtualLiveType ?? ""] ?? live.virtualLiveType ?? "Virtual Live"} · 节目 {live.setlistCount ?? 0}</small></div>
    </button>)}</div>
    {!loading && !items.length && <p className="empty-state">没有符合条件的 Virtual Live。</p>}
    {filtered.length > pageSize && <Pagination page={page} totalPages={totalPages} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />}
  </section>;
}

export function VirtualLiveDetailPage({ region }: { region: string }) {
  const { virtualLiveId = "" } = useParams();
  const location = useLocation();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<Record<number, StepResult>>({});
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({});
  const [loadingSteps, setLoadingSteps] = useState<Set<number>>(new Set());
  const [queue, setQueue] = useState<Array<{ stepIndex: number; label: string; url: string }>>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [volume, setVolume] = useState(0.8);
  const [isPlaying, setIsPlaying] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [continuousStepIndex, setContinuousStepIndex] = useState(-1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllers = useRef(new Map<number, AbortController>());

  useEffect(() => {
    let active = true;
    setDetail(null); setError(""); setSteps({}); setQueue([]); setQueueIndex(-1); setContinuous(false); setContinuousStepIndex(-1);
    apiGet<Detail>(`/api/master/${region}/virtual-lives/${encodeURIComponent(virtualLiveId)}/full`).then((value) => { if (active) setDetail(value); }).catch((value) => { if (active) setError(value instanceof Error ? value.message : String(value)); });
    return () => { active = false; controllers.current.forEach((controller) => controller.abort()); controllers.current.clear(); audioRef.current?.pause(); };
  }, [region, virtualLiveId]);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume, queueIndex]);

  const loadStep = async (index: number) => {
    const key = `${region}:${virtualLiveId}:${index}:v1`;
    if (steps[index]) return steps[index];
    const cached = stepCache.get(key);
    if (cached) { setSteps((current) => ({ ...current, [index]: cached })); return cached; }
    controllers.current.get(index)?.abort();
    const controller = new AbortController();
    controllers.current.set(index, controller);
    setLoadingSteps((current) => new Set(current).add(index));
    setStepErrors((current) => ({ ...current, [index]: "" }));
    try {
      const value = await apiGetWithSignal<StepResult>(`/api/master/${region}/virtual-lives/${encodeURIComponent(virtualLiveId)}/steps/${index}`, controller.signal);
      if (!controller.signal.aborted) { stepCache.set(key, value); setSteps((current) => ({ ...current, [index]: value })); }
      return value;
    } catch (value) {
      if (!controller.signal.aborted) setStepErrors((current) => ({ ...current, [index]: value instanceof Error ? value.message : String(value) }));
      return undefined;
    } finally {
      setLoadingSteps((current) => { const next = new Set(current); next.delete(index); return next; });
    }
  };

  const playStep = async (index: number) => {
    const result = await loadStep(index);
    const next = (result?.playbackQueue ?? []).map((item) => ({ stepIndex: index, label: item.label, url: apiResourceUrl(item.url) }));
    setContinuous(false); setContinuousStepIndex(index); setQueue(next); setQueueIndex(next.length ? 0 : -1);
  };
  const loadContinuousStep = async (startIndex: number): Promise<boolean> => {
    if (!detail) return false;
    for (let index = startIndex; index < detail.setlistSummaries.length; index += 1) {
      const result = await loadStep(index);
      const next = (result?.playbackQueue ?? []).map((item) => ({ stepIndex: index, label: item.label, url: apiResourceUrl(item.url) }));
      if (next.length) {
        setContinuousStepIndex(index); setQueue(next); setQueueIndex(0);
        if (index + 1 < detail.setlistSummaries.length) void loadStep(index + 1);
        return true;
      }
    }
    setQueueIndex(-1);
    return false;
  };
  const playAll = async () => { setContinuous(true); await loadContinuousStep(0); };
  const changeQueue = async (delta: number) => {
    const next = queueIndex + delta;
    if (next >= 0 && next < queue.length) { setQueueIndex(next); return; }
    if (delta > 0 && continuous) await loadContinuousStep(continuousStepIndex + 1);
  };
  const activeQueue = queue[queueIndex];

  if (error) return <section className="virtual-live-detail-page"><Link className="secondary-link" to={`/section/virtualLives${location.search}`}><ArrowLeft size={16} />返回目录</Link><p className="warning-text">{error}</p></section>;
  if (!detail) return <p className="empty-state">正在加载 Virtual Live 详情...</p>;
  return <section className="virtual-live-detail-page">
    <Link className="secondary-link" to={`/section/virtualLives${location.search}`}><ArrowLeft size={16} />返回目录</Link>
    <div className="virtual-live-detail-hero"><ArtImage src={detail.live.imageUrl} srcCandidates={detail.live.imageCandidates} label={detail.live.name} variant="wide" eager /><div><span>{typeLabels[detail.live.virtualLiveType ?? ""] ?? detail.live.virtualLiveType}</span><h2>{detail.live.name}</h2><p>{dateText(detail.live.startAt)} - {dateText(detail.live.endAt)}</p><div className="virtual-live-hero-stats"><span><Users size={15} />{detail.characters.length} 名角色</span><span><Music2 size={15} />{detail.setlistSummaries.length} 个节目</span></div></div></div>
    <div className="virtual-live-detail-grid">
      <article className="panel"><h3>出演角色</h3><div className="virtual-live-character-list">{detail.characters.map((character) => <span key={`${character.id}:${character.gameCharacterUnitId}`}>{character.name}</span>)}</div>{!detail.characters.length && <p className="empty-state">角色资料未收录。</p>}</article>
      <article className="panel"><h3>奖励</h3><div className="virtual-live-reward-list">{detail.resolvedRewards.map((reward, index) => <div key={`${reward.resourceType}:${reward.resourceId}:${index}`}><ArtImage src={reward.imageUrl} srcCandidates={reward.imageCandidates} label={reward.name} /><span>{reward.name}<small>× {reward.quantity}</small></span></div>)}</div>{!detail.resolvedRewards.length && <p className="empty-state">没有可解析奖励。</p>}</article>
      <article className="panel virtual-live-schedules"><h3>日程</h3>{detail.schedules.slice(0, 24).map((schedule, index) => <p key={schedule.id ?? index}>{dateText(schedule.startAt)} - {dateText(schedule.endAt)}</p>)}{!detail.schedules.length && <p className="empty-state">没有独立日程。</p>}</article>
    </div>
    <article className="panel virtual-live-setlist-panel"><div className="panel-heading"><div><h3>节目单</h3><p>歌曲与 MC 仅在展开时加载。</p></div><button type="button" onClick={playAll}><Play size={16} />连续播放</button></div>
      <div className="virtual-live-setlist">{detail.setlistSummaries.map((summary) => {
        const loaded = steps[summary.index]; const loading = loadingSteps.has(summary.index); const stepError = stepErrors[summary.index];
        return <details key={summary.id} onToggle={(event) => { if (event.currentTarget.open) void loadStep(summary.index); }}><summary><span className="setlist-index">{summary.seq}</span>{summary.music?.jacketCandidates?.length ? <ArtImage srcCandidates={summary.music.jacketCandidates} label={summary.music.title} /> : <span className="setlist-type-icon">{summary.type === "music" ? <Music2 size={18} /> : <Users size={18} />}</span>}<div><strong>{summary.music?.title ?? stepLabels[summary.type] ?? summary.type}</strong><small>{summary.musicVocal?.assetbundleName ?? summary.assetbundleName ?? ""}</small></div><span>{stepLabels[summary.type] ?? summary.type}</span><ChevronDown size={18} /></summary>
          <div className="virtual-live-step-detail">{loading && <p>正在加载这一段...</p>}{stepError && <p className="warning-text">加载失败。<button type="button" onClick={() => loadStep(summary.index)}>重试</button></p>}{loaded && <><div className="button-row"><button type="button" disabled={!loaded.playbackQueue?.length} onClick={() => playStep(summary.index)}><Play size={15} />从此段播放</button><span className={`playback-status ${loaded.playbackStatus}`}>{loaded.playbackStatus}</span></div>{loaded.music && <p>歌曲：{loaded.music.title ?? loaded.music.name}</p>}<div className="virtual-live-mc-events">{(loaded.mcEvents ?? []).map((event) => <div key={event.id}><span>{event.time?.toFixed?.(1) ?? event.time}s · {event.type}</span><strong>{event.serif ?? event.motionKey ?? event.character3dId}</strong>{event.voice?.proxiedUrl && <audio controls preload="none" src={apiResourceUrl(event.voice.proxiedUrl)} />}</div>)}</div>{loaded.unavailableReason && <p className="warning-text">{loaded.unavailableReason}</p>}</>}</div>
        </details>;
      })}</div>
    </article>
    <div className="virtual-live-player-bar"><button type="button" aria-label="上一段" disabled={queueIndex <= 0} onClick={() => void changeQueue(-1)}><SkipBack size={18} /></button><button type="button" aria-label="播放或暂停" disabled={!activeQueue} onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}>{isPlaying ? <Pause size={20} /> : <Play size={20} />}</button><button type="button" aria-label="下一段" disabled={queueIndex < 0 || (!continuous && queueIndex >= queue.length - 1)} onClick={() => void changeQueue(1)}><SkipForward size={18} /></button><div><strong>{activeQueue?.label ?? "选择节目开始播放"}</strong><small>{queue.length ? `${Math.max(0, queueIndex + 1)} / ${queue.length}${continuous ? " · 连续播放" : ""}` : "音频按需加载"}</small></div><Volume2 size={17} /><input aria-label="音量" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />{activeQueue && <audio ref={audioRef} autoPlay src={activeQueue.url} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => { setIsPlaying(false); void changeQueue(1); }} />}</div>
  </section>;
}
