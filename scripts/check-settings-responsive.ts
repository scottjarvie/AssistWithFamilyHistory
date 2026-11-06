/** Settings behavior/markup contract; actual geometry is browser-probed. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ProviderSettings} from "../components/settings/ProviderSettings";
import {AVAILABLE_MODELS} from "../lib/ai/types";
const source=readFileSync("components/settings/ProviderSettings.tsx","utf8");
const route=readFileSync("app/app/settings/page.tsx","utf8");
const markup=renderToStaticMarkup(React.createElement(ProviderSettings));
for(const fragment of ['localStorage.getItem("telltheirstories-settings")','localStorage.setItem("telltheirstories-settings"','fetch("https://openrouter.ai/api/v1/models"','onClick={testApiKey}','onClick={handleAdminToggle}','role="switch"','onClick={confirmAdminMode}'])assert.ok(source.includes(fragment),`Existing behavior changed: ${fragment}`);
for(const text of ["Save API Key","OpenRouter API Key","AI Model","Admin Mode","Auto-redact sensitive information","Where your data can go"])assert.ok(markup.includes(text),`Missing setting: ${text}`);
for(const model of AVAILABLE_MODELS){assert.ok(markup.includes(model.name));assert.ok(markup.includes(model.provider));assert.ok(markup.includes(String(model.costPer1kTokens)));}
const keyInput=markup.match(/<input[^>]*id="openrouter-api-key"[^>]*>/)?.[0];
assert.ok(keyInput?.includes('type="password"'),"Key must start masked");
assert.match(markup,/aria-label="Show API key"/);
assert.match(markup,/role="switch"/);assert.match(markup,/aria-checked="true"/);
assert.ok(source.includes('className="h-11 pr-12"'));
assert.ok(source.includes('min-h-11 min-w-11'));
assert.ok(source.includes('flex flex-col gap-3 sm:flex-row'));
for(const text of ["Uses faster extraction pacing","Removes expansion caps","May trigger rate limiting on FamilySearch","I understand, enable Admin Mode"])assert.ok(source.includes(text),`Lost confirmation: ${text}`);
assert.ok(source.includes("this saved preference is not currently read by those routes"),"Do not promise automatic processing behavior the preference does not implement");
assert.ok(route.includes("ProviderSettings"));
assert.ok(!source.includes("AppSidebar")&&!route.includes("AppSidebar"),"Settings must not take over navigation ownership");
console.log("Settings behavior, retained controls, catalog and accessible markup contract passed; browser geometry checks are separate.");
