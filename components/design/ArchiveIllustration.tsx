/** Hand-drawn archival motif. Decorative: identity always remains in adjacent text. */
export function ArchiveIllustration({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" fill="none" aria-hidden="true" className={className}>
      <path d="M18 29 49 18l29 12v48H18V29Z" fill="currentColor" opacity=".06" />
      <path d="M22 28h48v51H22z" stroke="currentColor" strokeWidth="1.4" />
      <path d="M29 22h48v50M32 38h28M32 44h19M32 67h28" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M46 59v-8m0 4-7-5m7 5 8-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="38" cy="48" r="3" stroke="currentColor" />
      <circle cx="55" cy="46" r="3" stroke="currentColor" />
      <circle cx="46" cy="62" r="3" stroke="currentColor" />
      <path d="m73 14 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="currentColor" opacity=".55" />
      <path d="M12 84h72" stroke="currentColor" opacity=".25" />
    </svg>
  );
}
