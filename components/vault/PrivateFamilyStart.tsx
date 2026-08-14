"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Link2, LockKeyhole, PencilLine, Sparkles } from "lucide-react";
import { SafeLink } from "@/components/layout/SafeLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type LivingState = "" | "living" | "deceased";
type Relationship = "parent" | "child" | "partner";
type Stage = "details" | "review" | "saved";

type PersonDraft = {
  given: string;
  surname: string;
  living: LivingState;
};

type SavedStart = {
  personPath: string;
  startingPersonId: string;
  relatedPersonId: string;
  relationshipId: string;
};

const emptyPerson: PersonDraft = { given: "", surname: "", living: "" };

function displayName(person: PersonDraft) {
  return [person.given.trim(), person.surname.trim()].filter(Boolean).join(" ");
}

function relationshipSentence(first: string, second: string, relationship: Relationship) {
  if (relationship === "parent") return `${second} is ${first}'s parent.`;
  if (relationship === "child") return `${second} is ${first}'s child.`;
  return `${second} is ${first}'s spouse or partner.`;
}

function PersonFields({
  heading,
  person,
  onChange,
}: {
  heading: string;
  person: PersonDraft;
  onChange: (next: PersonDraft) => void;
}) {
  const fieldPrefix = heading === "First person" ? "first" : "related";
  return (
    <fieldset className="border border-[#d8c7a7] bg-[#fffaf2] p-5 shadow-[0_12px_30px_rgba(70,55,35,0.06)] sm:p-6">
      <legend className="px-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900">
        {heading}
      </legend>
      <div className="mt-2 grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${fieldPrefix}-given`}>Given name</Label>
          <Input
            id={`${fieldPrefix}-given`}
            value={person.given}
            onChange={(event) => onChange({ ...person, given: event.target.value })}
            autoComplete="off"
            maxLength={100}
            className="min-h-11 bg-white"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${fieldPrefix}-surname`}>Family or last name <span className="text-stone-500">(optional)</span></Label>
          <Input
            id={`${fieldPrefix}-surname`}
            value={person.surname}
            onChange={(event) => onChange({ ...person, surname: event.target.value })}
            autoComplete="off"
            maxLength={100}
            className="min-h-11 bg-white"
          />
        </div>
      </div>
      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-stone-900">Are they living?</legend>
        <p className="mt-1 text-sm leading-6 text-stone-600">Choose explicitly. Family History never guesses from age or dates.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["living", "deceased"] as const).map((value) => (
            <label
              key={value}
              className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-3 text-sm font-medium transition ${
                person.living === value
                  ? "border-[#234d5e] bg-[#e7f0ed] text-[#173c49]"
                  : "border-stone-200 bg-white text-stone-700 hover:border-[#c57d39]"
              }`}
            >
              <input
                type="radio"
                name={`${fieldPrefix}-living`}
                value={value}
                checked={person.living === value}
                onChange={() => onChange({ ...person, living: value })}
                required
              />
              {value === "living" ? "Yes, living" : "No, deceased"}
            </label>
          ))}
        </div>
      </fieldset>
    </fieldset>
  );
}

export function PrivateFamilyStart() {
  const [stage, setStage] = useState<Stage>("details");
  const [startingPerson, setStartingPerson] = useState<PersonDraft>(emptyPerson);
  const [relatedPerson, setRelatedPerson] = useState<PersonDraft>(emptyPerson);
  const [relationship, setRelationship] = useState<Relationship>("parent");
  const [createHandoff, setCreateHandoff] = useState(false);
  const [directive, setDirective] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoffWarning, setHandoffWarning] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedStart | null>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);

  const firstName = displayName(startingPerson) || "the first person";
  const secondName = displayName(relatedPerson) || "the related person";
  const detailsComplete =
    Boolean(startingPerson.given.trim()) &&
    Boolean(relatedPerson.given.trim()) &&
    Boolean(startingPerson.living) &&
    Boolean(relatedPerson.living) &&
    (!createHandoff || Boolean(directive.trim()));

  function moveTo(next: Stage) {
    setStage(next);
    setError(null);
    requestAnimationFrame(() => stageHeading.current?.focus());
  }

  async function saveStart() {
    if (!detailsComplete) return;
    setIsSaving(true);
    setError(null);
    setHandoffWarning(null);
    const operationId = crypto.randomUUID();
    try {
      const response = await fetch("/api/first-start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId,
          startingPerson: {
            given: startingPerson.given,
            surname: startingPerson.surname || undefined,
            living: startingPerson.living === "living",
          },
          relatedPerson: {
            given: relatedPerson.given,
            surname: relatedPerson.surname || undefined,
            living: relatedPerson.living === "living",
          },
          relationship,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Nothing was saved. Please try again.");
      }

      setSaved(result);
      if (createHandoff) {
        const queueResponse = await fetch("/api/queue", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            directive: directive.trim(),
            requestedOutcome: `Leave a sourced finding in the private workspace for ${firstName} and ${secondName}.`,
            context: [
              { kind: "person", refId: result.startingPersonId },
              { kind: "person", refId: result.relatedPersonId },
              { kind: "relationship", refId: result.relationshipId },
            ],
            idempotencyKey: `${operationId}:first-handoff`,
          }),
        });
        if (!queueResponse.ok) {
          setHandoffWarning("The people and relationship were saved, but the optional AI handoff was not. You can create it from Your Queue without re-entering the family records.");
        }
      }
      moveTo("saved");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Nothing was saved. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (stage === "saved" && saved) {
    return (
      <section className="border border-[#b8cbbf] bg-[#f7fbf8] p-6 shadow-[0_24px_60px_rgba(35,77,94,0.12)] sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#234d5e] text-white">
          <Check className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 ref={stageHeading} tabIndex={-1} className="mt-5 font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-900 outline-none">
          Your first family connection is saved.
        </h2>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          {relationshipSentence(firstName, secondName, relationship)} Both people now live in your normal private workspace. This is a starting statement, not sourced evidence yet.
        </p>
        {createHandoff && !handoffWarning ? (
          <p className="mt-4 border-l-2 border-[#c57d39] pl-4 text-sm leading-6 text-stone-700">
            Your chosen handoff is waiting in Your Queue. Nothing runs until your AI picks it up.
          </p>
        ) : null}
        {handoffWarning ? <p role="alert" className="mt-4 border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{handoffWarning}</p> : null}
        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button asChild className="min-h-11 bg-[#234d5e] hover:bg-[#173c49]">
            <SafeLink href={saved.personPath}>Open {firstName}&apos;s workspace <ArrowRight className="ml-2 h-4 w-4" /></SafeLink>
          </Button>
          {createHandoff ? (
            <Button asChild variant="outline" className="min-h-11 bg-white">
              <SafeLink href="/app/queue">Open Your Queue</SafeLink>
            </Button>
          ) : (
            <Button asChild variant="outline" className="min-h-11 bg-white">
              <SafeLink href="/ai">Connect your AI later</SafeLink>
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section>
        <div className="mb-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500" aria-label={`Step ${stage === "details" ? 1 : 2} of 2`}>
          <span className={stage === "details" ? "text-[#234d5e]" : "text-stone-400"}>1 · People</span>
          <span aria-hidden="true">—</span>
          <span className={stage === "review" ? "text-[#234d5e]" : "text-stone-400"}>2 · Review</span>
        </div>

        {stage === "details" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (detailsComplete) moveTo("review");
            }}
            className="space-y-6"
          >
            <div>
              <h2 ref={stageHeading} tabIndex={-1} className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-900 outline-none">
                Who belongs in this first connection?
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-stone-600">Names and living status are enough. Dates, places, sources, and details can come later.</p>
            </div>

            <PersonFields heading="First person" person={startingPerson} onChange={setStartingPerson} />

            <fieldset className="border-y border-[#d8c7a7] py-6">
              <legend className="px-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900">Their known relationship</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {([
                  ["parent", "Their parent"],
                  ["child", "Their child"],
                  ["partner", "Spouse or partner"],
                ] as const).map(([value, label]) => (
                  <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 border px-4 py-3 text-sm font-medium ${relationship === value ? "border-[#234d5e] bg-[#e7f0ed] text-[#173c49]" : "border-stone-200 bg-white text-stone-700 hover:border-[#c57d39]"}`}>
                    <input type="radio" name="relationship" value={value} checked={relationship === value} onChange={() => setRelationship(value)} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <PersonFields heading="Related person" person={relatedPerson} onChange={setRelatedPerson} />

            <fieldset className="border border-[#d8c7a7] bg-[#f3ede0] p-5 sm:p-6">
              <legend className="px-2 font-[family-name:var(--font-cormorant-garamond)] text-2xl font-semibold text-stone-900">Would you like to leave this for your AI?</legend>
              <label className="mt-2 flex min-h-12 cursor-pointer items-start gap-3 text-sm leading-6 text-stone-700">
                <input type="checkbox" className="mt-1" checked={createHandoff} onChange={(event) => setCreateHandoff(event.target.checked)} />
                <span><strong className="text-stone-900">Create an optional Queue handoff.</strong> Leave this off to save only the family records. Your AI receives nothing unless you choose this.</span>
              </label>
              {createHandoff ? (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="handoff-directive">What should your AI help with?</Label>
                  <Textarea id="handoff-directive" value={directive} onChange={(event) => setDirective(event.target.value)} maxLength={4000} rows={4} required placeholder="Find and compare sources that could support this relationship. Save a sourced finding, and keep uncertainty visible." className="bg-white" />
                  <p className="text-xs leading-5 text-stone-500">This creates a private Queue directive attached to the two people and their relationship. It does not start work by itself.</p>
                </div>
              ) : null}
            </fieldset>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button asChild variant="ghost" className="min-h-11">
                <SafeLink href="/app">Cancel</SafeLink>
              </Button>
              <Button type="submit" disabled={!detailsComplete} className="min-h-11 bg-[#234d5e] hover:bg-[#173c49]">
                Review this connection <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        ) : (
          <section className="border border-[#d8c7a7] bg-[#fffaf2] p-6 shadow-[0_24px_60px_rgba(70,55,35,0.1)] sm:p-8">
            <h2 ref={stageHeading} tabIndex={-1} className="font-[family-name:var(--font-cormorant-garamond)] text-4xl font-semibold text-stone-900 outline-none">Review before saving</h2>
            <p className="mt-2 leading-7 text-stone-600">Nothing has been written yet. Correct anything now, or cancel without leaving a record.</p>

            <div className="relative mt-8 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <div className="border border-stone-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">First person</p>
                <p className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl font-semibold text-stone-900">{displayName(startingPerson)}</p>
                <p className="mt-1 text-sm text-stone-600">{startingPerson.living === "living" ? "Living" : "Deceased"}</p>
              </div>
              <div className="flex h-11 items-center justify-center rounded-full bg-[#234d5e] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                <Link2 className="mr-2 h-4 w-4" /> {relationship}
              </div>
              <div className="border border-stone-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Related person</p>
                <p className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-3xl font-semibold text-stone-900">{displayName(relatedPerson)}</p>
                <p className="mt-1 text-sm text-stone-600">{relatedPerson.living === "living" ? "Living" : "Deceased"}</p>
              </div>
            </div>
            <p className="mt-4 text-center text-sm font-medium text-stone-700">{relationshipSentence(firstName, secondName, relationship)}</p>

            <div className="mt-7 grid gap-3 border-y border-[#d8c7a7] py-5 text-sm leading-6 text-stone-700 sm:grid-cols-2">
              <p className="flex gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#234d5e]" /><span><strong>Private by default.</strong> This does not share or publish either person.</span></p>
              <p className="flex gap-3"><PencilLine className="mt-0.5 h-5 w-5 shrink-0 text-[#9f5a2d]" /><span><strong>A starting statement.</strong> It remains visibly unsourced until evidence is attached.</span></p>
              <p className="flex gap-3 sm:col-span-2"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-[#c57d39]" /><span><strong>{createHandoff ? "Chosen handoff." : "No AI handoff."}</strong> {createHandoff ? "Your directive will wait in Your Queue after these records save." : "No family details will be sent to an AI. You can choose that later."}</span></p>
            </div>

            {error ? <p role="alert" className="mt-5 border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-900">{error}</p> : null}

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button asChild variant="ghost" className="min-h-11"><SafeLink href="/app">Cancel</SafeLink></Button>
                <Button type="button" variant="outline" disabled={isSaving} onClick={() => moveTo("details")} className="min-h-11 bg-white">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Correct details
                </Button>
              </div>
              <Button type="button" disabled={isSaving} onClick={saveStart} className="min-h-11 bg-[#234d5e] hover:bg-[#173c49]">
                {isSaving ? "Saving privately…" : "Save this private connection"}
              </Button>
            </div>
          </section>
        )}
      </section>

      <aside className="h-fit border-t-4 border-[#c57d39] bg-[#1f2f35] p-6 text-stone-100 xl:sticky xl:top-24">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d9cdb5]">The boundary</p>
        <h2 className="mt-3 font-[family-name:var(--font-cormorant-garamond)] text-3xl font-semibold">Known is not yet proven.</h2>
        <div className="mt-5 space-y-4 text-sm leading-6 text-stone-300">
          <p>You are recording what you currently understand about two people and their connection.</p>
          <p>A source, document, or memory can support it later. Until then, the workspace keeps the relationship marked as an unsourced starting statement.</p>
          <p>Living-person details deserve extra care. They stay private and are never inferred, shared, published, or handed to an AI by this form.</p>
        </div>
      </aside>
    </div>
  );
}
