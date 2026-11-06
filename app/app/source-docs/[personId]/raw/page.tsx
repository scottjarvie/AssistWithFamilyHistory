"use client";
import {use} from "react";
import {useSearchParams} from "next/navigation";
import {DocumentReaderController} from "@/components/readers/DocumentReaderController";
export default function RawDocumentPage({params}:{params:Promise<{personId:string}>}) {
 const {personId}=use(params),search=useSearchParams();
 return <DocumentReaderController personId={personId} runId={search.get("run")} focusSource={search.get("source")||undefined} kind="raw"/>;
}
