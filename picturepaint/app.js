import {drawings} from './catalog.js';
import {Painting,canvas} from './renderer.js';
import {Viewport} from './viewport.js';
import {MAX_PIXELS,readFile,image,download,serialize,parse} from './project.js';
const $=id=>document.getElementById(id),surface=$('surface'),stage=$('stage');
let painting=null,busy=false,dirty=false,outlines=true,mode='solid',title='Untitled',worker=null;
const status=text=>$('status').textContent=text;
const view=new Viewport(stage,surface,(x,y)=>fillAt(x,y),scale=>$('zoom').textContent=`${Math.round(scale*100)}%`);
function settings(){return {threshold:+$('threshold').value,gap:+$('gap').value,outlines};}
function controls(){for(const b of document.querySelectorAll('[data-document]'))b.disabled=!painting||busy;$('undo').disabled=busy||!painting?.undo.length;$('redo').disabled=busy||!painting?.redo.length;for(const id of ['threshold','gap'])$(id).disabled=busy||!!painting?.styles.size;$('outlines').textContent=outlines?'Hide outlines':'Show outlines';$('outlines').setAttribute('aria-pressed',outlines);}
function render(){if(!painting)return;surface.width=painting.layer.width;surface.height=painting.layer.height;surface.getContext('2d').drawImage(painting.composite(outlines),0,0);controls();}
function fillAt(x,y){if(busy||!painting)return;x=Math.floor(x);y=Math.floor(y);if(x<0||y<0||x>=surface.width||y>=surface.height)return;const id=painting.labels[y*surface.width+x],r=painting.regions[id];if(!id){status('That is an outline. Tap inside a shape.');return;}if(r.edge){status('This area reaches the picture edge and may have an open boundary. Try sealing gaps before painting.');return;}
 painting.fill(id,{mode,color1:$('color1').value,color2:$('color2').value,angle:+$('angle').value});dirty=true;render();status('Color added. Undo is always close by.');}
function detect(original,options){return new Promise((resolve,reject)=>{worker=new Worker(new URL('./region-worker.js',import.meta.url));worker.onmessage=({data})=>{worker.terminate();worker=null;data.error?reject(Error(data.error)):resolve(new Painting(original,data.labels,data.regions));};worker.onerror=()=>{worker.terminate();worker=null;reject(Error('Region detection failed. Try a smaller drawing.'));};const pixels=original.getContext('2d').getImageData(0,0,original.width,original.height).data;worker.postMessage({pixels,width:original.width,height:original.height,...options},[pixels.buffer]);});}
async function load(src,name,project=null){if(busy)return;busy=true;controls();status('Finding the shapes…');try{
 const img=await image(src);if(project&&(img.naturalWidth!==project.width||img.naturalHeight!==project.height))throw Error('Project dimensions do not match its drawing.');
 const ratio=Math.min(1,Math.sqrt(MAX_PIXELS/(img.naturalWidth*img.naturalHeight)),4096/Math.max(img.naturalWidth,img.naturalHeight));
 const original=canvas(Math.max(1,Math.floor(img.naturalWidth*ratio)),Math.max(1,Math.floor(img.naturalHeight*ratio))),ctx=original.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,original.width,original.height);ctx.drawImage(img,0,0,original.width,original.height);
 const opts=project||settings(),next=await detect(original,opts);
 if(project)for(const f of project.fills){const id=next.labels[f.seed];if(!id||next.regions[id].edge)throw Error('Project contains a fill outside a closed region.');next.drawRegion(id,f.style);}
 painting=next;title=name;outlines=project?project.outlines:true;if(project){$('threshold').value=project.threshold;$('gap').value=project.gap;updateBoundaryLabels();}dirty=false;$('empty').hidden=true;$('drawing-title').textContent=title;$('dimensions').textContent=`${original.width} × ${original.height}`;render();view.fit(original.width,original.height);status('Ready. Pick a color, then tap a closed shape.');
 }catch(e){status(e.message);}finally{busy=false;controls();}}
function replaceAllowed(){return !dirty||confirm('Replace this painting? Download a project first to keep your edits.');}
for(const d of drawings){const b=document.createElement('button');b.className='drawing-card';const img=document.createElement('img');img.src=d.thumbnail;img.alt=d.title+' line drawing';img.loading='lazy';const name=document.createElement('strong');name.textContent=d.title;const note=document.createElement('small');note.textContent=d.category+' · '+d.description;b.append(img,name,note);b.onclick=()=>{if(!busy&&replaceAllowed()){$('library-dialog').close();load(d.source,d.title);}};$('library-items').append(b);}
$('library').onclick=()=>$('library-dialog').showModal();$('close-library').onclick=()=>$('library-dialog').close();
for(const kind of ['upload','open']){$(kind).onclick=()=>{if(!busy&&replaceAllowed())$(kind+'-file').click();};$(kind+'-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>40*1024*1024)throw Error('Please choose a file smaller than 40 MB.');if(kind==='open'){const project=parse(await file.text());await load(project.original,file.name.replace(/\.picturepaint$/i,''),project);}else{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG, or WebP drawing.');await load(await readFile(file),file.name);}}catch(error){status(error.message);}};}
$('save').onclick=()=>{if(!painting||busy)return;download(new Blob([serialize(painting,settings())],{type:'application/json'}),'painting.picturepaint');dirty=false;status('Project downloaded. Keep this file to continue painting later.');};
$('export').onclick=()=>{if(!painting||busy)return;painting.composite(outlines).toBlob(blob=>{if(blob)download(blob,'picturepaint.jpg');else status('Unable to export this image.');},'image/jpeg',.9);};
for(const back of [true,false])$(back?'undo':'redo').onclick=()=>{painting?.history(back);dirty=true;render();};
$('outlines').onclick=()=>{outlines=!outlines;dirty=true;render();};
for(const m of ['solid','gradient'])$(m).onclick=()=>{mode=m;for(const other of ['solid','gradient'])$(other).setAttribute('aria-pressed',other===mode);$('gradient-controls').hidden=mode!=='gradient';preview();};
function preview(){const angle=+$('angle').value;$('degrees').textContent=angle+'°';$('gradient-preview').style.background=`linear-gradient(${angle+90}deg,${$('color1').value},${$('color2').value})`;for(const b of $('palette').children)b.setAttribute('aria-pressed',b.dataset.color===$('color1').value);}
for(const color of ['#e87461','#efc96a','#8aa978','#4c8d82','#6688ba','#b2a0be','#dd9eb8','#825c49','#293c39','#ffffff']){const b=document.createElement('button');b.style.background=color;b.dataset.color=color;b.setAttribute('aria-label','Use color '+color);b.onclick=()=>{$('color1').value=color;preview();};$('palette').append(b);}
for(const id of ['color1','color2','angle'])$(id).oninput=preview;
function updateBoundaryLabels(){$('threshold-value').textContent=$('threshold').value;$('gap-value').textContent=$('gap').value+' px';}
for(const id of ['threshold','gap']){$(id).oninput=updateBoundaryLabels;$(id).onchange=async()=>{if(!painting||busy)return;busy=true;controls();status('Updating boundaries…');try{const next=await detect(painting.original,settings());painting=next;dirty=true;render();status('Boundaries updated.');}catch(e){status(e.message);}finally{busy=false;controls();}};}
$('hand').onclick=()=>{view.hand=!view.hand;$('hand').setAttribute('aria-pressed',view.hand);stage.style.cursor=view.hand?'grab':'crosshair';};$('fit').onclick=()=>{if(painting)view.fit(surface.width,surface.height);};$('zoom-in').onclick=()=>{if(painting)view.zoom(1.25);};$('zoom-out').onclick=()=>{if(painting)view.zoom(.8);};
new ResizeObserver(()=>{if(painting)view.fit(surface.width,surface.height);}).observe(stage);
addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName)||$('library-dialog').open)return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(!busy&&painting){painting.history(!e.shiftKey);dirty=true;render();}}});
preview();controls();$('library-dialog').showModal();
