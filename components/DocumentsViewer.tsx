"use client";
import {useState} from "react";
import {Card,CardContent} from "@/components/ui/card";
import {Tabs,TabsContent,TabsList,TabsTrigger} from "@/components/ui/tabs";
import {FamilySymbol} from "@/components/ui/FamilySymbol";
import {DocumentReader} from "@/components/readers/DocumentReader";
export interface DocumentRecord {_id:string;type:"PS"|"CST";title:string;contentMarkdown:string;updatedAt:string|number;}
/** Already owner-scoped server records. Never re-fetch or infer an author/model receipt. */
export function DocumentsViewer({documents,error=null}:{documents:DocumentRecord[];error?:string|null}) {
 const [selected,setSelected]=useState(documents[0]?._id);
 const active=documents.some(doc=>doc._id===selected)?selected:documents[0]?._id;
 if(error)return <Card><CardContent className="p-8 text-center"><FamilySymbol name="alert" className="mx-auto mb-4 size-10 text-annotation"/><h3 className="mb-2 text-lg font-medium">Documents Unavailable</h3><p className="text-muted-foreground">{error}</p></CardContent></Card>;
 if(documents.length===0)return <Card><CardContent className="p-8 text-center"><FamilySymbol name="document" className="mx-auto mb-4 size-10 text-muted-foreground"/><h3 className="mb-2 text-lg font-medium">No Documents Yet</h3><p className="text-muted-foreground">Generate a Person Sheet (PS) or Complete Source Transcription (CST) to see them here.</p></CardContent></Card>;
 return <Tabs value={active} onValueChange={setSelected} className="w-full min-w-0"><TabsList className="h-auto max-w-full justify-start overflow-x-auto">{documents.map(doc=><TabsTrigger key={doc._id} value={doc._id} className="min-h-11 shrink-0">{doc.type==="PS"?"Person Sheet":"CST"}</TabsTrigger>)}</TabsList>{documents.map(doc=><TabsContent key={doc._id} value={doc._id}><DocumentReader key={`${doc._id}:${doc.updatedAt}`} markdown={doc.contentMarkdown} title={doc.title} filename={`${doc.title}.md`} prefix={`stored-${Array.from(doc._id).map(c=>c.codePointAt(0)!.toString(16)).join("-")}`} kind={doc.type==="CST"?"raw":"stored"} provenance={{recordId:doc._id,updatedAt:doc.updatedAt}} embedded copyLabel="Copy Markdown"/></TabsContent>)}</Tabs>;
}
