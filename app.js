
const DATA = window.__DATA;
const SRC = DATA._src || {};  // nguồn các câu thơ ở vòng Xâu chuỗi
const KING = 'Hoàng Minh';
const T_ROW = 20, T_KEY = 30;

/* ===== TIỆN ÍCH ===== */
const $ = s => document.querySelector(s);
const shuffle = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]} return a; };
const chars = s => Array.from(s.normalize('NFC'));
const rnd = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const UP = s => s.normalize('NFC').toLocaleUpperCase('vi');
const TONES = /[̣̀́̃̉]/g;
// So sánh không phụ thuộc vị trí dấu thanh (hoà = hòa), không phân biệt hoa thường
function vkey(s){
  return s.normalize('NFD').toLocaleUpperCase('vi').replace(/[.,!?;:"“”…]/g,' ').trim().split(/\s+/)
    .map(w=>{ const t=(w.match(TONES)||[]).join(''); return w.replace(TONES,'').normalize('NFC')+t; }).join(' ');
}
const same = (a,b) => { const x=vkey(a), y=vkey(b); return x===y || UP(a).replace(/\s+/g,'')===UP(b).replace(/\s+/g,''); };
function show(id){ ['home','intro','play','result','final'].forEach(s => $('#'+s).hidden = s!==id); window.scrollTo(0,0); }

/* ===== ÂM THANH ===== */
const AUD = {ctx:null,on:true,music:null};
function ac(){ if(!AUD.ctx){ try{ AUD.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AUD.ctx; }
function tone(f,d=.15,type='sine',v=.12,when=0){
  const c=ac(); if(!c||!AUD.on) return;
  const t=c.currentTime+when, o=c.createOscillator(), g=c.createGain();
  o.type=type; o.frequency.value=f;
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(v,t+.01); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t+d+.03);
}
const sfx = {
  tick:()=>tone(900,.06,'square',.045), tap:()=>tone(560,.04,'triangle',.06),
  good:()=>{tone(660,.12,'triangle',.16);tone(990,.2,'triangle',.16,.1)},
  bad:()=>{tone(200,.28,'sawtooth',.07)},
  whoosh:()=>{[330,440,550].forEach((f,i)=>tone(f,.15,'triangle',.08,i*.07))},
  fanfare:()=>[523,659,784,1047,784,1047,1319].forEach((f,i)=>tone(f,.3,'triangle',.15,i*.17)),
  lose:()=>{tone(392,.3,'square',.06);tone(330,.3,'square',.06,.25);tone(262,.6,'square',.06,.5)}
};
function startMusic(){
  stopMusic(); const seq=[220,262,330,262,247,294,370,294,196,247,294,247,220,277,330,392]; let i=0;
  AUD.music=setInterval(()=>{ if(AUD.on){ const f=seq[i%seq.length]; tone(f,.24,'sine',.03); if(i%4===0) tone(f/2,.6,'triangle',.028);} i++; },260);
}
function stopMusic(){ if(AUD.music){clearInterval(AUD.music);AUD.music=null;} }
$('#soundBtn').onclick = () => { AUD.on=!AUD.on; $('#sw').style.display = AUD.on?'':'none'; $('#soundBtn').setAttribute('aria-label', AUD.on?'Tắt âm thanh':'Bật âm thanh'); };

/* ===== ĐỒNG HỒ ===== */
const CIRC = 2*Math.PI*27; $('#ringFg').style.strokeDasharray = CIRC;
let curTimer = null;
function Timer(sec,onTick,onEnd){
  this.total=sec*1000; this.left=this.total; this.run=false; this.lastSec=sec;
  this.start=()=>{ this.run=true; this.last=performance.now(); draw(this.left,this.total);
    this.id=setInterval(()=>{ if(!this.run) return; const n=performance.now(); this.left-=n-this.last; this.last=n;
      if(this.left<0) this.left=0; draw(this.left,this.total);
      const s=Math.ceil(this.left/1000); if(s!==this.lastSec){ this.lastSec=s; if(s<=5&&s>0) sfx.tick(); }
      onTick&&onTick(this.total-this.left);
      if(this.left<=0){ this.stop(); onEnd(); } },100); };
  this.pause=()=>{ this.run=false; };
  this.resume=()=>{ this.last=performance.now(); this.run=true; };
  this.stop=()=>{ clearInterval(this.id); this.run=false; };
}
function draw(left,total){
  $('#ringFg').style.strokeDashoffset = CIRC*(1-left/total);
  const s=Math.ceil(left/1000); $('#ringSec').textContent=s; $('#ring').classList.toggle('hot', s<=5);
}

/* ===== TRẠNG THÁI ===== */
const TOPICS = Object.keys(DATA).filter(k=>!k.startsWith('_'));
/* Lịch sử câu đã gặp (riêng trên máy người chơi) để lần sau ưu tiên câu mới */
const SEEN_KEY='nvtv_seen_v1', SEEN_MAX=600;
let SEEN=[]; try{ SEEN=JSON.parse(localStorage.getItem(SEEN_KEY)||'[]'); if(!Array.isArray(SEEN)) SEEN=[]; }catch(e){ SEEN=[]; }
const seenSet=()=>new Set(SEEN);
function markSeen(keys){ const s=new Set(keys); SEEN=SEEN.filter(k=>!s.has(k)).concat(keys).slice(-SEEN_MAX);
  try{ localStorage.setItem(SEEN_KEY, JSON.stringify(SEEN)); }catch(e){} }
const kR1=q=>'1|'+q.t+'|'+q.a+'|'+(q.q||''), kR2=s=>'2|'+s, kS=c=>'3|'+c.a;
// Chọn n phần tử: câu chưa gặp trước (ngẫu nhiên), thiếu thì lấy câu gặp lâu nhất
function pickFresh(pool,n,key){
  const S=seenSet(), fresh=shuffle(pool.filter(x=>!S.has(key(x)))), old=pool.filter(x=>S.has(key(x)));
  old.sort((a,b)=>SEEN.indexOf(key(a))-SEEN.indexOf(key(b)));
  return fresh.concat(old).slice(0,n);
}
const R1Q={sap:6,dien:4,sua:2,hoan:2,thieu:1}, NR1=15, NR2=9, NR2P=3;  // 15 câu phản xạ; 9 chuỗi, trong đó 3 câu thơ
// Bốc 15 câu Phản xạ đúng tỉ lệ dạng câu, ưu tiên câu chưa gặp; thiếu dạng nào thì bù bằng câu khác
function pickR1(pool){
  let out=Object.entries(R1Q).flatMap(([t,n])=>pickFresh(pool.filter(q=>q.t===t),n,kR1));
  if(out.length<NR1){ const has=new Set(out); out=out.concat(pickFresh(pool.filter(q=>!has.has(q)),NR1-out.length,kR1)); }
  return out;
}
const nLetters=s=>chars(s.replace(/ /g,'')).length;
function uniq(arr,key){ const m=new Map(); arr.forEach(x=>{ const k=key(x); if(!m.has(k)) m.set(k,x); }); return [...m.values()]; }
function buildMix(){
  const all=TOPICS.map(k=>DATA[k]);
  const r1All=uniq(all.flatMap(s=>s.r1), kR1);
  const r1=pickR1(r1All);
  const r2All=uniq(all.flatMap(s=>s.r2).filter(c=>{ const n=c.split(' ').length; return n>=5&&n<=10; }), s=>s);
  const r2=pickFresh(r2All.filter(c=>SRC[c]),NR2P,kR2); r2.push(...pickFresh(r2All.filter(c=>!r2.includes(c)),NR2-r2.length,kR2));
  const sAll=uniq(all.flatMap(s=>s.soan.flat()), c=>c.a), board=[], used=new Set();
  [3,3,5,5,7,7,9,9].forEach(L=>{ const c=pickFresh(sAll.filter(x=>nLetters(x.a)===L && !used.has(x.a)),1,kS)[0]; if(c){ used.add(c.a); board.push(c); } });
  return {name:'Trộn đề', sub:'Mỗi lần một bộ khác', r1, r2, soan:[board]};
}
/* ===== ĐỀ HÔM NAY: cả ngày cùng một đề, sang ngày mới tự đổi; xoay vòng hết kho mới lặp ===== */
const pad = n => String(n).padStart(2,'0');
const dkey = (d=new Date()) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const dayNum = (d=new Date()) => Math.floor(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/864e5);
function hash(s){ let h=2166136261; for(const c of s){ h^=c.charCodeAt(0); h=Math.imul(h,16777619); } return h>>>0; }
function seeded(arr,seed){ let a=seed|0; const r=()=>{ a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const x=arr.slice(); for(let i=x.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [x[i],x[j]]=[x[j],x[i]]; } return x; }
function take(arr,n,day,salt){ if(!arr.length) return []; const a=seeded(arr,hash(salt)), out=[];
  for(let k=0;k<Math.min(n,a.length);k++) out.push(a[(day*n+k)%a.length]); return out; }
const POOL = (()=>{ const all=TOPICS.map(k=>DATA[k]);
  return { r1: uniq(all.flatMap(s=>s.r1), kR1),
           r2: uniq(all.flatMap(s=>s.r2).filter(c=>{ const n=c.split(' ').length; return n>=5&&n<=10; }), s=>s),
           soan: uniq(all.flatMap(s=>s.soan.flat()), c=>c.a) }; })();
function dailySet(d=new Date()){
  const day=dayNum(d);
  let r1=Object.entries(R1Q).flatMap(([t,n])=>take(POOL.r1.filter(q=>q.t===t),n,day,'r1'+t));
  if(r1.length<NR1) r1=r1.concat(take(POOL.r1.filter(q=>!r1.includes(q)),NR1-r1.length,day,'r1x'));
  const poem=POOL.r2.filter(c=>SRC[c]), r2=take(poem,NR2P,day,'r2p').concat(take(POOL.r2.filter(c=>!SRC[c]),NR2,day,'r2')).slice(0,NR2);
  const soan=[3,5,7,9].flatMap(L=>take(POOL.soan.filter(c=>nLetters(c.a)===L),2,day,'s'+L));
  return {name:'Hôm nay', sub:dkey(d), daily:true, r1:r1.slice(0,NR1), r2, soan:[soan]};
}
const LOGK='nvtv_log_v1';
function getLog(){ try{ return JSON.parse(localStorage.getItem(LOGK)||'{}')||{}; }catch(e){ return {}; } }
function logDay(score){ try{ const L=getLog(), k=dkey(); L[k]=Math.max(L[k]||0, score); localStorage.setItem(LOGK, JSON.stringify(L)); }catch(e){} }
function streak(L){ let n=0; const d=new Date(); if(!(dkey(d) in L)) d.setDate(d.getDate()-1);
  while(dkey(d) in L){ n++; d.setDate(d.getDate()-1); } return n; }
const WD=['Chủ nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'], WS=['CN','T2','T3','T4','T5','T6','T7'];
function renderToday(){
  const d=new Date(), L=getLog(), k=dkey(d), done=k in L, st=streak(L);
  const week=[...Array(7)].map((_,i)=>{ const x=new Date(d); x.setDate(d.getDate()-6+i); const kk=dkey(x);
    return `<div>${WS[x.getDay()]}<i class="${kk in L?'on':''} ${kk===k?'now':''}">${x.getDate()}</i></div>`; }).join('');
  $('#today').innerHTML=`<span class="eyebrow">Đề hôm nay</span>
    <div class="tdate">${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}</div>
    <div class="tline">15 câu phản xạ, 9 chuỗi, 8 ô chữ Soán ngôi, lấy từ ${TOPICS.length} bộ đề. Sang ngày mới tự đổi đề, không lặp câu cho tới khi đi hết kho ${POOL.r1.length} câu.</div>
    <div class="tstat"><span>Chuỗi ${st} ngày liên tiếp</span>${done?`<span class="done">Hôm nay đã luyện · cao nhất ${L[k]} điểm</span>`:'<span>Hôm nay chưa luyện</span>'}</div>
    <div class="week" aria-label="7 ngày gần nhất">${week}</div>
    <button class="btn gold" id="dailyBtn">${done?'Luyện lại đề hôm nay':'Luyện đề hôm nay'}</button>
    <div class="mockline"><div><b>Thi thử sơ tuyển</b><span>50 câu phản xạ · 10 phút · đạt từ 25 câu${mockBest()!=null?` · cao nhất ${mockBest()}/50`:''}</span></div>
    <button class="btn line small" id="mockBtn">Thi thử</button></div>
    <div class="mockline"><div><b>Luyện Hoàn thiện cụm từ</b><span>20 câu · 10 giây/câu${drillBest('hoan')!=null?` · cao nhất ${drillBest('hoan')}%`:''}</span></div>
    <button class="btn line small" id="drHoan">Luyện</button></div>
    <div class="mockline"><div><b>Luyện Xâu chuỗi</b><span>12 chuỗi · 30 hoặc 20 giây${drillBest('r2')!=null?` · cao nhất ${drillBest('r2')}%`:''}</span></div>
    <button class="btn line small" id="drR2">Luyện</button></div>`;
  $('#dailyBtn').onclick=()=>begin(dailySet());
  $('#mockBtn').onclick=mockIntro;
  $('#drHoan').onclick=()=>drillIntro('hoan'); $('#drR2').onclick=()=>drillIntro('r2');
}
/* ===== THI THỬ SƠ TUYỂN: 50 câu phản xạ trong 15 phút, đạt từ 25 câu ===== */
const MOCK_N=50, MOCK_SECS=600, MOCK_PASS=25, MOCKK='nvtv_mock_v1';
function mockHist(){ try{ return JSON.parse(localStorage.getItem(MOCKK)||'[]')||[]; }catch(e){ return []; } }
function mockBest(){ const h=mockHist(); return h.length?Math.max(...h.map(x=>x.s)):null; }
function mockSet(){
  const q=Object.fromEntries(Object.entries(R1Q).map(([t,n])=>[t,Math.round(n*MOCK_N/NR1)]));
  let out=Object.entries(q).flatMap(([t,n])=>pickFresh(POOL.r1.filter(x=>x.t===t),n,kR1));
  if(out.length<MOCK_N){ const has=new Set(out); out=out.concat(pickFresh(POOL.r1.filter(x=>!has.has(x)),MOCK_N-out.length,kR1)); }
  return shuffle(out.slice(0,MOCK_N));
}
function mockIntro(){
  ac(); if(AUD.ctx&&AUD.ctx.state==='suspended') AUD.ctx.resume(); stopMusic();
  const h=mockHist().slice(-5).reverse();
  $('#intro').innerHTML=`<span class="eyebrow">Mô phỏng vòng sơ tuyển</span>
    <h2 class="big">Thi thử 50 câu</h2>
    <ul class="rules"><li>50 câu kiểu vòng Phản xạ trong 10 phút (khoảng 12 giây mỗi câu). Thi thật được 15 phút; luyện 10 phút để dư sức.</li>
      <li>Đúng từ 25 câu là đạt ngưỡng vào phỏng vấn. Nên nhắm từ 35 câu để chắc chắn.</li>
      <li>Không có gợi ý. Câu chưa nghĩ ra thì bấm <b>Bỏ qua</b>: câu đó xuống cuối hàng, không lộ đáp án. Làm hết câu dễ trước, còn giờ thì quay lại câu khó.</li>
      <li>Hết giờ hoặc hết câu, app chấm điểm và liệt kê các câu sai để ôn lại.</li></ul>
    ${h.length?`<div class="board">${h.map(x=>`<div class="prow"><span class="rk">·</span><span>${esc(x.d)}</span><span class="pill ${x.s>=MOCK_PASS?'go':'out'}">${x.s>=MOCK_PASS?'Đạt':'Chưa đạt'}</span><span class="pts">${x.s}</span></div>`).join('')}</div>`:''}
    <button class="btn gold" id="goMock">Bắt đầu tính giờ</button>
    <button class="btn line" id="backMock">Về trang chủ</button>`;
  show('intro');
  $('#backMock').onclick=goHome;
  $('#goMock').onclick=()=>{ newGame({name:'Thi thử sơ tuyển',r1:[],r2:[],soan:[[]]}); const q=mockSet(); G.mock={qs:q.slice(),orig:q,secs:MOCK_SECS,res:[]}; show('play'); startR1(); };
}
function mockEnd(){
  G.tok++; if(curTimer) curTimer.stop(); cur={hint:null,skip:null};
  const M=G.mock, ok=M.res.filter(r=>r.ok).length, done=M.res.length, pass=ok>=MOCK_PASS;
  const resOf=new Map(M.res.map(r=>[r.q,r]));
  const now=new Date(), d=`${pad(now.getDate())}/${pad(now.getMonth()+1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  try{ const h=mockHist(); h.push({d,s:ok}); localStorage.setItem(MOCKK, JSON.stringify(h.slice(-30))); }catch(e){}
  pass ? sfx.fanfare() : sfx.lose();
  const by={}; M.orig.forEach(q=>{ const b=by[q.t]||(by[q.t]={n:0,ok:0}); b.n++; const r=resOf.get(q); if(r&&r.ok) b.ok++; });
  const wrong=M.res.filter(r=>!r.ok).concat(M.orig.filter(q=>!resOf.has(q)).map(q=>({q,ok:false,skip:true})));
  const ansOf=q=>q.t==='thieu' ? (q.q.match(/\[(.)\]/g)||[]).map(x=>x[1]).join(' ') : q.a;
  $('#final').innerHTML=`<div class="logo"><span class="eyebrow">Kết quả thi thử sơ tuyển</span>
      <h2 class="big">${ok}/${MOCK_N} câu đúng</h2>
      <p class="muted">${pass?(ok>=35?'Đạt ngưỡng, và đủ chắc để vào phỏng vấn.':'Đạt ngưỡng 25 câu. Cố lên mức 35 để chắc chắn hơn.'):`Chưa đạt, còn thiếu ${MOCK_PASS-ok} câu. Ôn các câu sai bên dưới rồi thi lại.`}</p></div>
    <div class="stats"><div><b>${done}</b><span>Câu đã làm</span></div><div><b>${MOCK_N-done}</b><span>Chưa làm được</span></div><div><b>${mockBest()}</b><span>Cao nhất</span></div></div>
    <div class="board">${Object.entries(by).map(([t,b])=>`<div class="prow"><span class="rk">·</span><span>${esc(R1LBL[t]||t)}</span><span></span><span class="pts">${b.ok}/${b.n}</span></div>`).join('')}</div>
    ${wrong.length?`<span class="eyebrow">Câu sai và chưa làm (${wrong.length})</span>
    <div class="board">${wrong.map(r=>`<div class="prow" style="grid-template-columns:1fr"><span><span class="muted" style="font-size:12px">${esc(R1LBL[r.q.t]||'')}${r.skip?' · chưa làm':''}</span><br>${r.q.q&&r.q.t!=='thieu'?esc(r.q.q)+' → ':''}<b style="color:var(--gold-hi)">${esc(ansOf(r.q))}</b></span></div>`).join('')}</div>`:''}
    <button class="btn gold" id="mockAgain">Thi lại đề khác</button>
    <button class="btn line" id="mockHome">Về trang chủ</button>`;
  show('final');
  $('#mockAgain').onclick=mockIntro; $('#mockHome').onclick=goHome;
}
/* ===== LUYỆN ĐIỂM YẾU: Hoàn thiện cụm từ (10 giây/câu) và Xâu chuỗi ===== */
const DRILL = {
  hoan:{name:'Hoàn thiện cụm từ', n:20, secs:10, unit:'câu', key:q=>kR1(q),
    pool:()=>POOL.r1.filter(q=>q.t==='hoan' && q.a.split(' ').length<=8)},
  r2:{name:'Xâu chuỗi', n:12, secs:30, unit:'chuỗi', key:c=>kR2(c), pool:()=>POOL.r2}
};
const WEAKK='nvtv_weak_v1', DHK='nvtv_drill_v1';
function getJ(k,d){ try{ return JSON.parse(localStorage.getItem(k)||'null')||d; }catch(e){ return d; } }
function setJ(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function drillBest(kind){ const h=getJ(DHK,{})[kind]||[]; return h.length?Math.max(...h.map(x=>x.p)):null; }
function weakOf(kind){ const W=getJ(WEAKK,{}), D=DRILL[kind]; return D.pool().filter(x=>W[D.key(x)]); }
// Ưu tiên câu từng làm sai (tối đa nửa lượt), phần còn lại là câu chưa gặp
function drillSet(kind, only){
  const D=DRILL[kind];
  if(only) return shuffle(only.slice());
  const weak=shuffle(weakOf(kind)).slice(0,Math.floor(D.n/2)), has=new Set(weak);
  let rest;
  if(kind==='r2'){ const p=D.pool().filter(c=>!has.has(c)), need=D.n-weak.length, np=Math.ceil(need/2);
    rest=pickFresh(p.filter(c=>SRC[c]),np,kR2); rest=rest.concat(pickFresh(p.filter(c=>!SRC[c]&&!rest.includes(c)),need-rest.length,kR2)); }
  else rest=pickFresh(D.pool().filter(q=>!has.has(q)), D.n-weak.length, kR1);
  const out=shuffle(weak.concat(rest));
  return kind==='r2' ? out.sort((a,b)=>a.split(' ').length-b.split(' ').length) : out;
}
function drillIntro(kind){
  ac(); if(AUD.ctx&&AUD.ctx.state==='suspended') AUD.ctx.resume(); stopMusic();
  const D=DRILL[kind], nw=weakOf(kind).length, h=(getJ(DHK,{})[kind]||[]).slice(-5).reverse();
  const rules = kind==='hoan'
    ? [`${D.n} câu Hoàn thiện cụm từ: phụ âm hiện sẵn, nguyên âm bị ẩn (Ch_ ng_p ph__ r___), gõ lại cả cụm có dấu.`,
       'Mỗi câu chỉ có 10 giây. Hết giờ app hiện đáp án rồi sang câu mới.',
       'Mẹo: đọc nhanh khung phụ âm đầu mỗi tiếng, nghĩ tới thành ngữ, tục ngữ quen; gõ không dấu cũng được nếu đúng chữ (app chấp nhận dấu đặt khác vị trí).']
    : [`${D.n} chuỗi, nửa là câu thơ, dài dần. Chạm các từ theo đúng thứ tự; từ viết hoa là từ mở đầu.`,
       'Chọn thời gian: 30 giây như chương trình, hoặc 20 giây để luyện tăng tốc.',
       'Mẹo: tìm từ viết hoa trước, rồi ghép cặp từ hay đi liền nhau; câu thơ thường 5, 6, 7 hoặc 8 tiếng.'];
  $('#intro').innerHTML=`<span class="eyebrow">Luyện điểm yếu</span>
    <h2 class="big">${D.name}</h2>
    <ul class="rules">${rules.map(r=>`<li>${esc(r)}</li>`).join('')}
      <li>${nw?`Đang có <b>${nw}</b> ${D.unit} từng làm sai; mỗi lượt tự đưa lại tối đa ${Math.floor(D.n/2)} ${D.unit} để ôn. Làm đúng lại thì ${D.unit} đó được gỡ khỏi danh sách.`:'Câu làm sai sẽ được ghi lại và đưa ra ôn ở các lượt sau.'}</li></ul>
    ${h.length?`<div class="board">${h.map(x=>`<div class="prow"><span class="rk">·</span><span>${esc(x.d)}</span><span class="pill ${x.p>=80?'go':'out'}">${x.p}%</span><span class="pts">${x.s}/${x.n}</span></div>`).join('')}</div>`:''}
    ${kind==='r2'?`<div class="actions"><button class="btn gold" id="goD30">30 giây/chuỗi</button><button class="btn line" id="goD20">20 giây/chuỗi</button></div>`
      :`<button class="btn gold" id="goD">Bắt đầu · 10 giây/câu</button>`}
    ${nw?`<button class="btn line" id="goW">Chỉ ôn ${Math.min(nw,D.n)} ${D.unit} từng sai</button>`:''}
    <button class="btn line" id="backD">Về trang chủ</button>`;
  show('intro');
  $('#backD').onclick=goHome;
  const go=(secs,only)=>startDrill(kind, secs, only);
  if(kind==='r2'){ $('#goD30').onclick=()=>go(30); $('#goD20').onclick=()=>go(20); } else $('#goD').onclick=()=>go(10);
  if(nw) $('#goW').onclick=()=>go(kind==='r2'?30:10, shuffle(weakOf(kind)).slice(0,D.n));
}
function startDrill(kind, secs, only){
  const D=DRILL[kind];
  newGame({name:D.name,r1:[],r2:[],soan:[[]]});
  const qs=drillSet(kind, only); G.drill={kind,secs,qs,res:[]};
  markSeen(qs.map(D.key));
  $('#hintBtn').hidden=true; $('#skipBtn').textContent='Bỏ qua (xem đáp án)';
  show('play');
  const tok=++G.tok; let i=0;
  function next(){
    if(tok!==G.tok) return; if(curTimer) curTimer.stop();
    if(i>=qs.length){ drillEnd(); return; }
    const q=qs[i], box=$('#qcard'); box.className='card'; let finished=false, ctl, t0=performance.now();
    hud('Luyện · '+D.name, `${kind==='r2'?'Chuỗi':'Câu'} ${i+1}/${qs.length} · đúng ${G.drill.res.filter(r=>r.ok).length}`);
    const finish=ok=>{ if(finished) return; finished=true; curTimer.stop();
      G.drill.res.push({q,ok,t:(performance.now()-t0)/1000});
      if(ok) addMe(kind==='r2'?20:10); else { sfx.bad(); ctl.reveal(); }
      const src=kind==='r2'&&SRC[q]?`<p class="reveal">Trích: ${esc(SRC[q])}</p>`:'';
      if(!ok) box.insertAdjacentHTML('beforeend',`<p class="reveal">Đáp án: <b>${esc(kind==='r2'?q:q.a)}</b></p>`);
      if(src) box.insertAdjacentHTML('beforeend',src);
      i++; setTimeout(next, ok?(src?1500:500):(src?2600:2200)); };
    if(kind==='hoan'){
      box.innerHTML=`<div class="qtype">Hoàn thiện cụm từ · ${q.a.split(' ').length} tiếng</div><div class="qtext big">${esc(q.q)}</div>`;
      ctl=typed(box, q.a, ()=>finish(true), 'Gõ cả cụm có dấu');
    } else {
      const words=q.split(' ');
      box.innerHTML=`<div class="qtype">Chuỗi ${words.length} từ · ${SRC[q]?'sắp thành câu thơ':'sắp thành câu'}</div>`;
      ctl=arrange(box, words, [words.length], 'word', ()=>finish(true));
    }
    cur={hint:null, skip:()=>finish(false)};
    curTimer=new Timer(secs,null,()=>{ if(tok===G.tok) finish(false); }); curTimer.start();
  }
  next();
}
function drillEnd(){
  G.tok++; if(curTimer) curTimer.stop(); cur={hint:null,skip:null};
  $('#hintBtn').hidden=false; $('#skipBtn').textContent='Bỏ qua';
  const {kind,secs,qs,res}=G.drill, D=DRILL[kind];
  const ok=res.filter(r=>r.ok), p=Math.round(100*ok.length/Math.max(1,res.length));
  const avg=ok.length?(ok.reduce((s,r)=>s+r.t,0)/ok.length).toFixed(1):'–';
  const W=getJ(WEAKK,{}); res.forEach(r=>{ const k=D.key(r.q); if(r.ok) delete W[k]; else W[k]=(W[k]||0)+1; }); setJ(WEAKK,W);
  const now=new Date(), d=`${pad(now.getDate())}/${pad(now.getMonth()+1)} ${pad(now.getHours())}:${pad(now.getMinutes())} · ${secs}s`;
  const H=getJ(DHK,{}); (H[kind]=H[kind]||[]).push({d,s:ok.length,n:res.length,p}); H[kind]=H[kind].slice(-30); setJ(DHK,H);
  p>=80 ? sfx.fanfare() : sfx.lose();
  const wrong=res.filter(r=>!r.ok);
  $('#final').innerHTML=`<div class="logo"><span class="eyebrow">Luyện điểm yếu · ${esc(D.name)} · ${secs} giây</span>
      <h2 class="big">${ok.length}/${res.length} ${D.unit} đúng</h2>
      <p class="muted">${p>=90?'Rất chắc tay. Thử giảm thời gian hoặc chuyển sang dạng khác.':p>=70?'Khá tốt. Ôn lại các câu sai bên dưới rồi làm lượt mới.':'Cần luyện thêm. Đọc kỹ đáp án các câu sai, lát nữa bấm “Ôn lại câu sai”.'}</p></div>
    <div class="stats"><div><b>${p}%</b><span>Tỉ lệ đúng</span></div><div><b>${avg}s</b><span>TB mỗi câu đúng</span></div><div><b>${drillBest(kind)}%</b><span>Cao nhất</span></div></div>
    ${wrong.length?`<span class="eyebrow">Cần ôn lại (${wrong.length})</span>
    <div class="board">${wrong.map(r=>`<div class="prow" style="grid-template-columns:1fr"><span>${kind==='hoan'?`<span class="muted">${esc(r.q.q)}</span> → `:''}<b style="color:var(--gold-hi)">${esc(kind==='r2'?r.q:r.q.a)}</b>${kind==='r2'&&SRC[r.q]?`<br><span class="muted" style="font-size:12px">${esc(SRC[r.q])}</span>`:''}</span></div>`).join('')}</div>`:''}
    ${wrong.length?`<button class="btn gold" id="dWrong">Ôn lại ${wrong.length} ${D.unit} sai ngay</button>`:''}
    <button class="btn ${wrong.length?'line':'gold'}" id="dAgain">Lượt mới</button>
    <button class="btn line" id="dHome">Về trang chủ</button>`;
  show('final');
  if(wrong.length) $('#dWrong').onclick=()=>startDrill(kind, secs, wrong.map(r=>r.q));
  $('#dAgain').onclick=()=>drillIntro(kind); $('#dHome').onclick=goHome;
}
function begin(T){ ac(); if(AUD.ctx&&AUD.ctx.state==='suspended') AUD.ctx.resume(); if(!AUD.music) startMusic(); newGame(T); intro(1); }
function goHome(){ renderToday(); show('home'); }
const isNew = c => !!c && (dayNum()-dayNum(new Date(c+'T00:00:00')))<=1;
let topic = '_mix', G;
$('#topics').innerHTML = `<button class="topic" data-t="_mix" aria-pressed="true"><b>Trộn đề</b><span>Mỗi lần một bộ khác</span></button>` +
  TOPICS.map(k=>`<button class="topic" data-t="${k}" aria-pressed="false"><b>${esc(DATA[k].name)}${isNew(DATA[k].created)?'<span class="new">Mới</span>':''}</b><span>${esc(DATA[k].sub||'')}</span></button>`).join('');
$('#topics').onclick = e => { const b=e.target.closest('.topic'); if(!b) return; topic=b.dataset.t; sfx.tap();
  document.querySelectorAll('.topic').forEach(x=>x.setAttribute('aria-pressed', x===b)); };

function newGame(T){
  G = {round:0, tok:0, ads:0, right:0, practice:false, T: T || (topic==='_mix' ? buildMix() : DATA[topic]),
       players:[{name:'Bạn',me:true,score:0,out:false},{name:'Lan Anh',score:0,out:false},{name:'Minh Quân',score:0,out:false},{name:'Cô Hạnh',score:0,out:false}]};
}
const me = () => G.players[0];
function addMe(n,count=true){ me().score+=n; if(count) G.right++; $('#hudScore').textContent=me().score; }
let cur = {hint:null, skip:null};
function hud(name,q){ $('#hudName').textContent=name; $('#hudQ').textContent=q; $('#hudScore').textContent=me().score; }

/* ===== QUẢNG CÁO MÔ PHỎNG ===== */
let adIv=null;
function watchAd(cb){
  if(curTimer) curTimer.pause();
  $('#ad').hidden=false; let n=5; $('#adCount').textContent=n+' giây'; $('#adOk').disabled=true;
  adIv=setInterval(()=>{ n--; $('#adCount').textContent = n>0 ? n+' giây' : 'Đã xem xong';
    if(n<=0){ clearInterval(adIv); $('#adOk').disabled=false; $('#adOk').focus(); } },1000);
  $('#adOk').onclick=()=>{ close(); G.ads++; cb(); };
  $('#adCancel').onclick=()=>close();
  function close(){ clearInterval(adIv); $('#ad').hidden=true; if(curTimer) curTimer.resume(); }
}
$('#hintBtn').onclick=()=>{ if(G&&G.mock) return; if(cur.hint){ G.ads++; sfx.whoosh(); cur.hint(); } };
$('#skipBtn').onclick=()=>{ if(cur.skip){ sfx.tap(); cur.skip(); } };

/* ===== THÀNH PHẦN: XẾP Ô (chữ cái & từ) ===== */
function arrange(box, ans, groups, kind, onDone){
  const tiles = ans.slice();
  let order = ans.map((_,i)=>i);
  if(ans.length>1){ let n=0; do{ shuffle(order); n++; }while(order.every((v,i)=>tiles[v]===ans[i]) && n<20); }
  let placed=[], locked=0, busy=false;
  box.insertAdjacentHTML('beforeend', `<div class="slots ${kind}"></div><div class="tiles ${kind}"></div>
    <div class="tools"><button class="btn line small" data-a="del">Xóa</button><button class="btn line small" data-a="clr">Làm lại</button></div>`);
  const slotsEl=box.querySelector('.slots'), tilesEl=box.querySelector('.tiles');
  function render(){
    let k=0, h='';
    groups.forEach(len=>{ h+='<div class="group">'; for(let j=0;j<len;j++,k++){ const p=placed[k];
      h+=`<div class="slot ${p!==undefined?'f':''} ${k<locked?'k':''}">${p!==undefined?esc(tiles[p]):''}</div>`; } h+='</div>'; });
    slotsEl.innerHTML=h;
    tilesEl.innerHTML = order.map(i=>`<button class="tile" data-i="${i}" ${placed.includes(i)?'disabled':''}>${esc(tiles[i])}</button>`).join('');
  }
  function check(){
    if(placed.length<ans.length) return;
    if(placed.map(i=>tiles[i]).join('|')===ans.join('|')){ busy=true; sfx.good(); box.classList.add('flash-good'); onDone(); }
    else { busy=true; sfx.bad(); slotsEl.classList.add('shake');
      setTimeout(()=>{ slotsEl.classList.remove('shake'); placed=placed.slice(0,locked); busy=false; render(); },420); }
  }
  tilesEl.onclick=e=>{ const b=e.target.closest('.tile'); if(!b||b.disabled||busy) return; sfx.tap(); placed.push(+b.dataset.i); render(); check(); };
  box.querySelector('.tools').onclick=e=>{ const a=e.target.closest('button')?.dataset.a; if(!a||busy) return;
    if(a==='del' && placed.length>locked) placed.pop();
    if(a==='clr') placed=placed.slice(0,locked);
    render(); };
  render();
  return {
    hint(){ if(busy||locked>=ans.length) return; placed=placed.slice(0,locked);
      const idx=tiles.findIndex((u,i)=>u===ans[locked] && !placed.includes(i)); placed.push(idx); locked++; sfx.whoosh(); render(); check(); },
    reveal(){ busy=true; placed=ans.map((u,k)=>k); locked=ans.length; render(); }
  };
}

/* ===== THÀNH PHẦN: GÕ ĐÁP ÁN ===== */
function typed(box, ans, onOk, placeholder='Gõ đáp án có dấu'){
  const A=chars(UP(ans)); const shown=new Set(); let done=false;
  box.insertAdjacentHTML('beforeend', `<div class="pattern" hidden></div>
    <form class="answer" autocomplete="off"><input aria-label="Nhập đáp án" placeholder="${placeholder}" enterkeyhint="send" autocapitalize="off" spellcheck="false"><button class="btn gold small" type="submit">Trả lời</button></form>`);
  const pt=box.querySelector('.pattern'), form=box.querySelector('form'), inp=form.querySelector('input');
  function drawP(all){ let h='<div class="group">'; A.forEach((ch,k)=>{ if(ch===' ') h+='</div><div class="group">';
      else { const v=all||shown.has(k); h+=`<div class="slot ${v?'f':''}">${v?esc(ch):''}</div>`; } }); pt.innerHTML=h+'</div>'; }
  form.onsubmit=e=>{ e.preventDefault(); if(done) return;
    if(same(inp.value, ans)){ done=true; sfx.good(); box.classList.add('flash-good'); onOk(); }
    else { sfx.bad(); form.classList.add('shake'); setTimeout(()=>form.classList.remove('shake'),400); inp.select(); } };
  setTimeout(()=>inp.focus({preventScroll:true}),60);
  return {
    hint(){ if(done) return; pt.hidden=false; const left=A.map((c,k)=>k).filter(k=>A[k]!==' '&&!shown.has(k));
      if(left.length>1){ shown.add(left[rnd(0,left.length-1)]); sfx.whoosh(); } drawP(); },
    reveal(){ done=true; pt.hidden=false; drawP(true); },
    get done(){ return done; }, set done(v){ done=v; }
  };
}

/* ===== GIỚI THIỆU VÒNG ===== */
function nBoards(){ return G.T.boards.length; }
function need(){ return Math.floor(nBoards()/2)+1; }
const ROUNDS = {
  1:{name:'Phản xạ', rules:()=>['15 câu, 90 giây cho cả vòng.','Sắp chữ cái thành từ, điền từ vào ca dao tục ngữ, viết lại cho đúng, hoàn thiện cụm từ, điền chữ cái còn thiếu trong đoạn văn.','Mỗi câu đúng 10 điểm. Câu khó có thể bỏ qua.','Hết vòng, người thấp điểm nhất bị loại.']},
  2:{name:'Xâu chuỗi', rules:()=>['9 chuỗi từ (có câu thơ của các tác phẩm nổi tiếng), dài dần, mỗi chuỗi 30 giây.','Chạm các từ theo đúng thứ tự để thành câu. Từ viết hoa là từ mở đầu.','Mỗi chuỗi đúng 20 điểm.','Chỉ người dẫn đầu tổng điểm được vào vòng Soán ngôi.']},
  3:{name:'Soán ngôi', rules:()=>['8 ô chữ khó dần: hai ô 3 chữ cái, hai ô 5, hai ô 7, hai ô 9. Gợi ý là lời giải nghĩa của từ.','Mỗi ô chữ 30 giây. Chữ cái đầu tiên mở sẵn; sau 15 giây mở thêm một ô bất kỳ.','Mỗi câu đúng nhân đôi mốc điểm: 5, 10, 20, 40, 80, 160, 320, 640. Sau mỗi câu đúng có thể dừng để giữ điểm.','Hết giờ mà chưa đúng là mất hết điểm đang giữ ở vòng này. Đúng cả 8 câu thì soán ngôi.']}
};
function intro(n){
  G.round=n; const R=ROUNDS[n]; const active=G.players.filter(p=>!p.out || p.me);
  const who = n===3
    ? `<div class="vs"><div class="who"><b>Bạn</b><span>Người thách đấu · ${me().score} điểm</span></div><div class="x">VS</div><div class="who"><b>${KING}</b><span>Nhà vua đương nhiệm</span></div></div>`
    : `<div class="board">${active.map(p=>`<div class="prow ${p.me?'me':''}"><span class="rk">·</span><span>${esc(p.name)}</span><span></span><span class="pts">${p.score}</span></div>`).join('')}</div>`;
  $('#intro').innerHTML = `
    <span class="eyebrow">${G.T.daily?'Đề hôm nay':'Chủ đề '+esc(G.T.name)} · Vòng ${n} / 3${G.practice?' · luyện tập':''}</span>
    <h2 class="big">${R.name}</h2>${who}
    <ul class="rules">${R.rules().map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
    <button class="btn gold" id="goRound">Bắt đầu vòng ${n}</button>`;
  show('intro'); sfx.whoosh();
  $('#goRound').onclick=()=>{ show('play'); [null,startR1,startR2,startR3][n](); };
}

/* ===== VÒNG 1: PHẢN XẠ ===== */
const R1LBL = {sap:'Sắp xếp thành từ có nghĩa', dien:'Điền từ còn thiếu', sua:'Viết lại cho đúng chính tả', hoan:'Hoàn thiện cụm từ', loi:'Có bao nhiêu lỗi chính tả?', thieu:'Điền chữ cái còn thiếu'};
function startR1(){
  $('#skipBtn').textContent='Bỏ qua';
  const M=G.mock, finish=()=>(M?mockEnd:endRound)();
  const tok=++G.tok, qs=M ? M.qs : shuffle(pickR1(G.T.r1)); let i=0; markSeen(qs.map(kR1));
  curTimer=new Timer(M?M.secs:90,null,()=>{ if(tok===G.tok) finish(); });
  function next(){ if(tok!==G.tok) return; if(i>=qs.length){ curTimer.stop(); finish(); return; } render(qs[i]); }
  const go = ok => { if(ok) addMe(10); if(M) M.res.push({q:qs[i],ok}); i++; setTimeout(next, ok?450:(M?700:1100)); };
  // Thi thử: Bỏ qua = đưa câu xuống cuối hàng, không lộ đáp án; còn giờ thì gặp lại
  const mockSkip = q => { let used=false; return ()=>{ if(used) return; used=true; qs.push(q); i++; setTimeout(next,120); }; };
  function render(q){
    hud(M?'Thi thử sơ tuyển':'Vòng 1 · Phản xạ', M?`Đã làm ${M.res.length}/${MOCK_N} · còn ${MOCK_N-M.res.length} câu`:`Câu ${i+1}/${qs.length}`);
    const box=$('#qcard'); box.className='card';
    box.innerHTML=`<div class="qtype">${R1LBL[q.t]}</div>`;
    if(q.t==='sap'){
      // Giống màn hình phát sóng: các chữ cái xáo trộn, cách nhau bằng " / "; gõ từ có nghĩa
      const L=chars(q.a.replace(/ /g,'')), o=L.map((_,k)=>k); let n=0;
      if(L.length>1) do{ shuffle(o); n++; }while(o.every((v,k)=>L[v]===L[k]) && n<30);
      box.insertAdjacentHTML('beforeend', `<div class="tv"><div class="tv-q sap">${o.map(k=>esc(L[k])).join(' / ')}</div></div>`);
      const ctl=typed(box, q.a, ()=>go(true), 'Gõ từ có nghĩa');
      cur={hint:()=>ctl.hint(), skip:()=>{ if(ctl.done) return; ctl.reveal(); go(false); }};
    } else if(q.t==='thieu'){
      // Đoạn văn khuyết chữ cái (phụ âm hoặc nguyên âm), gõ lần lượt các chữ còn thiếu
      const parts=q.q.split(/\[(.)\]/), miss=parts.filter((_,k)=>k%2), shown=new Set(); let done=false;
      const drawT=all=>parts.map((p,k)=>{ if(!(k%2)) return esc(p); const j=(k-1)/2;
        return shown.has(j)?`<b class="gap hv">${esc(p)}</b>`:all?`<b class="gap rv">${esc(p)}</b>`:'<b class="gap">_</b>'; }).join('');
      box.insertAdjacentHTML('beforeend', `<div class="tv"><div class="tv-q txt">Chữ cái nào còn thiếu trong đoạn trích sau: “<span class="psg"></span>”</div></div>
        <p class="muted" style="font-size:13px">Gõ lần lượt ${miss.length} chữ cái còn thiếu, cách nhau bằng dấu cách (ví dụ: k x y).</p>
        <form class="answer" autocomplete="off"><input aria-label="Các chữ cái còn thiếu" placeholder="Các chữ còn thiếu" enterkeyhint="send" autocapitalize="off" spellcheck="false"><button class="btn gold small" type="submit">Trả lời</button></form>`);
      const psg=box.querySelector('.psg'), form=box.querySelector('form'), inp=form.querySelector('input');
      const norm=s=>s.normalize('NFC').toLocaleLowerCase('vi').replace(/[^\p{L}]/gu,'');
      const target=norm(miss.join('')); psg.innerHTML=drawT();
      form.onsubmit=e=>{ e.preventDefault(); if(done) return;
        if(norm(inp.value)===target){ done=true; sfx.good(); box.classList.add('flash-good'); psg.innerHTML=drawT(true); go(true); }
        else { sfx.bad(); form.classList.add('shake'); setTimeout(()=>form.classList.remove('shake'),400); inp.select(); } };
      setTimeout(()=>inp.focus({preventScroll:true}),60);
      cur={hint:()=>{ if(done) return; const j=miss.findIndex((_,x)=>!shown.has(x)); if(j>=0 && shown.size<miss.length-1){ shown.add(j); psg.innerHTML=drawT(); sfx.whoosh(); } },
        skip:()=>{ if(done) return; done=true; psg.innerHTML=drawT(true);
          box.insertAdjacentHTML('beforeend', `<p class="reveal">Các chữ còn thiếu: <b>${esc(miss.join(' '))}</b></p>`); go(false); }};
    } else if(q.t==='loi'){
      let done=false; const ok=q.a;
      box.insertAdjacentHTML('beforeend', `<div class="passage">${esc(q.q)}</div><div class="nums">${[0,1,2,3,4,5].map(n=>`<button class="opt" data-n="${n}">${n}</button>`).join('')}</div>`);
      box.querySelector('.nums').onclick=e=>{ const b=e.target.closest('.opt'); if(!b||done||b.disabled) return; done=true;
        const good=b.dataset.n===ok; b.classList.add(good?'ok':'no');
        if(!good){ sfx.bad(); box.querySelector(`[data-n="${ok}"]`).classList.add('ok'); } else sfx.good();
        go(good); };
      cur={hint:()=>{ if(done) return; const w=shuffle([...box.querySelectorAll('.opt')].filter(b=>b.dataset.n!==ok && !b.disabled)).slice(0,2);
          w.forEach(b=>{ b.disabled=true; b.classList.add('gone'); }); sfx.whoosh(); },
        skip:()=>{ if(done) return; done=true; box.querySelector(`[data-n="${ok}"]`).classList.add('ok'); go(false); }};
    } else {
      box.insertAdjacentHTML('beforeend', `<div class="qtext ${q.t!=='dien'?'big':''}">${esc(q.q)}</div>`);
      const ph = q.t==='dien' ? 'Gõ phần còn thiếu' : 'Gõ lại cho đúng';
      const ctl=typed(box, q.a, ()=>go(true), ph);
      cur={hint:()=>ctl.hint(), skip:()=>{ if(ctl.done) return; ctl.reveal(); go(false); }};
    }
    if(M) cur={hint:null, skip:mockSkip(q)};
  }
  next(); curTimer.start();
}

/* ===== VÒNG 2: XÂU CHUỖI ===== */
function startR2(){
  $('#skipBtn').textContent='Bỏ qua';
  const tok=++G.tok; let pool=G.T.r2.slice();
  const fill=shuffle(DATA._fill.slice()); while(pool.length<NR2 && fill.length) pool.push(fill.pop());
  const poemP=pool.filter(c=>SRC[c]), restP=pool.filter(c=>!SRC[c]);
  const qs=pickFresh(poemP,NR2P,kR2).concat(pickFresh(restP,NR2,kR2)).slice(0,NR2);
  if(qs.length<NR2) qs.push(...pickFresh(pool.filter(c=>!qs.includes(c)),NR2-qs.length,kR2));
  qs.sort((a,b)=>a.split(' ').length-b.split(' ').length); let i=0; markSeen(qs.map(kR2));
  function next(){
    if(tok!==G.tok) return; if(curTimer) curTimer.stop();
    if(i>=qs.length){ endRound(); return; }
    const words=qs[i].split(' '), box=$('#qcard'); box.className='card';
    hud('Vòng 2 · Xâu chuỗi', `Chuỗi ${i+1}/${qs.length}`);
    box.innerHTML=`<div class="qtype">Chuỗi ${words.length} từ · ${SRC[qs[i]]?'sắp thành câu thơ':'sắp thành câu'}</div>`;
    const srcNote=SRC[qs[i]]?`<p class="reveal">Trích: ${esc(SRC[qs[i]])}</p>`:'';
    let finished=false;
    const finish=win=>{ if(finished) return; finished=true; curTimer.stop();
      if(win){ addMe(20); if(srcNote) box.insertAdjacentHTML('beforeend',srcNote); i++; setTimeout(next,srcNote?1700:600); }
      else { sfx.bad(); ctl.reveal(); box.insertAdjacentHTML('beforeend','<p class="reveal">Đáp án đã hiện ở trên</p>'+srcNote); i++; setTimeout(next,srcNote?2600:1900); } };
    const ctl=arrange(box, words, [words.length], 'word', ()=>finish(true));
    cur={hint:()=>{ if(!finished) ctl.hint(); }, skip:()=>finish(false)};
    curTimer=new Timer(30,null,()=>{ if(tok===G.tok) finish(false); }); curTimer.start();
  }
  next();
}

/* ===== VÒNG 3: SOÁN NGÔI · 4 Ô CHỮ 3-5-7-9 ===== */
const LADDER=[5,10,20,40,80,160,320,640], QTIME=[30,30,30,30,30,30,30,30], LEN=[3,3,5,5,7,7,9,9];
function startR3(){
  const S0=seenSet(), boards=shuffle(G.T.soan.slice()).sort((a,b)=>a.filter(c=>S0.has(kS(c))).length-b.filter(c=>S0.has(kS(c))).length);
  const tok=++G.tok, set=boards[0]; let qi=0; markSeen(set.map(kS));
  G.bank=0; G.r3='lost'; G.reached=0;
  $('#skipBtn').textContent='Dừng, giữ điểm';
  const ladder=()=>`<div class="ladder">${LADDER.map((p,k)=>`<div class="${k<qi?'done':k===qi?'now':''}"><span>Câu ${k+1} · ${LEN[k]} chữ</span><b>${p}</b></div>`).join('')}</div>`;
  function play(){
    if(tok!==G.tok) return; if(curTimer) curTimer.stop();
    const q=set[qi], W=chars(UP(q.a.replace(/ /g,''))), open=new Set([0]); let over=false, auto=0;
    hud('Vòng 3 · Soán ngôi', `Câu ${qi+1}/${set.length} · Đang giữ ${G.bank} điểm`);
    const box=$('#qcard'); box.className='card';
    box.innerHTML=`${ladder()}<div class="qtype">Ô chữ ${W.length} chữ cái</div><div class="row1"></div>
      <div class="def">${esc(q.d)}</div>
      <form class="answer" autocomplete="off"><input aria-label="Đáp án ô chữ" placeholder="Gõ đáp án có dấu" enterkeyhint="send" autocapitalize="off" spellcheck="false"><button class="btn gold small" type="submit">Trả lời</button></form>
      <div class="after"><p class="muted" style="font-size:13px">Chữ cái đầu đã mở. Sau 15 giây mở thêm một ô bất kỳ; bấm Gợi ý để mở ngay một ô.</p></div>`;
    const cells=box.querySelector('.row1'), form=box.querySelector('form'), inp=form.querySelector('input'), after=box.querySelector('.after');
    const drawC=all=>{ cells.innerHTML=W.map((ch,k)=>{ const v=all||open.has(k); return `<div class="c ${v?'':'hid'} ${all&&!open.has(k)?'rv':''}">${v?esc(ch):'·'}</div>`; }).join(''); };
    const openOne=()=>{ const left=W.map((_,k)=>k).filter(k=>!open.has(k)); if(left.length>1){ open.add(left[rnd(0,left.length-1)]); drawC(); sfx.whoosh(); } };
    form.onsubmit=e=>{ e.preventDefault(); if(over) return;
      if(same(inp.value,q.a)){ over=true; curTimer.stop(); sfx.good(); box.classList.add('flash-good'); drawC(true);
        addMe(LADDER[qi]-G.bank); G.bank=LADDER[qi]; G.reached=qi+1; qi++; cur={hint:null,skip:null};
        hud('Vòng 3 · Soán ngôi', `Đúng ${qi}/${set.length} · Đang giữ ${G.bank} điểm`);
        if(qi>=set.length){ G.r3='win'; setTimeout(finale,900); return; }
        form.hidden=true;
        after.innerHTML=`<p class="reveal">Chính xác! Bạn đang giữ <b>${G.bank} điểm</b>.</p>
          <div class="cta"><button class="btn gold" id="goOn">Đi tiếp câu ${qi+1} · ô ${LEN[qi]} chữ (mốc ${LADDER[qi]})</button>
          <button class="btn line" id="stopNow">Dừng lại, giữ ${G.bank} điểm</button></div>`;
        $('#goOn').onclick=()=>play(); $('#stopNow').onclick=()=>{ G.r3='stop'; finale(); };
      } else { sfx.bad(); form.classList.add('shake'); setTimeout(()=>form.classList.remove('shake'),400); inp.select(); } };
    cur={hint:()=>{ if(!over) openOne(); },
         skip:()=>{ if(over) return; over=true; curTimer.stop(); G.r3 = G.bank>0 ? 'stop' : 'quit'; finale(); }};
    drawC();
    curTimer=new Timer(QTIME[qi], el=>{ const n=Math.floor(el/15000); while(auto<n){ auto++; openOne(); } }, ()=>{
      if(tok!==G.tok||over) return; over=true; sfx.lose(); drawC(true); form.hidden=true;
      me().score-=G.bank; const lostPts=G.bank; G.bank=0; cur={hint:null,skip:null};
      after.innerHTML=`<p class="reveal">Hết giờ! Đáp án là <b>${esc(q.a)}</b>${lostPts?`. Bạn mất ${lostPts} điểm đang giữ.`:'.'}</p><button class="btn gold" id="toEnd">Xem kết quả</button>`;
      $('#toEnd').onclick=finale; });
    curTimer.start(); setTimeout(()=>inp.focus({preventScroll:true}),60);
  }
  play();
}

/* ===== KẾT THÚC VÒNG ===== */
function endRound(){
  G.tok++; if(curTimer) curTimer.stop(); cur={hint:null,skip:null};
  const n=G.round;
  G.players.forEach(p=>{ if(!p.me && !p.out) p.score += n===1 ? rnd(4,11)*10 : rnd(1,4)*20; });
  const active=G.players.filter(p=>!p.out || (p.me && G.practice));
  const sorted=[...active].sort((a,b)=>b.score-a.score || (a.me?-1:b.me?1:0));
  const goes=n===1 ? sorted.slice(0,sorted.length-1) : sorted.slice(0,1);
  sorted.forEach(p=>{ if(!goes.includes(p)) p.out=true; });
  const meIn=!me().out;
  meIn ? sfx.fanfare() : sfx.lose();
  if(!meIn && !G.practice && G.T.daily) logDay(me().score);
  const title = meIn ? (n===1?'Bạn đi tiếp!':'Bạn giành quyền soán ngôi!') : 'Bạn dừng chân ở đây';
  $('#result').innerHTML=`
    <span class="eyebrow">Hết vòng ${n} · ${ROUNDS[n].name}</span>
    <h2 class="big">${title}</h2>
    <div class="board">${sorted.map((p,k)=>`<div class="prow ${p.me?'me':''}"><span class="rk">${k+1}</span><span>${esc(p.name)}</span>
      <span class="pill ${p.out?'out':'go'}">${p.out?'Bị loại':'Đi tiếp'}</span><span class="pts">${p.score}</span></div>`).join('')}</div>
    <div class="cta">${meIn
      ? `<button class="btn gold" id="nextR">Vào vòng ${n+1} · ${ROUNDS[n+1].name}</button>`
      : `<button class="btn gold" id="again">Chơi lại từ đầu</button><button class="btn line" id="practice">Vẫn thử vòng ${n+1} (luyện tập)</button>`}</div>`;
  show('result');
  if(meIn) $('#nextR').onclick=()=>intro(n+1);
  else { $('#again').onclick=()=>{ newGame(G.T); intro(1); };
    $('#practice').onclick=()=>{ G.practice=true; me().out=false; intro(n+1); }; }
}

function finale(){
  G.tok++; if(curTimer) curTimer.stop(); cur={hint:null,skip:null};
  const win=G.r3==='win';
  win ? sfx.fanfare() : sfx.lose();
  if(G.T.daily) logDay(me().score);
  const head = win ? (G.practice?'Soán ngôi thành công (luyện tập)':'Bạn đã lên ngai vàng!') : KING+' giữ ngai vàng';
  const sub = win ? 'Bạn vượt qua cả 8 ô chữ.'
    : G.r3==='stop' ? `Bạn dừng sau ${G.reached} câu đúng và giữ ${G.bank} điểm thưởng.`
    : G.r3==='quit' ? 'Bạn dừng cuộc chơi trước khi trả lời.'
    : `Bạn trả lời đúng ${G.reached}/8 câu rồi hết giờ.`;
  $('#final').innerHTML=`
    <div class="logo">${win?$('.crown').outerHTML:''}
      <span class="eyebrow">Vòng Soán ngôi · ${G.T.daily?'đề hôm nay':'chủ đề '+esc(G.T.name)}</span>
      <h2 class="big">${head}</h2><p class="muted">${sub}</p>
    </div>
    <div class="stats"><div><b>${me().score}</b><span>Tổng điểm</span></div><div><b>${G.right}</b><span>Câu đúng</span></div><div><b>${G.ads}</b><span>Gợi ý đã dùng</span></div></div>
    <button class="btn gold" id="again2">Về trang chủ</button>
    <p class="note">Đề tự soạn để luyện tập, không phải đề phát sóng. Thời gian, điểm số và đối thủ ảo là mô phỏng.</p>`;
  show('final');
  $('#again2').onclick=goHome;
}

$('#startBtn').onclick=()=>begin(null);
renderToday();
document.addEventListener('visibilitychange',()=>{ if(!document.hidden && !$('#home').hidden) renderToday(); });
