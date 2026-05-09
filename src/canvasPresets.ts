/** Mirrors design-system-sizes.md — guides the model via prompt (no native px API on relay). */

export const CANVAS_NONE_ID = "none";
export const CANVAS_CUSTOM_ID = "custom";

export type CanvasPreset = {
  id: string;
  /** Dropdown label */
  label: string;
  scene: string;
  /** 0 = flexible height */
  width: number;
  height: number;
  ratio: string;
  dpi: number;
  maxFileSize?: string;
  notes?: string;
};

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: "douyin-video", label: "Douyin", scene: "Video cover", width: 1080, height: 1920, ratio: "9:16", dpi: 72, maxFileSize: "3MB" },
  { id: "douyin-topic", label: "Douyin", scene: "Topic background", width: 750, height: 1334, ratio: "—", dpi: 72, maxFileSize: "2MB" },
  { id: "douyin-profile", label: "Douyin", scene: "Profile cover", width: 1125, height: 633, ratio: "16:9", dpi: 72 },
  { id: "douyin-avatar", label: "Douyin", scene: "Avatar", width: 400, height: 400, ratio: "1:1", dpi: 72 },
  { id: "douyin-shop", label: "Douyin", scene: "Shop product main", width: 800, height: 800, ratio: "1:1", dpi: 72, maxFileSize: "3MB" },
  { id: "xhs-cover-34", label: "Xiaohongshu", scene: "Note cover (3:4)", width: 1080, height: 1440, ratio: "3:4", dpi: 72, notes: "Max feed area" },
  { id: "xhs-cover-11", label: "Xiaohongshu", scene: "Note cover (1:1)", width: 1080, height: 1080, ratio: "1:1", dpi: 72 },
  { id: "xhs-cover-43", label: "Xiaohongshu", scene: "Note cover (4:3)", width: 1080, height: 810, ratio: "4:3", dpi: 72 },
  { id: "xhs-profile", label: "Xiaohongshu", scene: "Profile background (5:4)", width: 1000, height: 800, ratio: "5:4", dpi: 72, notes: "Avatar area may occlude left" },
  { id: "mobile-full", label: "Phone poster", scene: "Full vertical", width: 1080, height: 1920, ratio: "9:16", dpi: 72 },
  { id: "mobile-share-34", label: "Phone poster", scene: "Share (3:4)", width: 1080, height: 1440, ratio: "3:4", dpi: 72 },
  { id: "mobile-sq", label: "Phone poster", scene: "Square share", width: 1080, height: 1080, ratio: "1:1", dpi: 72 },
  { id: "taobao-main", label: "Taobao", scene: "Product main (1–4)", width: 800, height: 800, ratio: "1:1", dpi: 72, maxFileSize: "3MB" },
  { id: "taobao-white", label: "Taobao", scene: "5th white-bg", width: 800, height: 800, ratio: "1:1", dpi: 72, maxFileSize: "300KB", notes: "Pure white flat background, no watermark/logo/text" },
  { id: "taobao-long", label: "Taobao", scene: "Vertical long", width: 800, height: 1200, ratio: "2:3", dpi: 72, maxFileSize: "3MB" },
  { id: "taobao-pc-detail", label: "Taobao", scene: "PC detail slice", width: 750, height: 0, ratio: "fluid height", dpi: 72, notes: "Width 750px; height as long as design needs" },
  { id: "taobao-m-detail", label: "Taobao", scene: "Mobile detail", width: 640, height: 1300, ratio: "≤1300px tall", dpi: 72, notes: "Single slice max height 1300px" },
];

export type CustomCanvasInput = {
  width: number;
  height: number;
  dpi: number;
};

export function buildOutputSizeBlock(
  presetId: string,
  custom: CustomCanvasInput
): string | null {
  if (!presetId || presetId === CANVAS_NONE_ID) return null;

  if (presetId === CANVAS_CUSTOM_ID) {
    const { width: w, height: h, dpi } = custom;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 64 || h < 64 || w > 8192 || h > 8192) {
      return null;
    }
    return formatBlock({
      label: "Custom",
      scene: "User dimensions",
      width: w,
      height: h,
      ratio: simplifyRatio(w, h),
      dpi,
    });
  }

  const p = CANVAS_PRESETS.find((x) => x.id === presetId);
  if (!p) return null;
  return formatBlock({
    label: p.label,
    scene: p.scene,
    width: p.width,
    height: p.height,
    ratio: p.ratio,
    dpi: p.dpi,
    maxFileSize: p.maxFileSize,
    notes: p.notes,
  });
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function simplifyRatio(w: number, h: number): string {
  const g = gcd(w, h);
  return `${w / g}:${h / g}`;
}

function formatBlock(p: {
  label: string;
  scene: string;
  width: number;
  height: number;
  ratio: string;
  dpi: number;
  maxFileSize?: string;
  notes?: string;
}): string {
  const lines: string[] = [
    "[OUTPUT SIZE — follow for the final single image]",
    `• Platform / scene: ${p.label} — ${p.scene}`,
  ];

  if (p.width > 0 && p.height > 0) {
    lines.push(`• Exact pixel dimensions: ${p.width} × ${p.height} px`, `• Target aspect: ${p.ratio}`);
  } else if (p.width > 0 && p.height === 0) {
    lines.push(
      `• Fixed width: ${p.width} px; height: extend vertically as needed for the content (one continuous canvas / long page).`,
      `• Target aspect: ${p.ratio}`
    );
  }

  lines.push(`• Color: RGB · ${p.dpi} DPI (screen export)`);
  if (p.maxFileSize) lines.push(`• File size hint: ≤ ${p.maxFileSize} when exported as JPG/PNG if applicable`);
  if (p.notes) lines.push(`• Note: ${p.notes}`);
  lines.push(
    "• Keep key content within ~5% margin from edges unless the design intentionally full-bleeds.",
    "• The generated artwork should be composed for this exact format (no extra letterboxing unless spec is wide fluid)."
  );
  return lines.join("\n");
}

export function parsePositiveInt(s: string, fallback: number): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
