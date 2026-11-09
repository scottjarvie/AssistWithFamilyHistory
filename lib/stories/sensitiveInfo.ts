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
 // Unescape JSON strings before checking, including multiply escaped payloads.
 let normalized = text;
 for (;;) {
  const decoded = normalized.replace(/\\(?:u([0-9a-f]{4})|([\\"nrt]))/gi, (_, hex, char) => hex ? String.fromCharCode(parseInt(hex,16)) : ({n:"\n",r:"\r",t:"\t"} as Record<string,string>)[char] ?? char);
  if (decoded === normalized) break;
  normalized = decoded;
 }
 const refuse = (category: string, index: number): never => {
  const line=normalized.slice(0,index).split("\n").length;
  throw new Error(`PUBLICATION_SECRET: Remove ${category} in publication text line ${line} before publishing.`);
 };
 const credentialKey=String.raw`[A-Za-z0-9_ -]*(?:password|passwd|secret|token|(?:api|access)[ _-]?key)`;
 const snakeKey=String.raw`(?:[A-Za-z0-9_]+_)?(?:password|passwd|secret|token|(?:api|access)_?key)`;
 // Match credential keys directly. A generic JSON key must not consume and
 // conceal a credential-shaped assignment inside its string value.
 const credentials=new RegExp(String.raw`(?:["'](${credentialKey})["']\s*[:=]|\b(${snakeKey})[:=])\s*(?:["']([^\s"']{8,})["']|([^\s"',}\]]{8,}))`,"gi");
 for (const match of normalized.matchAll(credentials)) refuse("credential",match.index!);
 const secrets = [
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|[rs]k_(?:live|test)_[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|xox[abpr]-[A-Za-z0-9-]{8,}|access-(?:production|sandbox|development)-[A-Za-z0-9-]{8,})\b/, "API token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/, "access token"],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@/i, "URL credentials"],
 ] as const;
 for (const [pattern,label] of secrets) { const match=pattern.exec(normalized); if(match) refuse(label,match.index); }
 for (const match of normalized.matchAll(/\b(?:(?:\d{4}[ -]){3}\d{4}(?:[ -]\d{3})?|\d{4}[ -]\d{6}[ -]\d{5}|\d{13,19})\b/g)) {
  const digits=match[0].replace(/\D/g,"");
  if (/^(\d)\1+$/.test(digits)) continue;
  let sum=0;
  for(let i=digits.length-1, alternate=false;i>=0;i--,alternate=!alternate) { let n=Number(digits[i]); if(alternate){n*=2;if(n>9)n-=9;} sum+=n; }
  if(sum%10===0) refuse("payment card number",match.index!);
 }
 const counts=countContactDetails(text);
 const exact = acknowledgement !== undefined && Object.entries(counts).every(([key,n]) => Number.isSafeInteger(acknowledgement[key as keyof ContactCounts]) && acknowledgement[key as keyof ContactCounts] === n);
 if ((acknowledgement !== undefined || Object.values(counts).some(n => n > 0)) && !exact) {
  throw new Error(`PUBLICATION_CONTACT_DETAILS: This contains ${counts.emails} email addresses, ${counts.phones} phone numbers and ${counts.addresses} street addresses. Publish anyway? Send acknowledgeContactDetails: ${JSON.stringify(counts)} once for the whole batch (also accepted on the first call). Remove only the person's own private details; business contacts are expected.`);
 }
 return counts;
}
