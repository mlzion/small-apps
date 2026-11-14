// Original artwork. Shared vertices make every seam exact; coordinates are SVG units.
export const turtle = { id: 'sea-turtle-v1', title: 'Sea Turtle', width: 720, height: 480, trayRows: 1 };
const ring = [[340,130],[400,70],[470,80],[500,130],[460,170],[570,180],[600,260],[530,240],[470,290],[510,370],[460,400],[350,350],[290,400],[240,290],[140,310],[170,240],[240,180],[150,140],[190,90]];
const cuts = [1,3,5,6,9,10,12,14,17,18];
const coast = [[340,0],[600,0],[720,120],[720,300],[650,480],[460,480],[240,480],[0,380],[0,130],[140,0]];
const corners = {1:[[720,0]],3:[[720,480]],6:[[0,480]],8:[[0,0]]};
const colors = ['#47dbd5','#1db4cd','#138eae','#247fb9','#16558d','#3289be','#31bac6','#4bd6bf','#17a9b9','#8be5d0'];
let regions = cuts.map((start,i) => {
  const end=cuts[(i+1)%cuts.length], inner=[];
  for(let n=start;;n=(n+1)%ring.length) { inner.push(ring[n]); if(n===end) break; }
  return {id:`water-${i+1}`, name:`Ocean glass ${i+1}`, color:colors[i], points:[coast[i],...(corners[i]||[]),coast[(i+1)%coast.length],...inner.reverse()]};
});
const [B,H1,H2,H3,C,R1,R2,R3,D,L1,L2,E,T,F,W1,W2,A,U1,U2]=ring;
const add=(id,name,color,points)=>regions.push({id,name,color,points});
add('head','Turtle head','#b6d76b',[B,H1,H2,H3,C]);
add('front-right','Right front flipper','#45af77',[C,R1,R2,R3,D]);
add('rear-right','Right rear flipper','#78bf77',[D,L1,L2,E]);
add('tail','Turtle tail','#e0c97d',[E,T,F]);
add('rear-left','Left rear flipper','#74c989',[F,W1,W2,A]);
add('front-left','Left front flipper','#9bd77c',[A,U1,U2,B]);
const a=[300,205],b=[365,185],c=[415,215],d=[410,275],e=[350,300],f=[295,270];
add('shell-center','Heart of the shell','#f3c66a',[a,b,c,d,e,f]);
[[A,B,b,a],[B,C,c,b],[C,D,d,c],[D,E,e,d],[E,F,f,e],[F,A,a,f]].forEach((points,i)=>add(`shell-${i+1}`,`Shell glass ${i+1}`,['#36896f','#78ae55','#2b9a7a','#39806c','#afbd57','#68b17b'][i],points));
export const pieces=regions.map(p=>{
 const xs=p.points.map(v=>v[0]),ys=p.points.map(v=>v[1]);
 const bounds={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
 return {...p,bounds,cx:bounds.x+bounds.width/2,cy:bounds.y+bounds.height/2,path:`M${p.points.map(v=>v.join(',')).join('L')}Z`,detail:p.id==='head'?'<circle cx="466" cy="106" r="7" fill="#143d48"/><circle cx="468" cy="104" r="2" fill="#fff"/>':''};
});
