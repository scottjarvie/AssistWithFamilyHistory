"""Original Queue JSX with invented data/current shared runtime. All writes disabled."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[2]
s=subprocess.check_output(['git','show','cf9ef0e:components/queue/QueueWorkspace.tsx'],text=True,cwd=root)
s=s.replace('export function QueueWorkspace() {','export function BaselineQueueWorkspace({preview}:{preview:QueuePreview}) {')
s=s.replace('type QueueListResponse =','import type {QueuePreview} from "@/components/queue/QueueWorkspace";\nconst readonlyPreview=true;\n\ntype QueueListResponse =',1)
s=s.replace('      const response = await fetch(`/api/queue?${params}`, { cache: "no-store" });\n      const payload = (await response.json()) as QueueListResponse;','''      const response=new Response(null,{status:200});
      const page=preview.items.filter(item=>stateFilter==="all"||item.state===stateFilter);
      const payload:QueueListResponse={success:true,surfaceState:"ready",page,isDone:true,continueCursor:""};''')
s=s.replace('      const response = await fetch(`/api/queue/${id}?${params}`, { cache: "no-store" });\n      const payload = (await response.json()) as QueueDetailResponse;','''      const response=new Response(null,{status:200});
      const item=preview.items.find(item=>item._id===id)!;
      const payload:QueueDetailResponse={success:true,surfaceState:"ready",item,activity:{page:preview.activity[id]||[],isDone:true,continueCursor:""}};''')
s=s.replace('  }, [stateFilter]);','  }, [stateFilter,preview]);').replace('  }, []);','  }, [preview]);')
s=s.replace('    event.preventDefault();','    event.preventDefault();\n    if(readonlyPreview)return;').replace('  function deleteItem() {','  function deleteItem() {\n    if(readonlyPreview)return;')
# Semantic wrapper adaptation avoids nested main landmarks in the preview harness.
s=s.replace('<main className="queue-ledger','<fieldset disabled className="min-w-0 border-0 p-0"><div className="queue-ledger').replace('</main>','</div></fieldset>')
(root/'components/design/BaselineQueueWorkspace.tsx').write_text('/** Reconstructed original Queue JSX. Invented data/current runtime, all controls disabled. */\n'+s)
print('Original Queue presentation reconstructed with synthetic read-only data.')
