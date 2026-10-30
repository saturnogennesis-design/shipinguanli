"use client";

import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { clearBusinessContext, readBusinessContext, type BusinessAccountContext } from "./business-context";

type User = { id: number; username: string; displayName: string; mustChangePassword: boolean; roleName?: string };
type ContextOption = { id: number; code: string; name: string; platformName: string; platformCode: string; groups: Array<{ id: number; name: string; accountId: number | null }> };
type Mode = "loading" | "setup" | "login" | "change-password" | "context" | "ready" | "unavailable";

export function AuthGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [contextOptions, setContextOptions] = useState<ContextOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [form, setForm] = useState({ username: "", displayName: "", password: "", confirmPassword: "", currentPassword: "", newPassword: "", confirmNewPassword: "" });

  const prepareContext = async () => {
    clearBusinessContext();
    setMode("ready");
  };
  const check = async () => {
    setMode("loading");
    setError("");
    try {
      const me = await fetch("/api/auth/me", { cache: "no-store" });
      if (me.ok) {
        const data = await me.json() as { user: User };
        setUser(data.user);
        if (data.user.mustChangePassword) setMode("change-password");
        else await prepareContext();
        return;
      }
      const setup = await fetch("/api/setup", { cache: "no-store" });
      if (!setup.ok) throw new Error("本地数据库尚未初始化");
      const data = await setup.json() as { setupRequired: boolean };
      setMode(data.setupRequired ? "setup" : "login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "服务暂时不可用");
      setMode("unavailable");
    }
  };

  useEffect(() => { const timer=window.setTimeout(()=>void check(),0);return()=>window.clearTimeout(timer); }, []);

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirmPassword) { setError("两次输入的密码不一致"); return; }
    setBusy(true); setError("");
    const response = await fetch("/api/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "hjt", displayName: form.displayName, password: form.password }) });
    const data = await response.json() as { error?: string; user?: User };
    setBusy(false);
    if (!response.ok || !data.user) { setError(data.error ?? "初始化失败"); return; }
    setUser({ ...data.user, mustChangePassword: false }); setMode("ready");
    await prepareContext();
  };

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.username, password: form.password }) });
    const data = await response.json() as { error?: string; user?: User };
    setBusy(false);
    if (!response.ok || !data.user) { setError(data.error ?? "登录失败"); return; }
    setUser(data.user); if (data.user.mustChangePassword) setMode("change-password"); else await prepareContext();
  };

  const submitPasswordChange = async (event: FormEvent) => {
    event.preventDefault();
    if (form.newPassword !== form.confirmNewPassword) { setError("两次输入的新密码不一致"); return; }
    setBusy(true); setError("");
    const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }) });
    const data = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) { setError(data.error ?? "密码修改失败"); return; }
    setUser(user ? { ...user, mustChangePassword: false } : null); await prepareContext();
  };

  const switchAccount = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("退出失败，请重试");
      clearBusinessContext();
      setUser(null);
      setForm({ username: "", displayName: "", password: "", confirmPassword: "", currentPassword: "", newPassword: "", confirmNewPassword: "" });
      setMode("login");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出失败，请重试");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const open = () => { if (mode === "ready") void prepareContext(); };
    window.addEventListener("orbit-request-business-context", open);
    return () => window.removeEventListener("orbit-request-business-context", open);
  }, [mode]);

  const chooseContext = () => {
    const account = contextOptions.find((item) => String(item.id) === selectedAccountId);
    if (!account) { setError("请选择业务账号"); return; }
    const group = account.groups.find((item) => String(item.id) === selectedGroupId);
    if (account.groups.length > 1 && !group) { setError("请选择内容组"); return; }
    const next: BusinessAccountContext = { accountId: account.id, accountCode: account.code, accountName: account.name, platformName: account.platformName, platformCode: account.platformCode, groupId: group?.id ?? null, groupName: group?.name ?? null };
    window.sessionStorage.setItem("orbit-business-context", JSON.stringify(next));
    window.dispatchEvent(new Event("orbit-business-context-changed"));
    setError("");
    setMode("ready");
  };

  const selectedAccount = contextOptions.find((item) => String(item.id) === selectedAccountId);

  if (mode === "ready") return <>{children}</>;
  return <main className="auth-shell"><section className="auth-card">
    <div className="auth-brand"><span>O</span><div><strong>内容中台</strong><small>公司局域网内部系统</small></div></div>
    {mode === "loading" && <div className="auth-message"><i className="auth-spinner" /><h1>正在连接本地服务</h1><p>正在检查数据库和登录状态。</p></div>}
    {mode === "unavailable" && <div className="auth-message"><span className="auth-alert">!</span><h1>本地服务尚未准备完成</h1><p>{error}</p><button className="primary-button" onClick={() => void check()}>重新检查</button></div>}
    {mode === "setup" && <form className="auth-form" onSubmit={submitSetup}><div><small>首次运行</small><h1>创建主账号</h1><p>主账号固定为hjt，项目可见人员仅由该账号配置。</p></div><label>登录账号<input value="hjt" readOnly /></label><label>管理员姓名<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} placeholder="用于操作日志" /></label><label>初始密码<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="至少8位" /></label><label>确认密码<input type="password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "正在创建…" : "创建并进入系统"}</button></form>}
    {mode === "login" && <form className="auth-form" onSubmit={submitLogin}><div><small>员工登录</small><h1>进入内容管理平台</h1><p>仅允许公司局域网内已启用的员工账号登录。</p></div><label>登录账号<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label><label>密码<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "正在登录…" : "登录"}</button></form>}
    {mode === "change-password" && <form className="auth-form" onSubmit={submitPasswordChange}><div><small>账号安全</small><h1>首次登录请修改密码</h1><p>{user?.displayName}，修改完成后才能进入系统。</p></div><label>当前密码<input type="password" value={form.currentPassword} onChange={(event) => setForm({ ...form, currentPassword: event.target.value })} /></label><label>新密码<input type="password" value={form.newPassword} onChange={(event) => setForm({ ...form, newPassword: event.target.value })} placeholder="至少8位" /></label><label>确认新密码<input type="password" value={form.confirmNewPassword} onChange={(event) => setForm({ ...form, confirmNewPassword: event.target.value })} /></label>{error && <p className="auth-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? "正在保存…" : "修改密码并进入"}</button><button type="button" className="auth-switch-account" disabled={busy} onClick={()=>void switchAccount()}>退出并切换账号</button></form>}
    {mode === "context" && <form className="auth-form" onSubmit={(event) => { event.preventDefault(); chooseContext(); }}><div><small>工作空间</small><h1>选择工作账号</h1><p>先确定本次工作的业务账号；之后可以在右上角切换。</p></div><label>业务账号<select value={selectedAccountId} onChange={(event) => { setSelectedAccountId(event.target.value); setSelectedGroupId(""); }}><option value="">请选择业务账号</option>{contextOptions.map((item) => <option key={item.id} value={item.id}>{item.platformName}｜{item.name}</option>)}</select></label>{selectedAccount && selectedAccount.groups.length > 1 ? <label>内容组<select value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}><option value="">请选择内容组</option>{selectedAccount.groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : selectedAccount?.groups.length === 1 ? <p className="auth-context-note">内容组：{selectedAccount.groups[0].name}</p> : <p className="auth-context-note">该账号暂未配置多个内容组，素材中心按账号使用。</p>}{error && <p className="auth-error">{error}</p>}<button className="primary-button" disabled={busy || !selectedAccountId || Boolean(selectedAccount && selectedAccount.groups.length > 1 && !selectedGroupId)}>进入工作台</button></form>}
    <footer><span className="lan-dot" />仅限公司内网访问 · 数据保存在本地服务器</footer>
  </section></main>;
}
