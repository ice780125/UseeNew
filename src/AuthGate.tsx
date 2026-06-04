import { useEffect, useState } from "react";
import { App } from "./App";
import { Login } from "./Login";
import { logoutRequest, type MembershipInfo, type QuotaInfo, verifySession } from "./auth";

export function AuthGate() {
  const [session, setSession] = useState<{
    username: string;
    quota: QuotaInfo;
    membership: MembershipInfo;
  } | null>(null);
  const [checking, setChecking] = useState(true);
  const [paywallMessage, setPaywallMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    verifySession().then((info) => {
      if (cancelled) return;
      if (info) {
        setSession({
          username: info.username,
          quota: info.quota,
          membership: info.membership,
        });
        setPaywallMessage(null);
      }
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = async (message?: string) => {
    await logoutRequest();
    setSession(null);
    if (message) setPaywallMessage(message);
  };

  if (checking) {
    return (
      <div className="login-shell">
        <div className="noise" aria-hidden="true" />
        <p className="login-loading">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return (
      <Login
        paywallMessage={paywallMessage}
        onSuccess={(username, quota, membership) => {
          setPaywallMessage(null);
          setSession({ username, quota, membership });
        }}
      />
    );
  }

  return (
    <App
      username={session.username}
      quota={session.quota}
      membership={session.membership}
      onLogout={handleLogout}
      onSessionUpdate={(patch: { quota?: QuotaInfo; membership?: MembershipInfo }) =>
        setSession((s) => (s ? { ...s, ...patch } : s))
      }
    />
  );
}
