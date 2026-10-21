
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
    <button class="btn gold" id="dailyBtn">${done?'Luyện lại đề hôm nay':'Luyện đề hôm nay'}</button>`;
  $('#dailyBtn').onclick=()=>begin(dailySet());
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
$('#hintBtn').onclick=()=>{ if(cur.hint){ G.ads++; sfx.whoosh(); cur.hint(); } };
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
  const tok=++G.tok, qs=shuffle(pickR1(G.T.r1)); let i=0; markSeen(qs.map(kR1));
  curTimer=new Timer(90,null,()=>{ if(tok===G.tok) endRound(); });
  function next(){ if(tok!==G.tok) return; if(i>=qs.length){ curTimer.stop(); endRound(); return; } render(qs[i]); }
  const go = ok => { if(ok) addMe(10); i++; setTimeout(next, ok?450:1100); };
  function render(q){
    hud('Vòng 1 · Phản xạ', `Câu ${i+1}/${qs.length}`);
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
