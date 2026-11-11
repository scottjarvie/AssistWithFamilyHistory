"use client";

import { useMemo, useState, type FormEvent } from "react";
import { formatBytes, type Enforcement, type LimitName, type UsageCounters, type UsageLimits } from "@/convex/lib/usageLimits/core";
import styles from "./usage-limits.module.css";

/**
 * Upload limits, for admins. Numbers only — never a file name or content; an
 * account appears by the same account ID the Accounts tab shows, shortened.
 * Phone first; a dense table from 900 px.
 */

export type UsagePerson = {
  id: string;
  policy?:{planStoredBytes:Record<string,number>;maxFileBytes:Record<string,number>};
  label: string;
  ready: boolean;
  counters: UsageCounters;
  limits: UsageLimits;
  enforcement: Enforcement;
  pressureBp: number;
  override: (Partial<UsageLimits> & { enforcement?: Enforcement; reason: string }) | null;
};

export type UsageOverview = {
  site: { planStoredBytes?:Record<string,number>; maxFileBytes?:Record<string,number>; limits: UsageLimits; enforcement: Enforcement; downloadEnforcement: Enforcement; saved: boolean };
  people: UsagePerson[];
  truncated: boolean;
  events: Array<{ id: string; at: number; label: string; limit: string; mode: Enforcement; source: string; used: number; cap: number }>;
  audit: Array<{ id: string; at: number; target: string; field: string; before?: number | string; after?: number | string; reason: string }>;
};

export type LimitEdit = { limits: Partial<Record<LimitName, number | null>>; enforcement?: Enforcement | null; reason: string };

type Props = {
  data: UsageOverview;
  busy: boolean;
  onSaveSite: (edit: LimitEdit) => Promise<void>;
  onSavePerson: (id: string, edit: LimitEdit) => Promise<void>;
};

/** How each limit is typed in: bytes are edited in GB or KB, counts as counts. */
const FIELDS: Array<{ name: LimitName; label: string; unit: "GB" | "KB" | "count" }> = [
  { name: "storedBytesPerUser", label: "Personal stored allowance", unit: "GB" },
  { name: "uploadsPerHour", label: "Uploads an hour", unit: "count" },
  { name: "uploadsPerDay", label: "Uploads a day", unit: "count" },
  { name: "uploadBytesPerDay", label: "Uploaded a day", unit: "GB" },
  { name: "downloadBytesPerDay", label: "Download budget a day", unit: "GB" },
  { name: "maxUploadsInFlight", label: "Uploads at once", unit: "count" },
  { name: "mcpBatchMaxItems", label: "AI batch: items per call", unit: "count" },
  { name: "mcpBatchMaxBytes", label: "AI batch: size per call", unit: "KB" },
];

const SCALE = { GB: 1e9, KB: 1e3, count: 1 } as const;
const toInput = (value: number, unit: keyof typeof SCALE) => String(+(value / SCALE[unit]).toFixed(3));
const fromInput = (text: string, unit: keyof typeof SCALE) => Math.round(Number(text) * SCALE[unit]);

const MODE_WORDS: Record<Enforcement, { title: string; detail: string }> = {
  off: { title: "Limits are off", detail: "Uploads are counted, nothing is refused, and anything over a limit is noted below." },
  warn: { title: "Limits warn", detail: "Nothing is refused. Uploads over a limit are noted below so you can check the numbers first." },
  on: { title: "Limits are on", detail: "An upload over a limit is refused with a plain message and the time it resets. Nothing is lost." },
};

const MODE_LABEL: Record<Enforcement, string> = { off: "Off", warn: "Warn", on: "On" };
const count = (n: number) => n.toLocaleString("en-US");
const bytes = (n: number) => (n === 0 ? "0" : formatBytes(n));
const time = (at: number) => new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function meters(person: UsagePerson) {
  const { counters: c, limits: l } = person;
  return [
    { key: "stored", label: "Stored", used: c.storedBytes + c.reservedBytes, cap: l.storedBytesPerUser, text: `${bytes(c.storedBytes + c.reservedBytes)} of ${formatBytes(l.storedBytesPerUser)}` },
    { key: "hour", label: "This hour", used: c.hourUploads, cap: l.uploadsPerHour, text: `${count(c.hourUploads)} of ${count(l.uploadsPerHour)}` },
    { key: "day", label: "Today", used: c.dayUploads, cap: l.uploadsPerDay, text: `${count(c.dayUploads)} of ${count(l.uploadsPerDay)}` },
    { key: "bytes", label: "Uploaded today", used: c.dayUploadBytes, cap: l.uploadBytesPerDay, text: `${bytes(c.dayUploadBytes)} of ${formatBytes(l.uploadBytesPerDay)}` },
    { key: "down", label: "Downloaded today", used: c.dayDownloadBytes, cap: l.downloadBytesPerDay, text: `${bytes(c.dayDownloadBytes)} of ${formatBytes(l.downloadBytesPerDay)}` },
  ];
}

function standing(person: UsagePerson): { word: string; tone: "" | "near" | "at" } {
  if (!person.ready) return { word: "Counting…", tone: "" };
  if (person.pressureBp >= 10_000) return { word: "At limit", tone: "at" };
  if (person.pressureBp >= 8_000) return { word: "Near limit", tone: "near" };
  return { word: "OK", tone: "" };
}

function Meter({ used, cap }: { used: number; cap: number }) {
  const share = cap > 0 ? Math.min(1, used / cap) : used > 0 ? 1 : 0;
  const tone = share >= 1 ? styles.at : share >= 0.8 ? styles.near : "";
  return (
    <span className={styles.track} aria-hidden="true">
      <span className={`${styles.fill} ${tone}`} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
    </span>
  );
}

function LimitsForm({
  idPrefix,
  limits,
  personal,
  enforcement,
  busy,
  submitLabel,
  onSave,
}: {
  idPrefix: string;
  limits: UsageLimits;
  personal?: Partial<UsageLimits> | null;
  enforcement?: Enforcement | null;
  busy: boolean;
  submitLabel: string;
  onSave: (edit: LimitEdit) => Promise<void>;
}) {
  const initial = Object.fromEntries(FIELDS.map((f) => [
    f.name,
    personal ? (personal[f.name] === undefined ? "" : toInput(personal[f.name]!, f.unit)) : toInput(limits[f.name], f.unit),
  ])) as Record<LimitName, string>;
  const [values, setValues] = useState(initial);
  const [dirty,setDirty]=useState<Set<LimitName>>(new Set());
  const [mode, setMode] = useState<string>(enforcement ?? "");
  const [reason, setReason] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const edit: LimitEdit = { limits: {}, reason };
    for (const f of FIELDS) {
      if(!dirty.has(f.name) || (personal === undefined && f.name === "storedBytesPerUser")) continue;
      const text = values[f.name].trim();
      if (text === initial[f.name]) continue;
      // An empty personal box goes back to the site value; an empty site box changes nothing.
      if (text === "") {
        // A blank edit leaves the existing override unchanged.
        continue;
      }
      edit.limits[f.name] = fromInput(text, f.unit);
    }
    if (personal !== undefined && mode !== (enforcement ?? "")) edit.enforcement = mode === "" ? null : (mode as Enforcement);
    await onSave(edit);
    setReason("");
    setDirty(new Set());
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.fields}>
        {FIELDS.filter(f=>personal !== undefined || f.name !== "storedBytesPerUser").map((f) => (
          <label key={f.name} htmlFor={`${idPrefix}-${f.name}`}>
            <span>{f.label}{f.unit === "count" ? "" : ` (${f.unit})`}</span>
            <input
              id={`${idPrefix}-${f.name}`}
              inputMode="decimal"
              value={values[f.name]}
              placeholder={personal ? `Site: ${toInput(limits[f.name], f.unit)}` : undefined}
              onChange={(event) => {setDirty(new Set([...dirty,f.name]));setValues({ ...values, [f.name]: event.target.value });}}
            />
          </label>
        ))}
        {personal !== undefined ? (
          <label htmlFor={`${idPrefix}-mode`}>
            <span>Limits for this person</span>
            <select id={`${idPrefix}-mode`} value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="">Same as the site</option>
              <option value="off">Off</option>
              <option value="warn">Warn</option>
              <option value="on">On</option>
            </select>
          </label>
        ) : null}
        <label htmlFor={`${idPrefix}-reason`} className={styles.wide}>
          <span>Why (kept in the history)</span>
          <input id={`${idPrefix}-reason`} required value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
      </div>
      {personal ? <p className={styles.hint}>Leave a box empty to use the site value.</p> : null}
      <button type="submit" className="v2-button v2-button--primary" disabled={busy || !reason.trim()}>{submitLabel}</button>
    </form>
  );
}

function PersonEditor({ people, site, busy, onSavePerson }: { people: UsagePerson[]; site: UsageLimits; busy: boolean; onSavePerson: Props["onSavePerson"] }) {
  const [chosen, setChosen] = useState("");
  const person = people.find((p) => p.id === chosen);
  return (
    <details className={styles.disclosure}>
      <summary>Edit personal limits</summary>
      <label className={styles.search} htmlFor="usage-person">
        <span>Person</span>
        <select id="usage-person" value={chosen} onChange={(event) => setChosen(event.target.value)}>
          <option value="">Choose a person</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.label}{p.override ? " (personal limits set)" : ""}</option>)}
        </select>
      </label>
      {person ? (
        <>
          {person.override ? <p className={styles.hint}>Set because: {person.override.reason}</p> : null}
          <LimitsForm
            key={person.id}
            idPrefix={`d-${person.id}`}
            limits={site}
            personal={person.override ?? {}}
            enforcement={person.override?.enforcement ?? null}
            busy={busy}
            submitLabel="Save personal limits"
            onSave={(edit) => onSavePerson(person.id, edit)}
          />
        </>
      ) : null}
    </details>
  );
}

export function UsageLimitsView({ data, busy, onSaveSite, onSavePerson }: Props) {
  const [search, setSearch] = useState("");
  const [pendingMode, setPendingMode] = useState<Enforcement | null>(null);
  const [modeReason, setModeReason] = useState("");
  const people = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? data.people.filter((p) => p.label.toLowerCase().includes(term)) : data.people;
  }, [data.people, search]);
  const words = MODE_WORDS[data.site.enforcement];
  const flagged = data.people.filter((p) => standing(p).tone !== "").length;
  const l = data.site.limits;

  return (
    <section className="v2c-block" aria-labelledby="ops-usage">
      <div className={`v2c-block-head ${styles.head}`}>
        <div>
          <p className={styles.kicker}>Upload limits</p>
          <h2 className="v2s-h2" id="ops-usage">{words.title}</h2>
        </div>
        <span className={`${styles.pill} ${flagged ? styles.pillAttention : ""}`}>{flagged ? `${flagged} near a limit` : "nobody near a limit"}</span>
      </div>
      <p className={`v2s-plain-body ${styles.lede}`}>{words.detail} Only file uploads are limited; text and records never are, and AI connections are never cut off.</p>

      <div className={styles.siteCard}>
        <fieldset className={styles.modes} disabled={busy}>
          <legend>Site limits</legend>
          {(["off", "warn", "on"] as const).map((mode) => (
            <label key={mode} className={data.site.enforcement === mode ? styles.modeOn : ""}>
              <input
                type="radio"
                name="site-enforcement"
                checked={(pendingMode ?? data.site.enforcement) === mode}
                onChange={() => setPendingMode(mode === data.site.enforcement ? null : mode)}
              />
              {MODE_LABEL[mode]}
            </label>
          ))}
        </fieldset>
        {pendingMode ? (
          <form
            className={styles.confirm}
            onSubmit={async (event) => {
              event.preventDefault();
              await onSaveSite({ limits: {}, enforcement: pendingMode, reason: modeReason });
              setPendingMode(null);
              setModeReason("");
            }}
          >
            <label htmlFor="site-mode-reason">
              <span>Why turn limits {MODE_LABEL[pendingMode].toLowerCase()}? (kept in the history)</span>
              <input id="site-mode-reason" required value={modeReason} onChange={(event) => setModeReason(event.target.value)} />
            </label>
            <div className={styles.actions}>
              <button type="submit" className="v2-button v2-button--primary" disabled={busy || !modeReason.trim()}>Turn limits {MODE_LABEL[pendingMode].toLowerCase()}</button>
              <button type="button" className="v2-button" onClick={() => { setPendingMode(null); setModeReason(""); }}>Cancel</button>
            </div>
          </form>
        ) : null}
        <p className={styles.siteLine}>
          {Object.entries(data.site.planStoredBytes ?? {}).map(([plan,cap])=>`${plan}: ${formatBytes(cap)}`).join(" · ")} stored per person · {count(l.uploadsPerHour)} uploads an hour · {count(l.uploadsPerDay)} a day ·
          {" "}{formatBytes(l.uploadBytesPerDay)} uploaded a day · {formatBytes(l.downloadBytesPerDay)} download budget · {count(l.maxUploadsInFlight)} at once ·
          {" "}AI batches {count(l.mcpBatchMaxItems)} items / {formatBytes(l.mcpBatchMaxBytes)} per call
        </p>
        <p className={styles.hint}>Downloads only ever warn for now.{data.site.saved ? "" : " These are the family defaults; nothing has been changed here yet."}</p>
        <details className={styles.disclosure}>
          <summary>Edit site limits</summary>
          <LimitsForm idPrefix="site" limits={l} busy={busy} submitLabel="Save site limits" onSave={onSaveSite} />
        </details>
      </div>

      {data.people.length === 0 ? (
        <p className={styles.empty}>No account has uploaded a file since counting started. Accounts appear here after their first upload.</p>
      ) : (
        <>
          <label className={styles.search} htmlFor="usage-search">
            <span>Find an account</span>
            <input id="usage-search" type="search" value={search} placeholder="Last characters of the account ID" onChange={(event) => setSearch(event.target.value)} />
          </label>
          <p className={styles.hint}>
            {people.length} of {data.people.length} accounts, closest to a limit first.{data.truncated ? " Showing the first 500." : ""}
          </p>

          <ul className={styles.cards}>
            {people.map((person) => {
              const state = standing(person);
              return (
                <li key={person.id} className={state.tone ? styles[state.tone] : ""}>
                  <div className={styles.cardHead}>
                    <strong>{person.label}</strong>
                    <span className={styles.badge}>{state.word}</span>
                  </div>
                  <dl className={styles.meters}>
                    {meters(person).map((m) => (
                      <div key={m.key}>
                        <dt>{m.label}</dt>
                        <dd>
                          <span>{m.text}</span>
                          <Meter used={m.used} cap={m.cap} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <details className={styles.disclosure}>
                    <summary>{person.override ? "Personal limits (set)" : "Personal limits"}</summary>
                    {person.override ? <p className={styles.hint}>Set because: {person.override.reason}</p> : null}
                    <LimitsForm
                      idPrefix={`p-${person.id}`}
                      limits={data.site.limits}
                      personal={person.override ?? {}}
                      enforcement={person.override?.enforcement ?? null}
                      busy={busy}
                      submitLabel="Save personal limits"
                      onSave={(edit) => onSavePerson(person.id, edit)}
                    />
                  </details>
                </li>
              );
            })}
          </ul>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Upload usage per person, closest to a limit first</caption>
              <thead>
                <tr>
                  <th scope="col">Person</th>
                  <th scope="col">Stored</th>
                  <th scope="col">Uploads this hour</th>
                  <th scope="col">Uploads today</th>
                  <th scope="col">Uploaded today</th>
                  <th scope="col">Downloaded today</th>
                  <th scope="col">Standing</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const state = standing(person);
                  return (
                    <tr key={person.id} className={state.tone ? styles[state.tone] : ""}>
                      <th scope="row">{person.label}{person.override ? <small> · personal limits</small> : null}</th>
                      {meters(person).map((m) => (
                        <td key={m.key}><span>{m.text}</span><Meter used={m.used} cap={m.cap} /></td>
                      ))}
                      <td>{state.word}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <PersonEditor people={people} site={data.site.limits} busy={busy} onSavePerson={onSavePerson} />
          </div>
        </>
      )}

      <details className={styles.disclosure}>
        <summary>History: {data.events.length} limit notes this week · {data.audit.length} changes</summary>
        {data.events.length ? (
          <ul className={styles.list}>
            {data.events.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.label} · {event.limit}</strong>
                  <p>{event.mode === "on" ? "Refused" : "Would have been refused"} · {count(event.used)} of {count(event.cap)} · {event.source} · {time(event.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={styles.hint}>No upload went over a limit this week.</p>}
        {data.audit.length ? (
          <ul className={styles.list}>
            {data.audit.map((entry) => (
              <li key={entry.id}>
                <div>
                  <strong>{entry.target} · {entry.field}: {String(entry.before ?? "site value")} → {String(entry.after ?? "site value")}</strong>
                  <p>{entry.reason} · {time(entry.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <p className={styles.hint}>No limit has been changed yet.</p>}
      </details>
    </section>
  );
}
