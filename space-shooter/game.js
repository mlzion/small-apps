(() => {
  'use strict';
  const E=window.Galactix,$=s=>document.querySelector(s),canvas=$('canvas'),ctx=canvas.getContext('2d');
  const audio=window.GalactixAudio?.create();
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
    $('#level').textContent=String(world.level).padStart(2,'0')+' / '+E.LEVELS.length;
    $('#score').textContent=format(totalScore+world.score);$('#lives').textContent='◆ '.repeat(world.lives).trim()||'—';
    $('#shield').textContent=world.shield?'SHIELD ONLINE':'SHIELD OFFLINE';$('#shield').classList.toggle('active',world.shield);
    pause.disabled=mode==='menu'||mode==='cleared'||mode==='lost';pause.textContent=mode==='paused'?'▶':'Ⅱ';pause.setAttribute('aria-label',mode==='paused'?'Resume game':'Pause game');
    $('#controls').inert=!active();
    $('#weapons').textContent=[world.effects.rapid>0?'RAPID '+Math.ceil(world.effects.rapid)+'s':'',world.effects.spread>0?'SPREAD '+Math.ceil(world.effects.spread)+'s':''].filter(Boolean).join(' · ');
  }
  function panel(title,detail,label,action){
    clearInput();menu.hidden=false;$('#menu-title').textContent=title;$('#menu-detail').textContent=detail;$('#menu-label').textContent=label;$('#action').textContent=action;
    $('#restart').hidden=mode!=='paused';$('#level-picker').hidden=mode==='paused';
    hud();if(!orientation.matches)$('#action').focus({preventScroll:true});
  }
  function start(level){
    clearInput();world=E.create(level);mode='playing';menu.hidden=true;previous=0;accumulator=0;
    $('#notice').textContent='Sector '+String(level).padStart(2,'0')+' · clear the formation';noticeUntil=2.8;audio?.beginSector(level);hud();
    pause.focus({preventScroll:true});
    // Native orientation locking is optional; the overlay is the reliable fallback.
    try{screen.orientation?.lock?.('portrait')?.catch(()=>{});}catch{}
  }
  function finish(){
    mode=world.state==='cleared'?'cleared':'lost';audio?.setGameplay(false,world.level);
    const score=totalScore+world.score;
    if(score>best){best=score;try{localStorage.setItem('galactix.best.v01',String(best));}catch{}$('#best').textContent='BEST '+format(best);}
    $('#level-select').value=world.level;
    if(mode==='lost')panel('Signal lost','Score '+format(score)+' · retry this sector with a fresh hull.','FLIGHT ENDED','Retry sector →');
    else if(world.level===E.LEVELS.length)panel('Welcome home.','All '+E.LEVELS.length+' sectors cleared · score '+format(score),'MISSION COMPLETE','Fly again →');
    else panel('Sector clear.','Score '+format(score)+' · fresh hull in the next sector.','SECTOR '+String(world.level).padStart(2,'0')+' / '+E.LEVELS.length,'Next sector →');
  }
  function suspend(){audio?.stop();if(mode==='playing'){mode='paused';panel('Flight paused','Take a breath. Your sector is right here.','FLIGHT ON HOLD','Resume flight →');}clearInput();previous=0;accumulator=0;hud();}
  function resume(){if(orientation.matches)return;audio?.unlock();audio?.setGameplay(true,world.level);mode='playing';menu.hidden=true;previous=0;accumulator=0;hud();pause.focus({preventScroll:true});}
  $('#action').onclick=()=>{
    if(orientation.matches)return;
    if(mode==='paused')resume();
    else if(mode==='cleared'&&world.level<E.LEVELS.length){totalScore+=world.score;start(world.level+1);}
    else{if(mode==='menu'||world.level===E.LEVELS.length&&mode==='cleared')totalScore=0;start(mode==='cleared'?1:Number($('#level-select').value));}
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
    E.move(world,world.target.x+(e.clientX-drag.x)*sensitivity,world.target.y+(e.clientY-drag.y)*sensitivity,'drag');
    drag.x=e.clientX;drag.y=e.clientY;showFinger(e);
  });
  function releaseDrag(e){if(drag?.id!==e.pointerId)return;drag=null;pad.classList.remove('active');if(pad.hasPointerCapture(e.pointerId))pad.releasePointerCapture(e.pointerId);}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,releaseDrag);
  fire.addEventListener('pointerdown',e=>{if(!active()||firePointer!==null||e.button!==0)return;e.preventDefault();audio?.unlock();firePointer=e.pointerId;fire.setPointerCapture(e.pointerId);fire.classList.add('active');});
  function releaseFire(e){if(e.pointerId!==firePointer)return;firePointer=null;fire.classList.remove('active');if(fire.hasPointerCapture(e.pointerId))fire.releasePointerCapture(e.pointerId);}
  for(const event of ['pointerup','pointercancel','lostpointercapture'])fire.addEventListener(event,releaseFire);
  for(const el of [pad,fire])el.addEventListener('contextmenu',e=>e.preventDefault());
  const movement=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyA','KeyD','KeyW','KeyS','Space'];
  window.addEventListener('keydown',e=>{
    if(e.target.matches('select,input')||orientation.matches)return;
    if(e.code==='KeyP'&&!e.repeat){if(mode==='playing')suspend();else if(mode==='paused')resume();return;}
    if(active()&&movement.includes(e.code)){audio?.unlock();e.preventDefault();keys.add(e.code);if(e.code==='Space')fire.classList.add('active');}
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&firePointer===null)fire.classList.remove('active');});
  window.addEventListener('blur',suspend);document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();});
  window.addEventListener('pagehide',()=>{audio?.stop();clearInput();try{screen.orientation?.unlock?.();}catch{}});
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
    const style=window.GalactixAppearance.weaponStyle(world.effects,world.time);
    ctx.save();ctx.translate(x,y);if(style.color){ctx.shadowColor=style.color;ctx.shadowBlur=8;}ctx.scale(.55,.55);ctx.translate(-40,-42);
    polygon([[40,7],[66,68],[40,57],[14,68]],style.hull);polygon([[40,7],[40,57],[14,68]],style.shade);
    polygon([[31,64],[40,79+Math.sin(world.time*30)*4],[49,64]],'#648ef5');polygon([[40,30],[47,48],[33,48]],'#d9e5fa');ctx.restore();
  }
  function drawPickup(p){
    const color={shield:'#70e79c',rapid:'#ffda63',spread:'#75acff'}[p.kind];
    ctx.save();ctx.translate(p.x,p.y+Math.sin(p.age*5)*2);ctx.shadowColor=color;ctx.shadowBlur=9;
    ctx.fillStyle='#102136';ctx.strokeStyle=color;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,15+Math.sin(p.age*5)*.6,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle=color;ctx.lineJoin='round';ctx.lineCap='round';
    if(p.kind==='shield'){
      polygon([[0,-9],[8,-6],[7,3],[0,9],[-7,3],[-8,-6]],color);
      polygon([[0,-6],[5,-4],[4,2],[0,6]],'#245b40');
    }else if(p.kind==='rapid')polygon([[1,-10],[-7,2],[-1,2],[-3,11],[8,-3],[2,-3],[5,-10]],color);
    else{ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-7,-8);ctx.lineTo(0,8);ctx.lineTo(7,-8);ctx.stroke();}
    ctx.restore();
  }
  function drawAttack(e){
    const g=e.group,target=g.target||world.player;
    if(e.pattern==='file'&&e.fileIndex!==0)return;
    ctx.save();ctx.strokeStyle=e.pattern==='kamikaze'?'#ff998a':e.pattern==='file'?'#81e0d4':'#e4b1f3';
    ctx.globalAlpha=e.mode==='telegraph'?.42:.2;ctx.lineWidth=1;ctx.setLineDash([3,7]);
    ctx.beginPath();
    if(e.pattern==='file'){
      const path={...g,target};
      for(let i=0;i<=40;i++){const p=window.GalactixAttacks.filePoint(path,i/40);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}
    }else{const origin=e.pattern==='kamikaze'?(e.origin||{x:e.x,y:Math.min(e.y,105)}):e;ctx.moveTo(origin.x,origin.y);ctx.lineTo(target.x,target.y);}
    ctx.stroke();
    ctx.setLineDash([]);ctx.beginPath();ctx.arc(target.x,target.y,12,0,Math.PI*2);ctx.moveTo(target.x-17,target.y);ctx.lineTo(target.x+17,target.y);ctx.moveTo(target.x,target.y-17);ctx.lineTo(target.x,target.y+17);ctx.stroke();
    if(e.pattern==='file'){for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(g.origin.x,g.origin.y+i*10,2,0,Math.PI*2);ctx.stroke();}}
    ctx.restore();
  }
  function render(){
    ctx.save();const dpr=Math.min(devicePixelRatio||1,2);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#080e1b';ctx.fillRect(0,0,fieldWidth,fieldHeight);
    ctx.translate(offsetX,offsetY);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,E.W,E.H);ctx.clip();
    for(const s of stars){ctx.fillStyle=s.z===3?'#7485a8':'#344465';ctx.fillRect(s.x,(s.y+world.time*(9+s.z*10))%E.H,s.z===3?1.8:1,s.z===3?2.5:1.5);}
    for(const e of world.enemies){
      ctx.save();ctx.translate(e.x,e.y);if(e.mode==='dive')ctx.rotate(Math.sin(e.age*2.8)*.25);
      if(e.boss){
        polygon([[-24,-6],[-16,-15],[-8,-9],[0,-19],[8,-9],[16,-15],[24,-6],[20,9],[8,7],[0,15],[-8,7],[-20,9]],e.rank>=4?'#dc9fd6':'#dbbc8d');
        polygon([[-24,-6],[-8,-9],[0,-19],[0,15],[-8,7],[-20,9]],e.rank>=4?'#825c95':'#816850');
        polygon([[-7,-3],[0,-11],[7,-3],[0,8]],'#e8ecff');
        if(e.rank>=2){ctx.strokeStyle='#fff0c3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-18,-7);ctx.lineTo(-13,4);ctx.moveTo(18,-7);ctx.lineTo(13,4);ctx.stroke();}
        if(e.rank>=3){polygon([[-9,-8],[0,-15],[9,-8],[0,-4]],'#b8a3cd');}
        if(e.rank>=4){polygon([[-22,0],[-12,-2],[-16,7]],'#f0b5cf');polygon([[22,0],[12,-2],[16,7]],'#f0b5cf');}
        if(e.rank>=5){ctx.fillStyle='#bce7ff';ctx.fillRect(-14,-11,3,3);ctx.fillRect(11,-11,3,3);}
        if(e.rank>=6){ctx.strokeStyle='#bce7ff';ctx.beginPath();ctx.moveTo(-19,-12);ctx.lineTo(-19,-20);ctx.moveTo(19,-12);ctx.lineTo(19,-20);ctx.stroke();}
      }else if(e.type===3){
        polygon([[-18,-3],[-11,-12],[-6,-4],[0,-14],[6,-4],[11,-12],[18,-3],[9,10],[0,4],[-9,10]],'#81d6cc');
        polygon([[-11,-12],[-6,-4],[0,-14],[0,4],[-9,10]],'#397d80');
      }else{
        const tint=e.type===2?'#b4a4d9':'#829ac7';polygon([[-16,-9],[-7,-3],[0,-11],[7,-3],[16,-9],[10,10],[0,5],[-10,10]],tint);
        polygon([[-7,-3],[0,-11],[0,5],[-10,10]],e.type===2?'#665889':'#425c88');
      }
      ctx.fillStyle=e.hp===2?'#f2e0ff':'#d4e2fc';ctx.fillRect(-3,-1,6,3);ctx.restore();
      if(e.boss){ctx.fillStyle='#32263a';ctx.fillRect(e.x-22,e.y-28,44,4);ctx.fillStyle=e.hp/e.maxHp<.3?'#ff969d':'#edc7ef';ctx.fillRect(e.x-22,e.y-28,44*e.hp/e.maxHp,4);}
      if(e.pattern&&['telegraph','dive'].includes(e.mode))drawAttack(e);
      if(e.mode==='telegraph'){
        ctx.save();ctx.strokeStyle=e.pattern==='kamikaze'?'#ff998a':e.pattern==='file'?'#81e0d4':e.boss?'#e4b1f3':'#f2c778';ctx.lineWidth=1.5;ctx.globalAlpha=.6+.3*Math.sin(e.age*18);
        ctx.beginPath();ctx.arc(e.x,e.y,(e.boss?30:21)+Math.min(e.age,1.05)*4,0,Math.PI*2);ctx.stroke();
        if(e.curved&&!e.pattern){ctx.globalAlpha=.22;ctx.setLineDash([4,9]);ctx.beginPath();ctx.moveTo(e.lane,250);ctx.lineTo(e.lane,460);ctx.stroke();}
        ctx.restore();
      }
    }
    ctx.fillStyle='#9dbbff';for(const s of world.shots)ctx.fillRect(s.x-1.5,s.y-8,3,12);
    for(const pickup of world.pickups)drawPickup(pickup);
    if(world.lives&&(world.invulnerable===0||Math.floor(world.time*12)%2===0))ship(world.player.x,world.player.y);
    if(world.shield){ctx.strokeStyle='#8eb3ff';ctx.lineWidth=1;ctx.beginPath();ctx.arc(world.player.x,world.player.y,23,0,Math.PI*2);ctx.stroke();}
    // Hostile shots stay above weapon glows and the shield ring.
    ctx.fillStyle='#e9a5a1';for(const b of world.bullets)ctx.fillRect(b.x-2,b.y-3,4,9);
    for(const p of world.particles){ctx.globalAlpha=Math.max(0,p.life/.65);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2,2);}ctx.restore();
  }
  function frame(now){
    requestAnimationFrame(frame);audio?.setGameplay(active(),world.level);
    if(!previous)previous=now;
    if(active()){
      accumulator+=Math.min((now-previous)/1000,.1);
      const dx=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
      const dy=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
      while(accumulator>=1/120&&active()){
        E.step(world,1/120,{dx,dy,fire:firePointer!==null||keys.has('Space')});audio?.play(world.cues);accumulator-=1/120;
        if(world.events.length){$('#notice').textContent=world.events.splice(0).at(-1);noticeUntil=world.time+2.5;}
        if(world.state!=='playing')finish();
      }
      if(world.time>noticeUntil)$('#notice').textContent='';hud();
    }
    previous=now;if(!orientation.matches&&!document.hidden)render();
  }
  $('#sound').onclick=()=>{audio?.toggle();audio?.setGameplay(active(),world.level);syncSound();};
  function syncSound(){const on=audio?.enabled||false;$('#sound').textContent=on?'♪ SOUND ON':'♪ SOUND OFF';$('#sound').setAttribute('aria-pressed',String(on));}
  syncSound();syncOrientation();hud();requestAnimationFrame(frame);
})();
