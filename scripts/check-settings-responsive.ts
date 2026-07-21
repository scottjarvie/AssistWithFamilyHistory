import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const settingsPath = resolve(process.cwd(), "app/app/settings/page.tsx");
const source = readFileSync(settingsPath, "utf8");

function includes(fragment: string, message: string) {
  assert(source.includes(fragment), message);
}

function matches(pattern: RegExp, message: string) {
  assert(pattern.test(source), message);
}

// Mobile layout contract: retain the current compact desktop density while
// giving narrow screens enough inline room and predictable stacked rows.
includes(
  'className="max-w-4xl px-4 py-6 sm:p-8"',
  "Settings must use narrow-screen padding with the existing desktop padding restored at sm",
);
includes(
  'className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2"',
  "API key controls must stack on mobile and restore the original dense gap at sm",
);
includes(
  'className="flex flex-col gap-4 rounded-lg bg-stone-50 p-4 sm:flex-row sm:items-center sm:justify-between"',
  "Privacy controls must stack without clipping and return to a dense row at sm",
);
includes(
  'className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"',
  "Admin controls must stack without clipping and return to a dense row at sm",
);

// Interaction contract: every Settings control that was shorter than the
// 44px touch baseline gains a durable target without changing its handler.
includes('className="h-11 pr-12"', "API key input must retain a 44px input target");
includes(
  'className="absolute right-0 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center',
  "API key visibility toggle must expose a 44px target",
);
includes(
  'className="relative flex min-h-11 w-12 shrink-0 items-center justify-center',
  "Privacy switch must expose a 44px target without widening its visual track",
);
includes(
  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
  "Privacy switch thumb must retain symmetric track insets",
);
matches(
  /disabled=\{testingKey\}\s+className="min-h-11 w-full sm:w-auto"/,
  "API key test button must retain its 44px target",
);
matches(
  /onClick=\{\(\) => saveSettings\(settings\)\}\s+className="min-h-11 bg-amber-700/,
  "API key save button must retain its 44px target",
);
matches(
  /onClick=\{handleAdminToggle\}\s+className="min-h-11 w-full sm:w-auto"/,
  "Admin toggle button must retain its 44px target",
);
matches(
  /className="min-h-11" variant="outline" onClick=\{\(\) => setShowAdminDialog\(false\)\}/,
  "Admin dialog cancel button must retain its 44px target",
);
matches(
  /className="min-h-11 bg-orange-600 hover:bg-orange-700"\s+onClick=\{confirmAdminMode\}/,
  "Admin confirmation button must retain its 44px target",
);

// Behavior locks: responsive work must not change storage, provider, labels,
// handlers, or the Settings/navigation ownership boundary.
includes('localStorage.getItem("telltheirstories-settings")', "Settings storage key changed");
includes('localStorage.setItem("telltheirstories-settings"', "Settings save behavior changed");
includes('fetch("https://openrouter.ai/api/v1/models"', "API key test endpoint changed");
includes('onClick={testApiKey}', "API key test handler changed");
includes('onClick={handleAdminToggle}', "Admin toggle handler changed");
includes('role="switch"', "Privacy switch semantics changed");
assert(!source.includes("AppSidebar"), "Settings must not absorb PR #21 sidebar ownership");
assert(!source.includes("AppNavigationList"), "Settings must not absorb PR #21 navigation ownership");

console.log("Settings responsive contract passed");
