/** Isolated real-component interaction; no auth/backend or running server needed.
 * Coordinator runs this with its browser. Backend lifecycle is covered by convex-test.
 */
import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve("package.json"));
const { buildSync } = createRequire(require.resolve("tsx/package.json"))("esbuild") as { buildSync(options: Record<string, unknown>): { outputFiles: { text: string }[] } };

for (const completeRow of [false, true]) {
  test(`revoke → reapprove → immediate revoke uses replacement ID (${completeRow ? "current" : "older"} backend)`, async ({ page }) => {
    const component = path.resolve("components/ai/AiConnectionCenter.tsx");
    const bundle = buildSync({
      stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {AiConnectionCenter} from ${JSON.stringify(component)};
        createRoot(document.getElementById('root')).render(React.createElement(AiConnectionCenter, {
          initialConnections: [{ id:'old-id', label:'Synthetic AI', clientId:'synthetic', issuer:'https://example.test',
            clientProvenance:'manual', observedClientName:null, clientMetadataUrl:null,
            scopes:['family_history:context:read'], scopeChoice:'chosen', boundary:{kind:'whole_workspace'},
            status:'active', requestedAt:1, consentedAt:1, issuedAt:1, expiresAt:null,
            lastUsedAt:null, lastToolName:null, revokedAt:null, revokedReason:null, useCount:0, consentSnapshot:null }], initialActivity:[] }));`,
        resolveDir: process.cwd(), loader: "tsx" },
      bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
    }).outputFiles[0].text;
    // The component uses crypto.randomUUID for operation IDs. Serve the fixture
    // on an intercepted secure origin so Chromium exposes it as in the app.
    await page.route("https://connection.test/", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    await page.goto("https://connection.test/");
    await page.evaluate(() => {
      const calls: Record<string, unknown>[] = [];
      Object.assign(window, { connectionCalls: calls });
      window.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        calls.push(body);
        if (body.action === "approve") {
          await new Promise<void>((resolve) => Object.assign(window, { releaseApproval: resolve }));
          return new Response(JSON.stringify({ id: "new-id", status: "active", scopes: body.scopes, boundary: body.boundary, expiresAt: null, scopeChoice: "full" }));
        }
        return new Response(JSON.stringify({ id: body.grantId, status: "revoked" }));
      };
    });
    if (completeRow) await page.evaluate(() => {
      const send = window.fetch;
      window.fetch = async (...args) => {
        const response = await send(...args);
        const result = await response.json();
        if (result.id === "new-id" && result.status === "active") result.connection = {
          ...result, label: "Synthetic AI", clientId: "synthetic", issuer: "https://example.test", clientProvenance: "manual",
          observedClientName: null, clientMetadataUrl: null, requestedAt: 2, consentedAt: 2, issuedAt: 2,
          lastUsedAt: null, lastToolName: null, revokedAt: null, revokedReason: null, useCount: 0, consentSnapshot: null,
        };
        return new Response(JSON.stringify(result));
      };
    });
    await page.addScriptTag({ content: bundle });
    const revoke = page.getByRole("button", { name: "Revoke Synthetic AI" });
    const revokeConnection = async () => {
      await revoke.click();
      await page.getByRole("dialog", { name: "Revoke Synthetic AI?" }).getByRole("button", { name: "Revoke connection" }).click();
    };
    const openReview = () => page.getByText("Review connection · Synthetic AI", { exact: true }).click();
    await revokeConnection();
    await openReview();
    await page.getByText("Review and approve again", { exact: true }).click();
    await page.getByRole("button", { name: /Approve/ }).click();
    // While approval is pending the previous active controls cannot reappear.
    await expect(revoke).toHaveCount(0);
    await page.evaluate(() => (window as unknown as { releaseApproval: () => void }).releaseApproval());
    await revokeConnection();
    await openReview();
    await expect(page.getByText("Review and approve again", { exact: true })).toBeVisible();
    const calls = await page.evaluate(() => (window as unknown as { connectionCalls: Record<string, unknown>[] }).connectionCalls);
    expect(calls.map(({ action, grantId }) => ({ action, grantId }))).toEqual([
      { action: "revoke", grantId: "old-id" }, { action: "approve", grantId: "old-id" }, { action: "revoke", grantId: "new-id" },
    ]);
  });
}
