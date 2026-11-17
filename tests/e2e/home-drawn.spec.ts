import { test, expect } from "@playwright/test";
test("home parts, chips and ideas preserve keyboard focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Assisting your AI to assist you with Family History.",
  );
  const parts = page.getByRole("group", { name: "Parts of family history" });
  await parts.getByRole("button", { name: "Name the household" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    parts.getByRole("button", { name: "Follow the question" }),
  ).toHaveAttribute("aria-pressed", "true");
  const chips = page.getByRole("group", { name: "It keeps · pick one" });
  await chips.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(page.locator("#fh-keep-note")).toContainText("Sources.");
  const opener = page
    .locator(".fh-desktop")
    .getByRole("button", { name: "1 idea →" });
  await opener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
    "Follow the question · 1 of 6 ideas",
  );
  await expect(
    page.getByRole("dialog").locator("details").first(),
  ).toHaveAttribute("open", "");
  await expect(
    page.getByRole("dialog").locator("details").first(),
  ).toContainText("One ancestor has stopped you for years");
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  const accordion = page.locator(".fh-accordion");
  await accordion
    .getByRole("button", { name: "Capture what you have" })
    .click();
  await expect(
    accordion.getByRole("button", { name: "Name the household" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    accordion.getByRole("button", { name: "Capture what you have" }),
  ).toHaveAttribute("aria-expanded", "true");
  const phoneOpener = page
    .locator("#fh-panel-photo")
    .getByRole("button", { name: "1 idea →" });
  await phoneOpener.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(phoneOpener).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

for (const theme of ["light", "dark"] as const) {
  test(`signed-out home hydrates without theme warnings in ${theme} mode`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (
        message.type() === "error" ||
        message.type() === "warning" ||
        /hydrat/i.test(message.text())
      ) {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".fh-home")).toHaveClass(`fh-home ${theme}`);
    expect(
      await page
        .locator(".fh-home")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(theme === "dark" ? "rgb(18, 22, 29)" : "rgb(247, 243, 232)");
    // An interactive control confirms React has hydrated before checking its console.
    await page.getByRole("button", { name: "Switch colour theme" }).click();
    await expect(page.locator(".fh-home")).toHaveClass(
      theme === "light" ? "fh-home dark" : "fh-home light",
    );
    await expect(page.locator("html")).not.toHaveClass(/dark|light/);
    await page.getByRole("button", { name: "All 6 ideas →" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveClass(
      new RegExp(theme === "light" ? "dark" : "light"),
    );
    await expect(dialog.getByRole("heading")).toHaveText("All 6 ideas");
    expect(
      await dialog.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe(theme === "light" ? "rgb(18, 22, 29)" : "rgb(247, 243, 232)");
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });
}

for (const [path, label] of [
  ["/ai", "Connect AI"],
  ["/about", "About"],
  ["/features", "Features"],
  ["/ideas-and-usage", "Ideas"],
  ["/roadmap", "Roadmap"],
  ["/privacy", "Privacy"],
] as const) {
  test(`dark home does not change ${path} on client navigation`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem("family-history-home-theme", "dark"),
    );
    const appearance = () =>
      page.locator("main").evaluate((main) => {
        const elements = [document.body, main, ...main.querySelectorAll("*")];
        return elements.map((element) => {
          const style = getComputedStyle(element);
          return [
            element.tagName,
            style.color,
            style.backgroundColor,
            style.backgroundImage,
            style.borderColor,
            style.colorScheme,
          ];
        });
      });
    await page.goto(path, { waitUntil: "networkidle" });
    const direct = await appearance();
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator(".fh-home")).toHaveClass("fh-home dark");
    await page.evaluate(() => {
      document.documentElement.dataset.navigationSentinel = "home";
    });
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator(".fh-home")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/dark|light/);
    expect(
      await page.evaluate(
        () => document.documentElement.dataset.navigationSentinel,
      ),
    ).toBe("home");
    expect(await appearance()).toEqual(direct);
  });
}

for (const width of [1000, 1050, 1440]) {
  test(`chip note points at the selected chip at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/", { waitUntil: "networkidle" });
    const note = page.locator("#fh-keep-note");
    const originalLeft = await note.evaluate(
      (element) => element.getBoundingClientRect().left,
    );
    const chips = page.getByRole("group", { name: "It keeps · pick one" });
    await chips.getByRole("button", { name: "Stories", exact: true }).click();
    await expect
      .poll(() =>
        note.evaluate((element) => element.getBoundingClientRect().left),
      )
      .toBeGreaterThan(originalLeft + 50);
    await expect
      .poll(async () => {
        const pointer = await note.evaluate(
          (element) =>
            element.getBoundingClientRect().left +
            parseFloat(getComputedStyle(element).getPropertyValue("--pointer")),
        );
        const chip = await chips
          .getByRole("button", { name: "Stories", exact: true })
          .boundingBox();
        return Math.abs(pointer - (chip!.x + chip!.width / 2));
      })
      .toBeLessThan(2);
  });
}

test("stand-alone home links keep 44px targets on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.locator(".fh-status > summary").click();
  const links = page.locator(
    ".fh-home > nav a:visible, .fh-home footer a:visible, .fh-home .fh-status a:visible",
  );
  expect(await links.count()).toBeGreaterThan(5);
  for (const link of await links.all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
