// Native decoding applies the browser's EXIF orientation before dimensions are read.
// Ownership of this object URL passes to the cropper or is explicitly released.
export async function decodePhoto(file,{maxPixels=64000000}={}){
 if(!(file instanceof Blob)||file.size===0||file.size>32*1024*1024)throw Error('Choose a photo up to 32 MB.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('This photo could not be opened. Choose a JPG, PNG or another image supported by this browser.'));image.src=url;});
 const width=image.naturalWidth,height=image.naturalHeight;
 if(!width||!height||width*height>maxPixels)throw Error('Choose a photo up to 64 megapixels.');
 return {file,image,url,width,height,revoke:()=>URL.revokeObjectURL(url)};
 }catch(error){URL.revokeObjectURL(url);throw error;}
}
