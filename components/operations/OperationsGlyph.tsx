import type { ComponentProps } from "react";
/** Handwritten folio glyph, shared by the visible handoff actions. */
export function CopyGlyph(props:ComponentProps<"svg">) {
 return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="M5 5h9v10H5z M11 3V1H1v10h2"/></svg>;
}
