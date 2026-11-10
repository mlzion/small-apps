// Lesson content and targets are independent of audio and presentation.
export const oscillatorLesson = {
  title: 'Meet the Oscillator',
  steps: [
    { title: 'What makes a sound?', message: "An oscillator generates a repeating signal that we can hear as sound. Let's explore some different shapes that signal can take.", targets: ['oscillator'], slot: 'intro-slot' },
    { title: 'Play your first note', message: "Press and hold a key on the keyboard. You're hearing a sine wave, the simplest waveform. Notice its smooth, pure tone.", targets: ['keyboard'], slot: 'intro-slot', enter: 'sine', requires: 'note' },
    { title: 'Change the waveform', message: "Select Sawtooth and play the same note again. Hear how much brighter and buzzier it sounds? That's because it contains more harmonics.", targets: ['waveforms'], slot: 'wave-slot' },
    { title: 'Explore pitch', message: 'Play a low note, then a high note. Higher notes vibrate faster. Watch how the waveform changes as you play.', targets: ['keyboard', 'scope-panel'], slot: 'scope-slot' },
    { title: 'See the harmonics', message: 'Switch between Sine and Sawtooth while watching the spectrum display. The extra peaks in the sawtooth show the harmonics that give it its distinctive sound.', targets: ['waveforms', 'spectrum-panel'], slot: 'spectrum-slot' }
  ],
  completion: "You've learned that pitch depends on frequency, while waveform shape determines much of a sound's character. Try creating your own sounds in Free Play mode!"
};
