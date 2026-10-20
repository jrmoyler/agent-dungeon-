import sys
from PIL import Image, ImageDraw
src,out=sys.argv[1],sys.argv[2]
x0,y0,x1,y1=map(int,sys.argv[3:7])
im=Image.open(src).convert('RGB').crop((x0,y0,x1,y1))
s=float(sys.argv[7]) if len(sys.argv)>7 else 1
im=im.resize((int(im.width*s),int(im.height*s)),Image.NEAREST)
d=ImageDraw.Draw(im)
step=int(sys.argv[8]) if len(sys.argv)>8 else 50
for x in range((x0//step+1)*step,x1,step):
  X=(x-x0)*s; d.line([(X,0),(X,im.height)],fill=(255,255,0) if x%100==0 else (120,120,0),width=1); d.text((X+2,2),str(x),fill=(255,255,0))
for y in range((y0//step+1)*step,y1,step):
  Y=(y-y0)*s; d.line([(0,Y),(im.width,Y)],fill=(0,255,255) if y%100==0 else (0,120,120),width=1); d.text((2,Y+2),str(y),fill=(0,255,255))
im.save(out)
