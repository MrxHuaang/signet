import type { PointGroup } from "signature_pad";

/**
 * Stroke beautifier. Takes the raw pointer samples and redraws each stroke as
 * a clean pen line: jitter resampled away, the path smoothed, one even width
 * through the body and tapered ends, like a fine fountain pen.
 */

type P = { x: number; y: number };

/** Distance between resampled points, in CSS px. */
const STEP = 1.5;
/** Moving-average radius (in resampled points) and how many passes. */
const SMOOTH_RADIUS = 4;
const SMOOTH_PASSES = 2;
/** Taper lengths in CSS px: a soft entry and a longer exit flick. */
const TAPER_IN = 10;
const TAPER_OUT = 24;
const TAPER_IN_MIN = 0.45;
const TAPER_OUT_MIN = 0.22;
/** Width is resolved per chunk of this many points inside the tapers. */
const CHUNK = 3;

export type Segment = { d: string; width: number };
export type BeautyStroke = { color: string; segments: Segment[] };

const dist = (a: P, b: P) => Math.hypot(b.x - a.x, b.y - a.y);

function resample(points: P[]): P[] {
  const out: P[] = [points[0]];
  let prev = points[0];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const cur = points[i];
    let d = dist(prev, cur);
    while (carry + d >= STEP && d > 0) {
      const t = (STEP - carry) / d;
      const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
      out.push(q);
      prev = q;
      d = dist(prev, cur);
      carry = 0;
    }
    carry += d;
    prev = cur;
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > STEP * 0.3) out.push(last);
  return out;
}

/** Moving average with a window that shrinks at the ends, so endpoints stay put. */
function smooth(points: P[]): P[] {
  let pts = points;
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    pts = pts.map((_, i) => {
      const r = Math.min(SMOOTH_RADIUS, i, pts.length - 1 - i);
      let x = 0;
      let y = 0;
      for (let j = i - r; j <= i + r; j++) {
        x += pts[j].x;
        y += pts[j].y;
      }
      const n = r * 2 + 1;
      return { x: x / n, y: y / n };
    });
  }
  return pts;
}

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

function widthAt(s: number, length: number, base: number) {
  // Short strokes (dots, accents) get proportionally shorter tapers.
  const scale = Math.min(1, length / (TAPER_IN + TAPER_OUT + 12));
  const tin = TAPER_IN * scale;
  const tout = TAPER_OUT * scale;
  let k = 1;
  if (tin > 0 && s < tin) k = TAPER_IN_MIN + (1 - TAPER_IN_MIN) * easeOut(s / tin);
  const fromEnd = length - s;
  if (tout > 0 && fromEnd < tout) k = Math.min(k, TAPER_OUT_MIN + (1 - TAPER_OUT_MIN) * easeOut(fromEnd / tout));
  return base * k;
}

const fmt = (p: P) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

function polyline(pts: P[]) {
  return `M${fmt(pts[0])}` + pts.slice(1).map((p) => `L${fmt(p)}`).join("");
}

/**
 * Width the beautified pen uses for a group. Raw ink spends most of its time
 * near maxWidth (slow, deliberate movement), so the even line sits just under
 * it to keep the same visual weight.
 */
export function penWidth(g: Pick<PointGroup, "minWidth" | "maxWidth">) {
  return g.maxWidth * 0.78;
}

export function beautify(groups: PointGroup[]): BeautyStroke[] {
  return groups.map((g) => {
    const base = penWidth(g);
    const raw = g.points.map(({ x, y }) => ({ x, y }));

    if (raw.length < 2 || raw.every((p) => dist(p, raw[0]) < 1)) {
      // A tap: a single round dot.
      const p = raw[0];
      return { color: g.penColor, segments: [{ d: `M${fmt(p)}L${fmt({ x: p.x + 0.01, y: p.y })}`, width: base * 1.15 }] };
    }

    const pts = smooth(resample(raw));
    const arc = [0];
    for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + dist(pts[i - 1], pts[i]));
    const length = arc[arc.length - 1];

    // Walk the stroke in chunks; consecutive chunks of the same width merge,
    // so the even body of the line becomes one long path.
    const segments: Segment[] = [];
    let start = 0;
    while (start < pts.length - 1) {
      const end = Math.min(start + CHUNK, pts.length - 1);
      const width = widthAt((arc[start] + arc[end]) / 2, length, base);
      const prev = segments[segments.length - 1];
      const slice = pts.slice(start, end + 1);
      if (prev && Math.abs(prev.width - width) < 0.01) {
        prev.d += slice.slice(1).map((p) => `L${fmt(p)}`).join("");
      } else {
        segments.push({ d: polyline(slice), width });
      }
      start = end;
    }
    return { color: g.penColor, segments };
  });
}

export function paintStrokes(ctx: CanvasRenderingContext2D, strokes: BeautyStroke[]) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    ctx.strokeStyle = s.color;
    for (const seg of s.segments) {
      ctx.lineWidth = seg.width;
      ctx.stroke(new Path2D(seg.d));
    }
  }
  ctx.restore();
}

export function strokesToSVG(strokes: BeautyStroke[], width: number, height: number) {
  const body = strokes
    .map(
      (s) =>
        `<g stroke="${s.color}">` +
        s.segments.map((seg) => `<path d="${seg.d}" stroke-width="${seg.width.toFixed(2)}"/>`).join("") +
        `</g>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  );
}
