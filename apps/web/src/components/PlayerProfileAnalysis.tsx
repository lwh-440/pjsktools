import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArtImage } from "./ui";
import { CatalogFilterOptionIcon } from "./CatalogFilterPanel";
import { cardAttributeLabel, playerMissingDataLabels, playerStatusLabel } from "../playerLabels";

type Readiness = { ready: boolean; status: string; missingFields: string[]; updatedAt?: string | null };
type CharacterItem = { characterId: string; name: string; iconCandidates?: string[]; unit: string; rank: number; ownedCardCount: number };
type ChallengeItem = { characterId: string; name: string; iconCandidates?: string[]; unit: string; stage: number; highScore: number; rewardProgress: number; savedDeckCount: number; candidateCount: number; candidateCards: Array<{ cardId: string; title: string; level: number; thumbnailCandidates?: string[] }> };
type BondsItem = { honorId: string; name: string; characterIds: string[]; characterNames: string[]; rank: number; unlocked: boolean; matched: boolean };
type AreaItem = { areaItemId: string; name: string; unit: string; attribute: string; imageCandidates?: string[]; characterId?: string; currentLevel: number; maxLevel: number | null; currentBonus: number | null; nextBonus: number | null; costs: Array<{ materialId: string; name: string; required: number; owned: number }>; cost?: { resources: Array<{ resourceType: string; resourceId: string; name?: string; required: number; owned: number; shortage?: number; imageCandidates?: string[] }> }; affordable: boolean | null; costStatus: string; levels: Array<{ level: number; bonus: number }> };

export type ProfileAnalysis = {
  binding: { id: string; region: string; playerUid: string; displayName?: string; isDefault?: boolean };
  profileSummary: { nickname: string; rank: number; comment?: string; inventoryCount: number; assetKindCount: number; mainDeck?: any; updatedAt?: string };
  characterRankAnalysis: { items: CharacterItem[]; highestRank: number; averageRank: number; weakCharacters: CharacterItem[]; units: string[] };
  challengeAnalysis: { items: ChallengeItem[]; rewardRowCount: number };
  bondsAnalysis: { items: BondsItem[]; ownedCount: number };
  powerBonusAnalysis: { formulaVersion: string; referenceFormulaId: string; inventoryCardCount: number; exactCardCount: number; totals: Record<string, number>; cards: Array<{ cardId: string; title: string; characterId?: string; detail: Record<string, number> }>; missingFields: string[]; status: string };
  areaItemUpgradeAnalysis: { items: AreaItem[]; materialInventory: Record<string, number>; costMasterAvailable: boolean };
  moduleReadiness: Record<string, Readiness>;
  sourceDiagnostics: Record<string, any>;
};

const unitLabels: Record<string, string> = { light_sound: "Leo/need", idol: "MORE MORE JUMP!", street: "Vivid BAD SQUAD", theme_park: "Wonderlands x Showtime", school_refusal: "25時、ナイトコードで。", piapro: "Virtual Singer", unknown: "组合待确认", any: "全部" };
const views = [{ id: "characters", label: "角色成长" }, { id: "challenge", label: "挑战 LIVE" }, { id: "bonds", label: "羁绊" }, { id: "power", label: "综合力" }, { id: "area", label: "区域道具" }];
const areaUnits = ["light_sound", "idol", "street", "theme_park", "school_refusal", "piapro"];
const areaAttributes = ["cool", "cute", "happy", "mysterious", "pure"];

function areaUnitLabel(value: string) {
  return value === "any" ? "全组合道具" : unitLabels[value] ?? "其他组合";
}

function areaAttributeLabel(value: string) {
  return value === "any" ? "全属性道具" : cardAttributeLabel(value);
}

export function filterProfileAreaItems(items: AreaItem[], unit: string, attribute: string, affordableOnly: boolean) {
  return items.filter((item) =>
    (unit === "all" || item.unit === unit) &&
    (attribute === "all" || item.attribute === attribute) &&
    (!affordableOnly || item.affordable === true));
}

function formatNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "-";
}

function ReadinessBadge({ value }: { value?: Readiness }) {
  if (!value) return null;
  return <span className={`analysis-status ${value.ready ? "ready" : "missing"}`}>{value.ready ? "可用" : playerStatusLabel(value.status) === "资料状态待确认" ? "待同步" : playerStatusLabel(value.status)}</span>;
}

function AreaUpgradeStatus({ value, maxLevel = false }: { value: boolean | null; maxLevel?: boolean }) {
  const label = maxLevel ? "已满级" : value === true ? "资源足够，可升级" : value === false ? "资源不足" : "升级成本待同步";
  const status = maxLevel ? "maxed" : value === true ? "enough" : value === false ? "short" : "unknown";
  return <span className={`area-upgrade-status ${status}`} role="img" aria-label={label} title={label}><span aria-hidden="true" /></span>;
}

function AreaSelectAll({ items, selected, onChange }: { items: AreaItem[]; selected: string[]; onChange: (ids: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const ids = items.filter((item) => item.currentLevel > 0).map((item) => item.areaItemId);
  const checkedCount = ids.filter((id) => selected.includes(id)).length;
  useEffect(() => { if (ref.current) ref.current.indeterminate = checkedCount > 0 && checkedCount < ids.length; }, [checkedCount, ids.length]);
  return <input ref={ref} type="checkbox" aria-label="全选当前筛选结果中已拥有的区域道具" disabled={!ids.length} checked={ids.length > 0 && checkedCount === ids.length} onChange={(event) => onChange(event.target.checked ? [...new Set([...selected, ...ids])] : selected.filter((id) => !ids.includes(id)))} />;
}

function Radar({ items }: { items: CharacterItem[] }) {
  const visible = items.slice(0, 12);
  const max = Math.max(1, ...visible.map((item) => item.rank));
  const center = 150;
  const radius = 110;
  const points = visible.map((item, index) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / visible.length;
    const valueRadius = radius * item.rank / max;
    return { ...item, x: center + Math.cos(angle) * valueRadius, y: center + Math.sin(angle) * valueRadius, lx: center + Math.cos(angle) * 135, ly: center + Math.sin(angle) * 135 };
  });
  if (visible.length < 3) return <p className="empty-state">至少需要 3 个角色 Rank 才能绘制雷达图。</p>;
  return <svg className="profile-radar" viewBox="0 0 300 300" role="img" aria-label="角色 Rank 雷达图">
    {[0.25, 0.5, 0.75, 1].map((scale) => <polygon key={scale} points={visible.map((_, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / visible.length; return `${center + Math.cos(angle) * radius * scale},${center + Math.sin(angle) * radius * scale}`; }).join(" ")} fill="none" stroke="#d7e4ec" />)}
    {points.map((point) => <line key={point.characterId} x1={center} y1={center} x2={point.lx} y2={point.ly} stroke="#e6edf3" />)}
    <polygon points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="rgba(47,111,136,.22)" stroke="#2f6f88" strokeWidth="2" />
    {points.map((point) => <g key={point.characterId}><circle cx={point.x} cy={point.y} r="3" fill="#2f6f88" /><text x={point.lx} y={point.ly} textAnchor="middle" dominantBaseline="middle">{point.name.slice(-4)}</text></g>)}
  </svg>;
}

export function PlayerProfileAnalysisView({ analysis }: { analysis: ProfileAnalysis }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const challengeTabRef = useRef<HTMLButtonElement>(null);
  const requestedView = searchParams.get("view");
  const activeView = views.some((view) => view.id === requestedView) ? requestedView : "characters";
  function changeView(view: string) {
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    if (view !== "area") next.delete("areaItemId");
    setSearchParams(next);
  }
  const [unit, setUnit] = useState("all");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [bondSearch, setBondSearch] = useState("");
  const [areaUnit, setAreaUnit] = useState("all");
  const [areaAttribute, setAreaAttribute] = useState("all");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [draftUnit, setDraftUnit] = useState("all");
  const [draftAttribute, setDraftAttribute] = useState("all");
  const [draftAffordable, setDraftAffordable] = useState(false);
  const [areaSelection, setAreaSelection] = useState<{ bindingId: string; ids: string[] }>({ bindingId: analysis.binding.id, ids: [] });
  const selectedAreaIds = areaSelection.bindingId === analysis.binding.id ? areaSelection.ids : [];
  function setSelectedAreaIds(ids: string[]) { setAreaSelection({ bindingId: analysis.binding.id, ids }); }
  useEffect(() => { setAreaSelection({ bindingId: analysis.binding.id, ids: [] }); }, [analysis.binding.id]);
  useEffect(() => {
    setSelectedCharacterId((current) => analysis.challengeAnalysis.items.some((item) => item.characterId === current) || analysis.characterRankAnalysis.items.some((item) => item.characterId === current) ? current : "");
    setUnit((current) => current === "all" || analysis.characterRankAnalysis.units.includes(current) ? current : "all");
  }, [analysis]);
  const characters = useMemo(() => analysis.characterRankAnalysis.items.filter((item) => unit === "all" || item.unit === unit), [analysis, unit]);
  const challenges = useMemo(() => analysis.challengeAnalysis.items.filter((item) => !selectedCharacterId || item.characterId === selectedCharacterId), [analysis, selectedCharacterId]);
  const bonds = useMemo(() => analysis.bondsAnalysis.items.filter((item) => `${item.name} ${item.characterNames.join(" ")}`.toLowerCase().includes(bondSearch.toLowerCase())), [analysis, bondSearch]);
  const areaItems = useMemo(() => filterProfileAreaItems(analysis.areaItemUpgradeAnalysis.items, areaUnit, areaAttribute, affordableOnly), [analysis, areaUnit, areaAttribute, affordableOnly]);
  const power = analysis.powerBonusAnalysis;
  const detailId = activeView === "area" ? searchParams.get("areaItemId") : null;
  const detailItem = analysis.areaItemUpgradeAnalysis.items.find((item) => item.areaItemId === detailId);
  function areaDetailUrl(id?: string) {
    const next = new URLSearchParams(searchParams);
    next.set("view", "area");
    if (id) next.set("areaItemId", id); else next.delete("areaItemId");
    return `?${next}`;
  }
  const deckSelectionParams = new URLSearchParams({ bindingId: analysis.binding.id, areaSelection: "selected" });
  selectedAreaIds.forEach((id) => deckSelectionParams.append("areaItemId", id));
  return <section className="profile-analysis-stack">
    <article className="profile-analysis-hero">
      <div><span>{analysis.binding.region.toUpperCase()} · {analysis.binding.playerUid}</span><h2>{analysis.profileSummary.nickname}</h2><p>{analysis.profileSummary.comment || "暂无公开签名"}</p></div>
      <div className="profile-kpis"><div><span>Rank</span><strong>{analysis.profileSummary.rank || "-"}</strong></div><div><span>库存</span><strong>{analysis.profileSummary.inventoryCount}</strong></div><div><span>资产类型</span><strong>{analysis.profileSummary.assetKindCount}</strong></div></div>
    </article>

    <nav className="profile-section-nav" aria-label="玩家档案分类">{views.map((view) => <button type="button" key={view.id} ref={view.id === "challenge" ? challengeTabRef : undefined} aria-current={activeView === view.id ? "page" : undefined} onClick={() => changeView(view.id)}>{view.label}</button>)}</nav>
    <div className="profile-current-panel" key={activeView}>
      {activeView === "characters" &&
      <article className="panel profile-chart-panel"><div className="panel-heading"><div><h2>角色 Rank <ReadinessBadge value={analysis.moduleReadiness.characterRanks} /></h2><p>最高 {analysis.characterRankAnalysis.highestRank} · 平均 {analysis.characterRankAnalysis.averageRank}</p></div></div>
        <div className="profile-filter-row"><select aria-label="角色组合" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="all">全部组合</option>{analysis.characterRankAnalysis.units.map((value) => <option key={value} value={value}>{unitLabels[value] ?? "其他组合"}</option>)}</select><small>选择角色，查看对应挑战与候选卡牌</small></div>
        <div className="character-growth-layout">
        <Radar items={characters} />
        <div className="character-rank-list">{characters.map((item) => <button key={item.characterId} type="button" className={selectedCharacterId === item.characterId ? "active" : "secondary"} onClick={() => { setSelectedCharacterId(item.characterId); changeView("challenge"); challengeTabRef.current?.focus(); }}><ArtImage srcCandidates={item.iconCandidates} label={item.name} variant="avatar" fallback={<span>{item.name.slice(0, 1)}</span>} /><span className="character-rank-copy"><span>{item.name}</span><strong>Rank {item.rank}</strong><small>持有 {item.ownedCardCount} 张</small></span></button>)}</div>
        </div>
        {!characters.length && <p className="empty-state">同步角色等级后，即可查看成长分布。</p>}
      </article>}

      {activeView === "challenge" && <article className="panel profile-chart-panel"><div className="panel-heading"><div><h2>挑战 LIVE <ReadinessBadge value={analysis.moduleReadiness.challenge} /></h2><p>查看各角色挑战进度与可用卡牌。</p></div></div>
        <div className="profile-filter-row"><button type="button" aria-pressed={!selectedCharacterId} onClick={() => setSelectedCharacterId("")}>全部角色</button>{selectedCharacterId && <span>当前：{analysis.characterRankAnalysis.items.find((item) => item.characterId === selectedCharacterId)?.name ?? analysis.challengeAnalysis.items.find((item) => item.characterId === selectedCharacterId)?.name ?? "已选角色"}</span>}</div>
        {challenges.length ? <div className="challenge-chart">{challenges.map((item) => <div key={item.characterId} className="challenge-row"><button type="button" className="challenge-label" aria-pressed={selectedCharacterId === item.characterId} onClick={() => setSelectedCharacterId(item.characterId)}><ArtImage srcCandidates={item.iconCandidates} label={item.name} variant="avatar" fallback={<span>{item.name.slice(0, 1)}</span>} /><span>{item.name}</span></button><div className="challenge-bar"><span style={{ width: `${Math.min(100, Math.max(4, item.stage))}%` }} /></div><strong>阶段 {item.stage}</strong><small>{formatNumber(item.highScore)} 分 · 候选 {item.candidateCount} · 已领奖励 {item.rewardProgress} · 已存卡组 {item.savedDeckCount}</small>{item.candidateCards.length > 0 && <div className="challenge-candidates">{item.candidateCards.slice(0, 5).map((card) => <div key={card.cardId}><ArtImage srcCandidates={card.thumbnailCandidates} label={card.title} fallback={<span>暂无卡图</span>} /><span>{card.title}<small>Lv.{card.level}</small></span></div>)}</div>}</div>)}</div> : <p className="empty-state">暂无该角色的挑战记录，请同步挑战 LIVE 数据或查看全部角色。</p>}
      </article>}

      {activeView === "bonds" && <article className="panel"><div className="panel-heading"><div><h2>羁绊等级 <ReadinessBadge value={analysis.moduleReadiness.bonds} /></h2><p>查看已拥有的羁绊组合与称号。</p></div></div><input aria-label="搜索羁绊" value={bondSearch} onChange={(event) => setBondSearch(event.target.value)} placeholder="搜索角色组合或称号" />
        {bonds.length ? <div className="bonds-table"><div className="bonds-head"><span>组合</span><span>称号</span><span>Rank</span></div>{bonds.map((item) => <div key={`${item.honorId}:${item.characterIds.join("-")}`}><span>{item.characterNames.join(" × ") || "角色待同步"}</span><span>{item.matched ? item.name : "称号资料待同步"}</span><strong>{item.rank}</strong></div>)}</div> : <p className="empty-state">暂无匹配的羁绊资料，可尝试其他关键词或重新同步称号。</p>}
      </article>}

      {activeView === "power" && <article className="panel"><div className="panel-heading"><div><h2>综合力加成 <ReadinessBadge value={analysis.moduleReadiness.powerBonus} /></h2><p>{power.exactCardCount}/{power.inventoryCardCount} 张完成精确计算</p></div></div>
        <div className="power-bonus-grid">{[["基础综合力", power.totals.base], ["区域道具加成", power.totals.areaItemBonus], ["角色等级加成", power.totals.characterBonus], ["MySekai 家具加成", power.totals.fixtureBonus], ["MySekai 大门加成", power.totals.gateBonus], ["称号加成", power.totals.honorPower]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{formatNumber(Number(value))}</strong></div>)}</div>
        {power.missingFields.length > 0 && <p className="profile-missing-note">待同步：{playerMissingDataLabels(power.missingFields).join("、")}</p>}
      </article>}

    {activeView === "area" && <article className="panel wide"><div className="panel-heading"><div><h2>区域道具升级 <ReadinessBadge value={analysis.moduleReadiness.areaItems} /></h2><p>比较当前等级、加成和下一级所需素材。</p></div></div>
      {detailId ? <div className="area-item-detail"><Link className="button-link" to={areaDetailUrl()}>返回区域道具列表</Link>{detailItem ? <>
        <div className="area-detail-identity"><ArtImage srcCandidates={detailItem.imageCandidates} label={detailItem.name} fallback={<span>道具图片暂不可用</span>} /><div><h3>{detailItem.name}</h3><p><CatalogFilterOptionIcon option={{value:detailItem.unit,label:areaUnitLabel(detailItem.unit),count:0,iconKey:`unit:${detailItem.unit}`}} />{areaUnitLabel(detailItem.unit)} · <CatalogFilterOptionIcon option={{value:detailItem.attribute,label:areaAttributeLabel(detailItem.attribute),count:0,iconKey:`attribute:${detailItem.attribute}`}} />{areaAttributeLabel(detailItem.attribute)}</p></div></div>
        <dl className="area-detail-facts"><div><dt>当前等级</dt><dd>{detailItem.currentLevel} / {detailItem.maxLevel ?? "待同步"}</dd></div><div><dt>下一级</dt><dd>{detailItem.costStatus === "max-level" ? "已满级" : detailItem.nextBonus == null ? "待同步" : detailItem.currentLevel + 1}</dd></div><div><dt>当前加成</dt><dd>{detailItem.currentBonus == null ? "待同步" : `${detailItem.currentBonus}%`}</dd></div><div><dt>下一级加成</dt><dd>{detailItem.costStatus === "max-level" ? "—" : detailItem.nextBonus == null ? "待同步" : `${detailItem.nextBonus}%`}</dd></div></dl>
        <p className="area-detail-status"><AreaUpgradeStatus value={detailItem.affordable} maxLevel={detailItem.costStatus === "max-level"} />{detailItem.costStatus === "max-level" ? "已满级" : detailItem.affordable === true ? "当前资源足够升级" : detailItem.affordable === false ? "当前资源不足" : "升级成本待同步"}</p>
        <h3>升级费用</h3>{detailItem.costStatus === "max-level" ? <p className="empty-state">已满级，无下一级升级费用。仍可按当前等级用于组卡。</p> : detailItem.cost?.resources.length ? <div className="area-resource-list">{detailItem.cost.resources.map((cost) => <div key={`${cost.resourceType}:${cost.resourceId}`}><ArtImage srcCandidates={cost.imageCandidates} label={cost.name ?? "升级资源"} fallback={<span>暂无图片</span>} /><span><strong>{cost.name ?? (cost.resourceType === "coin" ? "金币" : "素材资料待同步")}</strong><small>持有 {formatNumber(cost.owned)} / 所需 {formatNumber(cost.required)}</small>{cost.required > cost.owned && <small>还缺 {formatNumber(cost.required - cost.owned)}</small>}</span></div>)}</div> : <p className="empty-state">升级费用尚未同步，暂不能判断素材与金币是否足够。</p>}
      </> : <p className="empty-state">当前绑定暂无这件道具的升级资料，请返回列表选择。</p>}</div> : <>
      <details className="profile-area-filter-disclosure">
        <summary><strong>筛选</strong></summary>
      <div className="area-upgrade-filters profile-area-filters">
        <fieldset className="catalog-filter-group"><legend>组合</legend><div className="catalog-filter-options">
          {["all", ...areaUnits].map((value) => <button type="button" key={value} className={draftUnit === value ? "active" : ""} aria-pressed={draftUnit === value} onClick={() => setDraftUnit(value)}><CatalogFilterOptionIcon option={{ value, label: areaUnitLabel(value), count: 0, iconKey: areaUnits.includes(value) ? `unit:${value}` : undefined }} /><span>{value === "all" ? "全部组合" : areaUnitLabel(value)}</span></button>)}
        </div></fieldset>
        <fieldset className="catalog-filter-group"><legend>属性</legend><div className="catalog-filter-options">
          {["all", ...areaAttributes].map((value) => <button type="button" key={value} className={draftAttribute === value ? "active" : ""} aria-pressed={draftAttribute === value} onClick={() => setDraftAttribute(value)}><CatalogFilterOptionIcon option={{ value, label: areaAttributeLabel(value), count: 0, iconKey: `attribute:${value}` }} /><span>{value === "all" ? "全部属性" : areaAttributeLabel(value)}</span></button>)}
        </div></fieldset>
        <label className="check-line"><input type="checkbox" checked={draftAffordable} onChange={(event) => setDraftAffordable(event.target.checked)} />只看当前资源足够升级的区域道具</label>
        <button type="button" className="area-filter-apply" onClick={() => { setAreaUnit(draftUnit); setAreaAttribute(draftAttribute); setAffordableOnly(draftAffordable); }}>应用筛选</button>
      </div>
      </details>
      <div className="area-selection-actions"><span>已选 {selectedAreaIds.length} 项 · 按当前等级用于本次计算<br />表头复选框全选当前结果中的已拥有道具</span><Link className="button-link" to={`/me/deck?${deckSelectionParams}`}>用所选道具组卡</Link></div>
      <div className="area-upgrade-table compact-area-table"><div className="area-upgrade-head"><span>道具</span><span>等级</span><span>可升级</span><span className="area-deck-column"><span>用于组卡</span><AreaSelectAll items={areaItems} selected={selectedAreaIds} onChange={setSelectedAreaIds} /></span><span>详细信息</span></div>{areaItems.map((item) => <div key={item.areaItemId}><span title={item.name}>{item.name}</span><span>{item.currentLevel} / {item.maxLevel ?? "—"}</span><span><AreaUpgradeStatus value={item.affordable} maxLevel={item.costStatus === "max-level"} /></span><span className="area-deck-column"><input type="checkbox" aria-label={`${item.name}用于组卡`} disabled={item.currentLevel <= 0} title={item.currentLevel <= 0 ? "尚未拥有，不能按当前等级用于组卡" : undefined} checked={selectedAreaIds.includes(item.areaItemId)} onChange={(event) => setSelectedAreaIds(event.target.checked ? [...selectedAreaIds, item.areaItemId] : selectedAreaIds.filter((id) => id !== item.areaItemId))} /></span><span><Link to={areaDetailUrl(item.areaItemId)} aria-label={`${item.name}详细信息`}>详情</Link></span></div>)}</div>
      {!areaItems.length && <p className="empty-state">当前筛选没有区域道具。</p>}
      </>}
    </article>}
    </div>
  </section>;
}
