/**
 * SiteMark: the site's brand tile (the approved 2026-11-17 app-icon art).
 *
 * Decorative: every place it appears sits beside the "Family History"
 * wordmark or inside a link that already carries the accessible name, so the
 * image is hidden from assistive tech. Size and corner rounding come from the
 * host slot's className.
 */

export const SITE_MARK_SRC = "/brand/assist-family-2026-11-17/site-mark.svg";

export function SiteMark({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimisation needed
    <img
      src={SITE_MARK_SRC}
      alt=""
      aria-hidden="true"
      width={40}
      height={40}
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
