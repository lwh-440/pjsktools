import {
  Bookmark,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  LogIn,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  UserRound,
  Wand2
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../api";
import { useAuth } from "../AuthContext";
import { PlayerCardInventory } from "../components/PlayerCardInventory";
import { PlayerProfileAnalysisView, type ProfileAnalysis } from "../components/PlayerProfileAnalysis";
import { formatJson } from "../accountUtils";
import { playerDataKindOptions, type BindingSummary, type InventoryItem, type PlayerBinding, type ToolContext } from "../accountTypes";
import type { CardImportManifest } from "../playerCardImport";
import type { Favorite, ScoreRecord } from "../sharedTypes";

type AssetMode = "visual" | "table" | "bulk" | "json";
type FieldType = "text" | "number" | "boolean" | "select";
type AssetField = { key: string; label: string; type?: FieldType; placeholder?: string; options?: string[]; help?: string };
type LookupResult = { field: string; id?: string; matched: boolean; label?: string; meta?: Record<string, unknown>; warning?: string };
type ValidationResult = {
  valid?: boolean;
  errors?: string[];
  warnings?: string[];
  summary?: Record<string, unknown>;
  lookupResults?: LookupResult[];
  fieldHelp?: Array<{ field: string; label: string; help: string; reference?: string }>;
  toolImpact?: string[];
  normalizedPreview?: unknown;
  [key: string]: unknown;
};
type ImportReview = ValidationResult & {
  importReview?: {
    cards?: { count: number; lookupResults?: LookupResult[]; unknownLookupCount?: number };
    playerDataGroups?: Array<{ kind: string; itemCount: number; validation: ValidationResult; overwriteRisk?: string }>;
    cardDiff?: { added?: unknown[]; updated?: unknown[]; unchanged?: unknown[]; overwriteRisks?: unknown[]; unresolved?: unknown[] };
  };
  postSaveImpact?: string[];
};
type AssetDefinition = {
  kind: string;
  label: string;
  description: string;
  impact: string;
  reference: string;
  fields: AssetField[];
  sample: unknown[];
};

const inventoryFields: AssetField[] = [
  { key: "cardId", label: "卡牌 ID", placeholder: "例: 1001", help: "可在卡牌图鉴详情中查看对应 ID。" },
  { key: "level", label: "等级", type: "number", placeholder: "60", help: "影响卡牌综合力。" },
  { key: "masterRank", label: "Master Rank", type: "number", placeholder: "0-5", help: "影响综合力、活动加成和部分支援加成。" },
  { key: "skillLevel", label: "技能等级", type: "number", placeholder: "1-4", help: "影响技能收益和高分组卡。" },
  { key: "specialTrainingStatus", label: "特训状态", type: "select", options: ["", "done", "not_done", "normal", "after_training"], help: "建议使用 done/not_done。" },
  { key: "defaultImage", label: "默认立绘", type: "select", options: ["", "normal", "after_training"], help: "用于区分花前/花后状态。" },
  { key: "episodesRead", label: "剧情已读", type: "boolean", help: "前后篇剧情阅读会影响综合力。" }
];

const assetDefinitions: AssetDefinition[] = [
  {
    kind: "area-items",
    label: "区域道具",
    description: "记录区域道具等级，用于卡牌综合力、活动收益和升级建议。",
    impact: "影响 deck-recommend、event-point-calc、score-control、area-item-recommend。",
    reference: "Moesekai user-area",
    fields: [{ key: "areaItemId", label: "道具 ID" }, { key: "level", label: "等级", type: "number" }],
    sample: [{ areaItemId: "1", level: 10 }]
  },
  {
    kind: "character-ranks",
    label: "角色 Rank",
    description: "记录角色 Rank，用于普通活动和 MySekai 综合力估算。",
    impact: "影响 deck-recommend、event-point-calc、normal-event-plan、MySekai calc。",
    reference: "Moesekai user-character",
    fields: [{ key: "characterId", label: "角色 ID" }, { key: "rank", label: "Rank", type: "number" }],
    sample: [{ characterId: "1", rank: 30 }]
  },
  {
    kind: "music-results",
    label: "歌曲成绩",
    description: "记录歌曲难度、通关状态和分数，用于歌曲推荐与控分上下文。",
    impact: "影响 music-recommend、score-control、normal-event-plan。",
    reference: "Moesekai music-recommend user data",
    fields: [
      { key: "musicId", label: "歌曲 ID" },
      { key: "difficulty", label: "难度", type: "select", options: ["easy", "normal", "hard", "expert", "master", "append"] },
      { key: "clearStatus", label: "状态", type: "select", options: ["clear", "fc", "ap", "not_clear"] },
      { key: "score", label: "分数", type: "number" }
    ],
    sample: [{ musicId: "1", difficulty: "expert", clearStatus: "fc", score: 987654 }]
  },
  {
    kind: "materials",
    label: "素材",
    description: "记录素材持有量。只作为升级建议上下文，不把消耗写成精确结论。",
    impact: "影响 area-item-recommend 的素材提示。",
    reference: "Moesekai area-item-recommend",
    fields: [{ key: "materialId", label: "素材 ID" }, { key: "quantity", label: "数量", type: "number" }],
    sample: [{ materialId: "coin", quantity: 1000 }]
  },
  {
    kind: "honors",
    label: "称号",
    description: "记录已持有称号，用于资料展示和后续 honor bonus 识别。",
    impact: "影响个人资料完整度和 World Bloom/WL honor trace。",
    reference: "Moesekai user-honor",
    fields: [{ key: "honorId", label: "称号 ID" }, { key: "level", label: "等级", type: "number" }],
    sample: [{ honorId: "1", level: 1 }]
  },
  {
    kind: "profile-honors",
    label: "资料页称号",
    description: "记录展示在资料页的称号槽位。",
    impact: "影响个人资料摘要展示。",
    reference: "Moesekai user-profile-honor",
    fields: [{ key: "slot", label: "槽位", type: "number" }, { key: "honorId", label: "称号 ID" }],
    sample: [{ slot: 1, honorId: "1" }]
  },
  {
    kind: "challenge-live",
    label: "Challenge Live",
    description: "记录 Challenge Live 目标角色和保存卡组。",
    impact: "影响 Challenge Live 角色过滤和 challengeDecks trace。",
    reference: "Moesekai user-challenge-live-solo-deck",
    fields: [{ key: "characterId", label: "角色 ID" }, { key: "cardIds", label: "卡牌 ID 列表" }],
    sample: [{ characterId: "1", cardIds: ["1", "2", "3", "4", "5"] }]
  },
  {
    kind: "world-bloom-support",
    label: "World Bloom 支援",
    description: "记录 World Bloom/WL 支援卡组和匹配上下文。",
    impact: "影响 World Bloom/WL support deck、different attribute、leader honor trace。",
    reference: "Moesekai user-world-bloom-support-deck",
    fields: [
      { key: "eventId", label: "活动 ID" },
      { key: "gameCharacterId", label: "角色 ID" },
      { key: "supportUnit", label: "支援 Unit" },
      { key: "cardIds", label: "支援卡 ID 列表" }
    ],
    sample: [{ eventId: "1", gameCharacterId: "1", supportUnit: "light_sound", cardIds: ["1", "2", "3"] }]
  },
  {
    kind: "mysekai-canvas",
    label: "MySekai Canvas",
    description: "记录 canvas 命中的卡牌和可选加成率。",
    impact: "影响 MySekai canvas 分项和 v4.4 reference GA 搜索。",
    reference: "Moesekai user-mysekai-canvas",
    fields: [{ key: "cardId", label: "卡牌 ID" }, { key: "powerBonusRate", label: "加成率", type: "number" }],
    sample: [{ cardId: "1", powerBonusRate: 10 }]
  },
  {
    kind: "mysekai-gates",
    label: "MySekai Gates",
    description: "记录大门等级与 unit 匹配。",
    impact: "影响 MySekai gate 分项和 v4.4 reference GA 搜索。",
    reference: "Moesekai user-mysekai-gate",
    fields: [{ key: "gateId", label: "Gate ID" }, { key: "unit", label: "Unit" }, { key: "level", label: "等级", type: "number" }],
    sample: [{ gateId: "1", unit: "light_sound", level: 1 }]
  },
  {
    kind: "mysekai-fixtures",
    label: "MySekai Fixtures",
    description: "记录家具对角色的 performance bonus。",
    impact: "影响 MySekai fixture 分项、limit 截断和 v4.4 reference GA 搜索。",
    reference: "Moesekai user-mysekai-fixture-game-character-performance-bonus",
    fields: [{ key: "fixtureId", label: "Fixture ID" }, { key: "characterId", label: "角色 ID" }, { key: "totalBonusRate", label: "总加成率", type: "number" }],
    sample: [{ fixtureId: "1", characterId: "1", totalBonusRate: 5 }]
  }
];

const assetDefinitionByKind = new Map(assetDefinitions.map((definition) => [definition.kind, definition]));

function formatDate(value?: string) {
  if (!value) return "-";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
}

function sectionReadyLabel(ready?: boolean) {
  return ready ? "可用" : "待补充";
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === "object") as Record<string, unknown>[] : [];
}

function coerceFieldValue(value: unknown, field: AssetField) {
  if (field.key === "cardIds" && typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  if (field.type === "number") {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }
  if (field.type === "boolean") return value === true || value === "true" || value === "1" || value === "yes";
  if (typeof value === "string") return value.trim();
  return value;
}

function parseBulkRows(value: string, fields: AssetField[]) {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return asArray(Array.isArray(parsed) ? parsed : (parsed as Record<string, unknown>).items ?? (parsed as Record<string, unknown>).data);
  }
  return trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const cells = line.split(/[\t,]/).map((cell) => cell.trim());
    return Object.fromEntries(fields.map((field, index) => [field.key, coerceFieldValue(cells[index] ?? "", field)]));
  });
}

function postSaveImpact(context: ToolContext | null) {
  if (!context?.toolAvailability) return [];
  return Object.entries(context.toolAvailability).map(([tool, state]) => ({
    tool,
    ready: state.ready,
    detail: state.missingFields.length ? state.missingFields.join(" / ") : "基础输入已满足"
  }));
}

function BindingSelect({ value, onChange, bindings, summaries = [] }: { value?: string; onChange: (id: string) => void; bindings: PlayerBinding[]; summaries?: BindingSummary[] }) {
  return <div className="binding-selector-strip">{bindings.map((binding) => {
    const summary = summaries.find((item) => item.binding.id === binding.id);
    const snapshot = binding.publicProfileSnapshot ?? summary?.publicProfileSnapshot ?? {};
    const avatar = snapshot.avatarUrl ?? snapshot.userProfile?.twitterProfileImageUrl ?? snapshot.leaderCardImageUrl;
    return <button type="button" key={binding.id} className={value === binding.id ? "active" : "secondary"} onClick={() => onChange(binding.id)}>
      {avatar ? <img src={avatar} alt="" /> : <UserRound size={20} />}
      <span><strong>{binding.displayName || snapshot.nickname || snapshot.name || binding.playerUid}</strong><small>{binding.region.toUpperCase()} · Rank {snapshot.rank ?? "-"} · 库存 {summary?.inventoryCount ?? 0}</small><small>{binding.isDefault ? "默认 · " : ""}{formatDate(binding.refreshedAt ?? binding.updatedAt)}</small></span>
    </button>;
  })}</div>;
}

function ToolContextPanel({ context }: { context: ToolContext | null }) {
  const tools = context?.toolAvailability ? Object.entries(context.toolAvailability) : [];
  const impact = context?.formulaImpact ? Object.entries(context.formulaImpact) : [];
  return (
    <article className="panel wide">
      <div className="panel-heading">
        <div>
          <h2>工具可用状态</h2>
          <p>参考 Moesekai AccountSelector 的账号上下文：用当前绑定 UID 的库存和资产计算工具就绪度。</p>
        </div>
        {context?.sharedFormulaVersion && <span className="status-pill">公式 {context.sharedFormulaVersion}</span>}
      </div>
      {context ? (
        <>
          <div className="compact-list">
            {tools.map(([name, state]) => (
              <div key={name}>
                <span><CheckCircle2 size={16} /> {name}</span>
                <strong>{sectionReadyLabel(state.ready)}</strong>
                <small>{state.missingFields.length ? state.missingFields.join(" / ") : "基础输入已满足"}</small>
              </div>
            ))}
          </div>
          <details>
            <summary>资产如何影响工具</summary>
            <div className="compact-list">
              {impact.map(([name, desc]) => <div key={name}><span>{name}</span><small>{String(desc)}</small></div>)}
            </div>
          </details>
        </>
      ) : <p className="empty-state">绑定 UID 后可查看工具可用状态。</p>}
    </article>
  );
}

function ValidationPanel({ result }: { result: ValidationResult | null }) {
  if (!result) return null;
  const errors = result.errors ?? [];
  const warnings = result.warnings ?? [];
  const lookup = result.lookupResults ?? [];
  return (
    <div className={`validation-panel ${errors.length ? "has-errors" : "has-warnings"}`}>
      <strong>{errors.length ? "校验未通过" : warnings.length ? "校验通过，但有提示" : "校验通过"}</strong>
      {errors.map((item) => <p key={item}>{item}</p>)}
      {warnings.map((item) => <p key={item}>{item}</p>)}
      {!errors.length && !warnings.length && <p>没有错误或警告。</p>}
      {lookup.length > 0 && (
        <div className="tag-row">
          {lookup.slice(0, 24).map((item, index) => (
            <span key={`${item.field}:${item.id}:${index}`} className={item.matched ? "" : "warning-tag"}>
              {item.field}: {item.label || item.id || "-"} {item.matched ? "已命中" : "未命中"}
            </span>
          ))}
        </div>
      )}
      {Array.isArray(result.toolImpact) && result.toolImpact.length > 0 && (
        <p className="empty-state">影响工具：{result.toolImpact.join(" / ")}</p>
      )}
    </div>
  );
}

function FieldHelpPanel({ definition, fields, validation }: { definition?: AssetDefinition; fields: AssetField[]; validation?: ValidationResult | null }) {
  const help = validation?.fieldHelp?.length ? validation.fieldHelp : fields.map((field) => ({ field: field.key, label: field.label, help: field.help ?? "用户声明字段。", reference: definition?.reference }));
  return (
    <details open className="asset-help-panel">
      <summary>字段帮助与参考来源</summary>
      <div className="compact-list">
        {help.map((item) => (
          <div key={item.field}>
            <span>{item.label || item.field}</span>
            <small>{item.help}{item.reference ? ` / ${item.reference}` : ""}</small>
          </div>
        ))}
      </div>
      {definition && <p className="empty-state">{definition.impact}</p>}
    </details>
  );
}

function StructuredTableEditor({ fields, rows, onChange }: { fields: AssetField[]; rows: Record<string, unknown>[]; onChange: (rows: Record<string, unknown>[]) => void }) {
  function updateCell(index: number, field: AssetField, value: unknown) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field.key]: coerceFieldValue(value, field) } : row));
  }
  function addRow() {
    onChange([...rows, Object.fromEntries(fields.map((field) => [field.key, field.type === "boolean" ? false : ""]))]);
  }
  return (
    <div className="asset-table-wrap">
      <div className="asset-table" style={{ gridTemplateColumns: `repeat(${fields.length}, minmax(130px, 1fr)) 48px` }}>
        {fields.map((field) => <strong key={field.key}>{field.label}</strong>)}
        <strong>操作</strong>
        {rows.map((row, rowIndex) => (
          <div className="asset-table-row" key={rowIndex} style={{ display: "contents" }}>
            {fields.map((field) => {
              const value = row[field.key];
              if (field.type === "boolean") {
                return <label key={field.key} className="asset-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateCell(rowIndex, field, event.target.checked)} />已启用</label>;
              }
              if (field.type === "select") {
                return <select key={field.key} value={String(value ?? "")} onChange={(event) => updateCell(rowIndex, field, event.target.value)}>{(field.options ?? []).map((option) => <option key={option} value={option}>{option || "未设置"}</option>)}</select>;
              }
              return <input key={field.key} type={field.type === "number" ? "number" : "text"} value={Array.isArray(value) ? value.join(",") : String(value ?? "")} placeholder={field.placeholder} onChange={(event) => updateCell(rowIndex, field, event.target.value)} />;
            })}
            <button type="button" className="secondary icon-button" onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))} aria-label="删除行"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="secondary" onClick={addRow}><Plus size={16} />新增一行</button>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = new URLSearchParams(location.search).get("returnTo");
  const from = (returnTo?.startsWith("/") ? returnTo : undefined) ?? (location.state as { from?: string } | null)?.from ?? "/me";
  async function submitLogin() {
    await login(email, password);
    navigate(from, { replace: true });
  }
  async function startQqLogin() {
    try {
      const result = await apiGet<{ authorizeUrl: string }>("/api/auth/qq/start");
      window.location.href = result.authorizeUrl;
    } catch {
      setNotice("QQ 登录暂未配置或仍在审核中，邮箱登录不受影响。");
    }
  }
  if (isAuthenticated) return <Navigate to={from} replace />;
  return (
    <section className="auth-page">
      <article className="auth-hero"><span>Project Sekai 工具箱账号</span><h2>登录后管理 UID、玩家资产和工具数据</h2><p>账号只保存你显式上传的数据和公开 UID 快照，不抓取私密数据。</p></article>
      <article className="panel auth-panel">
        <h2>邮箱登录</h2>
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
        <button type="button" onClick={submitLogin}><LogIn size={16} />登录</button>
        <button type="button" className="secondary" onClick={startQqLogin}>QQ 登录</button>
        {notice && <p className="empty-state">{notice}</p>}
        <Link to="/register">还没有账号？去注册</Link>
      </article>
    </section>
  );
}

export function RegisterPage() {
  const { register, isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const navigate = useNavigate();
  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);
  async function requestCode() {
    if (!email.trim()) return setError("请输入有效邮箱。");
    setSendingCode(true);
    setError("");
    try {
      const result = await apiPost<{ devCode?: string; sent: boolean; expiresIn: number; resendAfter: number }>("/api/auth/email-code/start", { email, purpose: "register" });
      setResendSeconds(result.resendAfter);
      setNotice(result.devCode ? `开发验证码：${result.devCode}，${Math.floor(result.expiresIn / 60)} 分钟内有效。` : `验证码已发送，${Math.floor(result.expiresIn / 60)} 分钟内有效。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "验证码发送失败，请稍后重试。");
    } finally {
      setSendingCode(false);
    }
  }
  async function submitRegister() {
    setError("");
    if (password !== confirmPassword) return setError("两次输入的密码不一致。");
    try {
      await register(email, password, code);
      navigate("/me");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "注册失败，请检查填写内容。");
    }
  }
  if (isAuthenticated) return <Navigate to="/me" replace />;
  return (
    <section className="auth-page">
      <article className="auth-hero"><span>创建账号</span><h2>保存玩家资产和工具上下文</h2><p>注册后可以绑定多个 UID，并把库存、区域道具、MySekai 等资产复用于工具。</p></article>
      <article className="panel auth-panel">
        <h2>邮箱注册</h2>
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
        <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入密码" />
        <small>密码至少 10 位，并包含大写字母、小写字母、数字和符号；14 位以上至少包含其中三类，且不能包含邮箱名前缀。</small>
        <div className="button-row"><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位验证码" /><button type="button" className="secondary" disabled={sendingCode || resendSeconds > 0 || !email.trim()} onClick={requestCode}>{sendingCode ? "发送中..." : resendSeconds > 0 ? `${resendSeconds}s 后重发` : "获取验证码"}</button></div>
        <button type="button" disabled={password !== confirmPassword || code.length !== 6} onClick={submitRegister}>注册</button>
        {notice && <p className="empty-state">{notice}</p>}
        {error && <p className="warning-text">{error}</p>}
        <Link to="/login">已有账号？去登录</Link>
      </article>
    </section>
  );
}

function useSelectedBinding() {
  const { meProfile } = useAuth();
  const [selectedBindingId, setSelectedBindingId] = useState<string | undefined>();
  const selectedBinding = useMemo(() => {
    const bindings = meProfile?.bindings ?? [];
    return bindings.find((item) => item.id === selectedBindingId) ?? bindings.find((item) => item.isDefault) ?? bindings[0];
  }, [meProfile, selectedBindingId]);
  const selectedSummary = meProfile?.bindingSummaries.find((item) => item.binding.id === selectedBinding?.id);
  return { selectedBinding, selectedSummary, selectedBindingId: selectedBinding?.id, setSelectedBindingId };
}

function useToolContext(binding?: PlayerBinding, refreshKey = 0) {
  const { token } = useAuth();
  const [toolContext, setToolContext] = useState<ToolContext | null>(null);
  useEffect(() => {
    if (!binding) {
      setToolContext(null);
      return;
    }
    apiGet<ToolContext>(`/api/me/player-bindings/${binding.id}/tool-context`, token).then(setToolContext).catch(() => setToolContext(null));
  }, [binding?.id, token, refreshKey]);
  return toolContext;
}

const meTools = [
  { to: "/me/favorites", title: "我的收藏", icon: Bookmark, desc: "创建收藏夹、查看未分类项目，并批量整理图鉴收藏。" },
  { to: "/me/profile", title: "玩家档案", icon: UserRound, desc: "查看角色 Rank、Challenge、Bonds、综合力加成与区域道具升级。" },
  { to: "/me/bindings", title: "UID 管理", icon: UserRound, desc: "参考 QuickBind / AccountSelector，管理默认 UID 和公开资料。" },
  { to: "/me/assets", title: "玩家资产", icon: Upload, desc: "结构化维护库存、区域道具、角色 Rank、歌曲成绩和 MySekai 数据。" },
  { to: "/me/deck", title: "绑定组卡", icon: Wand2, desc: "用当前 UID 的上传资产运行组卡推荐。" },
  { to: "/me/scores", title: "收藏与成绩", icon: Bookmark, desc: "维护歌曲成绩和收藏。" }
];

export function MeProfileAnalysisPage() {
  const { token, meProfile } = useAuth();
  const { selectedBinding, selectedBindingId, setSelectedBindingId } = useSelectedBinding();
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!selectedBinding) { setAnalysis(null); return; }
    setError("");
    apiGet<ProfileAnalysis>(`/api/me/player-bindings/${selectedBinding.id}/profile-analysis`, token).then(setAnalysis).catch((reason) => { setAnalysis(null); setError(reason instanceof Error ? reason.message : String(reason)); });
  }, [selectedBinding?.id, token]);
  if (!meProfile?.bindings.length) return <article className="panel"><h2>玩家档案</h2><p className="empty-state">请先绑定 UID 并导入玩家资产。</p><Link className="button-link" to="/me/bindings">管理 UID</Link></article>;
  return <section className="profile-analysis-page"><article className="panel profile-account-bar"><div><strong>玩家档案分析</strong><span>公开资料与用户导入资产分开诊断，UID 绑定不代表所有权证明。</span></div><BindingSelect value={selectedBindingId} onChange={setSelectedBindingId} bindings={meProfile.bindings} summaries={meProfile.bindingSummaries} /></article>{error && <p className="warning-text">{error}</p>}{analysis ? <PlayerProfileAnalysisView analysis={analysis} /> : !error && <p className="empty-state">正在汇总玩家资产...</p>}</section>;
}

export function MeHomePage() {
  const { meProfile, logout } = useAuth();
  const { selectedBinding, selectedSummary } = useSelectedBinding();
  const toolContext = useToolContext(selectedBinding);
  const missing = toolContext?.toolContextWarnings ?? [];
  return (
    <section className="account-workspace">
      <article className="panel account-summary">
        <div><span>当前 UID</span><strong>{selectedBinding?.displayName || selectedBinding?.publicProfileSnapshot?.nickname || selectedBinding?.playerUid || "未绑定"}</strong><small>{selectedBinding?.region ?? "-"}</small></div>
        <div><span>库存</span><strong>{toolContext?.inventoryCount ?? selectedSummary?.inventoryCount ?? 0}</strong></div>
        <div><span>资产类型</span><strong>{toolContext?.playerDataKinds.length ?? selectedSummary?.completeness.uploadedPlayerDataKinds.length ?? 0}</strong></div>
      </article>
      {missing.length > 0 && <article className="panel wide"><div className="panel-heading"><div><h2>建议补充的资产</h2><p>这些字段会影响工具结果精度。</p></div><Link className="button-link" to="/me/assets">去补充资产</Link></div><div className="tag-row">{missing.slice(0, 12).map((item) => <span key={item}>{item}</span>)}</div></article>}
      <ToolContextPanel context={toolContext} />
      <div className="tool-grid me-tool-grid">{meTools.map((tool) => { const Icon = tool.icon; return <Link className="tool-card" key={tool.to} to={tool.to}><span className="tool-icon"><Icon size={22} /></span><strong>{tool.title}</strong><small>{tool.desc}</small></Link>; })}</div>
      <button type="button" className="secondary logout-button" onClick={logout}>退出登录</button>
    </section>
  );
}

export function BindingsPage() {
  const { token, meProfile, reloadProfile, setAuthMessage } = useAuth();
  const { selectedBinding, setSelectedBindingId } = useSelectedBinding();
  const [form, setForm] = useState({ region: "jp", playerUid: "", displayName: "", note: "", isDefault: true });
  async function addBinding() {
    const binding = await apiPost<PlayerBinding>("/api/me/player-bindings", form, token);
    setSelectedBindingId(binding.id);
    setForm({ region: "jp", playerUid: "", displayName: "", note: "", isDefault: false });
    await reloadProfile();
    setAuthMessage("玩家 UID 已绑定。");
  }
  async function refreshBindingProfile(bindingId: string) {
    await apiPost<PlayerBinding>(`/api/me/player-bindings/${bindingId}/refresh-public-profile`, {}, token);
    await reloadProfile();
  }
  async function setDefaultBinding(binding: PlayerBinding) {
    await apiPatch<PlayerBinding>(`/api/me/player-bindings/${binding.id}`, { isDefault: true }, token, { ifMatch: binding.version });
    await reloadProfile();
  }
  async function deleteBinding(bindingId: string) {
    const binding = meProfile?.bindings.find((item) => item.id === bindingId);
    await apiDelete(`/api/me/player-bindings/${bindingId}`, token, { ifMatch: binding?.version });
    await reloadProfile();
  }
  return (
    <section className="me-stack">
      <article className="panel wide">
        <div className="panel-heading"><div><h2>UID 管理</h2><p>参考 Moesekai QuickBind：快速绑定、选择账号、刷新公开资料。</p></div><button type="button" onClick={addBinding}>绑定 UID</button></div>
        <div className="two-col">
          <select value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })}><option value="jp">JP</option><option value="en">EN</option><option value="tw">TW</option><option value="kr">KR</option><option value="cn">CN</option></select>
          <input value={form.playerUid} onChange={(event) => setForm({ ...form, playerUid: event.target.value })} placeholder="玩家 UID" />
          <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="显示名，可留空" />
          <input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="备注" />
          <label className="check-line"><input type="checkbox" checked={form.isDefault} onChange={(event) => setForm({ ...form, isDefault: event.target.checked })} />设为默认</label>
        </div>
      </article>
      <div className="binding-list">
        {(meProfile?.bindings ?? []).map((binding) => {
          const summary = meProfile?.bindingSummaries.find((item) => item.binding.id === binding.id);
          return (
            <button key={binding.id} type="button" className={`binding-card ${selectedBinding?.id === binding.id ? "active" : ""}`} onClick={() => setSelectedBindingId(binding.id)}>
              <strong>{binding.displayName || binding.publicProfileSnapshot?.nickname || binding.playerUid}</strong>
              <span>{binding.region} / {binding.playerUid}</span>
              <small>{binding.isDefault ? "默认 / " : ""}库存 {summary?.inventoryCount ?? 0} / 刷新 {formatDate(binding.refreshedAt)}</small>
              <div><button type="button" onClick={(event) => { event.stopPropagation(); refreshBindingProfile(binding.id); }}>刷新资料</button><button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); setDefaultBinding(binding); }}>默认</button><button type="button" className="secondary" onClick={(event) => { event.stopPropagation(); deleteBinding(binding.id); }}>删除</button></div>
            </button>
          );
        })}
        {!meProfile?.bindings.length && <p className="empty-state">暂无绑定 UID。</p>}
      </div>
    </section>
  );
}

export function AssetsPage() {
  const { token, meProfile, reloadProfile } = useAuth();
  const { selectedBinding, selectedSummary, selectedBindingId, setSelectedBindingId } = useSelectedBinding();
  const [refreshKey, setRefreshKey] = useState(0);
  const toolContext = useToolContext(selectedBinding, refreshKey);
  const [activeKind, setActiveKind] = useState("cards");
  const [mode, setMode] = useState<AssetMode>("visual");
  const [inventoryRows, setInventoryRows] = useState<Record<string, unknown>[]>([]);
  const [assetRows, setAssetRows] = useState<Record<string, unknown>[]>([]);
  const [bulkText, setBulkText] = useState("");
  const [jsonText, setJsonText] = useState("[]");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importReview, setImportReview] = useState<ImportReview | null>(null);
  const [notice, setNotice] = useState("");
  const [lastImpact, setLastImpact] = useState<Array<{ tool: string; ready: boolean; detail: string }>>([]);
  const [cardManifest, setCardManifest] = useState<CardImportManifest | null>(null);

  const definition = assetDefinitionByKind.get(activeKind);
  const currentFields = activeKind === "cards" ? inventoryFields : definition?.fields ?? [];
  const currentRows = activeKind === "cards" ? inventoryRows : assetRows;
  const currentSample = activeKind === "cards" ? [{ cardId: "1", level: 60, masterRank: 0, skillLevel: 1, specialTrainingStatus: "done", defaultImage: "after_training", episodesRead: true }] : definition?.sample ?? [];

  useEffect(() => {
    setValidation(null);
    setImportReview(null);
    setNotice("");
    setMode(activeKind === "cards" ? "visual" : "table");
    setBulkText("");
  }, [activeKind, selectedBinding?.id]);

  useEffect(() => {
    if (!selectedBinding || activeKind !== "cards") return;
    apiGet<CardImportManifest>(`/api/master/${selectedBinding.region}/cards/import-manifest`)
      .then(setCardManifest)
      .catch(() => setCardManifest(null));
  }, [activeKind, selectedBinding?.id, selectedBinding?.region]);

  useEffect(() => {
    if (!selectedBinding) return;
    if (activeKind === "cards") {
      apiGet<InventoryItem[]>(`/api/me/player-data/${selectedBinding.id}/cards`, token)
        .then((items) => {
          const rows = items.map((item) => ({ ...item }));
          setInventoryRows(rows);
          setJsonText(formatJson(rows.length ? rows : currentSample));
        })
        .catch(() => {
          setInventoryRows([]);
          setJsonText(formatJson(currentSample));
        });
      return;
    }
    apiGet<{ data?: unknown }>(`/api/me/player-data/${selectedBinding.id}/${activeKind}`, token)
      .then((record) => {
        const rows = asArray(record.data);
        setAssetRows(rows);
        setJsonText(formatJson(rows.length ? rows : currentSample));
      })
      .catch(() => {
        setAssetRows([]);
        setJsonText(formatJson(currentSample));
      });
  }, [activeKind, selectedBinding?.id, token]);

  async function validateRows(kind: string, rows: unknown) {
    if (!selectedBinding || kind === "cards") return null;
    const result = await apiPost<ValidationResult>(`/api/me/player-data/${selectedBinding.id}/validate`, { kind, region: selectedBinding.region, data: rows }, token);
    setValidation(result);
    return result;
  }
  function syncRowsFromBulk() {
    const rows = parseBulkRows(bulkText, currentFields);
    if (activeKind === "cards") setInventoryRows(rows);
    else setAssetRows(rows);
    setJsonText(formatJson(rows));
    setMode("table");
    setNotice(`已解析 ${rows.length} 条记录，请检查 lookup 与字段帮助后保存。`);
  }
  function syncRowsFromJson() {
    const rows = asArray(JSON.parse(jsonText));
    if (activeKind === "cards") setInventoryRows(rows);
    else setAssetRows(rows);
    setMode("table");
  }
  async function refreshAfterWrite(message: string) {
    await reloadProfile();
    setRefreshKey((value) => value + 1);
    const nextContext = selectedBinding ? await apiGet<ToolContext>(`/api/me/player-bindings/${selectedBinding.id}/tool-context`, token).catch(() => null) : null;
    setLastImpact(postSaveImpact(nextContext));
    setNotice(message);
  }
  async function saveCurrent() {
    if (!selectedBinding) return;
    const rows = mode === "json" ? asArray(JSON.parse(jsonText)) : currentRows;
    if (activeKind === "cards") {
      const cards = rows.map((row) => ({ ...row, cardId: String(row.cardId ?? row.id ?? "") })).filter((row) => row.cardId);
      await apiPut(`/api/me/player-data/${selectedBinding.id}/cards`, { region: selectedBinding.region, cards }, token);
      setInventoryRows(cards);
      setJsonText(formatJson(cards));
      await refreshAfterWrite(`已保存 ${cards.length} 张持有卡。`);
      return;
    }
    const result = await validateRows(activeKind, rows);
    if (result && result.valid === false) {
      setNotice("存在错误，已阻止保存。");
      return;
    }
    await apiPut(`/api/me/player-data/${selectedBinding.id}/${activeKind}`, { region: selectedBinding.region, data: rows }, token);
    setAssetRows(rows);
    setJsonText(formatJson(rows));
    await refreshAfterWrite(`已保存 ${definition?.label ?? activeKind}。`);
  }
  async function exportData() {
    if (!selectedBinding) return;
    const data = await apiGet(`/api/me/player-data/${selectedBinding.id}/export`, token);
    setJsonText(formatJson(data));
    setMode("json");
    setNotice("已读取导出数据，可在高级 JSON 区查看或预览导入。");
  }
  async function reviewImport() {
    if (!selectedBinding) return;
    const data = JSON.parse(jsonText);
    const review = await apiPost<ImportReview>(`/api/me/player-data/${selectedBinding.id}/import/review`, data, token);
    setImportReview(review);
    setNotice("导入预览已生成；确认无误后再写入。");
  }
  async function confirmImport() {
    if (!selectedBinding) return;
    const data = JSON.parse(jsonText);
    await apiPost(`/api/me/player-data/${selectedBinding.id}/import`, data, token);
    setImportReview(null);
    await refreshAfterWrite("导入完成，已刷新资产摘要。");
  }

  async function deleteInventoryCards(cardIds: string[]) {
    if (!selectedBinding) return;
    for (const cardId of cardIds) await apiDelete(`/api/me/player-data/${selectedBinding.id}/cards/${encodeURIComponent(cardId)}`, token);
    const nextRows = inventoryRows.filter((row) => !cardIds.includes(String(row.cardId ?? row.id ?? "")));
    setInventoryRows(nextRows);
    setJsonText(formatJson(nextRows));
    await refreshAfterWrite(`已删除 ${cardIds.length} 张持有卡记录。`);
  }

  async function reviewScreenshotCards(cards: Record<string, unknown>[]) {
    if (!selectedBinding) return;
    const payload = { schemaVersion: 2, region: selectedBinding.region, cards, playerData: [] };
    setJsonText(formatJson(payload));
    const review = await apiPost<ImportReview>(`/api/me/player-data/${selectedBinding.id}/import/review`, payload, token);
    setImportReview(review);
    setMode("json");
    setNotice("截图识别结果已进入差异预览；确认前不会写入库存。图片与 OCR 内容未上传。");
  }

  return (
    <section className="asset-workspace">
      <article className="panel asset-sidebar">
        <div className="panel-heading"><div><h2>玩家资产工作台</h2><p>参考 Moesekai user-data 与 Sekai Viewer 用户卡牌列表组织资产。</p></div></div>
        {meProfile?.bindings.length ? <BindingSelect value={selectedBindingId} onChange={setSelectedBindingId} bindings={meProfile.bindings} summaries={meProfile.bindingSummaries} /> : <p className="empty-state">请先绑定 UID。</p>}
        {selectedBinding && <div className="profile"><strong>{selectedBinding.displayName || selectedBinding.publicProfileSnapshot?.nickname || selectedBinding.playerUid}</strong><span>{selectedBinding.region} / 库存 {selectedSummary?.inventoryCount ?? 0}</span><small>已上传：{selectedSummary?.completeness.uploadedPlayerDataKinds.join(", ") || "无"}</small><small>刷新：{formatDate(selectedBinding.refreshedAt)}</small></div>}
        <div className="asset-kind-list">
          <button type="button" className={activeKind === "cards" ? "" : "secondary"} onClick={() => setActiveKind("cards")}><Database size={16} />持有卡</button>
          {playerDataKindOptions.map((kind) => {
            const item = assetDefinitionByKind.get(kind);
            if (!item) return null;
            return <button type="button" key={kind} className={activeKind === kind ? "" : "secondary"} onClick={() => setActiveKind(kind)}>{item.label}</button>;
          })}
        </div>
      </article>
      <div className="asset-main">
        <ToolContextPanel context={toolContext} />
        <article className="panel wide">
          <div className="panel-heading">
            <div><h2>{activeKind === "cards" ? "持有卡" : definition?.label ?? activeKind}</h2><p>{activeKind === "cards" ? "维护卡牌库存。等级、MR、技能和剧情阅读会影响组卡与活动收益估算。" : definition?.description}</p></div>
             <div className="segmented">{activeKind === "cards" && <button type="button" className={mode === "visual" ? "active" : "secondary"} onClick={() => setMode("visual")}>视觉库存</button>}<button type="button" className={mode === "table" ? "active" : "secondary"} onClick={() => setMode("table")}>表格</button><button type="button" className={mode === "bulk" ? "active" : "secondary"} onClick={() => setMode("bulk")}>批量粘贴</button><button type="button" className={mode === "json" ? "active" : "secondary"} onClick={() => setMode("json")}>高级 JSON</button></div>
          </div>
          {toolContext?.toolAvailability?.normalEventPlan && <div className="asset-tool-jump"><div><strong>普通活动规划</strong><span>{toolContext.toolAvailability.normalEventPlan.ready ? "当前资产已可用于活动规划。" : toolContext.toolAvailability.normalEventPlan.missingFields.join(" / ")}</span></div><Link className="button-link" to="/section/tools">去规划</Link></div>}
           <FieldHelpPanel definition={definition} fields={currentFields} validation={validation} />
           {mode === "visual" && activeKind === "cards" && <PlayerCardInventory manifest={cardManifest} rows={inventoryRows} onChange={setInventoryRows} onDelete={deleteInventoryCards} onReviewScreenshot={reviewScreenshotCards} />}
           {mode === "table" && <StructuredTableEditor fields={currentFields} rows={currentRows} onChange={activeKind === "cards" ? setInventoryRows : setAssetRows} />}
          {mode === "bulk" && <div className="asset-editor-stack"><p className="empty-state">每行一条记录，字段按表格列顺序用逗号或 Tab 分隔；也可以直接粘贴 JSON 数组。</p><textarea className="json-editor" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={formatJson(currentSample)} /><button type="button" className="secondary" onClick={syncRowsFromBulk}><ClipboardList size={16} />解析到表格</button></div>}
          {mode === "json" && <div className="asset-editor-stack"><textarea className="json-editor" value={jsonText} onChange={(event) => setJsonText(event.target.value)} /><div className="button-row"><button type="button" className="secondary" onClick={syncRowsFromJson}>同步到表格</button><button type="button" className="secondary" onClick={exportData}><Download size={16} />导出当前绑定</button><button type="button" className="secondary" onClick={reviewImport}><Upload size={16} />预览导入</button>{importReview && <button type="button" onClick={confirmImport}>确认导入</button>}</div></div>}
          <div className="button-row">{activeKind !== "cards" && <button type="button" className="secondary" onClick={() => validateRows(activeKind, currentRows)}><CheckCircle2 size={16} />校验</button>}<button type="button" onClick={saveCurrent}><Save size={16} />保存</button><Link className="button-link" to="/me/deck">去组卡推荐</Link><Link className="button-link" to="/section/deckCompare">卡组比较</Link><Link className="button-link" to="/section/tools">去工具页</Link></div>
          <ValidationPanel result={validation} />
           {importReview && <article className="validation-panel"><strong>导入预览</strong><p>卡牌 {importReview.importReview?.cards?.count ?? 0} 张；资产分组 {importReview.importReview?.playerDataGroups?.length ?? 0} 个。</p>{importReview.importReview?.cardDiff && <div className="import-diff-summary"><span>新增 {importReview.importReview.cardDiff.added?.length ?? 0}</span><span>更新 {importReview.importReview.cardDiff.updated?.length ?? 0}</span><span>不变 {importReview.importReview.cardDiff.unchanged?.length ?? 0}</span><span>覆盖风险 {importReview.importReview.cardDiff.overwriteRisks?.length ?? 0}</span><span>未识别 {importReview.importReview.cardDiff.unresolved?.length ?? 0}</span></div>}{importReview.importReview?.playerDataGroups?.map((group) => <p key={group.kind}>{group.kind}: {group.itemCount} 条 / {group.validation.valid === false ? "有错误" : "可导入"} / {group.overwriteRisk}</p>)}{importReview.postSaveImpact?.length ? <p className="empty-state">保存后影响：{importReview.postSaveImpact.join(" / ")}</p> : null}<ValidationPanel result={importReview} /></article>}
          {lastImpact.length > 0 && <details open><summary>保存后影响</summary><div className="compact-list">{lastImpact.map((item) => <div key={item.tool}><span>{item.tool}</span><strong>{sectionReadyLabel(item.ready)}</strong><small>{item.detail}</small></div>)}</div></details>}
          {notice && <p className="empty-state">{notice}</p>}
        </article>
      </div>
    </section>
  );
}

export function BoundDeckPage({ eventId }: { eventId?: string }) {
  const { token } = useAuth();
  const { selectedBinding } = useSelectedBinding();
  const toolContext = useToolContext(selectedBinding);
  const [result, setResult] = useState<any>(null);
  async function calculate() {
    if (!selectedBinding) return;
    setResult(await apiPost("/api/me/tools/deck-recommend", { region: selectedBinding.region, bindingId: selectedBinding.id, eventId }, token));
  }
  const cards = useMemo(() => result?.recommendedCards ?? result?.recommendedDecks?.[0]?.cards ?? [], [result]);
  return (
    <section className="grid">
      <article className="panel"><h2>绑定数据组卡</h2><p className="warning-text">使用当前 UID 的上传库存、区域道具、角色 Rank 和活动 master 数据。未确认公式会显示在缺失或估算字段中。</p><button type="button" onClick={calculate}><Wand2 size={16} />开始推荐</button>{selectedBinding && <p className="empty-state">当前 UID：{selectedBinding.region} / {selectedBinding.playerUid}</p>}</article>
      <ToolContextPanel context={toolContext} />
      <article className="panel wide">
        <h2>推荐结果</h2>
        <div className="deck-result-list">
          {cards.map((item: any, index: number) => {
            const breakdown = item.cardContributionBreakdown;
            const power = breakdown?.powerBreakdown ?? {};
            const modeBreakdown = breakdown?.modeSpecificBreakdown ?? {};
            const worldBloomTrace = (modeBreakdown.worldBloom ?? modeBreakdown.wl ?? modeBreakdown.wl3) as any;
            const challengeTrace = modeBreakdown.challenge as any;
            return (
              <div key={item.card?.id ?? item.cardId ?? index} className="deck-result-card">
                <strong>{item.card?.title ?? item.cardId ?? item.card?.id}</strong>
                <span>活动加成 {item.eventBonus ?? breakdown?.eventBonusPercent ?? "-"}%</span>
                <small>最终排序分 {item.contributionScore ?? breakdown?.contributionScore ?? "-"}</small>
                <dl><div><dt>综合力</dt><dd>{item.estimatedPower ?? power.totalPower ?? "-"}</dd></div><div><dt>MR</dt><dd>{breakdown?.masterRankBonus ?? power.masterRankBonus ?? "-"}</dd></div><div><dt>技能</dt><dd>{item.skillScore ?? breakdown?.skillScore ?? "-"}</dd></div><div><dt>区域道具</dt><dd>{power.areaItemBonus ?? 0}</dd></div><div><dt>角色 Rank</dt><dd>{power.characterRankBonus ?? 0}</dd></div></dl>
                <div className="trace-chip-row">{challengeTrace && <code>challenge: {String(challengeTrace.candidateRole ?? challengeTrace.scorePath ?? "-")}</code>}{worldBloomTrace?.supportDeckBreakdown && <code>support: {String(worldBloomTrace.supportDeckBreakdown.supportDeckBonus ?? worldBloomTrace.supportDeckBreakdown.uploadedSupportCount ?? "-")}</code>}{worldBloomTrace?.differentAttributeTrace && <code>attr: {String(worldBloomTrace.differentAttributeTrace.attributeCount ?? "-")} / +{String(worldBloomTrace.differentAttributeTrace.bonusRate ?? 0)}%</code>}{worldBloomTrace?.cardBonusCountLimitTrace && <code>limit cards: {String(worldBloomTrace.cardBonusCountLimitTrace.cardBonusCountLimit ?? "-")}</code>}</div>
              </div>
            );
          })}
          {!cards.length && <p className="empty-state">点击开始推荐后会展示每卡贡献分解。</p>}
        </div>
        {result?.missingFields?.length > 0 && <div className="tag-row">{result.missingFields.map((item: string) => <span key={item}>{item}</span>)}</div>}
      </article>
    </section>
  );
}

export function ScoresPage({ songs, region }: { songs: Array<{ id: string; title: string }>; region: string }) {
  const { token, meProfile, reloadProfile } = useAuth();
  const [scoreSongId, setScoreSongId] = useState(songs[0]?.id ?? "");
  const [scoreDifficulty, setScoreDifficulty] = useState("expert");
  const [scoreStatus, setScoreStatus] = useState<ScoreRecord["clearStatus"]>("fc");
  const [scoreValue, setScoreValue] = useState("987654");
  const [targetScore, setTargetScore] = useState("1000000");
  const [scoreNote, setScoreNote] = useState("");
  async function saveScore() {
    await apiPost<ScoreRecord>("/api/me/scores", { region, songId: scoreSongId, difficulty: scoreDifficulty, clearStatus: scoreStatus, score: Number(scoreValue), targetScore: Number(targetScore), note: scoreNote }, token);
    await reloadProfile();
  }
  async function deleteFavorite(item: Favorite) {
    await apiDelete(`/api/me/favorites/${item.id}`, token, { ifMatch: item.version });
    await reloadProfile();
  }
  async function deleteScore(item: ScoreRecord) {
    await apiDelete(`/api/me/scores/${item.id}`, token, { ifMatch: item.version });
    await reloadProfile();
  }
  return (
    <section className="account-workspace">
      <article className="panel"><h2>收藏</h2><div className="compact-list">{(meProfile?.favorites ?? []).map((item: Favorite) => <div key={item.id}><span>{item.label}</span><button type="button" onClick={() => deleteFavorite(item)}>删除</button></div>)}{!meProfile?.favorites.length && <p className="empty-state">暂无收藏。</p>}</div></article>
      <article className="panel"><h2>成绩记录</h2><select value={scoreSongId} onChange={(event) => setScoreSongId(event.target.value)}>{songs.slice(0, 200).map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select><input value={scoreDifficulty} onChange={(event) => setScoreDifficulty(event.target.value)} placeholder="难度" /><input value={scoreValue} onChange={(event) => setScoreValue(event.target.value)} placeholder="当前分数" /><input value={targetScore} onChange={(event) => setTargetScore(event.target.value)} placeholder="目标分数" /><textarea value={scoreNote} onChange={(event) => setScoreNote(event.target.value)} /><select value={scoreStatus} onChange={(event) => setScoreStatus(event.target.value as ScoreRecord["clearStatus"])}><option value="clear">Clear</option><option value="fc">FC</option><option value="ap">AP</option><option value="not_clear">Not Clear</option></select><button type="button" onClick={saveScore}>保存成绩</button></article>
      <article className="panel wide"><h2>已保存成绩</h2><div className="compact-list">{(meProfile?.scores ?? []).map((item) => <div key={item.id}><span>{item.songId} / {item.difficulty} / {item.clearStatus}</span><button type="button" onClick={() => deleteScore(item)}>删除</button></div>)}{!meProfile?.scores.length && <p className="empty-state">暂无成绩记录。</p>}</div></article>
    </section>
  );
}
