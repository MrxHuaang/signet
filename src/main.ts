import SignaturePad, { type PointGroup } from "signature_pad";
import "@fontsource-variable/geist";
import "./style.css";
import { beautify, paintStrokes, strokesToSVG } from "./beautify";

import signatureIcon from "@phosphor-icons/core/assets/regular/signature.svg?raw";
import githubIcon from "@phosphor-icons/core/assets/regular/github-logo.svg?raw";
import instagramIcon from "@phosphor-icons/core/assets/regular/instagram-logo.svg?raw";
import undoIcon from "@phosphor-icons/core/assets/regular/arrow-counter-clockwise.svg?raw";
import trashIcon from "@phosphor-icons/core/assets/regular/trash.svg?raw";
import expandIcon from "@phosphor-icons/core/assets/regular/arrows-out.svg?raw";
import checkIcon from "@phosphor-icons/core/assets/regular/check.svg?raw";
import downloadIcon from "@phosphor-icons/core/assets/regular/download-simple.svg?raw";
import copyIcon from "@phosphor-icons/core/assets/regular/copy.svg?raw";
import shieldIcon from "@phosphor-icons/core/assets/regular/shield-check.svg?raw";
import sparkleIcon from "@phosphor-icons/core/assets/regular/sparkle.svg?raw";

const ICONS: Record<string, string> = {
  signature: signatureIcon,
  github: githubIcon,
  instagram: instagramIcon,
  undo: undoIcon,
  trash: trashIcon,
  expand: expandIcon,
  check: checkIcon,
  download: downloadIcon,
  copy: copyIcon,
  shield: shieldIcon,
  sparkle: sparkleIcon,
};

document.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
  el.innerHTML = ICONS[el.dataset.icon!] ?? "";
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const padEl = $<HTMLDivElement>("pad");
const canvas = $<HTMLCanvasElement>("canvas");
const undoBtn = $<HTMLButtonElement>("undo");
const clearBtn = $<HTMLButtonElement>("clear");
const expandBtn = $<HTMLButtonElement>("expand");
const beautifyBtn = $<HTMLButtonElement>("beautify");
const preview = $<HTMLImageElement>("preview");
const previewEmpty = $<HTMLElement>("preview-empty");
const pngBtn = $<HTMLButtonElement>("download-png");
const copyBtn = $<HTMLButtonElement>("copy");
const whiteBtn = $<HTMLButtonElement>("download-white");
const svgBtn = $<HTMLButtonElement>("download-svg");
const statusEl = $<HTMLParagraphElement>("status");

$("year").textContent = String(new Date().getFullYear());

/** Stroke presets: the pen gets thinner the faster you move, like real ink. */
const WEIGHTS = {
  fine: { minWidth: 0.5, maxWidth: 2.1 },
  medium: { minWidth: 0.9, maxWidth: 3.2 },
  bold: { minWidth: 1.6, maxWidth: 4.8 },
} as const;
type Weight = keyof typeof WEIGHTS;

/** Exported PNGs are drawn at this many pixels per CSS pixel of the pad. */
const EXPORT_SCALE = 4;
const MAX_EXPORT_SIDE = 4096;
/** Breathing room around the trimmed signature, in CSS pixels. */
const TRIM_MARGIN = 10;

const pad = new SignaturePad(canvas, {
  penColor: "#16181d",
  ...WEIGHTS.medium,
  minDistance: 2,
  throttle: 0,
  velocityFilterWeight: 0.6,
  backgroundColor: "rgba(0,0,0,0)",
});

// ---------- canvas sizing ----------

const guideLine = padEl.querySelector<HTMLElement>(".guide-line")!;
let box = { w: 0, h: 0, baseline: 0 };

/**
 * Match the canvas backing store to its CSS box at the device pixel ratio, so
 * strokes stay sharp. When the box changes (rotation, expanding the pad) the
 * drawing is scaled with the width and kept sitting on the signing line.
 */
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (!w || !h || (w === box.w && h === box.h)) return;

  const baseline = guideLine.getBoundingClientRect().top - rect.top;
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const data = copyData();
  // Width-only scale keeps expand and collapse exact inverses of each other.
  const k = box.w ? w / box.w : 1;
  const from = box.baseline;

  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.getContext("2d")!.scale(ratio, ratio);
  box = { w, h, baseline };

  pad.clear();
  if (data.length) {
    pad.fromData(
      data.map((g) => ({
        ...g,
        points: g.points.map((p) => ({ ...p, x: p.x * k, y: (p.y - from) * k + baseline })),
      })),
    );
  }
  paintPretty();
  renderPreview();
}

let fitQueued = false;
new ResizeObserver(() => {
  if (fitQueued) return;
  fitQueued = true;
  requestAnimationFrame(() => {
    fitQueued = false;
    fitCanvas();
  });
}).observe(canvas);

// ---------- state ----------

function copyData(): PointGroup[] {
  return pad.toData().map((g) => ({ ...g, points: [...g.points] }));
}

function hasInk() {
  return pad.toData().length > 0;
}

function sync() {
  const inked = hasInk();
  padEl.dataset.empty = String(!inked);
  for (const b of [undoBtn, clearBtn, beautifyBtn, pngBtn, copyBtn, whiteBtn, svgBtn]) b.disabled = !inked;
  paintPretty();
  renderPreview();
}

function redraw(data: PointGroup[]) {
  pad.clear();
  if (data.length) pad.fromData(data);
  sync();
}

pad.addEventListener("beginStroke", () => {
  padEl.dataset.empty = "false";
  setStatus("");
});
pad.addEventListener("endStroke", sync);

// ---------- beautify ----------

/** Beautified view: the raw samples stay in the pad, only the rendering changes. */
let pretty = false;

function paintPretty() {
  if (!pretty || !hasInk()) return;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  paintStrokes(ctx, beautify(pad.toData()));
}

beautifyBtn.addEventListener("click", () => {
  pretty = !pretty;
  beautifyBtn.setAttribute("aria-pressed", String(pretty));
  if (pretty) sync();
  else redraw(copyData());
  setStatus(pretty ? "Trazo embellecido. Tócalo otra vez para ver el original." : "Trazo original");
});

function undo() {
  const data = copyData();
  if (!data.length) return;
  data.pop();
  redraw(data);
}

undoBtn.addEventListener("click", undo);
clearBtn.addEventListener("click", () => redraw([]));

window.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea")) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undo();
  } else if (e.key === "Escape" && padEl.classList.contains("is-expanded")) {
    setExpanded(false);
  }
});

// Ink and weight restyle the whole signature, not only the next stroke:
// a signature is one pen.
document.querySelectorAll<HTMLInputElement>('input[name="ink"]').forEach((input) => {
  input.addEventListener("change", () => {
    pad.penColor = input.value;
    redraw(copyData().map((g) => ({ ...g, penColor: input.value })));
  });
});

document.querySelectorAll<HTMLInputElement>('input[name="weight"]').forEach((input) => {
  input.addEventListener("change", () => {
    const w = WEIGHTS[input.value as Weight];
    pad.minWidth = w.minWidth;
    pad.maxWidth = w.maxWidth;
    redraw(copyData().map((g) => ({ ...g, ...w })));
  });
});

// ---------- expand ----------

function setExpanded(on: boolean) {
  const apply = () => {
    padEl.classList.toggle("is-expanded", on);
    document.body.classList.toggle("is-locked", on);
    expandBtn.setAttribute("aria-pressed", String(on));
    expandBtn.setAttribute("aria-label", on ? "Listo, volver" : "Ampliar el área de firma");
    expandBtn.title = on ? "Listo" : "Ampliar";
    fitCanvas();
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduce) document.startViewTransition(apply);
  else apply();
}

expandBtn.addEventListener("click", () => setExpanded(!padEl.classList.contains("is-expanded")));

// ---------- export ----------

/** The signature as SVG, trimmed to its own ink plus a small margin. */
function trimmedSVG(scale = 1): { svg: string; w: number; h: number } | null {
  const data = pad.toData();
  if (!data.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of data) {
    const r = g.maxWidth;
    for (const p of g.points) {
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }
  }
  const x = minX - TRIM_MARGIN;
  const y = minY - TRIM_MARGIN;
  const w = maxX - minX + TRIM_MARGIN * 2;
  const h = maxY - minY + TRIM_MARGIN * 2;

  const source = pretty ? strokesToSVG(beautify(data), box.w, box.h) : pad.toSVG();
  const doc = new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = doc.documentElement;
  svg.setAttribute("viewBox", `${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
  svg.setAttribute("width", (w * scale).toFixed(2));
  svg.setAttribute("height", (h * scale).toFixed(2));
  return { svg: new XMLSerializer().serializeToString(svg), w, h };
}

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function renderPreview() {
  const out = trimmedSVG();
  preview.hidden = !out;
  previewEmpty.hidden = !!out;
  if (out) preview.src = svgUrl(out.svg);
  else preview.removeAttribute("src");
}

/** Rasterises the trimmed vector, so the PNG is sharp at any export size. */
async function toPNG(background?: string): Promise<Blob> {
  const base = trimmedSVG();
  if (!base) throw new Error("empty");
  const scale = Math.min(EXPORT_SCALE, MAX_EXPORT_SIDE / Math.max(base.w, base.h));
  const width = Math.round(base.w * scale);
  const height = Math.round(base.h * scale);

  const img = new Image();
  img.src = svgUrl(trimmedSVG(scale)!.svg);
  await img.decode();

  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
  );
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let statusTimer = 0;
function setStatus(text: string) {
  clearTimeout(statusTimer);
  statusEl.textContent = text;
  statusEl.classList.remove("is-shown");
  if (!text) return;
  void statusEl.offsetWidth;
  statusEl.classList.add("is-shown");
  statusTimer = window.setTimeout(() => (statusEl.textContent = ""), 3200);
}

async function run(btn: HTMLButtonElement, task: () => Promise<string>) {
  btn.disabled = true;
  try {
    setStatus(await task());
  } catch (err) {
    console.error(err);
    setStatus("No se pudo completar. Prueba de nuevo.");
  } finally {
    btn.disabled = !hasInk();
  }
}

pngBtn.addEventListener("click", () =>
  run(pngBtn, async () => {
    save(await toPNG(), "firma.png");
    return "Descargada como firma.png";
  }),
);

whiteBtn.addEventListener("click", () =>
  run(whiteBtn, async () => {
    save(await toPNG("#ffffff"), "firma-fondo-blanco.png");
    return "Descargada como firma-fondo-blanco.png";
  }),
);

svgBtn.addEventListener("click", () =>
  run(svgBtn, async () => {
    save(new Blob([trimmedSVG()!.svg], { type: "image/svg+xml" }), "firma.svg");
    return "Descargada como firma.svg";
  }),
);

copyBtn.addEventListener("click", () =>
  run(copyBtn, async () => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      save(await toPNG(), "firma.png");
      return "Tu navegador no permite copiar imágenes. La descargamos.";
    }
    // Safari needs the ClipboardItem created synchronously with a pending blob.
    await navigator.clipboard.write([new ClipboardItem({ "image/png": toPNG() })]);
    return "Copiada. Pégala con Ctrl + V";
  }),
);

// ---------- how-to tabs ----------

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'));

function selectTab(tab: HTMLButtonElement, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute("aria-controls")!).hidden = !on;
  }
  if (focus) tab.focus();
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    selectTab(tabs[(i + step + tabs.length) % tabs.length], true);
  });
});

fitCanvas();
sync();
