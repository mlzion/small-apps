// Regenerate catalog thumbnails from the same geometry as the board and certificate.
import {readFile,writeFile} from 'node:fs/promises';
import {preparePuzzle,validateCatalog,matchEntry,artworkSVG} from './content.js';
const root=new URL('./',import.meta.url);
const catalog=validateCatalog(JSON.parse(await readFile(new URL('catalog.json',root),'utf8')));
for(const entry of catalog.puzzles){
 const puzzle=matchEntry(entry,preparePuzzle(JSON.parse(await readFile(new URL(entry.data,root),'utf8'))));
 await writeFile(new URL(entry.thumbnail,root),artworkSVG(puzzle)+'\n');
}
