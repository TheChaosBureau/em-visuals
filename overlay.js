// Overlay: the words and symbols on top of a scene, driven by timeline cues.
//
//   caption   one or two lines in the lower third
//   label     a name and a value attached to a point in the scene; projected
//             every frame and pushed outside the silhouette of the geometry
//   equation  a short formula set as SVG text (italic variables, upright
//             operators and units, sub/superscripts) — no runtime fetches
//
// Text stays inside a safe area: 5 % from every edge, and in a vertical frame
// clear of the top 12 % and bottom 20 %, where phone interfaces sit.
//
// In WebXR the DOM is not visible, so update({ sprites: true }) draws the same
// cues as in-scene sprites instead.
//
// The layout is a pure function of its inputs: nothing is remembered between
// frames, so a frame looks the same whenever it is drawn.

export const SAFE = Object.freeze({ edge: 0.05, verticalTop: 0.12, verticalBottom: 0.20 });

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const smoothstep = (a, b, v) => { const u = clamp((v - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

// The rectangle that text must stay inside, in the same units as width/height.
export function safeArea(width, height) {
  const vertical = height > width;
  return {
    preset: vertical ? 'vertical' : 'wide',
    left: width * SAFE.edge,
    right: width * (1 - SAFE.edge),
    top: height * (vertical ? SAFE.verticalTop : SAFE.edge),
    bottom: height * (1 - (vertical ? SAFE.verticalBottom : SAFE.edge))
  };
}

// Bands inside the safe area: equation on top, caption in the lower third, and
// between them the stage where the subject and its labels live. `centre` is
// where a scene should put its point of interest; `unit` scales all type.
export function stageLayout(width, height) {
  const safe = safeArea(width, height), h = safe.bottom - safe.top;
  const equation = { left: safe.left, right: safe.right, top: safe.top, bottom: safe.top + h * 0.15 };
  const caption = { left: safe.left, right: safe.right, top: safe.bottom - h * 0.17, bottom: safe.bottom };
  const stage = { left: safe.left, right: safe.right, top: equation.bottom, bottom: caption.top };
  return {
    safe, equation, caption, stage,
    unit: Math.max(Math.min(width, height) / 100, 5.5),      // never smaller than legible on a small screen
    centre: [(stage.left + stage.right) / 2, (stage.top + stage.bottom) / 2]
  };
}

// "{power}" → values.power
export function fillTemplate(text, values = {}) {
  return String(text ?? '').replace(/\{([\w-]+)\}/g, (_, name) => values[name] ?? '');
}

// "[potential](potential) times [flow](flow)" → runs of text, some carrying a colour key.
export function parseMarkup(text) {
  const runs = [], pattern = /\[([^\]]+)\]\(([\w-]+)\)/g;
  let last = 0, m;
  while ((m = pattern.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), key: null });
    runs.push({ text: m[1], key: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), key: null });
  return runs;
}

/* ─────────────────────────────────────────────────────────────── equations */
const FUNCTIONS = new Set(['cos', 'sin', 'tan', 'exp', 'ln', 'log', 'max', 'min']);
const RELATIONS = new Set(['=', '≈', '≠', '<', '>', '≤', '≥', '→']);
const BINARY = new Set(['+', '−', '×', '·', '/', '±']);
const WORD = /^\p{L}[\p{L}\p{M}]*/u, NUMBER = /^\d+(?:[.,]\d+)?/;
const letters = word => [...word].filter(ch => /\p{L}/u.test(ch)).length;

// A tiny formatter, enough for "p = v × i", "E = ∫ p dt", "P = V_rms I_rms cos φ"
// and "E = 24 W × 3 s = 72 J". Returns a flat list of tokens:
//   kind   var | num | unit | fn | text | diff | rel | bin | unary | int | paren | punct
//   level  0 on the baseline, −1 subscript, +1 superscript
export function parseEquation(src) {
  const out = [];
  const text = String(src).replace(/\*/g, '×').replace(/-/g, '−');
  const scan = (s, level) => {
    let i = 0;
    const prev = () => { for (let k = out.length - 1; k >= 0; k--) if (out[k].level === level) return out[k]; return null; };
    while (i < s.length) {
      const rest = s.slice(i), ch = rest[0];
      if (/\s/.test(ch)) { i++; continue; }
      if ((ch === '_' || ch === '^') && rest.length > 1) {
        let body, used;
        if (rest[1] === '{') { const end = rest.indexOf('}'); body = rest.slice(2, end < 0 ? rest.length : end); used = end < 0 ? rest.length : end + 1; }
        else { body = (rest.slice(1).match(WORD) ?? rest.slice(1).match(NUMBER) ?? [rest[1]])[0]; used = 1 + body.length; }
        scan(body, ch === '_' ? -1 : 1);
        i += used; continue;
      }
      const number = rest.match(NUMBER);
      if (number) { out.push({ text: number[0], kind: 'num', level }); i += number[0].length; continue; }
      const word = rest.match(WORD);
      if (word) {
        const w = word[0], p = prev(), n = letters(w);
        if (level !== 0) out.push({ text: w, kind: n === 1 ? 'var' : 'text', level });
        else if (p?.kind === 'unit' && /[·/]$/.test(p.text)) p.text += w;                    // V·s, m/s
        else if (p?.kind === 'num') out.push({ text: w, kind: 'unit', level });
        else if (FUNCTIONS.has(w)) out.push({ text: w, kind: 'fn', level });
        else if (n === 2 && w[0] === 'd' && w.normalize('NFD').length === 2) out.push({ text: 'd', kind: 'diff', level }, { text: w.slice(1), kind: 'var', level });
        else out.push({ text: w, kind: n === 1 ? 'var' : 'text', level });
        i += w.length; continue;
      }
      const p = prev();
      if ((ch === '·' || ch === '/') && p?.kind === 'unit') p.text += ch;
      else if (RELATIONS.has(ch)) out.push({ text: ch, kind: 'rel', level });
      else if (ch === '∫') out.push({ text: ch, kind: 'int', level });
      else if (ch === '(' || ch === ')') out.push({ text: ch, kind: 'paren', level });
      else if (ch === ',' || ch === ';') out.push({ text: ch, kind: 'punct', level });
      else if (BINARY.has(ch)) {
        const operand = p && (p.kind === 'var' || p.kind === 'num' || p.kind === 'unit' || p.kind === 'text' || p.text === ')');
        out.push({ text: ch, kind: operand ? 'bin' : 'unary', level });
      } else out.push({ text: ch, kind: 'text', level });
      i++;
    }
  };
  scan(text, 0);
  return out;
}

// Plain-text reading of an equation (accessible name, sprite fallback).
export function equationText(tokens) {
  let s = '';
  tokens.forEach((tok, i) => {
    const prev = tokens[i - 1];
    if (tok.level) { s += (tok.level < 0 ? '_' : '^') + tok.text; return; }
    const tight = !prev || tok.kind === 'punct' || tok.kind === 'paren' && (tok.text === ')' || prev.kind === 'fn') || prev.kind === 'paren' && prev.text === '(' || prev.kind === 'unary' || prev.kind === 'diff';
    s += (tight ? '' : ' ') + tok.text;
  });
  return s;
}

const BEFORE = { rel: 0.30, bin: 0.24, unit: 0.17, diff: 0.17, fn: 0.17, int: 0.12, unary: 0.12 };
const AFTER = { rel: 0.30, bin: 0.24, fn: 0.17, int: 0.16, punct: 0.8 };

// Typeset tokens into runs for a renderer. Sizes, shifts and spaces are in ems
// of the base font; shift is positive downward. `symbols` maps a variable to a
// colour key ({ v: 'potential' }).
export function equationRuns(tokens, symbols = {}) {
  return tokens.map((tok, i) => {
    const prev = tokens[i - 1];
    const script = tok.level !== 0;
    let space = 0;
    if (prev && !script) {
      space = Math.max(BEFORE[tok.kind] ?? 0, prev.level === 0 ? AFTER[prev.kind] ?? 0 : 0);
      if ((tok.kind === 'var' || tok.kind === 'text') && (prev.kind === 'var' || prev.kind === 'unit' || prev.kind === 'text') && prev.level === 0) space = Math.max(space, 0.17);
      if (tok.kind === 'var' && prev.level !== 0) space = Math.max(space, 0.14);
      if (prev.kind === 'paren' && prev.text === '(' || tok.kind === 'paren' && (tok.text === ')' || prev.kind === 'fn') || tok.kind === 'punct') space = 0;
      if (prev.kind === 'unary' || prev.kind === 'diff') space = 0;
    }
    return {
      text: tok.text,
      italic: tok.kind === 'var' && !/^[Α-Ω]/.test(tok.text),          // capital Greek stays upright
      size: script ? 0.66 : tok.kind === 'int' ? 1.5 : 1,
      shift: tok.level < 0 ? 0.24 : tok.level > 0 ? -0.40 : tok.kind === 'int' ? 0.16 : 0,
      space,
      key: tok.kind === 'var' ? symbols[tok.text] ?? null : null
    };
  });
}

/* ──────────────────────────────────────────────────────────── label layout */
const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Convex hull of 2D points (monotone chain), counter-clockwise.
export function convexHull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const overlaps = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// Place label boxes around a convex obstacle.
//   items   [{ anchor: [x, y], dir: [dx, dy] | null, size: [w, h] }]
//   hull    convex outline of the geometry the labels must stay off
//   bounds  { left, top, right, bottom } the boxes must stay inside
// Each box leaves its anchor along `dir` (default: straight away from the
// hull's centre) and stops just beyond the hull's farthest reach in that
// direction, so it cannot cover the geometry; a later box that would cover an
// earlier one steps further out, or sideways once the bounds stop it.
// Returns [{ x, y, w, h, align, leader }].
export function layoutLabels(items, { hull = [], bounds, gap = 12 }) {
  const centre = hull.length ? [hull.reduce((s, p) => s + p[0], 0) / hull.length, hull.reduce((s, p) => s + p[1], 0) / hull.length] : null;
  const placed = [];
  return items.map(item => {
    const [ax, ay] = item.anchor, [w, h] = item.size;
    let dx = item.dir?.[0] ?? (centre ? ax - centre[0] : 0), dy = item.dir?.[1] ?? (centre ? ay - centre[1] : -1);
    const m = Math.hypot(dx, dy);
    if (m < 1e-6) { dx = 0; dy = -1; } else { dx /= m; dy /= m; }
    let reach = 0;
    for (const p of hull) reach = Math.max(reach, (p[0] - ax) * dx + (p[1] - ay) * dy);
    // d along the direction, s sideways (which stays beyond the hull's reach)
    const boxAt = (d, s) => {
      const cx = ax + dx * d - dy * s + clamp(dx * 1.6, -1, 1) * w / 2, cy = ay + dy * d + dx * s + clamp(dy * 1.6, -1, 1) * h / 2;
      return {
        x: bounds ? clamp(cx - w / 2, bounds.left, Math.max(bounds.left, bounds.right - w)) : cx - w / 2,
        y: bounds ? clamp(cy - h / 2, bounds.top, Math.max(bounds.top, bounds.bottom - h)) : cy - h / 2,
        w, h
      };
    };
    const free = b => !placed.some(o => overlaps(b, o, gap / 2));
    const d0 = reach + gap, stepD = Math.max(4, h / 4), stepS = Math.max(4, w / 4);
    let box = boxAt(d0, 0);
    search: for (let ring = 1; ring <= 48 && !free(box); ring++)
      for (let kd = ring; kd >= 0; kd--)
        for (const ks of kd === ring ? [0] : [ring - kd, kd - ring]) {
          const candidate = boxAt(d0 + kd * stepD, ks * stepS);
          if (free(candidate)) { box = candidate; break search; }
        }
    placed.push(box);
    const qx = clamp(ax, box.x, box.x + w), qy = clamp(ay, box.y, box.y + h), len = Math.hypot(qx - ax, qy - ay);
    const pull = gap * 0.4;
    return {
      ...box,
      align: dx < -0.35 ? 'right' : dx > 0.35 ? 'left' : 'center',
      leader: len > gap * 2.5 ? [ax, ay, qx - (qx - ax) / len * pull, qy - (qy - ay) / len * pull] : null
    };
  });
}

/* ───────────────────────────────────────────────────────────── DOM overlay */
const SVG_NS = 'http://www.w3.org/2000/svg';
const SANS = 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue","Liberation Sans",Arial,sans-serif';
const SERIF = '"STIX Two Text","STIX Two Math","Cambria Math","Latin Modern Roman","Libertinus Serif","Times New Roman","Liberation Serif","Nimbus Roman","DejaVu Serif",serif';
const INK = '#eef4f8', DIM = '#8fa1ae', GROUND = '#080b0f';
const SIDES = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };

const CSS = `
.ov{position:absolute;inset:0;overflow:hidden;pointer-events:none;font-family:${SANS};color:${INK};--u:10px;-webkit-font-smoothing:antialiased}
.ov-band{position:absolute;display:flex;align-items:center;justify-content:center}
.ov-caption{text-align:center;font-weight:500;font-size:calc(var(--u)*3.7);line-height:1.28;text-wrap:balance;text-shadow:0 0 calc(var(--u)*.9) ${GROUND},0 0 calc(var(--u)*.35) ${GROUND}}
.ov-caption span{font-weight:650}
.ov-equation svg{display:block;overflow:visible}
.ov-label{position:absolute;left:0;top:0;white-space:nowrap;line-height:1.1;text-shadow:0 0 calc(var(--u)*.7) ${GROUND},0 0 calc(var(--u)*.3) ${GROUND}}
.ov-k{font-weight:650;font-size:calc(var(--u)*1.7);letter-spacing:.14em;text-transform:uppercase}
.ov-v{font-weight:600;font-size:calc(var(--u)*3.2);font-variant-numeric:tabular-nums;margin-top:calc(var(--u)*.4)}
.ov-s{font-size:calc(var(--u)*1.7);color:${DIM};margin-top:calc(var(--u)*.45)}
.ov-leaders{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
`;

function wrapLines(text, max) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && (line + ' ' + word).length > max) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines;
}

// createOverlay({ root, colors, symbols, THREE, spriteParent })
//   root          positioned element covering the scene's canvas
//   colors        { key: '#rrggbb' } for label titles, caption highlights and symbols
//   symbols       { v: 'potential' } equation variable → colour key
//   THREE, spriteParent   only for the WebXR sprite fallback: the three.js
//                 namespace and the group (in model space) sprites are added to
export function createOverlay({ root, colors = {}, symbols = {}, THREE = null, spriteParent = null }) {
  const doc = root.ownerDocument;
  if (!doc.getElementById('ov-style')) {
    const style = doc.createElement('style'); style.id = 'ov-style'; style.textContent = CSS; doc.head.appendChild(style);
  }
  root.classList.add('ov');
  const leaders = doc.createElementNS(SVG_NS, 'svg'); leaders.setAttribute('class', 'ov-leaders'); root.appendChild(leaders);
  const live = new Map();      // cue id → { el, key, … }
  const color = key => colors[key] ?? INK;

  function entry(cue, make) {
    let e = live.get(cue.id);
    if (!e) { e = make(); e.type = cue.type; live.set(cue.id, e); }
    e.seen = true;
    return e;
  }

  function place(el, band) {
    el.style.left = band.left + 'px'; el.style.top = band.top + 'px';
    el.style.width = (band.right - band.left) + 'px'; el.style.height = (band.bottom - band.top) + 'px';
  }

  function setCaption(e, text) {
    if (e.key === text) return;
    e.key = text;
    e.inner.replaceChildren(...parseMarkup(text).map(run => {
      if (!run.key) return doc.createTextNode(run.text);
      const span = doc.createElement('span'); span.textContent = run.text; span.style.color = color(run.key); return span;
    }));
  }

  // The equation is typeset at its final size in a fresh <svg> every time it
  // changes. Chromium lays SVG text out for the scale it is shown at, so
  // measuring inside an element that was scaled for the previous equation
  // would make this frame depend on the one drawn before it.
  function setEquation(e, text, fontPx, maxWidth) {
    const key = `${text}|${fontPx}|${maxWidth}`;
    if (e.key === key) return;
    e.key = key;
    const tokens = parseEquation(text), runs = equationRuns(tokens, symbols);
    const typeset = F => {
      const svg = doc.createElementNS(SVG_NS, 'svg'), node = doc.createElementNS(SVG_NS, 'text');
      svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', equationText(tokens));
      node.setAttribute('font-family', SERIF); node.setAttribute('font-size', F); node.setAttribute('fill', INK);
      let shift = 0;
      for (const run of runs) {
        const span = doc.createElementNS(SVG_NS, 'tspan');
        span.textContent = run.text;
        span.setAttribute('font-size', (F * run.size).toFixed(2));
        if (run.italic) span.setAttribute('font-style', 'italic');
        if (run.key) span.setAttribute('fill', color(run.key));
        span.setAttribute('dx', (run.space * F).toFixed(2));
        span.setAttribute('dy', ((run.shift - shift) * F).toFixed(2)); shift = run.shift;
        node.appendChild(span);
      }
      svg.appendChild(node);
      e.el.replaceChildren(svg);
      let box = { x: 0, y: -F, width: F * text.length * 0.5, height: F * 1.3 };
      try { const b = node.getBBox(); if (b.width > 0) box = b; } catch (_) { /* not rendered yet */ }
      const pad = F * 0.08, w = box.width + 2 * pad, h = box.height + 2 * pad;
      svg.setAttribute('viewBox', `${box.x - pad} ${box.y - pad} ${w} ${h}`);
      svg.style.width = w + 'px'; svg.style.height = h + 'px';
      return w;
    };
    const width = typeset(fontPx);
    if (width > maxWidth) typeset(Math.floor(fontPx * maxWidth / width * 10) / 10);     // too long for the band: set it smaller
  }

  function setLabel(e, cue, values) {
    const title = fillTemplate(cue.title, values), text = fillTemplate(cue.text, values), note = fillTemplate(cue.note, values);
    const key = `${title}|${text}|${note}|${cue.color}`;
    if (e.key === key) return;
    e.key = key;
    e.k.textContent = title; e.k.style.display = title ? '' : 'none'; e.k.style.color = color(cue.color);
    e.v.textContent = text; e.v.style.display = text ? '' : 'none';
    e.s.textContent = note; e.s.style.display = note ? '' : 'none';
  }

  /* ── sprites (WebXR fallback) ── */
  const sprites = new Map();   // cue id → { sprite, key }
  const UNITS_PER_PX = 0.0013;     // scene units per texture pixel: a label value stands about 0.15 units tall

  function drawSprite(lines) {
    // lines: [{ runs: [{ text, color, font }], height }]
    const canvas = doc.createElement('canvas'), ctx = canvas.getContext('2d');
    const pad = 52;
    let width = 0, height = pad * 2;
    for (const line of lines) {
      let w = 0;
      for (const run of line.runs) { ctx.font = run.font; w += ctx.measureText(run.text).width + (run.space ?? 0); }
      line.width = w; width = Math.max(width, w); height += line.height;
    }
    canvas.width = Math.ceil(width + pad * 2); canvas.height = Math.ceil(height);
    ctx.fillStyle = '#0a0f14dd'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#33434f'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, canvas.width - 3, canvas.height - 3);
    ctx.textBaseline = 'alphabetic';
    let y = pad;
    for (const line of lines) {
      let x = (canvas.width - line.width) / 2;
      const base = y + line.height * 0.76;
      for (const run of line.runs) {
        ctx.font = run.font; ctx.fillStyle = run.color; x += run.space ?? 0;
        ctx.fillText(run.text, x, base + (run.shift ?? 0));
        x += ctx.measureText(run.text).width;
      }
      y += line.height;
    }
    return canvas;
  }

  function spriteLines(cue, values) {
    if (cue.type === 'label') {
      const lines = [];
      const title = fillTemplate(cue.title, values), text = fillTemplate(cue.text, values), note = fillTemplate(cue.note, values);
      if (title) lines.push({ height: 80, runs: [{ text: title.toUpperCase(), color: color(cue.color), font: `650 56px ${SANS}` }] });
      if (text) lines.push({ height: 136, runs: [{ text, color: INK, font: `600 112px ${SANS}` }] });
      if (note) lines.push({ height: 80, runs: [{ text: note, color: DIM, font: `400 56px ${SANS}` }] });
      return lines;
    }
    if (cue.type === 'equation') {
      const F = 128;
      return [{
        height: F * 1.5,
        runs: equationRuns(parseEquation(fillTemplate(cue.text, values)), symbols).map(run => ({
          text: run.text, color: run.key ? color(run.key) : INK, space: run.space * F, shift: run.shift * F,
          font: `${run.italic ? 'italic ' : ''}${Math.round(F * run.size)}px ${SERIF}`
        }))
      }];
    }
    const plain = parseMarkup(fillTemplate(cue.text, values)).map(run => run.text).join('');
    return wrapLines(plain, 34).map(text => ({ height: 108, runs: [{ text, color: INK, font: `500 80px ${SANS}` }] }));
  }

  function updateSprites(cues, anchors, values) {
    for (const s of sprites.values()) s.seen = false;
    if (THREE && spriteParent) for (const cue of cues) {
      const anchor = cue.type === 'label' ? (typeof cue.anchor === 'string' ? anchors?.(cue.anchor) : { point: cue.anchor }) : anchors?.(cue.type);
      if (!anchor?.point) continue;
      const lines = spriteLines(cue, values), key = JSON.stringify(lines);
      let s = sprites.get(cue.id);
      if (!s) {
        s = { sprite: new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })), key: null };
        s.sprite.renderOrder = 10; spriteParent.add(s.sprite); sprites.set(cue.id, s);
      }
      if (s.key !== key) {
        s.key = key;
        const canvas = drawSprite(lines);
        s.sprite.material.map?.dispose();
        s.sprite.material.map = new THREE.CanvasTexture(canvas);
        s.sprite.material.map.colorSpace = THREE.SRGBColorSpace;
        s.sprite.material.needsUpdate = true;
        s.sprite.scale.set(canvas.width * UNITS_PER_PX, canvas.height * UNITS_PER_PX, 1);
      }
      const out = anchor.out ?? [0, 0, 0], reach = cue.type === 'label' ? 0.16 + s.sprite.scale.y / 2 + s.sprite.scale.x / 5 : 0;
      s.sprite.position.set(anchor.point[0] + out[0] * reach, anchor.point[1] + out[1] * reach, anchor.point[2] + out[2] * reach);
      s.sprite.material.opacity = cue.alpha ?? 1;
      s.sprite.visible = true; s.seen = true;
    }
    for (const [id, s] of sprites) if (!s.seen) {
      s.sprite.material.map?.dispose(); s.sprite.material.dispose(); s.sprite.removeFromParent(); sprites.delete(id);
    }
  }

  // Draw the cues for one frame.
  //   cues      active cues with alpha, as returned by timeline stateAt(t)
  //   width, height   size of the scene in CSS pixels
  //   project   ([x, y, z]) → [px, py, inFront]
  //   anchors   (name) → { point: [x, y, z], out: [x, y, z] } | null; `out`
  //             points away from the geometry the label names
  //   obstacle  [[x, y, z], …] points whose projected outline labels avoid
  //   values    { name: 'text' } for "{name}" placeholders
  //   sprites   true to draw in-scene sprites instead of the DOM (WebXR)
  function update({ cues = [], width, height, project, anchors, obstacle = [], values = {}, sprites: asSprites = false }) {
    const layout = stageLayout(width, height), u = layout.unit;
    root.style.setProperty('--u', u + 'px');
    root.style.display = asSprites ? 'none' : '';
    updateSprites(asSprites ? cues : [], anchors, values);
    if (asSprites) return layout;

    for (const e of live.values()) e.seen = false;
    const labels = [];
    for (const cue of cues) {
      if (cue.type === 'caption') {
        const e = entry(cue, () => {
          const el = doc.createElement('div'); el.className = 'ov-band';
          const inner = doc.createElement('div'); inner.className = 'ov-caption'; el.appendChild(inner); root.appendChild(el);
          return { el, inner };
        });
        place(e.el, layout.caption);
        e.inner.style.maxWidth = Math.min(layout.caption.right - layout.caption.left, u * 3.7 * 27) + 'px';
        setCaption(e, fillTemplate(cue.text, values));
        e.el.style.opacity = cue.alpha ?? 1;
      } else if (cue.type === 'equation') {
        const e = entry(cue, () => {
          const el = doc.createElement('div'); el.className = 'ov-band ov-equation'; root.appendChild(el);
          return { el };
        });
        place(e.el, layout.equation);
        setEquation(e, fillTemplate(cue.text, values), u * 5.6, layout.equation.right - layout.equation.left);
        e.el.style.opacity = cue.alpha ?? 1;
      } else if (cue.type === 'label') {
        const anchor = typeof cue.anchor === 'string' ? anchors?.(cue.anchor) : { point: cue.anchor };
        const at = anchor?.point && project(anchor.point);
        if (!at || !at[2]) continue;
        const e = entry(cue, () => {
          const el = doc.createElement('div'); el.className = 'ov-label';
          const k = doc.createElement('div'), v = doc.createElement('div'), s = doc.createElement('div');
          k.className = 'ov-k'; v.className = 'ov-v'; s.className = 'ov-s'; el.append(k, v, s); root.appendChild(el);
          const line = doc.createElementNS(SVG_NS, 'line'), dot = doc.createElementNS(SVG_NS, 'circle');
          leaders.append(line, dot);
          return { el, k, v, s, line, dot };
        });
        setLabel(e, cue, values);
        labels.push({ e, cue, anchor, at });
      }
    }
    for (const [id, e] of live) if (!e.seen) { e.el.remove(); e.line?.remove(); e.dot?.remove(); live.delete(id); }

    // Labels: project, choose a direction away from the geometry, lay out.
    const hull = convexHull(obstacle.map(project).filter(p => p[2]).map(p => [p[0], p[1]]));
    const centre = hull.length ? [hull.reduce((s, p) => s + p[0], 0) / hull.length, hull.reduce((s, p) => s + p[1], 0) / hull.length] : null;
    const items = labels.map(({ e, cue, anchor, at }) => {
      let dir = null;
      if (cue.side) dir = SIDES[cue.side] ?? null;
      else if (anchor.out) {
        // Screen direction of `out`, faded toward "away from the centre" as it
        // turns to point at the viewer.
        const p = anchor.point, step = 0.2, far = v => { const q = project([p[0] + v[0] * step, p[1] + v[1] * step, p[2] + v[2] * step]); return [q[0] - at[0], q[1] - at[1]]; };
        const o = far(anchor.out), scale = Math.max(...[[1, 0, 0], [0, 1, 0], [0, 0, 1]].map(axis => Math.hypot(...far(axis)))) || 1;
        const w = smoothstep(0.15, 0.5, Math.hypot(o[0], o[1]) / scale);
        let rx = centre ? at[0] - centre[0] : 0, ry = centre ? at[1] - centre[1] : -1;
        const rm = Math.hypot(rx, ry);
        if (rm < 1) { rx = 0; ry = -1; } else { rx /= rm; ry /= rm; }
        const om = Math.hypot(o[0], o[1]) || 1;
        dir = [w * o[0] / om + (1 - w) * rx, w * o[1] / om + (1 - w) * ry];
      }
      return { anchor: [at[0], at[1]], dir, size: [e.el.offsetWidth, e.el.offsetHeight] };
    });
    const boxes = layoutLabels(items, { hull, bounds: layout.stage, gap: u * 1.5 });
    labels.forEach(({ e, cue }, i) => {
      const box = boxes[i], alpha = cue.alpha ?? 1, tint = color(cue.color);
      e.el.style.transform = `translate(${box.x.toFixed(2)}px,${box.y.toFixed(2)}px)`;
      e.el.style.textAlign = box.align;
      e.el.style.opacity = alpha;
      const [ax, ay] = items[i].anchor;
      e.dot.setAttribute('cx', ax.toFixed(2)); e.dot.setAttribute('cy', ay.toFixed(2)); e.dot.setAttribute('r', (u * 0.4).toFixed(2));
      e.dot.setAttribute('fill', tint); e.dot.setAttribute('opacity', box.leader ? alpha : 0);
      if (box.leader) {
        const [x1, y1, x2, y2] = box.leader;
        e.line.setAttribute('x1', x1.toFixed(2)); e.line.setAttribute('y1', y1.toFixed(2));
        e.line.setAttribute('x2', x2.toFixed(2)); e.line.setAttribute('y2', y2.toFixed(2));
        e.line.setAttribute('stroke', tint); e.line.setAttribute('stroke-width', (u * 0.16).toFixed(2));
      }
      e.line.setAttribute('opacity', box.leader ? alpha * 0.7 : 0);
    });
    return layout;
  }

  return { update, layout: stageLayout };
}
