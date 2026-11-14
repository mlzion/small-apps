const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync(__dirname + '/palette.js', 'utf8');
  const {BASE_COLORS, shadeColor, defaultPalette, validatePalette, collectUsedColors} = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.deepEqual(BASE_COLORS.map(base => base.color), [
    '#ff0000','#ff8000','#ffff00','#00ff00','#00ffff','#0000ff',
    '#8000ff','#ff00ff','#ff0080','#804000','#808080','#ffffff']);
  assert.equal(new Set(BASE_COLORS.map(base => base.id)).size, 12);
  for (const base of BASE_COLORS) {
    assert.equal(shadeColor(base.color, 0), base.color);
    assert.equal(shadeColor(base.color, 100), '#ffffff');
    assert.equal(shadeColor(base.color, -100), '#000000');
  }
  assert.equal(shadeColor('#ff0000', 50), '#ff8080');
  assert.equal(shadeColor('#ff0000', -50), '#800000');
  assert.equal(shadeColor('#123456', 25), '#4d6780');
  assert.notEqual(shadeColor('#000000', 12.3), shadeColor('#000000', 12.7));
  const first = defaultPalette(), second = defaultPalette();
  first.shades.red = 27.4;
  assert.equal(second.shades.red, 0);
  assert.deepEqual(validatePalette(first), first);
  const copy = validatePalette(first); copy.shades.red = -50;
  assert.equal(first.shades.red, 27.4);
  for (const bad of [null, {}, {...first, selected: 'missing'},
    {...first, shades: {...first.shades, red: 101}},
    {...first, shades: {...first.shades, blue: NaN}},
    {...first, colors: {...first.colors, color2: 'red'}},
    {...first, activeEndpoint: 'color3'}]) {
    assert.throws(() => validatePalette(bad), /Invalid palette/);
  }
  const legacy = {
    selected: 'red', activeEndpoint: 'color1',
    shades: Object.fromEntries(['coral','red','orange','yellow','green','teal',
      'blue','violet','pink','brown','gray','charcoal'].map(id => [id, 0])),
    colors: {color1: '#E53935', color2: '#EFC96A'},
  };
  legacy.shades.red = 27.4;
  const migrated = validatePalette(legacy);
  assert.equal(migrated.baseVersion, 2);
  assert.equal(migrated.shades.red, 27.4);
  assert.equal(migrated.shades.cyan, 0);
  assert.equal(migrated.selected, null);
  assert.deepEqual(migrated.colors, {color1:'#e53935',color2:'#efc96a'});
  legacy.shades.cyan = 'untrusted extra key';
  assert.equal(validatePalette(legacy).shades.cyan, 0);
  legacy.selected = 'gray'; legacy.colors.color1 = '#808080';
  assert.equal(validatePalette(legacy).selected, 'gray');
  assert.throws(() => validatePalette({...first,baseVersion:99}), /Invalid palette/);
  const styles = new Map();
  assert.deepEqual(collectUsedColors(styles), []);
  styles.set(1, {mode:'solid',color1:'#FF0000',color2:'#abcdef'});
  assert.deepEqual(collectUsedColors(styles), ['#ff0000']);
  styles.set(2, {mode:'gradient',color1:'#ff0000',color2:'#0000ff'});
  styles.set(3, {mode:'gradient',color1:'#0000ff',color2:'#0000ff'});
  assert.deepEqual(collectUsedColors(styles), ['#0000ff','#ff0000']);
  styles.set(1, {mode:'solid',color1:'#ffffff'});
  assert.deepEqual(collectUsedColors(styles), ['#0000ff','#ff0000','#ffffff']);
  styles.delete(2);
  assert.deepEqual(collectUsedColors(styles), ['#0000ff','#ffffff']);
  styles.clear();
  assert.deepEqual(collectUsedColors(styles), []);
  console.log('PASS: 12 vibrant swatches; legacy shade migration; current-region used colors; RGB interpolation/endpoints/fine shades; fresh defaults; palette validation and copy isolation');
})();
