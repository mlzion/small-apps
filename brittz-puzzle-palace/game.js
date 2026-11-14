import {turtle,pieces} from './puzzle.js';
import {canSnap,shuffledState,clampPiece,rotatedBounds,config} from './engine.js';
const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
const board=$('board'),art=$('art'),controls=$('controls'),tray=$('tray');
const lookup=new Map(pieces.map(p=>[p.id,p]));
const storageKey=`brittz-${turtle.id}`;
let game=shuffledState(pieces), selected=null, reference=false,sound=true,audio;
const views={puzzle:{zoom:1,x:0,y:0},reference:{zoom:1,x:0,y:0}};
let pointers=new Map(),gesture=null,trayDown=null;
function save(){try{localStorage.setItem(storageKey,JSON.stringify({game,sound}));}catch{/* Private storage or quota: keep playing in memory. */}}
try{
 const data=JSON.parse(localStorage.getItem(storageKey));
 if(data && Array.isArray(data.game?.order) && data.game.order.length===pieces.length && new Set(data.game.order).size===pieces.length && data.game.order.every(id=>lookup.has(id)) && pieces.every(p=>{
 const s=data.game.states?.[p.id];return s && ['tray','board','locked'].includes(s.location) && [s.x,s.y,s.angle].every(Number.isFinite);
 })){
 game=data.game;sound=data.sound!==false;
 pieces.forEach(p=>{const s=game.states[p.id];if(s.location==='locked'){s.x=p.cx;s.y=p.cy;s.angle=0;}else clampPiece(p,s,turtle.width,turtle.height);});
 }
}catch{/* Ignore obsolete or invalid saves. */}
function svg(tag,attrs={}){const el=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function shape(piece){const g=svg('g');g.append(svg('path',{d:piece.path,fill:piece.color,class:'glass'}));if(piece.detail){const detail=svg('g',{'pointer-events':'none'});detail.innerHTML=piece.detail;g.append(detail);}return g;}
const view=()=>views[reference?'reference':'puzzle'];
function scale(){return board.getBoundingClientRect().width/turtle.width*view().zoom;}
function local(e){const r=board.getBoundingClientRect();return {x:(e.clientX-r.left)*720/r.width,y:(e.clientY-r.top)*480/r.height};}
function world(point){const v=view();return {x:(point.x-v.x)/v.zoom,y:(point.y-v.y)/v.zoom};}
function camera(){const v=view();v.x=Math.max(720*(1-v.zoom),Math.min(0,v.x));v.y=Math.max(480*(1-v.zoom),Math.min(0,v.y));$('camera').setAttribute('transform',`translate(${v.x} ${v.y}) scale(${v.zoom})`);drawControls();}
function drawControls(){controls.replaceChildren();if(reference||!selected)return;
 const p=lookup.get(selected),s=game.states[selected],v=view(),k=720/board.getBoundingClientRect().width;
 const center={x:s.x*v.zoom+v.x,y:s.y*v.zoom+v.y};
 // Keep an independent, screen-sized control inside the viewport, even near corners.
 const margin=27*k, length=94*k;
 const x=center.x,y=center.y;
 let hx=x+(x>360?-length:length),hy=y+(y>240?-length*.4:length*.4);
 hx=Math.max(margin,Math.min(720-margin,hx));hy=Math.max(margin,Math.min(480-margin,hy));
 const base={x1:x,y1:y,x2:hx,y2:hy};
 controls.append(svg('line',{...base,class:'control-line','stroke-width':2*k}),svg('line',{...base,class:'rotation-hit','stroke-width':30*k,'data-action':'rotate'}),svg('circle',{cx:x,cy:y,r:4*k,class:'control-center','pointer-events':'none'}),svg('circle',{cx:hx,cy:hy,r:22*k,class:'move-handle','data-action':'move'}));
 const cross=svg('path',{d:`M${hx-6*k} ${hy}h${12*k}M${hx} ${hy-6*k}v${12*k}`,stroke:'#fff','stroke-width':1.5*k,'pointer-events':'none'});controls.append(cross);
}
function revealSelected(){
 if(reference||!selected)return;
 const p=lookup.get(selected),s=game.states[selected],v=view(),b=rotatedBounds(p,s.angle);
 // A selected piece must fit the viewing window. Zooming can still inspect locked glass.
 v.zoom=Math.min(v.zoom,720/(b.right-b.left+20),480/(b.bottom-b.top+20));
 v.x=Math.min(10-(s.x+b.left)*v.zoom,Math.max(710-(s.x+b.right)*v.zoom,v.x));
 v.y=Math.min(10-(s.y+b.top)*v.zoom,Math.max(470-(s.y+b.bottom)*v.zoom,v.y));
}
function constrainToView(p,s){
 clampPiece(p,s,720,480);
 const v=view(),b=rotatedBounds(p,s.angle);
 const left=-v.x/v.zoom,right=(720-v.x)/v.zoom,top=-v.y/v.zoom,bottom=(480-v.y)/v.zoom;
 if(b.right-b.left<=right-left)s.x=Math.max(left-b.left,Math.min(right-b.right,s.x));
 if(b.bottom-b.top<=bottom-top)s.y=Math.max(top-b.top,Math.min(bottom-b.bottom,s.y));
 clampPiece(p,s,720,480);
}
function renderBoard(){
 art.replaceChildren();
 const order=reference?pieces.map(p=>p.id):[...game.order.filter(id=>game.states[id].location==='locked'),...game.order.filter(id=>game.states[id].location==='board'&&id!==selected),...(selected?[selected]:[])];
 order.forEach(id=>{const p=lookup.get(id),s=game.states[id],g=shape(p);g.dataset.piece=id;
 if(!reference){g.setAttribute('transform',`translate(${s.x} ${s.y}) rotate(${s.angle}) translate(${-p.cx} ${-p.cy})`);g.setAttribute('class',`${s.location==='board'?'loose':''} ${selected===id?'selected':''}`);}
 art.append(g);
 });
 $('empty-note').hidden=reference||pieces.some(p=>game.states[p.id].location!=='tray');
 $('return').disabled=reference||!selected;
 const count=pieces.filter(p=>game.states[p.id].location==='locked').length;
 $('counter').textContent=`${count} / ${pieces.length} pieces placed`;
 $('complete').hidden=count!==pieces.length;
 camera();
}
function renderTray(){tray.style.setProperty('--tray-rows',Math.max(1,Math.min(3,turtle.trayRows)));
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
 if(s.location==='tray') {s.location='board';const center=world({x:360,y:240});s.x=center.x;s.y=center.y;clampPiece(lookup.get(id),s,720,480);renderTray();}
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
function zoomBy(factor,point={x:360,y:240}){const w=world(point),v=view();v.zoom=Math.max(config.minZoom,Math.min(config.maxZoom,v.zoom*factor));v.x=point.x-w.x*v.zoom;v.y=point.y-w.y*v.zoom;revealSelected();camera();}
board.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.15:1/1.15,local(e));},{passive:false});
$('zoom-in').onclick=()=>zoomBy(1.3);$('zoom-out').onclick=()=>zoomBy(1/1.3);$('fit').onclick=()=>{Object.assign(view(),{zoom:1,x:0,y:0});camera();};
function setView(ref){pointers.clear();gesture=null;reference=ref;$('puzzle-view').setAttribute('aria-pressed',String(!ref));$('reference-view').setAttribute('aria-pressed',String(ref));renderBoard();}
$('puzzle-view').onclick=()=>setView(false);$('reference-view').onclick=()=>setView(true);
function returnPiece(){if(!selected||reference)return;game.states[selected].location='tray';selected=null;save();renderTray();renderBoard();}
$('return').onclick=returnPiece;
function restart(){game=shuffledState(pieces);selected=null;pointers.clear();gesture=null;Object.values(views).forEach(v=>Object.assign(v,{zoom:1,x:0,y:0}));save();setView(false);renderTray();}
$('restart').onclick=()=>$('restart-dialog').showModal();$('restart-dialog').addEventListener('close',()=>{if($('restart-dialog').returnValue==='restart')restart();});$('replay').onclick=restart;
function soundLabel(){$('sound').textContent=`Sound ${sound?'on':'off'}`;$('sound').setAttribute('aria-pressed',String(sound));}
$('sound').onclick=()=>{sound=!sound;soundLabel();save();};
board.addEventListener('keydown',e=>{if(!selected||reference)return;const s=game.states[selected],step=e.shiftKey?10:2;
 if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','[',']','Escape','Enter'].includes(e.key))e.preventDefault();else return;
 if(e.key==='Escape'){selected=null;renderBoard();return;}
 if(e.key==='ArrowLeft')s.x-=step;if(e.key==='ArrowRight')s.x+=step;if(e.key==='ArrowUp')s.y-=step;if(e.key==='ArrowDown')s.y+=step;if(e.key==='[')s.angle-=e.shiftKey?15:1;if(e.key===']')s.angle+=e.shiftKey?15:1;
 clampPiece(lookup.get(selected),s,720,480);snap();
});
window.addEventListener('blur',()=>{pointers.clear();gesture=null;save();});new ResizeObserver(()=>camera()).observe(board);
board.setAttribute('aria-description','Keyboard: arrows move the selected piece; brackets rotate; Shift increases the step; Escape clears selection.');
soundLabel();renderTray();renderBoard();
