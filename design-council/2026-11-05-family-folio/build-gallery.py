"""Rebuild the run's local, newest-first capture gallery; no server needed."""
from pathlib import Path
from datetime import datetime, timezone
import html, json, base64, re, os, subprocess
run=Path(__file__).resolve().parent
rounds=sorted([p for p in run.glob('round-*') if re.fullmatch(r'round-\d+',p.name) and (p/'ours').exists()],key=lambda p:int(p.name.split('-')[1]),reverse=True)
sections=[('Document readers · work in progress',run/'readers-field-guide'),('Reader originals · reconstructed now',run/'readers-baseline'),('Settings matrices and key ledgers',run/'settings-matrices'),('Settings originals · reconstructed now',run/'settings-baseline'),('Audit lead refinements',run/'audit-review-fixes'),('Audit instruments',run/'audit-instruments'),('Audit original · reconstructed now',run/'audit-baseline'),('Shared collection and Queue refinements',run/'review-refinements'),('Research Operations collection',run/'operations-records'),('Queue navigation and review fixes',run/'queue-review-fixes'),('Personal Queue views and thread',run/'queue-records'),('Record reader review refinements',run/'record-review-fixes'),('Place and Story records',run/'place-story-records'),('Record review refinements',run/'record-stream/current'),('Person dossier and evidence stream',run/'record-stream/reviewed-c187b04'),('Activity, facets and Home refinements',run/'activity-facets'),('Collection review fixes',run/'collection-fixes')]+[(p.name,p/'ours') for p in rounds]+[('Starting collections · reconstructed now',run/'baseline-reconstructed'),('Starting page · now',run/'baseline')]
images=[]; blocks=[]; image_indices={}
score_file=run/'scores.json'
score_data=json.loads(score_file.read_text()) if score_file.exists() else {}
params=json.loads((run/'params.json').read_text())
weights={c['key']:c.get('weight',1) for c in params.get('categories',[])}
def score_line(title):
 if title=="Document readers · work in progress": return "Current uncommitted work ·4 focused tests/6 viewport captures pass; full browser/repository checks and council review pending"
 if title=="Reader originals · reconstructed now": return "Original reader JSX under current shared runtime with invented documents · reconstructed comparison"
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
 if title=="Document readers · work in progress":
  first=["reader-dossier-wip--desktop-light.png","reader-dossier-wip--mobile-light.png"]
  ordered=sorted(ordered,key=lambda image:(first.index(image.name) if image.name in first else len(first),image.name))
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
  elif os.environ.get('COUNCIL_PORTABLE_EXPORT'):
   source='data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode('ascii')
  else:
   # The primary local review loads original PNGs on demand; no giant inline bundle.
   source=str(image)
  image_indices[str(image.relative_to(run))]=index
  images.append(label)
  cards.append(f'<button class="shot" data-index="{index}"><img loading="lazy" src="{source}" alt="{html.escape(label)}"><span>{index+1}. {html.escape(label)}</span></button>')
 blocks.append(f'<section class="capture-section"><h2>{html.escape(title)}</h2><p>{score} · synthetic fixture presentation; no backend acceptance claimed.</p><div class="shots">'+''.join(cards)+'</div></section>')
css='''html,body{margin:0;font-family:var(--font-sans,system-ui);color:var(--foreground,#23323a)}*{box-sizing:border-box}h1,h2{font-family:Georgia,serif;font-weight:500}h1{font-size:32px}h2{font-size:25px;margin-top:36px}p{line-height:1.6;color:var(--muted-foreground,#65716f)}.shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px}.shot{border:1px solid var(--border,#d7cfbf);border-radius:var(--radius,8px);background:var(--card,#fdf9f0);color:inherit;padding:16px;cursor:zoom-in;text-align:left}.shot img{width:100%;height:210px;object-fit:contain;object-position:top}.shot span{display:block;margin-top:8px;font-size:12px}dialog{border:1px solid var(--border,#d7cfbf);border-radius:var(--radius,12px);padding:16px;background:var(--card,#fdf9f0);color:inherit;width:min(96vw,1300px);max-height:900px}dialog::backdrop{background:#101820dc}.image-scroll{max-height:760px;overflow:auto}dialog img{display:block;max-width:100%;height:auto;margin:auto}.bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}.bar button{padding:10px 16px;border:1px solid var(--border,#d7cfbf);border-radius:5px;background:var(--secondary,#e7ddc7);color:inherit;cursor:pointer}.bar span{flex:1}'''
script='''const images=[...document.querySelectorAll('.shot img')].map(img=>({src:img.src,label:img.alt}));const dialog=document.querySelector('dialog'),large=dialog.querySelector('img'),caption=dialog.querySelector('span');let active=0;function show(i){active=(i+images.length)%images.length;large.src=images[active].src;large.alt=images[active].label;large.style.width=images[active].label.includes("mobile")?"390px":"100%";dialog.querySelector(".image-scroll").scrollTop=0;caption.textContent=`${active+1} of ${images.length} · ${images[active].label}`;if(!dialog.open)dialog.showModal()}document.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>show(+b.dataset.index));document.querySelector('#previous').onclick=()=>show(active-1);document.querySelector('#next').onclick=()=>show(active+1);document.querySelector('#close').onclick=()=>dialog.close();document.addEventListener('keydown',e=>{if(dialog.open&&e.key==='ArrowLeft')show(active-1);if(dialog.open&&e.key==='ArrowRight')show(active+1)});'''
milestones=json.loads((run/'gallery-milestones.json').read_text())
for milestone in milestones:
 for feature in milestone['features']:
  feature['images']={}
  for state in ['after','before']:
   feature['images'][state]={}
   for device in ['desktop','mobile']:
    path=f"{feature[state]}--{device}-light.png"
    if path not in image_indices: raise ValueError(f"Missing featured image: {path}")
    feature['images'][state][device]=image_indices[path]
review_order=['opus-audit-030963f.md','opus-operations-27bee8e.md','opus-queue-76b04ba.md','opus-place-story-0bafa4f.md','opus-record-c187b04.md','opus-activity-facets-7f1ab4f.md','opus-collections-0ec9ea7.md','opus-trays-collections-2bf2eec.md','opus-foundation-903c704.md']
review_files=sorted((run/'reviews').glob('opus-*.md'),key=lambda p:review_order.index(p.name) if p.name in review_order else -1)
review_rows=[]
for path in review_files:
 text=path.read_text(); title=text.splitlines()[0].lstrip('# ')
 review_rows.append('<tr><td>'+html.escape(title)+'</td><td><code>'+html.escape(path.name)+'</code></td></tr>')
nav='<nav class="jump-nav" aria-label="Design run milestones">'+''.join(f'<a href="#{m["id"]}">{html.escape(m["title"])}</a>' for m in milestones)+'</nav>'
owner_blocks=[]
for i,m in enumerate(milestones):
 options=''.join(f'<option value="{n}">{html.escape(f["name"])}</option>' for n,f in enumerate(m['features']))
 owner_blocks.append(f'<article class="milestone" id="{m["id"]}" data-milestone="{i}"><div class="milestone-heading"><p class="eyebrow">Run 2026-11-05 · {"Newest / in progress" if i==0 else "Earlier completed batch"}</p><h2>{html.escape(m["title"])}</h2><span class="state">{html.escape(m["state"])}</span></div><p>{html.escape(m["changed"])}</p><p class="receipt"><strong>Council & checks.</strong> {html.escape(m["review"])}</p><div class="compare-controls"><label>Page <select aria-label="Page in {html.escape(m["title"])}">{options}</select></label><div aria-label="Screenshot device"><button type="button" data-device="desktop" aria-pressed="true">Desktop</button><button type="button" data-device="mobile" aria-pressed="false">Phone</button></div></div><div class="compare-pair"><figure><figcaption>Latest · <span class="latest-label">{html.escape(m["state"])}</span></figcaption><button class="feature-shot" data-version="after" aria-label="Enlarge latest screenshot"><img alt=""><span></span></button></figure><figure><figcaption>Before · <span>original comparison</span></figcaption><button class="feature-shot" data-version="before" aria-label="Enlarge original screenshot"><img alt=""><span></span></button></figure></div><p class="comparison-note"></p><p class="head">Code: <code>{html.escape(m["head"])}</code> · select a screenshot to inspect the entire page.</p></article>')
css+='''
main{max-width:1120px;margin:auto}h1{margin-bottom:8px}h2{margin:0 0 12px}.intro{max-width:75ch}.run-meta{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.run-meta span,.state{display:inline-block;border:1px solid var(--border);border-radius:5px;padding:7px 10px;font-size:12px}.run-meta strong{font-family:var(--font-mono,monospace)}.jump-nav{display:flex;flex-wrap:wrap;gap:8px;border-block:1px solid var(--border);padding:14px 0;margin:22px 0}.jump-nav a{font-size:13px;color:var(--primary);padding:8px 0;margin-right:16px}.milestone{padding:24px 0;border-bottom:1px solid var(--border);scroll-margin-top:20px}.eyebrow{font:11px var(--font-mono,monospace);text-transform:uppercase;letter-spacing:.12em;color:var(--primary)}.state{color:var(--primary);background:var(--secondary)}.receipt{font-size:13px;border-left:2px solid var(--primary);padding:8px 12px;background:var(--muted)}.compare-controls{display:flex;flex-wrap:wrap;gap:12px;justify-content:space-between;align-items:center;margin:18px 0}.compare-controls label{font-size:13px;display:flex;align-items:center;gap:10px;min-width:0}.compare-controls select{max-width:calc(100vw - 70px);min-height:44px;background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:5px;padding:8px}.compare-controls button{min-height:44px;padding:8px 15px;background:var(--card);color:var(--foreground);border:1px solid var(--border);cursor:pointer}.compare-controls button[aria-pressed=true]{background:var(--primary);color:var(--primary-foreground,#fff)}.compare-pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.compare-pair figure{margin:0;min-width:0}.compare-pair figcaption{font-size:13px;font-weight:600;margin-bottom:8px}.compare-pair figcaption span{font-size:11px;font-weight:400;color:var(--muted-foreground)}.feature-shot{display:block;width:100%;max-height:470px;overflow:hidden;background:var(--card);border:1px solid var(--border);border-radius:6px;padding:0;cursor:zoom-in;color:var(--foreground);text-align:left}.feature-shot img{width:100%;height:auto;display:block}.feature-shot[data-device=mobile] img{width:min(100%,280px);margin:auto}.feature-shot span{display:block;padding:10px;font:11px var(--font-mono,monospace)}.comparison-note,.head{font-size:11px}.council{margin:30px 0;padding:20px;background:var(--muted);border-radius:8px}.council table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}.council td{padding:10px 8px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.council td:last-child{font-size:10px}.archive>summary,.council>details>summary{cursor:pointer;min-height:44px;padding:12px 0;font-size:14px;color:var(--primary)}.capture-section h2{margin-top:28px}.archive .shot img{object-fit:cover}.archive .shots{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}.archive .shot{padding:10px}.archive .shot img{height:150px}.next{margin:24px 0;font-size:13px}.bar button{min-height:44px}code{overflow-wrap:anywhere}@media(max-width:580px){.compare-pair{grid-template-columns:1fr}.feature-shot{max-height:480px}.milestone{padding:20px 0}.compare-controls{justify-content:flex-start}.council{padding:14px}.council td:last-child{display:none}}
'''
script+='const milestones='+json.dumps(milestones)+';'+'''
document.querySelectorAll('[data-milestone]').forEach(article=>{const milestone=milestones[+article.dataset.milestone];let featureIndex=0,device=matchMedia('(max-width:580px)').matches?'mobile':'desktop';const select=article.querySelector('select');function update(){const feature=milestone.features[featureIndex];article.querySelectorAll('.compare-controls [data-device]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.device===device)));article.querySelectorAll('.feature-shot').forEach(b=>{const index=feature.images[b.dataset.version][device],item=images[index],img=b.querySelector('img');img.src=item.src;img.alt=item.label;b.dataset.device=device;b.querySelector('span').textContent=`${index+1} of ${images.length} · ${device==='mobile'?'Phone':'Desktop'} · click for the full page`;b.onclick=()=>show(index)});article.querySelector('.comparison-note').textContent=feature.beforeNote||'Before is original route JSX reconstructed with invented records under the current shared runtime. It is a comparison, not a historic live capture.';}select.onchange=()=>{featureIndex=+select.value;update()};article.querySelectorAll('.compare-controls [data-device]').forEach(b=>b.onclick=()=>{device=b.dataset.device;update()});update()});
'''
stamp=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
intro='<h1>Family History · design progress</h1><p class="intro">One run, newest work first. Compare each page before and after, switch Desktop / Phone, or enlarge either image. Detailed captures and earlier rounds are kept at the end.</p><p class="head">Last updated '+stamp+' · Local branch only · Invented records throughout</p><div class="run-meta"><span><strong>16</strong> application routes upgraded</span><span><strong>9</strong> Opus code/taste reviews</span><span><strong>1</strong> formal scored round</span><span>Latest finished code <strong>fe77e07</strong></span></div><p class="intro">Plants supplies Scott’s chosen page structures. Family History keeps its archival folio: parchment, teal and rust, editorial serif headings, evidence and uncertainty, and Codex-drawn SVG. Reader work is still in progress; public pages and site-specific explorations remain.</p>'
ledger='<section class="council" id="council-ledger"><h2>Council status, without mixing the kinds of review</h2><p><strong>Formal round1:</strong> Sol6.8 vs baseline5.4; below the8 target and1.5 lift. The later visual/code passes below have9 Opus receipts, including required corrections and follow-up acceptance. They are not9 scored council rounds. Current Settings and latest Audit fixes await an exact-head independent verdict; Claude has not been woken under the current instruction.</p><details><summary>Read the9 review receipts · latest first</summary><table><tbody>'+''.join(review_rows)+'</tbody></table></details><p>Last finished batch:57/57 repository checks,17 Settings and11 Audit browser groups passed. This is synthetic local evidence, not production/backend acceptance. AWF-0071 remains doing; its independent audit remains open.</p></section>'
output='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Family History · newest-first design progress</title><style>'+css+'</style><main>'+intro+nav+''.join(owner_blocks)+ledger+'<p class="next"><strong>Next:</strong> finish reader browser/full verification; resume formal visual scoring on a frozen completed batch; then public pages and the required three distinct takes for unique Family History workflows. No push, PR, merge or deploy.</p><details class="archive" id="capture-archive"><summary>Full capture archive · '+str(len(images))+' numbered images · all earlier states and rounds preserved</summary>'+''.join(blocks)+'</details></main><dialog aria-label="Screenshot comparison"><div class="bar"><button id="previous" aria-label="Previous image">←</button><span></span><button id="next" aria-label="Next image">→</button><button id="close">Close</button></div><div class="image-scroll"><img alt=""></div></dialog><script>'+script+'</script></html>'
destination=run/('gallery-inline.html' if os.environ.get('COUNCIL_INLINE_PREVIEW') else 'gallery-full-resolution.html' if os.environ.get('COUNCIL_PORTABLE_EXPORT') else 'gallery.html')
destination.write_text(output)
print(destination)
