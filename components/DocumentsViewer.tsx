"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, Copy, Check, AlertTriangle } from "lucide-react";

export interface DocumentRecord {
  _id: string;
  type: "PS" | "CST";
  title: string;
  contentMarkdown: string;
  updatedAt: string | number;
}

interface DocumentsViewerProps {
  /**
   * Documents rendered on the server and passed in as a prop. The page already
   * loads these alongside the vault snapshot, so the client component no longer
   * re-fetches over REST — it only handles copy/download/tab interactions.
   */
  documents: DocumentRecord[];
  /**
   * Optional message when the documents store is unavailable (e.g. Convex not
   * configured). When set, an "unavailable" state renders instead of the list.
   */
  error?: string | null;
}

export function DocumentsViewer({ documents, error = null }: DocumentsViewerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (text: string, filename: string) => {
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-orange-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-stone-900 mb-2">Documents Unavailable</h3>
          <p className="text-stone-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="w-12 h-12 text-stone-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-stone-900 mb-2">No Documents Yet</h3>
          <p className="text-stone-500">
            Generate a Person Sheet (PS) or Complete Source Transcription (CST) to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue={documents[0]._id} className="w-full">
      <TabsList className="w-full justify-start">
        {documents.map((doc) => (
          <TabsTrigger key={doc._id} value={doc._id}>
            {doc.type === "PS" ? "Person Sheet" : "CST"}
          </TabsTrigger>
        ))}
      </TabsList>

      {documents.map((doc) => (
        <TabsContent key={doc._id} value={doc._id}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>{doc.title}</CardTitle>
                <CardDescription>
                  Updated {new Date(doc.updatedAt).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(doc.contentMarkdown, doc._id)}
                >
                  {copiedId === doc._id ? (
                    <Check className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  {copiedId === doc._id ? "Copied" : "Copy Markdown"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(doc.contentMarkdown, `${doc.title}.md`)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-stone-50 rounded-lg p-6 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                {doc.contentMarkdown}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
