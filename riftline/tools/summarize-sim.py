import sys,json
for line in sys.stdin:
    line=line.strip()
    if not line.startswith('{'):
        if line: print(line)
        continue
    d=json.loads(line)
    print(d['weapon'], 'final',d['finalWave'],'ms',d['ms'],'err',[e[:300] for e in d['errors'][:1]],'nf',d['nonfinite'][:3],'max',d['max'],'stuck',[w for w in d['waves'] if w.get('stuck')][:2], 'avg', d['waves'][-1])
