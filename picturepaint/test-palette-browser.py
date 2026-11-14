"""Smart palette and square preview checks. Run from repository root."""
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
import json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
image = Image.new('RGB', (300, 200), 'white')
draw = ImageDraw.Draw(image)
for x in (5, 105, 205):
    draw.rectangle((x, 5, x + 90, 195), outline='black', width=3)
output = BytesIO()
image.save(output, format='PNG')
fixture = {'name': 'palette-shapes.png', 'mimeType': 'image/png', 'buffer': output.getvalue()}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    errors, missing = [], []

    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/').lstrip('/')
        file = ROOT / path
        if file.is_dir():
            file /= 'index.html'
        if not file.is_file():
            missing.append(path)
            route.fulfill(status=404)
            return
        types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png'}
        route.fulfill(path=str(file), content_type=types.get(file.suffix, 'text/plain'))

    def setup(context):
        context.route('http://palette.test/**', serve)
        context.on('weberror', lambda error: errors.append(str(error)))
        page = context.new_page()
        page.goto('http://palette.test/small-apps/picturepaint/')
        page.locator('#close-library').click()
        page.locator('#upload-file').set_input_files(fixture)
        expect(page.locator('#save')).to_be_enabled()
        return page

    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
    page = setup(context)

    def swatch(name):
        return page.locator(f'[data-swatch="{name}"]')

    def color(endpoint='color1'):
        return page.locator('#' + endpoint).input_value()

    def shade(value):
        page.locator('#shade').fill(str(value))

    def pixel(x, y):
        return page.evaluate('''([x,y]) => Array.from(document.querySelector('#surface')
            .getContext('2d').getImageData(x,y,1,1).data).slice(0,3)''', [x, y])

    def paint(x, y):
        # Scrolling the controls must never change canvas/image coordinate mapping.
        page.locator('#stage').scroll_into_view_if_needed()
        pos = page.evaluate('''([x,y]) => {
            const box=document.querySelector('#stage').getBoundingClientRect();
            const m=new DOMMatrix(getComputedStyle(document.querySelector('#surface')).transform);
            return {x:box.left+m.e+x*m.a,y:box.top+m.f+y*m.d};
        }''', [x, y])
        page.mouse.click(pos['x'], pos['y'])

    def project():
        with page.expect_download() as event:
            page.locator('#save').click()
        return json.loads(Path(event.value.path()).read_text())

    def reopen(value, name):
        page.locator('#open-file').set_input_files({
            'name': name + '.picturepaint', 'mimeType': 'application/json',
            'buffer': json.dumps(value).encode()})
        expect(page.locator('#drawing-title')).to_have_text(name)
        expect(page.locator('#save')).to_be_enabled()

    expect(page.locator('#palette button')).to_have_count(12)
    swatch('red').click()
    shade(40.5)
    red = color()
    expect(page.locator('#selected-color-hex')).to_have_text(red.upper())
    expect(page.locator('#shade-value')).to_have_text('40.5% lighter')
    swatch('blue').click()
    shade(-25.5)
    blue = color()
    swatch('red').click()
    assert color() == red
    expect(page.locator('#shade')).to_have_value('40.5')
    assert swatch('red').evaluate('el=>getComputedStyle(el).backgroundColor') != 'rgb(255, 0, 0)'
    expect(swatch('red')).to_have_attribute('aria-pressed', 'true')
    assert page.locator('#palette [aria-pressed=true]').count() == 1
    paint(50, 100)
    assert pixel(50, 100) == list(bytes.fromhex(red[1:]))

    # Both targets use the same remembered swatches without repainting existing regions.
    page.locator('#gradient').click()
    page.locator('#target-color2').click()
    swatch('blue').click()
    assert color('color2') == blue
    expect(page.locator('#shade')).to_have_value('-25.5')
    assert color('color1') == red
    shade(-40.5)
    blue = color('color2')
    page.locator('#target-color1').click()
    expect(page.locator('#shade')).to_have_value('40.5')
    shade(20.5)
    new_red = color()
    assert new_red != red and color('color2') == blue
    assert pixel(50, 100) == list(bytes.fromhex(red[1:]))
    page.locator('#angle').fill('0')
    paint(150, 100)
    assert pixel(130, 100)[0] > pixel(170, 100)[0]
    assert pixel(130, 100)[2] < pixel(170, 100)[2]
    before = pixel(150, 100)
    page.locator('#target-color2').click()
    swatch('green').click()
    shade(65.2)
    assert pixel(150, 100) == before
    # Solid/gradient switches preserve swatch memory, including inactive endpoints.
    page.locator('#solid').click()
    swatch('blue').click()
    expect(page.locator('#shade')).to_have_value('-40.5')
    assert color() == blue
    swatch('red').dblclick()
    assert color() == '#ff0000'
    expect(page.locator('#shade')).to_have_value('0')
    swatch('blue').click()
    expect(page.locator('#shade')).to_have_value('-40.5')
    assert color() == blue

    # End stops are real white/black, and keyboard has fine-grained shade control.
    swatch('gray').click()
    shade(100)
    assert color() == '#ffffff'
    shade(-100)
    assert color() == '#000000'
    shade(0)
    page.locator('#shade').focus()
    page.keyboard.press('ArrowUp')
    expect(page.locator('#shade')).to_have_value('0.1')

    page.locator('#gradient').click()
    page.locator('#target-color2').click()
    swatch('green').click()
    shade(32.1)
    saved = project()
    assert saved['palette']['shades']['blue'] == -40.5
    assert saved['palette']['shades']['red'] == 0
    assert saved['palette']['selected'] == 'green'
    assert saved['palette']['activeEndpoint'] == 'color2'
    original_fills = saved['fills']
    gradient_fill = next(fill['style'] for fill in original_fills if fill['style']['mode'] == 'gradient')
    assert gradient_fill == {'mode': 'gradient', 'color1': new_red, 'color2': blue, 'angle': 0}
    swatch('red').click()
    shade(-99)
    reopen(saved, 'palette-roundtrip')
    expect(page.locator('#shade')).to_have_value('32.1')
    expect(swatch('green')).to_have_attribute('aria-pressed', 'true')
    expect(page.locator('#target-color2')).to_have_attribute('aria-pressed', 'true')
    assert color('color2') == saved['palette']['colors']['color2']
    assert project()['fills'] == original_fills

    # A 1.0 file has no palette metadata. Reset all shades, preserve its painting.
    legacy = {key: value for key, value in saved.items() if key != 'palette'}
    reopen(legacy, 'legacy-1.0')
    restored = project()
    assert all(value == 0 for value in restored['palette']['shades'].values())
    assert restored['palette']['selected'] == 'red'
    assert restored['fills'] == original_fills
    assert restored['width'] == saved['width'] and restored['original'] == saved['original']
    invalid = json.loads(json.dumps(saved))
    invalid['palette']['shades']['green'] = 101
    page.locator('#open-file').set_input_files({
        'name': 'invalid.picturepaint', 'mimeType': 'application/json', 'buffer': json.dumps(invalid).encode()})
    expect(page.locator('#status')).to_have_text('Invalid palette settings.')
    expect(page.locator('#drawing-title')).to_have_text('legacy-1.0')

    # Custom colors keep precise native inputs and are also restored in the project.
    page.locator('#color1').fill('#123456')
    expect(page.locator('#shade')).to_be_disabled()
    expect(page.locator('#selected-color-hex')).to_have_text('#123456')
    custom = project()
    swatch('red').click()
    reopen(custom, 'custom-roundtrip')
    assert color() == '#123456'
    expect(page.locator('#shade')).to_be_disabled()

    # Screenshot pixels confirm screen-coordinate direction in the square CSS preview.
    page.locator('#gradient').click()
    page.locator('#color1').fill('#ff0000')
    page.locator('#color2').fill('#0000ff')
    for angle in [0, 45, 90, 180, 270, 360]:
        page.locator('#angle').fill(str(angle))
        expect(page.locator('#degrees')).to_have_text(f'{angle}°')
        element = page.locator('#gradient-preview')
        box = element.bounding_box()
        assert abs(box['width'] - 120) < 1 and abs(box['height'] - 120) < 1
        preview = Image.open(BytesIO(element.screenshot()))
        left, right = preview.getpixel((20, 60)), preview.getpixel((100, 60))
        top, bottom = preview.getpixel((60, 20)), preview.getpixel((60, 100))
        if angle in [0, 360]:
            assert left[0] > right[0] and abs(top[0] - bottom[0]) <= 1
        elif angle == 180:
            assert left[0] < right[0] and abs(top[0] - bottom[0]) <= 1
        elif angle == 90:
            assert top[0] > bottom[0] and abs(left[0] - right[0]) <= 1
        elif angle == 270:
            assert top[0] < bottom[0] and abs(left[0] - right[0]) <= 1
        else:
            assert top[0] > bottom[0] and left[0] > right[0]
    page.screenshot(path='/tmp/picturepaint-palette-desktop.png', full_page=True)

    for width, height in [(320, 812), (375, 812), (768, 1024), (1024, 768), (1440, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for selector in ['aside', '.smart-colors', '#gradient-controls']:
            assert page.locator(selector).evaluate('el=>el.scrollWidth<=el.clientWidth'), (width, selector, page.locator(selector).evaluate('el=>({width:el.clientWidth,scroll:el.scrollWidth,children:Array.from(el.children).map(x=>({tag:x.tagName,width:x.getBoundingClientRect().width,scroll:x.scrollWidth}))})'))
        assert all(button.bounding_box()['width'] >= 44 for button in page.locator('#palette button').all())
        square = page.locator('#gradient-preview').bounding_box()
        assert abs(square['width'] - square['height']) <= 1

    # Real CDP touch events drive the native vertical range; no synthetic input assignment.
    for width, height, device in [(820, 1180, 'tablet'), (375, 812, 'phone')]:
        mobile = browser.new_context(viewport={'width': width, 'height': height},
                                     is_mobile=True, has_touch=True, device_scale_factor=1)
        touch = setup(mobile)
        touch.locator('[data-swatch=red]').tap()
        slider = touch.locator('#shade')
        slider.scroll_into_view_if_needed()
        box = slider.bounding_box()
        x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
        scroll_before = touch.evaluate('scrollY')
        client = mobile.new_cdp_session(touch)
        def event(kind, points):
            client.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [
                {'x': a, 'y': b, 'id': i} for i, (a, b) in enumerate(points)]})
        event('touchStart', [(x, y)])
        event('touchMove', [(x, y - 45)])
        event('touchEnd', [])
        remembered = float(slider.input_value())
        assert remembered > 20, remembered
        assert touch.evaluate('scrollY') == scroll_before
        adjusted = touch.locator('#color1').input_value()
        touch.locator('[data-swatch=blue]').tap()
        expect(slider).to_have_value('0')
        touch.locator('[data-swatch=red]').tap()
        assert float(slider.input_value()) == remembered
        assert touch.locator('#color1').input_value() == adjusted
        # Double touch resets just that swatch without browser zoom or canvas painting.
        touch.locator('[data-swatch=blue]').tap()
        scale = touch.evaluate('visualViewport.scale')
        target = touch.locator('[data-swatch=red]')
        target.tap()
        target.tap()
        expect(slider).to_have_value('0')
        assert touch.evaluate('visualViewport.scale') == scale
        expect(touch.locator('#undo')).to_be_disabled()
        touch.locator('#gradient').tap()
        touch.locator('#target-color2').tap()
        touch.locator('[data-swatch=green]').tap()
        touch.screenshot(path=f'/tmp/picturepaint-palette-{device}.png', full_page=True)
        mobile.close()

    assert not errors, errors
    assert not missing, missing
    browser.close()
    print('PASS: independent shades, selection/slider memory, double-click/tap reset, precise keyboard range, '
          'adjusted solid and gradient targets, unchanged paint, metadata roundtrip/legacy/custom/error recovery, '
          'six square preview directions, five responsive layouts, tablet/phone native touch drags without zoom/paint')
