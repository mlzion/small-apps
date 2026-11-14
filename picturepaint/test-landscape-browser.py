"""Explicit bucket fills at image boundaries. Run from repository root."""
from pathlib import Path
from urllib.parse import urlsplit
from io import BytesIO
import json
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
landscape = Image.new('RGB', (360, 240), 'white')
draw = ImageDraw.Draw(landscape)
draw.line([(0, 90), (70, 60), (160, 90), (250, 50), (359, 80)], fill='black', width=3)
draw.line([(160, 90), (180, 130), (130, 239)], fill='black', width=3)
draw.line([(250, 50), (220, 140), (240, 239)], fill='black', width=3)
draw.ellipse((4, 5, 24, 25), outline='black', width=2)
broken = Image.new('RGB', (360, 240), 'white')
draw = ImageDraw.Draw(broken)
draw.line((0, 80, 359, 80), fill='black', width=1)
draw.line((60, 80, 61, 80), fill='white', width=1)

def png(image):
    out = BytesIO()
    image.save(out, format='PNG')
    return out.getvalue()

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium')
    context = browser.new_context(viewport={'width': 1280, 'height': 1000}, accept_downloads=True)
    errors, missing = [], []
    context.on('weberror', lambda error: errors.append(str(error)))

    def serve(route):
        path = urlsplit(route.request.url).path.removeprefix('/small-apps/').lstrip('/')
        file = ROOT / path
        if file.is_dir():
            file /= 'index.html'
        if not file.is_file():
            missing.append(path)
            route.fulfill(status=404)
            return
        types = {'.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png'}
        route.fulfill(path=str(file), content_type=types.get(file.suffix, 'text/plain'))

    context.route('http://landscape.test/**', serve)
    page = context.new_page()
    page.goto('http://landscape.test/small-apps/picturepaint/')
    page.locator('#close-library').click()

    def upload(image, name):
        page.locator('#upload-file').set_input_files({'name': name, 'mimeType': 'image/png', 'buffer': png(image)})
        expect(page.locator('#drawing-title')).to_have_text(name)
        expect(page.locator('#save')).to_be_enabled()

    def pixel(x, y):
        return page.evaluate('''([x,y]) => Array.from(document.querySelector('#surface')
            .getContext('2d').getImageData(x,y,1,1).data).slice(0,3)''', [x, y])

    def tap(x, y):
        page.locator('#stage').scroll_into_view_if_needed()
        pos = page.evaluate('''([x,y]) => {
            const box=document.querySelector('#stage').getBoundingClientRect();
            const m=new DOMMatrix(getComputedStyle(document.querySelector('#surface')).transform);
            return {x:box.left+m.e+x*m.a,y:box.top+m.f+y*m.d};
        }''', [x, y])
        page.mouse.click(pos['x'], pos['y'])

    def saved():
        with page.expect_download() as event:
            page.locator('#save').click()
        return json.loads(Path(event.value.path()).read_text())

    def opened(project, name):
        page.locator('#open-file').set_input_files({'name': name + '.picturepaint',
            'mimeType': 'application/json', 'buffer': json.dumps(project).encode()})
        expect(page.locator('#drawing-title')).to_have_text(name)
        expect(page.locator('#save')).to_be_enabled()

    upload(landscape, 'landscape.png')
    points = [(30, 20), (190, 200), (50, 170), (310, 170), (14, 15)]
    # Import must never automatically fill even the outermost region.
    for point in points:
        assert pixel(*point) == [255, 255, 255]
    expect(page.locator('#undo')).to_be_disabled()
    assert saved()['fills'] == []

    for index, point in enumerate(points):
        if index in (1, 3):
            page.locator('#gradient').click()
            page.locator('#color1').fill('#0000ff')
            page.locator('#color2').fill('#00ff00')
            page.locator('#angle').fill('90' if index == 1 else '45')
        else:
            page.locator('#solid').click()
            page.locator('#color1').fill('#ff0000' if index != 4 else '#ffff00')
        tap(*point)
        painted = pixel(*point)
        assert painted != [255, 255, 255], (point, painted)
        page.locator('#undo').click()
        assert pixel(*point) == [255, 255, 255]
        page.locator('#redo').click()
        assert pixel(*point) == painted
        for unpainted in points[index + 1:]:
            assert pixel(*unpainted) == [255, 255, 255]
    assert pixel(0, 0) == [255, 0, 0]
    assert pixel(359, 0) == [255, 0, 0]
    assert pixel(0, 239) == [255, 0, 0]
    assert pixel(190, 239)[1] > 240  # River gradient reaches the bottom edge.

    project = saved()
    assert len(project['fills']) == 5
    assert sum(fill['style']['mode'] == 'gradient' for fill in project['fills']) == 2
    before = [pixel(*point) for point in points]
    for point in [(-2, 100), (362, 100), (180, -2), (180, 242)]:
        tap(*point)
    assert saved()['fills'] == project['fills']  # Outside taps cannot add a fill.
    opened(project, 'edge-roundtrip')
    assert [pixel(*point) for point in points] == before
    assert saved()['fills'] == project['fills']
    page.locator('#solid').click()
    page.locator('#color1').fill('#112233')
    tap(1, 1)
    assert pixel(0, 0) == [17, 34, 51]
    page.locator('#undo').click()
    assert pixel(0, 0) == [255, 0, 0]
    page.locator('#redo').click()
    assert pixel(0, 0) == [17, 34, 51]
    page.locator('#undo').click()
    legacy = {key: value for key, value in project.items() if key != 'palette'}
    opened(legacy, 'edge-legacy')
    assert [pixel(*point) for point in points] == before
    assert saved()['fills'] == project['fills']

    with page.expect_download() as event:
        page.locator('#export').click()
    jpg = Image.open(event.value.path())
    assert jpg.size == (360, 240) and jpg.format == 'JPEG'
    assert jpg.getpixel((0, 0))[0] > 240 and max(jpg.getpixel((0, 0))[1:]) < 20
    assert jpg.getpixel((190, 239))[1] > 230
    page.locator('#outlines').click()
    with page.expect_download() as event:
        page.locator('#export').click()
    assert Image.open(event.value.path()).size == (360, 240)
    page.locator('#outlines').click()
    page.screenshot(path='/tmp/picturepaint-landscape.png', full_page=True)

    # An unsealed break joins sky and field; gap sealing separates the same source.
    upload(broken, 'broken.png')
    page.get_by_text('Drawing boundaries', exact=True).click()
    for gap in (0, 1):
        page.locator('#gap').fill(str(gap))
        page.locator('#gap').dispatch_event('change')
        expect(page.locator('#status')).to_have_text('Boundaries updated.')
        expect(page.locator('#save')).to_be_enabled()
        page.locator('#solid').click()
        page.locator('#color1').fill('#ff0000')
        tap(30, 20)
        assert pixel(30, 20) == [255, 0, 0]
        assert pixel(30, 160) == ([255, 0, 0] if gap == 0 else [255, 255, 255])
        page.locator('#undo').click()
        assert pixel(30, 20) == [255, 255, 255]
    assert not errors, errors
    assert not missing, missing
    browser.close()
    print('PASS: explicit sky/river/side fields/edge details; solid/gradient fills; undo/redo; '
          'finite image bounds; project/legacy reopen; JPG edge appearance; gap tolerance at 0/1')
