import json,re,sys,statistics as st
from datetime import datetime
T='/private/tmp/claude-501/-Users-eric-lundberg-GitHub-skills--claude-worktrees-camunda-strategy-review-459c75/33f575b0-23c2-4d29-955b-27c99c333923/tasks'
A={'py1':'a95af065c2ff89f13','py2':'a0f42894aee69b47b','cli3':'a342ab756a3b3fd30','cli4':'a30aa0d3dbfe5aaaf','hand1':'a87c4f7102f9bebf0','hand2':'a5fe82d1312b5c4d7','cli1':'ab47217565c7bfdfa','cli2':'a1099250c44e7c9b3'}
ts=lambda s: datetime.fromisoformat(s.replace('Z','+00:00')).timestamp()
def calls(run):
    rows=[json.loads(l) for l in open(f'{T}/{A[run]}.output') if l.strip()]
    ev=[r for r in rows if r['type'] in('assistant','user')]
    tool_by_id={}; msgs={}; order=[]
    prev_t=ts(ev[0]['timestamp']); prev_ctx='start'
    for r in ev[1:]:
        t=ts(r['timestamp']); c=r['message'].get('content')
        if r['type']=='user' and isinstance(c,list):
            prev_t=t
            for b in c:
                if b.get('type')=='tool_result':
                    prev_ctx=tool_by_id.get(b['tool_use_id'],'?')
            continue
        if r['type']!='assistant': continue
        mid=r['message'].get('id')
        m=msgs.get(mid)
        if m is None:
            m=dict(start=prev_t,end=t,out=0,vis=0,types=set(),tools=[],ctx=prev_ctx); msgs[mid]=m; order.append(mid)
        m['end']=t; m['out']=max(m['out'],r['message'].get('usage',{}).get('output_tokens',0))
        for b in c:
            m['types'].add(b['type'])
            if b['type']=='text': m['vis']+=len(b['text'])/3.5
            if b['type']=='tool_use':
                m['vis']+=len(json.dumps(b['input']))/3.2
                inp=b['input']; nm=b['name']
                tag=nm
                if nm=='Bash':
                    cmd=re.sub(r'^\s*cd [^;&|]+(;|&&)\s*','',inp.get('command','')).split('<<')[0]
                    tag='Bash:'+(re.findall(r'(run-cpt|bpmn lint|bpmn-js-cli\.mjs run|template-props|element-template \w+|build\.py|cat|ls|grep|python3|node|sed)',cmd) or ['other'])[0]
                if nm in('Read','Edit','Write'): tag=nm+':'+re.sub(r'.*/','',inp.get('file_path',''))[:30]
                m['tools'].append(tag); tool_by_id[b['id']]=tag
        prev_t=t if r['type']=='assistant' else prev_t
    return [msgs[i] for i in order]
if __name__=='__main__':
    print('run   calls  wall_model  out_tok  visible_est  hidden_est  s/call  hidden%')
    for run in ['py1','py2','hand1','hand2','cli3','cli4','cli1','cli2']:
        ms=calls(run)
        wall=sum(m['end']-m['start'] for m in ms); out=sum(m['out'] for m in ms); vis=sum(min(m['vis'],m['out']) for m in ms)
        print(f'{run:5} {len(ms):4}  {wall:9.0f}  {out:7}  {vis:10.0f}  {out-vis:9.0f}  {wall/len(ms):6.1f}  {100*(out-vis)/max(out,1):5.0f}')
