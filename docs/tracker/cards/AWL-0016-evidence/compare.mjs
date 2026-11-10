import sharp from 'sharp';
import {writeFileSync} from 'node:fs';
const root='docs/tracker/cards/AWL-0016-evidence';
const rows=[
 ['01','Queue: three states, input flag, suggestion filter and archive',0,1250],
 ['02','New suggestion review: Edit first and optional dismiss reason',0,1250],
 ['03','Record conclusions remain AI proposals on the record','bottom',950],
 ['04','The removable Propose suggestions power',400,1250],
 ['05','AI setup guide explains requests, suggestions and flags',500,1500],
 ['06','FAQ explains the private Queue review flow',0,1250],
 ['07','Research steps retain their own attribution',0,1250],
 ['08','New person-only From record view',0,1250],
 ['09','Me summary: three states and the independent input count',0,850],
 ['10','Homepage current-feature copy uses three states plus flag',0,1250],
 ['11','New suggestion row: options, evidence and From link',650,1450],
];
const width=480,gap=16,header=100;
for(const [id,title,start,maxHeight] of rows){
 const panels=[];
 for(const phase of ['before','after']){
  const resized=await sharp(`${root}/${id}-${phase}-390.png`).resize({width}).png().toBuffer();const meta=await sharp(resized).metadata();
  const top=start==='bottom'?Math.max(0,meta.height-maxHeight):Math.min(start,Math.max(0,meta.height-100));
  const height=Math.min(maxHeight,meta.height-top);panels.push({input:await sharp(resized).extract({left:0,top,width,height}).png().toBuffer(),height});
 }
 const height=Math.max(...panels.map(p=>p.height));
 const svg=Buffer.from(`<svg width="976" height="100"><rect width="976" height="100" fill="#f5f1e6"/><text x="16" y="28" font-family="Arial" font-size="19" fill="#24342e">${id}. ${title}</text><text x="16" y="65" font-family="Arial" font-size="17" fill="#58645e">BEFORE</text><text x="512" y="65" font-family="Arial" font-size="17" fill="#58645e">AFTER</text><text x="16" y="88" font-family="Arial" font-size="12" fill="#58645e">Synthetic localhost records · 390 CSS px · cropped for comparison</text></svg>`);
 await sharp({create:{width:width*2+gap,height:height+header,channels:4,background:'#f5f1e6'}}).composite([{input:svg,left:0,top:0},...panels.map((panel,i)=>({input:panel.input,left:i*(width+gap),top:header}))]).png().toFile(`${root}/${id}-comparison.png`);
}
writeFileSync(`${root}/IMAGES.md`,'# Numbered before/after images\n\nAll images use invented records on localhost with no backend configured. Raw screenshots are supplied at 1440 and 390 CSS pixels. Comparisons use phone captures and crop only for readability.\n\n'+rows.map(([id,title])=>`- [${id}. ${title}](${id}-comparison.png)`).join('\n')+'\n\n01 and 03–07 were captured against the original source before its visible edits. 10 was captured before its final homepage wording edit. 09 renders the previous Me card JSX with invented counts as a labelled reconstruction. 02, 08 and 11 are new views with no prior counterpart: their Before panel deliberately repeats the old Queue, showing the starting point rather than inventing an old review/origin screen.\n\nBackend behavior is proved separately in the synthetic Convex and HTTP tests. Disabled preview write controls are not evidence of successful authenticated writes.\n');
