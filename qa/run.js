const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const ROOT=require('path').resolve(__dirname,'..'), TN=require('path').resolve(__dirname,'..','node_modules','three');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.webp':'image/webp'};
(async()=>{
  const mobile=process.argv[2]==='mobile';
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width:1280,height:760}});
  const page=await ctx.newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text())});
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
  await page.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.hostname==='cdn.jsdelivr.net'){const p=u.pathname.replace('/npm/three@0.170.0','');return r.fulfill({path:path.join(TN,p),contentType:'text/javascript'});}
    if(u.hostname==='game.local'){let p=u.pathname==='/'?'/index.html':u.pathname;const f=path.join(ROOT,p);if(fs.existsSync(f))return r.fulfill({path:f,contentType:mime[path.extname(f)]||'application/octet-stream'});return r.fulfill({status:404});}
    if(u.hostname.includes('fonts.g'))return r.fulfill({status:200,body:'',contentType:'text/css'});
    return r.abort();
  });
  await page.goto('http://game.local/');
  await page.waitForFunction(()=>window.__AD&&window.__AD.G.mode==='title',null,{timeout:60000});
  await page.waitForTimeout(800);
  await page.screenshot({path:`shot_${mobile?'m':'d'}_title.png`});
  await page.click('#btnPlay'); await page.waitForTimeout(400);
  await page.screenshot({path:`shot_${mobile?'m':'d'}_select.png`});
  const hero=process.argv[3]||'cursor';
  await page.evaluate(h=>{window.__AD.selected=h;},hero);
  await page.click('#btnStart'); await page.waitForTimeout(1500);
  // simulate play: aim at enemies, autofire, move around, use special
  await page.evaluate(()=>{const A=window.__AD;A.input.autoFire=true;A.input.mouseIn=false;});
  for(let i=0;i<8;i++){
    await page.evaluate(i=>{const A=window.__AD,p=A.G.p;A.G.p.hp=A.G.p.maxHp; // keep alive
      const e=A.G.enemies.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
      if(e){const dx=e.x-p.x,dz=e.z-p.z,l=Math.hypot(dx,dz);p.aimX=dx/l;p.aimZ=dz/l; if(l>8){const W=A.world;for(let k=0;k<16;k++){const a=k/16*6.283,nx=e.x+Math.cos(a)*5,nz=e.z+Math.sin(a)*5;if(!W.grid[Math.floor(nz/2)*W.W+Math.floor(nx/2)]){p.x=nx;p.z=nz;break;}} const dx2=e.x-p.x,dz2=e.z-p.z,l2=Math.hypot(dx2,dz2);p.aimX=dx2/l2;p.aimZ=dz2/l2;}}
      A.useSpecial(); if(A.G.mode==='levelup'){document.querySelector('.card').click();}
    },i);
    await page.waitForTimeout(700);
    if(i===3) await page.screenshot({path:`shot_${mobile?'m':'d'}_play_${hero}.png`});
  }
  const st=await page.evaluate(()=>{const G=window.__AD.G;const p=G.p;return {dmg:G.dmgDealt,px:p.x,pz:p.z,near:Math.min(...G.enemies.map(e=>Math.hypot(e.x-p.x,e.z-p.z))),fireT:p.fireT,af:window.__AD.input.autoFire,mode:G.mode,floor:G.floor,kills:G.kills,enemies:G.enemies.length,lvl:G.p.level,fx:G.fx.length,summons:G.summons.length}});
  console.log(hero,JSON.stringify(st));
  console.log('ERRORS',errs.length,errs.slice(0,15).join('\n'));
  await b.close();
})();
