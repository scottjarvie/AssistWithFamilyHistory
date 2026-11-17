/**
 * The home page's drawings (design council 2026-11-16, take G "Drawn by hand",
 * picked by Scott). Ported from the prototype's inline SVG, line for line.
 *
 * One hand draws everything: a 2.2 stroke, round caps, an offset fill under
 * each shape, and a light turbulence filter so no line is ruler-straight. The
 * classes (`g-i` ink, `g-f*` fills, `g-ib` the AI's blue) and their colours
 * live in `home.css` under `.drawn`, so the drawings follow the theme.
 *
 * The small blue spark is "your AI" everywhere on the page. It names no AI
 * product. `DrawingDefs` is rendered once per page: it holds the filters and
 * the spark, and every drawing below refers to them by id.
 *
 * Every drawing is decoration (`aria-hidden`): the words beside each one say
 * the same thing.
 */

type DrawingProps = { className?: string };

const SPARK_LINE = {
  fill: "none",
  stroke: "var(--draw-ai)",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const cls = (extra?: string) => (extra ? `drawn ${extra}` : "drawn");

export function DrawingDefs() {
  return (
    <svg
      width="0"
      height="0"
      className="drawn-defs"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter id="fh-rough" x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.045"
            numOctaves="2"
            seed="7"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="2.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        <filter id="fh-rough-b" x="-3%" y="-12%" width="106%" height="124%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018"
            numOctaves="2"
            seed="3"
            result="n"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="3.2"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
        {/* The spark ("your AI"). Styled inline, not by class: a `<use>` copy
            inherits from where it is used, but stylesheet classes do not reach
            it, so the colours come through the inherited --draw-* values. */}
        <symbol id="fh-bud" viewBox="-27 -27 54 54" overflow="visible">
          <path
            style={{ fill: "var(--draw-ai-fill)" }}
            transform="translate(2.500 2.500)"
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <path
            style={SPARK_LINE}
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <circle
            style={{ fill: "var(--draw-ai)" }}
            cx="-4.500"
            cy="-1.500"
            r="1.700"
          />
          <circle
            style={{ fill: "var(--draw-ai)" }}
            cx="4.500"
            cy="-1.500"
            r="1.700"
          />
          <path
            style={{ ...SPARK_LINE, strokeWidth: 1.7 }}
            d="M-3.500 4q3.500 3 7 0"
          />
        </symbol>{" "}
        <symbol id="fh-quiet" viewBox="-27 -27 54 54" overflow="visible">
          <path
            style={{ fill: "var(--draw-ai-fill)" }}
            transform="translate(2.500 2.500)"
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <path
            style={SPARK_LINE}
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <circle
            style={{ fill: "var(--draw-ai)" }}
            cx="-4.500"
            cy="-3.000"
            r="1.700"
          />
          <circle
            style={{ fill: "var(--draw-ai)" }}
            cx="4.500"
            cy="-3.000"
            r="1.700"
          />
          <path style={{ ...SPARK_LINE, strokeWidth: 1.7 }} d="M-3.500 5h7" />
        </symbol>
      </defs>
    </svg>
  );
}

/** The header picture: your AI filing a tagged find in the Family History card box. */
export function HeroDrawing({ className }: DrawingProps) {
  return (
    <svg
      className={cls(className)}
      viewBox="0 0 320 220"
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#fh-rough)">
        <path className="g-i g-im" d="M118 208h192" />
        <path
          className="g-fk"
          transform="translate(3 3)"
          d="M152 98h12v-10h30v10h66v56H152Z"
        />
        <path className="g-i" d="M152 98h12v-10h30v10h66v56H152Z" />
        <path className="g-i g-thin g-im" d="M172 110h40M172 118h26" />
        <path
          className="g-fw"
          transform="translate(3 3)"
          d="M144 112h64v-10h30v10h30v50H144Z"
        />
        <path className="g-i" d="M144 112h64v-10h30v10h30v50H144Z" />
        <path
          className="g-fk"
          transform="translate(3 3)"
          d="M138 124h20v-9h30v9h86v40H138Z"
        />
        <path className="g-i" d="M138 124h20v-9h30v9h86v40H138Z" />
        <path
          className="g-fa"
          transform="translate(4 4)"
          d="M130 138h160l-7 68H137Z"
        />
        <path className="g-i" d="M130 138h160l-7 68H137Z" />
        <rect x="176" y="154" width="68" height="34" rx="4" className="g-fl" />
        <path className="g-i g-thin" d="M176 154h68v34h-68Z" />
        <path className="g-fa" d="M186 180l3-17 9-2-3 17Z" />
        <path className="g-i g-thin" d="M207 166h28M207 175h19" />
        <path
          className="g-i g-ia"
          style={{ strokeDasharray: "3 7" }}
          d="M150 70C184 44 224 54 232 90"
        />
        <path className="g-i g-ia" d="M223 81l9 10 6-12" />
        <path className="g-i g-thin" d="M108 83Q96 80 88 70" />
        <g transform="rotate(14 124 83)">
          <path
            className="g-fk"
            transform="translate(2.5 2.5)"
            d="M112 70h30a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4h-30l-11-13Z"
          />
          <path
            className="g-i"
            d="M112 70h30a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4h-30l-11-13Z"
          />
          <circle
            className="g-i g-thin"
            cx="110"
            cy="83"
            r="2.400"
            style={{ fill: "var(--draw-card)" }}
          />
          <path className="g-i g-thin" d="M121 79h18M121 87h12" />
        </g>
        <path
          className="g-i g-ib g-thin"
          d="M22 26v12M16 32h12M118 22v8M114 26h8"
        />
        <use href="#fh-bud" x="18" y="26" width="88" height="88" />
      </g>
    </svg>
  );
}

export type AiFigureKind = "now" | "newer" | "other";

const AI_FIGURES: Record<
  AiFigureKind,
  { body: React.JSX.Element; cord: React.JSX.Element }
> = {
  now: {
    body: (
      <>
        <g filter="url(#fh-rough)">
          <use href="#fh-bud" x="-27" y="-27" width="54" height="54" />
        </g>
      </>
    ),
    cord: (
      <>
        <g filter="url(#fh-rough)">
          <path className="g-i g-ib" d="M9 1C5 12 13 22 9 35M3 28l6 9 6-9" />
        </g>
      </>
    ),
  },
  newer: {
    body: (
      <>
        <g filter="url(#fh-rough)">
          <path
            className="g-i g-im g-dash"
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <circle className="g-eyem" cx="-4.500" cy="-1.500" r="1.700" />
          <circle className="g-eyem" cx="4.500" cy="-1.500" r="1.700" />
          <path className="g-i g-im g-thin" d="M-3.500 4q3.500 3 7 0" />
          <path className="g-i g-im g-thin" d="M19-25v8M15-21h8" />
        </g>
      </>
    ),
    cord: (
      <>
        <g filter="url(#fh-rough)">
          <path className="g-i g-im g-dash g-thin" d="M9 1C5 12 13 22 9 36" />
        </g>
      </>
    ),
  },
  other: {
    body: (
      <>
        <g filter="url(#fh-rough)">
          <path
            className="g-i g-im g-dash"
            d="M-17-13h34v28h-34Z"
            transform="rotate(4)"
          />
          <circle className="g-eyem" cx="-4.500" cy="-1.500" r="1.700" />
          <circle className="g-eyem" cx="4.500" cy="-1.500" r="1.700" />
          <path className="g-i g-im g-thin" d="M-3.500 5q3.500 3 7 0M0-13v-8" />
          <circle className="g-eyem" cx="0" cy="-23" r="2.200" />
        </g>
      </>
    ),
    cord: (
      <>
        <g filter="url(#fh-rough)">
          <path className="g-i g-im g-dash g-thin" d="M9 1C5 12 13 22 9 36" />
        </g>
      </>
    ),
  },
};

/** In "Freedom to change AI tools": the AI you use today (the spark), or an outlined one you could switch to. */
export function AiFigure({
  kind,
  className,
}: DrawingProps & { kind: AiFigureKind }) {
  return (
    <svg
      className={cls(className)}
      viewBox="-30 -30 60 60"
      aria-hidden="true"
      focusable="false"
    >
      {AI_FIGURES[kind].body}
    </svg>
  );
}

/** The line from an AI down to the account: solid with an arrow for today's, dashed for the others. */
export function AiCord({
  kind,
  className,
}: DrawingProps & { kind: AiFigureKind }) {
  return (
    <svg
      className={cls(className)}
      viewBox="0 0 18 40"
      aria-hidden="true"
      focusable="false"
    >
      {AI_FIGURES[kind].cord}
    </svg>
  );
}

/** In the dark Connect band: the spark plugging into the Family History tag. */
export function ConnectDrawing({ className }: DrawingProps) {
  return (
    <svg
      className={cls(className)}
      viewBox="0 0 200 92"
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#fh-rough)">
        <g transform="translate(34 44) scale(1.25)">
          <path
            className="g-bf"
            transform="translate(2.500 2.500)"
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <path
            className="g-bi"
            d="M0-22C5-10 10-5 22 0 10 5 5 10 0 22-5 10-10 5-22 0-10-5-5-10 0-22Z"
          />
          <circle className="g-be" cx="-4.500" cy="-1.500" r="1.700" />
          <circle className="g-be" cx="4.500" cy="-1.500" r="1.700" />
          <path
            className="g-bi"
            style={{ strokeWidth: "1.5" }}
            d="M-3.500 4q3.500 3 7 0"
          />
        </g>
        <path className="g-bi" d="M60 52C76 74 92 26 112 46" />
        <path
          className="g-bi"
          d="M112 39h11v14h-11ZM123 42.500h6M123 49.500h6"
        />
        <circle className="g-bt" cx="165" cy="48" r="30" />
        <circle className="g-bs" cx="165" cy="48" r="23" />
        <path className="g-bs" d="M175 36l-5 18-15 8 5-18Z" />
      </g>
    </svg>
  );
}
