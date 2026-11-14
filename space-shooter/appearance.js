/* Pure presentation helpers; visual feedback never changes simulation state. */
(function(root){
  'use strict';
  function mix(a,b,t){
    const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
    const x=rgb(a),y=rgb(b);
    return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');
  }
  function weaponStyle(effects,time){
    const visible=t=>t>0&&(t>2||Math.floor((2-t)*6)%2===0);
    const rapid=visible(effects.rapid),spread=visible(effects.spread);
    const color=rapid&&spread?mix('#ffda63','#75acff',(Math.sin(time*5)+1)/2):rapid?'#ffda63':spread?'#75acff':null;
    return {rapid,spread,color,hull:color?mix('#9eb6dc',color,.42):'#9eb6dc',shade:color?mix('#526b92',color,.25):'#526b92'};
  }
  const api={weaponStyle};
  if(typeof module!=='undefined')module.exports=api;else root.GalactixAppearance=api;
})(typeof globalThis!=='undefined'?globalThis:this);
