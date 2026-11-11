# Storage allowance

Enforcement is off when no settings row exists. This change does not change
review, rights, AI grants, living-person protection or publication authority.
The operator UI is at `/app/api/admin`; the person's meter is in Settings.
Administrators use Pro; other accounts use Free. Plan allowances and file caps
are policy tables; per-account overrides require a reason and append an audit.

## Shipping (separate approval and audit)

Do not deploy manually. Follow `how-production-deploys.md`: merging the reviewed
PR to `main` makes Vercel run `convex deploy` followed by the Next build.
Do not merge this draft or enable limits until the remaining accounting gaps
below are resolved and the count is independently verified.

With an explicitly selected, reviewed deployment, read one page without writes:

```sh
pnpm exec convex run usageLimits:dryRunPage '{"ownerId":"<owner>","table":"media","cursor":null}'
```

Repeat with the returned cursor until `isDone`, summing `bytes`. Also page
`"table":"mediaUploadSessions"` to count copies retained after failed deletion. No provider
bucket listing is needed. Count active originals, all pinned display copies,
and retained replacement history; Convex originals use storage metadata sizes.
Private published-story attachments still count; publication does not expose
or transfer ownership of them. Remote references with no stored bytes add none.

Backfill only derived counters, one bounded transaction at a time:

```sh
pnpm exec convex run usageLimits:recomputeStep '{"ownerId":"<owner>"}'
```

Repeat until `done: true`. Concurrent stored-byte changes restart the recount.
Check against the dry-run sum before considering enforcement. Do not put an
actual account identifier or its results in a public issue or PR.

## Accounting limitations to resolve before enforcement

- Legacy browser calls without a declared size remain compatible. They are
  checked at commit but cannot reserve before uploading until the new route is live.
- The browser route stages its storage receipt on the reservation. Cancellation
  and expiry delete those staged bytes before releasing. A lost response before
  the receipt is staged can still leave an unclaimed Convex blob; the recount
  reads linked media and cannot enumerate that unclaimed blob.
- Successful B2 uploads count all three display copies. Known partial rendition
  copies whose deletion fails are counted on the session until confirmed cleanup.
  Unacknowledged rendition writes hold their intended bytes conservatively until
  exact-key cleanup confirms removal. Failed
  provider cleanup retains the reservation; it never reports success.
- No production dry run or backfill has been performed for this draft.

These limitations make the draft unsuitable for enabling enforcement yet.
The separate pipelines, HEIC behavior, duplicate detection and durable device
Queue work remain follow-ups; this draft adds no new transports or image sizes.

Local checks use the `.nvmrc` Node version and pnpm. The shell setup security
fixture disables shell startup files so a machine's runtime manager cannot
mutate its intentionally isolated PATH; its assertions are unchanged.
