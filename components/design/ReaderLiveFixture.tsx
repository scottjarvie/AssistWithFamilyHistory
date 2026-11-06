"use client";
import {useSearchParams} from "next/navigation";
import {SafeLink} from "@/components/layout/SafeLink";
import {DocumentReaderController} from "@/components/readers/DocumentReaderController";
export function ReaderLiveFixture({kind}:{kind:"raw"|"contextualized"}) {
 const params=useSearchParams();
 const surface=`reader-${kind}-live-controller`;
 return <><nav aria-label="Synthetic request controls" className="flex flex-wrap gap-3 border-b border-border p-3 text-xs"><SafeLink className="inline-flex min-h-11 items-center text-primary underline" href={`/design-council-preview?surface=${surface}&readerPerson=synthetic-reader-other&readerRun=synthetic-other-run`}>Other invented person</SafeLink><SafeLink className="inline-flex min-h-11 items-center text-primary underline" href={`/design-council-preview?surface=${surface}&readerPerson=${encodeURIComponent(params.get("readerPerson")||"synthetic-reader")}&readerRun=synthetic-second-run`}>Other invented run</SafeLink></nav><DocumentReaderController kind={kind} personId={params.get("readerPerson")||"synthetic-reader"} runId={params.get("readerRun")} focusSource={params.get("source")||undefined}/></>;
}
