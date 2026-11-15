// Validate the whole published catalog, or any one new puzzle JSON before registration.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {preparePuzzle,validateCatalog,matchEntry} from './content.js';
const root=dirname(fileURLToPath(import.meta.url));
const json=async path=>JSON.parse(await readFile(path,'utf8'));
try{
 if(process.argv[2]){const path=resolve(process.argv[2]);const puzzle=preparePuzzle(await json(path));console.log(`PASS ${path}: ${puzzle.id}, ${puzzle.pieceCount} connected pieces, exact rectangular coverage.`);}
 else{const catalog=validateCatalog(await json(resolve(root,'catalog.json')));for(const entry of catalog.puzzles){const puzzle=matchEntry(entry,preparePuzzle(await json(resolve(root,entry.data))));await readFile(resolve(root,entry.thumbnail));console.log(`PASS ${entry.data}: ${puzzle.pieceCount} connected pieces; exact seams, coverage, dimensions, and metadata.`);}}
}catch(error){console.error(`INVALID PUZZLE: ${error.message}`);process.exitCode=1;}
