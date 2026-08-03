import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "./api";
import type { AuthResponse, MeProfile } from "./accountTypes";

type AuthContextValue = {
  token: string;
  refreshToken: string;
  meProfile: MeProfile | null;
  authLoading: boolean;
  isAuthenticated: boolean;
  message: string;
  setAuthMessage: (message: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, code: string) => Promise<void>;
  completeOAuthLogin: (auth: AuthResponse) => Promise<void>;
  refreshAuth: () => Promise<void>;
  logout: () => Promise<void>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem("pjsktools-token") ?? "");
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem("pjsktools-refresh-token") ?? "");
  const [meProfile, setMeProfile] = useState<MeProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setAuthMessage] = useState("准备就绪");

  async function applyAuth(auth: AuthResponse, successMessage: string) {
    const nextToken = auth.accessToken ?? auth.token;
    setToken(nextToken);
    localStorage.setItem("pjsktools-token", nextToken);
    if (auth.refreshToken) {
      setRefreshToken(auth.refreshToken);
      localStorage.setItem("pjsktools-refresh-token", auth.refreshToken);
    }
    setAuthMessage(successMessage);
    setMeProfile(await apiGet<MeProfile>("/api/me/profile", nextToken));
  }

  async function reloadProfile() {
    if (!token) return;
    setMeProfile(await apiGet<MeProfile>("/api/me/profile", token));
  }

  async function login(email: string, password: string) {
    setAuthLoading(true);
    try {
      await applyAuth(await apiPost<AuthResponse>("/api/auth/login", { email, password }), "登录成功");
    } finally {
      setAuthLoading(false);
    }
  }

  async function register(email: string, password: string, code: string) {
    setAuthLoading(true);
    try {
      await applyAuth(await apiPost<AuthResponse>("/api/auth/register", { email, password, code }), "注册成功");
    } finally {
      setAuthLoading(false);
    }
  }

  async function completeOAuthLogin(auth: AuthResponse) {
    setAuthLoading(true);
    try {
      await applyAuth(auth, `QQ 登录成功，欢迎 ${auth.user.nickname ?? "回来"}`);
    } finally {
      setAuthLoading(false);
    }
  }

  async function refreshAuth() {
    if (!refreshToken) return;
    setAuthLoading(true);
    try {
      await applyAuth(await apiPost<AuthResponse>("/api/auth/refresh", { refreshToken }), "登录状态已刷新");
    } catch {
      setToken("");
      setRefreshToken("");
      setMeProfile(null);
      localStorage.removeItem("pjsktools-token");
      localStorage.removeItem("pjsktools-refresh-token");
    } finally {
      setAuthLoading(false);
    }
  }

  async function logout() {
    if (refreshToken) await apiPost("/api/auth/logout", { refreshToken }).catch(() => undefined);
    setToken("");
    setRefreshToken("");
    setMeProfile(null);
    localStorage.removeItem("pjsktools-token");
    localStorage.removeItem("pjsktools-refresh-token");
    setAuthMessage("已退出登录");
  }

  useEffect(() => {
    if (token) {
      apiGet<MeProfile>("/api/me/profile", token).then(setMeProfile).catch(() => undefined);
      return;
    }
    if (refreshToken) refreshAuth().catch(() => undefined);
  }, [token, refreshToken]);

  const value = useMemo<AuthContextValue>(() => ({
    token,
    refreshToken,
    meProfile,
    authLoading,
    isAuthenticated: Boolean(token),
    message,
    setAuthMessage,
    login,
    register,
    completeOAuthLogin,
    refreshAuth,
    logout,
    reloadProfile
  }), [token, refreshToken, meProfile, authLoading, message]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
