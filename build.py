"""Inline src/0*.js into src/template.html -> index.html"""
import glob, os
here = os.path.dirname(os.path.abspath(__file__))
js = '\n'.join(open(f, encoding='utf-8').read() for f in sorted(glob.glob(os.path.join(here, 'src', '0*.js'))))
t = open(os.path.join(here, 'src', 'template.html'), encoding='utf-8').read()
open(os.path.join(here, 'index.html'), 'w', encoding='utf-8').write(t.replace('/*__GAME__*/', js))
print('index.html built,', len(js), 'chars of game code')
