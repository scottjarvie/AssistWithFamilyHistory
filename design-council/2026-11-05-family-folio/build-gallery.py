"""Rebuild the run's local, newest-first capture gallery; no server needed."""
from pathlib import Path
from datetime import datetime, timezone
import html, json, base64, re, os
run=Path(__file__).resolve().parent
rounds=sorted([p for p in run.glob('round-*') if re.fullmatch(r'round-\d+',p.name) and (p/'ours').exists()],key=lambda p:int(p.name.split('-')[1]),reverse=True)
sections=[(p.name,p/'ours') for p in rounds]+[('Starting collections · reconstructed now',run/'baseline-reconstructed'),('Starting page · now',run/'baseline')]
images=[]; blocks=[]
score_file=run/'scores.json'
score_data=json.loads(score_file.read_text()) if score_file.exists() else {}
params=json.loads((run/'params.json').read_text())
weights={c['key']:c.get('weight',1) for c in params.get('categories',[])}
def score_line(title):
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
 for image in sorted(folder.glob('*.png')):
  label=image.stem.replace('--',' · '); index=len(images)
  source=str(image) if os.environ.get('COUNCIL_INLINE_PREVIEW') else 'data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode('ascii')
  images.append(label)
  cards.append(f'<button class="shot" data-index="{index}"><img loading="lazy" src="{source}" alt="{html.escape(label)}"><span>{index+1}. {html.escape(label)}</span></button>')
 blocks.append(f'<section><h2>{html.escape(title)}</h2><p>{score} · synthetic fixture presentation; no backend acceptance claimed.</p><div class="shots">'+''.join(cards)+'</div></section>')
css='''html,body{margin:0;font-family:var(--font-sans,system-ui);color:var(--foreground,#23323a)}*{box-sizing:border-box}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:32px}h2{font-size:25px;margin-top:36px}p{line-height:1.6;color:var(--muted-foreground,#65716f)}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.shot{border:1px solid var(--border,#d7cfbf);border-radius:8px;background:var(--card,#fdf9f0);color:inherit;padding:10px;cursor:zoom-in;text-align:left}.shot img{width:100%;height:210px;object-fit:contain;object-position:top}.shot span{display:block;margin-top:8px;font-size:12px}dialog{border:1px solid var(--border,#d7cfbf);border-radius:12px;padding:12px;background:var(--card,#fdf9f0);color:inherit;width:min(96vw,1300px);max-height:900px}dialog::backdrop{background:#101820dc}dialog img{display:block;max-width:100%;max-height:760px;margin:auto;object-fit:contain}.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.bar button{padding:10px 16px;border:1px solid var(--border,#d7cfbf);border-radius:5px;background:var(--secondary,#e7ddc7);color:inherit;cursor:pointer}.bar span{flex:1}'''
script='''const images=[...document.querySelectorAll('.shot img')].map(img=>({src:img.src,label:img.alt}));const dialog=document.querySelector('dialog'),large=dialog.querySelector('img'),caption=dialog.querySelector('span');let active=0;function show(i){active=(i+images.length)%images.length;large.src=images[active].src;large.alt=images[active].label;caption.textContent=`${active+1} of ${images.length} · ${images[active].label}`;if(!dialog.open)dialog.showModal()}document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>show(+b.dataset.index));document.querySelector('#previous').onclick=()=>show(active-1);document.querySelector('#next').onclick=()=>show(active+1);document.querySelector('#close').onclick=()=>dialog.close();document.addEventListener('keydown',e=>{if(dialog.open&&e.key==='ArrowLeft')show(active-1);if(dialog.open&&e.key==='ArrowRight')show(active+1)});'''
output='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family History · design gallery</title><style>'+css+'</style><main><h1>Family History · design council</h1><p>Newest first. Last updated '+datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')+'. Local work in progress. Select any numbered image to compare in place; use ← → or Esc.</p>'+''.join(blocks)+'</main><dialog aria-label="Screenshot comparison"><div class="bar"><button id="previous" aria-label="Previous image">←</button><span></span><button id="next" aria-label="Next image">→</button><button id="close">Close</button></div><img alt=""></dialog><script>'+script+'</script></html>'
destination=run/('gallery-inline.html' if os.environ.get('COUNCIL_INLINE_PREVIEW') else 'gallery.html')
destination.write_text(output)
print(destination)
