/**
 * Support routing for Assist With Family History.
 *
 * Every Assist With site routes support, feedback, and privacy questions
 * through the one central Assist With Life support desk. No Assist With site
 * operates a mailbox or an email server, so the site must never publish a
 * `mailto:` contact address or imply that direct email contact exists.
 *
 * Keep this the single source of the desk URL and the honesty sentence so the
 * contact page, the privacy policy, and marketing calls to action cannot drift
 * apart.
 */

export const SUPPORT_DESK_URL = "https://assistwithlife.com/support";

export const SUPPORT_DESK_LABEL = "Assist With Life Support";

/** The plain statement that replaces every former email-contact claim. */
export const NO_DIRECT_EMAIL_STATEMENT =
  "We don't offer direct email contact.";
