import {BaselineRawReader} from "./BaselineRawReader";
import {BaselineContextualizedReader} from "./BaselineContextualizedReader";
import {BaselineDocumentsViewer} from "./BaselineDocumentsViewer";
import {readerRaw,readerContextualized,readerPack,readerDocuments} from "./readerFixtures";
import {ReaderLiveFixture} from "./ReaderLiveFixture";
import {DocumentReader} from "@/components/readers/DocumentReader";
import {DocumentsViewer} from "@/components/DocumentsViewer";
export function ReadersFixture({surface,focusSource}:{surface:string;focusSource?:string}) {
 const baseline=surface.startsWith("baseline-"),kind=surface.replace(/^baseline-/,"");
 if(!baseline&&kind.endsWith("live-controller"))return <ReaderLiveFixture kind={kind.includes("contextualized")?"contextualized":"raw"}/>;
 if(kind==="reader-documents"||kind.startsWith("reader-documents-"))return <div className="p-4 sm:p-8">{baseline?<BaselineDocumentsViewer documents={readerDocuments}/>:<DocumentsViewer documents={kind.endsWith("empty")?[]:readerDocuments} error={kind.endsWith("error")?"Invented unavailable document store. No real read was made.":null}/>}</div>;
 const missing=kind.endsWith("missing"),raw=kind.startsWith("reader-raw");
 if(baseline)return raw?<BaselineRawReader markdown={readerRaw} personName="Eleanor Finch" personId="synthetic-reader" emptyState={missing?{title:"Raw document needs a stored capture run",description:"This person exists in the canonical vault, but the legacy raw-evidence document flow only works when a stored FamilySearch capture run is available."}:null}/>:<BaselineContextualizedReader markdown={readerContextualized} personName="Eleanor Finch" personId="synthetic-reader" runId={readerPack.runId} error={missing?"This person is in the vault, but no stored extraction run is available for the legacy contextualized dossier flow yet.":null} errorStatus="vault_only"/>;
 const extra=kind.endsWith("long")?`\n\n## Long literal content\n\n${"A_long_invented_reference_".repeat(60)}\n\n![Invented private image](https://images.example.test/must-not-auto-load.png)\n\n<script>window.__readerUnsafe=true</script>\n\n~~~markdown\n## This is code, not a section\n- Not a citation _(sources: NOT-A-REAL-CITATION)_\n~~~\n`:"";
 return <div className="mx-auto max-w-[1200px] p-4 sm:p-6 lg:p-8"><DocumentReader markdown={(raw?readerRaw:readerContextualized)+extra} title={raw?"Raw Evidence Document":"Contextualized Dossier"} filename={raw?"Eleanor-Finch-raw-evidence.md":"Eleanor-Finch-contextualized.md"} focusSource={raw?focusSource:undefined} prefix={raw?"raw-document":"contextualized-document"} kind={raw?"raw":"contextualized"} provenance={raw?{runId:readerPack.runId,capturedAt:readerPack.capturedAt,extractorVersion:readerPack.extractorVersion,formatter:true}:{runId:readerPack.runId}} sources={raw?readerPack.sources.map(s=>({id:s.id,title:s.title,attachedBy:s.attachedBy,attachedAt:s.attachedAt,webPageUrl:s.webPageUrl})):undefined} rawHref={raw?undefined:`/app/people/synthetic-reader/raw?run=${readerPack.runId}`}/></div>;
}
