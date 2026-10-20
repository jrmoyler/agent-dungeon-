import numpy as np
from PIL import Image
from scipy import ndimage as ndi
_cache={}
def load(p):
    if p not in _cache: _cache[p]=np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    return _cache[p]
def disk(r):
    y,x=np.ogrid[-r:r+1,-r:r+1];return x*x+y*y<=r*r
def extract(path,box,strong_e=58,lo=14,hi=70,close=3,edge=3,pad=3,trim=True,minpix=6,fill=True,maxhole=500):
    a=load(path)[box[1]:box[3],box[0]:box[2]].copy()
    H,W=a.shape[:2]
    border=np.concatenate([a[:4].reshape(-1,3),a[-4:].reshape(-1,3),a[:,:4].reshape(-1,3),a[:,-4:].reshape(-1,3)])
    bg=np.median(border,0)
    e=(a-bg).max(-1)
    lum=a@np.array([.3,.59,.11])
    strong=(e>strong_e)|(lum>120)
    lab,n=ndi.label(strong,structure=np.ones((3,3)))
    if n:
        sz=ndi.sum(strong,lab,range(1,n+1));strong=np.isin(lab,np.where(sz>=minpix)[0]+1)
    core=strong.copy()
    if fill:
        cl=ndi.binary_closing(strong,structure=disk(close))
        holes=ndi.binary_fill_holes(cl)&~cl
        hl,hn=ndi.label(holes)
        if hn:
            hs=ndi.sum(holes,hl,range(1,hn+1));holes=np.isin(hl,np.where(hs<maxhole)[0]+1)
        core=cl|holes|strong
    alpha=np.clip((e-lo)/(hi-lo),0,1)**1.1
    alpha=np.maximum(alpha,core.astype(np.float32))
    # halo only near strong content
    near=ndi.binary_dilation(strong,structure=disk(14))
    alpha[~near]=0
    if edge>0:
        alpha[:edge]=0;alpha[-edge:]=0;alpha[:,:edge]=0;alpha[:,-edge:]=0
    rgba=np.dstack([np.clip(a,0,255).astype(np.uint8),(alpha*255).astype(np.uint8)])
    im=Image.fromarray(rgba,'RGBA')
    if trim:
        bb=Image.fromarray(((alpha>0.08)*255).astype(np.uint8)).getbbox()
        if bb: im=im.crop((max(0,bb[0]-pad),max(0,bb[1]-pad),min(W,bb[2]+pad),min(H,bb[3]+pad)))
    return im
def preview(ims,out,bg=(40,34,30)):
    W=sum(i.width for i in ims)+10*len(ims);H=max(i.height for i in ims)
    c=Image.new('RGBA',(W,H*2+10),(200,60,160,255));x=0
    c.paste(bg+(255,),(0,H+10,W,2*H+10))
    for i in ims: c.alpha_composite(i,(x,0));c.alpha_composite(i,(x,H+10));x+=i.width+10
    c.convert('RGB').save(out)

def split(path,box,n,**kw):
    big=extract(path,box,trim=False,**kw)
    al=np.asarray(big)[...,3]>128
    W=al.shape[1]
    lab,k=ndi.label(ndi.binary_dilation(al,structure=disk(2)))
    cuts=None
    if k>=n:
        sz=ndi.sum(np.ones_like(lab),lab,range(1,k+1))
        top=np.argsort(sz)[::-1][:n]+1
        objs=ndi.find_objects(lab)
        rng=sorted([(objs[t-1][1].start,objs[t-1][1].stop) for t in top])
        ok=all(sz[t-1]>sz[top[0]-1]*0.12 for t in top)
        if ok:
            cuts=[0]
            for (a0,a1),(b0,b1) in zip(rng,rng[1:]):
                cuts.append((a1+b0)//2 if a1<b0 else ((a0+a1)//2+(b0+b1)//2)//2)
            cuts.append(W)
            if min(np.diff(cuts))<W/n*0.3: cuts=None
    if cuts is None: cuts=[int(round(i*W/n)) for i in range(n+1)]
    out=[]
    for i in range(n):
        sub=(box[0]+cuts[i],box[1],box[0]+cuts[i+1],box[3])
        out.append(extract(path,sub,edge=0,**kw))
    return out
