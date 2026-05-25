import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowLeft } from "lucide-react";
import { StoryWriterStudio } from "@/components/vault/StoryWriterStudio";

interface PageProps {
  params: Promise<{ personId: string }>;
}

export const dynamic = "force-dynamic";

export default async function PersonStoryWriterPage({ params }: PageProps) {
  const { personId } = await params;

  return (
    <div className="p-4 sm:p-8">
      <Link href={`/app/people/${personId}`} className="mb-5 inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900">
        <ArrowLeft className="h-4 w-4" />
        Back to Person Workspace
      </Link>
      <StoryWriterStudio personId={personId} />
    </div>
  );
}
