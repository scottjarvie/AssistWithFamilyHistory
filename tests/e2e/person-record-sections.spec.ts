import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve("package.json"));
type FixtureBuilder = {
  onResolve(options: { filter: RegExp }, callback: () => { path: string; namespace: string }): void;
  onLoad(options: { filter: RegExp; namespace: string }, callback: () => { contents: string; loader: string }): void;
};
const { build } = createRequire(require.resolve("tsx/package.json"))("esbuild") as {
  build(options: Record<string, unknown>): Promise<{ outputFiles: { text: string }[] }>;
};

// Exercise the real tab and deferred viewers with isolated, synthetic action
// responses. The Convex suite separately exercises the authorized readers.
test("Person tabs preserve lazy loads, history and document actions while navigating", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.stack ?? error.message));
  const bundle = await build({
    stdin: {
      contents: `
        import { createRoot } from "react-dom/client";
        import { RecordSections } from "@/components/records/RecordSections";
        import { DeferredPersonStoryCards } from "@/components/vault/PersonStoryCards";
        import { DeferredDocumentsViewer } from "@/components/DocumentsViewer";
        const root = createRoot(document.getElementById("root"));
        window.showPerson = (person) => root.render(
          <RecordSections key={person} aside={person} overview={<p id="record-context">Context</p>}
            aliases={[{ fragment: "record-source-facts", section: "sources", prefix: true }, { fragment: "record-context", section: "overview" }]}
            sections={[
              { id: "sources", label: "Sources", content: <p id="record-source-facts-birth">Birth facts</p> },
              { id: "documents", label: "Documents", count: 1, content: <DeferredDocumentsViewer personId={person} owner="TEST-owner" /> },
              { id: "stories", label: "Stories", count: 9, content: <DeferredPersonStoryCards personId={person} owner="TEST-owner"
                storyIds={Array.from({ length: 9 }, (_, i) => String(i + 1))} /> },
            ]} />);
        window.showPerson("First");`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "process.env": "{}" },
    plugins: [{ name: "synthetic-person-actions", setup(builder: FixtureBuilder) {
      builder.onResolve({ filter: /^@\/app\/app\/people\/actions$/ }, () => ({ path: "actions", namespace: "person-fixture" }));
      builder.onLoad({ filter: /^actions$/, namespace: "person-fixture" }, () => ({ contents: `
        export async function loadPersonStoryPage(person, ids) {
          window.personCalls.push([person, "stories", ids]);
          if (person === "Delayed") await new Promise(resolve => { window.releaseStoryPage = resolve; });
          return ids.map(id => ({ _id: id, title: person + " story " + id, content: "Synthetic story", type: "biography", status: "draft" }));
        }
        export async function loadPersonDocuments(person) {
          window.personCalls.push([person, "documents"]);
          return [{ _id: "doc", title: "TEST document", contentMarkdown: "# Synthetic document", type: "PS", updatedAt: 1793808000000 }];
        }`, loader: "js" }));
    } }],
  });

  const origin = "https://person.test";
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  await page.route(`${origin}/`, route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script>window.personCalls=[]</script>' }));
  await page.goto(`${origin}/#record-source-facts-birth`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const tabs = page.getByRole("tablist", { name: "Record sections" });
  const tab = (name: string) => tabs.getByRole("tab", { name });
  const calls = () => page.evaluate(() => (window as unknown as { personCalls: unknown[] }).personCalls);
  await expect.poll(async () => errors[0] ?? (await page.getByText("Birth facts").isVisible() ? "Birth facts" : "Waiting for fixture")).toBe("Birth facts");
  expect(await calls()).toEqual([]);

  await tab("Stories").click();
  await expect(tab("Stories")).toHaveText("Stories9");
  const headings = page.getByRole("tabpanel", { name: "Stories" }).getByRole("heading");
  await expect(headings).toHaveText(Array.from({ length: 8 }, (_, i) => `First story ${i + 1}`));
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(headings).toHaveText(Array.from({ length: 9 }, (_, i) => `First story ${i + 1}`));
  expect(await calls()).toEqual([["First", "stories", ["1", "2", "3", "4", "5", "6", "7", "8"]], ["First", "stories", ["9"]]]);

  await page.goBack();
  await expect(tab("Sources")).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(headings).toHaveCount(9);
  expect(await calls()).toHaveLength(2);
  await tab("Stories").press("ArrowLeft");
  await expect(tab("Documents")).toBeFocused();
  await expect(page).toHaveURL(/#record-section-documents$/);
  await page.getByRole("button", { name: "Copy Markdown" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("# Synthetic document");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("TEST document.md");
  const stream = await download.createReadStream();
  const bytes: Buffer[] = [];
  for await (const chunk of stream) bytes.push(chunk);
  expect(Buffer.concat(bytes).toString()).toBe("# Synthetic document");

  await page.evaluate(() => { location.hash = "record-context"; });
  await expect(tab("Overview")).toHaveAttribute("aria-selected", "true");
  const showPerson = (person: string) => page.evaluate(name => (window as unknown as { showPerson: (person: string) => void }).showPerson(name), person);
  await page.evaluate(() => { location.hash = "record-section-stories"; });
  await showPerson("Delayed");
  await expect(page.getByRole("status")).toHaveText("Loading stories…");
  await expect.poll(calls).toContainEqual(["Delayed", "stories", ["1", "2", "3", "4", "5", "6", "7", "8"]]);
  await showPerson("Second");
  await expect(headings.first()).toHaveText("Second story 1");
  await page.evaluate(() => (window as unknown as { releaseStoryPage: () => void }).releaseStoryPage());
  await expect(headings).toHaveText(Array.from({ length: 8 }, (_, i) => `Second story ${i + 1}`));
});
