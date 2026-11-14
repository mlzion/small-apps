const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const source = fs.readFileSync(__dirname + '/palette.js', 'utf8');
  const {BASE_COLORS, shadeColor, defaultPalette, validatePalette} = await import(
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  assert.equal(BASE_COLORS.length, 12);
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
  console.log('PASS: 12 stable swatches; RGB interpolation/endpoints/fine shades; fresh defaults; palette validation and copy isolation');
})();
