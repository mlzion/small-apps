// Stable IDs keep saved shades independent of swatch order and endpoint colors.
export const BASE_COLORS = [
  {id: 'red', name: 'Red', color: '#ff0000'},
  {id: 'orange', name: 'Orange', color: '#ff8000'},
  {id: 'yellow', name: 'Yellow', color: '#ffff00'},
  {id: 'green', name: 'Green', color: '#00ff00'},
  {id: 'cyan', name: 'Cyan', color: '#00ffff'},
  {id: 'blue', name: 'Blue', color: '#0000ff'},
  {id: 'violet', name: 'Violet', color: '#8000ff'},
  {id: 'magenta', name: 'Magenta', color: '#ff00ff'},
  {id: 'rose', name: 'Rose', color: '#ff0080'},
  {id: 'brown', name: 'Brown', color: '#804000'},
  {id: 'gray', name: 'Gray', color: '#808080'},
  {id: 'white', name: 'White', color: '#ffffff'},
];
const LEGACY_IDS = ['coral', 'red', 'orange', 'yellow', 'green', 'teal',
  'blue', 'violet', 'pink', 'brown', 'gray', 'charcoal'];

// Derived only from current assignments: not a history, pixel scan or saved cache.
export function collectUsedColors(styles) {
  const colors = new Set();
  for (const style of styles.values()) {
    colors.add(style.color1.toLowerCase());
    if (style.mode === 'gradient') colors.add(style.color2.toLowerCase());
  }
  return [...colors].sort();
}

// -100 = black, 0 = original, +100 = white. RGB interpolation, no HSL conversion.
export function shadeColor(hex, shade) {
  const amount = Math.max(-100, Math.min(100, shade)) / 100;
  const target = amount < 0 ? 0 : 255;
  return '#' + [1, 3, 5].map(offset => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(channel + (target - channel) * Math.abs(amount))
      .toString(16).padStart(2, '0');
  }).join('');
}

export function defaultPalette() {
  return {
    baseVersion: 2,
    shades: Object.fromEntries(BASE_COLORS.map(base => [base.id, 0])),
    selected: 'red',
    activeEndpoint: 'color1',
    colors: {color1: '#ff0000', color2: '#ffff00'},
  };
}

export function validatePalette(value) {
  const isColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
  const legacy = value?.baseVersion === undefined;
  const ids = legacy ? LEGACY_IDS : BASE_COLORS.map(base => base.id);
  if (!value || typeof value !== 'object' || !value.shades ||
      (!legacy && value.baseVersion !== 2) ||
      !['color1', 'color2'].includes(value.activeEndpoint) ||
      !(value.selected === null || ids.includes(value.selected)) ||
      !value.colors || !isColor(value.colors.color1) || !isColor(value.colors.color2) ||
      ids.some(id => !Number.isFinite(value.shades[id]) ||
        value.shades[id] < -100 || value.shades[id] > 100)) {
    throw Error('Invalid palette settings.');
  }
  // Shared IDs retain shade percentages. New swatches start at center. Endpoint
  // RGB values never change during migration, even when their old base is gone.
  const shades = Object.fromEntries(BASE_COLORS.map(base => [base.id,
    ids.includes(base.id) ? value.shades[base.id] : 0]));
  const colors = {color1: value.colors.color1.toLowerCase(), color2: value.colors.color2.toLowerCase()};
  const selectedBase = BASE_COLORS.find(base => base.id === value.selected);
  const selected = selectedBase && (!legacy ||
    shadeColor(selectedBase.color, shades[selectedBase.id]) === colors[value.activeEndpoint])
    ? selectedBase.id : null;
  return {baseVersion: 2, selected, activeEndpoint: value.activeEndpoint, shades, colors};
}

export class SmartPalette {
  constructor(onChange, onPreview) {
    this.onChange = onChange;
    this.onPreview = onPreview;
    this.state = defaultPalette();
    this.buttons = new Map();
    this.lastTap = null;
    this.usedButtons = new Map();
    this.slider = document.getElementById('shade');
    for (const base of BASE_COLORS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.swatch = base.id;
      button.setAttribute('aria-label', base.name);
      button.title = `${base.name} · double tap to reset shade`;
      // Time-based detection also covers real touch clicks where dblclick is inconsistent.
      // Selection happens immediately on the first tap; keyboard activation never resets.
      button.addEventListener('click', event => {
        const now = performance.now();
        const reset = event.detail !== 0 && this.lastTap?.id === base.id &&
          now - this.lastTap.time < 350;
        this.lastTap = reset || event.detail === 0 ? null : {id: base.id, time: now};
        this.state.selected = base.id;
        if (reset) this.state.shades[base.id] = 0;
        this.apply();
      });
      document.getElementById('palette').append(button);
      this.buttons.set(base.id, button);
    }
    this.slider.addEventListener('input', () => {
      if (!this.state.selected) return;
      this.lastTap = null;
      this.state.shades[this.state.selected] = +this.slider.value;
      this.apply();
    });
    for (const id of ['color1', 'color2']) {
      const input = document.getElementById(id);
      document.getElementById('target-' + id).addEventListener('click', () => this.activate(id));
      input.addEventListener('focus', () => this.activate(id));
      input.addEventListener('pointerdown', () => this.activate(id));
      input.addEventListener('input', () => {
        this.state.activeEndpoint = id;
        this.state.colors[id] = input.value;
        this.matchSelection();
        this.lastTap = null;
        this.update();
        this.onChange();
      });
    }
    this.setUsedColors(new Map());
    this.update();
  }

  setUsedColors(styles) {
    const colors = collectUsedColors(styles);
    const container = document.getElementById('used-colors');
    const next = new Set(colors);
    for (const [color, button] of this.usedButtons) {
      if (!next.has(color)) {
        button.remove();
        this.usedButtons.delete(color);
      }
    }
    for (const color of colors) {
      if (this.usedButtons.has(color)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.usedColor = color;
      button.style.background = color;
      button.setAttribute('aria-label', `Use ${color.toUpperCase()}`);
      button.title = color.toUpperCase();
      button.addEventListener('click', () => {
        this.lastTap = null;
        this.state.colors[this.state.activeEndpoint] = color;
        this.matchSelection();
        this.update();
        this.onChange();
      });
      // Sorted insertion keeps existing buttons, keyboard focus and scroll position.
      const after = [...container.children].find(child => child.dataset.usedColor > color);
      container.insertBefore(button, after || null);
      this.usedButtons.set(color, button);
    }
    container.hidden = !colors.length;
    document.getElementById('used-colors-empty').hidden = !!colors.length;
    document.getElementById('used-colors-count').textContent = colors.length || '';
    this.updateUsedSelection();
  }

  updateUsedSelection() {
    const color = this.state.colors[this.state.activeEndpoint];
    for (const [hex, button] of this.usedButtons) {
      button.setAttribute('aria-pressed', hex === color);
    }
    document.getElementById('used-colors-target').textContent =
      `Color ${this.state.activeEndpoint === 'color1' ? '1' : '2'}`;
  }

  matchSelection() {
    const color = this.state.colors[this.state.activeEndpoint];
    const matches = base => shadeColor(base.color, this.state.shades[base.id]) === color;
    const current = BASE_COLORS.find(base => base.id === this.state.selected);
    this.state.selected = current && matches(current) ? current.id :
      BASE_COLORS.find(matches)?.id ?? null;
  }

  activate(id) {
    this.lastTap = null;
    this.state.activeEndpoint = id;
    this.matchSelection();
    this.update();
    this.onChange();
  }

  apply() {
    const base = BASE_COLORS.find(base => base.id === this.state.selected);
    this.state.colors[this.state.activeEndpoint] = shadeColor(base.color, this.state.shades[base.id]);
    this.update();
    this.onChange();
  }

  update() {
    const $ = id => document.getElementById(id);
    const base = BASE_COLORS.find(base => base.id === this.state.selected);
    const adjustment = base ? this.state.shades[base.id] : 0;
    for (const item of BASE_COLORS) {
      const button = this.buttons.get(item.id);
      button.style.background = shadeColor(item.color, this.state.shades[item.id]);
      button.setAttribute('aria-pressed', item.id === this.state.selected);
    }
    for (const id of ['color1', 'color2']) {
      $(id).value = this.state.colors[id];
      $('target-' + id).setAttribute('aria-pressed', id === this.state.activeEndpoint);
    }
    this.slider.value = adjustment;
    this.slider.disabled = !base;
    this.slider.setAttribute('aria-valuetext', !base ? 'Choose a swatch to adjust its shade' :
      adjustment === 0 ? 'Original base color' : `${Math.abs(adjustment)}% ${adjustment > 0 ? 'lighter' : 'darker'}`);
    this.slider.style.setProperty('--base-color', base?.color || this.state.colors[this.state.activeEndpoint]);
    $('shade-value').textContent = !base ? 'Custom color' : adjustment === 0 ? 'Original' :
      `${Math.abs(adjustment)}% ${adjustment > 0 ? 'lighter' : 'darker'}`;
    const color = this.state.colors[this.state.activeEndpoint];
    $('selected-color').style.background = color;
    $('selected-color-hex').textContent = color.toUpperCase();
    $('selected-color-name').textContent = `${base?.name || 'Custom'} · Color ${this.state.activeEndpoint === 'color1' ? '1' : '2'}`;
    this.updateUsedSelection();
    this.onPreview();
  }

  snapshot() {
    return validatePalette(this.state);
  }

  restore(value) {
    this.state = value === undefined ? defaultPalette() : validatePalette(value);
    this.lastTap = null;
    this.update();
  }
}
