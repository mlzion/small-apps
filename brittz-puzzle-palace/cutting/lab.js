import {mountPuzzle} from '../game.js?v=compact-1';
import {loadMaster,openSquareImage,imagePuzzle} from './image-puzzle.js';
const $=id=>document.getElementById(id);
let source=null,request=0;
async function choose(file){const current=++request;source?.revoke();source=null;$('gallery-message').textContent='Reading the source image…';try{const next=await openSquareImage(file);if(current!==request){next.revoke();return;}source?.revoke();source=next;$('gallery-message').textContent=`${source.name} · ${source.width} × ${source.height}. Ready to shuffle.`;}catch(error){if(current===request)$('gallery-message').textContent=error.message;}}
$('source-file').addEventListener('change',e=>{if(e.target.files[0])choose(e.target.files[0]);});
$('sample-image').onclick=()=>{
 const canvas=document.createElement('canvas');canvas.width=canvas.height=800;const ctx=canvas.getContext('2d');
 const gradient=ctx.createLinearGradient(0,0,800,800);gradient.addColorStop(0,'#0aa9c2');gradient.addColorStop(.5,'#fee2a0');gradient.addColorStop(1,'#744bb3');ctx.fillStyle=gradient;ctx.fillRect(0,0,800,800);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){ctx.fillStyle=(row+col)%2?'#183e4960':'#ffffff60';ctx.fillRect(col*100,row*100,100,100);ctx.fillStyle='#123743';ctx.font='24px system-ui';ctx.fillText(`${col+1} / ${row+1}`,col*100+15,row*100+55);}
 canvas.toBlob(blob=>choose(new File([blob],'Coordinate test picture.png',{type:'image/png'})),'image/png');
};
$('lab-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!source){$('gallery-message').textContent='Choose a square JPG or PNG, or use the test picture.';return;}
 const current=++request,active=source;$('start-lab').disabled=true;$('gallery-message').textContent='Loading the permanent master…';
 try{const master=await loadMaster(Number($('master-count').value));if(current!==request||active!==source)return;mountPuzzle(imagePuzzle(master,source,Number($('master-rotation').value),{outlines:$('image-outlines').checked}));}
 catch(error){if(current===request)$('gallery-message').textContent=error.message;}
 finally{$('start-lab').disabled=false;}
});
window.addEventListener('pagehide',e=>{if(!e.persisted)source?.revoke();});
