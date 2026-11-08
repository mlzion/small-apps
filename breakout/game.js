'use strict';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
let audio, muted = false;
function sound(kind) {
  if (muted || !audio || audio.state !== 'running') return;
  const osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = 'sine'; osc.frequency.value = ({wall:220,paddle:440,brick:660,launch:520,level:880,lost:130})[kind];
  gain.gain.setValueAtTime(.05, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .1);
  osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime + .11);
}
function unlockAudio() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch { /* Audio is optional. */ }
}
const game = new Breakout(sound), keys = new Set();
function action() { unlockAudio(); game.action(); renderUI(); }
$('start').onclick = action;
$('pause').onclick = action;
$('restart').onclick = () => { unlockAudio(); game.reset(); game.state = 'ready'; renderUI(); };
$('mute').onclick = () => { muted = !muted; $('mute').textContent = muted ? 'Unmute sound' : 'Mute sound'; $('mute').setAttribute('aria-pressed', String(muted)); unlockAudio(); };
function renderUI() {
  $('score').textContent = game.score; $('level').textContent = game.level; $('lives').textContent = game.lives;
  $('start').disabled = !['idle','ready','over'].includes(game.state);
  $('start').textContent = game.state === 'ready' ? 'Launch ball' : game.state === 'over' ? 'New game' : 'Start';
  $('pause').disabled = !['playing','paused'].includes(game.state);
  $('pause').textContent = game.state === 'paused' ? 'Resume' : 'Pause';
  $('overlay').hidden = game.state === 'playing';
  const messages = {idle:['Ready to break out?', 'Press Start to play'],ready:[game.level > 1 ? `Level ${game.level}` : 'Ready when you are', 'Press Space or Launch ball'],paused:['Paused', 'Press Space or Resume'],over:['Game over', `Final score: ${game.score} · Press New game to try again`]};
  if (messages[game.state]) { const [title, detail] = messages[game.state]; $('message').textContent = title; $('detail').textContent = detail; }
}
const colors = ['#ed81ad','#c49bff','#8daeff','#65d8ce','#f3ce76'];
function draw() {
  ctx.clearRect(0,0,800,560);
  ctx.strokeStyle = '#1b2638'; ctx.lineWidth = 1;
  for(let x=0;x<800;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,560);ctx.stroke();}
  for(let y=0;y<560;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(800,y);ctx.stroke();}
  for(const brick of game.bricks) if(brick.alive){ctx.fillStyle=colors[brick.row];ctx.beginPath();ctx.roundRect(brick.x,brick.y,brick.w,brick.h,4);ctx.fill();}
  const p=game.paddle,b=game.ball;
  ctx.shadowBlur=16;ctx.shadowColor='#93b4ff';ctx.fillStyle='#bed3ff';ctx.beginPath();ctx.roundRect(p.x,p.y,p.w,p.h,7);ctx.fill();
  ctx.shadowColor='#e7faff';ctx.fillStyle='#f4ffff';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
}
function resize() { const dpr=Math.min(window.devicePixelRatio||1,3);const width=canvas.clientWidth;canvas.width=Math.round(width*dpr);canvas.height=Math.round(width*.7*dpr);ctx.setTransform(canvas.width/800,0,0,canvas.height/560,0,0);draw(); }
new ResizeObserver(resize).observe(canvas);
function pointer(event) { const rect=canvas.getBoundingClientRect();game.move((event.clientX-rect.left)*800/rect.width); }
canvas.addEventListener('pointerdown', event => {unlockAudio();canvas.focus({preventScroll:true});canvas.setPointerCapture(event.pointerId);pointer(event);});
canvas.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'||canvas.hasPointerCapture(event.pointerId))pointer(event);});
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  const key=event.key.toLowerCase();
  if(['arrowleft','arrowright','a','d'].includes(key)){event.preventDefault();keys.add(key);}
  if(event.code==='Space' && !event.target.closest('button,a')){event.preventDefault();if(!event.repeat)action();}
});
document.addEventListener('keyup',event=>keys.delete(event.key.toLowerCase()));
function suspend(){keys.clear();if(game.state==='playing'){game.state='paused';renderUI();}}
window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
let previous=0,lastState='';
function frame(now){const dt=Math.min((now-previous)/1000,.04);previous=now;const direction=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a'));game.update(dt,direction);const state=[game.state,game.score,game.level,game.lives].join();if(state!==lastState){renderUI();lastState=state;}draw();requestAnimationFrame(frame);}
renderUI();requestAnimationFrame(frame);
