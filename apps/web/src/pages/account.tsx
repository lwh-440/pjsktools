import {
  Activity,
  AlertCircle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Download,
  HardDrive,
  Link2,
  LogOut,
  Loader2,
  LayoutGrid,
  LogIn,
  Mail,
  Shield,
  Upload,
  UserRound,
  Wand2
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { apiDelete, apiGet, apiPost } from "../api";
import { useAuth } from "../AuthContext";
import { PlayerProfileAnalysisView, type ProfileAnalysis } from "../components/PlayerProfileAnalysis";
import type { AuthResponse, AuthUser, BindingSummary, PlayerBinding, ToolContext } from "../accountTypes";
import type { Favorite, ScoreRecord } from "../sharedTypes";
import { parseQqCallback, safeQqReturnTo } from "../qqOAuth";
import { HARUKI_FEATURE_ENABLED } from "../features";
import { playerMissingDataLabels, playerToolLabel } from "../playerLabels";

function LegalConfirmations({ accepted, ageConfirmed, onAccepted, onAgeConfirmed }: {
  accepted: boolean;
  ageConfirmed: boolean;
  onAccepted: (value: boolean) => void;
  onAgeConfirmed: (value: boolean) => void;
}) {
  return <div className="legal-confirmations">
    <label className="legal-checkbox-label">
      <input type="checkbox" checked={accepted} onChange={(event) => onAccepted(event.target.checked)} />
      <span>我已阅读并同意 <Link to="/privacy" target="_blank">隐私政策</Link> 和 <Link to="/terms" target="_blank">用户协议</Link></span>
    </label>
    <label className="legal-checkbox-label">
      <input type="checkbox" checked={ageConfirmed} onChange={(event) => onAgeConfirmed(event.target.checked)} />
      <span>我确认已满 14 周岁</span>
    </label>
  </div>;
}

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
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();
  const current = bindings.find((binding) => binding.id === value) ?? bindings[0];
  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  const snapshot = current?.publicProfileSnapshot ?? summaries.find((item) => item.binding.id === current?.id)?.publicProfileSnapshot ?? {};
  const avatar = snapshot.avatarUrl ?? snapshot.userProfile?.twitterProfileImageUrl ?? snapshot.leaderCardImageUrl;
  return <div className="binding-select" ref={containerRef} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); }
  }}>
    <button type="button" className="binding-select-trigger" ref={triggerRef} aria-expanded={open} aria-controls={optionsId} onClick={() => setOpen((current) => !current)}>
      {avatar ? <img src={avatar} alt="" /> : <UserRound size={20} aria-hidden="true" />}
      <span><strong>{current?.displayName || snapshot.nickname || snapshot.name || current?.playerUid || "选择玩家"}</strong><small>{current ? `${current.region.toUpperCase()} · UID ${current.playerUid}` : "暂无绑定玩家"}</small></span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div className="binding-selector-strip" id={optionsId} role="group" aria-label="选择绑定玩家">{bindings.map((binding) => {
    const summary = summaries.find((item) => item.binding.id === binding.id);
    const snapshot = binding.publicProfileSnapshot ?? summary?.publicProfileSnapshot ?? {};
    const avatar = snapshot.avatarUrl ?? snapshot.userProfile?.twitterProfileImageUrl ?? snapshot.leaderCardImageUrl;
    return <button type="button" key={binding.id} aria-pressed={value === binding.id} className={value === binding.id ? "active" : "secondary"} onClick={() => { onChange(binding.id); setOpen(false); triggerRef.current?.focus(); }}>
      {avatar ? <img src={avatar} alt="" /> : <UserRound size={20} />}
      <span><strong>{binding.displayName || snapshot.nickname || snapshot.name || binding.playerUid}</strong><small>{binding.region.toUpperCase()} · UID {binding.playerUid}</small><small>Rank {snapshot.rank ?? "-"} · 库存 {summary?.inventoryCount ?? 0} · {binding.isDefault ? "默认 · " : ""}{formatDate(binding.refreshedAt ?? binding.updatedAt)}</small></span>
    </button>;
  })}</div>}
  </div>;
}

function ToolContextPanel({ context, decorated = false }: { context: ToolContext | null; decorated?: boolean }) {
  const tools = context?.toolAvailability ? Object.entries(context.toolAvailability) : [];
  const impact = context?.formulaImpact ? Object.entries(context.formulaImpact) : [];
  return (
    <article className="panel wide tool-context-panel">
      <div className="panel-heading">
        <div>
          <h2>{decorated && <span className="me-section-badge me-section-badge-status"><Activity size={15} aria-hidden="true" /></span>}工具可用状态</h2>
          {!decorated && <p>根据当前绑定玩家的已同步数据，检查各项工具是否可用。</p>}
        </div>
        {!decorated && context?.sharedFormulaVersion && <span className="status-pill">公式 {context.sharedFormulaVersion}</span>}
        {decorated && context && <span className="status-pill">{tools.every(([, state]) => state.ready) ? "资料已就绪" : "部分待同步"}</span>}
      </div>
      {context ? (
        <>
          <div className="compact-list">
            {tools.map(([name, state]) => (
              <div key={name}>
                <span><CheckCircle2 size={15} aria-hidden="true" /> {decorated ? playerToolLabel(name) : name}</span>
                <strong>{decorated ? state.ready ? "可用" : "待同步" : sectionReadyLabel(state.ready)}</strong>
                {(!decorated || state.missingFields.length > 0) && <small>{decorated ? `待同步：${playerMissingDataLabels(state.missingFields).join("、")}` : state.missingFields.length ? state.missingFields.join(" / ") : "基础输入已满足"}</small>}
              </div>
            ))}
          </div>
          {!decorated && <details>
            <summary>资产如何影响工具</summary>
            <div className="compact-list">
              {impact.map(([name, desc]) => <div key={name}><span>{name}</span><small>{String(desc)}</small></div>)}
            </div>
          </details>}
        </>
      ) : <p className="empty-state">{HARUKI_FEATURE_ENABLED ? "连接玩家数据并同步 UID 后可查看工具可用状态。" : "玩家数据连接功能暂未开放。"}</p>}
    </article>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, legalAcceptanceRequired } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  if (legalAcceptanceRequired && location.pathname !== "/legal-acceptance") return <Navigate to="/legal-acceptance" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return children;
}

export function LegalAcceptancePage() {
  const { isAuthenticated, legalAcceptanceRequired, acceptLegal, logout } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const from = safeQqReturnTo((location.state as { from?: string } | null)?.from ?? "/me");
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!legalAcceptanceRequired) return <Navigate to={from} replace />;
  async function submit() {
    if (!accepted || !ageConfirmed) return;
    try { await acceptLegal(); navigate(from, { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "确认失败，请稍后重试。"); }
  }
  return <section className="auth-page"><article className="panel auth-panel">
    <h2>请确认最新协议</h2>
    <p>继续使用账号服务前，请阅读当前隐私政策和用户协议。本确认不会要求生日、身份证等额外资料。</p>
    <LegalConfirmations accepted={accepted} ageConfirmed={ageConfirmed} onAccepted={setAccepted} onAgeConfirmed={setAgeConfirmed} />
    <button type="button" disabled={!accepted || !ageConfirmed} onClick={submit}>确认并继续</button>
    <button type="button" className="btn-secondary" onClick={logout}>不同意并退出</button>
    {error && <p className="warning-text">{error}</p>}
  </article></section>;
}

export function LoginPage() {
  const { login, isAuthenticated, legalAcceptanceRequired } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const returnTo = new URLSearchParams(location.search).get("returnTo");
  const from = safeQqReturnTo(returnTo ?? (location.state as { from?: string } | null)?.from);

  function validateEmail(value: string) {
    if (!value.trim()) {
      setEmailError("请输入邮箱");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("请输入有效的邮箱地址");
      return false;
    }
    setEmailError("");
    return true;
  }

  async function submitLogin() {
    setError("");
    setNotice("");

    if (!validateEmail(email)) return;
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }

    setLoading(true);
    try {
      const acceptanceRequired = await login(email, password);
      if (acceptanceRequired) navigate("/legal-acceptance", { replace: true, state: { from } });
      else navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查邮箱和密码");
    } finally {
      setLoading(false);
    }
  }

  async function startQqLogin() {
    try {
      setNotice("正在前往 QQ 安全登录...");
      setError("");
      const result = await apiGet<{ authorizeUrl: string }>(`/api/auth/qq/start?redirectTo=${encodeURIComponent(from)}`);
      window.location.href = result.authorizeUrl;
    } catch (error) {
      setNotice("");
      setError(error instanceof Error && error.message.includes("not configured")
        ? "QQ 登录暂未配置，请使用邮箱登录。"
        : "暂时无法连接 QQ 登录服务，请稍后重试。");
    }
  }

  if (isAuthenticated) {
    return <Navigate
      to={legalAcceptanceRequired ? "/legal-acceptance" : from}
      replace
      state={legalAcceptanceRequired ? { from } : undefined}
    />;
  }

  return (
    <section className="auth-page auth-compact-page">
      <form className="panel auth-panel" noValidate onSubmit={(event) => { event.preventDefault(); if (!loading) void submitLogin(); }}>
        <header className="auth-panel-header">
          <span className="account-section-kicker"><UserRound size={14} />工具台账号</span>
          <h1>登录账号</h1>
          <p>使用邮箱密码或 QQ 登录。</p>
        </header>

        <div className="form-group">
          <label htmlFor="email">
            <Mail size={16} />
            邮箱地址
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) validateEmail(event.target.value);
            }}
            onBlur={() => validateEmail(email)}
            placeholder="your@email.com"
            className={emailError ? "input-error" : ""}
            disabled={loading}
          />
          {emailError && <span className="field-error"><AlertCircle size={14} />{emailError}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="password">
            <Shield size={16} />
            密码
          </label>
          <div className="password-input-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入密码"
              disabled={loading}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              disabled={loading}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !email.trim() || !password.trim()}
          className="primary-button"
        >
          {loading ? <><Loader2 size={16} className="spinner" />登录中...</> : <><LogIn size={16} />登录</>}
        </button>

        <div className="auth-divider"><span>其他登录方式</span></div>

        <button
          type="button"
          className="qq-login-button"
          onClick={startQqLogin}
          aria-label="使用 QQ 登录"
          disabled={loading}
        >
          <span className="qq-brand-mark" aria-hidden="true"><img src="/assets/tencent-qq.svg" width="20" height="20" alt="" /></span>
          <span>使用 QQ 登录</span>
        </button>

        {notice && <div className="notice-box info"><CheckCircle2 size={16} />{notice}</div>}
        {error && <div className="notice-box error"><AlertCircle size={16} />{error}</div>}

        <div className="auth-footer">
          <span>还没有账号？</span><Link to="/register">注册新账号</Link>
        </div>
      </form>
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
        const acceptanceRequired = await completeOAuthLoginRef.current(auth);
        if (acceptanceRequired) {
          navigate("/legal-acceptance", { replace: true, state: { from: callback.returnTo } });
          return;
        }
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setResendSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  function validateEmail(value: string) {
    if (!value.trim()) {
      setEmailError("请输入邮箱");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("请输入有效的邮箱地址");
      return false;
    }
    setEmailError("");
    return true;
  }

  function validatePassword(value: string) {
    if (value.length < 10) {
      setPasswordError("密码至少需要 10 位");
      return false;
    }

    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);

    if (value.length < 14) {
      const categories = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      if (categories < 4) {
        setPasswordError("10-13 位密码需包含大写、小写、数字和符号");
        return false;
      }
    } else {
      const categories = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;
      if (categories < 3) {
        setPasswordError("14 位以上密码需包含至少三类字符");
        return false;
      }
    }

    const emailPrefix = email.split("@")[0];
    if (emailPrefix && value.toLowerCase().includes(emailPrefix.toLowerCase())) {
      setPasswordError("密码不能包含邮箱名前缀");
      return false;
    }

    setPasswordError("");
    return true;
  }

  async function requestCode() {
    if (!validateEmail(email)) return;

    setSendingCode(true);
    setError("");
    setNotice("");

    try {
      const result = await apiPost<{ devCode?: string; sent: boolean; expiresIn: number; resendAfter: number }>("/api/auth/email-code/start", { email, purpose: "register" });
      setResendSeconds(result.resendAfter);
      setNotice(result.devCode ? `开发验证码：${result.devCode}，${Math.floor(result.expiresIn / 60)} 分钟内有效。` : `验证码已发送至 ${email}，${Math.floor(result.expiresIn / 60)} 分钟内有效。`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "验证码发送失败，请稍后重试。");
    } finally {
      setSendingCode(false);
    }
  }

  async function submitRegister() {
    setError("");
    setNotice("");

    if (!validateEmail(email)) return;
    if (!validatePassword(password)) return;

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (!accepted || !ageConfirmed) {
      setError("请先同意隐私政策和用户协议，并确认已满 14 周岁");
      return;
    }

    if (code.length !== 6) {
      setError("请输入 6 位验证码");
      return;
    }

    setRegistering(true);
    try {
      await register(email, password, code);
      navigate("/me");
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "注册失败，请检查填写内容。");
    } finally {
      setRegistering(false);
    }
  }

  if (isAuthenticated) return <Navigate to="/me" replace />;

  const isFormValid = email.trim() && password && confirmPassword && password === confirmPassword && code.length === 6 && accepted && ageConfirmed && !emailError && !passwordError;

  return (
    <section className="auth-page auth-compact-page">
      <form className="panel auth-panel" noValidate onSubmit={(event) => { event.preventDefault(); if (!registering && !sendingCode) void submitRegister(); }}>
        <header className="auth-panel-header">
          <span className="account-section-kicker"><UserRound size={14} />工具台账号</span>
          <h1>注册新账号</h1>
          <p>使用邮箱创建账号，同步收藏与成绩。</p>
        </header>

        <div className="form-group">
          <label htmlFor="email">
            <Mail size={16} />
            邮箱地址
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) validateEmail(event.target.value);
            }}
            onBlur={() => validateEmail(email)}
            placeholder="your@email.com"
            className={emailError ? "input-error" : ""}
            disabled={registering || sendingCode}
          />
          {emailError && <span className="field-error"><AlertCircle size={14} />{emailError}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="password">
            <Shield size={16} />
            密码
          </label>
          <div className="password-input-wrapper">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (passwordError) validatePassword(event.target.value);
              }}
              onBlur={() => password && validatePassword(password)}
              placeholder="创建安全密码"
              disabled={registering || sendingCode}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              disabled={registering || sendingCode}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {passwordError && <span className="field-error"><AlertCircle size={14} />{passwordError}</span>}
          <small className="field-hint">密码至少 10 位，并包含大写字母、小写字母、数字和符号；14 位以上至少包含其中三类。</small>
        </div>

        <div className="form-group">
          <label htmlFor="confirmPassword">
            <Shield size={16} />
            确认密码
          </label>
          <div className="password-input-wrapper">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="再次输入密码"
              disabled={registering || sendingCode}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}
              disabled={registering || sendingCode}
            >
              {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {confirmPassword && password !== confirmPassword && <span className="field-error"><AlertCircle size={14} />两次密码不一致</span>}
        </div>

        <LegalConfirmations accepted={accepted} ageConfirmed={ageConfirmed} onAccepted={setAccepted} onAgeConfirmed={setAgeConfirmed} />

        <div className="verification-code-group">
          <div className="form-group code-input-group">
            <label htmlFor="code">验证码</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6 位验证码"
              maxLength={6}
              disabled={registering || sendingCode}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            disabled={sendingCode || resendSeconds > 0 || !email.trim() || emailError !== ""}
            onClick={requestCode}
          >
            {sendingCode ? <><Loader2 size={16} className="spinner" />发送中...</> : resendSeconds > 0 ? `${resendSeconds}s 后重发` : "获取验证码"}
          </button>
        </div>

        <button
          type="submit"
          disabled={!isFormValid || registering}
          className="primary-button"
        >
          {registering ? <><Loader2 size={16} className="spinner" />注册中...</> : "注册账号"}
        </button>

        {notice && <div className="notice-box info"><CheckCircle2 size={16} />{notice}</div>}
        {error && <div className="notice-box error"><AlertCircle size={16} />{error}</div>}

        <div className="auth-footer">
          <span>已有账号？</span><Link to="/login">前往登录</Link>
        </div>
      </form>
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
  { to: "/me/favorites", title: "我的收藏", icon: Bookmark, tone: "favorites", desc: "创建收藏夹、查看未分类项目，并批量整理图鉴收藏。" },
  { to: "/me/profile", title: "玩家档案", icon: UserRound, tone: "profile", desc: "查看角色成长、挑战、羁绊与综合力加成。" },
  ...(HARUKI_FEATURE_ENABLED ? [{ to: "/me/assets", title: "玩家数据连接", icon: Upload, tone: "assets", desc: "连接经过验证的玩家数据，并在 Web 与 Android 共用。" }] : []),
  { to: "/me/deck", title: "绑定组卡", icon: Wand2, tone: "deck", desc: "使用当前 UID 的已同步玩家快照运行组卡推荐。" },
  { to: "/me/scores", title: "收藏与成绩", icon: Bookmark, tone: "scores", desc: "维护歌曲成绩和收藏。" }
];

export function MeProfileAnalysisPage() {
  const { token, meProfile } = useAuth();
  const { selectedBinding, selectedBindingId, setSelectedBindingId } = useSelectedBinding();
  const [analysis, setAnalysis] = useState<ProfileAnalysis | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!selectedBinding) { setAnalysis(null); return; }
    let active = true;
    setError("");
    apiGet<ProfileAnalysis>(`/api/me/player-bindings/${selectedBinding.id}/profile-analysis`, token).then((result) => { if (active) setAnalysis(result); }).catch((reason) => { if (active) { setAnalysis(null); setError(reason instanceof Error ? reason.message : String(reason)); } });
    return () => { active = false; };
  }, [selectedBinding?.id, token]);
  if (!meProfile?.bindings.length) return <section className="profile-analysis-page"><article className="panel profile-analysis-empty"><span className="account-section-kicker"><UserRound size={14} />玩家数据</span><h1>玩家档案分析</h1><p className="empty-state">{HARUKI_FEATURE_ENABLED ? "请先连接并同步经过验证的 UID。" : "玩家数据连接功能暂未开放。"}</p><div className="button-row">{HARUKI_FEATURE_ENABLED && <Link className="button-link" to="/me/assets">连接玩家数据</Link>}<Link className="button-link" to="/me">返回个人信息管理</Link></div></article></section>;
  return <section className="profile-analysis-page"><article className="panel profile-account-bar"><div><strong>玩家档案分析</strong><span>使用当前 pjsktools 账号中已有的玩家快照。</span></div><BindingSelect value={selectedBindingId} onChange={setSelectedBindingId} bindings={meProfile.bindings} summaries={meProfile.bindingSummaries} /></article>{error && <p className="warning-text">{error}</p>}{analysis && <div hidden={analysis.binding.id !== selectedBinding?.id}><PlayerProfileAnalysisView analysis={analysis} /></div>}{(!analysis || analysis.binding.id !== selectedBinding?.id) && !error && <p className="empty-state">正在汇总玩家数据...</p>}</section>;
}

export function MeHomePage() {
  const { token, meProfile, logout, reloadProfile } = useAuth();
  const location = useLocation();
  const { selectedBinding, selectedSummary } = useSelectedBinding();
  const toolContext = useToolContext(selectedBinding);
  const missing = toolContext?.toolContextWarnings ?? [];
  const [deletionCode, setDeletionCode] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const [accountError, setAccountError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);

  useEffect(() => {
    const handoff = new URLSearchParams(location.search).get("qqDeleteHandoff");
    const deletionError = new URLSearchParams(location.search).get("qqDeleteError");
    if (deletionError) {
      window.history.replaceState({}, "", "/me");
      setAccountError(deletionError === "qq_authorization_cancelled"
        ? "已取消 QQ 注销身份验证，账号不会被删除。"
        : deletionError === "qq_account_mismatch"
          ? "授权的 QQ 与当前账号不一致，账号不会被删除。"
          : "QQ 注销身份验证未完成，请稍后重试。");
      return;
    }
    if (!handoff || !token) return;
    window.history.replaceState({}, "", "/me");
    apiPost<{ token: string }>("/api/me/account-deletion/qq/exchange", { handoff }, token)
      .then(async (intent) => {
        if (!window.confirm("QQ 身份已重新验证。再次确认将永久注销账号并删除账号数据，是否继续？")) return;
        await apiPost("/api/me/account-deletion/confirm", { token: intent.token }, token);
        await logout();
        window.location.href = "/";
      })
      .catch((error) => setAccountError(error instanceof Error ? error.message : "QQ 重新验证失败"));
  }, [location.search, token, logout]);

  async function exportMyData() {
    setBusy(true);
    setAccountError("");
    try {
      const data = await apiGet<unknown>("/api/me/export", token);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sekai-tools-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setAccountNotice("个人数据导出已开始下载。");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkQq() {
    if (!window.confirm("解除 QQ 关联后，将不能再使用 QQ 登录。确定继续？")) return;
    try {
      await apiDelete("/api/auth/qq/link", token);
      await reloadProfile();
      setAccountNotice("QQ 关联已解除。");
      setAccountError("");
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "解除失败");
    }
  }

  function clearLocalCache() {
    for (const key of Object.keys(localStorage)) {
      if (key === "pjsktools-token") continue;
      if (key.startsWith("pjsktools-") || key.startsWith("pjsktools:")) localStorage.removeItem(key);
    }
    if ("caches" in window) caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    setAccountNotice("本地缓存已清除，当前登录保持有效。");
    setAccountError("");
  }

  async function beginDeletion() {
    setAccountError("");
    try {
      if (meProfile?.user.email) {
        await apiPost("/api/me/account-deletion/email-code", {}, token);
        setAccountNotice("注销验证码已发送，请在下方输入。验证码 5 分钟内有效，60 秒内不能重复发送。");
        return;
      }
      const result = await apiGet<{ authorizeUrl: string }>("/api/me/account-deletion/qq/start", token);
      window.location.href = result.authorizeUrl;
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "开始注销失败");
    }
  }

  async function confirmDeletion() {
    if (!/^\d{6}$/.test(deletionCode)) {
      setAccountError("请输入 6 位注销验证码。");
      return;
    }
    if (!window.confirm("此操作不可撤销。账号、会话、绑定、收藏、成绩、卡组和玩家快照将被删除。确定注销？")) return;
    try {
      const intent = await apiPost<{ token: string }>("/api/me/account-deletion/intent", { confirmation: "DELETE", code: deletionCode }, token);
      await apiPost("/api/me/account-deletion/confirm", { token: intent.token }, token);
      await logout();
      window.location.href = "/";
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "注销失败");
    }
  }

  const hasQqLinked = meProfile?.oauthAccounts.some((account) => account.provider === "qq");

  return (
    <section className="account-workspace me-home-page">
      <header className="me-page-heading"><h1>个人信息管理</h1><p>管理账号、玩家数据与隐私设置</p></header>
      <article className="panel account-overview">
        <div className="account-header-card">
          <div className="account-header-content">
            <div className="account-avatar">
              <UserRound size={32} />
            </div>
            <div className="account-header-info">
              <h2>{meProfile?.user.nickname || meProfile?.user.email || "用户"}</h2>
              <p className="account-email">{meProfile?.user.email || "QQ 登录用户"}</p>
            </div>
          </div>
        </div>

        <div className="account-summary-grid">
          <div className="summary-item">
            <span className="summary-label">当前玩家</span>
            <strong className="summary-value">{selectedBinding?.displayName || selectedBinding?.publicProfileSnapshot?.nickname || selectedBinding?.playerUid || "未绑定"}</strong>
            <small className="summary-meta">{selectedBinding ? `${selectedBinding.region.toUpperCase()} · UID ${selectedBinding.playerUid}` : "尚未绑定玩家"}</small>
          </div>
          <div className="summary-item">
            <span className="summary-label">库存</span>
            <strong className="summary-value">{toolContext?.inventoryCount ?? selectedSummary?.inventoryCount ?? 0}</strong>
          </div>
          <div className="summary-item">
            <span className="summary-label">资产类型</span>
            <strong className="summary-value">{toolContext?.playerDataKinds.length ?? selectedSummary?.completeness.uploadedPlayerDataKinds.length ?? 0}</strong>
          </div>
        </div>
      </article>

      {missing.length > 0 && (
        <article className="panel wide me-sync-notice">
          <AlertCircle size={16} aria-hidden="true" /><p>待同步：{playerMissingDataLabels(missing).join("、")}</p>
          {HARUKI_FEATURE_ENABLED && <Link to="/me/assets">同步数据</Link>}
        </article>
      )}

      <article className="panel me-services-panel">
        <div className="panel-heading">
          <h2><span className="me-section-badge me-section-badge-tools"><LayoutGrid size={15} aria-hidden="true" /></span>工具与服务</h2>
          <p>管理你的收藏、档案和玩家数据</p>
        </div>
        <div className="tool-grid me-tool-grid">
          {meTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link className={`tool-card me-tool-${tool.tone}`} key={tool.to} to={tool.to}>
                <span className="tool-icon">
                  <Icon size={22} />
                </span>
                <strong>{tool.title}</strong>
                <small>{tool.desc}</small>
              </Link>
            );
          })}
        </div>
        <ToolContextPanel context={toolContext} decorated />
      </article>
      <div className="me-content-grid">
      <article className="panel account-rights-panel">
        <div className="panel-heading">
          <div>
            <h2><span className="me-section-badge me-section-badge-privacy"><Shield size={15} aria-hidden="true" /></span>隐私与账号权利</h2>
          </div>
        </div>

        <div className="account-setting-rows">
          <div><span><Download size={16} aria-hidden="true" />个人数据</span>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={exportMyData}
          >
            {busy ? <><Loader2 size={16} className="spinner" />导出中...</> : "导出 JSON"}
          </button></div>
          {hasQqLinked && meProfile?.user.email && (
            <div><span><Link2 size={16} aria-hidden="true" />QQ 关联</span><button type="button" className="btn-secondary" onClick={unlinkQq}>解除关联</button></div>
          )}
          <div><span><HardDrive size={16} aria-hidden="true" />设备缓存</span><button type="button" className="btn-secondary" onClick={clearLocalCache}>清除缓存</button></div>
          <div><span><LogOut size={16} aria-hidden="true" />当前会话</span><button type="button" className="secondary" onClick={logout}>退出登录</button></div>
        </div>

        <div className="danger-zone">
          <button
            type="button"
            className="danger-zone-toggle"
            aria-expanded={showDangerZone}
            onClick={() => setShowDangerZone(!showDangerZone)}
          >
            <AlertCircle size={16} />
            {showDangerZone ? "隐藏危险操作" : "显示危险操作"}
          </button>

          {showDangerZone && (
            <div className="danger-zone-content">
              <div className="danger-zone-warning">
                <AlertCircle size={20} />
                <div>
                  <strong>注销账号</strong>
                  <p>此操作不可撤销。账号、会话、绑定、收藏、成绩、卡组和玩家快照将被永久删除。</p>
                </div>
              </div>

              <button type="button" className="danger" onClick={beginDeletion}>
                开始注销账号
              </button>

              {meProfile?.user.email && (
                <div className="deletion-confirm-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={deletionCode}
                    onChange={(event) => setDeletionCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="输入注销验证码"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="danger"
                    disabled={deletionCode.length !== 6}
                    onClick={confirmDeletion}
                  >
                    永久注销
                  </button>
                </div>
              )}

              <p className="helper-text">纯 QQ 账号注销会先跳转 QQ 重新授权；邮箱账号使用一次性验证码重新验证。</p>
            </div>
          )}
        </div>

        {accountNotice && <div className="notice-box success"><CheckCircle2 size={16} />{accountNotice}</div>}
        {accountError && <div className="notice-box error"><AlertCircle size={16} />{accountError}</div>}
      </article>
      </div>
    </section>
  );
}

export function BoundDeckPage({ eventId }: { eventId?: string }) {
  const { token, meProfile } = useAuth();
  const { selectedBinding: defaultBinding } = useSelectedBinding();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedBindingId = params.get("bindingId");
  const selectedBinding = requestedBindingId ? meProfile?.bindings.find((binding) => binding.id === requestedBindingId) : defaultBinding;
  const selectedAreaItemIds = useMemo(() => params.get("areaSelection") === "selected" ? [...new Set(params.getAll("areaItemId"))] : undefined, [params]);
  const toolContext = useToolContext(selectedBinding);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [calculating, setCalculating] = useState(false);
  const calculationKey = `${selectedBinding?.id ?? ""}:${location.search}:${eventId ?? ""}`;
  const calculationKeyRef = useRef(calculationKey);
  calculationKeyRef.current = calculationKey;
  useEffect(() => { setResult(null); setError(""); setCalculating(false); }, [calculationKey]);
  async function calculate() {
    if (!selectedBinding) return;
    const requestKey = calculationKey;
    setCalculating(true); setError(""); setResult(null);
    try {
      const next = await apiPost("/api/me/tools/deck-recommend", { region: selectedBinding.region, bindingId: selectedBinding.id, eventId, ...(selectedAreaItemIds !== undefined ? { selectedAreaItemIds } : {}) }, token);
      if (calculationKeyRef.current === requestKey) setResult(next);
    } catch (reason) { if (calculationKeyRef.current === requestKey) setError(reason instanceof Error ? reason.message : "组卡暂不可用，请重试。"); }
    finally { if (calculationKeyRef.current === requestKey) setCalculating(false); }
  }
  const cards = useMemo(() => result?.recommendedCards ?? result?.recommendedDecks?.[0]?.cards ?? [], [result]);
  return (
    <section className="grid">
      <article className="panel"><h2>绑定数据组卡</h2><p className="warning-text">使用绑定玩家最近同步的库存与加成计算。</p>{selectedAreaItemIds !== undefined && <p>本次仅使用所选 {selectedAreaItemIds.length} 件区域道具的当前等级加成；{selectedAreaItemIds.length ? "其他区域道具不参与计算" : "不使用区域道具加成"}。不会升级道具或修改库存。</p>}<button type="button" disabled={!selectedBinding || calculating} onClick={calculate}><Wand2 size={16} />{calculating ? "正在推荐…" : "开始推荐"}</button>{selectedBinding ? <p className="empty-state">当前 UID：{selectedBinding.region.toUpperCase()} / {selectedBinding.playerUid}</p> : <p className="warning-text">指定的绑定玩家不存在，请返回档案重新选择。</p>}{error && <p role="alert" className="warning-text">{error}</p>}{result?.appliedAreaItemSelection && <p>已按所选 {result.appliedAreaItemSelection.ids.length} 件区域道具的当前等级完成计算。</p>}</article>
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
