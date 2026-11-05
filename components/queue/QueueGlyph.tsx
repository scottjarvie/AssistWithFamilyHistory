import type {ComponentProps} from "react";
const paths={
 archive:"M2 3h12v3H2z M3 6v8h10V6 M6 9h4",
 arrow:"M2 8h12 M9 3l5 5-5 5",
 external:"M9 2h5v5 M14 2 8 8 M7 3H2v11h11V9",
 bot:"M3 5h10v8H3z M8 2v3 M6 8h.01 M10 8h.01 M6 11h4 M1 7v4 M15 7v4",
 check:"M2 8l4 4L14 3",
 down:"m3 6 5 5 5-5",
 right:"m6 3 5 5-5 5",
 warning:"M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0 M8 4v5 M8 11h.01",
 clock:"M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0 M8 4v4l3 2",
 file:"M3 1h7l3 3v11H3z M10 1v4h3 M5 8h4 M5 11h5",
 history:"M3 3a6 6 0 1 1-1 7 M3 1v4H0 M8 4v4l3 2",
 loading:"M14 8A6 6 0 1 1 8 2",
 plus:"M8 2v12 M2 8h12",
 refresh:"M13 5A5 5 0 0 0 3 4 M13 1v4H9 M3 11a5 5 0 0 0 10 1 M3 15v-4h4",
 back:"M6 3 1 7l5 4 M1 7h8a4 4 0 0 1 0 8",
 search:"M11 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M10 9l4 5",
 shield:"M8 1 2 3v5c0 4 6 7 6 7s6-3 6-7V3L8 1Z M5 8l2 2 4-4",
 trash:"M2 4h12 M6 1h4l1 3 M4 4l1 11h6l1-11 M7 7v5 M9 7v5",
 person:"M11 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0 M2 15v-3c0-5 12-5 12 0v3",
 close:"M3 3l10 10 M13 3 3 13",
};
function glyph(kind:keyof typeof paths){return function QueueGlyph(props:ComponentProps<"svg">){return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[kind]}/></svg>;};}
/** Codex-written glyphs; all actions retain visible text and accessible names. */
export const Archive=glyph("archive"),ArrowRight=glyph("arrow"),ArrowUpRight=glyph("external"),Bot=glyph("bot"),Check=glyph("check"),ChevronDown=glyph("down"),ChevronRight=glyph("right"),CircleAlert=glyph("warning"),Clock3=glyph("clock"),FileClock=glyph("file"),History=glyph("history"),LoaderCircle=glyph("loading"),Plus=glyph("plus"),RefreshCw=glyph("refresh"),RotateCcw=glyph("back"),Search=glyph("search"),ShieldCheck=glyph("shield"),Trash2=glyph("trash"),UserRound=glyph("person"),X=glyph("close");
