import json,sys
d=json.load(open(sys.argv[1]))
flt=sys.argv[2] if len(sys.argv)>2 else ''
for p in d['properties']:
    if flt and p['id'].startswith('provider.') and p['id']!='provider.type' and flt not in p['id']: continue
    print(p['id'],p['type'],repr(p.get('default')),p.get('choices') or '')
