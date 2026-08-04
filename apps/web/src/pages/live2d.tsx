import { RefreshCw, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { apiGetWithSignal } from "../api";
import { Pagination } from "../components/ui";

type ModelSummary = { id: string; name?: string; modelPath?: string; characterId?: number; costumeType?: string; regionReferenceStatus?: string; assetCounts?: { motions: number; expressions: number; textures: number } };
type Catalog = { items?: ModelSummary[]; models?: ModelSummary[]; page?: number; pageSize?: number; total?: number; totalPages?: number; availabilitySummary?: Record<string, number> };
const filterKey = "pjsktools:live2d-filters";
const scrollKey = "pjsktools:live2d-scroll";

export function Live2dCatalogPage({ region }: { region: string }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const saved = useMemo(() => { try { return JSON.parse(sessionStorage.getItem(filterKey) ?? "{}"); } catch { return {}; } }, []);
  const [query, setQuery] = useState(searchParams.get("q") ?? saved.query ?? "");
  const [characterId, setCharacterId] = useState(searchParams.get("characterId") ?? saved.characterId ?? "");
  const [costumeType, setCostumeType] = useState(searchParams.get("costumeType") ?? saved.costumeType ?? "");
  const [availability, setAvailability] = useState(searchParams.get("availability") ?? saved.availability ?? "region-referenced");
  const [page, setPage] = useState(Number(searchParams.get("page") ?? saved.page ?? 1));
  const [pageSize, setPageSize] = useState(Number(saved.pageSize ?? 24));
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), availability });
    if (query.trim()) params.set("q", query.trim());
    if (characterId) params.set("characterId", characterId);
    if (costumeType.trim()) params.set("costumeType", costumeType.trim());
    setLoading(true); setError("");
    apiGetWithSignal<Catalog>(`/api/master/${region}/live2d/models?${params}`, controller.signal)
      .then(setCatalog)
      .catch((value) => { if (value?.name !== "AbortError") setError(value instanceof Error ? value.message : String(value)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, query, characterId, costumeType, availability, page, pageSize, reload]);

  useEffect(() => {
    const next: Record<string, string> = {};
    if (query) next.q = query;
    if (characterId) next.characterId = characterId;
    if (costumeType) next.costumeType = costumeType;
    if (availability !== "region-referenced") next.availability = availability;
    if (page > 1) next.page = String(page);
    setSearchParams(next, { replace: true });
    sessionStorage.setItem(filterKey, JSON.stringify({ query, characterId, costumeType, availability, page, pageSize }));
  }, [query, characterId, costumeType, availability, page, pageSize]);
  useEffect(() => { const scroll = Number(sessionStorage.getItem(scrollKey) ?? 0); if (scroll) requestAnimationFrame(() => window.scrollTo({ top: scroll })); }, []);
  useEffect(() => { setPage(1); }, [region, query, characterId, costumeType, availability]);

  const items = catalog?.items ?? catalog?.models ?? [];
  const noReferences = availability === "region-referenced" && !loading && !items.length && !error;
  return <section className="live2d-catalog-page">
    <div className="live2d-page-heading"><div><h2>Live2D 模型</h2><p>浏览模型并进入独立预览页播放动作和表情。</p></div><button type="button" onClick={() => setReload((value) => value + 1)}><RefreshCw size={16} />刷新</button></div>
    <div className="live2d-filterbar"><label><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、模型 ID 或路径" /></label><input inputMode="numeric" value={characterId} onChange={(event) => setCharacterId(event.target.value.replace(/\D/g, ""))} placeholder="角色 ID" /><input value={costumeType} onChange={(event) => setCostumeType(event.target.value)} placeholder="服装类型" /><select value={availability} onChange={(event) => setAvailability(event.target.value)}><option value="region-referenced">本区已引用</option><option value="global-only">仅共享模型</option><option value="all">全部共享模型</option><option value="unavailable">资源不可用</option></select></div>
    <div className="live2d-catalog-summary"><span>当前结果 {catalog?.total ?? items.length}</span><span>本区引用 {catalog?.availabilitySummary?.["region-referenced"] ?? 0}</span><span>共享模型 {catalog?.availabilitySummary?.["global-only"] ?? 0}</span></div>
    {loading && !catalog && <p className="empty-state">正在加载模型目录...</p>}{error && <p className="warning-text">{error}</p>}
    {noReferences && <div className="live2d-empty-action"><p>当前会话尚未解析出本区故事引用。模型不会被自动冒充为可播放。</p><button type="button" onClick={() => setAvailability("all")}>查看全部共享模型</button></div>}
    <div className="live2d-catalog-grid">{items.map((model, index) => <button type="button" className="live2d-model-card" key={`${model.id}:${model.modelPath ?? index}`} onClick={() => { sessionStorage.setItem(scrollKey, String(window.scrollY)); navigate(`/section/live2d/${encodeURIComponent(model.id)}${location.search}`); }}><span className="live2d-model-art"><UserRound size={42} /></span><span className="live2d-model-copy"><strong>{model.name || model.costumeType || model.modelPath || model.id}</strong><small>{model.characterId ? `角色 ${model.characterId} · ` : ""}{model.costumeType || model.id}</small><span className={`live2d-availability ${model.regionReferenceStatus}`}>{model.regionReferenceStatus === "region-referenced" ? "本区已引用" : "全局共享资产"}</span></span><span className="live2d-model-counts"><small>动作 {model.assetCounts?.motions || "详情加载"}</small><small>表情 {model.assetCounts?.expressions || "详情加载"}</small></span></button>)}</div>
    {!loading && !items.length && !noReferences && <p className="empty-state">没有符合条件的模型。</p>}
    {(catalog?.totalPages ?? 1) > 1 && <Pagination page={catalog?.page ?? page} totalPages={catalog?.totalPages ?? 1} pageSize={catalog?.pageSize ?? pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />}
  </section>;
}
