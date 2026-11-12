import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
test("shared usage core matches signed hash header",()=>{
 const source=readFileSync("convex/lib/usageLimits/core.ts","utf8"); const lines=source.split("\n");
 const hash=lines[0].match(/sha256:([a-f0-9]+)/)![1];
 assert.equal(createHash("sha256").update(lines.slice(2).join("\n")).digest("hex"),hash);
});
const allowanceLiteral=/\b(?:1000000000|10000000000|1073741824|10737418240|1e\+?9|1e\+?10|10e\+?9|2\s*\*\*\s*30|1024\s*\*\*\s*3|1024\s*\*\s*1024\s*\*\s*1024)\b/i;
test("allowance scan recognizes decimal, scientific and binary expressions",()=>{for(const literal of ["1_000_000_000","10_737_418_240","1e9","1e+9","2 ** 30","10 * 1024 ** 3","1024*1024*1024"])assert.match(literal.replaceAll("_",""),allowanceLiteral);});
test("storage allowance literals live only in the core or tests",()=>{
 for(const root of ["app","components","convex","lib"]){
 const visit=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const path=dir+"/"+e.name;if(e.isDirectory()){if(e.name!=="_generated")visit(path);}else if(/\.[jt]sx?$/.test(path)&&!path.includes(".test.")&&!path.endsWith("usageLimits/core.ts")&&!path.endsWith("media/audio.ts"))assert.doesNotMatch((path==="components/v2/admin/UsageLimitsView.tsx"?readFileSync(path,"utf8").replace("const SCALE = { GB: 1e9, KB: 1e3, count: 1 } as const;", ""):readFileSync(path,"utf8")).replaceAll("_",""),allowanceLiteral,path);}};visit(root);
 }
});

test("shared audio core matches its hash header",()=>{
 const source=readFileSync("convex/lib/media/audio.ts","utf8").split("\n");
 assert.equal(createHash("sha256").update(source.slice(2).join("\n")).digest("hex"),source[0].match(/sha256:([a-f0-9]+)/)![1]);
});

test("audio policy numbers stay in the defaults",()=>{
 for(const path of ["app/api/media/upload/route.ts","convex/mediaEvidenceControl.ts","convex/mediaEvidenceStorage.ts","lib/media/evidenceFinalize.ts"])
 assert.doesNotMatch(readFileSync(path,"utf8"),/(?:checkVoiceNoteDuration|voiceNoteTooLongError|checkFileSize|effectiveFileCap)\([^;]*,\s*\d/);
});
