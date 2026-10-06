# Local preview: see changes before anything ships

Last updated: 2026-10-06

## What this is for

The fastest way to give feedback on a change is to look at it running on your
own computer. A local preview updates within a second or two of every saved
edit, costs nothing, and cannot touch the live site or anyone's real data. Use
it for the back-and-forth ("make that button bigger", "this wording is off");
push to GitHub only when a change is ready to ship.

## Start it

From the project folder (`J:\IDE\AssistWithFamilyHistory` on Erin's PC):

```bash
git pull
pnpm install
pnpm preview:local
```

Then open <http://localhost:3443>. Leave the terminal running; press `Ctrl+C`
to stop.

The first start downloads a small private database program, so give it a
minute. Later starts are quick.

To look from a phone on the same Wi-Fi, use the "Network" address the terminal
prints (for example `http://192.168.1.20:3443`).

## What you are looking at

- **The real site, built from the files on this computer.** Edit a page and the
  browser updates on its own.
- **A private, empty practice database on this computer.** It is not the live
  database. Anything you add stays here; deleting the `.env.preview.local` file
  starts over with a fresh one.
- **No sign-in.** Sign-in is switched off locally, so you land straight in the
  app as the local owner. That also means the sign-in screens themselves are
  not part of this preview.
- **No AI keys needed** to click around. Features that call an AI provider need
  their usual keys in `.env.local`.

## Working with Claude this way

1. Ask for the change in the project thread.
2. Claude makes it on a branch and opens a **draft** pull request. Drafts run no
   paid GitHub checks.
3. Pull that branch and look at it with `pnpm preview:local`, or have Claude
   run it on your PC through a Remote Control session.
4. Give feedback; repeat as often as you like. Nothing deploys in this loop.
5. When it looks right, Claude marks the PR ready. The checks run once, and the
   merge ships it to the live site.

## For agents

- `scripts/preview-local.mjs` runs `convex dev` against an **anonymous local**
  deployment named in `.env.preview.local` (git-ignored), with code generation
  and typechecking off, then starts `next dev` with Convex URLs pointed at that
  backend and Clerk forced off. It never reads the Convex deployment from
  `.env.local`, and it refuses to start if `.env.preview.local` names a
  non-local deployment.
- Convex re-pushes functions when `convex/` changes; Next.js hot-reloads pages.
- Route smoke against it: `BASE_URL=http://127.0.0.1:3443 pnpm smoke:routes`.
- The Next.js half was smoke-tested on 2026-10-06 (all routes OK). The local
  Convex backend could not be downloaded in the cloud container, so the first
  full run on Erin's PC is the proof for that half.
