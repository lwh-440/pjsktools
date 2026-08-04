import { useMemo, useState } from "react";
import { Link } from "react-router";

type Readiness = { ready: boolean; status: string; missingFields: string[]; updatedAt?: string | null };
type CharacterItem = { characterId: string; name: string; unit: string; rank: number; ownedCardCount: number };
type ChallengeItem = { characterId: string; name: string; unit: string; stage: number; highScore: number; rewardProgress: number; savedDeckCount: number; candidateCount: number; candidateCards: Array<{ cardId: string; title: string; level: number }> };
type BondsItem = { honorId: string; name: string; characterIds: string[]; characterNames: string[]; rank: number; unlocked: boolean; matched: boolean };
type AreaItem = { areaItemId: string; name: string; unit: string; attribute: string; characterId?: string; currentLevel: number; maxLevel: number; currentBonus: number; nextBonus: number | null; costs: Array<{ materialId: string; name: string; required: number; owned: number }>; affordable: boolean | null; costStatus: string; levels: Array<{ level: number; bonus: number }> };

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

const unitLabels: Record<string, string> = { light_sound: "Leo/need", idol: "MORE MORE JUMP!", street: "Vivid BAD SQUAD", theme_park: "Wonderlands x Showtime", school_refusal: "25時、ナイトコードで。", piapro: "Virtual Singer", unknown: "未知 Unit", any: "全部" };

function formatNumber(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("zh-CN").format(value) : "-";
}

function ReadinessBadge({ value }: { value?: Readiness }) {
  if (!value) return null;
  return <span className={`analysis-status ${value.ready ? "ready" : "missing"}`}>{value.ready ? "可用" : value.status}</span>;
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
  const [unit, setUnit] = useState("all");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [bondSearch, setBondSearch] = useState("");
  const [areaUnit, setAreaUnit] = useState("all");
  const [areaAttribute, setAreaAttribute] = useState("all");
  const [affordableOnly, setAffordableOnly] = useState(false);
  const characters = useMemo(() => analysis.characterRankAnalysis.items.filter((item) => unit === "all" || item.unit === unit), [analysis, unit]);
  const challenges = useMemo(() => analysis.challengeAnalysis.items.filter((item) => !selectedCharacterId || item.characterId === selectedCharacterId), [analysis, selectedCharacterId]);
  const bonds = useMemo(() => analysis.bondsAnalysis.items.filter((item) => `${item.name} ${item.characterNames.join(" ")}`.toLowerCase().includes(bondSearch.toLowerCase())), [analysis, bondSearch]);
  const areaItems = useMemo(() => analysis.areaItemUpgradeAnalysis.items.filter((item) => (areaUnit === "all" || item.unit === areaUnit) && (areaAttribute === "all" || item.attribute === areaAttribute) && (!affordableOnly || item.affordable === true)), [analysis, areaUnit, areaAttribute, affordableOnly]);
  const power = analysis.powerBonusAnalysis;
  return <section className="profile-analysis-stack">
    <article className="profile-analysis-hero">
      <div><span>{analysis.binding.region.toUpperCase()} · {analysis.binding.playerUid}</span><h2>{analysis.profileSummary.nickname}</h2><p>{analysis.profileSummary.comment || "暂无公开签名"}</p></div>
      <div className="profile-kpis"><div><span>Rank</span><strong>{analysis.profileSummary.rank || "-"}</strong></div><div><span>库存</span><strong>{analysis.profileSummary.inventoryCount}</strong></div><div><span>资产类型</span><strong>{analysis.profileSummary.assetKindCount}</strong></div></div>
    </article>

    <div className="profile-analysis-grid">
      <article className="panel profile-chart-panel"><div className="panel-heading"><div><h2>角色 Rank</h2><p>最高 {analysis.characterRankAnalysis.highestRank} · 平均 {analysis.characterRankAnalysis.averageRank}</p></div><ReadinessBadge value={analysis.moduleReadiness.characterRanks} /></div>
        <div className="profile-filter-row"><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="all">全部 Unit</option>{analysis.characterRankAnalysis.units.map((value) => <option key={value} value={value}>{unitLabels[value] ?? value}</option>)}</select></div>
        <Radar items={characters} />
        <div className="character-rank-list">{characters.map((item) => <button key={item.characterId} type="button" className={selectedCharacterId === item.characterId ? "active" : "secondary"} onClick={() => setSelectedCharacterId((value) => value === item.characterId ? "" : item.characterId)}><span>{item.name}</span><strong>Rank {item.rank}</strong><small>持有 {item.ownedCardCount} 张</small></button>)}</div>
      </article>

      <article className="panel profile-chart-panel"><div className="panel-heading"><div><h2>Challenge Live</h2><p>角色筛选会联动显示可用于高分组卡的库存。</p></div><ReadinessBadge value={analysis.moduleReadiness.challenge} /></div>
        {challenges.length ? <div className="challenge-chart">{challenges.map((item) => <div key={item.characterId} className="challenge-row"><button type="button" className="challenge-label" onClick={() => setSelectedCharacterId(item.characterId)}>{item.name}</button><div className="challenge-bar"><span style={{ width: `${Math.min(100, Math.max(4, item.stage))}%` }} /></div><strong>Stage {item.stage}</strong><small>{formatNumber(item.highScore)} 分 · 候选 {item.candidateCount}</small>{item.candidateCards.length > 0 && <div className="challenge-candidates">{item.candidateCards.slice(0, 5).map((card) => <span key={card.cardId}>{card.title} · Lv.{card.level}</span>)}</div>}</div>)}</div> : <p className="empty-state">缺少 Challenge stages/results，库存仍可用于普通组卡。</p>}
      </article>
    </div>

    <div className="profile-analysis-grid">
      <article className="panel"><div className="panel-heading"><div><h2>Bonds Rank</h2><p>按角色组合与称号识别已拥有的羁绊等级。</p></div><ReadinessBadge value={analysis.moduleReadiness.bonds} /></div><input value={bondSearch} onChange={(event) => setBondSearch(event.target.value)} placeholder="搜索角色组合或称号" />
        {bonds.length ? <div className="bonds-table"><div className="bonds-head"><span>组合</span><span>称号</span><span>Rank</span></div>{bonds.map((item) => <div key={`${item.honorId}:${item.characterIds.join("-")}`}><span>{item.characterNames.join(" × ") || "未识别角色"}</span><span>{item.name}{!item.matched && "（未知 ID）"}</span><strong>{item.rank}</strong></div>)}</div> : <p className="empty-state">未导入可识别的 userBonds；该模块不会用普通称号推测羁绊关系。</p>}
      </article>

      <article className="panel"><div className="panel-heading"><div><h2>综合力加成</h2><p>{power.formulaVersion} · {power.exactCardCount}/{power.inventoryCardCount} 张完成精确计算</p></div><ReadinessBadge value={analysis.moduleReadiness.powerBonus} /></div>
        <div className="power-bonus-grid">{[["基础综合力", power.totals.base], ["区域道具", power.totals.areaItemBonus], ["角色 Rank", power.totals.characterBonus], ["Fixture", power.totals.fixtureBonus], ["Gate", power.totals.gateBonus], ["称号", power.totals.honorPower]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{formatNumber(Number(value))}</strong></div>)}</div>
        {power.missingFields.length > 0 && <details><summary>缺失字段 {power.missingFields.length}</summary><div className="tag-row">{power.missingFields.slice(0, 20).map((item) => <span key={item}>{item}</span>)}</div></details>}
      </article>
    </div>

    <article className="panel wide"><div className="panel-heading"><div><h2>区域道具升级工作台</h2><p>等级和加成来自当前区服 master；成本缺失时明确标记，不虚构素材或金币。</p></div><ReadinessBadge value={analysis.moduleReadiness.areaItems} /></div>
      <div className="area-upgrade-filters"><select value={areaUnit} onChange={(event) => setAreaUnit(event.target.value)}><option value="all">全部 Unit</option>{[...new Set(analysis.areaItemUpgradeAnalysis.items.map((item) => item.unit))].map((value) => <option key={value} value={value}>{unitLabels[value] ?? value}</option>)}</select><select value={areaAttribute} onChange={(event) => setAreaAttribute(event.target.value)}><option value="all">全部属性</option>{[...new Set(analysis.areaItemUpgradeAnalysis.items.map((item) => item.attribute))].map((value) => <option key={value} value={value}>{value}</option>)}</select><label className="check-line"><input type="checkbox" checked={affordableOnly} onChange={(event) => setAffordableOnly(event.target.checked)} />仅当前可负担</label></div>
      <div className="area-upgrade-table"><div className="area-upgrade-head"><span>道具</span><span>等级</span><span>加成</span><span>下一级</span><span>成本状态</span><span>操作</span></div>{areaItems.map((item) => <div key={item.areaItemId}><span><strong>{item.name}</strong><small>{unitLabels[item.unit] ?? item.unit} · {item.attribute}</small></span><span>Lv.{item.currentLevel}/{item.maxLevel}</span><span>{item.currentBonus}%</span><span>{item.nextBonus == null ? "已满级" : `${item.nextBonus}%`}</span><span>{item.costStatus === "matched" ? item.costs.map((cost) => `${cost.name} ${cost.owned}/${cost.required}`).join(" · ") : item.costStatus === "max-level" ? "无需升级" : "缺少成本 master"}</span><span><Link className="button-link" to={`/me/deck?areaItemId=${encodeURIComponent(item.areaItemId)}`}>用于组卡</Link></span></div>)}</div>
      {!areaItems.length && <p className="empty-state">当前筛选没有区域道具。</p>}
    </article>
  </section>;
}
