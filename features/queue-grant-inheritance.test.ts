import {expect,test} from "vitest";
import {effectiveScopes,LEGACY_FULL_SCOPE_BASELINE} from "../lib/mcp/grantDefaults";
import {decideToolAccess,permittedTools,type GrantResolution,type ResolvedGrant} from "../lib/mcp/authorize";
const base:ResolvedGrant={grantId:"test",clientId:"ai-client",issuer:"https://issuer.test",scopes:[...LEGACY_FULL_SCOPE_BASELINE],scopeChoice:"chosen",withheldScopes:["family_history:evidence:write"],boundary:{kind:"selected_people",personIds:["allowed-person"]}};
const active=(grant=base):GrantResolution=>({state:"active",grant});
test("new Queue tools and Propose suggestions inherit AWL-0015 powers without restoring any removed power",()=>{
 expect(effectiveScopes(base)).toContain("family_history:queue:suggest");expect(effectiveScopes(base)).not.toContain("family_history:evidence:write");
 expect(permittedTools(active(),Date.now()).map(t=>t.name)).toContain("family_history_add_queue");
 expect(decideToolAccess({toolName:"family_history_add_queue",resolution:active(),now:Date.now(),input:{addedBy:"ai_suggestion",fromRecord:{kind:"person",refId:"allowed-person"}}}).allowed).toBe(true);
 expect(decideToolAccess({toolName:"family_history_add_queue",resolution:active(),now:Date.now(),input:{addedBy:"ai_suggestion",fromRecord:{kind:"person",refId:"foreign-person"}}}).allowed).toBe(false);
 const off={...base,withheldScopes:[...base.withheldScopes!,"family_history:queue:suggest" as const]};
 expect(decideToolAccess({toolName:"family_history_add_queue",resolution:active(off),now:Date.now(),input:{addedBy:"ai_suggestion"}})).toMatchObject({allowed:false,code:"SCOPE_NOT_GRANTED"});
 expect(decideToolAccess({toolName:"family_history_add_queue",resolution:active(off),now:Date.now(),input:{addedBy:"ai_on_request"}}).allowed).toBe(true);
});
