import { BookOpen, CalendarDays, Layers3, Play, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { apiGetWithSignal } from "../api";
import { ArtImage, Pagination } from "../components/ui";

type StorySummary = { id: string; storyType: string; name: string; description?: string; unit?: string; relatedId?: string | number; startAt?: number; chapterCount: number; episodeCount: number; bannerUrl?: string; imageCandidates?: string[]; imageStatus?: string; capabilityStatus?: string };
type Catalog = { items: StorySummary[]; page: number; pageSize: number; total: number; totalPages: number; capabilityStatus: string; warnings?: string[] };
type Chapter = { id: string; name?: string; title?: string; chapterId?: string; chapterTitle?: string; episodeIndex?: number; scenarioStatus?: string; storyType?: string };
type Detail = { storyId: string; storyType: string; displayTitle?: string; bannerUrl?: string; imageCandidates?: string[]; imageStatus?: string; chapters: Chapter[]; matches?: Array<{ raw?: Record<string, unknown> }>; unavailableReason?: string; playbackReadiness?: { hasScenario?: boolean } };
const labels: Record<string, string> = { eventStories: "活动故事", unitStories: "组合故事", cardEpisodes: "卡牌剧情", specialStories: "特殊故事" };
const filterKey = (region: string) => `pjsktools:story-filters:${region}`;
const scrollKey = (region: string) => `pjsktools:story-scroll:${region}`;

function dateText(value?: number) { return value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(value) : "时间未公开"; }

function StoryCover({ story, eager = false }: { story: Pick<StorySummary, "storyType" | "name" | "bannerUrl" | "imageCandidates" | "imageStatus">; eager?: boolean }) {
  if (story.imageStatus === "matched" && story.imageCandidates?.length) return <ArtImage src={story.bannerUrl} srcCandidates={story.imageCandidates} label={story.name} variant="wide" eager={eager} />;
  return <div className={`story-type-cover ${story.storyType}`}><BookOpen size={36} /><strong>{labels[story.storyType] ?? "故事"}</strong><span>{story.storyType === "unitStories" ? "组合章节" : story.storyType === "specialStories" ? "特殊篇章" : "剧情资料"}</span></div>;
}

export function StoryCatalogPage({ region }: { region: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const saved = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(filterKey(region)) ?? "{}"); } catch { return {}; } }, [region]);
  const [storyType, setStoryType] = useState(searchParams.get("storyType") ?? saved.storyType ?? "all");
  const [query, setQuery] = useState(searchParams.get("q") ?? saved.query ?? "");
  const [unit, setUnit] = useState(searchParams.get("unit") ?? saved.unit ?? "");
  const [relatedId, setRelatedId] = useState(searchParams.get("relatedId") ?? saved.relatedId ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? saved.sort ?? "time-desc");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? saved.page ?? 1));
  const [pageSize, setPageSize] = useState(Number(saved.pageSize ?? 24));
  const [reload, setReload] = useState(0);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort });
    if (storyType !== "all") params.set("storyType", storyType);
    if (query.trim()) params.set("q", query.trim());
    if (unit) params.set("unit", unit);
    if (relatedId) params.set("relatedId", relatedId);
    setCatalog(null);
    setError("");
    apiGetWithSignal<Catalog>(`/api/master/${region}/stories/catalog?${params}`, controller.signal).then((value) => { if (active) setCatalog(value); }).catch((value) => { if (active && value?.name !== "AbortError") setError(value instanceof Error ? value.message : String(value)); });
    return () => { active = false; controller.abort(); };
  }, [region, storyType, query, unit, relatedId, sort, page, pageSize, reload]);
  useEffect(() => {
    const next: Record<string, string> = {};
    if (storyType !== "all") next.storyType = storyType; if (query) next.q = query; if (unit) next.unit = unit; if (relatedId) next.relatedId = relatedId; if (sort !== "time-desc") next.sort = sort; if (page > 1) next.page = String(page);
    setSearchParams(next, { replace: true });
    sessionStorage.setItem(filterKey(region), JSON.stringify({ storyType, query, unit, relatedId, sort, page, pageSize }));
  }, [storyType, query, unit, relatedId, sort, page, pageSize]);
  useEffect(() => { setPage(1); }, [region, storyType, query, unit, relatedId, sort]);
  useEffect(() => { const value = Number(sessionStorage.getItem(scrollKey(region)) ?? 0); if (value) requestAnimationFrame(() => window.scrollTo({ top: value })); }, [region]);

  return <section className="story-catalog-page">
    <div className="story-page-heading"><div><h2>故事</h2><p>选择作品和章节后进入独立播放器。</p></div><button type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />刷新</button></div>
    <div className="story-filterbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索故事名称或 ID" /></label><select value={storyType} onChange={(event) => setStoryType(event.target.value)}><option value="all">全部故事</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="组合" /><input inputMode="numeric" value={relatedId} onChange={(event) => setRelatedId(event.target.value.replace(/\D/g, ""))} placeholder="活动/卡牌 ID" /><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="time-desc">从新到旧</option><option value="time-asc">从旧到新</option><option value="id-asc">ID 从小到大</option></select></div>
    {error && <p className="warning-text">{error}</p>}{!catalog && !error && <p className="empty-state">正在加载故事目录...</p>}
    <p className="catalog-result-count">共 {catalog?.total ?? 0} 个作品</p>
    <div className="story-catalog-grid">{(catalog?.items ?? []).map((story) => <button type="button" className="story-catalog-card" key={`${region}:${story.storyType}:${story.id}`} onClick={() => { sessionStorage.setItem(scrollKey(region), String(window.scrollY)); navigate(`/section/stories/${story.storyType}/${encodeURIComponent(story.id)}${location.search}`); }}><StoryCover story={story} /><div><span>{labels[story.storyType] ?? story.storyType}</span><h3>{story.name}</h3><p>{story.description || `${story.episodeCount} 个章节`}</p><small><CalendarDays size={14} />{dateText(story.startAt)} · <Layers3 size={14} />{story.episodeCount} 章</small></div></button>)}</div>
    {catalog && !catalog.items.length && <p className="empty-state">没有符合条件的故事。</p>}
    {(catalog?.totalPages ?? 1) > 1 && <Pagination page={catalog?.page ?? page} totalPages={catalog?.totalPages ?? 1} pageSize={catalog?.pageSize ?? pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />}
  </section>;
}

export function StoryDetailPage({ region }: { region: string }) {
  const { storyType = "", storyId = "" } = useParams();
  const location = useLocation();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); let active = true; setDetail(null); setError(""); apiGetWithSignal<Detail>(`/api/master/${region}/stories/${encodeURIComponent(storyType)}/${encodeURIComponent(storyId)}/full`, controller.signal).then((value) => { if (active) setDetail(value); }).catch((value) => { if (active && value?.name !== "AbortError") setError(value instanceof Error ? value.message : String(value)); }); return () => { active = false; controller.abort(); }; }, [region, storyType, storyId]);
  if (error) return <section className="story-detail-page"><Link to={`/section/stories${location.search}`}>返回目录</Link><p className="warning-text">{error}</p></section>;
  if (!detail) return <p className="empty-state">正在加载故事详情...</p>;
  const raw = detail.matches?.[0]?.raw ?? {};
  const title = detail.displayTitle || String(raw.title ?? raw.name ?? storyId);
  const notReleased = detail.unavailableReason && !detail.chapters.length;
  return <section className="story-detail-page"><Link className="secondary-link" to={`/section/stories${location.search}`}>返回目录</Link><div className="story-detail-hero"><StoryCover story={{ storyType, name: title, bannerUrl: detail.bannerUrl, imageCandidates: detail.imageCandidates, imageStatus: detail.imageStatus }} eager /><div><span>{labels[storyType] ?? storyType}</span><h2>{title}</h2><p>{String(raw.outline ?? raw.description ?? `${detail.chapters.length} 个可选章节`)}</p></div></div>{notReleased ? <p className="warning-text">该故事未在当前区服实装，或当前区服 master 尚未收录。</p> : detail.unavailableReason && <p className="warning-text">{detail.unavailableReason}</p>}<article className="panel story-episode-panel"><h3>章节</h3><div className="story-episode-list">{detail.chapters.map((chapter, index) => <div key={`${chapter.id}:${index}`}><span className="story-episode-index">{index + 1}</span><div><strong>{chapter.name ?? chapter.title ?? `章节 ${index + 1}`}</strong>{chapter.chapterTitle && <small>{chapter.chapterTitle}</small>}<small>{chapter.scenarioStatus === "ready" ? "场景可读取" : "场景资源待确认"}</small></div><Link className="story-play-link" to={`/section/stories/${storyType}/${encodeURIComponent(storyId)}/${encodeURIComponent(chapter.id)}/play${location.search}`}><Play size={15} />播放</Link></div>)}</div>{!detail.chapters.length && <p className="empty-state">当前区服没有可播放章节。</p>}</article></section>;
}
