import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExpiryModal } from "./ExpiryModal";
import {
  MEMBERSHIP_EXPIRED_MSG,
  PAYMENT_REQUIRED_MSG,
  authFetch,
  type MembershipInfo,
  type QuotaInfo,
} from "./auth";
import {
  buildOutputSizeBlock,
  CANVAS_CUSTOM_ID,
  CANVAS_NONE_ID,
  CANVAS_PRESETS,
  parsePositiveInt,
} from "./canvasPresets";

type AppProps = {
  username: string;
  quota: QuotaInfo;
  membership: MembershipInfo;
  onLogout: (paywallMessage?: string) => void | Promise<void>;
  onSessionUpdate: (patch: { quota?: QuotaInfo; membership?: MembershipInfo }) => void;
};

type GenState = "idle" | "loading" | "error" | "done";

type GenerationHistoryItem = {
  id: string;
  imageUrl: string;
  promptLabel: string;
  at: number;
};

const HISTORY_STORAGE_KEY = "usee-gen-history-v1";
const MAX_HISTORY_ITEMS = 40;

function loadHistoryFromStorage(): GenerationHistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is GenerationHistoryItem =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as GenerationHistoryItem).id === "string" &&
        typeof (x as GenerationHistoryItem).imageUrl === "string"
    );
  } catch {
    return [];
  }
}

function saveHistoryToStorage(items: GenerationHistoryItem[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(-MAX_HISTORY_ITEMS)));
  } catch {
    /* quota / private mode */
  }
}

function exportAllImageLinks(
  history: GenerationHistoryItem[],
  extraUrls: string[]
): { text: string; count: number } {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const h of history) {
    const url = h.imageUrl?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const note = [shortTime(h.at), h.promptLabel].filter(Boolean).join(" · ");
    lines.push(note ? `${url}\t# ${note}` : url);
  }
  for (const u of extraUrls) {
    const url = u?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    lines.push(url);
  }
  return { text: lines.join("\n"), count: lines.length };
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

function shortTime(ts: number): string {
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractImagesFromText(text: string): string[] {
  const urls: string[] = [];
  const md = /!\[[^\]]*]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text)) !== null) {
    if (m[1]) urls.push(m[1].trim());
  }
  const bare = /(https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"']*)?)/gi;
  while ((m = bare.exec(text)) !== null) {
    urls.push(m[1]);
  }
  const dataUri = /(data:image\/[a-zA-Z+.-]+;base64,[0-9A-Za-z+/=\s]+)/g;
  while ((m = dataUri.exec(text)) !== null) {
    urls.push(m[1].replace(/\s/g, ""));
  }
  return [...new Set(urls)];
}

function firstImageOnly(urls: string[]): string[] {
  return urls.length ? [urls[0]] : [];
}

/** Order: previous output URL first (图1), then file A+, then B+ — max 2 for API. */
function collectReferenceImageUrls(
  chained: string | null,
  fp1: string | null,
  fp2: string | null
): string[] {
  const out: string[] = [];
  const tryPush = (u: string | null) => {
    if (!u || out.length >= 2) return;
    if (u.startsWith("data:image/") || /^https?:\/\//i.test(u)) out.push(u);
  };
  tryPush(chained);
  tryPush(fp1);
  tryPush(fp2);
  return out;
}

function readImageFile(file: File | undefined, onDataUrl: (s: string | null) => void) {
  if (!file || !file.type.startsWith("image/")) {
    onDataUrl(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const r = reader.result;
    onDataUrl(typeof r === "string" ? r : null);
  };
  reader.readAsDataURL(file);
}

const PROGRESS_CAP = 92;

function stopFakeProgress(
  intervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>
) {
  if (intervalRef.current !== null) {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }
}

export function App({ username, quota, membership, onLogout, onSessionUpdate }: AppProps) {
  const [prompt, setPrompt] = useState("");
  const [filePreview1, setFilePreview1] = useState<string | null>(null);
  const [filePreview2, setFilePreview2] = useState<string | null>(null);
  const [status, setStatus] = useState<GenState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [posterUrls, setPosterUrls] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [canvasPresetId, setCanvasPresetId] = useState<string>(CANVAS_NONE_ID);
  const [customWidth, setCustomWidth] = useState("1080");
  const [customHeight, setCustomHeight] = useState("1920");
  const [customDpi, setCustomDpi] = useState("72");
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  /** URL of last / chosen output — sent as 图1 on next request (iterative edit). */
  const [chainedRefUrl, setChainedRefUrl] = useState<string | null>(null);
  /** After each success, set chain to the new image for the next run. */
  const [autoChainNext, setAutoChainNext] = useState(true);
  const [linksSaveHint, setLinksSaveHint] = useState<string | null>(null);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  useEffect(() => () => stopFakeProgress(progressIntervalRef), []);

  useEffect(() => {
    if (!membership.isLastDay || membership.isExpired) {
      setShowExpiryModal(false);
      return;
    }
    const key = `usee-expiry-warn-${username}-${membership.expiresAt ?? "x"}`;
    if (sessionStorage.getItem(key)) return;
    setShowExpiryModal(true);
  }, [username, membership.isLastDay, membership.isExpired, membership.expiresAt]);

  const dismissExpiryModal = () => {
    const key = `usee-expiry-warn-${username}-${membership.expiresAt ?? "x"}`;
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
    setShowExpiryModal(false);
  };

  useEffect(() => {
    if (!linksSaveHint) return;
    const t = setTimeout(() => setLinksSaveHint(null), 3200);
    return () => clearTimeout(t);
  }, [linksSaveHint]);

  useEffect(() => {
    setGenerationHistory(loadHistoryFromStorage());
  }, []);

  useEffect(() => {
    saveHistoryToStorage(generationHistory);
  }, [generationHistory]);

  const generatedImages = useMemo(() => {
    const raw = posterUrls.length
      ? posterUrls
      : resultText
        ? extractImagesFromText(resultText)
        : [];
    return firstImageOnly(raw);
  }, [posterUrls, resultText]);

  const saveAllLinks = useCallback(() => {
    const extras = [...posterUrls, ...generatedImages];
    const { text, count } = exportAllImageLinks(generationHistory, extras);
    if (count === 0) {
      setLinksSaveHint("No image links to save yet");
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadTextFile(`usee-links-${stamp}.txt`, text);
    void navigator.clipboard?.writeText(text).catch(() => {});
    setLinksSaveHint(`Saved ${count} link${count === 1 ? "" : "s"} (file + clipboard)`);
  }, [generationHistory, posterUrls, generatedImages]);

  const onPickFile = useCallback((slot: 0 | 1, file: File | undefined) => {
    const setPrev = slot === 0 ? setFilePreview1 : setFilePreview2;
    readImageFile(file, setPrev);
  }, []);

  const generate = async () => {
    const p = prompt.trim();
    if (!p) {
      setError("Enter a prompt.");
      setStatus("error");
      return;
    }

    const cw = parsePositiveInt(customWidth, 1080);
    const ch = parsePositiveInt(customHeight, 1920);
    const cd = parsePositiveInt(customDpi, 72);
    if (canvasPresetId === CANVAS_CUSTOM_ID) {
      if (cw < 64 || ch < 64 || cw > 8192 || ch > 8192) {
        setError("Custom size: width and height must be between 64 and 8192 px.");
        setStatus("error");
        return;
      }
    }

    const sizeBlock = buildOutputSizeBlock(canvasPresetId, {
      width: cw,
      height: ch,
      dpi: cd,
    });
    const fullPrompt = sizeBlock ? `${sizeBlock}\n\n---\n\nCreative brief:\n${p}` : p;

    setStatus("loading");
    setError(null);
    setResultText(null);
    setPosterUrls([]);
    setLoadProgress(1);
    stopFakeProgress(progressIntervalRef);
    progressIntervalRef.current = setInterval(() => {
      setLoadProgress((prev) => {
        if (prev >= PROGRESS_CAP) return prev;
        const delta = Math.max(
          1,
          Math.round((PROGRESS_CAP - prev) * 0.08 + Math.random() * 2.5)
        );
        return Math.min(PROGRESS_CAP, prev + delta);
      });
    }, 130);

    try {
      const imgs = collectReferenceImageUrls(chainedRefUrl, filePreview1, filePreview2);
      const payload = JSON.stringify({
        prompt: fullPrompt,
        ...(imgs.length ? { imageDataUrls: imgs } : {}),
      });
      const res = await authFetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
        },
        body: new TextEncoder().encode(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        await onLogout();
        throw new Error("Session expired — please sign in again");
      }
      if (res.status === 403) {
        const msg =
          data.code === "MEMBERSHIP_EXPIRED"
            ? MEMBERSHIP_EXPIRED_MSG
            : typeof data.error === "string"
              ? data.error
              : PAYMENT_REQUIRED_MSG;
        await onLogout(msg);
        throw new Error(msg);
      }
      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      if (data.quota && typeof data.quota === "object") {
        const q = data.quota as QuotaInfo;
        const nextQuota: QuotaInfo = {
          used: Number(q.used) || 0,
          remaining: Number(q.remaining) || 0,
          freeLimit: Number(q.freeLimit) || 3,
          paymentRequired: Boolean(q.paymentRequired),
        };
        const patch: { quota: QuotaInfo; membership?: MembershipInfo } = { quota: nextQuota };
        if (data.membership && typeof data.membership === "object") {
          const m = data.membership as MembershipInfo;
          patch.membership = {
            startedAt: m.startedAt ?? null,
            expiresAt: m.expiresAt ?? null,
            daysTotal: Number(m.daysTotal) || 30,
            daysRemaining: Number(m.daysRemaining) || 0,
            isLastDay: Boolean(m.isLastDay),
            isExpired: Boolean(m.isExpired),
          };
        }
        onSessionUpdate(patch);
        if (data.accessBlocked || nextQuota.paymentRequired) {
          const msg =
            typeof data.blockReason === "string"
              ? data.blockReason
              : nextQuota.paymentRequired
                ? PAYMENT_REQUIRED_MSG
                : MEMBERSHIP_EXPIRED_MSG;
          await onLogout(msg);
          return;
        }
      }
      const content = typeof data.content === "string" ? data.content : "";
      stopFakeProgress(progressIntervalRef);
      setLoadProgress(100);
      await new Promise((r) => setTimeout(r, 420));
      setResultText(content);
      const fromMd = firstImageOnly(extractImagesFromText(content));
      setPosterUrls(fromMd);
      if (fromMd.length > 0) {
        const url = fromMd[0];
        setGenerationHistory((prev) => {
          const item: GenerationHistoryItem = {
            id:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            imageUrl: url,
            promptLabel: p.slice(0, 200),
            at: Date.now(),
          };
          return [...prev, item].slice(-MAX_HISTORY_ITEMS);
        });
        if (autoChainNext) {
          setChainedRefUrl(url);
        }
      }
      setLoadProgress(0);
      setStatus("done");
    } catch (e) {
      stopFakeProgress(progressIntervalRef);
      setLoadProgress(0);
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="shell">
      <div className="noise" aria-hidden="true" />
      <header className="top">
        <div className="brand">
          <span className="logo">Usee</span>
          <span className="tagline">
            Text-to-image · up to two reference frames · one output still
          </span>
        </div>
        <div className="session-bar">
          <span className="session-user">{username}</span>
          <span className="session-quota">
            Free: {quota.remaining}/{quota.freeLimit}
            {membership.expiresAt != null && !membership.isExpired
              ? ` · ${membership.daysRemaining}d left`
              : ""}
          </span>
          <button type="button" className="link-btn session-logout" onClick={() => void onLogout()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="grid">
        <section className="panel inputs">
          <div className="panel-head">
            <h2 className="panel-title">Input</h2>
            <span className="panel-index">01</span>
          </div>
          <div className="field">
            <span className="label">Reference (optional, max 2)</span>
            <div className="ref-grid">
              <label className="dropzone dropzone--small">
                <span className="sr-only">Reference frame A</span>
                <input
                  type="file"
                  accept="image/*"
                  className="file-input"
                  onChange={(e) => onPickFile(0, e.target.files?.[0])}
                />
                {filePreview1 ? (
                  <img src={filePreview1} alt="Reference A preview" className="thumb" />
                ) : (
                  <p className="hint">
                    <span className="hint-num">A+</span>
                  </p>
                )}
              </label>
              <label className="dropzone dropzone--small">
                <span className="sr-only">Reference frame B</span>
                <input
                  type="file"
                  accept="image/*"
                  className="file-input"
                  onChange={(e) => onPickFile(1, e.target.files?.[0])}
                />
                {filePreview2 ? (
                  <img src={filePreview2} alt="Reference B preview" className="thumb" />
                ) : (
                  <p className="hint">
                    <span className="hint-num">B+</span>
                  </p>
                )}
              </label>
            </div>
            {(filePreview1 || filePreview2) && (
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setFilePreview1(null);
                  setFilePreview2(null);
                }}
              >
                Clear references
              </button>
            )}
          </div>

          <div className="field">
            <span className="label">Iterate from output</span>
            <p className="field-hint">
              Chained images are sent first as references; local uploads fill A+/B+ slots (max 2 total). The
              server downloads HTTPS references and inlines them as base64 before calling the model so upstream
              never misses an external image URL.
            </p>
            <div className="loop-always-row">
              <button
                type="button"
                className={`toggle-switch${autoChainNext ? " toggle-switch--on" : ""}`}
                role="switch"
                aria-checked={autoChainNext}
                aria-label="LOOP ALWAYS"
                onClick={() => setAutoChainNext((v) => !v)}
              >
                <span className="toggle-switch-thumb" aria-hidden />
              </button>
              <span
                className={`loop-always-label${
                  autoChainNext ? " loop-always-label--on" : " loop-always-label--off"
                }`}
              >
                LOOP ALWAYS
              </span>
            </div>
            {chainedRefUrl && (
              <div className="chain-banner">
                <img src={chainedRefUrl} alt="" />
                <div className="chain-banner-meta">
                  <span className="chain-banner-title">Chained</span>
                  <button type="button" className="link-btn" onClick={() => setChainedRefUrl(null)}>
                    Clear chain
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="field">
            <span className="label">Output format · platform size</span>
            <p className="field-hint">
              Injects pixel specs into the request (model-guided). Relay API has no native px control —
              results are approximate.
            </p>
            <select
              className="select"
              value={canvasPresetId}
              onChange={(e) => setCanvasPresetId(e.target.value)}
              aria-label="Output platform preset"
            >
              <option value={CANVAS_NONE_ID}>No preset — default</option>
              {CANVAS_PRESETS.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.label} · {pr.scene} (
                  {pr.height === 0 ? `${pr.width} × fluid` : `${pr.width}×${pr.height}`})
                </option>
              ))}
              <option value={CANVAS_CUSTOM_ID}>Custom · width × height</option>
            </select>
            {canvasPresetId === CANVAS_CUSTOM_ID && (
              <div className="canvas-custom">
                <label className="canvas-custom-field">
                  <span className="canvas-custom-label">W px</span>
                  <input
                    type="number"
                    className="canvas-num"
                    min={64}
                    max={8192}
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                  />
                </label>
                <label className="canvas-custom-field">
                  <span className="canvas-custom-label">H px</span>
                  <input
                    type="number"
                    className="canvas-num"
                    min={64}
                    max={8192}
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                  />
                </label>
                <label className="canvas-custom-field">
                  <span className="canvas-custom-label">DPI</span>
                  <input
                    type="number"
                    className="canvas-num"
                    min={1}
                    max={600}
                    value={customDpi}
                    onChange={(e) => setCustomDpi(e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          <label className="field">
            <span className="label">Prompt · required</span>
            <textarea
              className="textarea"
              rows={6}
              placeholder="e.g. cyberpunk festival poster, hero type LABOR DAY 05/01, neon rain, high contrast… With refs: say how A/B inform layout or palette."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>

          <button
            type="button"
            className="primary"
            disabled={status === "loading"}
            onClick={generate}
          >
            <span
              className={
                status === "loading" ? "primary-label primary-label--loading" : "primary-label"
              }
            >
              {status === "loading" ? "Working…" : "Let me see see ↵"}
            </span>
          </button>

          {error && <p className="err">{error}</p>}
        </section>

        <section className="panel output">
          <div className="panel-head">
            <h2 className="panel-title">Output</h2>
            <span className="panel-index">02</span>
          </div>
          {status === "idle" && (
            <p className="placeholder">
              One poster per run. Click the frame to expand. Raw model text appears here if no image
              URL is parsed.
            </p>
          )}
          {status === "loading" && (
            <div className="loading-output">
              <div className="skeleton-wrap">
                <div className="skeleton" aria-hidden="true" />
              </div>
              <div
                className="progress-row"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, Math.max(1, Math.round(loadProgress)))}
                aria-label="Generation progress"
              >
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.min(100, Math.max(1, loadProgress))}%`,
                    }}
                  />
                </div>
                <span className="progress-label">
                  {Math.min(100, Math.max(1, Math.round(loadProgress)))}%
                </span>
              </div>
            </div>
          )}
          {(status === "done" || status === "error") && generatedImages.length > 0 && (
            <div className="output-main-block">
              <div className="gallery gallery--single">
                {generatedImages.map((url, i) => (
                  <button
                    key={`${url}-${i}`}
                    type="button"
                    className="tile"
                    onClick={() => setLightbox(url)}
                  >
                    <img src={url} alt="Generated poster" />
                  </button>
                ))}
              </div>
              <div className="output-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => setChainedRefUrl(generatedImages[0])}
                >
                  Use this result as before for next edit
                </button>
                <button type="button" className="link-btn" onClick={saveAllLinks}>
                  Save all links
                </button>
              </div>
              {linksSaveHint && generationHistory.length === 0 && (
                <p className="field-hint history-save-hint">{linksSaveHint}</p>
              )}
            </div>
          )}
          {status === "done" && generatedImages.length === 0 && resultText && (
            <div className="text-out">
              <p className="label">Model response · copy if needed</p>
              <pre className="pre">{resultText}</pre>
            </div>
          )}

          {generationHistory.length > 0 && (
            <div className="history-bar">
              <div className="history-bar-head">
                <span className="label">Generation history</span>
                <div className="history-bar-actions">
                  <button type="button" className="link-btn" onClick={saveAllLinks}>
                    Save all links
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setGenerationHistory([]);
                      try {
                        localStorage.removeItem(HISTORY_STORAGE_KEY);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    Clear all
                  </button>
                </div>
              </div>
              {linksSaveHint && <p className="field-hint history-save-hint">{linksSaveHint}</p>}
              <p className="field-hint history-bar-hint">
                Newest on the right. Click thumb to preview; use “Chain” to use that frame before the next
                generation. “Save all links” exports every history URL to a .txt file and copies to clipboard.
              </p>
              <div className="history-strip" role="list">
                {generationHistory.map((h) => (
                  <div key={h.id} className="history-chip-wrap" role="listitem">
                    <button
                      type="button"
                      className="history-chip"
                      title={h.promptLabel}
                      onClick={() => setLightbox(h.imageUrl)}
                    >
                      <img src={h.imageUrl} alt="" loading="lazy" />
                      <span className="history-chip-time">{shortTime(h.at)}</span>
                    </button>
                    <button
                      type="button"
                      className="history-chain-btn"
                      title="Use before next generation"
                      onClick={() => setChainedRefUrl(h.imageUrl)}
                    >
                      Chain
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {showExpiryModal && (
        <ExpiryModal expiresAt={membership.expiresAt} onDismiss={dismissExpiryModal} />
      )}

      {lightbox && (
        <button
          type="button"
          className="lightbox"
          aria-label="Close preview"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Full preview" onClick={(e) => e.stopPropagation()} />
        </button>
      )}

    </div>
  );
}
