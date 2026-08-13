import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeProductionUrl } from "../lib/site/canonicalProductionUrl";

test("canonicalizes the retired production domain", () => {
  assert.equal(
    canonicalizeProductionUrl(
      "https://discovertheirstories.com/sign-in?redirect_url=https%3A%2F%2Fdiscovertheirstories.com%2Fapp"
    )?.toString(),
    "https://assistwithfamilyhistory.com/sign-in?redirect_url=https%3A%2F%2Fassistwithfamilyhistory.com%2Fapp"
  );
});

test("preserves paths and queries on legacy deployment aliases", () => {
  assert.equal(
    canonicalizeProductionUrl(
      "http://tell-their-stories.vercel.app/app/people?focus=ancestor"
    )?.toString(),
    "https://assistwithfamilyhistory.com/app/people?focus=ancestor"
  );
});

test("does not redirect canonical, local, or lookalike hosts", () => {
  for (const url of [
    "https://assistwithfamilyhistory.com/sign-in",
    "http://127.0.0.1:3443/sign-in",
    "https://assistwithfamilyhistory.com.example.test/sign-in",
  ]) {
    assert.equal(canonicalizeProductionUrl(url), null);
  }
});

test("does not rewrite a redirect target on an unrelated origin", () => {
  assert.equal(
    canonicalizeProductionUrl(
      "https://discovertheirstories.com/sign-in?redirect_url=https%3A%2F%2Fexample.com%2Freturn"
    )?.toString(),
    "https://assistwithfamilyhistory.com/sign-in?redirect_url=https%3A%2F%2Fexample.com%2Freturn"
  );
});
