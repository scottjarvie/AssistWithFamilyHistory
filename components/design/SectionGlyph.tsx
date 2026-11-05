import type {ComponentProps} from "react";
const paths:Record<string,string>={
  overview:"M2 2h5v5H2z M9 2h5v5H9z M2 9h5v5H2z M9 9h5v5H9z",
  sources:"M3 2h8l2 2v10H3z M5 6h5 M5 9h3 M5 12h6",
  timeline:"M4 1v14 M4 3h7 M4 8h5 M4 13h8 M2 3h4 M2 8h4 M2 13h4",
  relationships:"M5 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M15 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M10 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M3 6l4 4 M13 6l-4 4",
  places:"M13 6c0 4-5 8-5 8S3 10 3 6a5 5 0 0 1 10 0 M10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  memories:"M2 3h12v10H2z M3 11l3-3 2 2 3-4 2 5 M5 6h.01",
  documents:"M5 2h7l2 2v9H5z M12 2v3h2 M2 5v10h9 M7 8h5 M7 10h4",
  stories:"M2 3c3-1 4 0 6 1 2-1 3-2 6-1v10c-3-1-4 0-6 1-2-1-3-2-6-1z M8 4v10",
  research:"M11 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M10 9l4 5 M5 6h4 M7 4v4",
  imports:"M2 9h3l1 3h4l1-3h3v5H2z M8 1v8 M5 6l3 3 3-3",
};
/** Handwritten section/kind glyphs; visible names always supply the meaning. */
export function SectionGlyph({kind,...props}:ComponentProps<"svg">&{kind:string}) {
  return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[kind]||paths.sources}/></svg>;
}
export function ActivityGlyph({kind,...props}:ComponentProps<"svg">&{kind:string}) {
  const section=kind==="imports"||kind.includes("import")?"imports":kind.includes("memories")||kind.includes("photos")?"memories":kind.includes("relationships")?"relationships":kind.includes("places")||kind.includes("location")||kind.includes("building")?"places":kind.includes("narrative")?"stories":kind.includes("research")?"research":"sources";
  return <SectionGlyph kind={section} {...props}/>;
}
