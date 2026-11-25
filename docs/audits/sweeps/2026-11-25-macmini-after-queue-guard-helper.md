# Family History Queue guard re-sweep — 2026-11-25 UTC

The original Mac mini checked the public surface after [#172](https://github.com/scottjarvie/AssistWithFamilyHistory/pull/172). GitHub Production deployment `8049982562` succeeded for `4d64adccc00945f7bc8645eacd5cdb293dee0532` at 06:16:54 UTC. Vercel inspection matched `assistwithfamilyhistory.com` to the same ready deployment, `dpl_47HfpjXGkhh425vbddJeJWd3uMYG`. The browser did not independently identify the served revision.

Public Home showed a heading and main content without a generic error. In the incognito tab, `/app/queue` redirected to sign-in. These observations are consistent with the earlier public reach and gate checks.

Signed-in Queue remains unverified. The exact release app layout mounts a guest-vault migration gate that can submit a POST after sign-in and change data or cookies. The sweep therefore did not open the saved session. This pass did not test the production enforce trial, fixtures, or authenticated authorization. The owned tab was closed and no app writes were made.

The Mac mini physical working-directory check failed with “Operation not permitted” at approximately 06:20:02 UTC. The coordinator appended this receipt through GitHub after the worker stopped disk access. Earlier findings are preserved.
