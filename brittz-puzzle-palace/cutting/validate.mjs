import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {COUNTS,validatePattern,rotatePattern} from './geometry.js';
const reports=[];
for(const count of COUNTS){
 const url=new URL(`patterns/${count}.json`,import.meta.url),bytes=await readFile(url),pattern=JSON.parse(bytes);
 const report=validatePattern(pattern,{uniqueness:true});
 for(const turn of [90,180,270])validatePattern(rotatePattern(pattern,turn));
 reports.push({id:pattern.id,sha256:createHash('sha256').update(bytes).digest('hex'),...report});
 console.log(`PASS ${count}: exact square, ${report.corners} corners, complementary edges, all turns; minimum outline distance ${report.similarity.minimum.toFixed(6)}.`);
}
if(process.argv.includes('--report'))await writeFile(new URL('patterns/validation.json',import.meta.url),JSON.stringify({schemaVersion:1,reports},null,2)+'\n');
