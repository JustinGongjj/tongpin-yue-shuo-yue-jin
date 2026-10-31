/* 同频 · 回归测试 */
let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.error('缺少依赖：请先运行 `npm install`');
  process.exit(1);
}
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

const cards = fs.readFileSync(path.join(ROOT,'cards.js'),'utf8');
const tpl   = fs.readFileSync(path.join(ROOT,'custom-templates.js'),'utf8');
const html  = fs.readFileSync(path.join(ROOT,'index.html'),'utf8')
  .replace('<script src="./cards.js"></script>','<script>'+cards+'</script>')
  .replace('<script src="./custom-templates.js"></script>','<script>'+tpl+'</script>');

let fails = 0;
const A = (c,m)=>{ console.log((c?'PASS  ':'FAIL  ')+m); if(!c) fails++; };
const sleep = ms => new Promise(r=>setTimeout(r,ms));

function boot(){
  const vc = new VirtualConsole();
  const errs = [];
  vc.on('jsdomError', e=>errs.push(e.message));
  const dom = new JSDOM(html, {runScripts:'dangerously', pretendToBeVisual:true, url:'https://tongpin.test/', virtualConsole:vc});
  const w = dom.window, d = w.document;
  const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
  const click = el => { if(el && el.dispatchEvent) el.dispatchEvent(new w.MouseEvent('click',{bubbles:true})); };
  return { w, d, q, qa, click, errs };
}

/* 跑 n 轮，dodgeEvery=0 表示全部够诚 */
async function play(ctx, n, dodgeEvery=0){
  const {q,qa,click} = ctx;
  let done=0, g=0;
  while(done<n && g++<400){
    if(q('#s-end').classList.contains('active')) break;
    const ov=q('.overlay'); if(ov){ click(ov); await sleep(10); continue; }
    const b=qa('#stage .backcard'); if(b.length){ click(b[0]); await sleep(6); continue; }
    const dn=q('#btn-done'); if(dn){ click(dn); await sleep(6); continue; }
    const hon=q('#btn-honest');
    if(hon){
      const isDodge = dodgeEvery && (done % dodgeEvery === 0);
      click(q(isDodge ? '#btn-dodge' : '#btn-honest'));
      done++; await sleep(45); continue;
    }
    await sleep(20);
  }
  return done;
}
async function enterSetup(ctx, a='阿泽', b='小满'){
  const {q,click} = ctx;
  click(q('#consent')); click(q('#btn-enter'));
  q('#name-a').value=a; q('#name-b').value=b;
  await sleep(30);
}

(async()=>{
  console.log('=== 一、牌库完整性 ===');
  const lib = {}; new Function('window', cards)(lib);
  const C = lib.CARDS, D = lib.DEEP, S = lib.SCENES;
  const M0 = lib.MEANING || [];
  const all = [...C.map(c=>c.x), ...D.map(c=>c.x), ...M0.map(c=>c.x), ...S.flatMap(s=>s.acts.flatMap(a=>a.cards.map(c=>c.x)))];
  A(C.length===368, '常规牌 368 张 ('+C.length+')');
  A(D.length===60, '深聊牌 60 张 ('+D.length+')');
  const M = lib.MEANING || [];
  A(M.length===30, '共鸣牌 30 张 ('+M.length+')');
  A(M.every(c=>c.why&&c.theme), '共鸣牌都有依据');
  const meaningShare = M.length / (C.length + D.length + M.length);
  A(meaningShare > 0.06, '意义型占比提升到 '+(meaningShare*100).toFixed(1)+'%');
  A(S.length===16, '场景 16 个 ('+S.length+')');
  A(all.length===new Set(all).size, '全库无重复，共 '+all.length+' 条');
  A(C.every(c=>c.theme), '每张常规牌都有主题');
  A(D.every(c=>c.why && c.theme), '每张深聊牌都有「为什么问」');
  A(S.every(s=>s.acts.length===5 && s.acts.every(a=>a.cards.length===4)), '每个场景 5 幕 × 4 张');

  console.log('\n=== 二、品牌与层级 ===');
  const ctx = boot();
  A(ctx.d.title.includes('同频'), '标题是「同频」');
  A(ctx.q('.cover-title').textContent === '同频', '封面标题');
  A(!ctx.d.body.innerHTML.includes('深水区'), '页面无旧名残留');
  A(lib.LAYERS.map(l=>l.name).join('/')==='起调/同频/共鸣/交心/无间', '五层：起调→同频→共鸣→交心→无间');
  A(ctx.errs.length===0, '启动无运行时错误');

  console.log('\n=== 三、关系档案累积 ===');
  const c1 = boot();
  await enterSetup(c1);
  c1.click(c1.d.querySelector('#deck-opts .opt[data-deck="deep"]'));
  c1.click(c1.q('#btn-start'));
  await sleep(40);
  const played = await play(c1, 10, 4);
  c1.click(c1.q('#btn-finish'));
  await sleep(150);
  const kbRaw = JSON.parse(c1.w.localStorage.getItem('tongpin_kb_v1') || '{}');
  const keys = Object.keys(kbRaw);
  A(keys.length===1, '只有一个档案键，不分裂 ('+keys.join(',')+')');
  const rec = Object.values(kbRaw)[0];
  A(rec.sessions===1, '记录第 1 次 ('+rec.sessions+')');
  A(Object.keys(rec.themes).length>0, '记录了主题：'+Object.keys(rec.themes).join(','));
  const dodged = Object.values(rec.themes).reduce((s,t)=>s+t.dodge,0);
  A(dodged>0, '记录了躲闪次数 ('+dodged+')');

  console.log('\n=== 四、档案页与优先级 ===');
  c1.click(c1.q('#btn-again')); await sleep(80);
  c1.click(c1.q('#btn-kb')); await sleep(60);
  A(c1.q('#s-kb').classList.contains('active'), '能进档案页');
  const bodyTxt = c1.q('#kb-body').textContent;
  A(bodyTxt.includes('你们聊到哪了'), '有标题');
  A(bodyTxt.includes('还没碰过'), '有未覆盖主题');
  A(bodyTxt.includes('碰过的主题'), '有统计');
  A(!!c1.q('#kb-go'), '有「从没聊过的地方开始」');
  c1.click(c1.q('#kb-go')); await sleep(60);
  A(c1.q('#s-setup').classList.contains('active'), '回到设置页');
  A(/玩过|碰过/.test(c1.q('#kb-status').textContent), '状态栏显示累积结果');

  console.log('\n=== 五、为什么问这个 ===');
  const c2 = boot();
  await enterSetup(c2);
  c2.click(c2.q('#btn-start')); await sleep(40);
  let found=false, g=0;
  while(!found && g++<60){
    const ov=c2.q('.overlay'); if(ov){ c2.click(ov); await sleep(10); continue; }
    const b=c2.qa('#stage .backcard'); if(b.length){ c2.click(b[0]); await sleep(8); continue; }
    if(c2.q('#btn-why')){ found=true; break; }
    if(c2.q('#btn-done')){ c2.click(c2.q('#btn-done')); await sleep(8);
      if(c2.q('#btn-honest')) c2.click(c2.q('#btn-honest')); await sleep(45); continue; }
    await sleep(20);
  }
  A(found, '抽到带依据的深聊牌');
  if(found){ c2.click(c2.q('#btn-why')); await sleep(20);
    A(c2.q('#why-box').style.display!=='none', '点开显示依据'); }

  console.log('\n=== 六、场景与定制 ===');
  const c3 = boot();
  await enterSetup(c3);
  const chips = c3.qa('#scene-opts .tchip');
  A(chips.length===17, '场景选择 17 项（不进 + 16）');
  const names = S.map(s=>s.name);
  A(['睡前','散步','车里','厨房','地铁'].every(n=>names.includes(n)), '五个日常场景已加入');
  c3.click(chips.find(x=>x.dataset.scene==='subway'));
  c3.click(c3.q('#btn-start')); await sleep(40);
  A(!!c3.q('.sceneopen'), '进场页出现');
  c3.click(c3.q('#cast-enter')); await sleep(20);
  A(c3.q('#scene-bar').style.display==='block', '场景条显示');

  console.log('\n=== 七、定制牌 ===');
  const c4 = boot();
  await enterSetup(c4);
  c4.click(c4.q('#btn-custom')); await sleep(30);
  c4.q('#c-a').value='阿泽'; c4.q('#c-b').value='小满';
  c4.q('#c-place').value='江边'; c4.q('#c-call').value='宝宝';
  c4.click(c4.q('#btn-gen')); await sleep(40);
  const items = c4.qa('.genitem');
  A(items.length>0, '生成定制牌 '+items.length+' 张');
  A(c4.q('#custom-preview').textContent.includes('江边'), '用上了地点');
  A(c4.q('#custom-preview').textContent.includes('宝宝'), '用上了私房台词');
  c4.click(c4.q('#btn-gen')); await sleep(40);
  A(c4.q('#s-setup').classList.contains('active'), '能存下');

  console.log('\n=== 八、深聊牌确实会抽到 ===');
  const c5 = boot();
  await enterSetup(c5);
  c5.click(c5.q('#btn-start')); await sleep(30);
  let whys=0, rounds=0;
  for(let i=0;i<40 && rounds<14;i++){
    const ov=c5.q('.overlay'); if(ov){ c5.click(ov); await sleep(10); continue; }
    const b=c5.qa('#stage .backcard'); if(b.length){ c5.click(b[0]); await sleep(6); continue; }
    if(c5.q('#btn-why')){ whys++; }
    const dn=c5.q('#btn-done');
    if(dn){ c5.click(dn); await sleep(6); if(c5.q('#btn-honest')){ c5.click(c5.q('#btn-honest')); rounds++; } await sleep(40); continue; }
    await sleep(20);
  }
  A(whys>0, '14 轮里抽到 '+whys+' 张深聊牌');
  A(rounds>=10, '能正常推进 '+rounds+' 轮');

  console.log('\n'+(fails? '✗ '+fails+' 项未通过' : '✓ 全部通过'));
  process.exit(fails?1:0);
})();
