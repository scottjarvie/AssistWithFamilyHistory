// @vitest-environment node
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ApiKeyManager } from "../../components/api/ApiKeyManager";

test("the actual new API form selects full access, no end date, and exposes opt-in presets without promoting roles", () => {
  const markup = renderToStaticMarkup(createElement(ApiKeyManager, { initialKeys: [] }));
  expect(markup).toContain("Full access to my data");
  expect(markup).toMatch(/border-amber-400 bg-amber-50[^]*?Full access to my data/);
  expect(markup).toMatch(/type="date"[^>]*value=""/);
  expect(markup).toContain("blank means no end date");
  expect(markup).not.toContain("Admin / security tool");
});
