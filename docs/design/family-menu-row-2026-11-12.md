# Family menu trigger and footer rail — 12 November 2026

The Fable AWL-0018/0020 Family History exception preserves Clerk's UserButton
popup and its sign-out return to `/`. Both desktop positions and the sidebar
avatar request a 44px trigger through Clerk appearance elements. No vendor
entries, account policies or role gates are replaced. Authored guest/local/user
panels use Folio tokens; signed-in names wrap to two lines. Guest Sign in,
Create account and Import here instead retain their order and destinations.

The compact rail uses a validated, dated public Life manifest snapshot, with
Family History first and Life's `#all-spaces` directory last. Manifest launch
statuses stay unchanged. Invalid destinations remain labels. No render-time
network request or endpoint is introduced. Future catalog updates replace the
snapshot after validation; they must not promote prelaunch entries locally.

The 55px rail scrolls natively and reserves trailing room for its overflow
button. Its roster is a nonmodal three-column desktop dialog, measured before
focus, and a modal two-column phone sheet (one column below 360px). Both retain
Escape, dismissal and focus return. Desktop page scrolling dismisses it; the
phone scrim dismisses on completed click. All entries are at least 44px tall.
Low-contrast manifest dots on dark surfaces use the neutral token.

The marketing footer and ordinary signed-in app footer keep row and utility
links together in normal flow. Public story readers, app account/admin,
import/capture, record and task flows do not gain the row. Hash-based task and
settings surfaces also opt out. All eleven marketing utility links and all
three app utility links remain. No fixed bottom app bar was found in the
current shell; its bottom group retains safe-area padding.

Validation artifacts are kept outside the repository at
`/home/jarvie/code/_campaigns/awl-0018-0020/family-history/rollout/`.
They bundle actual React/Radix components with explicitly mocked Next routing,
Clerk and query-count boundaries. Synthetic screenshots are component evidence,
not authenticated provider or production proof. No safe real Clerk synthetic
session was available: popup entries remain unobserved, and none were invented.
There are no authored role/theme/navigation controls to add or consolidate.
