"""Vibrant bases, artwork-derived colors, project migration and touch reuse."""
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit
import json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
im = Image.new('RGB', (400, 400), 'white')
draw = ImageDraw.Draw(im)
for coordinate in (0, 100, 200, 300, 399):
    draw.line((coordinate, 0, coordinate, 399), fill='black', width=3)
    draw.line((0, coordinate, 399, coordinate), fill='black', width=3)
out = BytesIO()
im.save(out, format='PNG')
fixture = {'name': 'used-color-grid.png', 'mimeType': 'image/png', 'buffer': out.getvalue()}

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
        context.route('http://used.test/**', serve)
        context.on('weberror', lambda error: errors.append(str(error)))
        page = context.new_page()
        page.goto('http://used.test/small-apps/picturepaint/')
        page.locator('#close-library').click()
        page.locator('#upload-file').set_input_files(fixture)
        expect(page.locator('#save')).to_be_enabled()
        return page

    def used(page):
        return page.locator('#used-colors button').evaluate_all('buttons=>buttons.map(b=>b.dataset.usedColor)')

    def paint(page, cell):
        page.locator('#stage').scroll_into_view_if_needed()
        point = [50 + cell % 4 * 100, 50 + cell // 4 * 100]
        pos = page.evaluate('''([x,y])=>{
            const box=document.querySelector('#stage').getBoundingClientRect();
            const m=new DOMMatrix(getComputedStyle(document.querySelector('#surface')).transform);
            return {x:box.left+m.e+x*m.a,y:box.top+m.f+y*m.d};
        }''', point)
        if page.evaluate('navigator.maxTouchPoints > 0'):
            page.touchscreen.tap(pos['x'], pos['y'])
        else:
            page.mouse.click(pos['x'], pos['y'])

    def pixel(page, cell):
        return page.evaluate('''([x,y])=>Array.from(document.querySelector('#surface')
            .getContext('2d').getImageData(x,y,1,1).data).slice(0,3)''',
            [50 + cell % 4 * 100, 50 + cell // 4 * 100])

    def save(page):
        with page.expect_download() as event:
            page.locator('#save').click()
        return json.loads(Path(event.value.path()).read_text())

    def reopen(page, project, name):
        page.locator('#open-file').set_input_files({'name': name + '.picturepaint',
            'mimeType': 'application/json', 'buffer': json.dumps(project).encode()})
        expect(page.locator('#drawing-title')).to_have_text(name)
        expect(page.locator('#save')).to_be_enabled()

    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
    page = setup(context)
    assert used(page) == []
    expect(page.locator('#used-colors-empty')).to_be_visible()
    assert page.locator('#palette button').evaluate_all('buttons=>buttons.map(b=>b.style.backgroundColor)') == [
        'rgb(255, 0, 0)', 'rgb(255, 128, 0)', 'rgb(255, 255, 0)', 'rgb(0, 255, 0)',
        'rgb(0, 255, 255)', 'rgb(0, 0, 255)', 'rgb(128, 0, 255)', 'rgb(255, 0, 255)',
        'rgb(255, 0, 128)', 'rgb(128, 64, 0)', 'rgb(128, 128, 128)', 'rgb(255, 255, 255)']
    page.locator('[data-swatch=red]').click()
    page.locator('#shade').fill('50')
    expect(page.locator('#color1')).to_have_value('#ff8080')
    assert used(page) == []  # Slider choices alone are never used colors.
    page.locator('#shade').fill('-50')
    expect(page.locator('#color1')).to_have_value('#800000')
    page.locator('#shade').fill('50')
    paint(page, 0)
    assert used(page) == ['#ff8080']
    page.locator('#undo').click()
    assert used(page) == []
    expect(page.locator('#used-colors-empty')).to_be_visible()
    page.locator('#redo').click()
    assert used(page) == ['#ff8080']
    paint(page, 1)
    assert used(page) == ['#ff8080']
    page.locator('#color1').fill('#0000ff')
    assert used(page) == ['#ff8080']
    paint(page, 0)
    assert used(page) == ['#0000ff', '#ff8080']
    paint(page, 1)
    assert used(page) == ['#0000ff']
    page.locator('#undo').click()
    assert used(page) == ['#0000ff', '#ff8080']
    page.locator('#redo').click()
    assert used(page) == ['#0000ff']

    page.locator('#gradient').click()
    page.locator('#color1').fill('#123456')
    page.locator('#color2').fill('#abcdef')
    page.locator('#angle').fill('45')
    assert used(page) == ['#0000ff']
    paint(page, 2)
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    intermediate = '#' + bytes(pixel(page, 2)).hex()
    assert intermediate not in used(page)
    page.locator('#color2').fill('#123456')
    paint(page, 3)
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    before = [pixel(page, i) for i in range(4)]
    for endpoint in ['color1', 'color2']:
        page.locator('#target-' + endpoint).click()
        page.locator('[data-used-color="#abcdef"]').click()
        expect(page.locator('#' + endpoint)).to_have_value('#abcdef')
        expect(page.locator('#used-colors-target')).to_have_text('Color ' + endpoint[-1])
        expect(page.locator('[data-used-color="#abcdef"]')).to_have_attribute('aria-pressed', 'true')
        assert used(page) == ['#0000ff', '#123456', '#abcdef']
        assert [pixel(page, i) for i in range(4)] == before
    page.locator('#solid').click()
    page.locator('#color1').fill('#0000ff')
    paint(page, 2)
    assert used(page) == ['#0000ff', '#123456']  # Only the constant gradient still uses #123456.
    paint(page, 3)
    assert used(page) == ['#0000ff']
    page.locator('#undo').click()
    assert used(page) == ['#0000ff', '#123456']
    page.locator('#undo').click()
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    project = save(page)
    assert 'usedColors' not in project and 'usedColors' not in project['palette']
    reopen(page, project, 'used-roundtrip')
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    assert save(page)['fills'] == project['fills']

    # Genuine 1.1 metadata uses the old IDs and no base-version marker.
    old = json.loads(json.dumps(project))
    old['palette'] = {
        'selected': 'coral', 'activeEndpoint': 'color1',
        'shades': {key: 0 for key in ['coral','red','orange','yellow','green','teal',
                                    'blue','violet','pink','brown','gray','charcoal']},
        'colors': {'color1': '#e87461', 'color2': '#efc96a'}}
    old['palette']['shades'].update({'red': 34.5, 'gray': -10, 'coral': 55})
    reopen(page, old, 'legacy-1.1')
    migrated = save(page)
    assert migrated['fills'] == project['fills']
    assert migrated['original'] == project['original']
    assert migrated['palette']['shades']['red'] == 34.5
    assert migrated['palette']['shades']['gray'] == -10
    assert migrated['palette']['shades']['cyan'] == 0
    assert migrated['palette']['selected'] is None
    assert migrated['palette']['colors'] == old['palette']['colors']
    assert migrated['palette']['baseVersion'] == 2
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    old['palette']['selected'] = 'gray'
    old['palette']['colors']['color1'] = '#737373'
    reopen(page, old, 'legacy-compatible-gray')
    expect(page.locator('#shade')).to_have_value('-10')
    expect(page.locator('[data-swatch=gray]')).to_have_attribute('aria-pressed', 'true')
    old.pop('palette')
    reopen(page, old, 'legacy-1.0')
    assert used(page) == ['#0000ff', '#123456', '#abcdef']
    assert save(page)['fills'] == project['fills']
    assert [pixel(page, i) for i in range(4)] == before

    # More than twelve actual assignments grow the collection, never truncate it.
    page.locator('#solid').click()
    colors = [f'#{i+1:02x}{i*13%256:02x}{i*29%256:02x}' for i in range(16)]
    for cell, color in enumerate(colors):
        page.locator('#color1').fill(color)
        paint(page, cell)
    assert used(page) == sorted(colors)
    assert page.locator('#used-colors').evaluate('el=>el.scrollHeight>el.clientHeight')
    many = save(page)
    reopen(page, many, 'sixteen-colors')
    assert used(page) == sorted(colors)
    assert save(page)['fills'] == many['fills']
    # Outline visibility and export do not change assignments.
    page.locator('#outlines').click()
    assert used(page) == sorted(colors)
    with page.expect_download() as event:
        page.locator('#export').click()
    jpg = Image.open(event.value.path())
    assert jpg.size == (400, 400) and jpg.format == 'JPEG'
    assert used(page) == sorted(colors)
    page.locator('#gradient').click()
    page.locator('#target-color2').click()
    page.locator('[data-used-color="' + colors[-1] + '"]').click()
    expect(page.locator('#color2')).to_have_value(colors[-1])
    page.screenshot(path='/tmp/picturepaint-used-desktop.png', full_page=True)
    for width, height in [(320, 812), (375, 812), (768, 1024), (1024, 768), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.locator('.used-colors-panel').evaluate('el=>el.scrollWidth<=el.clientWidth')
        assert all(button.bounding_box()['width'] >= 44 for button in page.locator('#used-colors button').all())
    page.locator('#upload-file').set_input_files(fixture)
    expect(page.locator('#drawing-title')).to_have_text('used-color-grid.png')
    expect(page.locator('#save')).to_be_enabled()
    assert used(page) == []
    expect(page.locator('#used-colors-empty')).to_be_visible()

    # White paint is an assignment even when the untouched canvas looks identical.
    page.locator('#solid').click()
    page.locator('[data-swatch=white]').click()
    paint(page, 5)
    assert pixel(page, 5) == [255, 255, 255]
    assert used(page) == ['#ffffff']
    page.locator('#undo').click()
    assert used(page) == []

    for width, height, device in [(820, 1180, 'tablet'), (375, 812, 'phone')]:
        mobile = browser.new_context(viewport={'width': width, 'height': height},
            is_mobile=True, has_touch=True, device_scale_factor=1, accept_downloads=True)
        touch = setup(mobile)
        touch.locator('[data-swatch=magenta]').tap()
        assert used(touch) == []
        paint(touch, 0)
        assert used(touch) == ['#ff00ff']
        touch.locator('#gradient').tap()
        touch.locator('#target-color2').tap()
        touch.locator('[data-used-color="#ff00ff"]').tap()
        expect(touch.locator('#color2')).to_have_value('#ff00ff')
        assert used(touch) == ['#ff00ff']
        assert pixel(touch, 0) == [255, 0, 255]
        # Reopen a larger collection and tap a scroll-revealed color on touch.
        reopen(touch, many, 'touch-used')
        touch.locator('#gradient').tap()
        touch.locator('#target-color2').tap()
        collection = touch.locator('#used-colors')
        collection.scroll_into_view_if_needed()
        if collection.evaluate('el=>el.scrollHeight>el.clientHeight'):
            collection.evaluate('el=>el.scrollTop=0')
            box = collection.bounding_box()
            x, y = box['x'] + box['width'] / 2, box['y'] + box['height'] - 15
            previous = touch.locator('#color2').input_value()
            client = mobile.new_cdp_session(touch)
            client.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            for distance in (30, 60, 95):
                client.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':x,'y':y-distance}]})
            client.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            touch.wait_for_function('document.querySelector("#used-colors").scrollTop > 0')
            expect(touch.locator('#color2')).to_have_value(previous)
        button = touch.locator('[data-used-color="' + colors[-1] + '"]')
        button.tap()
        expect(touch.locator('#color2')).to_have_value(colors[-1])
        assert used(touch) == sorted(colors)
        assert touch.evaluate('visualViewport.scale') == 1
        expect(touch.locator('#undo')).to_be_disabled()
        touch.screenshot(path=f'/tmp/picturepaint-used-{device}.png', full_page=True)
        mobile.close()

    assert not errors, errors
    assert not missing, missing
    browser.close()
    print('PASS: saturated bases/tints/shades; artwork-only solid and gradient endpoints; uniqueness, '
          'recolor/removal/shared references and undo/redo; both targets; 1.0/1.1/1.2 reopen; '
          '16-color scrolling, responsive layouts, touch selection and JPG; new drawing reset')
