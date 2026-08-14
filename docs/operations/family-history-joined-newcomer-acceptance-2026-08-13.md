# Joined newcomer Queue-to-sourced-result acceptance — 2026-08-13

> Outcome: the Queue-to-saved-work bridge and an exact owner-scoped synthetic
> cleanup rail are live in production. Public and anonymous boundaries pass.
> The final authenticated joined lifecycle remains unproved because neither
> available isolated browser host could establish a usable test session.

## Released source

- PR #48 merged as `3da3d4a37d253664e95d2b76cf0d547efab9d144`.
- PR #49 merged as `915f99f03321f945f0bf8a27293357f6830b3f96`.
- PR #50 fixed a Convex code-generation-only recursive type and merged as
  `58a791864cfdfa9630483086661f1def00d56e6e`.
- Local `pnpm verify` passed 47/47 checks. PR-head and exact-main Actions passed;
  final exact-main run `31772638150` includes the route smoke test.
- Production deployment `dpl_FRzBKunKnoJUtVRNfbJmqzcUr2JN` reached Ready for
  `58a7918` and owns `assistwithfamilyhistory.com`.

## What is live

- Completed Queue records render **Saved in your workspace** actions only for
  exact signed-in person, story, research, people, or Story Studio paths.
- External, malformed, settings, and opaque references remain inert text.
- The MCP Queue contract asks chosen AIs to return canonical saved-work paths.
- The cleanup rail requires the exact retained test identity, exact production
  deployment, marked unique run key, bounded graph, exact confirmation, and no
  unmarked references. Anonymous and wrong-user calls fail closed in tests.
- Home, `/ai`, `/updates`, protected-resource discovery, and anonymous MCP 401
  challenge passed on the canonical production address.

## Authenticated acceptance gate

Two authorized attempts used only the retained non-privileged empty identity
and disposable public PKCE clients with `openid offline_access`:

1. Shell-hosted Chromium and Chrome were both denied before page creation by
   the managed macOS Mach-port sandbox.
2. The sanctioned in-app Playwright browser reached the one-use account route,
   but the navigation call hung until the token expired. A constrained follow-up
   reached the canonical signed-out route with an empty body, not a usable test
   session.

The in-app diagnostic emitted the already-expired one-use URL. It was scoped
only to the retained empty test identity. The exact sign-in token was revoked,
the disposable OAuth application was deleted, and a provider recheck returned
zero active sessions. No Queue item, person, relationship, event, source,
citation, finding, story, MCP receipt, or activity fixture was created.

## Remaining proof

A browser host that can complete the exact retained-user sign-in must still run:
private Queue directive → explicit OAuth consent → official MCP brief/Queue read
→ sourced complete-result save → Queue completion → person/story UI at phone and
desktop widths → exact fixture/client/session cleanup. Fresh-device email,
refresh/reconnect, immediate JWT revocation, and independent audit remain
separate Partial or Later proof.
