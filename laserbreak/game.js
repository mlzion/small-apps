/* Original LaserBreak browser adapter: frame updates, cached glow, event-driven UI. */
'use strict';
const {World, Input, W, H, defaults} = LaserBreak;
const world = new World();
world.start();
const session = new LaserArcade.ArcadeSession(world);
const audio = new LaserSound.LaserAudio();
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
const input = new Input((a, b) => {
  if (world.fire(a, b)) audio.playShot(world.lastShotSounds);
  needsDraw = true;
}, () => world.ready());
let needsDraw = true, fieldBox, previous, lastRender, lastHUD = -Infinity, lastDiagnostics = 0;
let focusBeforeRotation;
const diagnostics = {frameMs: 16.7, renderMs: 0, updateMs: 0, objects: 0, fps: 60, pixels: 0};
const pacing = {slow: 0, fast: 0};
const controls = [
  ['cooldown', 'Laser cooldown', 0, 2, .05, 's'],
  ['blastMultiplier', 'Blast diameter multiplier', 1, 5, .5, '×'],
  ['targetSize', 'Target diameter', 12, 70, 2, 'px'],
  ['targetSpeed', 'Target falling speed', 0, 180, 5, 'px/s'],
  ['barLength', 'Bar length', 30, 220, 5, 'px'],
  ['barSpeed', 'Bar falling speed', 0, 180, 5, 'px/s'],
  ['barRotation', 'Bar rotation speed', -240, 240, 5, '°/s'],
  ['density', 'Object density', 0, 100, 1, '%'],
  ['barPercentage', 'Bar Percentage', 0, 100, 10, '%']
];
const sliders = new Map();
for (const [key, label, min, max, step, unit] of controls) {
  const row = document.createElement('div');
  row.className = 'setting-row';
  row.innerHTML = `<label class="slider-label" for="${key}">${label}<output for="${key}"></output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
  document.querySelector('#sliders').append(row);
  const slider = row.querySelector('input'), output = row.querySelector('output');
  sliders.set(key, {slider, output, unit});
  installTouchSlider(slider);
  slider.addEventListener('input', () => {
    if (session.mode === 'arcade') return;
    world.configure(key, Number(slider.value));
    output.value = `${slider.value}${unit}`; // Only the changed slider; never rewrite the others mid-drag.
  });
}
// Touch sliders commit only a tap or deliberate horizontal drag, never a vertical swipe.
function installTouchSlider(slider) {
  let gesture;
  function adjust(x) {
    const box = gesture.box, inset = 14;
    const fraction = Math.max(0, Math.min(1, (x - box.left - inset) / (box.width - inset * 2)));
    const min = Number(slider.min), max = Number(slider.max), step = Number(slider.step);
    slider.value = min + Math.round(fraction * (max - min) / step) * step;
    slider.dispatchEvent(new Event('input', {bubbles: true}));
  }
  // Disable the range's eager native touch edit; pointer intent below owns touch input.
  slider.addEventListener('touchstart', e => e.preventDefault(), {passive: false});
  slider.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || slider.disabled) return;
    e.preventDefault();
    gesture = {id: e.pointerId, x: e.clientX, y: e.clientY, scrollTop: setup.scrollTop, box: slider.getBoundingClientRect(), intent: null};
    slider.setPointerCapture(e.pointerId);
  });
  slider.addEventListener('pointermove', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    if (setup.hidden) {gesture = null; return;}
    const dx = Math.abs(e.clientX - gesture.x), dy = Math.abs(e.clientY - gesture.y);
    if (!gesture.intent && Math.max(dx, dy) > 8) gesture.intent = dx > dy ? 'adjust' : 'scroll';
    if (gesture.intent === 'adjust') {e.preventDefault(); adjust(e.clientX);}
    else if (gesture.intent === 'scroll') setup.scrollTop = gesture.scrollTop - (e.clientY - gesture.y);
  });
  slider.addEventListener('pointerup', e => {
    if (!gesture || gesture.id !== e.pointerId) return;
    if (setup.hidden) {gesture = null; return;}
    if (gesture.intent !== 'scroll') {adjust(e.clientX); slider.focus({preventScroll: true});}
    gesture = null;
  });
  for (const event of ['pointercancel', 'lostpointercapture']) slider.addEventListener(event, () => {gesture = null;});
}
function sync() {
  for (const [key, {slider, output, unit}] of sliders) {
    slider.value = world.settings[key];
    slider.disabled = session.mode === 'arcade';
    output.value = `${Number(world.settings[key].toFixed(2))}${unit}`;
  }
  document.querySelector('#sound').checked = world.settings.sound;
  audio.setEnabled(world.settings.sound);
  document.querySelector('#debug').checked = world.settings.debug;
  syncSession();
  syncArcade();
  document.querySelector('#hint').textContent = 'Hold both pads · slide to aim · release to fire';
}
function syncSession() {
  pauseButton.textContent = world.paused ? 'Resume' : 'Pause';
  pauseButton.disabled = !world.running || world.arcadeBlocked;
  sessionButton.textContent = world.running ? 'Stop' : 'Start';
  lastHUD = -Infinity;
  needsDraw = true;
}
function syncSurface() {
  const blocked = world.orientationBlocked || world.settingsOpen;
  arena.inert = blocked;
  document.querySelector('header').inert = blocked;
  setup.inert = world.orientationBlocked;
  pads.left.inert = pads.right.inert = world.arcadeBlocked;
}
function panel(open) {
  if (open === world.settingsOpen) return;
  if (open && world.orientationBlocked) return;
  cancelInput(); audio.stop(); resetClock();
  world.settingsOpen = open; // Separate from explicit paused/running state; nothing to rewind on close.
  setup.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  syncSurface();
  if (open) {setup.scrollTop = 0; document.querySelector('#close-setup').focus({preventScroll: true});}
  else if (!world.orientationBlocked) toggle.focus({preventScroll: true});
  needsDraw = true;
}
toggle.addEventListener('pointerdown', e => {if (e.button === 0) {e.preventDefault(); panel(true);}});
toggle.onclick = () => panel(true);
const closeSetup = document.querySelector('#close-setup');
closeSetup.addEventListener('pointerdown', e => {if (e.button === 0) {e.preventDefault(); panel(false);}});
closeSetup.onclick = () => panel(false);
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' && !setup.hidden) {e.preventDefault(); panel(false);}
});
setup.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const controls = Array.from(setup.querySelectorAll('button:not(:disabled), input:not(:disabled), select'));
  const first = controls[0], last = controls[controls.length - 1];
  if (e.shiftKey && document.activeElement === first) {e.preventDefault(); last.focus();}
  else if (!e.shiftKey && document.activeElement === last) {e.preventDefault(); first.focus();}
});
document.querySelector('#sound').onchange = e => {
  world.configure('sound', e.target.checked); audio.setEnabled(e.target.checked);
  if (e.target.checked) audio.unlock();
};
document.querySelector('#debug').onchange = e => {
  world.configure('debug', e.target.checked); needsDraw = true;
};
document.querySelector('#diagnostics').onchange = e => {
  perfOutput.hidden = !e.target.checked;
  lastDiagnostics = -Infinity;
};
pauseButton.onclick = () => {
  if (world.orientationBlocked || !world.running || world.arcadeBlocked) return;
  world.paused = !world.paused; audio.stop(); cancelInput(); syncSession(); resetClock();
};
sessionButton.onclick = () => {
  if (world.orientationBlocked) return;
  world.running ? session.stop() : session.start(); audio.stop(); cancelInput(); sync(); resetClock();
};
document.querySelector('#clear').onclick = () => {if (session.mode === 'arcade') return; world.clear(); audio.stop(); cancelInput(); needsDraw = true;};
document.querySelector('#reset').onclick = () => {
  if (session.mode === 'arcade') session.begin(1);
  else {world.settings = {...defaults}; world.start();}
  audio.stop(); cancelInput(); sync(); resetClock();
};
function textIfChanged(element, value) {if (element.textContent !== value) element.textContent = value;}
const gameMode = document.querySelector('#game-mode');
const arcadeMenu = document.querySelector('#arcade-menu');
const arcadeHUD = document.querySelector('#arcade-hud');
const arcadeLevel = document.querySelector('#arcade-level');
const arcadeTime = document.querySelector('#arcade-time');
const defenseBar = document.querySelector('#defense-bar');
const destroyedBar = document.querySelector('#defense-destroyed');
const escapedBar = document.querySelector('#defense-escaped');
const defenseMarker = document.querySelector('#defense-marker');
let defenseKey = '', shownWarnings = 0;
const levelSelect = document.querySelector('#level-select');
document.querySelector('#game-mode option[value=arcade]').textContent = `Arcade · ${LaserArcade.CONFIG.levelCount} levels`;
for (let n = 1; n <= LaserArcade.CONFIG.levelCount; n++) {
  const option = document.createElement('option'); option.value = n; option.textContent = `Level ${n}`; levelSelect.append(option);
}
function syncArcade() {
  const arcade = session.mode === 'arcade';
  gameMode.value = session.mode;
  arcadeHUD.hidden = !arcade;
  defenseBar.hidden = !arcade;
  defenseKey = '';
  shownWarnings = session.warningCount;
  escapedBar.classList.remove('warning');
  arena.classList.toggle('arcade', arcade);
  document.querySelector('#arcade-tools').hidden = !arcade || !LaserArcade.CONFIG.testingLevelSelect;
  document.querySelector('#arcade-settings-note').hidden = !arcade;
  document.querySelector('#clear').disabled = arcade;
  document.querySelector('#reset').textContent = arcade ? 'Restart Level 1' : 'Reset to defaults';
  arcadeMenu.hidden = !arcade || session.state === 'playing';
  syncSurface();
  if (!arcade) return;
  levelSelect.value = session.level.number;
  defenseMarker.style.left = `${session.level.requiredDestructionPercent}%`;
  const title = document.querySelector('#arcade-title'), detail = document.querySelector('#arcade-detail');
  const action = document.querySelector('#arcade-action'), secondary = document.querySelector('#arcade-secondary');
  secondary.hidden = session.state === 'victory';
  secondary.textContent = session.state === 'ready' ? 'Free Play' : 'Restart from Level 1';
  if (session.state === 'ready') {
    title.textContent = 'Level 1'; detail.textContent = `${session.level.duration} seconds · Defend the field. Lift either thumb to fire.`; action.textContent = 'Start Level 1';
  } else if (session.state === 'between') {
    title.textContent = `Level ${session.level.number} cleared`;
    detail.textContent = resultDescription(session.lastResult);
    action.textContent = `Start Level ${session.level.number + 1}`;
  } else if (session.state === 'retry') {
    title.textContent = 'Try again'; detail.textContent = resultDescription(session.lastResult); action.textContent = `Retry Level ${session.level.number}`;
  } else if (session.state === 'victory') {
    title.textContent = `All ${LaserArcade.CONFIG.levelCount} levels cleared`; detail.textContent = resultDescription(session.lastResult); action.textContent = 'Restart from Level 1';
  } else if (session.state === 'stopped') {
    title.textContent = 'Arcade stopped'; detail.textContent = `Start a fresh attempt at Level ${session.level.number}.`; action.textContent = `Start Level ${session.level.number}`;
  }
  lastHUD = -Infinity;
}
function resultDescription(result) {
  const percent = result.percent === null ? 'No targets resolved' : `${result.percent.toFixed(1)}% destroyed`;
  return `Level ${result.level} · ${result.passed ? 'PASS' : 'FAIL'} · Destroyed ${result.targets} · Escaped ${result.escaped} · ${percent} · Required ${result.requiredDestructionPercent}%.`;
}
function updateDefense() {
  const key = `${world.stats.targets}:${world.stats.escaped}`;
  if (key !== defenseKey) {
    const defense = session.defense;
    defenseBar.classList.toggle('neutral', defense.resolved === 0);
    const percent = defense.percent ?? 0;
    destroyedBar.style.width = `${percent}%`;
    escapedBar.style.width = `${defense.resolved ? 100-percent : 0}%`;
    defenseKey = key;
  }
  if (session.warningCount !== shownWarnings) {
    escapedBar.classList.remove('warning');
    // Restart only on a new downward crossing, not on ordinary HUD refreshes.
    void escapedBar.offsetWidth;
    escapedBar.classList.add('warning');
    shownWarnings = session.warningCount;
  }
}
function arcadeChange(change) {
  cancelInput(); audio.stop(); change(); sync(); resetClock();
}
gameMode.onchange = () => arcadeChange(() => session.setMode(gameMode.value));
document.querySelector('#arcade-action').onclick = () => arcadeChange(() => session.begin(
  session.state === 'between' ? session.level.number + 1 : session.state === 'victory' ? 1 : session.level.number));
document.querySelector('#arcade-secondary').onclick = () => arcadeChange(() => {
  if (session.state === 'ready') session.setMode('free'); else session.begin(1);
});
document.querySelector('#load-level').onclick = () => {
  if (LaserArcade.CONFIG.testingLevelSelect && session.mode === 'arcade') arcadeChange(() => session.begin(Number(levelSelect.value)));
};
document.querySelector('#restart-arcade').onclick = () => arcadeChange(() => session.begin(1));
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
  return world.running && !world.paused && !world.arcadeBlocked && !world.orientationBlocked && setup.hidden;
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
document.addEventListener('pointerdown', () => {tryLandscapeLock(); if (!world.orientationBlocked) audio.unlock();}, {passive: true});
document.addEventListener('keydown', () => {if (!world.orientationBlocked) audio.unlock();});
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
  audio.stop();
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
  syncSurface();
  if (blocked) audio.stop();
  overlay.hidden = !blocked;
  if (blocked) overlay.focus({preventScroll: true});
  else if (focusBeforeRotation?.isConnected && focusBeforeRotation.getClientRects().length) focusBeforeRotation.focus({preventScroll: true});
  else toggle.focus({preventScroll: true});
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
  if (a && b && !input.locked) {
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
    } else if (e.type === 'escape') {
      ctx.fillStyle = '#ff4d60'; ctx.globalAlpha = (1-progress)*.35;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.r*(.5+progress*.5),Math.PI,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1-progress; line({x:e.x-e.r,y:e.y-2},{x:e.x+e.r,y:e.y-2},'#ff5868',4);
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
    const text = !world.running ? 'STOPPED' : world.paused ? 'PAUSED' : world.arcadeBlocked ? 'ARCADE' : cooldown > 0
      ? `COOLDOWN ${cooldown.toFixed(1)}s` : input.locked ? 'RELEASE BOTH' : 'READY';
    if (status.value !== text) status.value = text;
    if (session.mode === 'arcade') {
      textIfChanged(arcadeLevel, `${session.level.number}/${LaserArcade.CONFIG.levelCount}`);
      textIfChanged(arcadeTime, String(Math.ceil(session.remaining)));
      updateDefense();
    }
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
  const rawElapsed = lastRender === undefined ? 0 : (now - lastRender) / 1000;
  const elapsed = session.mode === 'arcade' ? rawElapsed : Math.min(rawElapsed, .1);
  diagnostics.frameMs += ((lastRender === undefined ? 1000 / diagnostics.fps : now - lastRender) - diagnostics.frameMs) * .1;
  lastRender = now;
  let t = performance.now();
  const beforeState = session.state, beforeEscaped = world.stats.escaped;
  session.step(elapsed);
  if (beforeState !== session.state) {cancelInput(); audio.stop(); resetClock(); sync();}
  if (session.mode === 'arcade' && world.stats.escaped > beforeEscaped) {audio.playEscape(); lastHUD = -Infinity;}
  diagnostics.updateMs += (performance.now() - t - diagnostics.updateMs) * .1;
  if ((world.running && !world.paused && !world.settingsOpen && !world.arcadeBlocked) || needsDraw) {
    t = performance.now(); draw();
    diagnostics.renderMs += (performance.now() - t - diagnostics.renderMs) * .1;
    needsDraw = false;
  }
  diagnostics.objects = world.objects.length;
  hud(now);
}
sync(); syncOrientation(); resize(); requestAnimationFrame(frame);
