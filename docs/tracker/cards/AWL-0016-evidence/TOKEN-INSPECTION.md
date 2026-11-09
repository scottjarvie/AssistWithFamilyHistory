# AWL-0016 lesson 17: website token inspection

Status: **actual issued-token claim names not observed**. Do not count the fixture as an actual-token inspection.

The checked-in Sandbox binding was verified before opening the development website: development Clerk role, the registered Family History Sandbox hostname and a separate local backend binding. Only the frontend was started; no backend was started or pushed. No production sign-in, keys or session were used.

The existing browser profile had no active development session. A clearly marked synthetic test-email sign-up was attempted through Clerk's documented development flow. Clerk refused the headless request with `captcha_invalid`; the website sign-up did not produce a successful session either. No token was obtained or decoded. No token, cookie, user/session identifier, password or claim value is in this report. The bounded frontend was stopped and its slot released. Scott was asked whether to complete Sandbox sign-in or leave this proof pending.

The implementation nevertheless tests the exact native website claim names supplied by Scott from Plants' real Sandbox observation:

`aud, exp, fva, iat, iss, nbf, sid, sts, sub, v`

The signed local-session test and Convex person-function fixture include those ten claims, with synthetic values, no azp and no OAuth markers. They succeed. Separate tests refuse each of `client_id`, `scope`, `scp`, and a present foreign azp; a missing azp remains valid. Signature, issuer, audience, expiry, subject and owner protections remain.

To finish the actual-token check: start the verified Sandbox frontend in an owned runtime slot, complete a website sign-in, ask Clerk's website SDK for its Convex token, verify its development issuer/audience/signature without printing it, and record only sorted claim names. Stop the frontend and release the slot afterwards. Do not sign in to the live site, change Clerk settings, disable CAPTCHA or copy a token into Git/chat.

Reference for the development test-email attempt: [Clerk test emails and phones](https://clerk.com/docs/guides/development/testing/test-emails-and-phones).
