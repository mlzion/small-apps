// Regenerate the gallery image from the same geometry used by the game.
import {writeFileSync} from 'node:fs';
import {pieces,turtle} from './puzzle.js';
writeFileSync(new URL('./preview.svg',import.meta.url),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${turtle.width} ${turtle.height}"><title>Original stained glass sea turtle</title>${pieces.map(p=>`<g><path d="${p.path}" fill="${p.color}" stroke="#153844" stroke-width="5" stroke-linejoin="round"/>${p.detail}</g>`).join('')}</svg>\n`);
