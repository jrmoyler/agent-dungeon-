import os,json
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.abspath(os.path.join(HERE,'..','..'))
from PIL import Image
R=os.path.join(ROOT,'build','assets');OUT=os.path.join(ROOT,'atlas');os.makedirs(OUT,exist_ok=True)
names=['portrait_bg','portrait','idle','move','attack','special','proj','summon','fx','item0','item1','item2','item3','icon_weapon','icon_special']
man={}
for h in sorted(os.listdir(R)):
    ims=[(n,Image.open(f'{R}/{h}/{n}.png').convert('RGBA')) for n in names]
    # downscale big portrait to save space
    ims=[(n,(i.resize((int(i.width*0.8),int(i.height*0.8)),Image.LANCZOS) if n.startswith('portrait') else i)) for n,i in ims]
    W=1024;x=y=sh=0;rects={};pos=[]
    for n,i in sorted(ims,key=lambda t:-t[1].height):
        if x+i.width+2>W: x=0;y+=sh+2;sh=0
        pos.append((n,i,x,y));rects[n]=[x,y,i.width,i.height];x+=i.width+2;sh=max(sh,i.height)
    Ht=y+sh
    at=Image.new('RGBA',(W,Ht),(0,0,0,0))
    for n,i,px,py in pos: at.paste(i,(px,py))
    at.save(f'{OUT}/{h}.webp','WEBP',quality=90,method=6)
    man[h]={'w':W,'h':Ht,'r':rects}
json.dump(man,open(f'{OUT}/manifest.json','w'))
print({k:(v['w'],v['h']) for k,v in man.items()})
