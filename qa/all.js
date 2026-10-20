const { chromium } = require('playwright');
const path=require('path'),fs=require('fs');
const ROOT=require('path').resolve(__dirname,'..'), TN=require('path').resolve(__dirname,'..','node_modules','three');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json','.webp':'image/webp'};
(async()=>{
  const b=await chromium.launch({...(process.env.CHROME?{executablePath:process.env.CHROME}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await (await b.newContext({viewport:{width:1100,height:700}})).newPage();
  const errs=[];
  page.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message+' '+e.stack));
  await page.route('**/*',async r=>{const u=new URL(r.request().url());
    if(u.hostname==='cdn.jsdelivr.net')return r.fulfill({path:path.join(TN,u.pathname.replace('/npm/three@0.170.0','')),contentType:'text/javascript'});
    if(u.hostname==='game.local'){let p=u.pathname==='/'?'/index.html':u.pathname;const f=path.join(ROOT,p);return fs.existsSync(f)?r.fulfill({path:f,contentType:mime[path.extname(f)]}):r.fulfill({status:404});}
    return r.fulfill({status:200,body:''});});
  await page.goto('http://game.local/');
  await page.waitForFunction(()=>window.__AD&&window.__AD.G.mode==='title',null,{timeout:60000});
  const ids=process.argv[2]?process.argv[2].split(','):await page.evaluate(()=>window.__AD.HEROES.map(h=>h.id));
  for(const id of ids){
    await page.evaluate(id=>{window.__AD.selected=id;window.__AD.startRun();window.__AD.input.autoFire=true;},id);
    const tick=async(n)=>{for(let i=0;i<n;i++){await page.evaluate(()=>{const A=window.__AD,G=A.G,p=G.p;if(!p)return;p.hp=p.maxHp;
      const e=G.enemies.slice().sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
      if(e){const W=A.world;const d=Math.hypot(e.x-p.x,e.z-p.z);if(d>8)for(let k=0;k<16;k++){const a=k/16*6.283,nx=e.x+Math.cos(a)*5,nz=e.z+Math.sin(a)*5;if(!W.grid[Math.floor(nz/2)*W.W+Math.floor(nx/2)]){p.x=nx;p.z=nz;break;}}const dx=e.x-p.x,dz=e.z-p.z,l=Math.hypot(dx,dz)||1;p.aimX=dx/l;p.aimZ=dz/l;}
      if(Math.random()<0.3)A.useSpecial(); if(Math.random()<0.2)A.input.dash=true;
      if(G.mode==='levelup'){const c=document.querySelectorAll('.card');c[Math.floor(Math.random()*c.length)].click();}});await page.waitForTimeout(300);}};
    await tick(12);
    await page.evaluate(()=>{window.__AD.killAll();});await tick(4);
    const s1=await page.evaluate(()=>({mode:window.__AD.G.mode,portal:window.__AD.G.portalOpen,lvl:window.__AD.G.p.level}));
    await page.evaluate(()=>{const A=window.__AD;A.G.mode='play';A.next();});await page.waitForTimeout(800);
    await page.evaluate(()=>{const A=window.__AD;A.killAll();A.G.mode='play';A.next();});await page.waitForTimeout(800);
    // floor 3 boss
    await tick(6);
    await page.evaluate(()=>{const A=window.__AD,G=A.G;if(G.boss){G.boss.aggro=true;const p=G.p;p.x=G.boss.x-6;p.z=G.boss.z;}});
    await tick(6); await page.evaluate(()=>window.__AD.damageBoss(0.5)); await tick(6);
    if(id===ids[0]) await page.screenshot({path:'boss_'+id+'.png'});
    await page.evaluate(()=>window.__AD.damageBoss(0.6)); await page.evaluate(()=>window.__AD.killAll()); await tick(3);
    const s2=await page.evaluate(()=>({mode:window.__AD.G.mode,floor:window.__AD.G.floor,boss:!!window.__AD.G.boss,portal:window.__AD.G.portalOpen,kills:window.__AD.G.kills,lvl:window.__AD.G.p.level,dmg:Math.round(window.__AD.G.dmgDealt)}));
    console.log(id,JSON.stringify(s1),JSON.stringify(s2),'errs',errs.length);
  }
  console.log(errs.slice(0,10).join('\n'));
  await b.close();
})();
