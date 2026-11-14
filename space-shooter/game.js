(() => {
  'use strict';
  const E=window.Galactix,$=s=>document.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const surface=$('#game'),menu=$('#menu'),pad=$('#drag-pad'),fire=$('#fire'),pause=$('#pause');
  const orientation=matchMedia('(orientation: landscape)'),overlay=$('#orientation-overlay');
  let world=E.create(),mode='menu',totalScore=0,best=0,drag=null,firePointer=null,keys=new Set(),previous=0,accumulator=0,noticeUntil=0;
  let fieldWidth=0,fieldHeight=0,scale=1,offsetX=0,offsetY=0;
  try{best=Number(localStorage.getItem('galactix.best.v01'))||0;}catch{/* Storage is optional. */}
  const format=n=>String(n).padStart(5,'0');
  $('#best').textContent='BEST '+format(best);
  E.LEVELS.forEach(l=>{const option=document.createElement('option');option.value=l.number;option.textContent='Sector '+String(l.number).padStart(2,'0');$('#level-select').append(option);});
  function clearInput(){
    if(drag&&pad.hasPointerCapture(drag.id))pad.releasePointerCapture(drag.id);
    if(firePointer!==null&&fire.hasPointerCapture(firePointer))fire.releasePointerCapture(firePointer);
    drag=null;firePointer=null;keys.clear();pad.classList.remove('active');fire.classList.remove('active');
    E.move(world,world.player.x,world.player.y);
  }
  function active(){return mode==='playing'&&!orientation.matches&&!document.hidden;}
  function hud(){
    $('#level').textContent=String(world.level).padStart(2,'0')+' / 10';
    $('#score').textContent=format(totalScore+world.score);$('#lives').textContent='◆ '.repeat(world.lives).trim()||'—';
    $('#shield').textContent=world.shield?'SHIELD ONLINE':'SHIELD OFFLINE';$('#shield').classList.toggle('active',world.shield);
    pause.disabled=mode==='menu'||mode==='cleared'||mode==='lost';pause.textContent=mode==='paused'?'▶':'Ⅱ';pause.setAttribute('aria-label',mode==='paused'?'Resume game':'Pause game');
    $('#controls').inert=!active();
  }
  function panel(title,detail,label,action){
    clearInput();menu.hidden=false;$('#menu-title').textContent=title;$('#menu-detail').textContent=detail;$('#menu-label').textContent=label;$('#action').textContent=action;
    $('#restart').hidden=mode!=='paused';$('#level-picker').hidden=mode==='paused';
    hud();if(!orientation.matches)$('#action').focus({preventScroll:true});
  }
  function start(level){
    clearInput();world=E.create(level);mode='playing';menu.hidden=true;previous=0;accumulator=0;
    $('#notice').textContent='Sector '+String(level).padStart(2,'0')+' · clear the formation';noticeUntil=2.8;hud();
    pause.focus({preventScroll:true});
    // Native orientation locking is optional; the overlay is the reliable fallback.
    try{screen.orientation?.lock?.('portrait')?.catch(()=>{});}catch{}
  }
  function finish(){
    mode=world.state==='cleared'?'cleared':'lost';
    const score=totalScore+world.score;
    if(score>best){best=score;try{localStorage.setItem('galactix.best.v01',String(best));}catch{}$('#best').textContent='BEST '+format(best);}
    $('#level-select').value=world.level;
    if(mode==='lost')panel('Signal lost','Score '+format(score)+' · retry this sector with a fresh hull.','FLIGHT ENDED','Retry sector →');
    else if(world.level===10)panel('Welcome home.','All ten sectors cleared · score '+format(score),'MISSION COMPLETE','Fly again →');
    else panel('Sector clear.','Score '+format(score)+' · fresh hull in the next sector.','SECTOR '+String(world.level).padStart(2,'0')+' / 10','Next sector →');
  }
  function suspend(){if(mode==='playing'){mode='paused';panel('Flight paused','Take a breath. Your sector is right here.','FLIGHT ON HOLD','Resume flight →');}clearInput();previous=0;accumulator=0;hud();}
  function resume(){if(orientation.matches)return;mode='playing';menu.hidden=true;previous=0;accumulator=0;hud();pause.focus({preventScroll:true});}
  $('#action').onclick=()=>{
    if(orientation.matches)return;
    if(mode==='paused')resume();
    else if(mode==='cleared'&&world.level<10){totalScore+=world.score;start(world.level+1);}
    else{if(mode==='menu'||world.level===10&&mode==='cleared')totalScore=0;start(mode==='cleared'?1:Number($('#level-select').value));}
  };
  $('#restart').onclick=()=>start(world.level);
  $('#level-select').onchange=()=>{
    mode='menu';totalScore=0;world=E.create(Number($('#level-select').value));
    panel('Sector '+String(world.level).padStart(2,'0'),'A fresh test run starts here. Clear the formation to continue.','TEST FLIGHT','Launch sector '+String(world.level).padStart(2,'0')+' →');
  };
  pause.onclick=()=>{if(mode==='paused')resume();else suspend();};
  pad.addEventListener('pointerdown',e=>{if(!active()||drag||e.button!==0)return;e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY};pad.setPointerCapture(e.pointerId);pad.classList.add('active');showFinger(e);});
  function showFinger(e){const r=pad.getBoundingClientRect();const dot=pad.querySelector('i');dot.style.left=(e.clientX-r.left)+'px';dot.style.top=(e.clientY-r.top)+'px';}
  pad.addEventListener('pointermove',e=>{
    if(!active()||!drag||drag.id!==e.pointerId)return;
    const sensitivity=E.W/pad.clientWidth*1.2;
    E.move(world,world.target.x+(e.clientX-drag.x)*sensitivity,world.target.y+(e.clientY-drag.y)*sensitivity);
    drag.x=e.clientX;drag.y=e.clientY;showFinger(e);
  });
  function releaseDrag(e){if(drag?.id!==e.pointerId)return;drag=null;pad.classList.remove('active');if(pad.hasPointerCapture(e.pointerId))pad.releasePointerCapture(e.pointerId);}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,releaseDrag);
  fire.addEventListener('pointerdown',e=>{if(!active()||firePointer!==null||e.button!==0)return;e.preventDefault();firePointer=e.pointerId;fire.setPointerCapture(e.pointerId);fire.classList.add('active');});
  function releaseFire(e){if(e.pointerId!==firePointer)return;firePointer=null;fire.classList.remove('active');if(fire.hasPointerCapture(e.pointerId))fire.releasePointerCapture(e.pointerId);}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])fire.addEventListener(event,releaseFire);
  for(const el of [pad,fire])el.addEventListener('contextmenu',e=>e.preventDefault());
  const movement=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'];
  window.addEventListener('keydown',e=>{
    if(e.target.matches('select,input')||orientation.matches)return;
    if(e.code==='KeyP'&&!e.repeat){if(mode==='playing')suspend();else if(mode==='paused')resume();return;}
    if(active()&&movement.includes(e.code)){e.preventDefault();keys.add(e.code);if(e.code==='Space')fire.classList.add('active');}
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&firePointer===null)fire.classList.remove('active');});
  window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  window.addEventListener('pagehide',()=>{clearInput();try{screen.orientation?.unlock?.();}catch{}});
  function syncOrientation(){
    if(orientation.matches)suspend();else clearInput();
    overlay.hidden=!orientation.matches;surface.inert=orientation.matches;
    previous=0;accumulator=0;resize();hud();
    if(orientation.matches)overlay.focus({preventScroll:true});
  }
  orientation.addEventListener('change',syncOrientation);
  function resize(){
    const r=canvas.getBoundingClientRect();if(!r.width||!r.height)return;
    fieldWidth=r.width;fieldHeight=r.height;const dpr=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);
    scale=Math.min(r.width/E.W,r.height/E.H);offsetX=(r.width-E.W*scale)/2;offsetY=(r.height-E.H*scale)/2;
  }
  new ResizeObserver(resize).observe($('#field'));
  window.addEventListener('resize',()=>{clearInput();resize();});
  const stars=Array.from({length:65},(_,i)=>({x:(i*137.51)%E.W,y:(i*97.3)%E.H,z:1+i%3}));
  function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  function ship(x,y){
    ctx.save();ctx.translate(x,y);ctx.scale(.55,.55);ctx.translate(-40,-42);
    polygon([[40,7],[66,68],[40,57],[14,68]],'#9eb6dc');polygon([[40,7],[40,57],[14,68]],'#526b92');
    polygon([[31,64],[40,79+Math.sin(world.time*30)*4],[49,64]],'#648ef5');polygon([[40,30],[47,48],[33,48]],'#d9e5fa');ctx.restore();
  }
  function render(){
    ctx.save();const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#080e1b';ctx.fillRect(0,0,fieldWidth,fieldHeight);
    ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,E.W,E.H);ctx.clip();
    for(const s of stars){ctx.fillStyle=s.z===3?'#7485a8':'#344465';ctx.fillRect(s.x,(s.y+world.time*(9+s.z*10))%E.H,s.z===3?1.8:1,s.z===3?2.5:1.5);}
    for(const e of world.enemies){
      ctx.save();ctx.translate(e.x,e.y);if(e.mode==='dive')ctx.rotate(Math.sin(e.age*2.8)*.25);
      const tint=e.armored?'#b4a4d9':'#829ac7';polygon([[-16,-9],[-7,-3],[0,-11],[7,-3],[16,-9],[10,10],[0,5],[-10,10]],tint);
      polygon([[-7,-3],[0,-11],[0,5],[-10,10]],e.armored?'#665889':'#425c88');
      ctx.fillStyle=e.hp===2?'#f2e0ff':'#d4e2fc';ctx.fillRect(-3,-1,6,3);ctx.restore();
    }
    ctx.fillStyle='#9dbbff';for(const s of world.shots)ctx.fillRect(s.x-1.5,s.y-8,3,12);
    ctx.fillStyle='#e9a5a1';for(const b of world.bullets)ctx.fillRect(b.x-2,b.y-3,4,9);
    if(world.pickup){const p=world.pickup;ctx.strokeStyle='#9bbfff';ctx.lineWidth=1.5;ctx.strokeRect(p.x-9,p.y-9,18,18);ctx.fillStyle='#b5ceff';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText('S',p.x,p.y+4);}
    if(world.lives&&(world.invulnerable===0||Math.floor(world.time*12)%2===0))ship(world.player.x,world.player.y);
    if(world.shield){ctx.strokeStyle='#8eb3ff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(world.player.x,world.player.y,23,0,Math.PI*2);ctx.stroke();}
    for(const p of world.particles){ctx.globalAlpha=Math.max(0,p.life/.65);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2,2);}ctx.restore();
  }
  function frame(now){
    requestAnimationFrame(frame);
    if(!previous)previous=now;
    if(active()){
      accumulator+=Math.min((now-previous)/1000,.1);
      const dx=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
      const dy=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
      while(accumulator>=1/120&&active()){
        E.step(world,1/120,{dx,dy,fire:firePointer!==null||keys.has('Space')});accumulator-=1/120;
        if(world.events.length){$('#notice').textContent=world.events.splice(0).at(-1);noticeUntil=world.time+2.5;}
        if(world.state!=='playing')finish();
      }
      if(world.time>noticeUntil)$('#notice').textContent='';hud();
    }
    previous=now;if(!orientation.matches&&!document.hidden)render();
  }
  syncOrientation();hud();requestAnimationFrame(frame);
})();
