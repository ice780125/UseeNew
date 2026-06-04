import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USAGE_PATH = path.join(__dirname, "usage.json");

export const FREE_QUOTA = Number(process.env.SEE_FREE_QUOTA) || 3;
export const MEMBERSHIP_DAYS = Number(process.env.SEE_MEMBERSHIP_DAYS) || 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const PAYMENT_REQUIRED_MSG = "需要付费使用";
export const MEMBERSHIP_EXPIRED_MSG = "会员已到期，需要付费使用";
export const MEMBERSHIP_LAST_DAY_MSG = "会员即将到期，还剩最后一天";

function readStore() {
  try {
    const raw = fs.readFileSync(USAGE_PATH, "utf8");
    const data = JSON.parse(raw);
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

function writeStore(data) {
  fs.writeFileSync(USAGE_PATH, JSON.stringify(data, null, 2));
}

/** @returns {{ count: number, startedAt: number | null }} */
function getRecord(username) {
  const raw = readStore()[username];
  if (typeof raw === "number") {
    return { count: Math.max(0, Math.floor(raw)), startedAt: null };
  }
  if (raw && typeof raw === "object") {
    const count = Number(raw.count);
    const startedAt = Number(raw.startedAt);
    return {
      count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
      startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
    };
  }
  return { count: 0, startedAt: null };
}

function setRecord(username, record) {
  const data = readStore();
  data[username] = record;
  writeStore(data);
}

/** Mark membership start on first login / use (30-day window from this moment). */
export function ensureMembershipStarted(username) {
  const rec = getRecord(username);
  if (rec.startedAt) return rec.startedAt;
  const startedAt = Date.now();
  setRecord(username, { ...rec, startedAt });
  return startedAt;
}

export function getUsageCount(username) {
  return getRecord(username).count;
}

export function getMembershipInfo(username) {
  const rec = getRecord(username);
  const startedAt = rec.startedAt;
  if (!startedAt) {
    return {
      startedAt: null,
      expiresAt: null,
      daysTotal: MEMBERSHIP_DAYS,
      daysRemaining: MEMBERSHIP_DAYS,
      isLastDay: false,
      isExpired: false,
    };
  }
  const expiresAt = startedAt + MEMBERSHIP_DAYS * MS_PER_DAY;
  const msLeft = expiresAt - Date.now();
  const daysRemaining = msLeft <= 0 ? 0 : Math.ceil(msLeft / MS_PER_DAY);
  const isExpired = msLeft <= 0;
  const isLastDay = !isExpired && msLeft <= MS_PER_DAY;
  return {
    startedAt,
    expiresAt,
    daysTotal: MEMBERSHIP_DAYS,
    daysRemaining,
    isLastDay,
    isExpired,
  };
}

export function isMembershipExpired(username) {
  ensureMembershipStarted(username);
  return getMembershipInfo(username).isExpired;
}

export function getQuotaInfo(username) {
  const used = getUsageCount(username);
  const remaining = Math.max(0, FREE_QUOTA - used);
  return {
    used,
    remaining,
    freeLimit: FREE_QUOTA,
    paymentRequired: used >= FREE_QUOTA,
  };
}

export function getAccountStatus(username) {
  ensureMembershipStarted(username);
  const membership = getMembershipInfo(username);
  const quota = getQuotaInfo(username);
  return {
    ...quota,
    membership,
    accessBlocked: quota.paymentRequired || membership.isExpired,
    blockReason: membership.isExpired
      ? MEMBERSHIP_EXPIRED_MSG
      : quota.paymentRequired
        ? PAYMENT_REQUIRED_MSG
        : null,
  };
}

export function isQuotaExhausted(username) {
  return getUsageCount(username) >= FREE_QUOTA;
}

export function isAccessBlocked(username) {
  const s = getAccountStatus(username);
  return s.accessBlocked;
}

/** Call once after a successful image generation. */
export function recordSuccessfulGeneration(username) {
  ensureMembershipStarted(username);
  const rec = getRecord(username);
  setRecord(username, { ...rec, count: rec.count + 1 });
  return getAccountStatus(username);
}
