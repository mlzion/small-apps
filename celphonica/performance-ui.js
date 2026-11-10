// View lifecycle only; audio is released through the instrument's callback.
export function initPerformanceUI(silence) {
  const $ = id => document.getElementById(id);
  const dialog = $('settings');
  const portrait = matchMedia('(orientation: portrait)');
  let ownsOrientationLock = false;
  function closeSettings() {
    if (dialog.open) dialog.close();
  }
  function openSettings() {
    if (portrait.matches || dialog.open) return;
    silence();
    dialog.showModal();
    $('settings-open').setAttribute('aria-expanded', 'true');
  }
  // A second thumb must work while the first holds a note. Mobile browsers
  // do not always synthesize a click for non-primary touch pointers.
  $('settings-open').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    openSettings();
  });
  $('settings-open').addEventListener('click', openSettings); // keyboard/assistive activation
  $('settings-close').addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    closeSettings();
  });
  $('settings-close').addEventListener('click', closeSettings);
  dialog.addEventListener('pointerdown', event => {
    // Dismiss only gestures that begin outside, never a slider drag ending there.
    if (event.button === 0 && event.target === dialog) {
      event.preventDefault();
      closeSettings();
    }
  });
  dialog.addEventListener('close', () => {
    $('settings-open').setAttribute('aria-expanded', 'false');
    if (!portrait.matches) $('settings-open').focus({ preventScroll: true });
  });
  // Native modal dialogs handle Escape and background inertness. Wrap Tab at
  // the ends so keyboard navigation stays in the drawer rather than browser chrome.
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled), select, input')]
      .filter(element => element.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if ((!event.shiftKey && document.activeElement === last) ||
        (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  });
  function releaseOrientation() {
    if (!ownsOrientationLock) return;
    ownsOrientationLock = false;
    try { screen.orientation?.unlock?.(); } catch { /* Browser may already have unlocked. */ }
  }
  function viewStatus(text) {
    $('view-status').textContent = text;
    $('rotate-status').textContent = text;
  }
  async function fullscreen() {
    silence();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch {
      viewStatus('Full screen unavailable. Rotate the phone to play.');
      return;
    }
    try {
      if (typeof screen.orientation?.lock !== 'function') throw new Error('unsupported');
      await screen.orientation.lock('landscape');
      ownsOrientationLock = true;
      // An exit can occur while the lock request is pending.
      if (!document.fullscreenElement) releaseOrientation();
      else viewStatus(portrait.matches ? 'Landscape requested. Rotate the phone if needed.' : 'Landscape view');
    } catch {
      viewStatus('Landscape lock unavailable. Rotate the phone if needed.');
    }
  }
  for (const id of ['fullscreen', 'portrait-fullscreen']) {
    $(id).hidden = !document.fullscreenEnabled;
    $(id).addEventListener('click', fullscreen);
  }
  document.addEventListener('fullscreenchange', () => {
    silence();
    $('fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    $('portrait-fullscreen').textContent = document.fullscreenElement ? 'Exit full screen' : 'Try full screen';
    if (!document.fullscreenElement) {
      releaseOrientation();
      $('view-status').textContent = 'Landscape performance';
      $('rotate-status').textContent = 'Full screen can rotate the view where supported.';
    }
  });
  function orientationChanged() {
    silence();
    if (portrait.matches) {
      closeSettings();
      $('rotate-status').textContent = document.fullscreenElement ? 'Rotate your phone to landscape.' : 'Full screen can rotate the view where supported.';
    }
  }
  portrait.addEventListener('change', orientationChanged);
  screen.orientation?.addEventListener('change', orientationChanged);
  window.addEventListener('orientationchange', orientationChanged);
  window.addEventListener('pagehide', releaseOrientation);
  return { isPlayable: () => !portrait.matches && !dialog.open };
}
