/**
 * 本地代理：将密钥留在服务端，转发 AIHubMix 同步图片生成请求。
 * 生产环境同时托管 Vite 构建后的静态站点（dist/）。
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import {
  bearerToken,
  createSession,
  destroySession,
  getSessionUser,
  requireAuth,
  verifyCredentials,
} from "./auth.js";
import {
  MEMBERSHIP_EXPIRED_MSG,
  PAYMENT_REQUIRED_MSG,
  ensureMembershipStarted,
  getAccountStatus,
  isAccessBlocked,
  recordSuccessfulGeneration,
} from "./quota.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");

/** 云平台常用 PORT；本地开发仍可用 SEE_API_PORT */
const PORT = Number(process.env.PORT || process.env.SEE_API_PORT) || 3847;
/** 默认同步 Image API：POST {BASE}/images/generations */
const BASE_URL = (
  process.env.AIHUBMIX_BASE_URL || "https://api.inferera.com/ai/v1"
).replace(/\/$/, "");
/**
 * Authorization 头只能是 Latin-1；从 .env 原样里抽出 sk- 开头的 ASCII 密钥，
 * 避免「整段 strip 非 ASCII」把合法 key 清空（全角引号、homoglyph 等）。
 */
function normalizeApiKey(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (!s) return "";
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  const hashIdx = s.indexOf("#");
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim();
  const sk = s.match(/sk-[A-Za-z0-9_-]+/);
  if (sk) return sk[0];
  return s.replace(/[^\x20-\x7E]/g, "").trim();
}

const API_KEY_RAW = process.env.AIHUBMIX_API_KEY;
const API_KEY = normalizeApiKey(API_KEY_RAW);
const MODEL = process.env.AIHUBMIX_MODEL || "gpt-image-2.5-flare";
const GENERATE_TIMEOUT_MS = Number(process.env.AIHUBMIX_GENERATE_TIMEOUT_MS) || 180_000;
const CONTENT_URL_TIMEOUT_MS = 45_000;

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "48mb" }));

const MAX_IMAGE_FETCH_BYTES = 14 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 28_000;

/** Block obvious SSRF targets when server fetches user-supplied image URLs. */
function assertSafePublicImageUrl(urlStr) {
  let u;
  try {
    u = new URL(urlStr);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) image URLs can be fetched");
  }
  const h = u.hostname.toLowerCase();
  const blocked = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "[::1]"]);
  if (blocked.has(h) || h.endsWith(".localhost")) {
    throw new Error("Blocked host");
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) {
    throw new Error("Private network host");
  }
}

function guessMimeFromMagic(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  )
    return "image/webp";
  return "";
}

/**
 * Remote http(s) refs often fail upstream vision (hotlink, auth, CDN quirks).
 * Inline as data URLs so the model always receives pixels.
 */
async function resolveImageRefToDataUrl(u) {
  if (typeof u !== "string") throw new Error("Bad ref");
  if (u.startsWith("data:image/")) return u;
  if (!/^https?:\/\//i.test(u)) throw new Error("Unsupported image ref");

  assertSafePublicImageUrl(u);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(u, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "SeeImageProxy/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const lenHdr = res.headers.get("content-length");
    if (lenHdr && Number(lenHdr) > MAX_IMAGE_FETCH_BYTES) {
      throw new Error("Image too large");
    }
    const ab = await res.arrayBuffer();
    clearTimeout(timer);
    const buf = Buffer.from(ab);
    if (buf.length > MAX_IMAGE_FETCH_BYTES) {
      throw new Error("Image too large");
    }
    let ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      ct = guessMimeFromMagic(buf);
      if (!ct) {
        throw new Error("Response was not image bytes (got HTML or unknown payload?)");
      }
    }
    const b64 = buf.toString("base64");
    return `data:${ct};base64,${b64}`;
  } catch (e) {
    clearTimeout(timer);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "This operation was aborted" || msg.includes("aborted")) {
      throw new Error("Image fetch timed out");
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

async function resolveAllImageRefs(urls) {
  const out = [];
  for (const u of urls) {
    try {
      out.push(await resolveImageRefToDataUrl(u));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`参考图无法拉取（请检查链接是否可在公网访问）: ${msg}`);
    }
  }
  return out;
}

/** Strip data-URI prefix if present; AIHubMix accepts data URI, URL, or raw base64. */
function normalizeB64Json(b64) {
  if (typeof b64 !== "string" || !b64) return "";
  const trimmed = b64.trim();
  const m = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s);
  return m ? m[1].replace(/\s/g, "") : trimmed.replace(/\s/g, "");
}

/**
 * content_url 需带同一 Bearer，且约 30 分钟过期 — 立刻拉成 data URL 再回给前端。
 */
async function fetchAuthorizedImageAsDataUrl(contentUrl, apiKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONTENT_URL_TIMEOUT_MS);
  try {
    const res = await fetch(contentUrl, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) {
      throw new Error(`content_url download HTTP ${res.status}`);
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > MAX_IMAGE_FETCH_BYTES) {
      throw new Error("Generated image too large");
    }
    let ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) {
      ct = guessMimeFromMagic(buf) || "image/png";
    }
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "This operation was aborted" || msg.includes("aborted")) {
      throw new Error("content_url download timed out");
    }
    throw e instanceof Error ? e : new Error(msg);
  } finally {
    clearTimeout(timer);
  }
}

/** Map AIHubMix task output item → durable data URL for the browser. */
async function materializeOutputItem(item, apiKey) {
  if (!item || typeof item !== "object") return null;
  const b64 = normalizeB64Json(item.b64_json);
  if (b64) {
    const fmt =
      typeof item.content_type === "string" && item.content_type.startsWith("image/")
        ? item.content_type
        : "image/png";
    return `data:${fmt};base64,${b64}`;
  }
  if (typeof item.content_url === "string" && item.content_url) {
    return fetchAuthorizedImageAsDataUrl(item.content_url, apiKey);
  }
  return null;
}

function buildImagePrompt(userPrompt, refCount) {
  if (refCount <= 0) return userPrompt;
  if (refCount === 1) {
    return (
      "Edit the provided reference image according to the instruction below. " +
      "Preserve overall composition, subject placement, and style unless the user explicitly asks otherwise. " +
      "Do not ignore the reference and invent an unrelated scene.\n\n" +
      userPrompt
    );
  }
  return (
    "You are given multiple reference images. Treat the first as the base canvas and fuse later ones as additional references. " +
    "Follow the instruction below; do not ignore the references.\n\n" +
    userPrompt
  );
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

function blockedLoginResponse(res, status) {
  const code = status.membership.isExpired ? "MEMBERSHIP_EXPIRED" : "PAYMENT_REQUIRED";
  const error = status.blockReason || PAYMENT_REQUIRED_MSG;
  res.status(403).json({ error, code, ...status });
}

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = verifyCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  ensureMembershipStarted(user);
  const status = getAccountStatus(user);
  if (status.accessBlocked) {
    blockedLoginResponse(res, status);
    return;
  }
  const token = createSession(user);
  res.json({ token, username: user, ...status });
});

app.get("/api/auth/me", (req, res) => {
  const user = getSessionUser(bearerToken(req));
  if (!user) {
    res.status(401).json({ error: "Not logged in" });
    return;
  }
  const status = getAccountStatus(user);
  if (status.accessBlocked) {
    destroySession(bearerToken(req));
    blockedLoginResponse(res, status);
    return;
  }
  res.json({ username: user, ...status });
});

app.post("/api/auth/logout", (req, res) => {
  destroySession(bearerToken(req));
  res.json({ ok: true });
});

app.post("/api/generate", requireAuth, async (req, res) => {
  const authUser = req.authUser;
  const statusBefore = getAccountStatus(authUser);
  if (statusBefore.accessBlocked) {
    const code = statusBefore.membership.isExpired ? "MEMBERSHIP_EXPIRED" : "PAYMENT_REQUIRED";
    res.status(403).json({
      error: statusBefore.blockReason,
      code,
      ...statusBefore,
    });
    return;
  }

  if (!API_KEY) {
    const hint =
      API_KEY_RAW && API_KEY_RAW.trim()
        ? "Invalid AIHUBMIX_API_KEY: use one ASCII line `AIHUBMIX_API_KEY=sk-...` with no Chinese or notes on the same line."
        : "Missing AIHUBMIX_API_KEY: create `.env` in the project root.";
    res.status(500).json({ error: hint });
    return;
  }

  const { prompt, imageDataUrl, imageDataUrls } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Invalid prompt: expected a string." });
    return;
  }

  const trimmed = prompt.trim();
  if (!trimmed) {
    res.status(400).json({ error: "Prompt cannot be empty." });
    return;
  }

  function isAllowedImageRef(u) {
    if (typeof u !== "string" || u.length > 8 * 1024 * 1024) return false;
    if (u.startsWith("data:image/")) return true;
    try {
      const parsed = new URL(u);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /** @type {string[]} */
  const imageUrls = [];
  if (Array.isArray(imageDataUrls)) {
    for (const u of imageDataUrls) {
      if (imageUrls.length >= 2) break;
      if (isAllowedImageRef(u)) imageUrls.push(u);
    }
  }
  if (imageUrls.length === 0 && imageDataUrl && typeof imageDataUrl === "string" && isAllowedImageRef(imageDataUrl)) {
    imageUrls.push(imageDataUrl);
  }

  /** Inline remote URLs so upstream always receives image bytes (URLs alone often fail). */
  let resolvedImageUrls;
  try {
    resolvedImageUrls = await resolveAllImageRefs(imageUrls);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
    return;
  }

  /** @type {Record<string, unknown>} */
  const body = {
    model: MODEL,
    prompt: buildImagePrompt(trimmed, resolvedImageUrls.length),
    n: 1,
    output_format: "png",
  };
  if (resolvedImageUrls.length === 1) {
    body.image = resolvedImageUrls[0];
  } else if (resolvedImageUrls.length > 1) {
    body.images = resolvedImageUrls;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GENERATE_TIMEOUT_MS);

  try {
    const payload = JSON.stringify(body);
    const upstream = await fetch(`${BASE_URL}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: Buffer.from(payload, "utf8"),
      signal: ctrl.signal,
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.status(502).json({
        error: "Upstream returned non-JSON",
        detail: text.slice(0, 500),
      });
      return;
    }

    if (!upstream.ok) {
      const msg =
        data?.error?.message ||
        data?.message ||
        (typeof data?.error === "string" ? data.error : null) ||
        `HTTP ${upstream.status}`;
      res.status(502).json({ error: msg, upstream: data });
      return;
    }

    const status = typeof data?.status === "string" ? data.status : "";
    if (status && status !== "completed") {
      const errMsg =
        data?.error?.message ||
        (typeof data?.error === "string" ? data.error : null) ||
        `Image task status: ${status}`;
      res.status(502).json({ error: errMsg, upstream: data });
      return;
    }

    const output = Array.isArray(data?.output) ? data.output : [];
    /** @type {string[]} */
    const dataUrls = [];
    for (const item of output) {
      try {
        const url = await materializeOutputItem(item, API_KEY);
        if (url) dataUrls.push(url);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.status(502).json({ error: `Failed to materialize image output: ${msg}`, upstream: data });
        return;
      }
    }

    // OpenAI-compat fallback: { data: [{ b64_json | url }] }
    if (dataUrls.length === 0 && Array.isArray(data?.data)) {
      for (const item of data.data) {
        try {
          const url = await materializeOutputItem(item, API_KEY);
          if (url) dataUrls.push(url);
          else if (typeof item?.url === "string" && item.url) {
            dataUrls.push(item.url);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          res.status(502).json({ error: `Failed to materialize image output: ${msg}`, upstream: data });
          return;
        }
      }
    }

    if (dataUrls.length === 0) {
      res.status(502).json({
        error: "Upstream returned no image output (expected b64_json or content_url)",
        upstream: data,
      });
      return;
    }

    const contentStr = dataUrls.map((u) => `![](${u})`).join("\n");

    const accountStatus = recordSuccessfulGeneration(authUser);
    res.json({
      content: contentStr,
      raw: data,
      quota: {
        used: accountStatus.used,
        remaining: accountStatus.remaining,
        freeLimit: accountStatus.freeLimit,
        paymentRequired: accountStatus.paymentRequired,
      },
      membership: accountStatus.membership,
      accessBlocked: accountStatus.accessBlocked,
      blockReason: accountStatus.blockReason,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "This operation was aborted" || msg.includes("aborted")) {
      res.status(504).json({ error: `Image generation timed out after ${GENERATE_TIMEOUT_MS}ms` });
      return;
    }
    res.status(500).json({ error: msg });
  } finally {
    clearTimeout(timer);
  }
});

app.get("/api/quota", requireAuth, (req, res) => {
  res.json(getAccountStatus(req.authUser));
});

const isProd = process.env.NODE_ENV === "production";
if (isProd) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(DIST_DIR, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[see] listening on http://0.0.0.0:${PORT}${isProd ? " (static + /api)" : " (api only — use Vite dev for UI)"}`);
});
