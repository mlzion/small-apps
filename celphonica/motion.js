import { MotionModel, orientationQuaternion } from './motion-math.js';

// Sensor/model lifecycle only; consumers receive the same coordinates as the bubble.
export function initMotion({ onCoordinates = () => {} } = {}) {
  const $ = id => document.getElementById(id);
  const model = new MotionModel();
  let enabled = false, requesting = false, generation = 0;
  let source = null, lastReading = null, lastOrientation = -Infinity;
  let timer = null, frame = null;
  const listeners = [];
  const status = text => { $('motion-status').textContent = text; };
  const screenAngle = () => screen.orientation?.angle ?? window.orientation ?? 0;
  const publish = () => onCoordinates({ x: model.x, y: model.y });
  function paint() {
    frame = null;
    // 50% - 10px leaves room for the complete 16px bubble plus border margin.
    $('motion-bubble').style.left = `calc(50% + (50% - 10px) * ${model.x})`;
    $('motion-bubble').style.top = `calc(50% + (50% - 10px) * ${model.y})`;
    $('motion-level').dataset.x = model.x.toFixed(4);
    $('motion-level').dataset.y = model.y.toFixed(4);
  }
  function schedulePaint() { if (frame === null) frame = requestAnimationFrame(paint); }
  function reset() {
    model.reset(); source = null; lastReading = null; lastOrientation = -Infinity;
    $('motion-level').disabled = true;
    publish();
    schedulePaint();
  }
  function recenter() {
    if (!enabled) return;
    // Capture the latest raw sample, not the lagging smoothed bubble position.
    model.recenter();
    publish();
    schedulePaint();
  }
  function accept(quaternion, nextSource) {
    if (!enabled || document.hidden) return;
    const now = performance.now();
    if (source !== nextSource || (lastReading !== null && now - lastReading > 1500)) model.reset();
    source = nextSource; lastReading = now;
    model.sample(quaternion, now, screenAngle());
    publish();
    $('motion-level').disabled = false;
    const message = `${source === 'orientation' ? 'Orientation' : 'Gravity fallback'} · Ready`;
    if ($('motion-status').textContent !== message) status(message);
    schedulePaint();
  }
  function orientation(event) {
    if (!Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    if (!enabled || document.hidden) return;
    lastOrientation = performance.now();
    accept(orientationQuaternion(event.alpha, event.beta, event.gamma), 'orientation');
  }
  function motion(event) {
    if (performance.now() - lastOrientation < 1000) return;
    const g = event.accelerationIncludingGravity;
    if (!g || ![g.x, g.y, g.z].every(Number.isFinite) || Math.hypot(g.x, g.y, g.z) < 1) return;
    // Gravity provides a tilt-only fallback, not integrated gyro drift.
    const beta = Math.atan2(g.y, g.z) * 180 / Math.PI;
    const gamma = Math.atan2(-g.x, Math.hypot(g.y, g.z)) * 180 / Math.PI;
    accept(orientationQuaternion(0, beta, gamma), 'gravity');
  }
  function stop(message = 'Sensors off · Enable in Settings') {
    enabled = false; generation++;
    for (const [type, listener] of listeners.splice(0)) window.removeEventListener(type, listener);
    clearInterval(timer); timer = null;
    reset();
    $('motion-enable').textContent = 'Enable motion';
    $('motion-enable').setAttribute('aria-pressed', 'false');
    status(message);
  }
  async function enable() {
    if (requesting) return;
    if (enabled) { stop(); return; }
    if (!window.isSecureContext) { status('Sensors need HTTPS or localhost.'); return; }
    const types = [['deviceorientation', window.DeviceOrientationEvent, orientation], ['devicemotion', window.DeviceMotionEvent, motion]].filter(([, api]) => api);
    if (!types.length) { status('Sensors unavailable · Notes work'); return; }
    const request = ++generation;
    requesting = true; $('motion-enable').disabled = true;
    status('Requesting sensor access…');
    // Invoke both permission APIs during this gesture, before awaiting either.
    const grants = await Promise.allSettled(types.map(([, api]) => {
      try { return typeof api.requestPermission === 'function' ? api.requestPermission() : 'granted'; }
      catch (error) { return Promise.reject(error); }
    }));
    requesting = false; $('motion-enable').disabled = false;
    if (generation !== request) return;
    types.forEach(([type, , listener], index) => {
      if (grants[index].status === 'fulfilled' && grants[index].value === 'granted') {
        window.addEventListener(type, listener, { passive: true });
        listeners.push([type, listener]);
      }
    });
    if (!listeners.length) { stop('Access denied · Notes work'); return; }
    enabled = true;
    $('motion-enable').textContent = 'Disable motion';
    $('motion-enable').setAttribute('aria-pressed', 'true');
    status('Waiting for sensor readings…');
    const started = performance.now();
    timer = setInterval(() => {
      if (document.hidden) return;
      if (performance.now() - (lastReading ?? started) > 1500) {
        if (model.current) reset();
        status('No sensor readings · Notes work');
      }
    }, 500);
  }
  $('motion-enable').addEventListener('click', enable);
  $('motion-level').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    recenter();
  });
  $('motion-level').addEventListener('click', event => { if (event.detail === 0) recenter(); });
  $('motion-sensitivity').addEventListener('input', event => {
    model.sensitivity = Number(event.target.value);
    $('motion-sensitivity-value').textContent = `${model.sensitivity}×`;
  });
  // Instrument captures neutral before starting the new voice; existing voices
  // smoothly return to neutral through the consumer rather than being restarted.
  function changedFrame() {
    if (!enabled) return;
    reset();
    status(document.hidden ? 'Sensors paused while hidden.' : 'Waiting for sensor readings…');
  }
  screen.orientation?.addEventListener('change', changedFrame);
  window.addEventListener('orientationchange', changedFrame);
  document.addEventListener('visibilitychange', changedFrame);
  window.addEventListener('pagehide', () => stop());
  if (!window.isSecureContext) {
    $('motion-enable').disabled = true;
    status('Sensors need HTTPS or localhost.');
  } else if (!window.DeviceOrientationEvent && !window.DeviceMotionEvent) {
    $('motion-enable').disabled = true;
    status('Sensors unavailable · Notes work');
  }
  paint();
  publish();
  return { recenter };
}
