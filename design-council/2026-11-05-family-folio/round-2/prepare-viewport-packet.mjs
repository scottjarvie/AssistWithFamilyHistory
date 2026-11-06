import sharp from 'sharp';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,symlinkSync,realpathSync} from 'node:fs';
import path from 'node:path';
const p=path.dirname(new URL(import.meta.url).pathname),r=path.dirname(p),packet=path.join(p,'packet'),meta=JSON.parse(readFileSync(path.join(p,'checkpoint-provenance.json'))),records=[];
for(const label of ['V1','V2','R1','R2','R3'])mkdirSync(path.join(packet,label),{recursive:true});
for(const [surface,stem] of Object.entries(meta.baselineFiles))for(const device of ['desktop','mobile']){
 const name=`${surface}--${device}-light.png`;
 for(const [set,original] of [['V1',path.join(r,`${stem}--${device}-light.png`)],['V2',path.join(p,'ours-checkpoint',name)]]){
  const target=path.join(packet,set,name);if(existsSync(target))throw Error('Preserve existing packet');
  const {width,height}=await sharp(original).metadata(),crop=Math.min(height,Math.round(width*(device==='mobile'?844/390:900/1440)));
  await sharp(original).extract({left:0,top:0,width,height:crop}).png().toFile(target);
  records.push({set,file:name,original:path.relative(r,original),width,height:crop,fullHeight:height,offset:{x:0,y:0}});
 }
}
for(const set of ['R1','R2','R3'])for(const file of readdirSync(path.join(r,'round-1/packet',set)))if(file.endsWith('.png'))symlinkSync(realpathSync(path.join(r,'round-1/packet',set,file)),path.join(packet,set,file));
writeFileSync(path.join(p,'viewport-packet-provenance.json'),JSON.stringify(records,null,2)+'\n');
console.log('Top-left viewport packet:36 +36 +3 references. Center-crop attempt preserved/excluded.');
