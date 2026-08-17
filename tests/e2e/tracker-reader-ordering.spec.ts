import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { pathToFileURL } from "node:url";

const boardUrl = pathToFileURL(path.join(process.cwd(), "docs/tracker/board.html")).href;
const storageKey = "assist-tracker-personal-order:github.com/scottjarvie/AssistWithFamilyHistory:v1";
const lane = (status: string) => `.col[data-lane="${status}"]`;

async function clearViewerPreferences(page: Page) {
  await page.goto(boardUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function cardIds(page: Page, status: string) {
  return page.locator(`${lane(status)} [data-card-shell]`).evaluateAll((shells) =>
    shells.map((shell) => (shell as HTMLElement).dataset.cardShell ?? ""));
}

/**
 * `page.mouse` drives raw viewport coordinates and never scrolls, while a Card is
 * as tall as the content it carries. Once an adjacent pair grows past one
 * viewport, an unscrolled drag stops at the viewport edge, the board correctly
 * announces that nothing moved, and the failure reads like a product regression
 * when it is really the fixture growing. Bring both midpoints on screen first,
 * then assert they are reachable so a future regrowth names its own cause.
 */
async function reachableMidpoints(page: Page, sourceSelector: string, targetSelector: string) {
  await page.locator(targetSelector).scrollIntoViewIfNeeded();
  await page.locator(sourceSelector).scrollIntoViewIfNeeded();
  const source = await page.locator(sourceSelector).boundingBox();
  const target = await page.locator(targetSelector).boundingBox();
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const points = {
    source: { x: source!.x + source!.width / 2, y: source!.y + source!.height / 2 },
    target: { x: target!.x + target!.width / 2, y: target!.y + target!.height / 2 },
  };
  for (const [role, point] of Object.entries(points)) {
    expect(
      point.y >= 0 && point.y <= viewport!.height,
      `${role} midpoint y=${Math.round(point.y)} is outside the ${viewport!.height}px viewport, so the mouse can never reach it. Scroll the pair into view or widen the viewport.`,
    ).toBe(true);
  }
  return points;
}

async function pointerDrag(page: Page, sourceSelector: string, targetSelector: string) {
  const { source, target } = await reachableMidpoints(page, sourceSelector, targetSelector);
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
}

test("keyboard order persists, resets, and leaves Card detail and Work Orders intact", async ({ page }) => {
  await clearViewerPreferences(page);
  const canonical = await cardIds(page, "backlog");
  expect(canonical.length).toBeGreaterThan(2);

  const movedId = canonical[1];
  await page.locator(`[data-open-card="${movedId}"]`).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => cardIds(page, "backlog")).toEqual([
    movedId,
    canonical[0],
    ...canonical.slice(2),
  ]);
  await expect(page.locator("#orderStatus")).toHaveText("Personal order saved locally");
  await expect(page.locator("#reorderAnnouncement")).toContainText(`Moved ${movedId}`);
  await expect(page.locator(`[data-open-card="${movedId}"]`)).toBeFocused();

  await page.reload();
  await expect.poll(() => cardIds(page, "backlog")).toEqual([
    movedId,
    canonical[0],
    ...canonical.slice(2),
  ]);

  await page.locator("#resetOrder").click();
  await expect.poll(() => cardIds(page, "backlog")).toEqual(canonical);
  await expect(page.locator("#orderStatus")).toHaveText("Canonical order");
  await expect(page.locator("#resetOrder")).toBeDisabled();

  const openCard = page.locator(`[data-open-card="${canonical[0]}"]`);
  await openCard.click();
  await expect(page.locator("#dlg")).toHaveJSProperty("open", true);
  await expect(page.locator("#dlgBody")).toContainText(canonical[0]);
  await page.keyboard.press("Escape");
  await expect(openCard).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#dlg")).toHaveJSProperty("open", true);
  await page.keyboard.press("Escape");

  await page.locator("#ordersTab").click();
  await expect(page.locator("#ordersView")).toBeVisible();
  await expect(page.locator("#ordersView [data-open-card]")).toHaveCount(0);
  // Work Orders are canonical repository content that grows as the product does,
  // so this asserts the Orders view still renders them rather than pinning the
  // count that happened to be true the day the test was written. The point of
  // the check is that reordering Cards leaves Work Orders intact, not that the
  // repository holds any particular number of them.
  await expect.poll(() => page.locator("#workOrders .work-order").count()).toBeGreaterThan(0);
});

test("pointer drag requires meaningful movement and stays inside the canonical lane", async ({ page }) => {
  await clearViewerPreferences(page);
  const canonical = await cardIds(page, "backlog");
  const sourceId = canonical[0];
  const sourceButton = page.locator(`[data-open-card="${sourceId}"]`);
  await sourceButton.scrollIntoViewIfNeeded();
  const source = await sourceButton.boundingBox();
  expect(source).not.toBeNull();

  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2 + 3, source!.y + source!.height / 2 + 2);
  await page.mouse.up();
  await expect(page.locator("#dlg")).toHaveJSProperty("open", true);
  await expect.poll(() => cardIds(page, "backlog")).toEqual(canonical);
  await page.keyboard.press("Escape");

  await pointerDrag(page, `[data-open-card="${sourceId}"]`, `[data-card-shell="${canonical[1]}"]`);
  const reordered = await cardIds(page, "backlog");
  expect(reordered.slice(0, 4)).toEqual([canonical[1], sourceId, canonical[2], canonical[3]]);
  await expect(page.locator(`[data-card-shell="${sourceId}"]`)).toHaveAttribute("data-status", "backlog");
  await expect(page.locator("#dlg")).toHaveJSProperty("open", false);

  const nextId = (await cardIds(page, "next"))[0];
  await pointerDrag(page, `[data-open-card="${sourceId}"]`, `[data-card-shell="${nextId}"]`);
  await expect.poll(() => cardIds(page, "backlog")).toEqual(reordered);
  await expect.poll(() => cardIds(page, "next")).toContain(nextId);
  await expect(page.locator(`[data-card-shell="${sourceId}"]`)).toHaveAttribute("data-status", "backlog");
  await expect(page.locator("#reorderAnnouncement")).toContainText("was not moved or changed");
});

test("a touch tap opens detail while long-press drag reorders without opening", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearViewerPreferences(page);
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const canonical = await cardIds(page, "backlog");
  const firstCard = page.locator(`[data-open-card="${canonical[0]}"]`);
  await firstCard.scrollIntoViewIfNeeded();

  const tapBox = await firstCard.boundingBox();
  expect(tapBox).not.toBeNull();
  const tapX = tapBox!.x + tapBox!.width / 2;
  const tapY = tapBox!.y + tapBox!.height / 2;
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tapX, y: tapY, id: 1, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator("#dlg")).toHaveJSProperty("open", true);
  await page.keyboard.press("Escape");

  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: tapX, y: tapY, id: 3, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: tapX, y: tapY - 28, id: 3, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => cardIds(page, "backlog")).toEqual(canonical);
  await expect(page.locator("#dlg")).toHaveJSProperty("open", false);
  await page.reload();

  const sourceBox = await firstCard.boundingBox();
  const targetBox = await page.locator(`[data-card-shell="${canonical[1]}"]`).boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  const source = { x: sourceBox!.x + sourceBox!.width / 2, y: sourceBox!.y + sourceBox!.height / 2 };
  const target = { x: targetBox!.x + targetBox!.width / 2, y: targetBox!.y + targetBox!.height / 2 };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...source, id: 2, radiusX: 2, radiusY: 2, force: 1 }],
  });
  await page.waitForTimeout(480);
  for (let step = 1; step <= 6; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: source.x + ((target.x - source.x) * step) / 6,
        y: source.y + ((target.y - source.y) * step) / 6,
        id: 2,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => cardIds(page, "backlog")).toEqual([
    canonical[1],
    canonical[0],
    ...canonical.slice(2),
  ]);
  await expect(page.locator("#dlg")).toHaveJSProperty("open", false);
  await expect(page.locator("#reorderAnnouncement")).toContainText("Personal order only; status is unchanged");
});

test("stored order is sanitized against current canonical lane membership", async ({ page }) => {
  await clearViewerPreferences(page);
  const backlog = await cardIds(page, "backlog");
  const next = await cardIds(page, "next");
  await page.evaluate(({ key, backlogId, nextId }) => {
    localStorage.setItem(key, JSON.stringify({
      version: 1,
      lanes: {
        backlog: [nextId, "AWF-DOES-NOT-EXIST", backlogId, backlogId],
        next: [backlogId, nextId],
      },
    }));
  }, { key: storageKey, backlogId: backlog[0], nextId: next[0] });
  await page.reload();

  const backlogAfter = await cardIds(page, "backlog");
  const nextAfter = await cardIds(page, "next");
  expect(backlogAfter).not.toContain(next[0]);
  expect(nextAfter).not.toContain(backlog[0]);
  expect(backlogAfter).not.toContain("AWF-DOES-NOT-EXIST");
  expect(new Set(backlogAfter).size).toBe(backlogAfter.length);
  expect(backlogAfter).toContain(backlog[0]);
  expect(nextAfter).toContain(next[0]);
});

test("filtered ordering moves visible slots without moving hidden Cards", async ({ page }) => {
  await clearViewerPreferences(page);
  const fullBefore = await cardIds(page, "backlog");
  const type = await page.locator(`${lane("backlog")} [data-card-shell]`).evaluateAll((shells) => {
    const counts = new Map<string, number>();
    for (const shell of shells) {
      const value = (shell as HTMLElement).dataset.type ?? "";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts].find(([, count]) => count >= 2 && count < shells.length)?.[0] ?? "";
  });
  expect(type).not.toBe("");

  const filter = page.locator(`[data-filter-group="type"][data-filter-value="${type}"]`);
  await filter.click();
  const visibleBefore = await cardIds(page, "backlog");
  expect(visibleBefore.length).toBeGreaterThan(1);
  const movedId = visibleBefore[1];
  await page.locator(`[data-open-card="${movedId}"]`).focus();
  await page.keyboard.press("Alt+ArrowUp");

  await filter.click();
  const fullAfter = await cardIds(page, "backlog");
  const expected = [...fullBefore];
  const visibleSlots = fullBefore
    .map((id, index) => visibleBefore.includes(id) ? index : -1)
    .filter((index) => index >= 0);
  const reorderedVisible = [visibleBefore[1], visibleBefore[0], ...visibleBefore.slice(2)];
  visibleSlots.forEach((slot, index) => { expected[slot] = reorderedVisible[index]; });
  expect(fullAfter).toEqual(expected);
  const hidden = fullBefore.filter((id) => !visibleBefore.includes(id));
  expect(fullAfter.filter((id) => hidden.includes(id))).toEqual(hidden);
});

test("blocked storage falls back to session order without errors or narrow overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.addInitScript(() => {
    for (const method of ["getItem", "setItem", "removeItem"] as const) {
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value() { throw new DOMException("Storage blocked for test", "SecurityError"); },
      });
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(boardUrl);

  const before = await cardIds(page, "backlog");
  await page.locator(`[data-open-card="${before[1]}"]`).focus();
  await page.keyboard.press("Alt+ArrowUp");
  await expect(page.locator("#orderStatus")).toHaveText("Personal order for this session");
  await expect(page.locator("#orderbar")).toHaveClass(/storage-warning/);
  await expect.poll(() => cardIds(page, "backlog")).toEqual([
    before[1],
    before[0],
    ...before.slice(2),
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator(".card-shell").first().evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  expect(errors).toEqual([]);
});
