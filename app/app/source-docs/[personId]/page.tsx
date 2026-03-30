import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ personId: string }>;
}

export default async function LegacyPersonSourceDocsPage({ params }: PageProps) {
  const { personId } = await params;
  redirect(`/app/people/${personId}`);
}

