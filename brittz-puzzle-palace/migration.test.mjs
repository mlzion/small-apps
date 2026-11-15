// Frozen archival assets from the merged v0.4 release; gameplay/certificate
// compatibility continues to be tested separately through legacy.html.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const originals={
  "engine.js": "b0fcce3cf9ead4657e57b73a9819c3288a82bb771ee40edd5a7f145ca3dbd129",
  "catalog.json": "df9682fa5a872292959112c4caa3ba56b6171f8204a994f273db20e0b16943fc",
  "puzzles/sea-turtle/puzzle.json": "e7417c824d339ba94d31626a1f37a70cb9b2332ec08be43f6ae7330a5153b316",
  "puzzles/sea-turtle/thumbnail.svg": "212dc000a62a0803e0d4b923cd18804b375e3ab0235a9c9b61e4e3a2cd57e850",
  "puzzles/tropical-gem/puzzle.json": "ea814f91bd9e58abc2c2792d40239f3e5881afd1d619942bc052f558b5f5f041",
  "puzzles/tropical-gem/thumbnail.svg": "d7dadc75c86b7c3ff947a2bc3d41f06f3aaa66969c2e93345dc3197dc407f4e2",
  "puzzles/clownfish/puzzle.json": "91e90ba4cd270050e6ca17886ad0eaff12ee04640d0d604b6a07c880eb17ba9d",
  "puzzles/clownfish/thumbnail.svg": "08489a5c502b894e8892588465163c537fa2ff24449286842e9ef144d6103f48"
};
test('original SVG content and legacy mechanics remain byte-for-byte intact',()=>{
 for(const [file,hash] of Object.entries(originals))assert.equal(createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex'),hash,file);
});
