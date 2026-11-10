import { Synth } from './synth.js';
import { NOTE_NAMES, noteName, noteRows } from './music.js';

const $ = id => document.getElementById(id);
const synth = new Synth();
const pointers = new Map();
let octave = 3;
let padPointer = null;
NOTE_NAMES.forEach((name, value) => $('root').add(new Option(name, value)));

function updateReadout() {
  const held = [...new Set([...pointers.values()].filter(p => p.midi !== null).map(p => p.midi))].sort((a, b) => a - b);
  $('notes').textContent = held.length ? held.map(noteName).join(' · ') : 'Ready to play';
  $('notes').classList.toggle('playing', held.length > 0);
  document.querySelectorAll('.note').forEach(button => {
    const pressed = held.includes(Number(button.dataset.midi));
    button.classList.toggle('pressed', pressed);
    button.setAttribute('aria-pressed', String(pressed));
  });
}
function release(id) {
  synth.stop(id);
  pointers.delete(id);
  updateReadout();
}
function silence() {
  synth.stopAll();
  pointers.clear();
  padPointer = null;
  updateReadout();
}
function renderKeyboard() {
  silence();
  const rows = noteRows(Number($('root').value), $('scale').value, octave);
  $('keyboard').replaceChildren(...rows.map((notes, index) => {
    const row = document.createElement('div');
    row.className = 'octave-row';
    row.style.setProperty('--columns', notes.length);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `Octave row ${index + 1}`);
    for (const midi of notes) {
      const button = document.createElement('button');
      button.className = 'note' + (midi % 12 === Number($('root').value) ? ' root-note' : '');
      button.dataset.midi = midi;
      button.textContent = noteName(midi);
      button.setAttribute('aria-pressed', 'false');
      row.append(button);
    }
    return row;
  }));
  $('range').textContent = `${noteName(rows[0][0])}–${noteName(rows[2].at(-1))}`;
  $('octave-down').disabled = octave === 1;
  $('octave-up').disabled = octave === 6;
}
function targetNote(x, y) {
  const button = document.elementFromPoint(x, y)?.closest('.note');
  return button ? Number(button.dataset.midi) : null;
}
function moveNote(id, midi) {
  const pointer = pointers.get(id);
  if (!pointer || pointer.midi === midi) return;
  synth.stop(id);
  pointer.midi = midi;
  if (midi !== null && pointer.ready) synth.start(id, midi);
  updateReadout();
}
$('keyboard').addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.target.closest('.note')) return;
  event.preventDefault();
  $('keyboard').setPointerCapture(event.pointerId);
  const pointer = { midi: null, ready: false };
  pointers.set(event.pointerId, pointer);
  // Resume is invoked synchronously inside the gesture; late promises cannot revive released notes.
  try {
    const unlocked = synth.unlock();
    moveNote(event.pointerId, targetNote(event.clientX, event.clientY));
    const start = () => {
      if (pointers.get(event.pointerId) !== pointer) return;
      pointer.ready = true;
      if (pointer.midi !== null) synth.start(event.pointerId, pointer.midi);
      $('audio-status').textContent = 'Audio ready · Release to stop';
    };
    if (synth.context.state === 'running') start();
    else unlocked.then(start).catch(() => {
      release(event.pointerId);
      $('audio-status').textContent = 'Audio could not start. Touch a note to retry.';
    });
  } catch (error) {
    release(event.pointerId);
    $('audio-status').textContent = error.message;
  }
});
$('keyboard').addEventListener('pointermove', event => {
  if (pointers.has(event.pointerId)) {
    event.preventDefault();
    moveNote(event.pointerId, targetNote(event.clientX, event.clientY));
  }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('keyboard').addEventListener(type, event => release(event.pointerId));
}
window.addEventListener('blur', silence);
window.addEventListener('pagehide', silence);
document.addEventListener('visibilitychange', () => { if (document.hidden) silence(); });
window.addEventListener('resize', silence);
document.addEventListener('contextmenu', event => event.preventDefault());
for (const id of ['root', 'scale']) $(id).addEventListener('change', renderKeyboard);
$('octave-down').addEventListener('click', () => { if (octave > 1) octave--; renderKeyboard(); });
$('octave-up').addEventListener('click', () => { if (octave < 6) octave++; renderKeyboard(); });
$('waveform').addEventListener('change', event => synth.setWaveform(event.target.value));
$('volume').addEventListener('input', event => synth.setVolume(Number(event.target.value) / 100));

function updateExpression(values) {
  synth.setExpression(values);
  const { brightness, level } = synth.expression;
  $('cursor').style.left = `${brightness * 100}%`;
  $('cursor').style.top = `${(1 - level) * 100}%`;
  $('filter-slider').value = Math.round(brightness * 100);
  $('expression-value').textContent = `Bright ${Math.round(brightness * 100)}% · Level ${Math.round(level * 100)}%`;
}
function movePad(event) {
  const box = $('xy-pad').getBoundingClientRect();
  updateExpression({ brightness: (event.clientX - box.left) / box.width, level: 1 - (event.clientY - box.top) / box.height });
}
$('xy-pad').addEventListener('pointerdown', event => {
  if (event.button !== 0 || padPointer !== null) return;
  event.preventDefault();
  padPointer = event.pointerId;
  $('xy-pad').setPointerCapture(padPointer);
  movePad(event);
});
$('xy-pad').addEventListener('pointermove', event => { if (event.pointerId === padPointer) movePad(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  $('xy-pad').addEventListener(type, event => { if (event.pointerId === padPointer) padPointer = null; });
}
$('expression-mode').addEventListener('change', event => {
  padPointer = null;
  const slider = event.target.value === 'slider';
  $('xy-pad').hidden = slider;
  $('slider-control').hidden = !slider;
  updateExpression({ level: 1 });
});
$('filter-slider').addEventListener('input', event => updateExpression({ brightness: Number(event.target.value) / 100 }));
$('fullscreen').hidden = !document.fullscreenEnabled;
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { $('audio-status').textContent = 'Full screen unavailable. You can still play here.'; }
});
document.addEventListener('fullscreenchange', () => { $('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen'; });
renderKeyboard();
updateExpression({});
