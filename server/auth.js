import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNTS_PATH = path.join(__dirname, "accounts.json");
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** @type {Map<string, { username: string, expiresAt: number }>} */
const sessions = new Map();

/** @type {{ username: string, salt: string, passwordHash: string }[] | null} */
let accountsCache = null;

function loadAccounts() {
  if (!accountsCache) {
    accountsCache = JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
  }
  return accountsCache;
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64);
}

export function verifyCredentials(username, password) {
  const u = String(username ?? "").trim();
  const p = String(password ?? "");
  if (!u || !p) return null;
  const uLower = u.toLowerCase();
  const user = loadAccounts().find((a) => a.username.toLowerCase() === uLower);
  if (!user) return null;
  const derived = hashPassword(p, user.salt);
  const stored = Buffer.from(user.passwordHash, "hex");
  if (derived.length !== stored.length || !crypto.timingSafeEqual(derived, stored)) {
    return null;
  }
  return user.username;
}

export function createSession(username) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function destroySession(token) {
  if (token) sessions.delete(token);
}

export function getSessionUser(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return s.username;
}

export function bearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function requireAuth(req, res, next) {
  const username = getSessionUser(bearerToken(req));
  if (!username) {
    res.status(401).json({ error: "Login required" });
    return;
  }
  req.authUser = username;
  next();
}
