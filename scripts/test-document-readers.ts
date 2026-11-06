import {test} from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {FieldGuideMarkdown} from "../components/readers/FieldGuideMarkdown";
import {DocumentReader} from "../components/readers/DocumentReader";
import {documentSections,sourceAnchor,rawSourceHeading} from "../lib/readers/markdown";
import {readerPack,readerRaw,readerContextualized} from "../components/design/readerFixtures";

test("Reader notes bind to the actual cited paragraph, including tight/nested lists; code cannot create notes",()=>{
 const markdown='# Dossier\n\n- First claim _(sources: S1)_\n- Second claim _(confidence: low, sources: S2, S1)_\n  - Nested claim _(sources: S3)_\n\n> Quoted claim _(sources: S4)_\n\n~~~markdown\n- Not evidence _(sources: IN_CODE)_\n~~~\n';
 const html=renderToStaticMarkup(createElement(FieldGuideMarkdown,{markdown,prefix:"test",rawHref:"/app/people/invented/raw?run=selected"}));
 const notes=[...html.matchAll(/<aside[^>]*aria-label="Sources named in this paragraph"[^>]*>([\s\S]*?)<\/aside>/g)].map(m=>m[1]);
 assert.equal(notes.length,4);
 assert.match(notes[0],/>S1<\/p>/);assert.doesNotMatch(notes[0],/>S2<\/p>/);
 assert.match(notes[1],/>S2<\/p>/);assert.match(notes[1],/>S1<\/p>/);assert.doesNotMatch(notes[1],/>S3<\/p>/);
 assert.match(notes[2],/>S3<\/p>/);assert.match(notes[3],/>S4<\/p>/);
 assert.ok(notes.every(note=>!note.includes('IN_CODE')));
 assert.match(html,/run=selected&amp;source=S1#raw-document-source-53-31/);
 assert.match(html,/Not evidence/);
});

test("Reader Markdown never automatically requests remote images or activates raw HTML / source javascript",()=>{
 const markdown='### S1: Invented record {#S1}\n\n![Private image reference](https://images.example.test/no-fetch.png)\n\n<script>window.privateCanary=true</script>\n\n[Unsafe](javascript:alert(1))\n';
 const html=renderToStaticMarkup(createElement(FieldGuideMarkdown,{markdown,prefix:"safe",sources:[{id:"S1",title:"Invented record",webPageUrl:"javascript:alert(2)"}]}));
 assert.doesNotMatch(html,/<img\b|<script\b|href="javascript:/);
 assert.match(html,/Image reference: Private image reference/);
 assert.match(html,/href="https:\/\/images.example.test\/no-fetch.png"/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/id="safe-source-53-31"/);
 assert.doesNotMatch(html,/Open recorded source address/);
});

test("Section navigation excludes fenced and indented code and uses distinct safe source anchors",()=>{
 const markdown='# Title\n\n~~~text\n## Fake\n~~~\n\n    ## Also code\n\n### S1: Real source {#S1}\n\n## Last\n';
 const sections=documentSections(markdown,"doc");assert.deepEqual(sections.map(s=>s.label),['Title','S1: Real source','Last']);
 assert.equal(sections[1].id,sourceAnchor("doc","S1"));assert.equal(sections[2].offset,markdown.indexOf('## Last'));
 assert.equal(rawSourceHeading('S1: Mismatched {#S2}'),null);
 assert.notEqual(sourceAnchor("doc","/"),sourceAnchor("doc","_2F"));
 assert.notEqual(sourceAnchor("doc","a b"),sourceAnchor("doc","a-b"));
});

test("Generated capture and dossier reading preserve conflicts, diagnostic fields and truthful provenance",()=>{
 const raw=renderToStaticMarkup(createElement(DocumentReader,{title:"Raw Evidence Document",markdown:readerRaw,filename:"invented.md",prefix:"raw-document",kind:"raw",provenance:{formatter:true,capturedAt:readerPack.capturedAt,extractorVersion:readerPack.extractorVersion,runId:readerPack.runId},sources:readerPack.sources}));
 for(const field of ['Extraction Metadata','Source Key:','Type:','Attached by:','Reason:','Citation:','Tags:','Indexed Information','Extraction Diagnostics','Warnings','Errors','SYNTHETIC_NONFATAL','EXPAND_TIMEOUT','Bookbinder | working at home','failed after 2 attempt(s)'])assert.ok(raw.includes(field),field);
 assert.match(raw,/Deterministic capture formatter/);assert.match(raw,/Document version<\/dt><dd>Not supplied/);assert.match(raw,/synthetic-1.0/);
 const contextual=renderToStaticMarkup(createElement(DocumentReader,{title:"Contextualized Dossier",markdown:readerContextualized,filename:"invented.md",prefix:"context",kind:"contextualized"}));
 for(const field of ['Executive Summary','Verified Facts','Conflicts','Timeline','Research Suggestions','The census age points to1842.','The register gives1843.','confidence: low'])assert.ok(contextual.includes(field),field);
 assert.match(contextual,/Author and model not supplied by this document read/);
 assert.match(contextual,/Original Markdown/);
});
