// Stable IDs keep saved shades independent of swatch order and endpoint colors.
export const BASE_COLORS = [
  {id: 'coral', name: 'Coral', color: '#e87461'},
  {id: 'red', name: 'Red', color: '#e53935'},
  {id: 'orange', name: 'Orange', color: '#ed8b32'},
  {id: 'yellow', name: 'Yellow', color: '#efc96a'},
  {id: 'green', name: 'Green', color: '#8aa978'},
  {id: 'teal', name: 'Teal', color: '#4c8d82'},
  {id: 'blue', name: 'Blue', color: '#4276cc'},
  {id: 'violet', name: 'Violet', color: '#9766bc'},
  {id: 'pink', name: 'Pink', color: '#dd9eb8'},
  {id: 'brown', name: 'Brown', color: '#825c49'},
  {id: 'gray', name: 'Gray', color: '#808080'},
  {id: 'charcoal', name: 'Charcoal', color: '#293c39'},
];

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
    shades: Object.fromEntries(BASE_COLORS.map(base => [base.id, 0])),
    selected: 'coral',
    activeEndpoint: 'color1',
    colors: {color1: '#e87461', color2: '#efc96a'},
  };
}

export function validatePalette(value) {
  const isColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
  if (!value || typeof value !== 'object' || !value.shades ||
      !['color1', 'color2'].includes(value.activeEndpoint) ||
      !(value.selected === null || BASE_COLORS.some(base => base.id === value.selected)) ||
      !value.colors || !isColor(value.colors.color1) || !isColor(value.colors.color2) ||
      BASE_COLORS.some(base => !Number.isFinite(value.shades[base.id]) ||
        value.shades[base.id] < -100 || value.shades[base.id] > 100)) {
    throw Error('Invalid palette settings.');
  }
  // Return a fresh known shape; never trust extra project keys as application state.
  return {
    selected: value.selected,
    activeEndpoint: value.activeEndpoint,
    shades: Object.fromEntries(BASE_COLORS.map(base => [base.id, value.shades[base.id]])),
    colors: {color1: value.colors.color1.toLowerCase(), color2: value.colors.color2.toLowerCase()},
  };
}

export class SmartPalette {
  constructor(onChange, onPreview) {
    this.onChange = onChange;
    this.onPreview = onPreview;
    this.state = defaultPalette();
    this.buttons = new Map();
    this.lastTap = null;
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
    this.update();
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
