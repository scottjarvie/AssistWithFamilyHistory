import type {ComponentProps} from "react";
type Props=ComponentProps<"svg">;
const circle="M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0";
const paths={
  arrow:"M2 8h12 M9 3l5 5-5 5",
  book:"M2 3c3-1 4 0 6 1 2-1 3-2 6-1v10c-3-1-4 0-6 1-2-1-3-2-6-1z M8 4v10",
  complete:`${circle} M5 8l2 2 4-5`,
  warning:`${circle} M8 4v5 M8 11h.01`,
  minus:`${circle} M5 8h6`,
  files:"M5 2h7l2 2v9H5z M12 2v3h2 M2 5v10h9 M7 8h5 M7 10h4",
};
/** Codex-written, token-coloured glyphs; every use keeps its visible text label. */
function Glyph({kind,...props}:Props&{kind:keyof typeof paths}) {return <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[kind]}/></svg>;}
export const RecordArrow=(props:Props)=><Glyph kind="arrow" {...props}/>;
export const RecordBook=(props:Props)=><Glyph kind="book" {...props}/>;
export const RecordComplete=(props:Props)=><Glyph kind="complete" {...props}/>;
export const RecordWarning=(props:Props)=><Glyph kind="warning" {...props}/>;
export const RecordMinus=(props:Props)=><Glyph kind="minus" {...props}/>;
export const RecordFiles=(props:Props)=><Glyph kind="files" {...props}/>;
