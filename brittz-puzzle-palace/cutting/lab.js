import {mountPuzzle} from '../game.js?v=main-1';
import {openSquareImage,mosaicPuzzle} from './image-puzzle.js?v=mosaic-4';
import {readSession,createSession,writeProgress} from './session.js';
const $=id=>document.getElementById(id);
let source=null,request=0,saved=null;
function generate(count,seed){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./mosaic-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{worker.terminate();data.error?reject(Error(data.error)):resolve(data.pattern);};worker.onerror=()=>{worker.terminate();reject(Error('The mosaic generator could not start. Reload and try again.'));};worker.postMessage({count,seed});});}
function play(record,progress){
 $('master-count').value=String(record.pattern.pieceCount);$('image-outlines').checked=record.outlines;
 const next=mosaicPuzzle(record.pattern,source,{outlines:record.outlines});next.resume=progress;
 next.onProgress=(game,sound)=>{writeProgress(record.id,game,sound).catch(error=>{const status=$('lab-save-status');status.hidden=false;status.textContent=`Progress could not be saved: ${error.message}. Keep this tab open and free browser storage before reloading.`;});};
 $('lab-save-status').hidden=true;mountPuzzle(next);$('resume-lab').hidden=false;
}
async function resume(){
 const current=++request;$('gallery-message').textContent='Restoring your saved mosaic…';
 try{const session=await readSession();if(!session){$('resume-lab').hidden=true;return;}const restored=await openSquareImage(session.record.blob);if(current!==request){restored.revoke();return;}source?.revoke();source=restored;source.name=session.record.name;saved=session.record;play(saved,session.progress);}
 catch(error){$('gallery-message').textContent=`Saved mosaic could not be restored: ${error.message}. Choose an image to create a new puzzle.`;}
}
async function choose(file){const current=++request;source?.revoke();source=null;$('gallery-message').textContent='Reading the source image…';try{const next=await openSquareImage(file);if(current!==request){next.revoke();return;}source=next;$('gallery-message').textContent=`${source.name} · ${source.width} × ${source.height}. Ready to shuffle.`;}catch(error){if(current===request)$('gallery-message').textContent=error.message;}}
$('source-file').addEventListener('change',e=>{if(e.target.files[0])choose(e.target.files[0]);});
$('sample-image').onclick=()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=800;const ctx=canvas.getContext('2d');
 const gradient=ctx.createLinearGradient(0,0,800,800);gradient.addColorStop(0,'#0aa9c2');gradient.addColorStop(.5,'#fee2a0');gradient.addColorStop(1,'#744bb3');ctx.fillStyle=gradient;ctx.fillRect(0,0,800,800);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){ctx.fillStyle=(row+col)%2?'#183e4960':'#ffffff60';ctx.fillRect(col*100,row*100,100,100);ctx.fillStyle='#123743';ctx.font='24px system-ui';ctx.fillText(`${col+1} / ${row+1}`,col*100+15,row*100+55);}
 canvas.toBlob(blob=>choose(new File([blob],'Coordinate test picture.png',{type:'image/png'})),'image/png');
};
$('lab-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!source){$('gallery-message').textContent='Choose a square JPG or PNG, or use the test picture.';return;}
 const current=++request,active=source;$('start-lab').disabled=true;$('gallery-message').textContent='Building and validating your geometric mosaic…';
 try{
 let seed=crypto.getRandomValues(new Uint32Array(1))[0];if(seed===saved?.pattern.seed)seed=(seed+1)>>>0;
 const pattern=await generate(Number($('master-count').value),seed);if(current!==request||active!==source)return;
 const record={version:1,id:Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-'),pattern,blob:source.blob,name:source.name,outlines:$('image-outlines').checked};
 await createSession(record);if(current!==request||active!==source)return;saved=record;play(record);
 }catch(error){if(current===request)$('gallery-message').textContent=`Unable to create the puzzle: ${error.message}`;}
 finally{$('start-lab').disabled=false;}
});
$('resume-lab').onclick=resume;
$('start-lab').disabled=true;resume().finally(()=>{if(!saved&&!source)$('gallery-message').textContent=$('gallery-message').textContent==='Restoring your saved mosaic…'?'Choose an image or use the test picture. Your latest mosaic will be saved locally.':$('gallery-message').textContent;$('start-lab').disabled=false;});
window.addEventListener('pagehide',e=>{if(!e.persisted)source?.revoke();});

// Legacy vector saves stay in their existing namespace and remain playable.
const legacyNotice=$('legacy-notice');
if(legacyNotice)try{legacyNotice.hidden=!Object.keys(localStorage).some(key=>key==='brittz-sea-turtle-v1'||key.startsWith('brittz-puzzle:'));}catch{/* Archive link remains available when storage is restricted. */}
