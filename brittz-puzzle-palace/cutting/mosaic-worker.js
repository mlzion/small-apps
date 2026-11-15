import {generateMosaic} from './mosaic.js';
self.onmessage=({data})=>{try{self.postMessage({pattern:generateMosaic(data.count,data.seed)});}catch(error){self.postMessage({error:error.message});}};
