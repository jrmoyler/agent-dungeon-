import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import sys
def clean(path,out):
    a=np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    bg=np.array([18,25,38],np.float32)
    e=(a-bg).max(-1)
    m=e>10
    L=31
    h=ndi.binary_opening(m,structure=np.ones((1,L)))
    v=ndi.binary_opening(m,structure=np.ones((L,1)))
    thick=ndi.binary_opening(m,structure=np.ones((6,6)))
    thick=ndi.binary_dilation(thick,iterations=1)
    lines=(h|v)&~thick
    lines=ndi.binary_dilation(lines,iterations=1)&~thick
    # also faint grid: e<22 everywhere -> flatten
    b=a.copy()
    b[lines]=bg
    faint=e<20
    b[faint]=bg
    Image.fromarray(np.clip(b,0,255).astype(np.uint8)).save(out)
if __name__=='__main__':
    clean(sys.argv[1],sys.argv[2])
