#!/usr/bin/env node
// Render a timeline to video, frame by frame, in a headless Chromium.
//
//   node tools/render.mjs --timeline timelines/power-box-steady.json
//
// For each preset the tool opens the timeline's page in fixed-step mode
// (?fps=…&frame=0&timeline=…&ui=0), then steps window.__setFrame(n) through the
// clip in one browser session, screenshots each frame as PNG and pipes the
// frames to ffmpeg (H.264, yuv420p). Nothing is recorded in real time, so the
// result does not depend on how fast this machine draws.
//
// The site itself has no dependencies; this tool's one dependency
// (playwright-core, which does not download a browser) lives in
// tools/package.json. Point it at a Chromium and an ffmpeg you already have.

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createTimeline, frameCount } from '../timeline.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FPS = 30;
export const PRESETS = Object.freeze({
  wide: Object.freeze({ width: 1920, height: 1080 }),
  vertical: Object.freeze({ width: 1080, height: 1920 })
});

// Headless WebGL through ANGLE's software rasterizer, plus the switches that
// keep colour and text rendering the same from run to run.
export const CHROMIUM_FLAGS = Object.freeze([
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
  '--force-color-profile=srgb', '--font-render-hinting=none', '--disable-lcd-text', '--hide-scrollbars'
]);

// Page chrome that must not appear in a frame (for pages without a ?ui=0 mode),
// and no CSS transitions: they run on the wall clock, not the scene clock.
const HIDE_CSS = '#rail,#toggleRail,#hint,#scopes,#legend,#flow,#veil,#VRButton{display:none!important}*{transition:none!important;animation:none!important}';

const USAGE = `Usage: node tools/render.mjs --timeline <file> [options]

  --timeline <file>    timeline JSON, relative to the repository root
  --page <file>        page to drive (default: the timeline's "page")
  --preset <list>      wide (1920×1080), vertical (1080×1920), or both (default: both)
  --out <dir>          output directory (default: out)
  --name <stem>        output file stem (default: the timeline's file name)
  --fps <n>            frames per second (default: the timeline's fps, else ${FPS})
  --frames <a-b>       render only this range of frames (default: the whole clip)
  --stills <list>      also save these frames as PNG, e.g. 0,90,300
  --stills-only        save the stills and skip the video
  --keep-frames        keep every frame as PNG next to the video
  --verify <n>         redraw n frames in a fresh page, in reverse order, and
                       require the same bytes (default: 0, off)
  --supersample <n>    canvas pixels per output pixel; 2 is smoother and
                       slower (default: 1)
  --crf <n>            x264 quality, lower is better (default: 16)
  --param <k=v>        extra URL parameter for the page (repeatable)
  --chromium <path>    Chromium executable (default: $CHROMIUM_PATH, else PATH)
  --ffmpeg <path>      ffmpeg executable (default: $FFMPEG_PATH, else PATH)
`;

export function parseArgs(argv) {
  const opts = { preset: 'both', out: 'out', frames: null, stills: [], stillsOnly: false, keepFrames: false, verify: 0, supersample: 1, crf: 16, params: [] };
  const flags = { '--stills-only': 'stillsOnly', '--keep-frames': 'keepFrames' };
  const values = { '--timeline': 'timeline', '--page': 'page', '--preset': 'preset', '--out': 'out', '--name': 'name', '--fps': 'fps', '--frames': 'frames', '--stills': 'stills', '--verify': 'verify', '--supersample': 'supersample', '--crf': 'crf', '--chromium': 'chromium', '--ffmpeg': 'ffmpeg' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { opts.help = true; continue; }
    if (arg in flags) { opts[flags[arg]] = true; continue; }
    if (arg !== '--param' && !(arg in values)) throw new Error(`unknown option ${arg}`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`${arg} needs a value`);
    if (arg === '--param') opts.params.push(value); else opts[values[arg]] = value;
  }
  for (const key of ['fps', 'verify', 'supersample', 'crf']) if (opts[key] !== undefined) {
    opts[key] = Number(opts[key]);
    if (!Number.isFinite(opts[key]) || opts[key] < 0) throw new Error(`--${key} must be a non-negative number`);
  }
  if (typeof opts.stills === 'string') opts.stills = opts.stills.split(',').filter(Boolean).map(Number);
  if (opts.stills.some(n => !Number.isInteger(n) || n < 0)) throw new Error('--stills must be a list of frame numbers');
  if (opts.frames) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(opts.frames);
    if (!m) throw new Error('--frames must look like 0-599');
    opts.frames = [Number(m[1]), Number(m[2] ?? m[1])];
  }
  opts.presets = opts.preset === 'both' ? Object.keys(PRESETS) : opts.preset.split(',');
  for (const name of opts.presets) if (!(name in PRESETS)) throw new Error(`unknown preset "${name}" (use ${Object.keys(PRESETS).join(', ')} or both)`);
  return opts;
}

// The URL that shows frame n of a timeline on a page, bare of controls.
export function pageUrl(origin, page, { timeline, fps, frame = 0, supersample = 1, params = [] }) {
  const q = new URLSearchParams({ fps: String(fps), frame: String(frame), timeline, ui: '0', px: String(supersample) });
  for (const pair of params) { const [k, ...v] = pair.split('='); q.set(k, v.join('=')); }
  return `${origin}/${page}?${q}`;
}

// PNG frames on stdin → H.264 in MP4, 4:2:0, tagged BT.709.
export function ffmpegArgs({ fps, crf, output }) {
  return [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', '-r', String(fps), output
  ];
}

function findExecutable(explicit, envName, names) {
  if (explicit) return explicit;
  if (process.env[envName]) return process.env[envName];
  for (const name of names) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error(`no ${names[0]} found: pass --${names[0]} <path> or set ${envName} (with nix: nix shell nixpkgs#chromium nixpkgs#ffmpeg -c node tools/render.mjs …)`);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

// Serve the repository to the browser: ES modules do not load from file://.
function serve(root) {
  const server = http.createServer((req, res) => {
    const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (route === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = path.join(root, path.normalize(route));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(data);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const pad = n => String(n).padStart(5, '0');

async function openPage(browser, size, url) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1, reducedMotion: 'no-preference', colorScheme: 'dark' });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', error => problems.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: HIDE_CSS });
  try {
    await page.waitForFunction(() => window.__frameReady === true || window.__frameError, null, { timeout: 120000 });
  } catch (error) {
    throw new Error(`the page never signalled a drawn frame (window.__frameReady): ${problems.join(' | ') || error.message}`);
  }
  const failure = await page.evaluate(() => window.__frameError ?? null);
  if (failure) throw new Error(`the page reported: ${failure}`);
  if (await page.evaluate(() => typeof window.__setFrame !== 'function')) throw new Error('the page has no window.__setFrame: it has not adopted scene-clock.js');
  // Straight to the DevTools protocol: one capture of the viewport per frame.
  const devtools = await context.newCDPSession(page);
  const draw = async n => {
    await page.evaluate(frame => window.__setFrame(frame), n);
    const shot = await devtools.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    return Buffer.from(shot.data, 'base64');
  };
  return { draw, close: () => context.close(), problems };
}

async function renderPreset(browser, origin, opts, presetName, plan) {
  const size = PRESETS[presetName], stem = `${plan.name}-${presetName}`;
  const url = pageUrl(origin, plan.page, { timeline: plan.timelineUrl, fps: plan.fps, frame: plan.first, supersample: opts.supersample, params: opts.params });
  const started = Date.now();
  const session = await openPage(browser, size, url);
  const output = path.join(plan.out, `${stem}.mp4`);
  const frameDir = path.join(plan.out, `${stem}-frames`);
  if (opts.keepFrames) fs.mkdirSync(frameDir, { recursive: true });

  let encoder = null, encoded = null;
  if (!opts.stillsOnly) {
    encoder = spawn(plan.ffmpeg, ffmpegArgs({ fps: plan.fps, crf: opts.crf, output }), { stdio: ['pipe', 'inherit', 'inherit'] });
    encoded = new Promise((resolve, reject) => {
      encoder.on('error', reject);
      encoder.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
    });
    encoder.stdin.on('error', () => {});          // a dead encoder is reported by its exit code
  }

  const wanted = opts.stillsOnly ? plan.stills : plan.frames;
  const hashes = new Map();
  for (const n of wanted) {
    const png = await session.draw(n);
    hashes.set(n, sha256(png));
    if (encoder && !encoder.stdin.write(png)) await new Promise(resolve => encoder.stdin.once('drain', resolve));
    if (opts.keepFrames) fs.writeFileSync(path.join(frameDir, `frame-${pad(n)}.png`), png);
    if (plan.stills.includes(n)) fs.writeFileSync(path.join(plan.out, `${stem}-f${pad(n)}.png`), png);
    if (process.stderr.isTTY) process.stderr.write(`\r${stem}: frame ${n}`);
  }
  if (process.stderr.isTTY) process.stderr.write('\r');
  if (encoder) { encoder.stdin.end(); await encoded; }
  await session.close();

  const manifest = path.join(plan.out, `${stem}.frames.sha256`);
  fs.writeFileSync(manifest, [...hashes].map(([n, hash]) => `${hash}  frame-${pad(n)}.png\n`).join(''));
  const seconds = (Date.now() - started) / 1000;
  const result = { preset: presetName, frames: wanted.length, seconds, manifest, problems: session.problems };
  if (encoder) Object.assign(result, { output, bytes: fs.statSync(output).size, duration: wanted.length / plan.fps });

  // Determinism: a fresh page, the frames in reverse order, the same bytes.
  if (opts.verify > 0) {
    const sample = [];
    const count = Math.min(opts.verify, wanted.length);
    for (let k = 0; k < count; k++) sample.push(wanted[Math.round(k * (wanted.length - 1) / Math.max(1, count - 1))]);
    const again = await openPage(browser, size, url.replace(/frame=\d+/, `frame=${sample.at(-1)}`));
    const different = [];
    for (const n of [...new Set(sample)].reverse()) if (sha256(await again.draw(n)) !== hashes.get(n)) different.push(n);
    await again.close();
    result.verified = new Set(sample).size; result.different = different;
  }
  return result;
}

export async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help || !opts.timeline) { process.stdout.write(USAGE); return opts.help ? 0 : 2; }
  const timelineFile = path.resolve(ROOT, opts.timeline);
  if (!timelineFile.startsWith(ROOT + path.sep)) throw new Error('the timeline must be inside the repository, so the page can fetch it');
  const timeline = createTimeline(JSON.parse(fs.readFileSync(timelineFile, 'utf8')));
  const page = opts.page ?? timeline.page;
  if (!page) throw new Error('the timeline names no "page": pass --page');
  const fps = opts.fps ?? timeline.fps ?? FPS, total = frameCount(timeline, fps);
  const [first, last] = opts.frames ?? [0, total - 1];
  if (first > last) throw new Error('--frames: the range is empty');
  const frames = [];
  for (let n = first; n <= last; n++) frames.push(n);
  const out = path.resolve(opts.out);
  fs.mkdirSync(out, { recursive: true });
  const plan = {
    page, fps, first, frames, out, stills: opts.stills,
    name: opts.name ?? path.basename(timelineFile, '.json'),
    timelineUrl: path.relative(ROOT, timelineFile).split(path.sep).join('/'),
    ffmpeg: opts.stillsOnly ? null : findExecutable(opts.ffmpeg, 'FFMPEG_PATH', ['ffmpeg'])
  };
  const executablePath = findExecutable(opts.chromium, 'CHROMIUM_PATH', ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']);

  const { chromium } = await import('playwright-core');
  const server = await serve(ROOT);
  const browser = await chromium.launch({ executablePath, args: [...CHROMIUM_FLAGS] });
  let failed = false;
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const presetName of opts.presets) {
      const r = await renderPreset(browser, origin, opts, presetName, plan);
      const size = PRESETS[presetName];
      const what = r.output ? `${r.output}  ${size.width}×${size.height}  ${r.duration.toFixed(2)} s  ${(r.bytes / 1e6).toFixed(2)} MB` : `${r.frames} still(s) in ${out}`;
      console.log(`${presetName}: ${what}  (${r.frames} frames in ${r.seconds.toFixed(0)} s)`);
      if (r.verified !== undefined) {
        console.log(`${presetName}: determinism ${r.different.length ? `FAILED for frames ${r.different.join(', ')}` : `ok, ${r.verified} frames redrawn in a fresh page, in reverse order, byte-identical`}`);
        if (r.different.length) failed = true;
      }
      for (const problem of new Set(r.problems)) console.warn(`${presetName}: page said: ${problem}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(`render: ${error.message}`); process.exitCode = 1; });
}
