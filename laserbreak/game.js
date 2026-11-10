/* Canvas view and Pointer Events adapter for the standalone test bed. */
'use strict';
const {World,Input,W,H,defaults}=LaserBreak;
const world=new World();
function seedField() {
  for(let n=0;n<3;n++) {
    world.spawn();
    world.objects[world.objects.length-1].y=20+Math.random()*40;
  }
}
seedField();
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const arena=document.querySelector('#arena'),status=document.querySelector('#status');
const pads={left:document.querySelector('#left-pad'),right:document.querySelector('#right-pad')};
const setup=document.querySelector('#setup'),toggle=document.querySelector('#setup-toggle');
const input=new Input((a,b)=>world.fire(a,b),()=>world.ready(),()=>world.settings.mode);
const controls=[
  ['cooldown','Laser cooldown',0,2,.05,'s'],['targetSize','Target radius',6,35,1,'px'],
  ['targetSpeed','Target falling speed',0,180,5,'px/s'],['barLength','Bar length',30,220,5,'px'],
  ['barThickness','Bar thickness',3,30,1,'px'],['barSpeed','Bar falling speed',0,180,5,'px/s'],
  ['barRotation','Bar rotation speed',-240,240,5,'°/s'],['density','Object density',0,100,1,'%']
];
for(const [key,label,min,max,step,unit] of controls) {
  const row=document.createElement('div');
  row.innerHTML=`<label class="slider-label" for="${key}">${label}<output id="${key}-value" for="${key}"></output></label><input id="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
  document.querySelector('#sliders').append(row);
  row.querySelector('input').addEventListener('input',event=>{world.configure(key,Number(event.target.value));sync();});
  row.dataset.unit=unit;
}
function sync() {
  for(const [key,,,,,unit] of controls) {
    document.getElementById(key).value=world.settings[key];
    document.getElementById(`${key}-value`).value=`${world.settings[key]}${unit}`;
  }
  document.querySelector('#mode').value=world.settings.mode;
  document.querySelector('#debug').checked=world.settings.debug;
  document.querySelector('#pause').textContent=world.paused?'Resume':'Pause';
  document.querySelector('#hint').textContent=world.settings.mode==='touch'?'Touch both pads to fire · release both to re-arm':'Hold both pads · slide to aim · release to fire';
}
function panel(open) {setup.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open)cancelInput();}
toggle.onclick=()=>panel(setup.hidden);
document.querySelector('#close-setup').onclick=()=>{panel(false);toggle.focus();};
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&!setup.hidden){panel(false);toggle.focus();}});
document.querySelector('#mode').onchange=e=>{world.configure('mode',e.target.value);cancelInput();sync();};
document.querySelector('#debug').onchange=e=>world.configure('debug',e.target.checked);
document.querySelector('#pause').onclick=()=>{world.paused=!world.paused;cancelInput();sync();};
document.querySelector('#clear').onclick=()=>{world.clear();cancelInput();};
document.querySelector('#reset').onclick=()=>{world.clear();world.settings={...defaults};world.lastShot=-Infinity;world.paused=false;seedField();cancelInput();sync();};
function cancelInput() {
  for(const id of input.points.keys())for(const pad of Object.values(pads))if(typeof id==='number'&&pad.hasPointerCapture(id))pad.releasePointerCapture(id);
  input.reset();
}
function pointerY(e) {const box=canvas.getBoundingClientRect();return (e.clientY-box.top)/box.height*H;}
for(const [side,pad] of Object.entries(pads)) {
  pad.addEventListener('pointerdown',e=>{
    if(e.button!==0||world.paused)return;
    e.preventDefault();pad.setPointerCapture(e.pointerId);input.down(e.pointerId,side,pointerY(e));
  });
  pad.addEventListener('pointermove',e=>{e.preventDefault();input.move(e.pointerId,pointerY(e));});
  pad.addEventListener('pointerup',e=>{e.preventDefault();input.up(e.pointerId);});
  for(const type of ['pointercancel','lostpointercapture'])pad.addEventListener(type,e=>input.up(e.pointerId,true));
  pad.addEventListener('contextmenu',e=>e.preventDefault());
}
// Desktop fallback uses the same input state machine, with a virtual opposite pointer.
document.addEventListener('keydown',e=>{
  if(e.code!=='Space'||e.repeat||!setup.hidden||!input.points.size)return;
  e.preventDefault();const p=[...input.points.values()][0];input.down('keyboard',p.side==='left'?'right':'left',p.y);
});
document.addEventListener('keyup',e=>{if(e.code==='Space')input.up('keyboard');});
function suspend(){world.paused=true;cancelInput();sync();}
window.addEventListener('blur',suspend);
document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
window.addEventListener('resize',cancelInput);
function resize() {
  const box=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,3);
  const w=Math.round(box.width*dpr),h=Math.round(box.height*dpr);
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
}
function line(a,b,color,width=1) {ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
function ring(x,y,r,color) {ctx.strokeStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();}
function beam(p,alpha=1) {
  if(!p.position)return;
  ctx.globalAlpha=alpha;ctx.shadowColor='#9afff6';ctx.shadowBlur=12;
  line(p.from,p.position,'#65f5ef',2);ctx.shadowBlur=0;
  if(!p.done)ring(p.position.x,p.position.y,3,'#fff');ctx.globalAlpha=1;
}
function draw() {
  resize();ctx.clearRect(0,0,W,H);
  ctx.lineWidth=.6;
  for(let x=0;x<=W;x+=50)line({x,y:0},{x,y:H},'#42637519');
  for(let y=0;y<=H;y+=50)line({x:0,y},{x:W,y},'#42637519');
  const [a,b]=input.pair();
  if(world.settings.mode==='release'&&a&&b&&!input.locked) {
    ctx.setLineDash([5,8]);line({x:0,y:a.y},{x:W,y:b.y},'#a2eee944');ctx.setLineDash([]);
  }
  for(const [side,pad] of Object.entries(pads)) {
    const point=[...input.points.values()].find(p=>p.side===side);
    pad.classList.toggle('active',!!point);if(point)pad.querySelector('i').style.top=`${point.y/H*100}%`;
  }
  for(const o of world.objects) {
    ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);ctx.lineWidth=1.4;
    ctx.shadowColor=o.type==='target'?o.color:'#7299b1';ctx.shadowBlur=8;ctx.strokeStyle=ctx.shadowColor;
    if(o.type==='bar')ctx.strokeRect(-o.length/2,-o.thickness/2,o.length,o.thickness);
    else {ctx.beginPath();const n=o.color==='#65f5ef'?4:6;for(let i=0;i<=n;i++){const t=i/n*Math.PI*2;const x=Math.cos(t)*o.radius,y=Math.sin(t)*o.radius;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
    ctx.restore();
    if(world.settings.debug) {
      ctx.lineWidth=.7;ctx.setLineDash([3,3]);
      if(o.type==='target')ring(o.x,o.y,o.radius,'#ff8bbd');
      else {ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.angle);ctx.strokeStyle='#ff8bbd';ctx.strokeRect(-o.length/2,-o.thickness/2,o.length,o.thickness);ctx.restore();}
      ctx.setLineDash([]);
    }
  }
  for(const shot of world.shots)for(const p of shot.pulses)beam(p);
  for(const e of world.effects) {
    const progress=e.age/e.life;
    if(e.type==='flash'){for(const p of e.pulses)beam(p,1-progress);continue;}
    ctx.globalAlpha=1-progress;ctx.lineWidth=e.type==='explosion'?2:1;const color=e.color||'#b1faff';
    if(e.type==='explosion'){ring(e.x,e.y,e.r*progress,color);if(world.settings.debug)ring(e.x,e.y,e.r,'#ff8bbd');}
    else if(e.type==='dissolve')ring(e.x,e.y,e.r*(1+progress*.6),color);
    for(let i=0;i<8;i++){const t=i*Math.PI/4,r=e.r*progress;line({x:e.x+Math.cos(t)*r,y:e.y+Math.sin(t)*r},{x:e.x+Math.cos(t)*(r+5),y:e.y+Math.sin(t)*(r+5)},color);}
    ctx.globalAlpha=1;
  }
  const cooldown=Math.max(0,world.settings.cooldown-(world.time-world.lastShot));
  status.value=world.paused?'PAUSED':cooldown>0?`COOLDOWN ${cooldown.toFixed(2)}s`:input.locked?'RELEASE BOTH':'READY';
}
let previous;
function frame(now) {if(previous!==undefined)world.step(Math.min((now-previous)/1000,.05));previous=now;draw();requestAnimationFrame(frame);}
sync();requestAnimationFrame(frame);
