/** Paper and research objects only: no people, graves, verdicts or sensitive imagery. */
export function PartPicture({ kind }: { kind: string }) {
  const frames: Record<string, React.ReactNode> = {
    household: (
      <>
        <path
          className="g-ft"
          d="M32 26h92v65H32Z"
          transform="translate(3 3)"
        />
        <path className="g-i" d="M32 26h92v65H32ZM32 43h92M59 43v48M91 43v48" />
        <path
          className="g-i g-thin"
          d="M40 55h11M67 55h16M99 55h16M40 69h11M67 69h16M99 69h16M40 80h11M67 80h16"
        />
      </>
    ),
    question: (
      <>
        <path
          className="g-fk"
          d="M35 18h72v78H35Z"
          transform="translate(3 3)"
        />
        <path className="g-i" d="M35 18h72v78H35Z" />
        <path className="g-i g-thin" d="M46 34h47M46 44h34M46 75h28" />
        <circle className="g-fb" cx="107" cy="66" r="20" />
        <circle className="g-i" cx="104" cy="63" r="20" />
        <path className="g-i" d="M118 78l18 20" />
      </>
    ),
    queue: (
      <>
        <path
          className="g-fw"
          d="M30 30h55v65H30Z"
          transform="rotate(-7 50 60)"
        />
        <path
          className="g-fk"
          d="M57 20h64v77H57Z"
          transform="translate(3 3)"
        />
        <path className="g-i" d="M57 20h64v77H57ZM67 38h41M67 53h31M67 68h37" />
        <path className="g-i g-ia" d="M22 63h20m-7-7 7 7-7 7" />
      </>
    ),
    place: (
      <>
        <path
          className="g-fw"
          d="M20 30l40-10 40 12 35-8v64l-35 8-40-12-40 10Z"
          transform="translate(3 3)"
        />
        <path
          className="g-i"
          d="M20 30l40-10 40 12 35-8v64l-35 8-40-12-40 10ZM60 20v64M100 32v64"
        />
        <path
          className="g-i g-ia g-dash"
          d="M32 74c22-50 35 0 48-18s25-18 40-12"
        />
      </>
    ),
    photo: (
      <>
        <path
          className="g-fm"
          d="M23 19h97v74H23Z"
          transform="rotate(-6 70 50)"
        />
        <path
          className="g-fk"
          d="M28 25h100v73H28Z"
          transform="translate(3 3)"
        />
        <path className="g-i" d="M28 25h100v73H28ZM38 35h57v39H38Z" />
        <path className="g-ft" d="M40 68l13-19 12 10 12-15 16 24Z" />
        <path
          className="g-i g-thin"
          d="M103 40h15M103 50h15M103 60h10M39 85h68"
        />
      </>
    ),
    story: (
      <>
        <path
          className="g-fk"
          d="M20 24q30-12 58 2 28-14 60-2v65q-30-10-60 0-30-10-58 0Z"
          transform="translate(3 3)"
        />
        <path
          className="g-i"
          d="M20 24q30-12 58 2 28-14 60-2v65q-30-10-60 0-30-10-58 0ZM78 26v63"
        />
        <path
          className="g-i g-thin"
          d="M30 40q19-6 38 0M30 52q19-6 38 0M30 64q19-6 30 0M88 40q19-6 38 0M88 52q19-6 38 0M88 64q19-6 30 0"
        />
      </>
    ),
  };
  return (
    <svg
      className="drawn part-picture"
      viewBox="0 0 160 110"
      aria-hidden="true"
      focusable="false"
    >
      <g filter="url(#fh-rough)">
        {frames[kind]}
        <use href="#fh-quiet" x="115" y="0" width="38" height="38" />
      </g>
    </svg>
  );
}
