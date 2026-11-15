// Static, collection-based content. Selecting only prepares an in-memory source;
// the existing Shuffle & Play flow remains the sole writer of new sessions.
export function attachPictureGallery({chooseImage}){
 const $=id=>document.getElementById(id),dialog=$('picture-gallery'),status=$('picture-gallery-status');
 let loaded=false,busy=false,controller=null;
 $('open-picture-gallery').disabled=false;
 dialog.addEventListener('close',()=>{controller?.abort();controller=null;$('open-picture-gallery').focus();});
 $('close-picture-gallery').onclick=()=>dialog.close();
 $('open-picture-gallery').onclick=async()=>{
  dialog.showModal();$('picture-gallery-title').focus();
  if(loaded)return;
  status.textContent='Loading pictures…';controller=new AbortController();
  try{
   const response=await fetch(new URL('./gallery.json',import.meta.url),{signal:controller.signal});
   if(!response.ok)throw Error(`Gallery could not load (HTTP ${response.status}).`);
   const catalog=await response.json();const fragment=document.createDocumentFragment();
   for(const collection of catalog.collections){
    const section=document.createElement('section'),heading=document.createElement('h3'),grid=document.createElement('div');
    heading.textContent=collection.title;grid.className='picture-grid';section.append(heading,grid);
    for(const picture of collection.images){
     const button=document.createElement('button'),img=document.createElement('img'),title=document.createElement('span');
     button.type='button';button.className='picture-choice';button.dataset.picture=picture.id;
     img.src=new URL(picture.thumbnail,import.meta.url);img.alt='';img.width=img.height=256;img.loading='lazy';img.decoding='async';title.textContent=picture.title;button.append(img,title);grid.append(button);
     button.onclick=async()=>{
      if(busy)return;busy=true;controller=new AbortController();const signal=controller.signal;
      grid.closest('#picture-collections').querySelectorAll('button').forEach(b=>b.disabled=true);
      status.textContent=`Loading ${picture.title}…`;
      try{
       const response=await fetch(new URL(picture.image,import.meta.url),{signal});
       if(!response.ok)throw Error(`Picture could not load (HTTP ${response.status}).`);
       const blob=await response.blob();if(signal.aborted)return;
       // Own the fetched bytes, including on WebKit. Keep original JPG encoding.
       const file=new File([await blob.arrayBuffer()],`${picture.title}.jpg`,{type:'image/jpeg'});
       if(signal.aborted)return;
       // Validation uses the proven square-image path, bypassing the cropper.
       $('close-picture-gallery').disabled=true;
       if(await chooseImage(file)){status.textContent='';dialog.close();$('start-lab').focus();}
       else status.textContent='This picture could not be prepared. Please try again.';
      }catch(error){if(error.name!=='AbortError')status.textContent=error.message+' Please try again.';}
      finally{busy=false;$('close-picture-gallery').disabled=false;$('picture-collections').querySelectorAll('button').forEach(b=>b.disabled=false);}
     };
    }
    fragment.append(section);
   }
   $('picture-collections').replaceChildren(fragment);loaded=true;status.textContent='Choose a picture, then choose your piece count and Shuffle & Play.';
  }catch(error){if(error.name!=='AbortError')status.textContent=error.message+' Close and reopen to retry.';}
 };
 dialog.addEventListener('cancel',e=>{if($('close-picture-gallery').disabled)e.preventDefault();});
}
