/**
 * 本地代理：将密钥留在服务端，转发 OpenAI 兼容请求到 AIHubMix。
 * 生产环境同时托管 Vite 构建后的静态站点（dist/）。
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");

/** 云平台常用 PORT；本地开发仍可用 SEE_API_PORT */
const PORT = Number(process.env.PORT || process.env.SEE_API_PORT) || 3847;
const BASE_URL = (process.env.AIHUBMIX_BASE_URL || "https://aihubmix.com/v1").replace(
  /\/$/,
  ""
);
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
const MODEL = process.env.AIHUBMIX_MODEL || "web-gpt-image-2";

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

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

app.post("/api/generate", async (req, res) => {
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

  /** Inline remote URLs so upstream vision always receives image bytes (URLs alone often fail). */
  let resolvedImageUrls;
  try {
    resolvedImageUrls = await resolveAllImageRefs(imageUrls);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(502).json({ error: msg });
    return;
  }

  /** @type {Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>} */
  const content = [];
  const imgDetailEnv = process.env.AIHUBMIX_IMAGE_DETAIL;
  function imagePart(url) {
    const image_url =
      imgDetailEnv && imgDetailEnv !== "off"
        ? { url, detail: imgDetailEnv }
        : { url };
    return { type: "image_url", image_url };
  }

  if (resolvedImageUrls.length === 0) {
    content.push({ type: "text", text: trimmed });
  } else if (resolvedImageUrls.length === 1) {
    content.push({
      type: "text",
      text:
        "以下是一张参考图（图1），通常为上一轮生成结果。你必须在这张图的像素基础上做编辑：保留整体构图、主体位置与风格气质，除非用户明确要求推翻重做。禁止无视图1另起一张无关的新图。用户指令如下：",
    });
    content.push(imagePart(resolvedImageUrls[0]));
    content.push({ type: "text", text: trimmed });
  } else {
    content.push({
      type: "text",
      text: "以下是两张参考图：先出现的为图1（可为上一轮产出），后面一张为图2。必须在图1基础上融合图2并完成指令；禁止无视参考图从零生成无关画面。",
    });
    content.push(imagePart(resolvedImageUrls[0]));
    content.push({
      type: "text",
      text: "（上图即图1）",
    });
    content.push(imagePart(resolvedImageUrls[1]));
    content.push({
      type: "text",
      text: `（上图即图2）\n\n用户指令：\n${trimmed}`,
    });
  }

  const systemText =
    resolvedImageUrls.length > 0
      ? `你是图像编辑与设计助手。本条消息内已包含 ${resolvedImageUrls.length} 张参考图（内联为可直接读取的图像数据）；你必须严格基于这些画面完成用户指令，禁止假装未收到图、禁止要求再次上传。输出一张最终成品图（单幅），不要组图或九宫格。`
      : "你是海报设计助手。每次请求只输出一张最终成品海报（单幅完整画面），不要组图、分镜、九宫格或多张并列预览。";

  const body = {
    model: MODEL,
    messages: [
      {
        role: "system",
        content: systemText,
      },
      { role: "user", content },
    ],
  };

  try {
    const payload = JSON.stringify(body);
    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: Buffer.from(payload, "utf8"),
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
        `HTTP ${upstream.status}`;
      res.status(502).json({ error: msg, upstream: data });
      return;
    }

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const rawContent = message?.content;

    let contentStr;
    if (typeof rawContent === "string") {
      contentStr = rawContent;
    } else if (Array.isArray(rawContent)) {
      contentStr = rawContent
        .map((part) => {
          if (part?.type === "text" && part.text) return part.text;
          if (part?.type === "image_url" && part.image_url?.url) return part.image_url.url;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    } else if (rawContent != null) {
      contentStr = JSON.stringify(rawContent);
    } else {
      contentStr = "";
    }

    res.json({
      content: contentStr,
      raw: data,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
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
