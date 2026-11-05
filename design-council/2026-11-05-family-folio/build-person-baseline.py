"""Original Person route JSX under current runtime, with invented data. Not an original-stack capture."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
def original(path):return subprocess.check_output(['git','show',f'99980b5:{path}'],cwd=root,text=True)
header=original('components/vault/PersonHeader.tsx').replace('export function PersonHeader','export function BaselinePersonHeader')
(root/'components/design/BaselinePersonHeader.tsx').write_text(header)
s=original('app/app/people/[personId]/page.tsx');imports=s[:s.index('interface PageProps')]
imports='\n'.join(line for line in imports.splitlines() if not any(token in line for token in ['import { notFound','getAuthedConvexClient','getConvexRuntimeIssue','getVaultAccessContext','import { VaultStateCard']))
imports=imports.replace('import { api }','import type { api }').replace('import type { FunctionReturnType } from "convex/server";','').replace('import { PersonHeader } from "@/components/vault/PersonHeader";','import { BaselinePersonHeader as PersonHeader } from "@/components/design/BaselinePersonHeader";')
imports+='\nimport type {PersonWorkspace} from "@/components/vault/PersonWorkspaceView";\nimport type {DocumentRecord} from "@/components/DocumentsViewer";\n'
body=s[s.index('  const routeId ='):]
body=body.replace('<MediaPrivacyReviewPanel media={media} personId={String(workspace.person._id)} />','<fieldset disabled><MediaPrivacyReviewPanel media={media} personId={String(workspace.person._id)} /></fieldset>').replace('<ResearchChecksPanel\n','<fieldset disabled><ResearchChecksPanel\n').replace('checks={workspace.researchChecks}\n              />','checks={workspace.researchChecks}\n              /></fieldset>').replace('<ContextItemsPanel personIdentifier={routeId} contextItems={contextItems} />','<fieldset disabled><ContextItemsPanel personIdentifier={routeId} contextItems={contextItems} readonlyPreview/></fieldset>')
result='/** Reconstructed original route JSX; synthetic data and current shared runtime. Mutations disabled. */\n'+imports+'\nexport function BaselinePersonWorkspace({workspace,personId,documents,documentsError}:{workspace:PersonWorkspace;personId:string;documents:DocumentRecord[];documentsError:string|null}) {\n'+body
(root/'components/design/BaselinePersonWorkspace.tsx').write_text(result)
print('Reconstructed original Person JSX; no backend reads.')
