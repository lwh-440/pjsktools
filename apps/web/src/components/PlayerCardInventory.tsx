import { Check, ImagePlus, Search, SlidersHorizontal, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { recognizeCardScreenshot, type CardImportCatalogItem, type CardImportManifest, type ScreenshotCardResult } from "../playerCardImport";

type InventoryRow = Record<string, unknown>;

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isTrained(row?: InventoryRow) {
  return row?.specialTrainingStatus === "done" || row?.defaultImage === "after_training";
}

function CardThumbnail({ card, row }: { card: CardImportCatalogItem; row?: InventoryRow }) {
  const trained = isTrained(row);
  const src = trained ? card.thumbnails.afterTraining || card.thumbnails.normal : card.thumbnails.normal || card.thumbnails.afterTraining;
  return <div className={`player-card-thumb ${trained ? "trained" : ""}`}>
    {src ? <img src={src} alt={card.title} loading="lazy" /> : <div className="player-card-image-missing"><ImagePlus size={24} /><span>无卡图</span></div>}
    <span className={`card-attr attr-${card.attribute ?? "unknown"}`}>{card.attribute ?? "?"}</span>
    <span className="card-rarity">{"★".repeat(Math.max(1, Math.min(4, card.rarity ?? 1)))}</span>
    {row && <div className="card-level-line"><b>Lv.{numberValue(row.level, 1)}</b><span>MR {numberValue(row.masterRank)}</span></div>}
  </div>;
}

export function PlayerCardInventory({
  manifest,
  rows,
  onChange,
  onDelete,
  onReviewScreenshot
}: {
  manifest: CardImportManifest | null;
  rows: InventoryRow[];
  onChange: (rows: InventoryRow[]) => void;
  onDelete: (cardIds: string[]) => Promise<void>;
  onReviewScreenshot: (cards: InventoryRow[]) => Promise<void>;
}) {
  const [search, setSearch] = useState(() => localStorage.getItem("pjsktools-card-search") ?? "");
  const [character, setCharacter] = useState("all");
  const [attribute, setAttribute] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [unit, setUnit] = useState("all");
  const [ownership, setOwnership] = useState<"owned" | "all" | "unowned">("owned");
  const [sort, setSort] = useState("level-desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [batchLevel, setBatchLevel] = useState(60);
  const [batchMasterRank, setBatchMasterRank] = useState(0);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [columns, setColumns] = useState(5);
  const [topCropPercent, setTopCropPercent] = useState(12);
  const [gapPercent, setGapPercent] = useState(1.2);
  const [ocr, setOcr] = useState(false);
  const [recognition, setRecognition] = useState<ScreenshotCardResult[]>([]);
  const [recognitionProgress, setRecognitionProgress] = useState("");

  useEffect(() => { localStorage.setItem("pjsktools-card-search", search); }, [search]);
  const owned = useMemo(() => new Map(rows.map((row) => [String(row.cardId ?? row.id ?? ""), row])), [rows]);
  const catalog = manifest?.catalog ?? [];
  const options = useMemo(() => ({
    characters: [...new Set(catalog.map((card) => card.character).filter(Boolean))].sort(),
    attributes: [...new Set(catalog.map((card) => card.attribute).filter(Boolean))].sort(),
    rarities: [...new Set(catalog.map((card) => card.rarity).filter((value) => value != null))].sort(),
    units: [...new Set(catalog.map((card) => card.unit).filter(Boolean))].sort()
  }), [catalog]);
  const visible = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const values = catalog.filter((card) => {
      const row = owned.get(card.cardId);
      if (ownership === "owned" && !row) return false;
      if (ownership === "unowned" && row) return false;
      if (character !== "all" && card.character !== character) return false;
      if (attribute !== "all" && card.attribute !== attribute) return false;
      if (rarity !== "all" && String(card.rarity) !== rarity) return false;
      if (unit !== "all" && card.unit !== unit) return false;
      return !normalizedSearch || [card.cardId, card.title, card.character, card.unit, card.assetbundleName].some((value) => String(value ?? "").toLowerCase().includes(normalizedSearch));
    });
    return values.sort((left, right) => {
      const leftRow = owned.get(left.cardId);
      const rightRow = owned.get(right.cardId);
      if (sort === "id-asc") return numberValue(left.cardId) - numberValue(right.cardId);
      if (sort === "power-desc") return numberValue(right.maxPower) - numberValue(left.maxPower);
      if (sort === "mr-desc") return numberValue(rightRow?.masterRank) - numberValue(leftRow?.masterRank);
      if (sort === "event-desc") return numberValue(rightRow?.eventBonus) - numberValue(leftRow?.eventBonus);
      return numberValue(rightRow?.level) - numberValue(leftRow?.level);
    });
  }, [catalog, owned, ownership, character, attribute, rarity, unit, search, sort]);

  function updateCard(cardId: string, patch: InventoryRow) {
    const current = owned.get(cardId);
    if (current) onChange(rows.map((row) => String(row.cardId ?? row.id) === cardId ? { ...row, ...patch, cardId } : row));
    else onChange([...rows, { cardId, level: 1, masterRank: 0, skillLevel: 1, specialTrainingStatus: "not_doing", defaultImage: "original", episodes: [], ...patch }]);
  }

  function applyBatch() {
    onChange(rows.map((row) => selected.has(String(row.cardId ?? row.id)) ? { ...row, level: batchLevel, masterRank: batchMasterRank } : row));
  }

  async function removeSelected() {
    const cardIds = [...selected].filter((cardId) => owned.has(cardId));
    if (!cardIds.length || !window.confirm(`确认从库存删除 ${cardIds.length} 张卡牌？此操作只在确认后执行。`)) return;
    await onDelete(cardIds);
    setSelected(new Set());
  }

  async function recognize() {
    if (!manifest || !screenshotFile) return;
    setRecognition([]);
    setRecognitionProgress("准备本地识别...");
    const results = await recognizeCardScreenshot(screenshotFile, manifest, { columns, topCropPercent, gapPercent, ocr }, (completed, total, stage) => setRecognitionProgress(`${stage} ${completed}/${total}`));
    setRecognition(results);
    setRecognitionProgress(`识别完成：${results.length} 个卡位，图片未上传。`);
  }

  async function reviewScreenshot() {
    const cards = recognition.filter((item) => item.selectedCardId).map((item) => ({
      cardId: item.selectedCardId,
      level: item.level,
      masterRank: item.masterRank,
      skillLevel: item.skillLevel,
      specialTrainingStatus: item.trained ? "done" : "not_doing",
      defaultImage: item.trained ? "after_training" : "original",
      episodes: []
    }));
    await onReviewScreenshot(cards);
  }

  const editingCard = catalog.find((card) => card.cardId === editing);
  const editingRow = editing ? owned.get(editing) : undefined;

  return <div className="visual-inventory-stack">
    <div className="inventory-filter-bar">
      <label className="inventory-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 ID、卡名或角色" /></label>
      <select value={ownership} onChange={(event) => setOwnership(event.target.value as typeof ownership)}><option value="owned">仅持有</option><option value="all">全部卡牌</option><option value="unowned">未持有</option></select>
      <select value={character} onChange={(event) => setCharacter(event.target.value)}><option value="all">全部角色</option>{options.characters.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select value={attribute} onChange={(event) => setAttribute(event.target.value)}><option value="all">全部属性</option>{options.attributes.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select value={rarity} onChange={(event) => setRarity(event.target.value)}><option value="all">全部稀有度</option>{options.rarities.map((value) => <option key={value} value={value}>{value}★</option>)}</select>
      <select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="all">全部 Unit</option>{options.units.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="level-desc">等级</option><option value="power-desc">综合力</option><option value="mr-desc">Master Rank</option><option value="event-desc">活动加成</option><option value="id-asc">卡牌 ID</option></select>
    </div>
    <div className="inventory-summary-line"><span>显示 {visible.length} / master {catalog.length}</span><span>持有 {owned.size}</span><span>已选 {selected.size}</span><span>指纹：{manifest?.fingerprintStatus ?? "loading"}</span></div>
    {selected.size > 0 && <div className="inventory-batch-bar"><SlidersHorizontal size={16} /><label>等级<input type="number" min="1" max="80" value={batchLevel} onChange={(event) => setBatchLevel(Number(event.target.value))} /></label><label>MR<input type="number" min="0" max="5" value={batchMasterRank} onChange={(event) => setBatchMasterRank(Number(event.target.value))} /></label><button type="button" onClick={applyBatch}><Check size={16} />批量应用</button><button type="button" className="secondary" onClick={removeSelected}><Trash2 size={16} />删除持有记录</button></div>}
    <div className="player-card-grid">{visible.slice(0, 500).map((card) => {
      const row = owned.get(card.cardId);
      const checked = selected.has(card.cardId);
      return <article key={card.cardId} className={`player-card-tile ${row ? "owned" : "unowned"} ${checked ? "selected" : ""}`}>
        <label className="card-select"><input type="checkbox" checked={checked} onChange={(event) => setSelected((current) => { const next = new Set(current); event.target.checked ? next.add(card.cardId) : next.delete(card.cardId); return next; })} /><span className="sr-only">选择 {card.title}</span></label>
        <button type="button" className="card-thumb-button" onClick={() => setEditing(card.cardId)}><CardThumbnail card={card} row={row} /><strong>{card.title}</strong><small>{card.character} · ID {card.cardId}</small><span>{row ? `技能 ${numberValue(row.skillLevel, 1)} · 剧情 ${Array.isArray(row.episodes) ? row.episodes.length : row.episodesRead ? 2 : 0}/2` : "未持有，点击添加"}</span></button>
      </article>;
    })}</div>
    {visible.length > 500 && <p className="empty-state">当前筛选结果较多，仅渲染前 500 张；继续缩小筛选可查看其余卡牌。</p>}

    <article className="screenshot-import-panel">
      <div><h3>截图导入</h3><p>图片只在浏览器本地分割、指纹匹配和 OCR，不会上传服务器。</p></div>
      <div className="screenshot-import-controls"><label className="file-picker"><Upload size={16} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setScreenshotFile(event.target.files?.[0] ?? null)} />选择卡牌列表截图</label><label>每行卡牌数<input type="number" min="3" max="8" value={columns} onChange={(event) => setColumns(Number(event.target.value))} /></label><label>顶部裁切 %<input type="number" min="0" max="50" value={topCropPercent} onChange={(event) => setTopCropPercent(Number(event.target.value))} /></label><label>卡位间距 %<input type="number" min="0" max="5" step="0.1" value={gapPercent} onChange={(event) => setGapPercent(Number(event.target.value))} /></label><label className="check-row"><input type="checkbox" checked={ocr} onChange={(event) => setOcr(event.target.checked)} />识别等级/MR（首次需加载 OCR 模型）</label><button type="button" onClick={recognize} disabled={!screenshotFile || !manifest}>开始本地识别</button></div>
      {recognitionProgress && <p className="empty-state">{recognitionProgress}</p>}
      <div className="screenshot-review-grid">{recognition.map((item) => <article key={item.id} className={`screenshot-result ${item.status}`}><img src={item.crop} alt={`识别卡位 ${item.id}`} /><strong>{item.status}</strong><select value={item.selectedCardId ?? ""} onChange={(event) => setRecognition((current) => current.map((row) => row.id === item.id ? { ...row, selectedCardId: event.target.value || undefined, status: event.target.value ? "matched" : "unknown", trained: row.candidates.find((candidate) => candidate.cardId === event.target.value)?.trained ?? row.trained } : row))}><option value="">需要人工选择</option>{item.candidates.map((candidate) => { const card = catalog.find((entry) => entry.cardId === candidate.cardId); return <option key={`${candidate.cardId}:${candidate.trained}`} value={candidate.cardId}>{card?.title ?? candidate.cardId} · d={candidate.distance}{candidate.trained ? " · 特训后" : ""}</option>; })}</select><div className="two-col"><label>Lv.<input type="number" min="1" max="80" value={item.level} onChange={(event) => setRecognition((current) => current.map((row) => row.id === item.id ? { ...row, level: Number(event.target.value) } : row))} /></label><label>MR<input type="number" min="0" max="5" value={item.masterRank} onChange={(event) => setRecognition((current) => current.map((row) => row.id === item.id ? { ...row, masterRank: Number(event.target.value) } : row))} /></label></div>{item.ocrText && <small>OCR: {item.ocrText}</small>}</article>)}</div>
      {recognition.length > 0 && <button type="button" onClick={reviewScreenshot} disabled={!recognition.some((item) => item.selectedCardId)}>生成导入差异预览</button>}
    </article>

    {editingCard && <div className="inventory-modal-backdrop" role="presentation" onMouseDown={() => setEditing(null)}><section className="inventory-modal" role="dialog" aria-modal="true" aria-label="编辑持有卡" onMouseDown={(event) => event.stopPropagation()}><div className="inventory-edit-head"><CardThumbnail card={editingCard} row={editingRow} /><div><h3>{editingCard.title}</h3><p>{editingCard.character} · {editingCard.attribute} · ID {editingCard.cardId}</p></div></div><div className="inventory-edit-fields"><label>等级<input type="number" min="1" max="80" value={numberValue(editingRow?.level, 1)} onChange={(event) => updateCard(editingCard.cardId, { level: Number(event.target.value) })} /></label><label>Master Rank<input type="number" min="0" max="5" value={numberValue(editingRow?.masterRank)} onChange={(event) => updateCard(editingCard.cardId, { masterRank: Number(event.target.value) })} /></label><label>技能等级<input type="number" min="1" max="4" value={numberValue(editingRow?.skillLevel, 1)} onChange={(event) => updateCard(editingCard.cardId, { skillLevel: Number(event.target.value) })} /></label><label>训练状态<select value={isTrained(editingRow) ? "done" : "not_doing"} onChange={(event) => updateCard(editingCard.cardId, { specialTrainingStatus: event.target.value, defaultImage: event.target.value === "done" ? "after_training" : "original" })}><option value="not_doing">特训前</option><option value="done">特训后</option></select></label><label className="check-row"><input type="checkbox" checked={Boolean(editingRow?.episodesRead)} onChange={(event) => updateCard(editingCard.cardId, { episodesRead: event.target.checked })} />两篇剧情已阅读（兼容估算）</label></div><div className="button-row"><button type="button" onClick={() => { if (!editingRow) updateCard(editingCard.cardId, {}); setEditing(null); }}>{editingRow ? "完成" : "加入库存"}</button><button type="button" className="secondary" onClick={() => setEditing(null)}>关闭</button>{editingRow && <button type="button" className="secondary" onClick={async () => { if (window.confirm("确认删除这张持有卡记录？")) { await onDelete([editingCard.cardId]); setEditing(null); } }}><Trash2 size={16} />删除</button>}</div></section></div>}
  </div>;
}
