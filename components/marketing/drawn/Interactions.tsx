"use client";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
export { HomeTheme, ThemeSwitch } from "./HomeTheme";
import { PARTS, KEEPS } from "./content";
import { PartPicture } from "./PartPicture";
import { FaqList } from "../FamilyHistoryFaq";
const IdeasDialog = dynamic(() => import("./IdeasDialog"), { ssr: false });
export function IdeasButton({
  id,
  total = 6,
}: {
  id?: string;
  total?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        className="fh-more"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
      >
        {id ? "1 idea" : `All ${total} ideas`} →
      </button>
      {loaded && (
        <IdeasDialog
          id={id}
          open={open}
          onOpenChange={setOpen}
          returnFocus={ref}
        />
      )}
    </>
  );
}
function walk(event: KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  ];
  const i = buttons.indexOf(event.target as HTMLButtonElement);
  if (i < 0) return;
  const n =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (i + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) %
          buttons.length;
  event.preventDefault();
  buttons[n].focus();
  buttons[n].click();
}
function Panel({ part }: { part: (typeof PARTS)[number] }) {
  return (
    <div className="fh-panel">
      <PartPicture kind={part.picture} />
      <div>
        <h3>{part.name}</h3>
        <div className="fh-tags">
          {part.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <IdeasButton id={part.id} />
      </div>
      <dl>
        <div>
          <dt>Your AI</dt>
          <dd>{part.ai}</dd>
        </div>
        <div>
          <dt>Kept here</dt>
          <dd>{part.kept}</dd>
        </div>
      </dl>
    </div>
  );
}
export function Parts() {
  const [selected, setSelected] = useState(0);
  const [opened, setOpened] = useState<number | null>(0);
  return (
    <>
      <div className="fh-desktop">
        <div
          className="fh-stepper"
          onKeyDown={walk}
          role="group"
          aria-label="Parts of family history"
        >
          {PARTS.map((part, i) => (
            <button
              key={part.id}
              aria-pressed={selected === i}
              aria-controls="fh-part-panel"
              onClick={() => setSelected(i)}
            >
              <span aria-hidden="true" />
              {part.name}
            </button>
          ))}
        </div>
        <div id="fh-part-panel" aria-live="polite">
          <Panel part={PARTS[selected]} />
        </div>
      </div>
      <div className="fh-accordion">
        {PARTS.map((part, i) => (
          <div className="fh-fold" key={part.id}>
            <h3>
              <button
                aria-expanded={opened === i}
                aria-controls={`fh-panel-${part.id}`}
                onClick={() => setOpened(opened === i ? null : i)}
              >
                {part.name}
                <span aria-hidden="true">{opened === i ? "−" : "+"}</span>
              </button>
            </h3>
            <div id={`fh-panel-${part.id}`} hidden={opened !== i}>
              <Panel part={part} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
export function ItKeeps() {
  const [selected, setSelected] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLParagraphElement>(null);
  const measure = useCallback(() => {
    const box = row.current;
    const card = note.current;
    const chip = box?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!box || !card || !chip) return;
    const c = chip.offsetLeft + chip.offsetWidth / 2;
    const left =
      innerWidth >= 1000
        ? Math.max(
            0,
            Math.min(
              c - card.offsetWidth / 2,
              box.offsetWidth - card.offsetWidth,
            ),
          )
        : 0;
    card.style.marginLeft = `${left}px`;
    card.style.setProperty(
      "--pointer",
      `${Math.max(18, Math.min(c - left, card.offsetWidth - 18))}px`,
    );
  }, []);
  useLayoutEffect(measure, [measure, selected]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    void document.fonts.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  return (
    <div className="fh-keeps" ref={row}>
      <div
        className="fh-chips"
        onKeyDown={walk}
        role="group"
        aria-label="It keeps · pick one"
      >
        <b>
          It keeps · <span>pick one</span>
        </b>
        {KEEPS.map((keep, i) => (
          <button
            key={keep.name}
            aria-pressed={selected === i}
            aria-controls="fh-keep-note"
            onClick={() => setSelected(i)}
          >
            {keep.name}
          </button>
        ))}
      </div>
      <p id="fh-keep-note" className="fh-note" ref={note} aria-live="polite">
        <b>{KEEPS[selected].name}.</b> {KEEPS[selected].text}
      </p>
    </div>
  );
}
export function Faq() {
  return <section className="fh-faq" aria-labelledby="fh-faq-heading">
    <h2 id="fh-faq-heading">Questions before you begin</h2>
    <FaqList />
  </section>;
}
