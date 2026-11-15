import {shuffledState,clampPiece} from './engine.js';
// Memory also retains progress during this visit if browser storage is unavailable.
const memory=new Map();
export const progressKey=p=>`brittz-puzzle:${p.id}:v${p.version}`;
function read(key){if(memory.has(key))return structuredClone(memory.get(key));try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
function write(key,value){memory.set(key,structuredClone(value));try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Memory fallback. */}}
export function readProgress(puzzle){
 const key=progressKey(puzzle);let data=read(key);
 // Exact v0.1 identity and geometry: copy rather than delete the original save.
 if(!data&&puzzle.id==='sea-turtle-v1'&&puzzle.version===1)data=read('brittz-sea-turtle-v1');
 return data;
}
export function validGame(game,pieces){
 const ids=new Set(pieces.map(p=>p.id));return game&&Array.isArray(game.order)&&game.order.length===pieces.length&&new Set(game.order).size===pieces.length&&game.order.every(id=>ids.has(id))&&pieces.every(p=>{
 const s=game.states?.[p.id];return s&&['tray','board','locked'].includes(s.location)&&[s.x,s.y,s.angle].every(Number.isFinite);
 });
}
export function loadProgress(puzzle){
 const data=readProgress(puzzle);if(!validGame(data?.game,puzzle.pieces))return {game:shuffledState(puzzle.pieces),sound:read('brittz-sound')!==false};
 const game=structuredClone(data.game);
 for(const p of puzzle.pieces){const s=game.states[p.id];if(s.location==='locked')Object.assign(s,{x:p.cx,y:p.cy,angle:0});else if(s.location==='board')clampPiece(p,s,puzzle.width,puzzle.height);}
 return {game,sound:typeof read('brittz-sound')==='boolean'?read('brittz-sound'):data.sound!==false};
}
export function saveProgress(puzzle,game,sound){write(progressKey(puzzle),{game,sound});write('brittz-sound',sound);}
export function progressSummary(entry){const game=readProgress(entry)?.game;if(!game||!Array.isArray(game.order)||game.order.length!==entry.pieceCount||new Set(game.order).size!==entry.pieceCount)return 'Not started';
 const states=game.order.map(id=>game.states?.[id]);if(states.some(s=>!s||!['tray','board','locked'].includes(s.location)||![s.x,s.y,s.angle].every(Number.isFinite)))return 'Not started';
 const count=states.filter(s=>s.location==='locked').length;
 return count===entry.pieceCount?'Completed':states.every(s=>s.location==='tray')?'Not started':`In progress · ${count} / ${entry.pieceCount} placed`;
}
export const isComplete=(puzzle,game)=>validGame(game,puzzle.pieces)&&puzzle.pieces.every(p=>game.states[p.id].location==='locked');
export function playerName(){const name=read('brittz-player-name');return typeof name==='string'?name.slice(0,80):'';}
export function rememberName(name){write('brittz-player-name',name);}
