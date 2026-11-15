// Separate IndexedDB namespace: uploaded bytes/cuts never touch gallery saves.
import {validateMosaic} from './mosaic.js';
import {validGame} from '../progress.js';
import {mosaicPuzzle} from './image-puzzle.js?v=mosaic-4';
let database;
function db(){return database??=new Promise((resolve,reject)=>{const request=indexedDB.open('brittz-mosaic-lab',1);request.onupgradeneeded=()=>request.result.createObjectStore('active');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Local puzzle storage is unavailable'));request.onblocked=()=>reject(Error('Close other lab tabs to update local puzzle storage'));});}
async function transaction(mode,work){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('active',mode),store=tx.objectStore('active');const result=work(store);tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(Error('Could not save the puzzle locally; check browser storage space/permissions'));});}
export function validateSession(record,progress){
 if(!record||record.version!==1||typeof record.id!=='string'||!(record.blob instanceof Blob)||typeof record.name!=='string'||typeof record.outlines!=='boolean')throw Error('Invalid saved image session');
 validateMosaic(record.pattern);
 if(progress&&progress.id!==record.id)throw Error('Saved progress does not match the saved cuts');
 if(progress){
 const pieces=mosaicPuzzle(record.pattern,{url:'',name:record.name}).pieces;
 if(!validGame(progress.game,pieces))throw Error('Invalid saved piece positions');
 for(const p of pieces){const s=progress.game.states[p.id];if(s.location==='locked'&&(s.x!==p.cx||s.y!==p.cy||s.angle!==0))throw Error('Invalid saved locked piece transform');}
 }
 return {record,progress};
}
export async function readSession(){const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction('active'),store=tx.objectStore('active'),source=store.get('source'),state=store.get('progress');tx.oncomplete=()=>{try{resolve(source.result?validateSession(source.result,state.result):null);}catch(error){reject(error);}};tx.onerror=tx.onabort=()=>reject(Error('Could not read the saved lab puzzle'));});}
export function createSession(record){validateSession(record);return transaction('readwrite',store=>{store.put(record,'source');store.delete('progress');});}
export function writeProgress(id,game,sound){return transaction('readwrite',store=>{const current=store.get('source');current.onsuccess=()=>{if(current.result?.id===id)store.put({id,game,sound},'progress');};});}
