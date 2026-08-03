import {
  Bookmark,
  CheckCircle2,
  LogIn,
  Upload,
  UserRound,
  Wand2
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { useAuth } from "../AuthContext";
import { PlayerProfileAnalysisView, type ProfileAnalysis } from "../components/PlayerProfileAnalysis";
import type { AuthResponse, AuthUser, BindingSummary, PlayerBinding, ToolContext } from "../accountTypes";
import type { Favorite, ScoreRecord } from "../sharedTypes";
import { parseQqCallback, QQ_CONNECT_BUTTON_URL, safeQqReturnTo } from "../qqOAuth";

function formatDate(value?: string) {
  if (!value) return "-";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(time);
}

function sectionReadyLabel(ready?: boolean) {
  return ready ? "可用" : "待补充";
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
          <p>参考 Moesekai AccountSelector 的账号上下文：用当前绑定 UID 的跨端玩家快照计算工具就绪度。</p>
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
      ) : <p className="empty-state">连接 Haruki 并同步 UID 后可查看工具可用状态。</p>}
    </article>
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
  const from = safeQqReturnTo(returnTo ?? (location.state as { from?: string } | null)?.from);
  async function submitLogin() {
    await login(email, password);
    navigate(from, { replace: true });
  }
  async function startQqLogin() {
    try {
      setNotice("正在前往 QQ 安全登录...");
      const result = await apiGet<{ authorizeUrl: string }>(`/api/auth/qq/start?redirectTo=${encodeURIComponent(from)}`);
      window.location.href = result.authorizeUrl;
    } catch (error) {
      setNotice(error instanceof Error && error.message.includes("not configured")
        ? "QQ 登录暂未配置，请使用邮箱登录。"
        : "暂时无法连接 QQ 登录服务，请稍后重试。");
    }
  }
  if (isAuthenticated) return <Navigate to={from} replace />;
  return (
    <section className="auth-page">
      <article className="auth-hero"><span>Project Sekai 工具箱账号</span><h2>登录后连接 Haruki 玩家数据</h2><p>通过 Haruki OAuth 验证 UID 后，Web 与 Android 可共用规范化玩家快照。</p></article>
      <article className="panel auth-panel">
        <h2>邮箱登录</h2>
        <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱" />
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
        <button type="button" onClick={submitLogin}><LogIn size={16} />登录</button>
        <div className="auth-divider"><span>或</span></div>
        <button type="button" className="qq-login-button" onClick={startQqLogin} aria-label="使用 QQ 登录">
          <img src={QQ_CONNECT_BUTTON_URL} alt="QQ 登录" />
        </button>
        {notice && <p className="empty-state">{notice}</p>}
        <Link to="/register">还没有账号？去注册</Link>
      </article>
    </section>
  );
}

export function QqCallbackPage() {
  const { completeOAuthLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const callback = useMemo(() => parseQqCallback(location.search), [location.search]);
  const exchangeStarted = useRef(false);
  const completeOAuthLoginRef = useRef(completeOAuthLogin);
  completeOAuthLoginRef.current = completeOAuthLogin;
  const [status, setStatus] = useState<"working" | "success" | "error">(callback.status === "error" ? "error" : "working");
  const [message, setMessage] = useState(callback.status === "error" ? callback.message : "正在完成 QQ 登录，请稍候...");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    if (callback.status === "error" || exchangeStarted.current) return;
    exchangeStarted.current = true;
    window.history.replaceState({}, "", "/auth/qq/callback");
    apiPost<AuthResponse>("/api/auth/qq/web-exchange", { handoff: callback.handoff })
      .then(async (auth) => {
        await completeOAuthLoginRef.current(auth);
        setUser(auth.user);
        setStatus("success");
        setMessage(`QQ 登录成功，欢迎 ${auth.user.nickname ?? "回来"}！`);
        window.setTimeout(() => navigate(callback.returnTo, { replace: true }), 2500);
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error instanceof Error && error.message.toLowerCase().includes("expired")
          ? "QQ 登录凭据已过期或已使用，请从登录页重新发起。"
          : "QQ 登录未完成，请返回登录页重试。");
      });
  }, [callback, navigate]);

  return (
    <section className="auth-page qq-callback-page">
      <article className={`panel auth-panel qq-callback-card ${status}`} aria-live="polite">
        {user?.avatarUrl
          ? <img className="qq-user-avatar" src={user.avatarUrl} alt={`${user.nickname ?? "QQ 用户"}的头像`} />
          : <UserRound className="qq-callback-icon" size={52} />}
        <h2>{status === "working" ? "正在登录" : status === "success" ? "登录成功" : "登录未完成"}</h2>
        <p>{message}</p>
        {status === "success" && <button type="button" onClick={() => navigate(callback.returnTo, { replace: true })}>立即继续</button>}
        {status === "error" && <Link className="button-link" to={`/login?returnTo=${encodeURIComponent(callback.returnTo)}`}>返回登录页</Link>}
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
      <article className="auth-hero"><span>创建账号</span><h2>跨端共用玩家数据和工具上下文</h2><p>注册后可通过 Haruki OAuth 连接多个已验证 UID，并在 Web 与 Android 共用玩家快照。</p></article>
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
  { to: "/me/assets", title: "玩家数据连接", icon: Upload, desc: "通过 Haruki Public 或 OAuth 连接玩家数据，并在 Web 与 Android 共用。" },
  { to: "/me/deck", title: "绑定组卡", icon: Wand2, desc: "使用当前 UID 的已同步玩家快照运行组卡推荐。" },
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
  if (!meProfile?.bindings.length) return <article className="panel"><h2>玩家档案</h2><p className="empty-state">请先连接 Haruki 并同步经过验证的 UID。</p><Link className="button-link" to="/me/assets">连接玩家数据</Link></article>;
  return <section className="profile-analysis-page"><article className="panel profile-account-bar"><div><strong>玩家档案分析</strong><span>使用当前 pjsktools 账号中由 Haruki OAuth 验证并跨端同步的玩家快照。</span></div><BindingSelect value={selectedBindingId} onChange={setSelectedBindingId} bindings={meProfile.bindings} summaries={meProfile.bindingSummaries} /></article>{error && <p className="warning-text">{error}</p>}{analysis ? <PlayerProfileAnalysisView analysis={analysis} /> : !error && <p className="empty-state">正在汇总玩家数据...</p>}</section>;
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
      {missing.length > 0 && <article className="panel wide"><div className="panel-heading"><div><h2>建议更新的玩家数据</h2><p>这些字段会影响工具结果精度。</p></div><Link className="button-link" to="/me/assets">同步玩家数据</Link></div><div className="tag-row">{missing.slice(0, 12).map((item) => <span key={item}>{item}</span>)}</div></article>}
      <ToolContextPanel context={toolContext} />
      <div className="tool-grid me-tool-grid">{meTools.map((tool) => { const Icon = tool.icon; return <Link className="tool-card" key={tool.to} to={tool.to}><span className="tool-icon"><Icon size={22} /></span><strong>{tool.title}</strong><small>{tool.desc}</small></Link>; })}</div>
      <button type="button" className="secondary logout-button" onClick={logout}>退出登录</button>
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
