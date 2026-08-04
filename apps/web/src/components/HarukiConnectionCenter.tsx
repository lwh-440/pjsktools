import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
  UserRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "../api";
import { useAuth } from "../AuthContext";
import type { BindingSummary, PlayerBinding } from "../accountTypes";
import {
  deleteHarukiPublicSnapshot,
  getHarukiPublicSnapshot,
  listHarukiPublicSnapshots,
  putHarukiPublicSnapshot
} from "../harukiPublicCache";
import {
  harukiRegions,
  type CachedHarukiPublicSnapshot,
  type HarukiConnection,
  type HarukiOAuthStart,
  type HarukiPublicPreviewResponse,
  type HarukiPublicSnapshot,
  type HarukiRegion,
  type HarukiSyncResult,
  type HarukiSyncReview,
  type HarukiSyncReviewResponse,
  type SyncChoice
} from "../harukiTypes";

const HARUKI_HOME = "https://haruki.seiunx.com/";
const HARUKI_TOOLBOX = "https://github.com/Team-Haruki/Haruki-Toolbox-Backend";

const regionLabels: Record<HarukiRegion, string> = {
  jp: "日服",
  en: "国际服",
  tw: "繁中服",
  kr: "韩服",
  cn: "简中服"
};

const groupLabels: Record<string, string> = {
  cards: "持有卡牌",
  "area-items": "区域道具",
  "character-ranks": "角色 Rank",
  "music-results": "歌曲成绩",
  materials: "素材",
  honors: "称号",
  "profile-honors": "资料页称号",
  "challenge-live": "Challenge Live",
  "world-bloom-support": "World Bloom 支援",
  "mysekai-canvas": "MySekai Canvas",
  "mysekai-gates": "MySekai Gates",
  "mysekai-fixtures": "MySekai 家具"
};

function formatDate(value?: string) {
  if (!value) return "未知";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(time);
}

function errorMessage(reason: unknown) {
  if (!(reason instanceof Error)) return String(reason);
  if (reason instanceof ApiError) {
    if (reason.code === "HARUKI_INVALID_RESPONSE") return "Haruki 已返回数据，但 pjsktools 无法安全解析；现有快照未被覆盖。";
    if (reason.code === "HARUKI_UPSTREAM_ERROR") return "Haruki 上游暂时不可用；现有快照未被覆盖。";
    if (reason.code === "HARUKI_NOT_CONFIGURED") return "pjsktools 尚未完成 Haruki 服务配置。";
    if (reason.code === "HARUKI_REAUTHORIZE") return "Haruki 授权已失效，请重新授权。";
    if (reason.status === 401) return "登录或 Haruki 授权已失效，请重新授权。";
    if (reason.status === 403) return "该 UID 尚未开启 Haruki Public API，或当前授权无权读取。";
    if (reason.status === 404) return "Haruki 中没有找到该 UID 的可用数据。";
    if (reason.status === 409) return "数据在审核后发生了变化，请重新生成同步预览。";
    if (reason.status === 429) return "Haruki 请求过于频繁，请稍后再试。";
    if (reason.status >= 500) return "Haruki 或 pjsktools 服务暂时不可用。";
  }
  return reason.message || "请求失败。";
}

export function normalizePublicSnapshot(
  response: HarukiPublicPreviewResponse,
  region: HarukiRegion,
  playerUid: string
): HarukiPublicSnapshot {
  const snapshot = response.snapshot;
  if (snapshot.region !== region || snapshot.playerUid !== playerUid) {
    throw new Error("Haruki 返回的区服或 UID 与查询目标不一致，已拒绝缓存。");
  }
  return {
    schemaVersion: snapshot.schemaVersion,
    source: "haruki-public",
    region: snapshot.region,
    playerUid: snapshot.playerUid,
    displayName: snapshot.profile?.name,
    rank: snapshot.profile?.rank,
    uploadTime: snapshot.upstreamUploadedAt,
    fetchedAt: snapshot.fetchedAt,
    inventoryCount: snapshot.cards.length,
    dataGroups: snapshot.playerData.map((group) => ({
      kind: group.kind,
      count: Array.isArray(group.data) ? group.data.length : group.data && typeof group.data === "object" ? 1 : 0,
      available: true
    })),
    completeness: snapshot.completeness,
    snapshot
  };
}

export function normalizeConnection(value: HarukiConnection): HarukiConnection {
  return {
    ...value,
    availableBindings: Array.isArray(value.availableBindings) ? value.availableBindings : []
  };
}

export function normalizeReview(response: HarukiSyncReviewResponse): HarukiSyncReview {
  if (!response.reviewToken || !response.review) throw new Error("HARUKI_SYNC_NO_CHANGE");
  const review = response.review;
  const cards = review.cards;
  return {
    reviewToken: response.reviewToken,
    expiresAt: new Date(Date.now() + response.expiresIn * 1000).toISOString(),
    uploadTime: review.sourceSummary?.uploadTime,
    cards: cards?.present ? {
      added: cards.addedCount,
      updated: Math.max(0, cards.changedCount - cards.addedCount),
      unchanged: Math.max(0, cards.incomingCount - cards.changedCount),
      overwriteRisks: 0
    } : undefined,
    groups: Object.entries(review.groups).map(([kind, group]) => ({
      kind,
      label: groupLabels[kind],
      itemCount: group.incomingCount,
      currentCount: group.currentCount,
      empty: group.emptyRequiresConfirmation,
      valid: group.present
    }))
  };
}

function bindingStatus(binding: PlayerBinding) {
  if (binding.lastSyncStatus === "reauthorize") return { label: "需要重新授权", tone: "warning" };
  if (binding.lastSyncStatus === "upstream-error") return { label: "Haruki 暂不可用", tone: "warning" };
  if (binding.lastSyncStatus === "parse-error") return { label: "数据解析失败", tone: "warning" };
  if (binding.lastSyncStatus === "syncing") return { label: "同步中", tone: "success" };
  if (binding.lastSyncStatus === "never" || binding.lastSyncStatus === "ready") return { label: "等待首次同步", tone: "warning" };
  if (binding.lastSyncStatus === "needs-review") return { label: "需要人工审核", tone: "warning" };
  if (binding.pendingEmptyGroups?.length) return { label: "有待确认的空数据组", tone: "warning" };
  if (binding.verified === false) return { label: "未验证", tone: "warning" };
  return { label: "已连接", tone: "success" };
}

function summaryFor(binding: PlayerBinding, summaries: BindingSummary[]) {
  return summaries.find((item) => item.binding.id === binding.id);
}

function PublicPreviewCard({
  item,
  onRefresh,
  onClear,
  busy
}: {
  item: CachedHarukiPublicSnapshot;
  onRefresh: (item: CachedHarukiPublicSnapshot) => void;
  onClear: (item: CachedHarukiPublicSnapshot) => void;
  busy: boolean;
}) {
  return (
    <article className="haruki-public-card">
      <div className="haruki-card-heading">
        <div className="haruki-account-title">
          <UserRound size={20} />
          <div>
            <strong>{item.displayName || item.playerUid}</strong>
            <span>{regionLabels[item.region]} · {item.playerUid}</span>
          </div>
        </div>
        <span className={`status-pill ${item.refreshError ? "warning" : ""}`}>
          {item.refreshError ? "缓存可用" : "Public 临时数据"}
        </span>
      </div>
      <dl className="haruki-meta-grid">
        <div><dt>Haruki 上传</dt><dd>{formatDate(item.uploadTime)}</dd></div>
        <div><dt>本机获取</dt><dd>{formatDate(item.fetchedAt)}</dd></div>
        <div><dt>持有卡</dt><dd>{item.inventoryCount ?? "—"}</dd></div>
        <div><dt>数据分组</dt><dd>{item.dataGroups?.filter((group) => group.available !== false).length ?? "—"}</dd></div>
      </dl>
      {item.refreshError && <p className="haruki-inline-warning"><AlertTriangle size={16} />刷新失败：{item.refreshError}，当前仍在显示本机缓存。</p>}
      <div className="button-row">
        <button type="button" className="secondary" disabled={busy} onClick={() => onRefresh(item)}><RefreshCw size={16} />刷新</button>
        <button type="button" className="secondary danger-button" disabled={busy} onClick={() => onClear(item)}><Trash2 size={16} />清除本机缓存</button>
      </div>
    </article>
  );
}

function SyncReviewPanel({
  review,
  choices,
  cardChoice,
  busy,
  onChoice,
  onCardChoice,
  onCancel,
  onConfirm
}: {
  review: HarukiSyncReview;
  choices: Record<string, SyncChoice>;
  cardChoice: SyncChoice;
  busy: boolean;
  onChoice: (kind: string, choice: SyncChoice) => void;
  onCardChoice: (choice: SyncChoice) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <article className="haruki-review-panel">
      <div className="panel-heading">
        <div>
          <h3>确认本次同步</h3>
          <p>逐组决定是否用 Haruki 数据更新账号快照。缺失或无效分组不会覆盖现有数据。</p>
        </div>
        {review.expiresAt && <small>审核有效至 {formatDate(review.expiresAt)}</small>}
      </div>
      {review.cards && (
        <div className="haruki-review-row">
          <div>
            <strong>持有卡牌</strong>
            <span>新增 {review.cards.added} · 更新 {review.cards.updated} · 不变 {review.cards.unchanged}</span>
          </div>
          <select value={cardChoice} onChange={(event) => onCardChoice(event.target.value as SyncChoice)}>
            <option value="update">更新卡牌</option>
            <option value="keep">保留现有</option>
          </select>
        </div>
      )}
      {review.groups.map((group) => (
        <div className={`haruki-review-row ${!group.valid || group.empty ? "needs-attention" : ""}`} key={group.kind}>
          <div>
            <strong>{group.label || groupLabels[group.kind] || group.kind}</strong>
            <span>Haruki {group.itemCount} 条{group.currentCount !== undefined ? ` · 当前 ${group.currentCount} 条` : ""}</span>
            {!group.valid && <small>该分组校验失败，将强制保留现有数据。</small>}
            {group.empty && <small>Haruki 明确返回空分组；只有选择“清空并更新”才会删除当前内容。</small>}
            {group.warnings?.map((warning) => <small key={warning}>{warning}</small>)}
          </div>
          <select
            disabled={!group.valid}
            value={group.valid ? choices[group.kind] ?? "keep" : "keep"}
            onChange={(event) => onChoice(group.kind, event.target.value as SyncChoice)}
          >
            <option value="update">{group.empty ? "清空并更新" : "更新"}</option>
            <option value="keep">保留现有</option>
          </select>
        </div>
      ))}
      <div className="button-row">
        <button type="button" disabled={busy || !review.reviewToken} onClick={onConfirm}><CheckCircle2 size={16} />确认同步</button>
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>取消</button>
      </div>
    </article>
  );
}

export function HarukiConnectionCenter() {
  const location = useLocation();
  const navigate = useNavigate();
  const { token, meProfile, reloadProfile } = useAuth();
  const userId = meProfile?.user.id ?? "";
  const [connection, setConnection] = useState<HarukiConnection>({ connected: false, oauthConfigured: false, availableBindings: [] });
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [publicForm, setPublicForm] = useState<{ region: HarukiRegion; playerUid: string }>({ region: "jp", playerUid: "" });
  const [publicCache, setPublicCache] = useState<CachedHarukiPublicSnapshot[]>([]);
  const [selectedAvailableBindings, setSelectedAvailableBindings] = useState<string[]>([]);
  const [reviewBinding, setReviewBinding] = useState<PlayerBinding | null>(null);
  const [review, setReview] = useState<HarukiSyncReview | null>(null);
  const [reviewChoices, setReviewChoices] = useState<Record<string, SyncChoice>>({});
  const [cardChoice, setCardChoice] = useState<SyncChoice>("update");

  const persistedBindings = meProfile?.bindings ?? [];
  const summaries = meProfile?.bindingSummaries ?? [];
  const importableBindings = useMemo(
    () => connection.availableBindings.filter((binding) => binding.verified && !persistedBindings.some((item) => (
      item.harukiBindingId === binding.id || (item.region === binding.region && item.playerUid === binding.playerUid)
    ))),
    [connection.availableBindings, persistedBindings]
  );

  async function refreshConnection(showLoading = false) {
    if (!token) return;
    if (showLoading) setConnectionLoading(true);
    try {
      setConnection(normalizeConnection(await apiGet<HarukiConnection>("/api/me/haruki/connection", token)));
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 404) {
        setConnection({ connected: false, oauthConfigured: false, availableBindings: [] });
      } else {
        setError(errorMessage(reason));
      }
    } finally {
      setConnectionLoading(false);
    }
  }

  async function refreshPublicCache() {
    if (!userId || typeof indexedDB === "undefined") return;
    setPublicCache(await listHarukiPublicSnapshots(userId).catch(() => []));
  }

  useEffect(() => {
    refreshConnection(true);
  }, [token]);

  useEffect(() => {
    refreshPublicCache();
  }, [userId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const result = params.get("haruki");
    if (!result) return;
    if (result === "connected") {
      setNotice("Haruki 授权成功，请选择要同步到 pjsktools 账号的 UID。");
      refreshConnection(true);
      reloadProfile().catch(() => undefined);
    } else if (result === "error") {
      setError(params.get("message") || "Haruki 授权失败，请重试。");
    }
    navigate(location.pathname, { replace: true });
  }, [location.search]);

  function beginAction(name: string) {
    setBusyAction(name);
    setNotice("");
    setError("");
  }

  function endAction() {
    setBusyAction("");
  }

  async function fetchPublic(region: HarukiRegion, playerUid: string) {
    if (!userId) return;
    const uid = playerUid.trim();
    if (!/^\d{4,32}$/.test(uid)) {
      setError("请输入 4–32 位数字 UID。");
      return;
    }
    beginAction("public");
    try {
      const response = await apiPost<HarukiPublicPreviewResponse>("/api/me/haruki/public/preview", { region, playerUid: uid }, token);
      const snapshot = normalizePublicSnapshot(response, region, uid);
      try {
        await putHarukiPublicSnapshot(userId, snapshot);
        await refreshPublicCache();
      } catch {
        setPublicCache((current) => [{
          ...snapshot,
          userId,
          cacheKey: `${userId}:${region}:${uid}`,
          refreshError: "浏览器阻止了 IndexedDB 写入；本次数据只在当前页面有效。"
        }, ...current.filter((item) => item.region !== region || item.playerUid !== uid)]);
      }
      setPublicForm({ region, playerUid: uid });
      setNotice("Public 数据已刷新并仅缓存到这台设备。它不会创建跨端绑定。");
    } catch (reason) {
      const message = errorMessage(reason);
      const cached = await getHarukiPublicSnapshot(userId, region, uid).catch(() => undefined);
      if (cached) {
        setPublicCache((current) => current.map((item) => item.cacheKey === cached.cacheKey ? { ...cached, refreshError: message } : item));
        setNotice("刷新失败，已继续使用这台设备上的旧缓存。");
      } else {
        setError(message);
      }
    } finally {
      endAction();
    }
  }

  async function clearPublic(item: CachedHarukiPublicSnapshot) {
    beginAction(`clear-public:${item.cacheKey}`);
    try {
      await deleteHarukiPublicSnapshot(userId, item.region, item.playerUid);
      await refreshPublicCache();
      setNotice("已从这台设备清除该 Public 快照。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function startOAuth() {
    beginAction("oauth-start");
    try {
      const redirectUri = `${window.location.origin}/me/assets?haruki=connected`;
      const result = await apiPost<HarukiOAuthStart>("/api/me/haruki/oauth/start", { client: "web", redirectUri }, token);
      if (!result.authorizationUrl) throw new Error("服务端没有返回 Haruki 授权地址。");
      window.location.assign(result.authorizationUrl);
    } catch (reason) {
      setError(errorMessage(reason));
      endAction();
    }
  }

  async function importBindings() {
    if (!selectedAvailableBindings.length) return;
    beginAction("import-bindings");
    try {
      await apiPost("/api/me/haruki/bindings/import", { bindingIds: selectedAvailableBindings }, token);
      setSelectedAvailableBindings([]);
      await Promise.all([reloadProfile(), refreshConnection()]);
      setNotice("已将验证过的 UID 加入 pjsktools 账号。Web 与 Android 将读取同一份数据。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function openReview(binding: PlayerBinding) {
    beginAction(`review:${binding.id}`);
    try {
      const response = await apiPost<HarukiSyncReviewResponse>(`/api/me/player-bindings/${binding.id}/sync/review`, {}, token);
      if (response.noChange) {
        setNotice("Haruki 数据没有变化，当前快照已是最新。");
        await reloadProfile();
        return;
      }
      const result = normalizeReview(response);
      setReviewBinding(binding);
      setReview(result);
      setReviewChoices(Object.fromEntries(result.groups.map((group) => [group.kind, group.valid && !group.empty ? "update" : "keep"])));
      setCardChoice("update");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function confirmSync() {
    if (!reviewBinding || !review) return;
    beginAction(`confirm:${reviewBinding.id}`);
    try {
      const result = await apiPost<HarukiSyncResult>(
        `/api/me/player-bindings/${reviewBinding.id}/sync/confirm`,
        { reviewToken: review.reviewToken, groups: reviewChoices, cards: cardChoice },
        token
      );
      await reloadProfile();
      setReview(null);
      setReviewBinding(null);
      setNotice(`同步完成：${result.cardsUpdated ? "卡牌已更新" : "卡牌已保留"}，${result.updatedGroups.length} 个数据分组已更新。另一端刷新账号后即可读取相同数据。`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function safeSync(binding: PlayerBinding) {
    beginAction(`sync:${binding.id}`);
    try {
      const result = await apiPost<HarukiSyncResult>(`/api/me/player-bindings/${binding.id}/sync`, {}, token);
      await reloadProfile();
      setNotice(result.pendingEmptyGroups?.length
        ? `已更新安全分组；${result.pendingEmptyGroups.length} 个空分组等待人工确认。`
        : "安全同步完成，另一端刷新账号后即可读取相同数据。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function setDailySync(binding: PlayerBinding, enabled: boolean) {
    beginAction(`settings:${binding.id}`);
    try {
      await apiPatch(`/api/me/player-bindings/${binding.id}/sync-settings`, { autoSyncDaily: enabled }, token, { ifMatch: binding.version });
      await reloadProfile();
      setNotice(enabled ? "已开启每日自动同步。" : "已关闭每日自动同步。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function setDefaultBinding(binding: PlayerBinding) {
    beginAction(`default:${binding.id}`);
    try {
      await apiPatch(`/api/me/player-bindings/${binding.id}`, { isDefault: true }, token, { ifMatch: binding.version });
      await reloadProfile();
      setNotice("已设为默认玩家账号。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function deleteBinding(binding: PlayerBinding) {
    if (!window.confirm(`确定从 pjsktools 账号删除 ${binding.region.toUpperCase()} / ${binding.playerUid} 及其同步快照吗？`)) return;
    beginAction(`delete:${binding.id}`);
    try {
      await apiDelete(`/api/me/player-bindings/${binding.id}`, token, { ifMatch: binding.version });
      await Promise.all([reloadProfile(), refreshConnection()]);
      setNotice("已删除该玩家账号及其服务端快照。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  async function disconnect() {
    if (!window.confirm("确定断开 Haruki 吗？这会删除所有 Haruki 绑定、跨端玩家快照和同步设置。")) return;
    beginAction("disconnect");
    try {
      await apiDelete("/api/me/haruki/connection", token);
      await Promise.all([reloadProfile(), refreshConnection()]);
      setNotice("已断开 Haruki，并删除账号中的 Haruki 玩家数据。");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      endAction();
    }
  }

  return (
    <section className="haruki-center">
      <article className="panel wide haruki-hero">
        <div>
          <span className="eyebrow">玩家数据连接</span>
          <h2>连接 Haruki，在 Web 与 Android 共用玩家数据</h2>
          <p>数据来源和授权体验对齐 Moesekai。pjsktools 不要求上传抓包文件，也不提供游戏通信解析教程。</p>
        </div>
        <div className="button-row">
          <a className="button-link" href={HARUKI_HOME} target="_blank" rel="noreferrer">打开 Haruki 工具箱<ExternalLink size={15} /></a>
          <a className="button-link secondary" href={HARUKI_TOOLBOX} target="_blank" rel="noreferrer">数据来源说明<ExternalLink size={15} /></a>
        </div>
      </article>

      {(notice || error) && (
        <div className={`haruki-global-message ${error ? "error" : "success"}`} role="status">
          {error ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{error || notice}</span>
          <button type="button" className="secondary" onClick={() => { setError(""); setNotice(""); }}>关闭</button>
        </div>
      )}

      <div className="haruki-mode-grid">
        <article className="panel">
          <div className="panel-heading">
            <div><h2><Database size={20} />Public 临时查询</h2><p>只缓存到当前浏览器，不写入 pjsktools 账号，也不会同步到 Android。</p></div>
            <span className="status-pill">本机</span>
          </div>
          <div className="haruki-public-form">
            <label>区服
              <select value={publicForm.region} onChange={(event) => setPublicForm((current) => ({ ...current, region: event.target.value as HarukiRegion }))}>
                {harukiRegions.map((region) => <option key={region} value={region}>{regionLabels[region]} ({region.toUpperCase()})</option>)}
              </select>
            </label>
            <label>玩家 UID
              <input inputMode="numeric" value={publicForm.playerUid} onChange={(event) => setPublicForm((current) => ({ ...current, playerUid: event.target.value.replace(/\D/g, "") }))} placeholder="输入 Haruki 已收录的 UID" />
            </label>
            <button type="button" disabled={busyAction === "public" || !publicForm.playerUid} onClick={() => fetchPublic(publicForm.region, publicForm.playerUid)}>
              {busyAction === "public" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}查询并缓存
            </button>
          </div>
          <p className="haruki-help">请先在 Haruki 工具箱按其官方说明更新游戏数据，并为该 UID 开启 Public API。</p>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div><h2><Cloud size={20} />OAuth 跨端连接</h2><p>由 pjsktools 后端安全保存授权，玩家快照跟随 pjsktools 账号同步。</p></div>
            <span className={`status-pill ${connection.connected ? "" : "warning"}`}>{connection.connected ? "已连接" : "未连接"}</span>
          </div>
          {connectionLoading ? <p className="empty-state"><LoaderCircle className="spin" size={16} />正在读取连接状态...</p> : connection.connected ? (
            <>
              <div className="haruki-connection-summary">
                <ShieldCheck size={24} />
                <div><strong>Haruki 账号</strong><span>{connection.availableBindings.length} 个已授权玩家账号 · {connection.scope?.join(" / ") || "只读数据权限"}</span></div>
              </div>
              <div className="button-row">
                <button type="button" className="secondary" onClick={startOAuth} disabled={busyAction === "oauth-start"}><Link2 size={16} />重新授权</button>
                <button type="button" className="secondary danger-button" onClick={disconnect} disabled={busyAction === "disconnect"}><Unplug size={16} />断开连接</button>
              </div>
            </>
          ) : (
            <>
              <ul className="haruki-benefit-list">
                <li>验证 UID 所有权后保存规范化快照</li>
                <li>Web 与 Android 登录同一 pjsktools 账号即可共用</li>
                <li>Haruki token 不会发送给浏览器或 Android</li>
              </ul>
              <button type="button" onClick={startOAuth} disabled={busyAction === "oauth-start"}>
                {busyAction === "oauth-start" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}连接 Haruki
              </button>
            </>
          )}
        </article>
      </div>

      {publicCache.length > 0 && (
        <article className="panel wide">
          <div className="panel-heading"><div><h2>当前设备的 Public 缓存</h2><p>退出后不可见；不同 pjsktools 用户使用隔离的缓存空间。</p></div></div>
          <div className="haruki-public-list">
            {publicCache.map((item) => (
              <PublicPreviewCard
                key={item.cacheKey}
                item={item}
                busy={Boolean(busyAction)}
                onRefresh={(entry) => fetchPublic(entry.region, entry.playerUid)}
                onClear={clearPublic}
              />
            ))}
          </div>
        </article>
      )}

      {connection.connected && importableBindings.length > 0 && (
        <article className="panel wide">
          <div className="panel-heading">
            <div><h2>选择要跨端同步的 UID</h2><p>这里只显示 Haruki OAuth 返回且已验证的玩家账号。</p></div>
            <button type="button" disabled={!selectedAvailableBindings.length || busyAction === "import-bindings"} onClick={importBindings}>加入 pjsktools</button>
          </div>
          <div className="haruki-import-list">
            {importableBindings.map((binding) => (
              <label key={binding.id}>
                <input
                  type="checkbox"
                  checked={selectedAvailableBindings.includes(binding.id)}
                  onChange={(event) => setSelectedAvailableBindings((current) => event.target.checked ? [...current, binding.id] : current.filter((id) => id !== binding.id))}
                />
                <span><strong>{binding.displayName || binding.playerUid}</strong><small>{regionLabels[binding.region]} · {binding.playerUid}</small></span>
                <ShieldCheck size={18} />
              </label>
            ))}
          </div>
        </article>
      )}

      <article className="panel wide">
        <div className="panel-heading">
          <div><h2>已同步到 pjsktools 账号</h2><p>这些玩家快照保存在服务端，Web 与 Android 读取同一份版本。</p></div>
          {connection.connected && <button type="button" className="secondary" onClick={() => refreshConnection(true)}><RefreshCw size={16} />刷新连接</button>}
        </div>
        <div className="haruki-binding-list">
          {persistedBindings.map((binding) => {
            const summary = summaryFor(binding, summaries);
            const status = bindingStatus(binding);
            const actionBusy = busyAction.endsWith(`:${binding.id}`);
            return (
              <article className="haruki-binding-card" key={binding.id}>
                <div className="haruki-card-heading">
                  <div className="haruki-account-title">
                    <UserRound size={22} />
                    <div>
                      <strong>{binding.displayName || binding.publicProfileSnapshot?.nickname || binding.playerUid}</strong>
                      <span>{binding.region.toUpperCase()} · {binding.playerUid}{binding.isDefault ? " · 默认" : ""}</span>
                    </div>
                  </div>
                  <span className={`status-pill ${status.tone === "warning" ? "warning" : ""}`}>{status.label}</span>
                </div>
                <dl className="haruki-meta-grid">
                  <div><dt>Haruki 上传</dt><dd>{formatDate(binding.upstreamUploadedAt)}</dd></div>
                  <div><dt>同步成功</dt><dd>{formatDate(binding.lastSyncSucceededAt ?? binding.refreshedAt ?? binding.updatedAt)}</dd></div>
                  <div><dt>持有卡</dt><dd>{summary?.inventoryCount ?? 0}</dd></div>
                  <div><dt>数据分组</dt><dd>{summary?.completeness.uploadedPlayerDataKinds.length ?? 0}</dd></div>
                </dl>
                {binding.pendingEmptyGroups?.length ? <p className="haruki-inline-warning"><AlertTriangle size={16} />{binding.pendingEmptyGroups.length} 个空分组等待手动审核。</p> : null}
                <label className="haruki-auto-sync">
                  <input type="checkbox" checked={binding.autoSyncDaily === true} disabled={actionBusy} onChange={(event) => setDailySync(binding, event.target.checked)} />
                  <span><strong>每日自动同步</strong><small>默认关闭；自动同步不会清空已有数据。</small></span>
                </label>
                <div className="button-row">
                  <button type="button" disabled={actionBusy} onClick={() => openReview(binding)}><RefreshCw size={16} />审核并同步</button>
                  <button type="button" className="secondary" disabled={actionBusy} onClick={() => safeSync(binding)}>安全同步</button>
                  {!binding.isDefault && <button type="button" className="secondary" disabled={actionBusy} onClick={() => setDefaultBinding(binding)}>设为默认</button>}
                  <Link className="button-link secondary" to="/me/profile">查看数据摘要</Link>
                  <button type="button" className="secondary danger-button" disabled={actionBusy} onClick={() => deleteBinding(binding)}><Trash2 size={16} />删除</button>
                </div>
              </article>
            );
          })}
          {!persistedBindings.length && (
            <div className="haruki-empty-state">
              <Cloud size={32} />
              <strong>还没有跨端玩家数据</strong>
              <p>连接 Haruki OAuth 并选择经过验证的 UID 后，Web 与 Android 才会共享玩家快照。</p>
            </div>
          )}
        </div>
      </article>

      {review && reviewBinding && (
        <SyncReviewPanel
          review={review}
          choices={reviewChoices}
          cardChoice={cardChoice}
          busy={busyAction === `confirm:${reviewBinding.id}`}
          onChoice={(kind, choice) => setReviewChoices((current) => ({ ...current, [kind]: choice }))}
          onCardChoice={setCardChoice}
          onCancel={() => { setReview(null); setReviewBinding(null); }}
          onConfirm={confirmSync}
        />
      )}
    </section>
  );
}
