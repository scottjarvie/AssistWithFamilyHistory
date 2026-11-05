"""Rebuild the run's local, newest-first capture gallery; no server needed."""
from pathlib import Path
from datetime import datetime, timezone
import html, json, base64, re, os, subprocess
run=Path(__file__).resolve().parent
rounds=sorted([p for p in run.glob('round-*') if re.fullmatch(r'round-\d+',p.name) and (p/'ours').exists()],key=lambda p:int(p.name.split('-')[1]),reverse=True)
sections=[('Settings matrices and key ledgers',run/'settings-matrices'),('Settings originals · reconstructed now',run/'settings-baseline'),('Audit lead refinements',run/'audit-review-fixes'),('Audit instruments',run/'audit-instruments'),('Audit original · reconstructed now',run/'audit-baseline'),('Shared collection and Queue refinements',run/'review-refinements'),('Research Operations collection',run/'operations-records'),('Queue navigation and review fixes',run/'queue-review-fixes'),('Personal Queue views and thread',run/'queue-records'),('Record reader review refinements',run/'record-review-fixes'),('Place and Story records',run/'place-story-records'),('Record review refinements',run/'record-stream/current'),('Person dossier and evidence stream',run/'record-stream/reviewed-c187b04'),('Activity, facets and Home refinements',run/'activity-facets'),('Collection review fixes',run/'collection-fixes')]+[(p.name,p/'ours') for p in rounds]+[('Starting collections · reconstructed now',run/'baseline-reconstructed'),('Starting page · now',run/'baseline')]
images=[]; blocks=[]
score_file=run/'scores.json'
score_data=json.loads(score_file.read_text()) if score_file.exists() else {}
params=json.loads((run/'params.json').read_text())
weights={c['key']:c.get('weight',1) for c in params.get('categories',[])}
def score_line(title):
 if title=='Settings matrices and key ledgers': return 'Newest Settings batch · all original grant/provider/key operations retained; intercepted synthetic acceptance only, independent exact-head review pending; no formal score'
 if title=='Settings originals · reconstructed now': return 'Original Settings route/client JSX with invented records under current shared runtime · reconstructed comparison, not historical production captures'
 if title=='Audit lead refinements': return 'Newest lead fixes from Opus030963f · compact drawer, count units, coverage ratios, real Next navigation and retry verified; next meaningful review with Settings; no formal score'
 if title=='Audit instruments': return 'Reviewed at030963f · preservation/privacy/data path accepted; required instrument/drawer refinements in newest tranche, original reviewed images retained'
 if title=='Audit original · reconstructed now': return 'Original Audit route JSX with invented data/current shared runtime · reconstructed comparison, not a historical frozen capture'
 if title=='Shared collection and Queue refinements': return 'Reviewed and accepted by Opus030963f · desktop fit, staged facets and visible-order Queue navigation; original reviewed images retained'
 if title=='Research Operations collection': return 'Reviewed at27bee8e · preservation/privacy accepted, required layout/filter fixes in newest tranche; original reviewed images retained'
 if title=='Queue navigation and review fixes': return 'Reviewed at27bee8e · earlier correctness fixes accepted; required history/visible-order refinements in newest tranche; original reviewed images retained'
 if title=='Personal Queue views and thread': return 'Reviewed at76b04ba · privacy/preservation accepted; navigation/client changes required; original reviewed images retained'

 if title=='Record reader review refinements': return 'Reviewed by Opus76b04ba · record fixes accepted, two small follow-ups in newest lead tranche; no formal score'
 if title=='Place and Story records': return 'Reviewed at 0bafa4f · Opus conditional approval; original reviewed images retained, no formal score'
 if title=='Record review refinements': return 'Person lead fixes included in Opus0bafa4f review · all earlier findings resolved, no formal score'
 if title=='Person dossier and evidence stream': return 'Reviewed at c187b04 · Opus conditional approval; original reviewed images retained, no formal score'
 if title=='Activity, facets and Home refinements': return 'Reviewed at 7f1ab4f · Opus conditional approval, original reviewed images retained; no formal score'
 if title=='Collection review fixes': return 'Lead fixes from Opus review · checks and fresh images recorded; next cross-model review pending'
 if 'reconstructed' in title: return 'Original page JSX from 99980b5, invented data under the current shared shell/runtime · reconstructed comparison, not a frozen original capture'
 if title.startswith('Starting'): return 'Starting snapshot · now'
 number=int(title.split('-')[1])
 record=next((r for r in score_data.get('rounds',[]) if r['round']==number),None)
 if not record: return 'Judging pending · no acceptance claimed'
 # Render each independently ingested receipt's actual candidate average.
 labels=[]
 for judge in record.get('judges',[]):
  summary=judge.get('summary',{})
  average=summary.get('candidateAvg')
  if average is not None:
   verdict='passed' if summary.get('pass') else 'below target'
   labels.append(f"{judge['judge']}: {average:.1f} / 10 · {verdict}")
 return ' · '.join(labels) if labels else 'See scores.md for independent round scores; no acceptance claimed'

for title,folder in sections:
 cards=[]
 score=score_line(title)
 ordered=sorted(folder.glob('*.png'))
 if title=='Settings matrices and key ledgers':
  first=['ai-permissions--desktop-light.png','ai-permissions--mobile-light.png','preferences-data--desktop-light.png','preferences-data--mobile-light.png','developer-keys--desktop-light.png','developer-keys--mobile-light.png','operator-ledger--desktop-light.png','operator-ledger--mobile-light.png']
  ordered=sorted(ordered,key=lambda image:(first.index(image.name) if image.name in first else len(first),image.name))
 if title in ['Audit lead refinements','Audit instruments']:
  first=['audit-instruments--desktop-light.png','audit-instruments--mobile-light.png']
  ordered=sorted(ordered,key=lambda image:(first.index(image.name) if image.name in first else len(first),image.name))
 for image in ordered:
  label=image.stem.replace('--',' · '); index=len(images)
  if os.environ.get('COUNCIL_INLINE_PREVIEW'):
   # Keep the portable gallery at original PNG quality. The inline renderer has
   # a 25 MiB attachment limit, so its adapter uses compressed viewing copies.
   cache=run/'.gallery-preview'/'compact-v3'/image.relative_to(run).with_suffix('.jpg')
   if not cache.exists() or cache.stat().st_mtime < image.stat().st_mtime:
    cache.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['nice','-n','10','sips','-s','format','jpeg','-s','formatOptions','35','-Z','1100',str(image),'--out',str(cache)],check=True,stdout=subprocess.DEVNULL)
   source=str(cache)
  else:
   source='data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode('ascii')
  images.append(label)
  cards.append(f'<button class="shot" data-index="{index}"><img loading="lazy" src="{source}" alt="{html.escape(label)}"><span>{index+1}. {html.escape(label)}</span></button>')
 blocks.append(f'<section><h2>{html.escape(title)}</h2><p>{score} · synthetic fixture presentation; no backend acceptance claimed.</p><div class="shots">'+''.join(cards)+'</div></section>')
css='''html,body{margin:0;font-family:var(--font-sans,system-ui);color:var(--foreground,#23323a)}*{box-sizing:border-box}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:32px}h2{font-size:25px;margin-top:36px}p{line-height:1.6;color:var(--muted-foreground,#65716f)}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.shot{border:1px solid var(--border,#d7cfbf);border-radius:var(--radius,8px);background:var(--card,#fdf9f0);color:inherit;padding:16px;cursor:zoom-in;text-align:left}.shot img{width:100%;height:210px;object-fit:contain;object-position:top}.shot span{display:block;margin-top:8px;font-size:12px}dialog{border:1px solid var(--border,#d7cfbf);border-radius:var(--radius,12px);padding:16px;background:var(--card,#fdf9f0);color:inherit;width:min(96vw,1300px);max-height:900px}dialog::backdrop{background:#101820dc}.image-scroll{max-height:760px;overflow:auto}dialog img{display:block;max-width:100%;height:auto;margin:auto}.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.bar button{padding:10px 16px;border:1px solid var(--border,#d7cfbf);border-radius:5px;background:var(--secondary,#e7ddc7);color:inherit;cursor:pointer}.bar span{flex:1}'''
script='''const images=[...document.querySelectorAll('.shot img')].map(img=>({src:img.src,label:img.alt}));const dialog=document.querySelector('dialog'),large=dialog.querySelector('img'),caption=dialog.querySelector('span');let active=0;function show(i){active=(i+images.length)%images.length;large.src=images[active].src;large.alt=images[active].label;large.style.width=images[active].label.includes("mobile")?"390px":"100%";dialog.querySelector(".image-scroll").scrollTop=0;caption.textContent=`${active+1} of ${images.length} · ${images[active].label}`;if(!dialog.open)dialog.showModal()}document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>show(+b.dataset.index));document.querySelector('#previous').onclick=()=>show(active-1);document.querySelector('#next').onclick=()=>show(active+1);document.querySelector('#close').onclick=()=>dialog.close();document.addEventListener('keydown',e=>{if(dialog.open&&e.key==='ArrowLeft')show(active-1);if(dialog.open&&e.key==='ArrowRight')show(active+1)});'''
output='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family History · design gallery</title><style>'+css+'</style><main><h1>Family History · design council</h1><p>Newest first. Last updated '+datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')+'. Local work in progress. Select any numbered image to compare in place; use ← → or Esc.</p>'+''.join(blocks)+'</main><dialog aria-label="Screenshot comparison"><div class="bar"><button id="previous" aria-label="Previous image">←</button><span></span><button id="next" aria-label="Next image">→</button><button id="close">Close</button></div><div class="image-scroll"><img alt=""></div></dialog><script>'+script+'</script></html>'
destination=run/('gallery-inline.html' if os.environ.get('COUNCIL_INLINE_PREVIEW') else 'gallery.html')
destination.write_text(output)
print(destination)
