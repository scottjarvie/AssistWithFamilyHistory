/**
 * Raw Document Page
 * 
 * Purpose: Display and download the raw evidence document
 * 
 * Key Elements:
 * - Markdown viewer
 * - Download button
 * - Copy button
 * 
 * Dependencies:
 * - @/features/source-docs/lib/rawDocGenerator
 * - @/features/source-docs/lib/schemas
 * 
 * Last Updated: Initial setup
 */

"use client";

import { useState, useEffect, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Download, 
  Copy, 
  Check,
  FileText,
  AlertTriangle
} from "lucide-react";
import { SafeLink as Link } from "@/components/layout/SafeLink";
import { toast } from "sonner";
import { EvidencePack } from "@/features/source-docs/lib/schemas";
import { generateRawDocument } from "@/features/source-docs/lib/rawDocGenerator";

interface PageProps {
  params: Promise<{ personId: string }>;
}

export default function RawDocumentPage({ params }: PageProps) {
  const { personId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("run");

  const [loading, setLoading] = useState(true);
  const [markdown, setMarkdown] = useState<string>("");
  const [personName, setPersonName] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [emptyState, setEmptyState] = useState<{ title: string; description: string } | null>(null);

  useEffect(() => {
    async function fetchAndGenerate() {
      try {
        // Get person data to find the run
        const personResponse = await fetch(`/api/people/${personId}`);
        const personData = await personResponse.json();
        
        if (!personData.success) {
          router.push("/app/people");
          return;
        }

        setPersonName(personData.person?.name || personId);
        const targetRunId = runId || personData.latestRunId;
        
        if (!targetRunId) {
          setEmptyState({
            title: "Raw document needs a stored capture run",
            description: personData.vaultOnly
              ? "This person exists in the canonical vault, but the legacy raw-evidence document flow only works when a stored FamilySearch capture run is available."
              : "Import a FamilySearch capture package first so the legacy raw document flow has a stored run to work from.",
          });
          setLoading(false);
          return;
        }

        // Fetch the legacy source capture artifact
        const packResponse = await fetch(
          `/api/people/${personId}/runs/${targetRunId}/pack`
        );
        
        if (!packResponse.ok) {
          // Try to read from file storage directly via API
          const fallbackResponse = await fetch(
            `/api/people/${personId}/raw?run=${targetRunId}`
          );
          
          if (fallbackResponse.ok) {
            const data = await fallbackResponse.json();
            setMarkdown(data.markdown);
            setPersonName(data.personName || personId);
          } else {
            const fallbackPayload = await fallbackResponse.json().catch(() => null);
            setEmptyState({
              title: "Raw document unavailable",
              description:
                fallbackPayload?.error || "Could not load the legacy source capture for this run.",
            });
          }
          setLoading(false);
          return;
        }

        const packData = await packResponse.json();
        const pack = packData.pack as EvidencePack;
        
        // Generate the raw document
        const doc = generateRawDocument(pack);
        setMarkdown(doc);
        setPersonName(pack.person.name || personId);

      } catch (error) {
        console.error("Error generating raw document:", error);
        setEmptyState({
          title: "Raw document unavailable",
          description: "Error generating raw document.",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchAndGenerate();
  }, [personId, runId, router]);

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${personName.replace(/\s+/g, "-")}-raw-evidence.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded raw document");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-stone-400">
        Generating raw document...
      </div>
    );
  }

  if (emptyState) {
    return (
      <div className="p-4 sm:p-8">
        <Card className="border-orange-300 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-900">
              <AlertTriangle className="h-5 w-5" />
              {emptyState.title}
            </CardTitle>
            <CardDescription className="text-orange-800">{emptyState.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild className="bg-amber-700 hover:bg-amber-800">
              <Link href={`/api/people/${personId}/context-pack?format=markdown`}>Download Context Pack</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/people/${personId}/story-writer`}>Open Story Writer</Link>
            </Button>
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
      {/* Header */}
      <div className="mb-6 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Link 
            href={`/app/people/${personId}`}
            className="inline-flex items-center gap-1 text-stone-500 hover:text-stone-900 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {personName}
          </Link>
          <h1 className="text-2xl font-bold text-stone-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-amber-700" />
            Raw Evidence Document
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? (
              <Check className="w-4 h-4 mr-2" />
            ) : (
              <Copy className="w-4 h-4 mr-2" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button 
            onClick={handleDownload}
            className="bg-amber-700 hover:bg-amber-800"
          >
            <Download className="w-4 h-4 mr-2" />
            Download .md
          </Button>
        </div>
      </div>

      {/* Document Content */}
      <Card>
        <CardContent className="p-6">
          <pre className="whitespace-pre-wrap font-mono text-sm text-stone-700 leading-relaxed">
            {markdown}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
