export type ContactCounts = { emails: number; phones: number; addresses: number };
const contactPatterns = {
 emails: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
 phones: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]\d{3}[ .-]\d{4}\b/g,
 addresses: /\b\d{1,6}[ \t]+[\w .'-]+?[ \t]+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd)\b/gi,
};
export function countContactDetails(text: string): ContactCounts {
 return {emails:[...text.matchAll(contactPatterns.emails)].length, phones:[...text.matchAll(contactPatterns.phones)].length, addresses:[...text.matchAll(contactPatterns.addresses)].length};
}
/** Categories and locations only; never echo matched secret values. */
export function assertSafePublication(text: unknown, acknowledgement?: ContactCounts) {
 if (typeof text !== "string") throw new Error("PUBLICATION_UNSCANNABLE: The publication body must be readable inline text; unsupported or file-backed bodies cannot be published without a scanned text version.");
 const secrets = [
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b/, "API key"],
  [/\b(?:api[_ -]?key|(?:access[_ -]?)?token|password|secret)["']?\s*[:=]\s*["']?[^\s"',}\]]+/i, "password or token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/, "access token"],
 ] as const;
 for (const [pattern,label] of secrets) {
  const match=pattern.exec(text);
  if(match) {
   const line=text.slice(0,match.index).split("\n").length;
   throw new Error(`PUBLICATION_SECRET: Remove ${label} in publication text line ${line} before publishing.`);
  }
 }
 const counts=countContactDetails(text);
 if (Object.entries(counts).some(([key,n]) => (acknowledgement !== undefined || n > 0) && (!acknowledgement || !Number.isSafeInteger(acknowledgement[key as keyof ContactCounts]) || acknowledgement[key as keyof ContactCounts] !== n))) {
  throw new Error(`PUBLICATION_CONTACT_DETAILS: This contains ${counts.emails} email addresses, ${counts.phones} phone numbers and ${counts.addresses} street addresses. Publish anyway? Send acknowledgeContactDetails: ${JSON.stringify(counts)} once for the whole batch (also accepted on the first call). Remove only the person's own private details; business contacts are expected.`);
 }
 return counts;
}
