import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTimeline, stateAt, frameCount } from '../timeline.js';
import { FPS, PRESETS, CHROMIUM_FLAGS, parseArgs, pageUrl, ffmpegArgs } from '../tools/render.mjs';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('the site stays dependency-free; the capture driver lives under tools/', () => {
  const site = JSON.parse(read('package.json')), tools = JSON.parse(read('tools/package.json'));
  assert.equal(site.dependencies, undefined);
  assert.equal(site.devDependencies, undefined);
  assert.deepEqual(Object.keys(tools.dependencies), ['playwright-core']);
  assert.doesNotMatch(read('tools/render.mjs'), /^import .* from 'playwright/m, 'the driver is loaded only when a render starts');
  assert.doesNotMatch(read('.github/workflows/pages.yml'), /cp (-R )?tools/, 'tooling is not published');
});

test('kit modules need no network and no bundler', () => {
  for (const file of ['scene-clock.js', 'timeline.js', 'overlay.js', 'power-box-model.js']) {
    const source = read(file);
    assert.doesNotMatch(source, /^import /m, `${file} imports nothing`);
    assert.doesNotMatch(source.replaceAll('http://www.w3.org/2000/svg', ''), /https?:\/\//, `${file} names no remote resource`);
  }
});

test('the rotating-field page reads its time from the scene clock', () => {
  const html = read('rotating-field-machine.html');
  assert.match(html, /import \{ createSceneClock \} from '\.\/scene-clock\.js';/);
  assert.match(html, /const dt = clock\.tick\(now\);/);
  assert.match(html, /clock\.drawn\(\);/);
  assert.doesNotMatch(html, /performance\.now\(\)/);
  // default behaviour is unchanged: the wall-clock branch is the original line
  assert.ok(html.includes('else if (S.playing) { S.t = (S.t + dt * S.speed * 2.2) % TAU; syncPhaseUI(); }'));
  const workflow = read('.github/workflows/pages.yml');
  assert.match(workflow, /cp scene-clock\.js _site\/scene-clock\.js/);
  assert.match(workflow, /cp timeline\.js _site\/timeline\.js/);
  assert.match(html, /href="\.\/power-box\.html"/, 'the site root links to the new page');
});

test('render presets: wide 1920×1080 and vertical 1080×1920 at 30 fps', () => {
  assert.deepEqual(PRESETS, { wide: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 } });
  assert.equal(FPS, 30);
  assert.deepEqual(parseArgs(['--timeline', 't.json']).presets, ['wide', 'vertical']);
  assert.deepEqual(parseArgs(['--timeline', 't.json', '--preset', 'vertical']).presets, ['vertical']);
  assert.throws(() => parseArgs(['--preset', 'square']), /unknown preset/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  const opts = parseArgs(['--timeline', 't.json', '--stills', '0,90,300', '--frames', '10-20', '--verify', '8', '--keep-frames']);
  assert.deepEqual([opts.stills, opts.frames, opts.verify, opts.keepFrames], [[0, 90, 300], [10, 20], 8, true]);
});

test('render drives the page in fixed-step mode and encodes H.264 yuv420p', () => {
  const url = new URL(pageUrl('http://127.0.0.1:8000', 'power-box.html', { timeline: 'timelines/power-box-steady.json', fps: 30, frame: 120 }));
  assert.equal(url.pathname, '/power-box.html');
  assert.deepEqual(Object.fromEntries(url.searchParams), { fps: '30', frame: '120', timeline: 'timelines/power-box-steady.json', ui: '0', px: '2' });
  const args = ffmpegArgs({ fps: 30, crf: 16, output: 'out/clip.mp4' });
  const value = flag => args[args.indexOf(flag) + 1];
  assert.equal(value('-framerate'), '30');
  assert.equal(args[args.lastIndexOf('-c:v') + 1], 'libx264');
  assert.equal(value('-pix_fmt'), 'yuv420p');
  assert.equal(args.at(-1), 'out/clip.mp4');
  for (const flag of ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']) assert.ok(CHROMIUM_FLAGS.includes(flag), flag);
  const readme = read('README.md');
  for (const flag of CHROMIUM_FLAGS) assert.ok(readme.includes(flag), `README records ${flag}`);
});

test('shipped timelines are valid, run about twenty seconds, and name a page that exists', () => {
  const dir = new URL('../timelines/', import.meta.url);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const name of ['power-box-steady.json', 'power-box-sine.json', 'rotating-field-orbit.json']) assert.ok(files.includes(name), name);
  for (const file of files) {
    const shipped = createTimeline(JSON.parse(fs.readFileSync(new URL(file, dir), 'utf8')));
    assert.ok(shipped.duration >= 18 && shipped.duration <= 22, `${file} duration`);
    assert.equal(shipped.fps, 30, `${file} fps`);
    assert.ok(fs.existsSync(new URL(`../${shipped.page}`, import.meta.url)), `${file} page`);
    assert.ok(shipped.camera.length >= 2, `${file} moves the camera`);
    assert.ok(shipped.camera.at(-1).t <= shipped.duration, `${file} camera keys end inside the clip`);
    for (const cue of shipped.cues) assert.ok(cue.in < shipped.duration && cue.out > 0, `${file} ${cue.id} is visible during the clip`);
    // one caption and one equation at a time: they share a band on screen
    for (const type of ['caption', 'equation']) {
      const list = shipped.cues.filter(c => c.type === type).sort((a, b) => a.in - b.in);
      for (let i = 1; i < list.length; i++) assert.ok(list[i].in >= list[i - 1].out, `${file}: ${type} cues ${i - 1} and ${i} overlap in time`);
    }
    // every frame of the clip evaluates, in any order, to the same state
    const frames = frameCount(shipped);
    assert.equal(frames, 600, `${file} frames`);
    for (const n of [frames - 1, 0, 311, 17, 311]) assert.equal(JSON.stringify(shipped.stateAt(n / 30)), JSON.stringify(stateAt(shipped, n / 30)));
  }
});
