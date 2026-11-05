"""Reconstruct original Operations JSX with invented rows/current shared runtime."""
from pathlib import Path
import subprocess
source=subprocess.check_output(['git','show','76b04ba:app/app/operations/page.tsx'],text=True)
imports='''import {SafeLink as Link} from "@/components/layout/SafeLink";
import {Bot,Filter,FolderSearch,Gauge,LogIn,Search,Sparkles,TableProperties,Upload} from "lucide-react";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardDescription,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {OperationRowActions} from "@/components/vault/OperationRowActions";
import {operationFixtures} from "./OperationsFixture";
'''
body=source[source.index('  const hasActiveFilters'):]
body=body.replace('  const isGuestVault = accessContext.mode === "anonymous";', '  const isGuestVault = false;')
body=body.replace('accessContext.mode', 'mode')
body=body.replace('<OperationRowActions','<OperationRowActions readonlyPreview')
body=body.replace('Object.entries(params)', 'Object.entries(params)')
fixture='''export function BaselineOperations(){
const params:Record<string,string|undefined>={}; const mode="local" as string;const visibleCount=50,page=1;
const rows=operationFixtures.map(r=>({id:r.id,rowType:r.rowType,personIdentifier:r.personIdentifier,displayName:r.name,lifespan:r.lifespan,keyPlaces:r.places,completionPercent:r.coverage,sourceCount:r.sources,memoryCount:r.memories,documentCount:r.documents,contextReportCount:r.context,storyCount:r.stories,storyWorkflow:r.workflow,missingCritical:r.missing,nextActions:r.nextActions,staleChecksCount:r.stale,anchorPersonIdentifier:r.anchor,badge:r.badge}));
const queue={rows,summary:{visibleRows:4,provisionalRows:1,missingRequired:8,missingRecommended:2,staleChecks:2,averageCompletion:75}};
'''
Path('components/design/BaselineOperations.tsx').write_text('/** Original route JSX at76b04ba; invented data/current runtime, no canonical backend. */\n'+imports+fixture+body)
