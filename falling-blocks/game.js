'use strict';
const game = new FallingBlocks.Game();
const $ = id => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const colors = ['','#9bbfaa','#d8b58c','#b2a4ce','#7da9b2','#cd9295','#8f9fc8','#b7bc7e'];
let muted = true, audio, repeatDelay, repeatTimer, last = 0;
function sound(frequency = 220) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency,audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency*.65,audio.currentTime+.09);
    gain.gain.setValueAtTime(.05,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.12);
    oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime+.13);
  } catch (_) { /* Audio is optional; gameplay remains available. */ }
}
function cell(context,x,y,size,color,ghost=false) {
  context.fillStyle = color; context.strokeStyle = color;
  if (ghost) { context.lineWidth=2; context.strokeRect(x*size+4,y*size+4,size-8,size-8); }
  else { context.fillRect(x*size+2,y*size+2,size-4,size-4); context.fillStyle='#ffffff30';context.fillRect(x*size+5,y*size+5,size-10,2); }
}
function render() {
  ctx.fillStyle='#0d1419';ctx.fillRect(0,0,300,600);
  ctx.strokeStyle='#202c33';ctx.lineWidth=1;
  for(let x=0;x<=10;x++){ctx.beginPath();ctx.moveTo(x*30,0);ctx.lineTo(x*30,600);ctx.stroke();}
  for(let y=0;y<=20;y++){ctx.beginPath();ctx.moveTo(0,y*30);ctx.lineTo(300,y*30);ctx.stroke();}
  game.board.forEach((row,y)=>row.forEach((v,x)=>{if(v)cell(ctx,x,y,30,colors[v]);}));
  if(game.state!=='over') {
    const p=game.piece, ghost=game.ghostY();
    p.matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v){cell(ctx,p.x+x,ghost+y,30,colors[p.type+1],true);cell(ctx,p.x+x,p.y+y,30,colors[p.type+1]);}}));
  }
  const preview=$('next').getContext('2d');preview.clearRect(0,0,120,120);
  const matrix=FallingBlocks.SHAPES[game.next], size=24, offset=(5-matrix.length)/2;
  matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v)cell(preview,x+offset,y+offset,size,colors[game.next+1]);}));
  $('next').setAttribute('aria-label','Next piece: '+['I','O','T','S','Z','J','L'][game.next]);
  for(const id of ['score','level','lines']) $(id).textContent=game[id];
  $('pause').disabled=['ready','over'].includes(game.state);
  $('pause').textContent=game.state==='paused'?'Resume':'Pause';
  $('overlay').hidden=game.state==='playing';
  if(game.state==='paused'){$('message').textContent='Take a breath.';$('detail').textContent='Your stack can wait.';$('start').textContent='Resume';}
  if(game.state==='over'){$('message').textContent='Stack complete.';$('detail').textContent='Game over · Final score: '+game.score;$('start').textContent='Play again';}
}
function announce(){ $('status').textContent=game.state==='over'?'Game over. Final score '+game.score:game.state==='paused'?'Paused':`Level ${game.level}. ${game.lines} lines. Score ${game.score}.`; }
function start(){if(game.state==='over')game.reset();game.state='playing';last=performance.now();sound(320);render();announce();canvas.focus();}
function pause(){if(game.state==='playing'){game.state='paused';stopRepeat();}else if(game.state==='paused')game.state='playing';render();announce();}
function action(name){
  if(game.state!=='playing')return;
  let cleared=null;
  if(name==='left')game.move(-1,0);
  if(name==='right')game.move(1,0);
  if(name==='rotate' && game.rotate())sound(280);
  if(name==='reverse' && game.rotate(-1))sound(280);
  if(name==='down')cleared=game.drop();
  if(name==='hard'){cleared=game.drop(true);sound(130);}
  if(cleared){sound(440);announce();}
  if(game.state==='over')announce();
  render();
}
$('start').onclick=start;
$('pause').onclick=pause;
$('restart').onclick=()=>{stopRepeat();game.reset();start();};
$('mute').onclick=()=>{muted=!muted;$('mute').textContent=muted?'Sound off':'Sound on';$('mute').setAttribute('aria-pressed',String(muted));if(!muted)sound(320);};
const keys={ArrowLeft:'left',a:'left',ArrowRight:'right',d:'right',ArrowUp:'rotate',x:'rotate',z:'reverse',ArrowDown:'down',s:'down',' ':'hard'};
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  // Preserve native Space/Enter activation on buttons and links.
  if((key===' '||key==='Enter')&&event.target.closest('button,a'))return;
  if(keys[key]){event.preventDefault();if(!event.repeat||['left','right','down'].includes(keys[key]))action(keys[key]);}
  if(key==='p'||key==='Escape'){event.preventDefault();if(!event.repeat)pause();}
});
function stopRepeat(){clearTimeout(repeatDelay);clearInterval(repeatTimer);}
document.querySelectorAll('[data-action]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{
    if(event.button!==0)return;event.preventDefault();stopRepeat();button.setPointerCapture(event.pointerId);
    const name=button.dataset.action;action(name);
    if(['left','right','down'].includes(name))repeatDelay=setTimeout(()=>{repeatTimer=setInterval(()=>action(name),80);},220);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,stopRepeat);
  button.addEventListener('click',event=>{if(event.detail===0)action(button.dataset.action);});
});
function suspend(){stopRepeat();if(game.state==='playing')pause();}
window.addEventListener('blur',suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
function frame(now){const cleared=game.tick(Math.min(now-last,100));last=now;if(cleared){sound(440);announce();}if(game.state==='over'&&$('overlay').hidden)announce();render();requestAnimationFrame(frame);}
render();requestAnimationFrame(frame);
