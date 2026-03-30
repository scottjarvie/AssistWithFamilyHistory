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
import { Card, CardContent } from "@/components/ui/card";
import { 
  ArrowLeft, 
  Download, 
  Copy, 
  Check,
  FileText
} from "lucide-react";
import Link from "next/link";
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

        const targetRunId = runId || personData.latestRunId;
        
        if (!targetRunId) {
          setMarkdown("No extraction runs found for this person.");
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
            setMarkdown("Could not load the legacy source capture for this run.");
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
        setMarkdown("Error generating raw document.");
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
