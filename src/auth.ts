const TOKEN_KEY = "usee-auth-token-v1";

export const PAYMENT_REQUIRED_MSG = "需要付费使用";
export const MEMBERSHIP_EXPIRED_MSG = "会员已到期，需要付费使用";
export const MEMBERSHIP_LAST_DAY_MSG = "会员即将到期，还剩最后一天";

export type QuotaInfo = {
  used: number;
  remaining: number;
  freeLimit: number;
  paymentRequired: boolean;
};

export type MembershipInfo = {
  startedAt: number | null;
  expiresAt: number | null;
  daysTotal: number;
  daysRemaining: number;
  isLastDay: boolean;
  isExpired: boolean;
};

export type SessionInfo = {
  username: string;
  quota: QuotaInfo;
  membership: MembershipInfo;
};

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

function parseQuota(data: Record<string, unknown>): QuotaInfo {
  const used = typeof data.used === "number" ? data.used : 0;
  const freeLimit = typeof data.freeLimit === "number" ? data.freeLimit : 3;
  const remaining =
    typeof data.remaining === "number" ? data.remaining : Math.max(0, freeLimit - used);
  const paymentRequired =
    typeof data.paymentRequired === "boolean" ? data.paymentRequired : used >= freeLimit;
  return { used, remaining, freeLimit, paymentRequired };
}

function parseMembership(data: Record<string, unknown>): MembershipInfo {
  const m =
    data.membership && typeof data.membership === "object"
      ? (data.membership as Record<string, unknown>)
      : data;
  const daysTotal = typeof m.daysTotal === "number" ? m.daysTotal : 30;
  const daysRemaining = typeof m.daysRemaining === "number" ? m.daysRemaining : daysTotal;
  return {
    startedAt: typeof m.startedAt === "number" ? m.startedAt : null,
    expiresAt: typeof m.expiresAt === "number" ? m.expiresAt : null,
    daysTotal,
    daysRemaining,
    isLastDay: Boolean(m.isLastDay),
    isExpired: Boolean(m.isExpired),
  };
}

function parseSession(data: Record<string, unknown>): SessionInfo | null {
  if (typeof data.username !== "string") return null;
  const quota = parseQuota(data);
  const membership = parseMembership(data);
  if (data.accessBlocked || membership.isExpired || quota.paymentRequired) {
    return null;
  }
  return { username: data.username, quota, membership };
}

function accessDeniedError(data: Record<string, unknown>): Error & { code?: string } {
  const msg =
    typeof data.error === "string"
      ? data.error
      : data.code === "MEMBERSHIP_EXPIRED"
        ? MEMBERSHIP_EXPIRED_MSG
        : PAYMENT_REQUIRED_MSG;
  const err = new Error(msg) as Error & { code?: string };
  if (data.code === "MEMBERSHIP_EXPIRED" || data.code === "PAYMENT_REQUIRED") {
    err.code = data.code;
  }
  return err;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function loginRequest(
  username: string,
  password: string
): Promise<SessionInfo & { token: string }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw accessDeniedError(data);
  if (typeof data.token !== "string") throw new Error("Invalid login response");
  const session = parseSession(data);
  if (!session) throw accessDeniedError(data);
  return { token: data.token, ...session };
}

export async function verifySession(): Promise<SessionInfo | null> {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 403) {
    setAuthToken(null);
    return null;
  }
  if (!res.ok) {
    setAuthToken(null);
    return null;
  }
  return parseSession(data);
}

export async function logoutRequest(): Promise<void> {
  const token = getAuthToken();
  if (token) {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  setAuthToken(null);
}
