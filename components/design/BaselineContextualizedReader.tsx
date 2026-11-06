"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import {ArrowLeft,Download,Copy,Check,FileText,AlertTriangle} from "lucide-react";
import {SafeLink as Link} from "@/components/layout/SafeLink";
import {toast} from "sonner";
export function BaselineContextualizedReader({markdown,personName,personId,runId=null,activeRunId=runId,loading=false,error=null,errorStatus=null}:{markdown:string;personName:string;personId:string;runId?:string|null;activeRunId?:string|null;loading?:boolean;error?:string|null;errorStatus?:string|null}) {
  const [copied,setCopied]=useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const fileName = `${(personName || personId).replace(/\s+/g, "-")}-contextualized.md`;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded contextualized dossier");
  };

  if (loading) {
    return <div className="p-8 text-center text-stone-400">Loading contextualized dossier...</div>;
  }

  if (error) {
    return (
      <div className="p-4 sm:p-8">
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="w-5 h-5" />
              Dossier Not Available
            </CardTitle>
            <CardDescription className="text-orange-800">{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {errorStatus === "vault_only" ? (
              <>
                <Button asChild className="bg-amber-700 hover:bg-amber-800">
                  <Link href={`/api/people/${personId}/context-pack?format=markdown`}>
                    Download Context Pack
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href={`/app/people/${personId}/story-writer`}>Open Story Writer</Link>
                </Button>
              </>
            ) : (
              <Button asChild className="bg-amber-700 hover:bg-amber-800">
                <Link href={`/app/people/${personId}/ai${runId ? `?run=${runId}` : ""}`}>
                  Generate in AI Analysis
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href={`/app/people/${personId}`}>Back to Person Workspace</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8">
      <Link
        href={`/app/people/${personId}`}
        className="mb-4 inline-flex items-center gap-1 text-stone-500 hover:text-stone-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {personName}
      </Link>

      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-900">
            <FileText className="w-6 h-6 text-amber-700" />
            Contextualized Dossier
          </h1>
          <p className="mt-1 text-stone-500">
            Run: <span className="font-mono">{activeRunId}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button onClick={handleDownload} className="bg-amber-700 hover:bg-amber-800">
            <Download className="w-4 h-4 mr-2" />
            Download .md
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-stone-700">
            {markdown}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
