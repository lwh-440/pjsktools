import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "./api";
import type { AuthResponse, MeProfile } from "./accountTypes";
import { currentLegalAcceptance } from "./legalClient";

type AuthContextValue = {
  token: string;
  meProfile: MeProfile | null;
  legalAcceptanceRequired: boolean;
  authLoading: boolean;
  isAuthenticated: boolean;
  message: string;
  setAuthMessage: (message: string) => void;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, code: string) => Promise<void>;
  completeOAuthLogin: (auth: AuthResponse) => Promise<boolean>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
  acceptLegal: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem("pjsktools-token") ?? "");
  const refreshAttempted = useRef(false);
  const [meProfile, setMeProfile] = useState<MeProfile | null>(null);
  const [legalAcceptanceRequired, setLegalAcceptanceRequired] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setAuthMessage] = useState("准备就绪");

  async function applyAuth(auth: AuthResponse, successMessage: string) {
    const nextToken = auth.accessToken ?? auth.token;
    setToken(nextToken);
    localStorage.setItem("pjsktools-token", nextToken);
    localStorage.removeItem("pjsktools-refresh-token");
    const acceptanceRequired = Boolean(auth.legalAcceptanceRequired);
    setLegalAcceptanceRequired(acceptanceRequired);
    setAuthMessage(successMessage);
    setMeProfile(acceptanceRequired ? null : await apiGet<MeProfile>("/api/me/profile", nextToken));
    return acceptanceRequired;
  }

  async function reloadProfile() {
    if (!token) return;
    setMeProfile(await apiGet<MeProfile>("/api/me/profile", token));
  }

  async function acceptLegal() {
    if (!token) throw new Error("请先登录");
    await apiPost("/api/me/legal-acceptances", currentLegalAcceptance, token);
    setLegalAcceptanceRequired(false);
    setAuthMessage("协议确认已记录");
    await reloadProfile();
  }

  async function login(email: string, password: string) {
    setAuthLoading(true);
    try {
      return await applyAuth(await apiPost<AuthResponse>("/api/auth/web/login", { email, password }), "登录成功");
    } finally {
      setAuthLoading(false);
    }
  }

  async function register(email: string, password: string, code: string) {
    setAuthLoading(true);
    try {
      await applyAuth(await apiPost<AuthResponse>("/api/auth/web/register", { email, password, code, ...currentLegalAcceptance }), "注册成功");
    } finally {
      setAuthLoading(false);
    }
  }

  async function completeOAuthLogin(auth: AuthResponse) {
    setAuthLoading(true);
    try {
      return await applyAuth(auth, `QQ 登录成功，欢迎 ${auth.user.nickname ?? "回来"}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function refreshAuth() {
    setAuthLoading(true);
    try {
      await applyAuth(await apiPost<AuthResponse>("/api/auth/web/refresh", {}), "登录状态已刷新");
    } catch {
      setToken("");
      setMeProfile(null);
      setLegalAcceptanceRequired(false);
      localStorage.removeItem("pjsktools-token");
      localStorage.removeItem("pjsktools-refresh-token");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    await apiPost("/api/auth/web/logout", {}).catch(() => undefined);
    setToken("");
    setMeProfile(null);
    setLegalAcceptanceRequired(false);
    localStorage.removeItem("pjsktools-token");
    localStorage.removeItem("pjsktools-refresh-token");
    setAuthMessage("已退出登录");
  }

  useEffect(() => {
    if (refreshAttempted.current) return;
    refreshAttempted.current = true;
    if (token) {
      apiGet<MeProfile>("/api/me/profile", token).then(setMeProfile).catch(() => refreshAuth());
    } else {
      refreshAuth().catch(() => undefined);
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    meProfile,
    legalAcceptanceRequired,
    authLoading,
    isAuthenticated: Boolean(token),
    message,
    setAuthMessage,
    login,
    register,
    completeOAuthLogin,
    refreshAuth,
    logout,
    reloadProfile,
    acceptLegal
  }), [token, meProfile, legalAcceptanceRequired, authLoading, message]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
