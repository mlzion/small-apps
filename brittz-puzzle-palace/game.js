import {imagePiece,completedImage,sourceImage} from './cutting/render.js';
import {preparePuzzle,validateCatalog,matchEntry,detailMarkup} from './content.js';
import {loadProgress,saveProgress,progressSummary,isComplete,playerName,rememberName} from './progress.js';
import {certificateJPG,cleanName} from './certificate.js';
import {canSnap,shuffledState,clampPiece,rotatedBounds,config} from './engine.js';
const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const board=$('board'),art=$('art'),controls=$('controls'),tray=$('tray');
let puzzle=null,pieces=[],lookup=new Map(),W=720,H=480;
let game=null,selected=null,reference=false,sound=true,audio;
let catalog=[],requestSerial=0,exportSerial=0,exporting=false,certificateURL=null;
const cache=new Map();
const isLab=document.documentElement.dataset.cuttingLab==='true';
const views={puzzle:{zoom:1,x:0,y:0},reference:{zoom:1,x:0,y:0}};
let pointers=new Map(),gesture=null,trayDown=null;
function save(){if(puzzle&&game&&!puzzle.ephemeral)saveProgress(puzzle,game,sound);}
function svg(tag,attrs={}){const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function shape(piece){if(puzzle.kind==='image')return imagePiece(puzzle,piece);const g=svg('g');g.append(svg('path',{d:piece.path,fill:piece.color,class:'glass'}));if(piece.details.length){const detail=svg('g',{'pointer-events':'none'});detail.innerHTML=detailMarkup(piece);g.append(detail);}return g;}
const view=()=>views[reference?'reference':'puzzle'];
function scale(){return board.getBoundingClientRect().width/puzzle.width*view().zoom;}
function local(e){const r=board.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
function world(point){const v=view();return {x:(point.x-v.x)/v.zoom,y:(point.y-v.y)/v.zoom};}
function camera(){if(!puzzle||!game||$('game-screen').hidden)return;const v=view();v.x=Math.max(W*(1-v.zoom),Math.min(0,v.x));v.y=Math.max(H*(1-v.zoom),Math.min(0,v.y));$('camera').setAttribute('transform',`translate(${v.x} ${v.y}) scale(${v.zoom})`);drawControls();}
function drawControls(){controls.replaceChildren();if(reference||!selected)return;
 const p=lookup.get(selected),s=game.states[selected],v=view(),k=W/board.getBoundingClientRect().width;
 const center={x:s.x*v.zoom+v.x,y:s.y*v.zoom+v.y};
 // Keep an independent, screen-sized control inside the viewport, even near corners.
 const margin=27*k, length=94*k;
 const x=center.x,y=center.y;
 let hx=x+(x>(W/2)?-length:length),hy=y+(y>(H/2)?-length*.4:length*.4);
 hx=Math.max(margin,Math.min(W-margin,hx));hy=Math.max(margin,Math.min(H-margin,hy));
 const base={x1:x,y1:y,x2:hx,y2:hy};
 controls.append(svg('line',{...base,class:'control-line','stroke-width':2*k}),svg('line',{...base,class:'rotation-hit','stroke-width':30*k,'data-action':'rotate'}),svg('circle',{cx:x,cy:y,r:4*k,class:'control-center','pointer-events':'none'}),svg('circle',{cx:hx,cy:hy,r:22*k,class:'move-handle','data-action':'move'}));
 const cross=svg('path',{d:`M${hx-6*k} ${hy}h${12*k}M${hx} ${hy-6*k}v${12*k}`,stroke:'#fff','stroke-width':1.5*k,'pointer-events':'none'});controls.append(cross);
}
function revealSelected(){
 if(reference||!selected)return;
 const p=lookup.get(selected),s=game.states[selected],v=view(),b=rotatedBounds(p,s.angle);
 // A selected piece must fit the viewing window. Zooming can still inspect locked glass.
 v.zoom=Math.min(v.zoom,W/(b.right-b.left+20),H/(b.bottom-b.top+20));
 v.x=Math.min(10-(s.x+b.left)*v.zoom,Math.max((W-10)-(s.x+b.right)*v.zoom,v.x));
 v.y=Math.min(10-(s.y+b.top)*v.zoom,Math.max((H-10)-(s.y+b.bottom)*v.zoom,v.y));
}
function constrainToView(p,s){
 clampPiece(p,s,W,H);
 const v=view(),b=rotatedBounds(p,s.angle);
 const left=-v.x/v.zoom,right=(W-v.x)/v.zoom,top=-v.y/v.zoom,bottom=(H-v.y)/v.zoom;
 if(b.right-b.left<=right-left)s.x=Math.max(left-b.left,Math.min(right-b.right,s.x));
 if(b.bottom-b.top<=bottom-top)s.y=Math.max(top-b.top,Math.min(bottom-b.bottom,s.y));
 clampPiece(p,s,W,H);
}
function renderBoard(){
 art.replaceChildren();
 const order=reference?pieces.map(p=>p.id):[...game.order.filter(id=>game.states[id].location==='locked'),...game.order.filter(id=>game.states[id].location==='board'&&id!==selected),...(selected?[selected]:[])];
 const flattened=puzzle.kind==='image'&&(reference||pieces.every(p=>game.states[p.id].location==='locked'));
 if(flattened)art.append(reference?sourceImage(puzzle):completedImage(puzzle));
 (flattened?[]:order).forEach(id=>{const p=lookup.get(id),s=game.states[id],g=shape(p);g.dataset.piece=id;
 if(!reference){g.setAttribute('transform',`translate(${s.x} ${s.y}) rotate(${s.angle}) translate(${-p.cx} ${-p.cy})`);g.setAttribute('class',`${s.location==='board'?'loose':''} ${selected===id?'selected':''}`);}
 art.append(g);
 });
 $('empty-note').hidden=reference||pieces.some(p=>game.states[p.id].location!=='tray');
 $('return').disabled=reference||!selected;
 const count=pieces.filter(p=>game.states[p.id].location==='locked').length;
 $('counter').textContent=`${count} / ${pieces.length} pieces placed`;
 $('complete').hidden=count!==pieces.length||reference;
 $('export-certificate').disabled=puzzle.kind==='image'||count!==pieces.length||reference||exporting;
 $('certificate-download').hidden=reference||count!==pieces.length||!certificateURL;
 camera();
}
function renderTray(){tray.style.setProperty('--tray-rows',Math.max(1,Math.min(3,puzzle.trayRows)));
 const scroll=tray.scrollLeft;tray.replaceChildren();
 game.order.filter(id=>game.states[id].location==='tray').forEach(id=>{const p=lookup.get(id),s=game.states[id],b=rotatedBounds(p,s.angle),size=Math.max(b.right-b.left,b.bottom-b.top)+30;
 const button=document.createElement('button');button.className='piece-slot';button.dataset.piece=id;button.setAttribute('aria-label',`Select ${p.name}`);
 const image=svg('svg',{viewBox:`${(b.left+b.right-size)/2} ${(b.top+b.bottom-size)/2} ${size} ${size}`,'aria-hidden':'true'}),g=shape(p);
 g.setAttribute('transform',`rotate(${s.angle}) translate(${-p.cx} ${-p.cy})`);image.append(g);button.append(image);tray.append(button);
 });tray.scrollLeft=scroll;
}
function tone(complete=false){if(!sound)return;try{
 audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume().catch(()=>{});
 (complete?[523,659,784,1047]:[660]).forEach((frequency,i)=>{const osc=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.12;osc.type='sine';osc.frequency.value=frequency;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.065,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+.24);osc.connect(gain).connect(audio.destination);osc.start(t);osc.stop(t+.25);});
 }catch{/* Audio is optional. */}}
function snap(){if(!selected)return;const p=lookup.get(selected),s=game.states[selected];
 if(canSnap(p,s,scale())){Object.assign(s,{x:p.cx,y:p.cy,angle:0,location:'locked'});selected=null;tone(pieces.every(p=>game.states[p.id].location==='locked'));}
 save();renderBoard();
}
function select(id){if(reference)return;const s=game.states[id];if(s.location==='locked')return;
 selected=id;
 if(s.location==='tray') {s.location='board';const center=world({x:(W/2),y:(H/2)});s.x=center.x;s.y=center.y;clampPiece(lookup.get(id),s,W,H);renderTray();}
 revealSelected();save();renderBoard();board.focus({preventScroll:true});
}
// Native tray scrolling wins over selection: activation requires a short, stationary tap.
tray.addEventListener('pointerdown',e=>{trayDown={id:e.pointerId,x:e.clientX,y:e.clientY,scroll:tray.scrollLeft,time:performance.now(),moved:false};});
tray.addEventListener('pointermove',e=>{if(trayDown&&Math.hypot(e.clientX-trayDown.x,e.clientY-trayDown.y)>8)trayDown.moved=true;});
tray.addEventListener('pointercancel',()=>{trayDown=null;});
tray.addEventListener('click',e=>{const button=e.target.closest('[data-piece]');if(!button)return;
 if(e.detail!==0&&(!trayDown||trayDown.moved||Math.abs(tray.scrollLeft-trayDown.scroll)>6||performance.now()-trayDown.time>650))return;
 select(button.dataset.piece);trayDown=null;
});
function pinchStart(){const [a,b]=[...pointers.values()];gesture={type:'pinch',distance:Math.hypot(b.x-a.x,b.y-a.y),zoom:view().zoom,anchor:world({x:(a.x+b.x)/2,y:(a.y+b.y)/2})};}
board.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;e.preventDefault();board.focus({preventScroll:true});board.setPointerCapture(e.pointerId);const point=local(e);pointers.set(e.pointerId,point);
 if(pointers.size===2){pinchStart();return;}if(pointers.size>2)return;
 const action=e.target.dataset.action;
 if(!reference&&action&&selected){const s=game.states[selected];gesture={type:action,start:world(point),x:s.x,y:s.y,angle:s.angle,startAngle:Math.atan2(world(point).y-s.y,world(point).x-s.x)};return;}
 const id=e.target.closest('[data-piece]')?.dataset.piece;
 if(!reference&&id&&game.states[id].location==='board'){select(id);gesture={type:'select'};return;}
 gesture={type:'pan',start:point,x:view().x,y:view().y};
});
board.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();const point=local(e);pointers.set(e.pointerId,point);if(!gesture)return;
 if(gesture.type==='pinch'&&pointers.size>=2){const[a,b]=[...pointers.values()],v=view();v.zoom=Math.max(config.minZoom,Math.min(config.maxZoom,gesture.zoom*Math.hypot(b.x-a.x,b.y-a.y)/Math.max(1,gesture.distance)));v.x=(a.x+b.x)/2-gesture.anchor.x*v.zoom;v.y=(a.y+b.y)/2-gesture.anchor.y*v.zoom;camera();return;}
 if(gesture.type==='pan'){view().x=gesture.x+point.x-gesture.start.x;view().y=gesture.y+point.y-gesture.start.y;camera();return;}
 if(!selected||reference)return;const s=game.states[selected],p=lookup.get(selected),w=world(point);
 if(gesture.type==='move'){s.x=gesture.x+w.x-gesture.start.x;s.y=gesture.y+w.y-gesture.start.y;}
 if(gesture.type==='rotate'){const next=Math.atan2(w.y-s.y,w.x-s.x);s.angle=gesture.angle+(next-gesture.startAngle)*180/Math.PI;revealSelected();}
 constrainToView(p,s);renderBoard();
});
function endPointer(e){if(!pointers.has(e.pointerId))return;const type=gesture?.type;pointers.delete(e.pointerId);
 if(board.hasPointerCapture(e.pointerId))board.releasePointerCapture(e.pointerId);
 if(e.type!=='pointercancel'&&(type==='move'||type==='rotate'))snap();else save();
 // A remaining finger after a pinch must start a fresh gesture; never turn into a piece drag.
 gesture=null;if(type==='pinch'){revealSelected();camera();}
}
board.addEventListener('pointerup',endPointer);board.addEventListener('pointercancel',endPointer);board.addEventListener('lostpointercapture',endPointer);
function zoomBy(factor,point={x:(W/2),y:(H/2)}){const w=world(point),v=view();v.zoom=Math.max(config.minZoom,Math.min(config.maxZoom,v.zoom*factor));v.x=point.x-w.x*v.zoom;v.y=point.y-w.y*v.zoom;revealSelected();camera();}
board.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.15:1/1.15,local(e));},{passive:false});
$('zoom-in').onclick=()=>zoomBy(1.3);$('zoom-out').onclick=()=>zoomBy(1/1.3);$('fit').onclick=()=>{Object.assign(view(),{zoom:1,x:0,y:0});camera();};
function setView(ref){pointers.clear();gesture=null;reference=ref;$('puzzle-view').setAttribute('aria-pressed',String(!ref));$('reference-view').setAttribute('aria-pressed',String(ref));renderBoard();}
$('puzzle-view').onclick=()=>setView(false);$('reference-view').onclick=()=>setView(true);
function returnPiece(){if(!selected||reference)return;game.states[selected].location='tray';selected=null;save();renderTray();renderBoard();}
$('return').onclick=returnPiece;
function restart(){clearCertificate();game=shuffledState(pieces);selected=null;pointers.clear();gesture=null;Object.values(views).forEach(v=>Object.assign(v,{zoom:1,x:0,y:0}));save();setView(false);renderTray();}
$('restart').onclick=()=>$('restart-dialog').showModal();$('restart-dialog').addEventListener('close',()=>{if($('restart-dialog').returnValue==='restart')restart();});$('replay').onclick=restart;
function soundLabel(){$('sound').textContent=`Sound ${sound?'on':'off'}`;$('sound').setAttribute('aria-pressed',String(sound));}
$('sound').onclick=()=>{sound=!sound;soundLabel();save();};
board.addEventListener('keydown',e=>{if(!selected||reference)return;const s=game.states[selected],step=e.shiftKey?10:2;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','[',']','Escape','Enter'].includes(e.key))e.preventDefault();else return;
 if(e.key==='Escape'){selected=null;renderBoard();return;}
 if(e.key==='ArrowLeft')s.x-=step;if(e.key==='ArrowRight')s.x+=step;if(e.key==='ArrowUp')s.y-=step;if(e.key==='ArrowDown')s.y+=step;if(e.key==='[')s.angle-=e.shiftKey?15:1;if(e.key===']')s.angle+=e.shiftKey?15:1;
 clampPiece(lookup.get(selected),s,W,H);snap();
});
window.addEventListener('blur',()=>{pointers.clear();gesture=null;save();});new ResizeObserver(()=>camera()).observe(board);
board.setAttribute('aria-description','Keyboard: arrows move the selected piece; brackets rotate; Shift increases the step; Escape clears selection.');
async function getJSON(path){const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error(`Could not load ${path} (HTTP ${response.status}).`);return response.json();}
function message(text){$('gallery-message').textContent=text;}
function renderGallery(){
 $('puzzle-cards').replaceChildren();
 for(const entry of catalog){
 const card=document.createElement('article');card.className='puzzle-card';
 const button=document.createElement('button');button.className='puzzle-launch';button.dataset.puzzle=entry.id;
 const image=document.createElement('img');image.src=entry.thumbnail;image.alt='';image.width=600;image.height=400;image.loading='lazy';
 const title=document.createElement('h3');title.textContent=entry.title;
 const count=document.createElement('p');count.textContent=`${entry.pieceCount} pieces`;
 const status=document.createElement('p');status.className='puzzle-status';status.textContent=progressSummary(entry);
 button.append(image,title,count,status);button.onclick=()=>openPuzzle(entry);card.append(button);
 if(status.textContent==='Completed'){const replay=document.createElement('button');replay.textContent='Replay';replay.className='gallery-replay';replay.onclick=()=>openPuzzle(entry,true);card.append(replay);}
 $('puzzle-cards').append(card);
 }
}
function clearCertificate(){exportSerial++;exporting=false;if(certificateURL)URL.revokeObjectURL(certificateURL);certificateURL=null;$('certificate-download').removeAttribute('href');$('certificate-download').hidden=true;$('certificate-status').textContent='';}
function cancelGestures(){pointers.clear();gesture=null;trayDown=null;}
function showGallery(){requestSerial++;save();cancelGestures();clearCertificate();$('restart-dialog').close();$('game-screen').hidden=true;$('gallery-screen').hidden=false;renderGallery();message('');$('gallery-title').focus({preventScroll:true});}
$('back-gallery').onclick=showGallery;
async function openPuzzle(entry,replay=false){
 const request=++requestSerial;message(`Loading ${entry.title}…`);
 try{
 let next=cache.get(entry.id);if(!next){next=matchEntry(entry,preparePuzzle(await getJSON(entry.data)));cache.set(entry.id,next);}
 if(request!==requestSerial)return;
 mountPuzzle(next,replay);
 }catch(error){if(request===requestSerial)message(`Unable to open this puzzle: ${error.message}`);}
}
// Both the published catalog and the development lab use the same controller.
// Raster input is prepared separately; the gameplay model/input handlers are shared.
export function mountPuzzle(next,replay=false){
 save();cancelGestures();clearCertificate();puzzle=next;pieces=puzzle.pieces;lookup=new Map(pieces.map(p=>[p.id,p]));W=puzzle.width;H=puzzle.height;
 ({game,sound}=puzzle.ephemeral?{game:shuffledState(pieces),sound}:loadProgress(puzzle));selected=null;reference=false;
 Object.values(views).forEach(v=>Object.assign(v,{zoom:1,x:0,y:0}));
 board.setAttribute('viewBox',`0 0 ${W} ${H}`);for(const rect of board.querySelectorAll('rect')){rect.setAttribute('width',W);rect.setAttribute('height',H);}
 document.querySelector('.viewport').style.aspectRatio=`${W} / ${H}`;
 $('game-screen').setAttribute('aria-label',`${puzzle.title} puzzle`);
 $('puzzle-title').textContent=puzzle.title;$('piece-count').textContent=`${pieces.length} pieces`;
 $('puzzle-subtitle').textContent=puzzle.subtitle||'THE GLASS COLLECTION';
 $('empty-note').replaceChildren(document.createTextNode(puzzle.emptyMessage||'Your picture starts here'));const hint=document.createElement('span');hint.textContent='Choose a piece below';$('empty-note').append(hint);
 $('completion-title').textContent=puzzle.completionTitle||'A beautiful picture, piece by piece.';$('completion-message').textContent=puzzle.completionMessage||`You completed ${puzzle.title}!`;
 $('player-name').value=playerName();
 $('gallery-screen').hidden=true;$('game-screen').hidden=false;tray.scrollLeft=0;message('');
 soundLabel();renderTray();setView(false);save();if(replay)restart();$('back-gallery').focus({preventScroll:true});
 }
$('player-name').addEventListener('input',()=>rememberName($('player-name').value));
$('certificate-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!puzzle||puzzle.kind==='image'||reference||!isComplete(puzzle,game)||exporting)return;
 const name=cleanName($('player-name').value);if(!name){$('certificate-status').textContent='Enter your name for the certificate.';$('player-name').focus();return;}
 clearCertificate();const request=exportSerial,active=puzzle;exporting=true;$('export-certificate').disabled=true;$('certificate-status').textContent='Creating your certificate…';rememberName(name);
 try{
 const blob=await certificateJPG(active,name);
 if(request!==exportSerial||puzzle!==active||reference||$('game-screen').hidden||!isComplete(puzzle,game))return;
 certificateURL=URL.createObjectURL(blob);const link=$('certificate-download');link.href=certificateURL;link.download=`brittz-${puzzle.id}-certificate.jpg`;link.hidden=false;link.click();$('certificate-status').textContent='Your JPG is ready. If the download did not start, use Download JPG.';
 }catch(error){if(request===exportSerial)$('certificate-status').textContent=error.message;}
 finally{if(request===exportSerial){exporting=false;$('export-certificate').disabled=reference||!isComplete(puzzle,game);}}
});
// Remove any prepared certificate when leaving Puzzle view; asynchronous exports
// also check the current view before creating a download.
$('reference-view').addEventListener('click',clearCertificate);
async function loadCatalog(){
 const request=++requestSerial;message('Loading the glass collection…');$('retry-catalog').hidden=true;
 try{const data=validateCatalog(await getJSON('catalog.json'));if(request!==requestSerial)return;catalog=data.puzzles;renderGallery();message('Choose a picture to begin, or resume where you left off.');}
 catch(error){if(request!==requestSerial)return;message(`Unable to load the collection: ${error.message}`);$('retry-catalog').hidden=false;}
}
$('retry-catalog').onclick=loadCatalog;
if(!isLab)loadCatalog();
