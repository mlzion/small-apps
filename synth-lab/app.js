import { SynthEngine, frequencyForNote } from './engine.js';
import { oscillatorLesson } from './lessons.js';
import { Tutorial } from './tutorial.js';
import { Visualizer } from './visualizer.js';

const $ = id => document.getElementById(id);
const engine = new SynthEngine();
const held = new Map();
let lastRender = '';
let focusLesson = false;
const scrollTo = el => el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'nearest' });
function setWaveform(value) {
  engine.setWaveform(value);
  document.querySelectorAll('[data-wave]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wave === value)));
}
const lesson = new Tutorial(oscillatorLesson, {
  onEnter: setWaveform,
  onRender: state => {
    const panel = $('lesson');
    document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
    $('guided').setAttribute('aria-pressed', String(state.mode === 'guided'));
    $('free').setAttribute('aria-pressed', String(state.mode === 'free'));
    panel.hidden = state.mode !== 'guided';
    const key = `${state.mode}:${state.index}`;
    if (state.mode === 'guided') {
      const step = state.step;
      $(step?.slot || 'intro-slot').append(panel);
      $('lesson-progress').textContent = state.complete ? 'LESSON COMPLETE' : `MEET THE OSCILLATOR · ${state.index + 1} / ${state.lesson.steps.length}`;
      $('lesson-title').textContent = step?.title || 'Keep exploring.';
      $('lesson-copy').textContent = step?.message || state.lesson.completion;
      $('back').disabled = state.index === 0;
      $('skip').hidden = state.complete;
      $('lesson-restart').hidden = !state.complete;
      $('next').textContent = state.complete ? 'Free Play →' : state.index === state.lesson.steps.length - 1 ? 'Finish Lesson →' : 'Next →';
      $('next').disabled = !state.canNext;
      $('lesson-hint').textContent = step?.requires && !state.canNext ? 'Play a note to continue, or skip this step.' : step?.requires ? 'Nice — keep experimenting, or choose Next.' : '';
      for (const id of step?.targets || []) $(id)?.classList.add('tutorial-highlight');
      if (key !== lastRender && focusLesson) { $('lesson-title').focus({ preventScroll: true }); scrollTo(panel); }
    }
    lastRender = key;
  }
});

async function enableAudio() {
  try {
    await engine.enable();
    $('enable').textContent = 'Audio enabled';
    $('audio-status').textContent = 'Audio ready. Press and hold a key to listen.';
    return true;
  } catch (error) {
    $('enable').textContent = 'Enable audio';
    $('audio-status').textContent = `Could not enable audio. ${error.message}`;
    return false;
  }
}
$('enable').addEventListener('click', enableAudio);
$('guided').addEventListener('click', () => { focusLesson = true; lesson.setMode('guided'); });
$('free').addEventListener('click', () => lesson.setMode('free'));
for (const id of ['restart', 'lesson-restart']) $(id).addEventListener('click', () => { focusLesson = true; lesson.restart(); });
$('back').addEventListener('click', () => { focusLesson = true; lesson.back(); });
$('next').addEventListener('click', () => { focusLesson = true; if (lesson.complete) lesson.setMode('free'); else lesson.next(); });
$('skip').addEventListener('click', () => { focusLesson = true; lesson.skip(); });
document.querySelectorAll('[data-wave]').forEach(button => button.addEventListener('click', () => setWaveform(button.dataset.wave)));
$('tuning').addEventListener('input', event => { engine.setReference(event.target.value); $('tuning-value').textContent = `${engine.reference} Hz`; updateKeys(); });
$('volume').addEventListener('input', event => { engine.setVolume(event.target.value / 100); $('volume-value').textContent = `${event.target.value}%`; });

const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const shortcuts = ['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'];
const noteName = midi => names[midi % 12] + (Math.floor(midi / 12) - 1);
let whiteIndex = 0;
for (let midi = 60; midi <= 72; midi++) {
  const button = document.createElement('button'), black = names[midi % 12].includes('♯');
  button.type = 'button'; button.className = `key${black ? ' black' : ''}`; button.dataset.midi = midi;
  button.textContent = noteName(midi); button.setAttribute('aria-label', `${noteName(midi)}, hold to play`); button.setAttribute('aria-pressed', 'false');
  button.title = `${noteName(midi)} · ${shortcuts[midi - 60].toUpperCase()}`;
  if (black) button.style.left = `${whiteIndex * 12.5 - 3.6}%`; else whiteIndex++;
  $('keys').append(button);
}
function updateKeys() {
  document.querySelectorAll('.key').forEach(key => {
    const pressed = [...held.values()].some(note => note.midi === +key.dataset.midi);
    key.classList.toggle('pressed', pressed); key.setAttribute('aria-pressed', String(pressed));
  });
  const midi = [...held.values()].filter(note => note.playing).map(note => note.midi);
  $('note-status').textContent = midi.length ? [...new Set(midi)].map(note => `${noteName(note)} · ${frequencyForNote(note, engine.reference).toFixed(1)} Hz`).join(' / ') : 'Hold a key to listen';
}
async function press(id, midi) {
  if (held.has(id)) return;
  const entry = { midi, playing: false }; held.set(id, entry); updateKeys();
  // A short tap can finish before resume resolves. Identity prevents stale resurrection.
  if (await enableAudio() && held.get(id) === entry) {
    entry.playing = engine.noteOn(id, midi);
    if (entry.playing) lesson.notify('note');
    updateKeys();
  }
}
function release(id) { engine.noteOff(id); held.delete(id); updateKeys(); }
function releaseAll() { held.clear(); engine.allNotesOff(); updateKeys(); }
$('keys').addEventListener('pointerdown', event => {
  const key = event.target.closest('.key');
  if (!key || (event.pointerType === 'mouse' && event.button !== 0)) return;
  event.preventDefault(); key.focus({ preventScroll: true }); key.setPointerCapture(event.pointerId);
  press(`pointer:${event.pointerId}`, +key.dataset.midi);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('keys').addEventListener(type, event => release(`pointer:${event.pointerId}`));
$('keys').addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('keydown', event => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  const key = target.closest?.('.key');
  if (key && (event.code === 'Space' || event.code === 'Enter')) {
    event.preventDefault(); press(`key:${event.code}`, +key.dataset.midi); return;
  }
  if (target.matches?.('input,select,textarea,[contenteditable=true]')) return;
  const index = shortcuts.indexOf(event.key.toLowerCase());
  if (index >= 0) { event.preventDefault(); press(`key:${event.code}`, 60 + index); }
});
document.addEventListener('keyup', event => {
  if (held.has(`key:${event.code}`)) { event.preventDefault(); release(`key:${event.code}`); }
});
$('keys').addEventListener('focusout', event => { if (event.target.closest('.key')) { release('key:Space'); release('key:Enter'); } });
window.addEventListener('blur', releaseAll);
window.addEventListener('pagehide', releaseAll);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

const help = {
  oscillator: ['Oscillator', 'An oscillator repeats a signal many times per second. Pitch comes from how fast it repeats; waveform shape changes which harmonics you hear. Hold a key while you experiment.'],
  waveform: ['Waveform', 'Sine has one frequency. Triangle adds gentle odd harmonics. Sawtooth has both odd and even harmonics. Square emphasizes odd harmonics for a hollow, buzzy sound. Try switching shapes while holding a note.'],
  pitch: ['Reference tuning', 'Frequency counts vibrations per second, measured in hertz (Hz). A4 is normally 440 Hz. This slider retunes the whole keyboard relative to A4; each octave still doubles the frequency. C4 is about 261.6 Hz at standard tuning.'],
  volume: ['Master volume', 'This changes the loudness of all notes together. It starts at 20% with extra headroom for chords. Begin with a low device volume and adjust to a comfortable level.'],
  scope: ['Waveform display', 'This oscilloscope shows about 12 milliseconds of actual audio after the volume control. More cycles in the same space means a higher pitch. A fixed display magnification makes quiet notes easier to see. Chords combine several waveforms.'],
  spectrum: ['Spectrum display', 'Left means lower frequency; right means higher frequency. Taller peaks mean stronger frequency components. A sine has one main peak; sawtooth adds harmonics at whole-number multiples. The horizontal scale is logarithmic, from 20 Hz to 20 kHz.']
};
let helpTrigger;
document.querySelectorAll('[data-help]').forEach(button => button.addEventListener('click', () => {
  helpTrigger = button;
  const [title, copy] = help[button.dataset.help];
  $('help-title').textContent = title; $('help-copy').textContent = copy; $('help').hidden = false;
  $('help-close').focus({ preventScroll: true }); scrollTo($('help'));
}));
function closeHelp() { $('help').hidden = true; helpTrigger?.focus(); }
$('help-close').addEventListener('click', closeHelp);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('help').hidden) closeHelp(); });
new Visualizer(engine, $('scope'), $('spectrum'));
lesson.enter();
