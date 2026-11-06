"""Excluded historical center-crop attempt. Use prepare-viewport-packet.mjs instead."""
from pathlib import Path
import json,subprocess,struct,shutil
r=Path(__file__).resolve().parents[1];p=r/'round-2';meta=json.loads((p/'checkpoint-provenance.json').read_text());report=json.loads((p/'ours-checkpoint/capture-report.json').read_text())
assert len(report['shots'])==38 and all(s['ok'] for s in report['shots'])
packet=p/'packet'
if packet.exists() and not (p/'packet-full-links').exists():packet.rename(p/'packet-full-links')
packet.mkdir(exist_ok=True)
for label in ['V1','V2','R1','R2','R3']:(packet/label).mkdir(exist_ok=True)
records=[]
for surface,stem in meta['baselineFiles'].items():
 for device in ['desktop','mobile']:
  name=f'{surface}--{device}-light.png'
  for label,original in [('V1',r/f'{stem}--{device}-light.png'),('V2',p/'ours-checkpoint'/name)]:
   target=packet/label/name
   if target.exists():raise RuntimeError(f'Preserve prior packet: {target}')
   width,height=struct.unpack('>II',original.read_bytes()[16:24]);crop=min(height,round(width*(844/390 if device=='mobile' else 900/1440)))
   subprocess.run(['sips','--cropToHeightWidth',str(crop),str(width),'--cropOffset','0','0',str(original),'--out',str(target)],check=True,stdout=subprocess.DEVNULL)
   records.append({'set':label,'file':name,'original':str(original.relative_to(r)),'width':width,'height':crop,'fullHeight':height})
for label in ['R1','R2','R3']:
 for original in (r/'round-1/packet'/label).glob('*.png'):
  target=packet/label/original.name
  if not target.exists():target.symlink_to(original.resolve())
manifest=json.loads((p/'manifest.json').read_text());manifest['capabilityProbes']={'passed':38,'failed':[]};manifest['captureNote']='38 actual-viewport captures passed;36 paired scored screenshots. Top viewport crops do not remove original full-page images. Reader WIP excluded; no whole-site/backend acceptance.';(p/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(p/'viewport-packet-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
print('Frozen viewport packet:36 images per version +3 public references. Full images preserved.')
