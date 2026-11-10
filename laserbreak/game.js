/* Original LaserBreak browser adapter: frame updates, cached glow, event-driven UI. */
'use strict';
const {World, Input, W, H, defaults} = LaserBreak;
const world = new World();
world.start();
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const arena = document.querySelector('#arena'), status = document.querySelector('#status');
const pads = {left: document.querySelector('#left-pad'), right: document.querySelector('#right-pad')};
const indicators = {left: pads.left.querySelector('i'), right: pads.right.querySelector('i')};
const setup = document.querySelector('#setup'), toggle = document.querySelector('#setup-toggle');
const pauseButton = document.querySelector('#pause'), sessionButton = document.querySelector('#session');
const overlay = document.querySelector('#orientation-overlay');
const perfOutput = document.querySelector('#performance');
const fullscreenButton = document.querySelector('#fullscreen');
const viewStatus = document.querySelector('#view-status');
const portrait = matchMedia('(orientation: portrait)');
const input = new Input((a, b) => {world.fire(a, b); needsDraw = true;},
  () => world.ready() && setup.hidden, () => world.settings.mode);
let needsDraw = true, fieldBox, previous, lastRender, lastHUD = -Infinity, lastDiagnostics = 0;
let focusBeforeRotation;
const diagnostics = {frameMs: 16.7, renderMs: 0, updateMs: 0, objects: 0, fps: 60, pixels: 0};
const pacing = {slow: 0, fast: 0};
const controls = [
  ['cooldown', 'Laser cooldown', 0, 2, .05, 's'],
  ['targetSize', 'Target diameter', 12, 70, 2, 'px'],
  ['targetSpeed', 'Target falling speed', 0, 180, 5, 'px/s'],
  ['barLength', 'Bar length', 30, 220, 5, 'px'],
  ['barSpeed', 'Bar falling speed', 0, 180, 5, 'px/s'],
  ['barRotation', 'Bar rotation speed', -240, 240, 5, '°/s'],
  ['density', 'Object density', 0, 100, 1, '%']
];
const sliders = new Map();
for (const [key, label, min, max, step, unit] of controls) {
  const row = document.createElement('div');
  row.innerHTML = `<label class="slider-label" for="${key}">${label}<output for="${key}"></output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
  document.querySelector('#sliders').append(row);
  const slider = row.querySelector('input'), output = row.querySelector('output');
  sliders.set(key, {slider, output, unit});
  slider.addEventListener('input', () => {
    world.configure(key, Number(slider.value));
    output.value = `${slider.value}${unit}`; // Only the changed slider; never rewrite the others mid-drag.
  });
}
function sync() {
  for (const [key, {slider, output, unit}] of sliders) {
    slider.value = world.settings[key];
    output.value = `${world.settings[key]}${unit}`;
  }
  document.querySelector('#mode').value = world.settings.mode;
  document.querySelector('#debug').checked = world.settings.debug;
  syncSession();
  document.querySelector('#hint').textContent = world.settings.mode === 'touch'
    ? 'Touch both pads to fire · release both to re-arm'
    : 'Hold both pads · slide to aim · release to fire';
}
function syncSession() {
  pauseButton.textContent = world.paused ? 'Resume' : 'Pause';
  pauseButton.disabled = !world.running;
  sessionButton.textContent = world.running ? 'Stop' : 'Start';
  lastHUD = -Infinity;
  needsDraw = true;
}
function panel(open) {
  setup.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) cancelInput();
}
toggle.onclick = () => panel(setup.hidden);
document.querySelector('#close-setup').onclick = () => {panel(false); toggle.focus();};
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !setup.hidden) {panel(false); toggle.focus();}
});
document.querySelector('#mode').onchange = e => {
  world.configure('mode', e.target.value); cancelInput(); sync();
};
document.querySelector('#debug').onchange = e => {
  world.configure('debug', e.target.checked); needsDraw = true;
};
document.querySelector('#diagnostics').onchange = e => {
  perfOutput.hidden = !e.target.checked;
  lastDiagnostics = -Infinity;
};
pauseButton.onclick = () => {
  if (world.orientationBlocked || !world.running) return;
  world.paused = !world.paused; cancelInput(); syncSession(); resetClock();
};
sessionButton.onclick = () => {
  if (world.orientationBlocked) return;
  world.running ? world.stop() : world.start(); cancelInput(); syncSession(); resetClock();
};
document.querySelector('#clear').onclick = () => {world.clear(); cancelInput(); needsDraw = true;};
document.querySelector('#reset').onclick = () => {
  world.settings = {...defaults}; world.start(); cancelInput(); sync(); resetClock();
};
function refreshPads() {
  const [left, right] = input.pair();
  for (const [side, point] of [['left', left], ['right', right]]) {
    pads[side].classList.toggle('active', !!point);
    if (point) indicators[side].style.top = `${point.y / world.height * 100}%`;
  }
  needsDraw = true;
  lastHUD = -Infinity;
}
function cancelInput() {
  const ids = Array.from(input.points.keys());
  input.reset(); // Reset before lostpointercapture can dispatch.
  for (const id of ids) for (const pad of Object.values(pads)) {
    if (typeof id === 'number' && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  refreshPads();
}
function pointerY(e) {return (e.clientY - fieldBox.top) / fieldBox.height * world.height;}
function interactive() {
  syncOrientation();
  return world.running && !world.paused && !world.orientationBlocked && setup.hidden;
}
// Celphonica-style fullscreen lifecycle: request first, then try landscape lock.
// Own and release successful locks, including a promise that finishes after exit.
let lockPending = false, ownsOrientationLock = false, orientationEpoch = 0;
function releaseOrientation() {
  if (!ownsOrientationLock) return;
  ownsOrientationLock = false;
  try {screen.orientation?.unlock?.();} catch { /* Browser may have unlocked already. */ }
}
async function tryLandscapeLock() {
  if (lockPending || typeof screen.orientation?.lock !== 'function') return;
  lockPending = true;
  const epoch = orientationEpoch, beganFullscreen = !!document.fullscreenElement;
  let acquired = false;
  try {
    await screen.orientation.lock('landscape');
    acquired = true;
    ownsOrientationLock = true;
    if (epoch !== orientationEpoch || (beganFullscreen && !document.fullscreenElement)) releaseOrientation();
  } catch { /* Unsupported/requires fullscreen: keep the landscape overlay fallback. */ }
  finally {
    lockPending = false;
    // A gesture lock attempted before fullscreen may reject after fullscreen succeeds.
    if (!acquired && !beganFullscreen && document.fullscreenElement && epoch === orientationEpoch) tryLandscapeLock();
  }
}
function syncFullscreen() {
  const active = !!document.fullscreenElement;
  fullscreenButton.setAttribute('aria-pressed', String(active));
  const label = active ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.title = label;
  fullscreenButton.textContent = active ? '↙' : '⛶';
}
fullscreenButton.hidden = !(document.fullscreenEnabled && document.documentElement.requestFullscreen && document.exitFullscreen);
fullscreenButton.onclick = async () => {
  cancelInput();
  fullscreenButton.disabled = true;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    viewStatus.hidden = true;
  } catch {
    viewStatus.value = 'Full screen unavailable in this browser.';
    viewStatus.hidden = false;
  } finally {fullscreenButton.disabled = false; syncFullscreen();}
};
document.addEventListener('pointerdown', tryLandscapeLock, {passive: true});
document.addEventListener('fullscreenchange', () => {
  cancelInput(); resetClock(); syncFullscreen(); syncOrientation(); resize();
  if (document.fullscreenElement) tryLandscapeLock();
  else {orientationEpoch++; releaseOrientation();}
});
window.addEventListener('pagehide', () => {orientationEpoch++; releaseOrientation();});
for (const [side, pad] of Object.entries(pads)) {
  pad.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !interactive()) return;
    e.preventDefault(); pad.setPointerCapture(e.pointerId);
    input.down(e.pointerId, side, pointerY(e)); refreshPads();
  });
  pad.addEventListener('pointermove', e => {
    if (!input.points.has(e.pointerId)) return;
    e.preventDefault(); input.move(e.pointerId, pointerY(e)); refreshPads();
  });
  pad.addEventListener('pointerup', e => {
    if (!input.points.has(e.pointerId)) return;
    e.preventDefault(); syncOrientation(); input.up(e.pointerId); refreshPads();
  });
  for (const type of ['pointercancel', 'lostpointercapture']) pad.addEventListener(type, e => {
    if (input.points.has(e.pointerId)) {input.up(e.pointerId, true); refreshPads();}
  });
  pad.addEventListener('contextmenu', e => e.preventDefault());
}
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.repeat || !interactive() || !input.points.size) return;
  e.preventDefault(); const p = input.points.values().next().value;
  input.down('keyboard', p.side === 'left' ? 'right' : 'left', p.y); refreshPads();
});
document.addEventListener('keyup', e => {
  if (e.code === 'Space') {syncOrientation(); input.up('keyboard'); refreshPads();}
});
function resetClock() {previous = lastRender = undefined;}
function suspend() {
  if (world.running) world.paused = true;
  cancelInput(); syncSession(); resetClock();
}
window.addEventListener('blur', suspend);
document.addEventListener('visibilitychange', () => {if (document.hidden) suspend();});
function syncOrientation() {
  const blocked = portrait.matches;
  if (blocked === world.orientationBlocked) return;
  world.orientationBlocked = blocked;
  cancelInput(); resetClock();
  if (blocked) {focusBeforeRotation = document.activeElement; panel(false);}
  // Freeze the session clock without changing the user's explicit Pause/Stop state.
  for (const element of [arena, document.querySelector('header'), setup]) element.inert = blocked;
  overlay.hidden = !blocked;
  if (blocked) overlay.focus({preventScroll: true});
  else if (focusBeforeRotation?.isConnected) focusBeforeRotation.focus({preventScroll: true});
  needsDraw = true;
}
portrait.addEventListener('change', () => {syncOrientation(); resize();});
window.addEventListener('orientationchange', () => {cancelInput(); resetClock();});
window.addEventListener('resize', () => {cancelInput(); syncOrientation(); resize();});
function resize() {
  fieldBox = canvas.getBoundingClientRect();
  if (!fieldBox.width || !fieldBox.height) return;
  // Keep logical x/y scales equal: circles remain circular on every landscape ratio.
  world.height = W * fieldBox.height / fieldBox.width;
  input.height = world.height;
  // DPR <= 1.5, with an additional 1 MP budget for large desktop/tablet windows.
  const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(1000000 / (fieldBox.width * fieldBox.height)));
  canvas.width = Math.max(1, Math.floor(fieldBox.width * dpr));
  canvas.height = Math.max(1, Math.floor(fieldBox.height * dpr));
  diagnostics.pixels = canvas.width * canvas.height;
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / world.height, 0, 0);
  needsDraw = true;
}
new ResizeObserver(resize).observe(canvas);
// Rasterize each neon halo once. Runtime targets need one small drawImage, no shadowBlur.
const targetSprites = new Map();
for (const color of ['#36fff3', '#fff04b']) {
  const sprite = document.createElement('canvas'); sprite.width = sprite.height = 96;
  const c = sprite.getContext('2d'), glow = c.createRadialGradient(48, 48, 18, 48, 48, 46);
  glow.addColorStop(0, color + '65'); glow.addColorStop(.35, color + '28'); glow.addColorStop(1, color + '00');
  c.fillStyle = glow; c.fillRect(0, 0, 96, 96);
  c.strokeStyle = color; c.lineWidth = 3; c.beginPath(); c.arc(48, 48, 23.5, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = '#f4ffff'; c.lineWidth = 1; c.stroke();
  targetSprites.set(color, sprite);
}
function line(a, b, color, width = 1) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
  ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function ring(x, y, r, color) {
  ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
}
function draw() {
  ctx.clearRect(0, 0, W, world.height);
  const [a, b] = input.pair();
  if (world.settings.mode === 'release' && a && b && !input.locked) {
    ctx.setLineDash([5, 8]); line({x: 0, y: a.y}, {x: W, y: b.y}, '#a2eee944'); ctx.setLineDash([]);
  }
  for (const o of world.objects) {
    if (o.type === 'bar') {
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.angle);
      ctx.fillStyle = '#829aad'; ctx.fillRect(-o.length / 2, -o.thickness / 2, o.length, o.thickness);
      ctx.restore();
    } else {
      const size = o.radius * 96 / 25;
      ctx.drawImage(targetSprites.get(o.color) || targetSprites.get('#36fff3'), o.x - size / 2, o.y - size / 2, size, size);
    }
    if (world.settings.debug) {
      ctx.lineWidth = .8;
      if (o.type === 'target') ring(o.x, o.y, o.radius, '#ff8bbd');
      else {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.angle); ctx.strokeStyle = '#ff8bbd';
        ctx.strokeRect(-o.length / 2, -o.thickness / 2, o.length, o.thickness); ctx.restore();
      }
    }
  }
  for (const e of world.effects) {
    const progress = e.age / e.life;
    ctx.globalAlpha = 1 - progress;
    if (e.type === 'flash') {
      for (const beam of e.beams) {
        line(beam.from, beam.to, '#36fff340', 7);
        line(beam.from, beam.to, '#aafffa', 1.6);
      }
    } else {
      ctx.lineWidth = e.type === 'explosion' ? 2 : 1;
      if (e.type === 'explosion') {
        ring(e.x, e.y, e.r * progress, e.color);
        if (world.settings.debug) ring(e.x, e.y, e.r, '#ff8bbd');
      } else if (e.type === 'dissolve') ring(e.x, e.y, e.r * (1 + progress * .6), e.color);
      else for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2, r = e.r * progress;
        line({x: e.x + Math.cos(angle) * r, y: e.y + Math.sin(angle) * r},
          {x: e.x + Math.cos(angle) * (r + 5), y: e.y + Math.sin(angle) * (r + 5)}, '#b1faff');
      }
    }
    ctx.globalAlpha = 1;
  }
  // Small layered squares suggest neon shards without blur, shadows, or extra canvases.
  for (const p of world.particles) {
    const fade = 1 - p.age / p.life, size = p.size * (.5 + fade * .5);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = fade * .16;
    ctx.fillRect(p.x - size, p.y - size, size * 2, size * 2);
    ctx.globalAlpha = fade;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    ctx.fillStyle = '#edffff';
    ctx.fillRect(p.x - size / 4, p.y - size / 4, size / 2, size / 2);
  }
  ctx.globalAlpha = 1;
}
function hud(now) {
  if (now - lastHUD >= 100) {
    const cooldown = Math.max(0, world.settings.cooldown - (world.time - world.lastShot));
    const text = !world.running ? 'STOPPED' : world.paused ? 'PAUSED' : cooldown > 0
      ? `COOLDOWN ${cooldown.toFixed(1)}s` : input.locked ? 'RELEASE BOTH' : 'READY';
    if (status.value !== text) status.value = text;
    lastHUD = now;
  }
  if (!perfOutput.hidden && now - lastDiagnostics >= 500) {
    perfOutput.value = `Frame ${diagnostics.frameMs.toFixed(1)} ms · Render ${diagnostics.renderMs.toFixed(1)} ms · Update ${diagnostics.updateMs.toFixed(1)} ms · Objects ${diagnostics.objects}/60 · ${diagnostics.fps} FPS budget`;
    lastDiagnostics = now;
  }
}
function updatePacing(gap) {
  // Sustained slow RAF delivery drops drawing/update frequency to 30 FPS.
  if (diagnostics.fps === 60) {
    pacing.slow = gap > 24 ? pacing.slow + 1 : Math.max(0, pacing.slow - 1);
    if (pacing.slow >= 45) {diagnostics.fps = 30; pacing.fast = 0;}
  } else {
    pacing.fast = gap < 20 && diagnostics.renderMs + diagnostics.updateMs < 8 ? pacing.fast + 1 : 0;
    if (pacing.fast >= 240) {diagnostics.fps = 60; pacing.slow = 0;}
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const gap = previous === undefined ? 16.7 : now - previous;
  previous = now;
  syncOrientation();
  if (world.orientationBlocked || document.hidden) {lastRender = undefined; return;}
  updatePacing(gap);
  if (lastRender !== undefined && now - lastRender < 1000 / diagnostics.fps - 1) return;
  const elapsed = lastRender === undefined ? 0 : Math.min((now - lastRender) / 1000, .1);
  diagnostics.frameMs += ((lastRender === undefined ? 1000 / diagnostics.fps : now - lastRender) - diagnostics.frameMs) * .1;
  lastRender = now;
  let t = performance.now();
  world.step(elapsed);
  diagnostics.updateMs += (performance.now() - t - diagnostics.updateMs) * .1;
  if ((world.running && !world.paused) || needsDraw) {
    t = performance.now(); draw();
    diagnostics.renderMs += (performance.now() - t - diagnostics.renderMs) * .1;
    needsDraw = false;
  }
  diagnostics.objects = world.objects.length;
  hud(now);
}
sync(); syncOrientation(); resize(); requestAnimationFrame(frame);
