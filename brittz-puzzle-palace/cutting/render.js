let serial=0;
const ns='http://www.w3.org/2000/svg';
function svg(tag,attrs={}){const el=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
export function sourceImage(puzzle){return svg('image',{href:puzzle.imageURL,x:0,y:0,width:puzzle.width,height:puzzle.height,preserveAspectRatio:'none','pointer-events':'none'});}
export function imagePiece(puzzle,piece){
 const g=svg('g'),defs=svg('defs'),id=`image-cut-${++serial}`,clip=svg('clipPath',{id,clipPathUnits:'userSpaceOnUse'});
 clip.append(svg('path',{d:piece.path}));defs.append(clip);g.append(defs);
 const image=sourceImage(puzzle);image.setAttribute('clip-path',`url(#${id})`);g.append(image);
 g.append(svg('path',{d:piece.path,class:`glass image-outline ${puzzle.outlines?'with-outline':''}`,'pointer-events':'all'}));
 return g;
}
export function completedImage(puzzle){
 const g=svg('g');g.append(sourceImage(puzzle));
 if(puzzle.outlines)for(const p of puzzle.pieces)g.append(svg('path',{d:p.path,class:'glass image-outline with-outline','pointer-events':'none'}));
 return g;
}
