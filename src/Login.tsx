import { useState } from "react";
import {
  MEMBERSHIP_EXPIRED_MSG,
  PAYMENT_REQUIRED_MSG,
  loginRequest,
  setAuthToken,
  type MembershipInfo,
  type QuotaInfo,
} from "./auth";

type Props = {
  paywallMessage?: string | null;
  onSuccess: (username: string, quota: QuotaInfo, membership: MembershipInfo) => void;
};

export function Login({ paywallMessage, onSuccess }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, username: u, quota, membership } = await loginRequest(
        username.trim(),
        password
      );
      setAuthToken(token);
      onSuccess(u, quota, membership);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "PAYMENT_REQUIRED" || e.code === "MEMBERSHIP_EXPIRED") {
        setError(e.message || PAYMENT_REQUIRED_MSG);
      } else {
        setError(e instanceof Error ? e.message : "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const banner =
    paywallMessage ||
    (error === PAYMENT_REQUIRED_MSG || error === MEMBERSHIP_EXPIRED_MSG ? error : null);

  return (
    <div className="login-shell">
      <div className="noise" aria-hidden="true" />
      <div className="login-card">
        <header className="login-head">
          <span className="logo">Usee</span>
          <p className="login-sub">Sign in to continue</p>
        </header>
        {banner && <p className="login-paywall">{banner}</p>}
        <form className="login-form" onSubmit={submit}>
          <label className="field">
            <span className="label">Username</span>
            <input
              className="input"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Onekey001"
              required
              disabled={loading}
            />
          </label>
          <label className="field">
            <span className="label">Password</span>
            <input
              className="input"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </label>
          <button type="submit" className="btn-primary login-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {error && error !== PAYMENT_REQUIRED_MSG && error !== MEMBERSHIP_EXPIRED_MSG && (
            <p className="error login-error">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
