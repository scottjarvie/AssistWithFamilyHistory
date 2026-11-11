import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
test("shared usage core matches signed hash header",()=>{
 const source=readFileSync("convex/lib/usageLimits/core.ts","utf8"); const lines=source.split("\n");
 const hash=lines[0].match(/sha256:([a-f0-9]+)/)![1];
 assert.equal(createHash("sha256").update(lines.slice(2).join("\n")).digest("hex"),hash);
});
test("storage allowance literals live only in the core or tests",()=>{
 for(const root of ["app","components","convex","lib"]){
 const visit=(dir:string)=>{for(const e of readdirSync(dir,{withFileTypes:true})){const path=dir+"/"+e.name;if(e.isDirectory()){if(e.name!=="_generated")visit(path);}else if(/\.[jt]sx?$/.test(path)&&!path.includes(".test.")&&!path.endsWith("usageLimits/core.ts"))assert.doesNotMatch(readFileSync(path,"utf8"),/\b(?:1_000_000_000|10_000_000_000|1000000000|10000000000|1_073_741_824|10_737_418_240)\b/,path);}};visit(root);
 }
});
