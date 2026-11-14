/* Pure presentation helpers; no simulation mutations or random numbers. */
(function(root){
  'use strict';
  const Weapon=typeof module!=='undefined'?require('./weapons.js'):root.GalactixWeapons;
  function mix(a,b,t){
    const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),x=rgb(a),y=rgb(b);
    return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
  }
  function weaponStyle(weapon){
    const def=Weapon.DEFS[weapon.kind],visible=weapon.kind!=='normal'&&(weapon.charges>0||(weapon.remaining>0&&(weapon.remaining>2||Math.floor((2-weapon.remaining)*6)%2===0)));
    const color=visible?def.color:null;
    return {color,hull:color?mix('#9eb6dc',color,.42):'#9eb6dc',shade:color?mix('#526b92',color,.25):'#526b92'};
  }
  const bossColors=['#dbbc8d','#e1aa86','#c7a4e4','#dc9fd6','#e3a9ba','#9cc7e8','#a6d7c4','#ecb5f5'];
  function bossStyle(e,time){
    const ratio=e.hp/e.maxHp,flash=e.hitFlash>0||(ratio<.3&&Math.floor(time*8)%2===0);
    return {color:flash?'#fff0dc':bossColors[e.rank-1],shade:mix(bossColors[e.rank-1],'#27364e',.5),sparks:ratio<.3?6:ratio<.66?3:0};
  }
  const api={weaponStyle,bossStyle};if(typeof module!=='undefined')module.exports=api;else root.GalactixAppearance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
