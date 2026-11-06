"""Original Place/Story JSX with synthetic data under current shared runtime; not frozen original captures."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
def original(path):return subprocess.check_output(['git','show',f'99980b5:{path}'],cwd=root,text=True)
place=original('app/app/places/[placeId]/page.tsx')
body=place[place.index('  const eventYears'):]
body=body.replace('<ContextReportForm','<fieldset disabled className="min-w-0"><ContextReportForm').replace('endYear={endYear}\n              />','endYear={endYear}\n                readonlyPreview\n              /></fieldset>')
imports='''import { SafeLink as Link } from "@/components/layout/SafeLink";
import { ArrowLeft, BookOpen, ImageIcon, MapPinned, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ContextReportForm } from "@/components/vault/ContextReportForm";
import type {PlaceWorkspace} from "@/components/vault/PlaceWorkspaceView";
'''
(root/'components/design/BaselinePlaceWorkspace.tsx').write_text('/** Original JSX with invented records and current shared runtime; mutations disabled. */\n'+imports+'export function BaselinePlaceWorkspace({workspace}:{workspace:PlaceWorkspace}) {\n'+body)
story=original('app/app/stories/[storyId]/page.tsx')
head=story[:story.index('export const metadata')]
head=head.replace('import { notFound } from "next/navigation";\n','').replace('import type { Metadata } from "next";\n','')
head='\n'.join(line for line in head.splitlines() if not any(token in line for token in ['import { api }','import type { Id }','import { VaultStateCard','getAuthedConvexClient','getConvexRuntimeIssue','getConvexUnavailableState','isConvexConfigured','} from "@/lib/convex/server";','import { createPageMetadata','import { getVaultAccessContext']))
head=head.replace('import {\nimport { assessStoryPublishReadiness','import { assessStoryPublishReadiness')
head+='\nimport type {StoryReviewBundle} from "@/components/vault/StoryReviewView";\n'
helpers=story[story.index('const statusTone'):story.index('export default async function StoryReviewPage')]
body=story[story.index('  const {\n    story,'):]
body=body.replace('<StoryStatusActions','<fieldset disabled className="min-w-0"><StoryStatusActions').replace('publishReadiness={publishReadiness}\n            />','publishReadiness={publishReadiness}\n            /></fieldset>')
body=body.replace('<StoryReviewAssignmentForm','<fieldset disabled className="min-w-0"><StoryReviewAssignmentForm').replace('secondReviewedAt={story.secondReviewedAt}\n              />','secondReviewedAt={story.secondReviewedAt}\n              /></fieldset>')
body=body.replace('<StoryEditorForm','<StoryEditorForm readonlyPreview')
(root/'components/design/BaselineStoryReview.tsx').write_text('/** Original JSX with invented records and current shared runtime; mutations disabled. */\n'+head+'\n'+helpers+'\nexport function BaselineStoryReview({bundle}:{bundle:StoryReviewBundle}) {\n'+body)
print('Reconstructed Place/Story original JSX; current shared runtime, invented data, no backend reads.')
