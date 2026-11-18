import { KEEPS } from "./content";

// Small original line drawings: each record has its own silhouette and a real text label.
const paths = [
  "M14 15a6 6 0 1 0 12 0a6 6 0 1 0-12 0M8 39v-5c0-11 24-11 24 0v5M32 10a5 5 0 0 1 0 10M35 26c9 0 10 7 10 13",
  "M10 6l26 1 5 34-31 2ZM16 15h15M16 22h18M16 29h14M16 36h10",
  "M7 7h17v17H7ZM28 25h17v17H28ZM13 15h5M33 33h6M22 32l-7 8M30 8l8 8m0-8-8 8",
  "M9 5h29v38H9ZM18 16c0-9 16-9 16 0 0 6-8 6-8 12M26 34v1",
  "M5 7h25v30H5ZM10 15h13M10 22h9M10 29h8M29 29a9 9 0 1 0 18 0a9 9 0 1 0-18 0M44 36l6 9",
  "M5 18l13-5 15 5 13-5v27l-13 5-15-5-13 5ZM18 13v27M33 18v27M21 10a5 5 0 1 1 10 0c0 5-5 9-5 9s-5-4-5-9Z",
  "M4 9c10-3 16-1 22 3 6-4 13-6 22-3v31c-9-3-16-1-22 3-6-4-12-6-22-3ZM26 12v31M10 17l10 2M10 25l10 2M32 19l10-2M32 27l10-2",
];
export function RecordMap() {
  return <figure className="fh-record-map" aria-label="Records kept in Assist With Family History">
    <ul>{KEEPS.map((keep, i) => <li key={keep.name}>
      <svg viewBox="0 0 54 50" aria-hidden="true"><path d={paths[i]} /></svg>
      <strong>{keep.name}</strong><p>{keep.text}</p>
    </li>)}</ul>
    <svg className="fh-inward" viewBox="0 0 700 45" preserveAspectRatio="none" aria-hidden="true"><path d="M50 2Q50 23 340 34M150 2Q150 20 340 34M250 2l90 32M350 2v32M450 2l-90 32M550 2Q550 20 360 34M650 2Q650 23 360 34M340 27l10 14 10-14" /></svg>
    <figcaption><strong>Assist With Family History</strong><span>Your private research desk · connected, sourced, yours</span></figcaption>
  </figure>;
}
