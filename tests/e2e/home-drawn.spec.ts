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
      if (message.type() === "error" || /hydrat/i.test(message.text())) {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      (value) => localStorage.setItem("theme", value),
      theme,
    );
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(theme);
    // An interactive control confirms React has hydrated before checking its console.
    await page.getByRole("button", { name: "Switch colour theme" }).click();
    await expect(page.locator("html")).toHaveClass(
      theme === "light" ? "dark" : "light",
    );
    expect(errors).toEqual([]);
  });
}
