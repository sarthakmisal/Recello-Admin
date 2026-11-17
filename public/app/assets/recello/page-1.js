(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const r10=x=>Math.round(x/10)*10;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const store={
  get(k,d){try{const v=localStorage.getItem('recello:'+k);return v==null?d:JSON.parse(v)}catch(e){return d}},
  set(k,v){try{localStorage.setItem('recello:'+k,JSON.stringify(v))}catch(e){}}
};
/* ---------- backend (Recello-Admin: /api/web, services/web.service.js). Without a server the site runs on its built-in data.
   In the Android app the page is on the phone, so it calls the server at RC_API_ORIGIN (set by scripts/build-site.mjs --app). ---------- */
const API=(window.RC_API_ORIGIN||'')+'/api/web';
let SRC=null;   // where this visitor came from (an ad, a link); set below, sent with leads and bookings
const SRC_ACTIONS=new Set(['unlock','request','create_order']);
let LIVE=false;
/* Prices stay hidden until the customer verifies their mobile with an OTP (Admin > Website > Sections).
   index.php sets both lines below from the admin setting and, while prices are hidden, blanks the built-in price list. */
let PRICE_GATE=true;
const BUILTIN_PRICES=false;
let PRICES_IN=BUILTIN_PRICES;   // the catalogue in memory carries real prices
const gated=()=>PRICE_GATE&&!(S.vphone&&PRICES_IN);
const upTo=m=>gated()?'Get price':'up to '+inr(topFor(m));
/* Lists show what storage a model comes in, not a price: the "up to" price appears only on the model the customer picks. */
const stGB=v=>{const x=String(v).match(/(\d+(?:\.\d+)?)\s?([GT])B\s*$/i);return x?(+x[1])*(x[2].toUpperCase()==='T'?1024:1):0};
const storRange=m=>{const vs=m.variants.map(v=>v[0]),g=vs.map(stGB);if(vs.length===1)return vs[0].length<=12?vs[0]:'1 option';
  if(!g.every(Boolean))return vs.length+' options';const lo=Math.min(...g),hi=Math.max(...g),f=x=>x>=1024?(x/1024)+'TB':x+'GB';return lo===hi?f(lo):f(lo)+' – '+f(hi)};
/* "Too many tries" (429): the server says how many seconds to wait. The message says it in words, and the button that was
   pressed counts down ("Try again in 0:45") and stays off until then. */
const waitWords=s=>s<60?s+' seconds':s<3600?Math.ceil(s/60)+' minute'+(Math.ceil(s/60)===1?'':'s'):Math.ceil(s/3600)+' hour'+(Math.ceil(s/3600)===1?'':'s');
const clockTxt=s=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`};
let holdB=null,holdAt=0,holdHtml='';
const noteBtn=b=>{if(b&&!b.dataset.hold){holdB=b;holdAt=Date.now();holdHtml=b.innerHTML}};
document.addEventListener('click',e=>{noteBtn(e.target.closest&&e.target.closest('button'))},true);
document.addEventListener('submit',e=>{noteBtn(e.submitter||e.target.querySelector('button[type=submit],button:not([type])'))},true);
function holdBtn(secs){
  const b=holdB,html=holdHtml;if(!b||Date.now()-holdAt>20000||!document.contains(b)||b.dataset.hold)return;
  const end=Date.now()+secs*1000;b.dataset.hold='1';b.classList.add('on-hold');
  const tick=()=>{const s=Math.max(0,Math.ceil((end-Date.now())/1000));
    if(!s||!document.contains(b)){b.innerHTML=html;b.disabled=false;b.classList.remove('on-hold');delete b.dataset.hold;return}
    b.disabled=true;b.innerHTML=`<svg class="i" aria-hidden="true"><use href="#i-clock"/></svg><span>Try again in ${clockTxt(s)}</span>`;setTimeout(tick,1000)};
  setTimeout(tick,0);
}
const tooManyErr=(j,r)=>{const s=Math.max(1,+(j.retry||r.headers.get('Retry-After')||0)|0);holdBtn(s);
  return{message:(j.error||'Too many tries.')+' Try again in '+waitWords(s)+'.',status:429,retry:s,need:j.need||''}};
const rcErr=e=>e&&e.status===429?tooManyErr({retry:e.retry},{headers:{get:()=>0}}):e;
async function apiGet(action,params){try{return await window.RC_API.call(action,params)}catch(e){throw rcErr(e)}}
/* Robot check (no puzzles for people). Asking for an OTP and the forms that need no OTP (call-back, waitlist, "phone not listed")
   carry a ticket: the server hands out a random challenge and the phone finds a number whose SHA-256 starts with 16 zero bits,
   about a quarter of a second of work, done ahead of time while the form is on screen. A robot sending thousands of requests
   has to do that work for every single one. */
const POW_K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
const POW_W=new Uint32Array(64);
/* first 32 bits of SHA-256 of a short ASCII text (up to 55 characters: one block) */
function sha256w0(s){const W=POW_W,L=s.length;W.fill(0,0,16);for(let i=0;i<L;i++)W[i>>2]|=s.charCodeAt(i)<<(24-(i&3)*8);W[L>>2]|=0x80<<(24-(L&3)*8);W[15]=L*8;
  for(let i=16;i<64;i++){const x=W[i-15],y=W[i-2];W[i]=(W[i-16]+((x>>>7|x<<25)^(x>>>18|x<<14)^(x>>>3))+W[i-7]+((y>>>17|y<<15)^(y>>>19|y<<13)^(y>>>10)))|0}
  let a=0x6a09e667,b=0xbb67ae85,c=0x3c6ef372,d=0xa54ff53a,e=0x510e527f,f=0x9b05688c,g=0x1f83d9ab,h=0x5be0cd19;
  for(let i=0;i<64;i++){const t1=(h+((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7))+((e&f)^(~e&g))+POW_K[i]+W[i])|0,t2=(((a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10))+((a&b)^(a&c)^(b&c)))|0;h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0}
  return(0x6a09e667+a)>>>0}
const powSolve=t=>new Promise(res=>{let n=0;const sh=32-t.bits;const run=()=>{for(const end=n+5000;n<end;n++)if(sha256w0(t.salt+n)>>>sh===0){res(`${t.salt}.${t.exp}.${t.bits}.${t.sig}.${n}`);return}setTimeout(run,0)};run()});
let powNext=null;
document.addEventListener('focusin',e=>{if(e.target.matches&&e.target.matches('input[type=tel],input[autocomplete=tel],input[inputmode=tel]'))powWarm()});
function powWarm(){if(LIVE&&!powNext)powNext=apiGet('pow').then(t=>powSolve(t).then(k=>({k,exp:t.exp}))).catch(()=>null)}
async function powTicket(){
  powWarm();let r=powNext?await powNext:null;powNext=null;
  if(!r||r.exp*1000<Date.now()+30000){powWarm();r=powNext?await powNext:null;powNext=null}
  setTimeout(powWarm,800);   // the next one is ready before it is needed (a resend, another form)
  return r?r.k:'';
}
const powFor=(action,body)=>false&&action==='otp_send'||action==='ai'||action==='waitlist_join'||(action==='request'&&body&&(body.kind==='call'||body.kind==='model'));
async function apiPost(action,body){
  if(SRC&&SRC_ACTIONS.has(action)&&body&&!body.src)body=Object.assign({},body,{src:SRC});
  try{return await window.RC_API.call(action,body)}catch(e){throw rcErr(e)}
}
const norm=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').replace(/\s+/g,' ').trim();
const hueOf=id=>{let h=7;for(const c of id)h=(h*31+c.charCodeAt(0))%360;return h};
const thumb=(cat,id,size)=>{const m=typeof byId!=='undefined'?byId[id]:null;if(m&&m.img&&/^(uploads\/[\w.-]+|photos\/models\/[\w.-]+|data:image\/)/.test(m.img))return `<span class="th-photo" aria-hidden="true"><img src="${esc(m.img)}" alt="" loading="lazy" decoding="async" data-cat="${esc(cat)}" data-sz="${size||10}"></span>`;return `<span class="th th-${cat}" style="font-size:${size||10}px" aria-hidden="true"></span>`};
/* scroll the page to an element. window.scrollTo moves only the page: scrollIntoView can also pan a phone's
   visual viewport, which makes the header, the price bar and any open sheet jump on screen.
   Under an open sheet the page jumps straight there (nobody sees it), otherwise it glides. */
function pageScroll(el,block,smooth){
  if(!el)return;
  const r=el.getBoundingClientRect(),pad=parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)||0;
  const top=Math.max(0,Math.round(scrollY+(block==='center'?r.top-(innerHeight-r.height)/2:r.top-pad)));
  const covered=document.documentElement.classList.contains('hs-on')||!!document.querySelector('.nudge:not([hidden])');
  if(smooth&&!reduceMotion&&!covered){window.scrollTo({top,behavior:'smooth'});return}
  try{window.scrollTo({top,behavior:'instant'})}catch(_){window.scrollTo(0,top)}
}
const goTo=id=>{if(id!=='sell')document.body.classList.remove('funnel');pageScroll(document.getElementById(id),'start',true)};
let toastT;
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},3000)}
/* order numbers: SMK001, SMK002… (Santosh, Mohan, Kabier). Older orders keep their RC- numbers. */
const ORDER_RE=/\b(SMK[\s-]?\d{1,7}|RC[\s-]?\d{4,6})\b/i;
function normId(raw){const d=String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');let m=d.match(/^SMK0*(\d{1,7})$/)||d.match(/^0*(\d{1,4})$/);if(m)return 'SMK'+m[1].padStart(3,'0');m=d.match(/^(?:RC)?(\d{5,6})$/);return m?'RC-'+m[1]:d}
const newId=()=>{const used=new Set(S.orders.map(o=>o.id));let id;do{id='SMK'+String(100+Math.floor(Math.random()*899))}while(used.has(id));return id};

/* City landmark symbols: 48x48 line drawings, stroke = currentColor. Shared by the website and the admin panel. */
const LANDMARKS={
  'shaniwar-wada':['Shaniwar Wada','<path d="M3 42h42"/><path d="M6 42V18h10v24M32 42V18h10v24"/><path d="M6 18v-3h2.5v3M10.8 18v-3h2.5v3M13.5 18v-3H16v3M32 18v-3h2.5v3M36.8 18v-3h2.5v3M39.5 18v-3H42v3"/><path d="M16 22h16M16 22v-2.5h2.4V22M21 22v-2.5h2.4V22M24.6 22v-2.5H27V22M29.6 22v-2.5H32V22"/><path d="M19.5 42V31c0-3 2-5.5 4.5-6.5 2.5 1 4.5 3.5 4.5 6.5v11"/><path d="M24 24.5V22"/><path d="M8.5 25v4M13.5 25v4M34.5 25v4M39.5 25v4"/>'],
  'gateway-of-india':['Gateway of India','<path d="M3 42h42"/><path d="M12 42V16h24v26"/><path d="M19 42V28a5 5 0 0 1 10 0v14"/><path d="M4 42V28h8M44 42V28h-8"/><path d="M12 16V11h3.5v5M32.5 16V11H36v5"/><path d="M12 11a1.75 1.75 0 0 1 3.5 0M32.5 11a1.75 1.75 0 0 1 3.5 0"/><path d="M18 16v-3h12v3"/><path d="M21 13a3 3 0 0 1 6 0"/><path d="M15 22h18"/><path d="M6.5 33v4M9.5 33v4M38.5 33v4M41.5 33v4"/>'],
  'india-gate':['India Gate','<path d="M3 42h42"/><path d="M14 42V13h20v29"/><path d="M12.5 13h23M12.5 10h23v3"/><path d="M20 42V25a4 4 0 0 1 8 0v17"/><path d="M20.5 10a3.5 3 0 0 1 7 0"/><path d="M14 18h20"/><path d="M16.5 22v14M31.5 22v14"/>'],
  'vidhana-soudha':['Vidhana Soudha','<path d="M3 42h42"/><path d="M4 42V30h40v12"/><path d="M8 34v8M12 34v8M16 34v8M32 34v8M36 34v8M40 34v8"/><path d="M17 30v-8h14v8"/><path d="M20 30v-5M24 30v-5M28 30v-5"/><path d="M18.5 22a5.5 5.5 0 0 1 11 0"/><path d="M24 16.5v-3"/><path d="M20 42v-6h8v6"/><path d="M6 30a2 2 0 0 1 4 0M38 30a2 2 0 0 1 4 0"/>'],
  'charminar':['Charminar','<path d="M3 42h42"/><path d="M14 42V19h20v23"/><path d="M19 42V31a5 5 0 0 1 10 0v11"/><path d="M14 24h20M14 19h20"/><path d="M11 42V12h3v30M34 42V12h3v30"/><path d="M11 12c0-2.5 1.5-4 1.5-6 0 2 1.5 3.5 1.5 6M34 12c0-2.5 1.5-4 1.5-6 0 2 1.5 3.5 1.5 6"/><path d="M10 20h5M10 30h5M33 20h5M33 30h5"/><path d="M20 19a4 3 0 0 1 8 0"/>'],
  'kapaleeshwarar':['Kapaleeshwarar Temple','<path d="M3 42h42"/><path d="M9 42l3-8h24l3 8"/><path d="M12 34l2.5-7h19l2.5 7"/><path d="M14.5 27l2.2-6.5h14.6l2.2 6.5"/><path d="M16.7 20.5l2-6h10.6l2 6"/><path d="M18.7 14.5h10.6c-1-3-3.2-5-5.3-5s-4.3 2-5.3 5z"/><path d="M24 9.5V6"/><path d="M21.5 42v-5a2.5 2.5 0 0 1 5 0v5"/><path d="M17 30.5h2M23 30.5h2M29 30.5h2M19 24h2M27 24h2"/>'],
  'howrah-bridge':['Howrah Bridge','<path d="M3 32h42"/><path d="M14 32V10M34 32V10"/><path d="M3 32L14 14l10 9 10-9 11 18"/><path d="M14 10l10 13 10-13"/><path d="M8.5 32l5.5-9M19 32l5-9 5 9M39.5 32L34 23"/><path d="M3 38c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0 5-1.5 7.5 0 5 1.5 7.5 0 5-1.5 7.5 0 3.5 1 4.5 0"/><path d="M6 43c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0 5-1.5 7.5 0 5 1.5 7.5 0 5-1.5 7.5 0"/>'],
  'sidi-saiyyed-jali':['Sidi Saiyyed Jali','<path d="M3 42h42"/><path d="M9 42V22a15 15 0 0 1 30 0v20"/><path d="M24 42V24"/><path d="M24 30c-3.5-1-6.5-4-7.5-8.5M24 30c3.5-1 6.5-4 7.5-8.5"/><path d="M24 36c-4.5-.5-9-3.5-11-8M24 36c4.5-.5 9-3.5 11-8"/><path d="M24 25c-2-1.5-3-4-3-7M24 25c2-1.5 3-4 3-7"/><path d="M16.5 21.5c-1.5-.5-2.5-2-2.5-3.5M31.5 21.5c1.5-.5 2.5-2 2.5-3.5"/>'],
  'hawa-mahal':['Hawa Mahal','<path d="M3 42h42"/><path d="M7 42V31h34v11"/><path d="M11 31v-8h26v8"/><path d="M15 23v-7h18v7"/><path d="M19 16v-5h10v5"/><path d="M19 11a5 3.5 0 0 1 10 0"/><path d="M11 36.5v2.5M15.5 36.5v2.5M20 36.5v2.5M28 36.5v2.5M32.5 36.5v2.5M37 36.5v2.5"/><path d="M15 26.5v2M19.5 26.5v2M24 26.5v2M28.5 26.5v2M33 26.5v2"/><path d="M20 19v1.5M24 19v1.5M28 19v1.5"/><path d="M22 42v-4a2 2 0 0 1 4 0v4"/>'],
  'open-hand':['Open Hand Monument','<path d="M3 42h42"/><path d="M24 42V31"/><path d="M19 42h10"/><path d="M15.5 31L11 17.5l5 2.5 1-11 4 10.5 2.5-12.5 2.5 12.5 4-10.5 1 11 5-2.5L32.5 31z"/><path d="M15.5 31h17"/>'],
  'rumi-darwaza':['Rumi Darwaza','<path d="M3 42h42"/><path d="M7 42V19h34v23"/><path d="M15 42V27c0-6 4-10 9-12 5 2 9 6 9 12v15"/><path d="M13 19l11-10 11 10"/><path d="M22 9h4v-3h-4z"/><path d="M7 24h8M33 24h8"/><path d="M9.5 29v8M12.5 29v8M35.5 29v8M38.5 29v8"/><path d="M24 15v-3"/>'],
  'fishing-nets':['Chinese Fishing Nets','<path d="M3 36h42"/><path d="M26 36h14v-4H26z"/><path d="M33 32L13 9"/><path d="M13 9L4 24M13 9l9 15"/><path d="M4 24c5 6 13 6 18 0"/><path d="M8.5 27.5L13 9l4.5 18.5"/><path d="M33 32l9-16"/><circle cx="42.5" cy="14" r="2"/><path d="M3 41c2.5-1.5 5-1.5 7.5 0s5 1.5 7.5 0 5-1.5 7.5 0 5 1.5 7.5 0 5-1.5 7.5 0 3.5 1 4.5 0"/>'],
  'rajwada':['Rajwada Palace','<path d="M3 42h42"/><path d="M9 42V12h30v30"/><path d="M9 18h30M9 24h30M9 30h30M9 36h30"/><path d="M20 42v-7a4 4 0 0 1 8 0v7"/><path d="M13 14v2M17 14v2M21 14v2M27 14v2M31 14v2M35 14v2M13 20v2M17 20v2M31 20v2M35 20v2M13 26v2M17 26v2M31 26v2M35 26v2"/><path d="M21 21h6v6h-6z"/><path d="M8 12h4V8.5H8zM36 12h4V8.5h-4zM22 12h4V8h-4z"/>'],
  'diamond':['Diamond City','<path d="M3 42h42"/><path d="M10 18l7-9h14l7 9-14 20z"/><path d="M10 18h28"/><path d="M17 9l4 9 3 20M31 9l-4 9-3 20"/><path d="M21 18l3-9 3 9"/>'],
  'city':['City','<path d="M3 42h42"/><path d="M8 42V22h10v20M18 42V12h12v30M30 42V26h10v16"/><path d="M21 17h2M25 17h2M21 22h2M25 22h2M21 27h2M25 27h2M21 32h2M25 32h2M11 27h4M11 32h4M33 31h4M33 36h4"/>']
};
const CITY_ICON={'Pune':'shaniwar-wada','Mumbai':'gateway-of-india','Delhi NCR':'india-gate','Delhi':'india-gate','Bengaluru':'vidhana-soudha','Bangalore':'vidhana-soudha','Hyderabad':'charminar','Chennai':'kapaleeshwarar','Kolkata':'howrah-bridge','Ahmedabad':'sidi-saiyyed-jali','Jaipur':'hawa-mahal','Chandigarh':'open-hand','Lucknow':'rumi-darwaza','Kochi':'fishing-nets','Indore':'rajwada','Surat':'diamond'};
const landmarkSvg=(key,cls)=>{const L=LANDMARKS[key]||LANDMARKS.city;return `<svg class="lm${cls?' '+cls:''}" viewBox="0 0 48 48" aria-hidden="true">${L[1]}</svg>`};
/* ---------- cities: live now, coming soon, landmark symbols ---------- */
const SOON=['Delhi NCR','Mumbai','Bengaluru','Hyderabad','Chennai','Kolkata','Ahmedabad','Jaipur','Chandigarh','Lucknow','Kochi','Indore','Surat'];
const CITY_OVR={};
const iconFor=c=>CITY_OVR[c]||CITY_ICON[c]||'city';
const listTxt=a=>a.length<2?(a[0]||''):a.slice(0,-1).join(', ')+' and '+a[a.length-1];
const joinedWait=c=>(store.get('waitlist',[])||[]).includes(c);
function renderFootCities(){
  const el=$('#footCities');if(!el)return;
  el.innerHTML=`<div class="fc-head"><b>Now in ${esc(listTxt(CITIES))}. Coming soon across India.</b>${SOON.length?'<span>Tap a city to hear when we launch there.</span>':''}</div>
    <div class="fc-row">${CITIES.map(c=>`<button type="button" class="fc live" data-fc="${esc(c)}" aria-label="${esc(c)}, pickups live">${landmarkSvg(iconFor(c))}<small>${esc(c)}</small><em>Live</em></button>`).join('')}${SOON.map(c=>`<button type="button" class="fc" data-fcs="${esc(c)}" aria-label="${esc(c)}, coming soon">${landmarkSvg(iconFor(c))}<small>${esc(c)}</small><em>Soon</em></button>`).join('')}</div>`;
}
function renderWait(c){
  const w=$('#cityWait');if(!c){w.hidden=true;w.innerHTML='';return}
  w.hidden=false;w.dataset.city=c;
  w.innerHTML=joinedWait(c)?`<b>You're on the list for ${esc(c)}.</b><span class="muted">We'll message you when pickups start there.</span>`
    :`<b>Recello is coming to ${esc(c)}</b><span class="muted">Leave your number and we'll message you when pickups start.</span><form class="wait-row" id="waitForm" novalidate><input id="waitPhone" type="tel" inputmode="numeric" placeholder="10-digit mobile" aria-label="Your mobile number" autocomplete="tel-national"><button class="btn btn-primary btn-sm" type="submit">Tell me</button></form><em class="err" id="waitErr"></em>`;
}
/* ---------- catalogue (indicative prices, INR) ---------- */
const CATS=[{id:'phone',label:'Phone'},{id:'tablet',label:'Tablet'},{id:'laptop',label:'Laptop'},{id:'watch',label:'Smartwatch'}];
/* what Recello buys right now (Admin > Website > What we buy): phones always; the others on, "coming soon" or off */
const CAT_DEF={phone:'on',tablet:'on',laptop:'soon',watch:'off'};
let CAT_ST={...CAT_DEF};
const catSt=id=>id==='phone'?'on':(CAT_ST[id]||'off');
const catOn=id=>catSt(id)==='on';
const sellPool=()=>CATALOG.filter(m=>catOn(m.cat));
const soonLine=()=>{const s=CATS.filter(c=>catSt(c.id)==='soon').map(c=>c.label.toLowerCase()+'s'),on=CATS.filter(c=>catOn(c.id)).map(c=>c.label.toLowerCase()+'s');
  return `${s.length?s.join(' and ').replace(/^./,x=>x.toUpperCase())+' are coming soon. ':''}Right now we buy ${on.join(' and ')}.`};
const M=(id,cat,brand,name,base,variants)=>({id,cat,brand,name,base,variants});
/* Phones and top prices from RECELLO_MASTER 02-Nov-2026.
   On recello.in the prices come from the admin panel instead. Format: id|brand|series|name|variant=price;variant=price */
const PHONEBOOK=`iphone-duo|Apple|iPhone Duo|iPhone Duo|256GB=0;512GB=0;1TB=0;2TB=0
ip18pm|Apple|iPhone 18|iPhone 18 Pro Max|256GB=0;512GB=0;1TB=0;2TB=0
iphone-18-pro|Apple|iPhone 18|iPhone 18 Pro|256GB=0;512GB=0;1TB=0;2TB=0
ip17pm|Apple|iPhone 17|iPhone 17 Pro Max|256GB=0;512GB=0;1TB=0;2TB=0
ip17p|Apple|iPhone 17|iPhone 17 Pro|256GB=0;512GB=0;1TB=0
iphone-16-pro-max|Apple|iPhone 16|iPhone 16 Pro Max|256GB=0;512GB=0;1TB=0
ipair|Apple|iPhone Air|iPhone Air|256GB=0;512GB=0;1TB=0
ip16p|Apple|iPhone 16|iPhone 16 Pro|128GB=0;256GB=0;512GB=0;1TB=0
iphone-15-pro-max|Apple|iPhone 15|iPhone 15 Pro Max|256GB=0;512GB=0;1TB=0
ip15p|Apple|iPhone 15|iPhone 15 Pro|128GB=0;256GB=0;512GB=0;1TB=0
ip17|Apple|iPhone 17|iPhone 17|256GB=0;512GB=0
iphone-16-plus|Apple|iPhone 16|iPhone 16 Plus|128GB=0;256GB=0;512GB=0
ip16|Apple|iPhone 16|iPhone 16|128GB=0;256GB=0;512GB=0
iphone-17e|Apple|iPhone 17|iPhone 17e|256GB=0;512GB=0
iphone-14-pro-max|Apple|iPhone 14|iPhone 14 Pro Max|128GB=0;256GB=0;512GB=0;1TB=0
iphone-15-plus|Apple|iPhone 15|iPhone 15 Plus|128GB=0;256GB=0;512GB=0
iphone-14-pro|Apple|iPhone 14|iPhone 14 Pro|128GB=0;256GB=0;512GB=0;1TB=0
ip15|Apple|iPhone 15|iPhone 15|128GB=0;256GB=0;512GB=0
iphone-16e|Apple|iPhone 16|iPhone 16e|128GB=0;256GB=0;512GB=0
iphone-13-pro-max|Apple|iPhone 13|iPhone 13 Pro Max|128GB=0;256GB=0;512GB=0;1TB=0
iphone-13-pro|Apple|iPhone 13|iPhone 13 Pro|128GB=0;256GB=0;512GB=0;1TB=0
iphone-14-plus|Apple|iPhone 14|iPhone 14 Plus|128GB=0;256GB=0;512GB=0
ip14|Apple|iPhone 14|iPhone 14|128GB=0;256GB=0;512GB=0
iphone-12-pro-max|Apple|iPhone 12|iPhone 12 Pro Max|128GB=0;256GB=0;512GB=0
iphone-12-pro|Apple|iPhone 12|iPhone 12 Pro|128GB=0;256GB=0;512GB=0
ip13|Apple|iPhone 13|iPhone 13|128GB=0;256GB=0;512GB=0
iphone-13-mini|Apple|iPhone 13|iPhone 13 Mini|128GB=0;256GB=0;512GB=0
iphone-11-pro-max|Apple|iPhone 11|iPhone 11 Pro Max|64GB=0;256GB=0;512GB=0
iphone-12|Apple|iPhone 12|iPhone 12|64GB=0;128GB=0;256GB=0
iphone-11-pro|Apple|iPhone 11|iPhone 11 Pro|64GB=0;256GB=0;512GB=0
iphone-12-mini|Apple|iPhone 12|iPhone 12 Mini|64GB=0;128GB=0;256GB=0
iphone-11|Apple|iPhone 11|iPhone 11|64GB=0;128GB=0;256GB=0
iphone-se-2022|Apple|iPhone SE 2022|iPhone SE 2022|64GB=0;128GB=0;256GB=0
iphone-xs-max|Apple|iPhone XS Max|iPhone XS Max|64GB=0;256GB=0;512GB=0
iphone-xs|Apple|iPhone XS|iPhone XS|64GB=0;256GB=0;512GB=0
iphone-xr|Apple|iPhone XR|iPhone XR|64GB=0;128GB=0;256GB=0
iphone-x|Apple|iPhone X|iPhone X|64GB=0;256GB=0
iphone-se-2020|Apple|iPhone SE 2020|iPhone SE 2020|64GB=0;128GB=0;256GB=0
iphone-8-plus|Apple|iPhone 8|iPhone 8 Plus|64GB=0;128GB=0;256GB=0
iphone-8|Apple|iPhone 8|iPhone 8|64GB=0;128GB=0;256GB=0
iphone-7-plus|Apple|iPhone 7|iPhone 7 Plus|32GB=0;128GB=0;256GB=0
iphone-7|Apple|iPhone 7|iPhone 7|32GB=0;128GB=0;256GB=0
iphone-6s-plus|Apple|iPhone 6|iPhone 6S Plus|16GB=0;32GB=0;64GB=0;128GB=0
iphone-6s|Apple|iPhone 6|iPhone 6S|16GB=0;32GB=0;64GB=0;128GB=0
iphone-6-plus|Apple|iPhone 6|iPhone 6 Plus|16GB=0;64GB=0;128GB=0
iphone-6|Apple|iPhone 6|iPhone 6|16GB=0;32GB=0;64GB=0;128GB=0
iphone-se-1st-generation|Apple|iPhone SE 1st Generation|iPhone SE 1st Generation|16GB=0;32GB=0;64GB=0;128GB=0
samsung-galaxy-z-fold-8-ultra|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold 8 Ultra|12GB / 256GB=0;12GB / 512GB=0;16GB / 1TB=0
samsung-galaxy-z-fold-8|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold 8|256GB=0;512GB=0;16GB / 1TB=0
samsung-galaxy-s26-ultra|Samsung|Galaxy S Series|Samsung Galaxy S26 Ultra|12GB / 256GB=0;12GB / 512GB=0;16GB / 1TB=0
samsung-galaxy-z-fold-7|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold 7|12GB / 256GB=0;12GB / 512GB=0;16GB / 1TB=0
samsung-galaxy-z-flip-8|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip 8|256GB=0;512GB=0
s25u|Samsung|Galaxy S Series|Samsung Galaxy S25 Ultra 5G|256GB=0;512GB=0;1TB=0
samsung-galaxy-s26-plus|Samsung|Galaxy S Series|Samsung Galaxy S26 Plus|12GB / 256GB=0;512GB=0
samsung-galaxy-z-fold6-5g|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold6 5G|256GB=0;512GB=0;1TB=0
samsung-galaxy-s24-ultra-5g|Samsung|Galaxy S Series|Samsung Galaxy S24 Ultra 5G|256GB=0;512GB=0;1TB=0
samsung-galaxy-s26|Samsung|Galaxy S Series|Samsung Galaxy S26|12GB / 256GB=0;12GB / 512GB=0
samsung-galaxy-z-flip-7|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip 7|256GB=0;512GB=0
samsung-galaxy-s26-fe-5g|Samsung|Galaxy S Series|Samsung Galaxy S26 FE 5G|8GB / 256GB=0
samsung-galaxy-z-flip-7-fe|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip 7 FE|128GB=0;256GB=0
samsung-galaxy-z-fold5|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold5|512GB=0;256GB=0;1TB=0
samsung-galaxy-s25-plus-5g|Samsung|Galaxy S Series|Samsung Galaxy S25 Plus 5G|256GB=0;512GB=0
samsung-galaxy-s25-edge|Samsung|Galaxy S Series|Samsung Galaxy S25 Edge|256GB=0;512GB=0
samsung-galaxy-s25-5g|Samsung|Galaxy S Series|Samsung Galaxy S25 5G|128GB=0;256GB=0;512GB=0
zflip6|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip6 5G|256GB=0;512GB=0
samsung-galaxy-s24-plus-5g|Samsung|Galaxy S Series|Samsung Galaxy S24 Plus 5G|512GB=0;256GB=0
samsung-galaxy-s25-fe|Samsung|Galaxy S Series|Samsung Galaxy S25 FE|128GB=0;256GB=0;512GB=0
samsung-galaxy-s23-ultra-5g|Samsung|Galaxy S Series|Samsung Galaxy S23 Ultra 5G|256GB=0;512GB=0;1TB=0
s24|Samsung|Galaxy S Series|Samsung Galaxy S24 5G|128GB=0;256GB=0;512GB=0
samsung-galaxy-a57-5g|Samsung|Galaxy A Series|Samsung Galaxy A57 5G|8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-a37-5g|Samsung|Galaxy A Series|Samsung Galaxy A37 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-z-fold4|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold4|256GB=0;512GB=0;1TB=0
samsung-galaxy-z-flip5|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip5|256GB=0;512GB=0
samsung-galaxy-s22-ultra-5g|Samsung|Galaxy S Series|Samsung Galaxy S22 Ultra 5G|128GB=0;256GB=0;512GB=0;12GB / 1TB=0
samsung-galaxy-a27-5g|Samsung|Galaxy A Series|Samsung Galaxy A27 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-s23-plus-5g|Samsung|Galaxy S Series|Samsung Galaxy S23 Plus 5G|256GB=0;512GB=0
samsung-galaxy-a56-5g|Samsung|Galaxy A Series|Samsung Galaxy A56 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-s24-fe|Samsung|Galaxy S Series|Samsung Galaxy S24 FE|128GB=0;256GB=0
samsung-galaxy-m47-5g|Samsung|Galaxy M Series|Samsung Galaxy M47 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-f70-pro-5g|Samsung|Galaxy F Series|Samsung Galaxy F70 Pro 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-s23-5g|Samsung|Galaxy S Series|Samsung Galaxy S23 5G|128GB=0;256GB=0
samsung-galaxy-z-fold3-5g|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold3 5G|256GB=0;512GB=0
samsung-galaxy-a36-5g|Samsung|Galaxy A Series|Samsung Galaxy A36 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-s21-ultra-5g|Samsung|Galaxy S Series|Samsung Galaxy S21 Ultra 5G|128GB=0;256GB=0;512GB=0
samsung-galaxy-s23-fe|Samsung|Galaxy S Series|Samsung Galaxy S23 FE|128GB=0;256GB=0
a55|Samsung|Galaxy A Series|Samsung Galaxy A55 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-f56-5g|Samsung|Galaxy F Series|Samsung Galaxy F56 5G|128GB=0;256GB=0
samsung-galaxy-s22-plus-5g|Samsung|Galaxy S Series|Samsung Galaxy S22 Plus 5G|128GB=0;256GB=0
samsung-galaxy-m56-5g|Samsung|Galaxy M Series|Samsung Galaxy M56 5G|128GB=0;256GB=0
samsung-galaxy-s22-5g|Samsung|Galaxy S Series|Samsung Galaxy S22 5G|128GB=0;256GB=0
samsung-galaxy-z-fold2-5g|Samsung|Galaxy Fold Series|Samsung Galaxy Z Fold2 5G|256GB=0
samsung-galaxy-note-20-ultra-5g|Samsung|Galaxy Note Series|Samsung Galaxy Note 20 Ultra 5G|256GB=0;512GB=0
samsung-galaxy-m55-5g|Samsung|Galaxy M Series|Samsung Galaxy M55 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-s20-ultra|Samsung|Galaxy S Series|Samsung Galaxy S20 Ultra|128GB=0;512GB=0
samsung-galaxy-z-flip4|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip4|128GB=0;256GB=0
samsung-galaxy-a54-5g|Samsung|Galaxy A Series|Samsung Galaxy A54 5G|8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-s21-plus-5g|Samsung|Galaxy S Series|Samsung Galaxy S21 Plus 5G|128GB=0;256GB=0
samsung-galaxy-a35-5g|Samsung|Galaxy A Series|Samsung Galaxy A35 5G|8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-s20-ultra-5g|Samsung|Galaxy S Series|Samsung Galaxy S20 Ultra 5G|12GB / 128GB=0
samsung-galaxy-a17-5g|Samsung|Galaxy A Series|Samsung Galaxy A17 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-a26-5g|Samsung|Galaxy A Series|Samsung Galaxy A26 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-f36-5g|Samsung|Galaxy F Series|Samsung Galaxy F36 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-f55-5g|Samsung|Galaxy F Series|Samsung Galaxy F55 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
samsung-galaxy-s21-5g|Samsung|Galaxy S Series|Samsung Galaxy S21 5G|128GB=0;256GB=0
samsung-galaxy-m36-5g|Samsung|Galaxy M Series|Samsung Galaxy M36 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-fold|Samsung|Galaxy Fold Series|Samsung Galaxy Fold|512GB=0
samsung-galaxy-m55s-5g|Samsung|Galaxy M Series|Samsung Galaxy M55s 5G|128GB=0;256GB=0
samsung-galaxy-s21-fe-5g|Samsung|Galaxy S Series|Samsung Galaxy S21 FE 5G|128GB=0;256GB=0
samsung-galaxy-a25-5g|Samsung|Galaxy A Series|Samsung Galaxy A25 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-z-flip3-5g|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip3 5G|128GB=0;256GB=0
samsung-galaxy-a34-5g|Samsung|Galaxy A Series|Samsung Galaxy A34 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-a16-5g|Samsung|Galaxy A Series|Samsung Galaxy A16 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-m54-5g|Samsung|Galaxy M Series|Samsung Galaxy M54 5G|8GB / 256GB=0
samsung-galaxy-m17-5g|Samsung|Galaxy M Series|Samsung Galaxy M17 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a07-5g|Samsung|Galaxy A Series|Samsung Galaxy A07 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-f54-5g|Samsung|Galaxy F Series|Samsung Galaxy F54 5G|8GB / 256GB=0
samsung-galaxy-m35-5g|Samsung|Galaxy M Series|Samsung Galaxy M35 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-a15-5g|Samsung|Galaxy A Series|Samsung Galaxy A15 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-note-10-plus-5g|Samsung|Galaxy Note Series|Samsung Galaxy Note 10 Plus 5G|12GB / 512GB=0
samsung-galaxy-m17e-5g|Samsung|Galaxy M Series|Samsung Galaxy M17e 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-f17-5g|Samsung|Galaxy F Series|Samsung Galaxy F17 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-s20-plus|Samsung|Galaxy S Series|Samsung Galaxy S20 Plus|128GB=0
samsung-galaxy-f34-5g|Samsung|Galaxy F Series|Samsung Galaxy F34 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a73-5g|Samsung|Galaxy A Series|Samsung Galaxy A73 5G|8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-f70e-5g|Samsung|Galaxy F Series|Samsung Galaxy F70e 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m16-5g|Samsung|Galaxy M Series|Samsung Galaxy M16 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m34-5g|Samsung|Galaxy M Series|Samsung Galaxy M34 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-note-10-plus|Samsung|Galaxy Note Series|Samsung Galaxy Note 10 Plus|256GB=0;512GB=0
samsung-galaxy-a23-5g|Samsung|Galaxy A Series|Samsung Galaxy A23 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-f16-5g|Samsung|Galaxy F Series|Samsung Galaxy F16 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a14-5g|Samsung|Galaxy A Series|Samsung Galaxy A14 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-s10-plus|Samsung|Galaxy S Series|Samsung Galaxy S10 Plus|128GB=0;512GB=0;1TB=0
samsung-galaxy-f15-5g|Samsung|Galaxy F Series|Samsung Galaxy F15 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-s20-fe-5g|Samsung|Galaxy S Series|Samsung Galaxy S20 FE 5G|8GB / 128GB=0
samsung-galaxy-note-20|Samsung|Galaxy Note Series|Samsung Galaxy Note 20|256GB=0
samsung-galaxy-z-flip|Samsung|Galaxy Z Flip Series|Samsung Galaxy Z Flip|8GB / 128GB=0;256GB=0
samsung-galaxy-note-10|Samsung|Galaxy Note Series|Samsung Galaxy Note 10|256GB=0
samsung-galaxy-m15-5g-prime-edition|Samsung|Galaxy M Series|Samsung Galaxy M15 5G Prime Edition|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-s20|Samsung|Galaxy S Series|Samsung Galaxy S20|128GB=0
samsung-galaxy-m53-5g|Samsung|Galaxy M Series|Samsung Galaxy M53 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m15-5g|Samsung|Galaxy M Series|Samsung Galaxy M15 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a52s-5g|Samsung|Galaxy A Series|Samsung Galaxy A52s 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a53-5g|Samsung|Galaxy A Series|Samsung Galaxy A53 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-s20-fe|Samsung|Galaxy S Series|Samsung Galaxy S20 FE|128GB=0;256GB=0
samsung-galaxy-m14-5g|Samsung|Galaxy M Series|Samsung Galaxy M14 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-a06-5g|Samsung|Galaxy A Series|Samsung Galaxy A06 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m52-5g|Samsung|Galaxy M Series|Samsung Galaxy M52 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-s10|Samsung|Galaxy S Series|Samsung Galaxy S10|128GB=0;512GB=0
samsung-galaxy-a33-5g|Samsung|Galaxy A Series|Samsung Galaxy A33 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-f14-5g|Samsung|Galaxy F Series|Samsung Galaxy F14 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-f42-5g|Samsung|Galaxy F Series|Samsung Galaxy F42 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a72|Samsung|Galaxy A Series|Samsung Galaxy A72|8GB / 128GB=0;8GB / 256GB=0
samsung-galaxy-m32-5g|Samsung|Galaxy M Series|Samsung Galaxy M32 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m33-5g|Samsung|Galaxy M Series|Samsung Galaxy M33 5G|8GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m42-5g|Samsung|Galaxy M Series|Samsung Galaxy M42 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a22-5g|Samsung|Galaxy A Series|Samsung Galaxy A22 5G|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m13-5g|Samsung|Galaxy M Series|Samsung Galaxy M13 5G|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-f23-5g|Samsung|Galaxy F Series|Samsung Galaxy F23 5G|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-f06-5g|Samsung|Galaxy F Series|Samsung Galaxy F06 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-a14|Samsung|Galaxy A Series|Samsung Galaxy A14|64GB=0;128GB=0
samsung-galaxy-m06-5g|Samsung|Galaxy M Series|Samsung Galaxy M06 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-s10-lite|Samsung|Galaxy S Series|Samsung Galaxy S10 Lite|128GB=0;512GB=0
samsung-galaxy-note-9|Samsung|Galaxy Note Series|Samsung Galaxy Note 9|6GB / 128GB=0;8GB / 512GB=0
samsung-galaxy-m14-4g|Samsung|Galaxy M Series|Samsung Galaxy M14 4G|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-note-8|Samsung|Galaxy Note Series|Samsung Galaxy Note 8|6GB / 64GB=0;128GB=0;256GB=0
samsung-galaxy-a52|Samsung|Galaxy A Series|Samsung Galaxy A52|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-note-10-lite|Samsung|Galaxy Note Series|Samsung Galaxy Note 10 Lite|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a05s|Samsung|Galaxy A Series|Samsung Galaxy A05s|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-s10e|Samsung|Galaxy S Series|Samsung Galaxy S10e|128GB=0
samsung-galaxy-a6|Samsung|Galaxy A Series|Samsung Galaxy A6|3GB / 32GB=0;4GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-a05|Samsung|Galaxy A Series|Samsung Galaxy A05|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-a07|Samsung|Galaxy A Series|Samsung Galaxy A07|4GB / 64GB=0
samsung-galaxy-f07|Samsung|Galaxy F Series|Samsung Galaxy F07|4GB / 64GB=0
samsung-galaxy-a32|Samsung|Galaxy A Series|Samsung Galaxy A32|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m32-prime-edition|Samsung|Galaxy M Series|Samsung Galaxy M32 Prime Edition|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-a06|Samsung|Galaxy A Series|Samsung Galaxy A06|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-a23|Samsung|Galaxy A Series|Samsung Galaxy A23|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-f62|Samsung|Galaxy F Series|Samsung Galaxy F62|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-f14|Samsung|Galaxy F Series|Samsung Galaxy F14|4GB / 64GB=0
samsung-galaxy-a13|Samsung|Galaxy A Series|Samsung Galaxy A13|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-s9-plus|Samsung|Galaxy S Series|Samsung Galaxy S9 Plus|64GB=0;128GB=0;256GB=0
samsung-galaxy-a80|Samsung|Galaxy A Series|Samsung Galaxy A80|8GB / 128GB=0
samsung-galaxy-m07|Samsung|Galaxy M Series|Samsung Galaxy M07|4GB / 64GB=0
samsung-galaxy-s9|Samsung|Galaxy S Series|Samsung Galaxy S9|64GB=0;128GB=0;256GB=0
samsung-galaxy-m05|Samsung|Galaxy M Series|Samsung Galaxy M05|4GB / 64GB=0
samsung-galaxy-m51|Samsung|Galaxy M Series|Samsung Galaxy M51|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a71|Samsung|Galaxy A Series|Samsung Galaxy A71|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a22|Samsung|Galaxy A Series|Samsung Galaxy A22|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m13|Samsung|Galaxy M Series|Samsung Galaxy M13|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-f05|Samsung|Galaxy F Series|Samsung Galaxy F05|4GB / 64GB=0
samsung-galaxy-m32|Samsung|Galaxy M Series|Samsung Galaxy M32|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-a12|Samsung|Galaxy A Series|Samsung Galaxy A12|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-a51|Samsung|Galaxy A Series|Samsung Galaxy A51|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m12|Samsung|Galaxy M Series|Samsung Galaxy M12|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-a70|Samsung|Galaxy A Series|Samsung Galaxy A70|6GB / 128GB=0
samsung-galaxy-f13|Samsung|Galaxy F Series|Samsung Galaxy F13|4GB / 64GB=0;4GB / 128GB=0
samsung-galaxy-m31|Samsung|Galaxy M Series|Samsung Galaxy M31|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m31s|Samsung|Galaxy M Series|Samsung Galaxy M31s|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-f41|Samsung|Galaxy F Series|Samsung Galaxy F41|6GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-s8-plus|Samsung|Galaxy S Series|Samsung Galaxy S8 Plus|64GB=0;128GB=0
samsung-galaxy-f22|Samsung|Galaxy F Series|Samsung Galaxy F22|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-a21s|Samsung|Galaxy A Series|Samsung Galaxy A21s|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-a04|Samsung|Galaxy A Series|Samsung Galaxy A04|3GB / 32GB=0;4GB / 64GB=0;4GB / 128GB=0
samsung-galaxy-f12|Samsung|Galaxy F Series|Samsung Galaxy F12|4GB / 64GB=0;4GB / 128GB=0
samsung-galaxy-a31|Samsung|Galaxy A Series|Samsung Galaxy A31|6GB / 128GB=0
samsung-galaxy-a70s|Samsung|Galaxy A Series|Samsung Galaxy A70s|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-m04|Samsung|Galaxy M Series|Samsung Galaxy M04|64GB=0;128GB=0
samsung-galaxy-a04s|Samsung|Galaxy A Series|Samsung Galaxy A04s|4GB / 64GB=0;128GB=0
samsung-galaxy-a50|Samsung|Galaxy A Series|Samsung Galaxy A50|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-m21|Samsung|Galaxy M Series|Samsung Galaxy M21|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-m21-2021-edition|Samsung|Galaxy M Series|Samsung Galaxy M21 2021 Edition|4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-s8|Samsung|Galaxy S Series|Samsung Galaxy S8|64GB=0
samsung-galaxy-m40|Samsung|Galaxy M Series|Samsung Galaxy M40|6GB / 128GB=0
samsung-galaxy-a03s|Samsung|Galaxy A Series|Samsung Galaxy A03s|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-f04|Samsung|Galaxy F Series|Samsung Galaxy F04|4GB / 64GB=0
samsung-galaxy-a50s|Samsung|Galaxy A Series|Samsung Galaxy A50s|4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m30s|Samsung|Galaxy M Series|Samsung Galaxy M30s|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m11|Samsung|Galaxy M Series|Samsung Galaxy M11|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-m30|Samsung|Galaxy M Series|Samsung Galaxy M30|3GB / 32GB=0;4GB / 64GB=0;6GB / 128GB=0
samsung-galaxy-f02s|Samsung|Galaxy F Series|Samsung Galaxy F02s|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-a30s|Samsung|Galaxy A Series|Samsung Galaxy A30s|4GB / 64GB=0;4GB / 128GB=0
samsung-galaxy-a30|Samsung|Galaxy A Series|Samsung Galaxy A30|4GB / 64GB=0
samsung-galaxy-m02s|Samsung|Galaxy M Series|Samsung Galaxy M02s|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-a20s|Samsung|Galaxy A Series|Samsung Galaxy A20s|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-a03|Samsung|Galaxy A Series|Samsung Galaxy A03|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-a20|Samsung|Galaxy A Series|Samsung Galaxy A20|3GB / 32GB=0
samsung-galaxy-m02|Samsung|Galaxy M Series|Samsung Galaxy M02|2GB / 32GB=0;3GB / 32GB=0
samsung-galaxy-s7-edge|Samsung|Galaxy S Series|Samsung Galaxy S7 Edge|32GB=0
samsung-galaxy-a9-2018|Samsung|Galaxy A Series|Samsung Galaxy A9 2018|6GB / 128GB=0;8GB / 128GB=0
samsung-galaxy-a8-plus|Samsung|Galaxy A Series|Samsung Galaxy A8 Plus|6GB / 64GB=0
samsung-galaxy-m20|Samsung|Galaxy M Series|Samsung Galaxy M20|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-m10s|Samsung|Galaxy M Series|Samsung Galaxy M10s|3GB / 32GB=0
samsung-galaxy-j8|Samsung|Galaxy J Series|Samsung Galaxy J8|4GB / 64GB=0
samsung-galaxy-m01|Samsung|Galaxy M Series|Samsung Galaxy M01|3GB / 32GB=0
samsung-galaxy-a03-core|Samsung|Galaxy A Series|Samsung Galaxy A03 Core|2GB / 32GB=0
samsung-galaxy-a10s|Samsung|Galaxy A Series|Samsung Galaxy A10s|2GB / 32GB=0;3GB / 32GB=0
samsung-galaxy-c9-pro|Samsung|Galaxy C Series|Samsung Galaxy C9 Pro|6GB / 64GB=0
samsung-galaxy-c7-pro|Samsung|Galaxy C Series|Samsung Galaxy C7 Pro|4GB / 64GB=0
samsung-galaxy-s7|Samsung|Galaxy S Series|Samsung Galaxy S7|32GB=0
samsung-galaxy-a7-2018|Samsung|Galaxy A Series|Samsung Galaxy A7 (2018)|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
samsung-galaxy-m01s|Samsung|Galaxy M Series|Samsung Galaxy M01s|3GB / 32GB=0
samsung-galaxy-c5-pro|Samsung|Galaxy C Series|Samsung Galaxy C5 Pro|4GB / 64GB=0
samsung-galaxy-a10|Samsung|Galaxy A Series|Samsung Galaxy A10|2GB / 32GB=0
samsung-galaxy-on8|Samsung|Galaxy On Series|Samsung Galaxy On8|4GB / 64GB=0;3GB / 16GB=0
samsung-galaxy-j6-plus|Samsung|Galaxy J Series|Samsung Galaxy J6 Plus|4GB / 64GB=0
samsung-galaxy-on-max|Samsung|Galaxy On Series|Samsung Galaxy On Max|4GB / 32GB=0
samsung-galaxy-on7-prime|Samsung|Galaxy On Series|Samsung Galaxy On7 Prime|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-m10|Samsung|Galaxy M Series|Samsung Galaxy M10|3GB / 32GB=0;2GB / 16GB=0
samsung-galaxy-a6-plus|Samsung|Galaxy A Series|Samsung Galaxy A6 Plus|4GB / 32GB=0;4GB / 64GB=0;3GB / 32GB=0
samsung-galaxy-a9-pro|Samsung|Galaxy A Series|Samsung Galaxy A9 Pro|4GB / 32GB=0
samsung-galaxy-j7-max|Samsung|Galaxy J Series|Samsung Galaxy J7 Max|4GB / 32GB=0
samsung-galaxy-note-5|Samsung|Galaxy Note Series|Samsung Galaxy Note 5|4GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-note-5-dual-sim|Samsung|Galaxy Note Series|Samsung Galaxy Note 5 Dual Sim|4GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-s6|Samsung|Galaxy S Series|Samsung Galaxy S6|64GB=0;32GB=0
samsung-galaxy-a8-star|Samsung|Galaxy A Series|Samsung Galaxy A8 Star|6GB / 64GB=0
samsung-galaxy-m01-core|Samsung|Galaxy M Series|Samsung Galaxy M01 Core|2GB / 32GB=0;1GB / 16GB=0
samsung-galaxy-a7-2017|Samsung|Galaxy A Series|Samsung Galaxy A7 (2017)|3GB / 32GB=0
samsung-galaxy-j7-duo|Samsung|Galaxy J Series|Samsung Galaxy J7 Duo|32GB=0
samsung-galaxy-j7-nxt|Samsung|Galaxy J Series|Samsung Galaxy J7 Nxt|2GB / 16GB=0;3GB / 32GB=0
samsung-galaxy-on-nxt|Samsung|Galaxy On Series|Samsung Galaxy On Nxt|3GB / 16GB=0;3GB / 32GB=0
samsung-galaxy-s6-edge|Samsung|Galaxy S Series|Samsung Galaxy S6 Edge|32GB=0;64GB=0
samsung-galaxy-j7-prime|Samsung|Galaxy J Series|Samsung Galaxy J7 Prime|3GB / 16GB=0;3GB / 32GB=0
samsung-galaxy-j6|Samsung|Galaxy J Series|Samsung Galaxy J6|3GB / 32GB=0;4GB / 64GB=0
samsung-galaxy-j4-plus|Samsung|Galaxy J Series|Samsung Galaxy J4 Plus|2GB / 32GB=0;3GB / 32GB=0
samsung-galaxy-j4|Samsung|Galaxy J Series|Samsung Galaxy J4|2GB / 16GB=0;3GB / 32GB=0
samsung-galaxy-j7-pro|Samsung|Galaxy J Series|Samsung Galaxy J7 Pro|32GB=0;3GB / 64GB=0
samsung-galaxy-a5-2017|Samsung|Galaxy A Series|Samsung Galaxy A5 2017|3GB / 32GB=0
samsung-galaxy-on6|Samsung|Galaxy On Series|Samsung Galaxy On6|64GB=0
samsung-galaxy-note-4|Samsung|Galaxy Note Series|Samsung Galaxy Note 4|3GB / 32GB=0
samsung-galaxy-j5|Samsung|Galaxy J Series|Samsung Galaxy J5|2GB / 16GB=0
samsung-galaxy-j7|Samsung|Galaxy J Series|Samsung Galaxy J7|1.5GB / 16GB=0
samsung-galaxy-on7|Samsung|Galaxy On Series|Samsung Galaxy On7|1.5GB / 8GB=0;2GB / 16GB=0
samsung-galaxy-j2-core|Samsung|Galaxy J Series|Samsung Galaxy J2 Core|1GB / 8GB=0
samsung-galaxy-j2|Samsung|Galaxy J Series|Samsung Galaxy J2|1GB / 8GB=0
samsung-galaxy-j3|Samsung|Galaxy J Series|Samsung Galaxy J3|1.5GB / 8GB=0
samsung-galaxy-on5|Samsung|Galaxy On Series|Samsung Galaxy On5|1.5GB / 8GB=0
oneplus-15|OnePlus|OnePlus Number Series|OnePlus 15|12GB / 256GB=0;16GB / 512GB=0
oneplus-open|OnePlus|OnePlus Open Series|Oneplus Open|16GB / 512GB=0
op13|OnePlus|OnePlus Number Series|OnePlus 13|12GB / 256GB=0;16GB / 512GB=0;24GB / 1TB=0
oneplus-13s|OnePlus|OnePlus Number Series|OnePlus 13s|256GB=0;512GB=0;16GB / 512GB=0
op12|OnePlus|OnePlus Number Series|OnePlus 12|12GB / 256GB=0;16GB / 512GB=0
oneplus-15r|OnePlus|OnePlus Number Series|OnePlus 15R|256GB=0;512GB=0
oneplus-13r|OnePlus|OnePlus Number Series|OnePlus 13R|12GB / 256GB=0;16GB / 512GB=0
oneplus-nord-6-5g|OnePlus|OnePlus Nord Series|OnePlus Nord 6 5G|8GB / 256GB=0;12GB / 256GB=0
oneplus-12r|OnePlus|OnePlus Number Series|OnePlus 12R|8GB / 128GB=0;8GB / 256GB=0;16GB / 256GB=0
oneplus-11-5g-marble-edition|OnePlus|OnePlus Special Edition Series|Oneplus 11 5G Marble Edition|16GB / 256GB=0
oneplus-nord-5|OnePlus|OnePlus Nord Series|OnePlus Nord 5|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
oneplus-11-5g|OnePlus|OnePlus Number Series|OnePlus 11 5G|8GB / 128GB=0;16GB / 256GB=0
oneplus-nord-ce-6-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 6 5G|128GB=0;256GB=0
oneplus-11r-5g|OnePlus|OnePlus Number Series|OnePlus 11R 5G|8GB / 128GB=0;16GB / 256GB=0;18GB / 512GB=0
nord4|OnePlus|OnePlus Nord Series|OnePlus Nord 4|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
oneplus-nord-ce-5|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 5|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
oneplus-nord-ce-6-lite-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 6 Lite 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
oneplus-n6|OnePlus|OnePlus N Series|OnePlus N6|4GB / 128GB=0;6GB / 128GB=0
oneplus-nord-ce4-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE4 5G|128GB=0;256GB=0
oneplus-nord-3-5g|OnePlus|OnePlus Nord Series|OnePlus Nord 3 5G|8GB / 128GB=0;16GB / 256GB=0
oneplus-10t-5g|OnePlus|OnePlus Number Series|OnePlus 10T 5G|8GB / 128GB=0;12GB / 256GB=0;16GB / 256GB=0
oneplus-nord-ce-3-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 3 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-10-pro-5g|OnePlus|OnePlus Number Series|OnePlus 10 Pro 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-ce4-lite-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE4 Lite 5G|128GB=0;256GB=0
oneplus-n6x|OnePlus|OnePlus N Series|Oneplus N6x|64GB=0;128GB=0
oneplus-nord-ce-3-lite-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 3 Lite 5G|128GB=0;256GB=0
oneplus-9-pro-5g|OnePlus|OnePlus Number Series|OnePlus 9 Pro 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-8-pro|OnePlus|OnePlus Number Series|OnePlus 8 Pro|8GB / 128GB=0;12GB / 256GB=0
oneplus-9rt-5g|OnePlus|OnePlus Number Series|OnePlus 9RT 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-n6-lite|OnePlus|OnePlus N Series|OnePlus N6 Lite|4GB / 64GB=0
oneplus-10r-5g|OnePlus|OnePlus Number Series|OnePlus 10R 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-8|OnePlus|OnePlus Number Series|OnePlus 8|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
oneplus-8t|OnePlus|OnePlus Number Series|OnePlus 8T|8GB / 128GB=0;12GB / 256GB=0
oneplus-9-5g|OnePlus|OnePlus Number Series|OnePlus 9 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-9r-5g|OnePlus|OnePlus Number Series|OnePlus 9R 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-2-5g|OnePlus|OnePlus Nord Series|OnePlus Nord 2 5G|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-2t-5g|OnePlus|OnePlus Nord Series|OnePlus Nord 2T 5G|8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-ce-2-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 2 5G|6GB / 128GB=0;8GB / 128GB=0
oneplus-7t-pro-mclaren-edition|OnePlus|OnePlus Special Edition Series|OnePlus 7T Pro McLaren Edition|12GB / 256GB=0
oneplus-nord|OnePlus|OnePlus Nord Series|OnePlus Nord|6GB / 64GB=0;8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-ce-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 5G|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
oneplus-nord-ce-2-lite-5g|OnePlus|OnePlus Nord CE Series|OnePlus Nord CE 2 Lite 5G|6GB / 128GB=0;8GB / 128GB=0
oneplus-7t-pro|OnePlus|OnePlus Number Series|OnePlus 7T Pro|8GB / 256GB=0;12GB / 256GB=0
oneplus-7-pro|OnePlus|OnePlus Number Series|OnePlus 7 Pro|6GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
oneplus-7t|OnePlus|OnePlus Number Series|OnePlus 7T|128GB=0;256GB=0
oneplus-7|OnePlus|OnePlus Number Series|OnePlus 7|6GB / 128GB=0;8GB / 256GB=0
oneplus-6t|OnePlus|OnePlus Number Series|OnePlus 6T|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
oneplus-6t-mclaren|OnePlus|OnePlus Special Edition Series|OnePlus 6T McLaren|10GB / 256GB=0
oneplus-6|OnePlus|OnePlus Number Series|OnePlus 6|6GB / 64GB=0;8GB / 128GB=0;8GB / 256GB=0
oneplus-5t|OnePlus|OnePlus Number Series|OnePlus 5T|6GB / 64GB=0;8GB / 128GB=0
oneplus-5|OnePlus|OnePlus Number Series|OnePlus 5|6GB / 64GB=0;8GB / 128GB=0
oneplus-3t|OnePlus|OnePlus Number Series|OnePlus 3T|64GB=0;128GB=0
oneplus-3|OnePlus|OnePlus Number Series|OnePlus 3|6GB / 64GB=0
google-pixel-11-pro-fold|Google|Pixel 11 Series|Google Pixel 11 Pro Fold|16GB / 512GB=0
google-pixel-10-pro-fold|Google|Pixel 10 Series|Google Pixel 10 Pro Fold|16GB / 256GB=0
google-pixel-11-pro-xl|Google|Pixel 11 Series|Google Pixel 11 Pro XL|12GB / 256GB=0;16GB / 512GB=0
google-pixel-11-pro|Google|Pixel 11 Series|Google Pixel 11 Pro|12GB / 256GB=0;16GB / 512GB=0
google-pixel-10-pro-xl|Google|Pixel 10 Series|Google Pixel 10 Pro XL|16GB / 256GB=0
google-pixel-11|Google|Pixel 11 Series|Google Pixel 11|256GB=0;512GB=0
google-pixel-9-pro-fold|Google|Pixel 9 Series|Google Pixel 9 Pro Fold|16GB / 256GB=0
google-pixel-10-pro|Google|Pixel 10 Series|Google Pixel 10 Pro|16GB / 256GB=0
google-pixel-9-pro-xl|Google|Pixel 9 Series|Google Pixel 9 Pro XL|256GB=0;512GB=0
px9p|Google|Pixel 9 Series|Google Pixel 9 Pro|16GB / 256GB=0
google-pixel-10|Google|Pixel 10 Series|Google Pixel 10|12GB / 256GB=0
google-pixel-9|Google|Pixel 9 Series|Google Pixel 9|12GB / 256GB=0
google-pixel-10a|Google|Pixel 10 Series|Google Pixel 10a|8GB / 256GB=0
google-pixel-8-pro|Google|Pixel 8 Series|Google Pixel 8 Pro|128GB=0;256GB=0;512GB=0
google-pixel-9a|Google|Pixel 9 Series|Google Pixel 9a|8GB / 256GB=0
px8|Google|Pixel 8 Series|Google Pixel 8|128GB=0;256GB=0
google-pixel-8a|Google|Pixel 8 Series|Google Pixel 8A|128GB=0;256GB=0
google-pixel-7-pro|Google|Pixel 7 Series|Google Pixel 7 Pro|128GB=0;256GB=0
google-pixel-7a|Google|Pixel 7 Series|Google Pixel 7a|8GB / 128GB=0
google-pixel-7|Google|Pixel 7 Series|Google Pixel 7|128GB=0;256GB=0
google-pixel-6a|Google|Pixel 6 Series|Google Pixel 6a|6GB / 128GB=0
google-pixel-4a|Google|Pixel 4 Series|Google Pixel 4A|6GB / 128GB=0
vivo-x-fold-5|Vivo|X Series|Vivo X Fold 5|16GB / 512GB=0
vivo-x300-ultra|Vivo|X Series|Vivo X300 Ultra|16GB / 512GB=0
vivo-x300-pro|Vivo|X Series|Vivo X300 Pro|16GB / 512GB=0
vivo-x-fold-3-pro|Vivo|X Series|Vivo X Fold 3 Pro|16GB / 512GB=0
vivo-x300-fe|Vivo|X Series|Vivo X300 FE|8GB / 256GB=0;256GB=0;512GB=0
vivo-v80|Vivo|V Series|Vivo V80|8GB / 128GB=0;8GB / 256GB=0;8GB / 512GB=0
x200p|Vivo|X Series|Vivo X200 Pro|16GB / 512GB=0
vivo-x300|Vivo|X Series|Vivo X300|12GB / 256GB=0;12GB / 512GB=0;16GB / 512GB=0
vivo-x200t|Vivo|X Series|Vivo X200T|256GB=0;512GB=0
vivo-v70-elite|Vivo|V Series|Vivo V70 Elite|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
vivo-x200|Vivo|X Series|Vivo X200|12GB / 256GB=0;16GB / 512GB=0
vivo-x200-fe|Vivo|X Series|Vivo X200 FE|12GB / 256GB=0;16GB / 512GB=0
vivo-v70|Vivo|V Series|Vivo V70|8GB / 256GB=0;12GB / 256GB=0
vivo-x100-pro|Vivo|X Series|Vivo X100 Pro|16GB / 512GB=0
vivo-t5-5g|Vivo|T Series|Vivo T5 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v70-fe|Vivo|V Series|Vivo V70 FE|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-x90-pro|Vivo|X Series|Vivo X90 Pro|12GB / 256GB=0
vivo-v60|Vivo|V Series|Vivo V60|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0;16GB / 512GB=0
vivo-s2|Vivo|S Series|Vivo S2|128GB=0;256GB=0
vivo-x100|Vivo|X Series|Vivo X100|12GB / 256GB=0;16GB / 512GB=0
vivo-v40-pro-5g|Vivo|V Series|Vivo V40 Pro 5G|8GB / 256GB=0;12GB / 512GB=0
vivo-t4-ultra|Vivo|T Series|Vivo T4 Ultra|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
vivo-t5-pro-5g|Vivo|T Series|Vivo T5 Pro 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-x90|Vivo|X Series|Vivo X90|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v50|Vivo|V Series|Vivo V50|8GB / 128GB=0;8GB / 256GB=0;12GB / 512GB=0
vivo-v60e|Vivo|V Series|Vivo V60e|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v30-pro-5g|Vivo|V Series|Vivo V30 Pro 5G|8GB / 256GB=0;12GB / 512GB=0
vivo-v40-5g|Vivo|V Series|Vivo V40 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 512GB=0
vivo-t4-pro-5g|Vivo|T Series|Vivo T4 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-x80-pro|Vivo|X Series|Vivo X80 Pro|12GB / 256GB=0
vivo-v30-5g|Vivo|V Series|Vivo V30 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v50e-5g|Vivo|V Series|Vivo V50e 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-y51-pro-5g|Vivo|Y Series|Vivo Y51 Pro 5G|128GB=0;8GB / 256GB=0
vivo-v29-pro-5g|Vivo|V Series|Vivo V29 Pro 5G|8GB / 256GB=0;12GB / 256GB=0
vivo-t3-ultra-5g|Vivo|T Series|Vivo T3 Ultra 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v27-pro-5g|Vivo|V Series|Vivo V27 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-v40e-5g|Vivo|V Series|Vivo V40e 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-v30e-5g|Vivo|V Series|Vivo V30e 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-v27-5g|Vivo|V Series|Vivo V27 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-t5x-5g|Vivo|T Series|Vivo T5x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
vivo-v29-5g|Vivo|V Series|Vivo V29 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-t4-5g|Vivo|T Series|Vivo T4 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-x70-pro-plus|Vivo|X Series|Vivo X70 Pro Plus|12GB / 256GB=0
vivo-y400-pro-5g|Vivo|Y Series|Vivo Y400 Pro 5G|128GB=0;256GB=0
vivo-y400-5g|Vivo|Y Series|Vivo Y400 5G|128GB=0;256GB=0
vivo-t3-pro-5g|Vivo|T Series|Vivo T3 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-x80|Vivo|X Series|Vivo X80|8GB / 128GB=0;12GB / 256GB=0
vivo-v29e-5g|Vivo|V Series|Vivo V29e 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-t5-lite-5g|Vivo|T Series|Vivo T5 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;6GB / 256GB=0
vivo-t2-pro-5g|Vivo|T Series|Vivo T2 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-t4r-5g|Vivo|T Series|Vivo T4R 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-y300-plus|Vivo|Y Series|Vivo Y300 Plus|8GB / 128GB=0
vivo-x70-pro|Vivo|X Series|Vivo X70 Pro|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
vivo-y300-5g|Vivo|Y Series|Vivo Y300 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-y21-5g|Vivo|Y Series|Vivo Y21 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y31-pro-5g|Vivo|Y Series|Vivo Y31 Pro 5G|128GB=0;256GB=0
vivo-y200-pro-5g|Vivo|Y Series|Vivo Y200 Pro 5G|8GB / 128GB=0
vivo-x60-pro-plus|Vivo|X Series|Vivo X60 Pro Plus|12GB / 256GB=0
vivo-y200-5g|Vivo|Y Series|Vivo Y200 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-y29-5g|Vivo|Y Series|Vivo Y29 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
vivo-y39-5g|Vivo|Y Series|Vivo Y39 5G|128GB=0;256GB=0
vivo-v25-pro-5g|Vivo|V Series|Vivo V25 Pro 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-y31-5g|Vivo|Y Series|Vivo Y31 5G|4GB / 128GB=0;6GB / 128GB=0
vivo-t3-5g|Vivo|T Series|Vivo T3 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-y200e-5g|Vivo|Y Series|Vivo Y200e 5G|6GB / 128GB=0;8GB / 128GB=0
vivo-t4x-5g|Vivo|T Series|Vivo T4x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
vivo-x60-pro|Vivo|X Series|Vivo X60 Pro|12GB / 256GB=0
vivo-y58-5g|Vivo|Y Series|Vivo Y58 5G|8GB / 128GB=0
vivo-v23-pro-5g|Vivo|V Series|Vivo V23 Pro 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-t2-5g|Vivo|T Series|Vivo T2 5G|6GB / 128GB=0;8GB / 128GB=0
vivo-y100-5g|Vivo|Y Series|Vivo Y100 5G|8GB / 128GB=0;8GB / 256GB=0
vivo-t2x-5g|Vivo|T Series|Vivo T2x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-t3x-5g|Vivo|T Series|Vivo T3x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y100a|Vivo|Y Series|Vivo Y100A|8GB / 128GB=0;8GB / 256GB=0
vivo-y11-5g|Vivo|Y Series|Vivo Y11 5G|64GB=0;128GB=0
vivo-v23-5g|Vivo|V Series|Vivo V23 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-v25-5g|Vivo|V Series|Vivo V25 5G|8GB / 128GB=0;12GB / 256GB=0
vivo-y56-5g|Vivo|Y Series|Vivo Y56 5G|4GB / 128GB=0;8GB / 128GB=0
vivo-x60|Vivo|X Series|Vivo X60|8GB / 128GB=0;12GB / 256GB=0
vivo-y28s-5g|Vivo|Y Series|Vivo Y28s 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y28-5g|Vivo|Y Series|Vivo Y28 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y19s-5g|Vivo|Y Series|Vivo Y19s 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
vivo-x50-pro|Vivo|X Series|Vivo X50 Pro|8GB / 256GB=0
vivo-t4-lite-5g|Vivo|T Series|Vivo T4 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
vivo-t1-pro-5g|Vivo|T Series|Vivo T1 Pro 5G|6GB / 128GB=0;8GB / 128GB=0
vivo-y28e-5g|Vivo|Y Series|Vivo Y28e 5G|4GB / 64GB=0;4GB / 128GB=0
vivo-v23e-5g|Vivo|V Series|Vivo V23e 5G|8GB / 128GB=0
vivo-v21-5g|Vivo|V Series|Vivo V21 5G|128GB=0;256GB=0
vivo-y05|Vivo|Y Series|Vivo Y05|4GB / 64GB=0
vivo-t1-5g|Vivo|T Series|Vivo T1 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y19-5g|Vivo|Y Series|Vivo Y19 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
vivo-y36|Vivo|Y Series|Vivo Y36|8GB / 128GB=0
vivo-v21|Vivo|V Series|Vivo V21|8GB / 128GB=0
vivo-v20-pro|Vivo|V Series|Vivo V20 Pro|8GB / 128GB=0
vivo-v21e-5g|Vivo|V Series|Vivo V21e 5G|8GB / 128GB=0;256GB=0
vivo-y75-5g|Vivo|Y Series|Vivo Y75 5G|8GB / 128GB=0
vivo-y72-5g|Vivo|Y Series|Vivo Y72 5G|8GB / 128GB=0
vivo-v21e|Vivo|V Series|Vivo V21e|8GB / 128GB=0
vivo-t3-lite-5g|Vivo|T Series|Vivo T3 Lite 5G|4GB / 128GB=0;6GB / 128GB=0
vivo-y27|Vivo|Y Series|Vivo Y27|6GB / 128GB=0
vivo-t1-44w|Vivo|T Series|Vivo T1 44W|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-v20|Vivo|V Series|Vivo V20|8GB / 128GB=0;8GB / 256GB=0
vivo-y17s|Vivo|Y Series|Vivo Y17s|4GB / 64GB=0;4GB / 128GB=0
vivo-v19|Vivo|V Series|Vivo V19|128GB=0;256GB=0
vivo-y73|Vivo|Y Series|Vivo Y73|8GB / 128GB=0
vivo-y75|Vivo|Y Series|Vivo Y75|8GB / 128GB=0
vivo-v17-pro|Vivo|V Series|Vivo V17 Pro|8GB / 128GB=0
vivo-x50|Vivo|X Series|Vivo X50|8GB / 128GB=0;256GB=0
vivo-v17|Vivo|V Series|Vivo V17|8GB / 128GB=0
vivo-v20-se|Vivo|V Series|Vivo V20 SE|8GB / 128GB=0
vivo-y22s|Vivo|Y Series|Vivo Y22s|8GB / 128GB=0
vivo-v20-2021|Vivo|V Series|Vivo V20 2021|8GB / 128GB=0;8GB / 256GB=0
vivo-y53s|Vivo|Y Series|Vivo Y53s|8GB / 128GB=0
vivo-y33t|Vivo|Y Series|Vivo Y33T|8GB / 128GB=0
vivo-y33s|Vivo|Y Series|Vivo Y33s|8GB / 128GB=0
vivo-t1x|Vivo|T Series|Vivo T1x|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
vivo-y18|Vivo|Y Series|Vivo Y18|4GB / 64GB=0;4GB / 128GB=0
vivo-y22|Vivo|Y Series|Vivo Y22|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
vivo-y35|Vivo|Y Series|Vivo Y35|8GB / 128GB=0
vivo-y55|Vivo|Y Series|Vivo Y55|8GB / 128GB=0
vivo-y19e|Vivo|Y Series|Vivo Y19e|4GB / 64GB=0
vivo-y51-2020|Vivo|Y Series|Vivo Y51 2020|8GB / 128GB=0
vivo-y18t|Vivo|Y Series|Vivo Y18T|4GB / 128GB=0
vivo-y20g|Vivo|Y Series|Vivo Y20G|4GB / 64GB=0;6GB / 128GB=0
vivo-y50|Vivo|Y Series|Vivo Y50|8GB / 128GB=0
vivo-y30g|Vivo|Y Series|Vivo Y30G|8GB / 128GB=0
vivo-nex-dual-display|Vivo|Nex Series|Vivo NEX Dual Display|10GB / 128GB=0
vivo-y18i|Vivo|Y Series|Vivo Y18i|4GB / 64GB=0
vivo-y51a|Vivo|Y Series|Vivo Y51A|6GB / 128GB=0;8GB / 128GB=0
vivo-y20t|Vivo|Y Series|Vivo Y20T|6GB / 64GB=0
vivo-y18e|Vivo|Y Series|Vivo Y18e|4GB / 64GB=0
vivo-y21|Vivo|Y Series|Vivo Y21|4GB / 64GB=0;4GB / 128GB=0
vivo-y21t|Vivo|Y Series|Vivo Y21T|4GB / 128GB=0
vivo-y30|Vivo|Y Series|Vivo Y30|4GB / 128GB=0;6GB / 128GB=0
vivo-s1-pro|Vivo|S Series|Vivo S1 Pro|8GB / 128GB=0
vivo-v15-pro|Vivo|V Series|Vivo V15 Pro|6GB / 128GB=0;8GB / 128GB=0
vivo-y02t|Vivo|Y Series|Vivo Y02T|4GB / 64GB=0
vivo-y17|Vivo|Y Series|Vivo Y17|4GB / 128GB=0
vivo-y31-2021|Vivo|Y Series|Vivo Y31 2021|6GB / 128GB=0
vivo-y16|Vivo|Y Series|Vivo Y16|3GB / 32GB=0;3GB / 64GB=0;4GB / 64GB=0;4GB / 128GB=0
vivo-y21g|Vivo|Y Series|Vivo Y21G|4GB / 64GB=0
vivo-y20|Vivo|Y Series|Vivo Y20|4GB / 64GB=0;6GB / 64GB=0
vivo-nex|Vivo|Nex Series|Vivo NEX|8GB / 128GB=0
vivo-v15|Vivo|V Series|Vivo V15|6GB / 64GB=0;6GB / 128GB=0
vivo-y19|Vivo|Y Series|Vivo Y19|4GB / 128GB=0
vivo-s1|Vivo|S Series|Vivo S1|6GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
vivo-z1x|Vivo|Z Series|Vivo Z1x|4GB / 128GB=0;6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y21a|Vivo|Y Series|Vivo Y21A|4GB / 64GB=0
vivo-y12|Vivo|Y Series|Vivo Y12|3GB / 64GB=0;4GB / 32GB=0;4GB / 64GB=0
vivo-y21e|Vivo|Y Series|Vivo Y21e|3GB / 64GB=0
vivo-z1-pro|Vivo|Z Series|Vivo Z1 Pro|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
vivo-y12g|Vivo|Y Series|Vivo Y12G|3GB / 32GB=0;3GB / 64GB=0
vivo-y12s|Vivo|Y Series|Vivo Y12s|3GB / 32GB=0
vivo-v11-pro|Vivo|V Series|Vivo V11 Pro|6GB / 64GB=0
vivo-y20a|Vivo|Y Series|Vivo Y20A|3GB / 64GB=0
vivo-u20|Vivo|U Series|Vivo U20|4GB / 64GB=0;6GB / 64GB=0;8GB / 128GB=0
vivo-y15-2019|Vivo|Y Series|Vivo Y15 2019|4GB / 64GB=0
vivo-y20i|Vivo|Y Series|Vivo Y20i|3GB / 64GB=0
vivo-x21|Vivo|X Series|Vivo X21|6GB / 128GB=0
vivo-v11|Vivo|V Series|Vivo V11|6GB / 64GB=0
vivo-u10|Vivo|U Series|Vivo U10|3GB / 32GB=0;3GB / 64GB=0;4GB / 64GB=0
vivo-v9-pro|Vivo|V Series|Vivo V9 Pro|4GB / 64GB=0;6GB / 64GB=0
vivo-y95|Vivo|Y Series|Vivo Y95|4GB / 64GB=0
vivo-y15s|Vivo|Y Series|Vivo Y15s|3GB / 32GB=0
vivo-y02|Vivo|Y Series|Vivo Y02|3GB / 32GB=0
vivo-y3s-2021|Vivo|Y Series|Vivo Y3s 2021|2GB / 32GB=0
vivo-y02s|Vivo|Y Series|Vivo Y02s|3GB / 32GB=0
vivo-y11-2019|Vivo|Y Series|Vivo Y11 2019|3GB / 32GB=0
vivo-v9|Vivo|V Series|Vivo V9|4GB / 64GB=0
vivo-y01|Vivo|Y Series|Vivo Y01|2GB / 32GB=0
vivo-y1s|Vivo|Y Series|Vivo Y1s|2GB / 32GB=0;3GB / 32GB=0
vivo-y83-pro|Vivo|Y Series|Vivo Y83 Pro|4GB / 64GB=0
vivo-y01a|Vivo|Y Series|Vivo Y01a|2GB / 32GB=0
vivo-x9s-plus|Vivo|X Series|Vivo X9s Plus|4GB / 64GB=0
vivo-y93|Vivo|Y Series|Vivo Y93|4GB / 32GB=0;3GB / 64GB=0
vivo-z10|Vivo|Z Series|Vivo Z10|4GB / 32GB=0
vivo-x9|Vivo|X Series|Vivo X9|4GB / 64GB=0;128GB=0
vivo-x9s|Vivo|X Series|Vivo X9s|4GB / 64GB=0
vivo-y91|Vivo|Y Series|Vivo Y91|2GB / 32GB=0;3GB / 32GB=0
vivo-y83|Vivo|Y Series|Vivo Y83|4GB / 32GB=0
vivo-v9-youth|Vivo|V Series|Vivo V9 Youth|4GB / 32GB=0
vivo-v5-plus|Vivo|V Series|Vivo V5 Plus|4GB / 32GB=0;4GB / 64GB=0
vivo-v7-plus|Vivo|V Series|Vivo V7 Plus|4GB / 64GB=0
vivo-v7|Vivo|V Series|Vivo V7|4GB / 32GB=0
vivo-y81|Vivo|Y Series|Vivo Y81|3GB / 32GB=0;4GB / 32GB=0
vivo-y90|Vivo|Y Series|Vivo Y90|2GB / 16GB=0
vivo-y91i|Vivo|Y Series|Vivo Y91i|2GB / 16GB=0;2GB / 32GB=0;3GB / 32GB=0
vivo-y66|Vivo|Y Series|Vivo Y66|3GB / 32GB=0
vivo-y71|Vivo|Y Series|Vivo Y71|4GB / 32GB=0;3GB / 16GB=0;3GB / 32GB=0
vivo-y71i|Vivo|Y Series|Vivo Y71i|2GB / 16GB=0
vivo-y81i|Vivo|Y Series|Vivo Y81i|2GB / 16GB=0
vivo-v5|Vivo|V Series|Vivo V5|4GB / 32GB=0
vivo-y69|Vivo|Y Series|Vivo Y69|3GB / 32GB=0
vivo-y55s|Vivo|Y Series|Vivo Y55s|3GB / 16GB=0
vivo-y53i|Vivo|Y Series|Vivo Y53i|2GB / 16GB=0
oppo-find-x9-ultra|OPPO|OPPO Find Series|OPPO Find X9 Ultra|12GB / 512GB=0
oppo-find-x9-pro|OPPO|OPPO Find Series|OPPO Find X9 Pro|16GB / 512GB=0
oppo-find-x9-5g|OPPO|OPPO Find Series|OPPO Find X9 5G|12GB / 256GB=0;16GB / 512GB=0
oppo-find-x8-pro-5g|OPPO|OPPO Find Series|OPPO Find X8 Pro 5G|16GB / 512GB=0
oppo-find-x9s|OPPO|OPPO Find Series|OPPO Find X9s|256GB=0;512GB=0
oppo-reno16-5g|OPPO|OPPO Reno Series|OPPO Reno16 5G|8GB / 256GB=0;12GB / 256GB=0
oppo-reno15-pro-5g|OPPO|OPPO Reno Series|OPPO Reno15 Pro 5G|12GB / 256GB=0;12GB / 512GB=0
oppo-reno15-pro-mini-5g|OPPO|OPPO Reno Series|Oppo Reno15 Pro Mini 5G|256GB=0;512GB=0
oppo-find-x8-5g|OPPO|OPPO Find Series|OPPO Find X8 5G|12GB / 256GB=0;16GB / 512GB=0
oppo-reno16c-5g|OPPO|OPPO Reno Series|OPPO Reno16c 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
oppo-reno14-pro-5g|OPPO|OPPO Reno Series|OPPO Reno14 Pro 5G|12GB / 256GB=0;12GB / 512GB=0
oppo-reno15-5g|OPPO|OPPO Reno Series|OPPO Reno15 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
oppo-reno14-5g|OPPO|OPPO Reno Series|OPPO Reno14 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
oppo-reno13-pro-5g|OPPO|OPPO Reno Series|OPPO Reno13 Pro 5G|12GB / 256GB=0;12GB / 512GB=0
oppo-f33-5g|OPPO|OPPO F Series|OPPO F33 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
oppo-f33-pro-5g|OPPO|OPPO F Series|OPPO F33 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-find-n3-flip|OPPO|OPPO Find Series|OPPO Find N3 Flip|12GB / 256GB=0
oppo-reno-15c-5g|OPPO|OPPO Reno Series|OPPO Reno 15c 5G|8GB / 256GB=0;12GB / 256GB=0
oppo-f31-pro-plus-5g|OPPO|OPPO F Series|OPPO F31 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0
oppo-f31-pro-5g|OPPO|OPPO F Series|OPPO F31 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
oppo-k13-turbo-pro-5g|OPPO|OPPO K Series|Oppo K13 Turbo Pro 5G|8GB / 256GB=0;12GB / 256GB=0
oppo-reno13-5g|OPPO|OPPO Reno Series|OPPO Reno13 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 512GB=0
oppo-reno12-pro-5g|OPPO|OPPO Reno Series|OPPO Reno12 Pro 5G|12GB / 256GB=0;12GB / 512GB=0
oppo-reno10-pro-plus-5g|OPPO|OPPO Reno Series|OPPO Reno10 Pro Plus 5G|12GB / 256GB=0
oppo-reno11-pro-5g|OPPO|OPPO Reno Series|OPPO Reno11 Pro 5G|12GB / 256GB=0
oppo-reno10-pro-5g|OPPO|OPPO Reno Series|OPPO Reno10 Pro 5G|12GB / 256GB=0
oppo-find-x5-pro|OPPO|OPPO Find Series|OPPO Find X5 Pro|12GB / 256GB=0
oppo-f31-5g|OPPO|OPPO F Series|OPPO F31 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-find-n2-flip|OPPO|OPPO Find Series|OPPO Find N2 Flip|8GB / 256GB=0
oppo-reno12-5g|OPPO|OPPO Reno Series|OPPO Reno12 5G|8GB / 256GB=0
oppo-k13-turbo-5g|OPPO|OPPO K Series|OPPO K13 Turbo 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-reno11-5g|OPPO|OPPO Reno Series|OPPO Reno11 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-f29-5g|OPPO|OPPO F Series|OPPO F29 5G|128GB=0;256GB=0
oppo-f29-pro-5g|OPPO|OPPO F Series|OPPO F29 Pro 5G|128GB=0;256GB=0
oppo-reno10-5g|OPPO|OPPO Reno Series|OPPO Reno10 5G|8GB / 256GB=0
oppo-a6-pro-5g|OPPO|OPPO A Series|OPPO A6 Pro 5G|128GB=0;256GB=0
oppo-f27-pro-plus-5g|OPPO|OPPO F Series|OPPO F27 Pro Plus 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-a6-5g|OPPO|OPPO A Series|OPPO A6 5G|4GB / 128GB=0;6GB / 128GB=0;6GB / 256GB=0
oppo-f27-5g|OPPO|OPPO F Series|OPPO F27 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-k14-5g|OPPO|OPPO K Series|OPPO K14 5G|6GB / 128GB=0;6GB / 256GB=0;8GB / 128GB=0;8GB / 256GB=0
oppo-a6s-5g|OPPO|OPPO A Series|OPPO A6s 5G|4GB / 128GB=0;6GB / 128GB=0
oppo-f25-pro-5g|OPPO|OPPO F Series|OPPO F25 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-a5-pro-5g|OPPO|OPPO A Series|OPPO A5 Pro 5G|128GB=0;256GB=0
oppo-k13-5g|OPPO|OPPO K Series|OPPO K13 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-find-x3-pro|OPPO|OPPO Find Series|OPPO Find X3 Pro|12GB / 256GB=0
oppo-a3-pro-5g|OPPO|OPPO A Series|OPPO A3 Pro 5G|128GB=0;256GB=0
oppo-f23-5g|OPPO|OPPO F Series|OPPO F23 5G|8GB / 256GB=0
oppo-find-x2-pro|OPPO|OPPO Find Series|OPPO Find X2 Pro|12GB / 512GB=0
oppo-k14x-5g|OPPO|OPPO K Series|OPPO K14x 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
oppo-reno8-t-5g|OPPO|OPPO Reno Series|OPPO Reno8 T 5G|8GB / 128GB=0
oppo-a6c|OPPO|OPPO A Series|OPPO A6c|4GB / 64GB=0;4GB / 128GB=0
oppo-a5-5g|OPPO|OPPO A Series|OPPO A5 5G|6GB / 128GB=0;8GB / 128GB=0
oppo-a79-5g|OPPO|OPPO A Series|OPPO A79 5G|8GB / 128GB=0
oppo-reno7-pro-5g|OPPO|OPPO Reno Series|OPPO Reno7 Pro 5G|12GB / 256GB=0
oppo-a6x-5g|OPPO|OPPO A Series|OPPO A6x 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
oppo-a78-5g|OPPO|OPPO A Series|OPPO A78 5G|8GB / 128GB=0
oppo-find-x2|OPPO|OPPO Find Series|OPPO Find X2|12GB / 256GB=0
oppo-reno8-pro-5g|OPPO|OPPO Reno Series|OPPO Reno8 Pro 5G|12GB / 256GB=0
oppo-a3-5g|OPPO|OPPO A Series|OPPO A3 5G|6GB / 128GB=0
oppo-a59-5g|OPPO|OPPO A Series|OPPO A59 5G|4GB / 128GB=0;6GB / 128GB=0
oppo-reno6-pro-5g|OPPO|OPPO Reno Series|OPPO Reno6 Pro 5G|12GB / 256GB=0
oppo-reno6-pro-diwali-edition|OPPO|OPPO Reno Series|OPPO Reno6 Pro Diwali Edition|12GB / 256GB=0
oppo-reno8-5g|OPPO|OPPO Reno Series|OPPO Reno8 5G|8GB / 128GB=0
oppo-a5x-5g|OPPO|OPPO A Series|OPPO A5x 5G|4GB / 64GB=0;128GB=0;256GB=0
oppo-k13x-5g|OPPO|OPPO K Series|OPPO K13x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
oppo-a3x-5g|OPPO|OPPO A Series|OPPO A3x 5G|4GB / 64GB=0;4GB / 128GB=0
oppo-k12x-5g|OPPO|OPPO K Series|OPPO K12x 5G|6GB / 128GB=0;8GB / 256GB=0
oppo-reno7-5g|OPPO|OPPO Reno Series|OPPO Reno7 5G|8GB / 256GB=0
oppo-reno5-pro-5g|OPPO|OPPO Reno Series|OPPO Reno5 Pro 5G|8GB / 128GB=0
oppo-k11x-5g|OPPO|OPPO K Series|OPPO K11x 5G|8GB / 128GB=0;8GB / 256GB=0
oppo-reno7|OPPO|OPPO Reno Series|OPPO Reno7|8GB / 128GB=0
oppo-a78-4g|OPPO|OPPO A Series|OPPO A78 4G|8GB / 128GB=0
oppo-reno6-5g|OPPO|OPPO Reno Series|OPPO Reno6 5G|8GB / 128GB=0
oppo-a74-5g|OPPO|OPPO A Series|OPPO A74 5G|6GB / 128GB=0
oppo-f21-pro-5g|OPPO|OPPO F Series|OPPO F21 Pro 5G|8GB / 128GB=0
oppo-f21s-pro-5g|OPPO|OPPO F Series|OPPO F21s Pro 5G|8GB / 128GB=0
oppo-a53s-5g|OPPO|OPPO A Series|OPPO A53s 5G|6GB / 128GB=0;8GB / 128GB=0
oppo-f19-pro-plus-5g|OPPO|OPPO F Series|OPPO F19 Pro Plus 5G|8GB / 128GB=0
oppo-k10-5g|OPPO|OPPO K Series|OPPO K10 5G|6GB / 128GB=0;8GB / 128GB=0
oppo-find-x|OPPO|OPPO Find Series|OPPO Find X|8GB / 256GB=0
oppo-a58-4g|OPPO|OPPO A Series|OPPO A58 4G|6GB / 128GB=0
oppo-reno4-pro|OPPO|OPPO Reno Series|OPPO Reno4 Pro|8GB / 128GB=0
oppo-f21-pro|OPPO|OPPO F Series|OPPO F21 Pro|8GB / 128GB=0
oppo-f21s-pro|OPPO|OPPO F Series|OPPO F21s Pro|8GB / 128GB=0
oppo-a5x|OPPO|OPPO A Series|OPPO A5X|64GB=0;128GB=0
oppo-a38|OPPO|OPPO A Series|OPPO A38|4GB / 128GB=0
oppo-reno-2z|OPPO|OPPO Reno Series|OPPO Reno 2Z|8GB / 256GB=0
oppo-reno2-f|OPPO|OPPO Reno Series|OPPO Reno2 F|6GB / 256GB=0;8GB / 128GB=0
oppo-f19-pro|OPPO|OPPO F Series|OPPO F19 Pro|8GB / 128GB=0;256GB=0
oppo-reno3-pro|OPPO|OPPO Reno Series|OPPO Reno3 Pro|8GB / 128GB=0;8GB / 256GB=0
oppo-reno-2|OPPO|OPPO Reno Series|OPPO Reno 2|8GB / 256GB=0
oppo-f19|OPPO|OPPO F Series|OPPO F19|6GB / 128GB=0
oppo-f17-pro|OPPO|OPPO F Series|OPPO F17 Pro|8GB / 128GB=0
oppo-a96|OPPO|OPPO A Series|OPPO A96|8GB / 128GB=0
oppo-a76|OPPO|OPPO A Series|OPPO A76|6GB / 128GB=0
oppo-f17|OPPO|OPPO F Series|OPPO F17|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
oppo-reno-10x-zoom|OPPO|OPPO Reno Series|OPPO Reno 10x Zoom|6GB / 128GB=0;8GB / 256GB=0
oppo-a77s|OPPO|OPPO A Series|OPPO A77s|8GB / 128GB=0
oppo-a55|OPPO|OPPO A Series|OPPO A55|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
oppo-k10|OPPO|OPPO K Series|OPPO K10|6GB / 128GB=0;8GB / 128GB=0
oppo-a54|OPPO|OPPO A Series|OPPO A54|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
oppo-a3x-4g|OPPO|OPPO A Series|OPPO A3x 4G|4GB / 64GB=0;4GB / 128GB=0
oppo-f19s|OPPO|OPPO F Series|OPPO F19s|6GB / 128GB=0
oppo-a53|OPPO|OPPO A Series|OPPO A53|4GB / 64GB=0;6GB / 128GB=0
oppo-f15|OPPO|OPPO F Series|OPPO F15|4GB / 128GB=0;8GB / 128GB=0
oppo-reno|OPPO|OPPO Reno Series|OPPO Reno|4GB / 128GB=0;8GB / 128GB=0
oppo-a18|OPPO|OPPO A Series|OPPO A18|4GB / 64GB=0;4GB / 128GB=0
oppo-a52|OPPO|OPPO A Series|OPPO A52|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
oppo-a16|OPPO|OPPO A Series|OPPO A16|3GB / 32GB=0;4GB / 64GB=0
oppo-a31|OPPO|OPPO A Series|OPPO A31|4GB / 64GB=0;6GB / 128GB=0
oppo-f11-pro|OPPO|OPPO F Series|OPPO F11 Pro|6GB / 64GB=0;6GB / 128GB=0
oppo-a57-4g|OPPO|OPPO A Series|OPPO A57 4G|4GB / 64GB=0
oppo-a57s|OPPO|OPPO A Series|OPPO A57s|4GB / 64GB=0
oppo-f11-pro-avenger-edition|OPPO|OPPO F Series|OPPO F11 Pro Avenger Edition|6GB / 128GB=0
oppo-a15s|OPPO|OPPO A Series|OPPO A15s|4GB / 64GB=0;4GB / 128GB=0
oppo-k3|OPPO|OPPO K Series|OPPO K3|6GB / 64GB=0;8GB / 128GB=0
oppo-a9-2020|OPPO|OPPO A Series|OPPO A9 2020|4GB / 128GB=0;8GB / 128GB=0
oppo-r17|OPPO|OPPO R Series|OPPO R17|8GB / 128GB=0
oppo-a77-4g|OPPO|OPPO A Series|OPPO A77 4G|4GB / 64GB=0;128GB=0
oppo-a9|OPPO|OPPO A Series|OPPO A9|4GB / 128GB=0
oppo-a16e|OPPO|OPPO A Series|OPPO A16e|3GB / 32GB=0;4GB / 64GB=0
oppo-a17|OPPO|OPPO A Series|OPPO A17|4GB / 64GB=0
oppo-f11|OPPO|OPPO F Series|OPPO F11|4GB / 128GB=0;6GB / 128GB=0
oppo-a17k|OPPO|OPPO A Series|OPPO A17k|3GB / 64GB=0
oppo-a5-2020|OPPO|OPPO A Series|OPPO A5 2020|3GB / 64GB=0;4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
oppo-a12|OPPO|OPPO A Series|OPPO A12|3GB / 32GB=0;4GB / 64GB=0
oppo-a16k|OPPO|OPPO A Series|OPPO A16K|3GB / 32GB=0;4GB / 64GB=0
oppo-a15|OPPO|OPPO A Series|OPPO A15|2GB / 32GB=0;3GB / 32GB=0
oppo-k1|OPPO|OPPO K Series|OPPO K1|4GB / 64GB=0;6GB / 64GB=0
oppo-a33-2020|OPPO|OPPO A Series|OPPO A33 2020|3GB / 32GB=0
oppo-a5s|OPPO|OPPO A Series|OPPO A5s|2GB / 32GB=0;3GB / 32GB=0;4GB / 64GB=0
oppo-f9-pro|OPPO|OPPO F Series|OPPO F9 Pro|6GB / 64GB=0;6GB / 128GB=0
oppo-a5|OPPO|OPPO A Series|OPPO A5|4GB / 32GB=0;64GB=0
oppo-f9|OPPO|OPPO F Series|OPPO F9|4GB / 64GB=0;6GB / 64GB=0
oppo-f7|OPPO|OPPO F Series|OPPO F7|4GB / 64GB=0;6GB / 128GB=0
oppo-a7|OPPO|OPPO A Series|OPPO A7|3GB / 64GB=0;4GB / 64GB=0
oppo-a11k|OPPO|OPPO A Series|OPPO A11K|2GB / 32GB=0
oppo-a1k|OPPO|OPPO A Series|OPPO A1K|2GB / 32GB=0
oppo-r11|OPPO|OPPO R Series|OPPO R11|4GB / 64GB=0
oppo-f3-plus|OPPO|OPPO F Series|OPPO F3 Plus|4GB / 64GB=0;6GB / 64GB=0
oppo-a3s|OPPO|OPPO A Series|OPPO A3s|2GB / 16GB=0;3GB / 32GB=0;4GB / 64GB=0
oppo-a77|OPPO|OPPO A Series|OPPO A77|4GB / 64GB=0
oppo-f3|OPPO|OPPO F Series|OPPO F3|4GB / 64GB=0
oppo-f5|OPPO|OPPO F Series|OPPO F5|4GB / 32GB=0;6GB / 64GB=0
oppo-a83|OPPO|OPPO A Series|OPPO A83|4GB / 32GB=0;2GB / 16GB=0;4GB / 64GB=0;3GB / 32GB=0
oppo-f1s|OPPO|OPPO F Series|OPPO F1s|3GB / 32GB=0;4GB / 64GB=0
oppo-f5-youth|OPPO|OPPO F Series|OPPO F5 Youth|3GB / 32GB=0
oppo-f1-plus|OPPO|OPPO F Series|OPPO F1 Plus|4GB / 64GB=0
oppo-a57|OPPO|OPPO A Series|OPPO A57|3GB / 32GB=0
oppo-a71-2018|OPPO|OPPO A Series|OPPO A71 2018|3GB / 16GB=0
realme-gt-8-pro|Realme|Realme GT Series|Realme GT 8 Pro|12GB / 256GB=0;16GB / 512GB=0
realme-gt-7-pro|Realme|Realme GT Series|Realme GT 7 Pro|12GB / 256GB=0;16GB / 512GB=0
realme-16-pro-plus-5g|Realme|Realme 16 Series|Realme 16 Pro Plus 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-gt-7|Realme|Realme GT Series|Realme GT 7|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0;16GB / 512GB=0
realme-p4s-5g|Realme|Realme P Series|Realme P4s 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-16-pro-5g|Realme|Realme 16 Series|Realme 16 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-16-5g|Realme|Realme 16 Series|Realme 16 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-gt-7t|Realme|Realme GT Series|Realme GT 7T|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-15-pro-5g|Realme|Realme 15 Series|Realme 15 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-16t-5g|Realme|Realme 16 Series|Realme 16T 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-14-pro-plus-5g|Realme|Realme 14 Series|Realme 14 Pro Plus 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-p4-power-5g|Realme|Realme P Series|Realme P4 Power 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-gt-6|Realme|Realme GT Series|Realme GT 6|8GB / 256GB=0;12GB / 256GB=0;16GB / 512GB=0
realme-16x-5g|Realme|Realme 16 Series|Realme 16X 5G|4GB / 128GB=0;6GB / 128GB=0;6GB / 256GB=0
realme-narzo-power-5g|Realme|Realme Narzo Series|Realme Narzo Power 5G|8GB / 128GB=0;8GB / 256GB=0
realme-15-5g|Realme|Realme 15 Series|Realme 15 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-p4-pro-5g|Realme|Realme P Series|Realme P4 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-gt-6t|Realme|Realme GT Series|Realme GT 6T|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-13-pro-5g|Realme|Realme 13 Series|Realme 13 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-13-pro-plus-5g|Realme|Realme 13 Series|Realme 13 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-15t-5g|Realme|Realme 15 Series|Realme 15T 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-14-pro-5g|Realme|Realme 14 Series|Realme 14 Pro 5G|128GB=0;256GB=0
realme-p4r-5g|Realme|Realme P Series|Realme P4R 5G|4GB / 128GB=0;6GB / 128GB=0;6GB / 256GB=0
realme-12-pro-plus-5g|Realme|Realme 12 Series|Realme 12 Pro Plus 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-11-pro-plus-5g|Realme|Realme 11 Series|Realme 11 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0
realme-p3-ultra-5g|Realme|Realme P Series|Realme P3 Ultra 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-12-pro-5g|Realme|Realme 12 Series|Realme 12 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-11-pro-5g|Realme|Realme 11 Series|Realme 11 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-narzo-60-pro-5g|Realme|Realme Narzo Series|Realme Narzo 60 Pro 5G|8GB / 128GB=0;12GB / 256GB=0;12GB / 1TB=0
realme-14-5g|Realme|Realme 14 Series|Realme 14 5G|8GB / 128GB=0;8GB / 256GB=0
realme-p4-5g|Realme|Realme P Series|Realme P4 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-14-pro-lite-5g|Realme|Realme 14 Series|Realme 14 Pro Lite 5G|128GB=0;256GB=0
realme-p3-pro-5g|Realme|Realme P Series|Realme P3 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-15x-5g|Realme|Realme 15 Series|Realme 15x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-narzo-80-pro-5g|Realme|Realme Narzo Series|Realme Narzo 80 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-14t-5g|Realme|Realme 14 Series|Realme 14T 5G|128GB=0;256GB=0
realme-narzo-90-5g|Realme|Realme Narzo Series|Realme Narzo 90 5G|6GB / 128GB=0;8GB / 128GB=0
realme-13-plus-5g|Realme|Realme 13 Series|Realme 13 Plus 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-12-plus-5g|Realme|Realme 12 Series|Realme 12 Plus 5G|128GB=0;256GB=0
realme-p2-pro-5g|Realme|Realme P Series|Realme P2 Pro 5G|8GB / 128GB=0;12GB / 256GB=0;12GB / 512GB=0
realme-p3-5g|Realme|Realme P Series|Realme P3 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-c83-5g|Realme|Realme C Series|Realme C83 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-c85-5g|Realme|Realme C Series|Realme C85 5G|4GB / 128GB=0;6GB / 128GB=0
realme-13-5g|Realme|Realme 13 Series|Realme 13 5G|128GB=0;256GB=0
realme-narzo-70-pro-5g|Realme|Realme Narzo Series|Realme Narzo 70 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
realme-narzo-100-lite-5g|Realme|Realme Narzo Series|Realme Narzo 100 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-narzo-90x-5g|Realme|Realme Narzo Series|Realme Narzo 90x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-p4x-5g|Realme|Realme P Series|Realme P4x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-12x-5g|Realme|Realme 12 Series|Realme 12x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-12-5g|Realme|Realme 12 Series|Realme 12 5G|6GB / 128GB=0;8GB / 128GB=0
realme-p4-lite-5g|Realme|Realme P Series|Realme P4 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-narzo-70-turbo-5g|Realme|Realme Narzo Series|Realme Narzo 70 Turbo 5G|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
realme-11-5g|Realme|Realme 11 Series|Realme 11 5G|8GB / 128GB=0;8GB / 256GB=0
realme-10-pro-plus-5g|Realme|Realme 10 Series|Realme 10 Pro Plus 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-gt-neo-3-150w|Realme|Realme GT Series|Realme GT NEO 3 150W|12GB / 256GB=0
realme-narzo-60-5g|Realme|Realme Narzo Series|Realme Narzo 60 5G|8GB / 128GB=0;8GB / 256GB=0
realme-14x-5g|Realme|Realme 14 Series|Realme 14x 5G|6GB / 128GB=0;8GB / 128GB=0
realme-p1-5g|Realme|Realme P Series|Realme P1 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-p1-pro-5g|Realme|Realme P Series|Realme P1 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-gt-2-pro|Realme|Realme GT Series|Realme GT 2 Pro|8GB / 128GB=0;12GB / 256GB=0
realme-c100x|Realme|Realme C Series|Realme C100x|4GB / 64GB=0
realme-11x-5g|Realme|Realme 11 Series|Realme 11x 5G|6GB / 128GB=0;8GB / 128GB=0
realme-gt-2|Realme|Realme GT Series|Realme GT 2|8GB / 128GB=0;12GB / 256GB=0
realme-gt-neo-3|Realme|Realme GT Series|Realme GT Neo 3|8GB / 128GB=0;12GB / 256GB=0
realme-c100i|Realme|Realme C Series|Realme C100i|4GB / 64GB=0
realme-p1-speed-5g|Realme|Realme P Series|Realme P1 Speed 5G|8GB / 128GB=0;12GB / 256GB=0
realme-p4-lite|Realme|Realme P Series|Realme P4 Lite|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-p3x-5g|Realme|Realme P Series|Realme P3x 5G|6GB / 128GB=0;8GB / 128GB=0
realme-gt-neo-3t|Realme|Realme GT Series|Realme GT Neo 3T|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-9-pro-plus-5g|Realme|Realme 9 Series|Realme 9 Pro Plus 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-narzo-60x-5g|Realme|Realme Narzo Series|Realme Narzo 60X 5G|4GB / 128GB=0;6GB / 128GB=0
realme-c75-5g|Realme|Realme C Series|Realme C75 5G|4GB / 128GB=0;6GB / 128GB=0
realme-narzo-70-5g|Realme|Realme Narzo Series|Realme Narzo 70 5G|6GB / 128GB=0;8GB / 128GB=0
realme-gt-neo-2|Realme|Realme GT Series|Realme GT Neo 2|8GB / 128GB=0;12GB / 256GB=0
realme-narzo-80x-5g|Realme|Realme Narzo Series|Realme Narzo 80x 5G|6GB / 128GB=0;8GB / 128GB=0
realme-x7-max-5g|Realme|Realme X Series|Realme X7 Max 5G|8GB / 128GB=0;12GB / 256GB=0
realme-10-pro-5g|Realme|Realme 10 Series|Realme 10 Pro 5G|6GB / 128GB=0;8GB / 128GB=0
realme-gt-master-edition|Realme|Realme GT Series|Realme GT Master Edition|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-gt-5g|Realme|Realme GT Series|Realme GT 5G|8GB / 128GB=0;12GB / 256GB=0
realme-c73-5g|Realme|Realme C Series|Realme C73 5G|4GB / 64GB=0;4GB / 128GB=0
realme-9-pro-5g|Realme|Realme 9 Series|Realme 9 Pro 5G|6GB / 128GB=0;8GB / 128GB=0
realme-c67-5g|Realme|Realme C Series|Realme C67 5G|4GB / 128GB=0;6GB / 128GB=0
realme-narzo-50-pro-5g|Realme|Realme Narzo Series|Realme Narzo 50 Pro 5G|6GB / 128GB=0;8GB / 128GB=0
realme-x7-pro|Realme|Realme X Series|Realme X7 Pro|8GB / 128GB=0
realme-c65-5g|Realme|Realme C Series|Realme C65 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-narzo-70x-5g|Realme|Realme Narzo Series|Realme Narzo 70x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-8s-5g|Realme|Realme 8 Series|Realme 8s 5G|6GB / 128GB=0;8GB / 128GB=0
realme-9-5g|Realme|Realme 9 Series|Realme 9 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-9-5g-se|Realme|Realme 9 Series|Realme 9 5G SE|6GB / 128GB=0;8GB / 128GB=0
realme-x7|Realme|Realme X Series|Realme X7|6GB / 128GB=0;8GB / 128GB=0
realme-8-5g|Realme|Realme 8 Series|Realme 8 5G|4GB / 64GB=0;4GB / 128GB=0;8GB / 128GB=0
realme-narzo-30-pro-5g|Realme|Realme Narzo Series|Realme Narzo 30 Pro 5G|6GB / 64GB=0;8GB / 128GB=0
realme-narzo-80-lite-5g|Realme|Realme Narzo Series|Realme Narzo 80 Lite 5G|4GB / 128GB=0;6GB / 128GB=0
realme-p3-lite-5g|Realme|Realme P Series|Realme P3 Lite 5G|4GB / 128GB=0;6GB / 128GB=0
realme-x50-pro|Realme|Realme X Series|Realme X50 Pro|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
realme-narzo-30-5g|Realme|Realme Narzo Series|Realme Narzo 30 5G|4GB / 64GB=0;6GB / 128GB=0
realme-c55|Realme|Realme C Series|Realme C55|4GB / 64GB=0;6GB / 64GB=0;8GB / 128GB=0
realme-narzo-n65-5g|Realme|Realme Narzo Series|Realme Narzo N65 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-c63-5g|Realme|Realme C Series|Realme C63 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-narzo-n55|Realme|Realme Narzo Series|Realme Narzo N55|4GB / 64GB=0;6GB / 128GB=0
realme-narzo-n53|Realme|Realme Narzo Series|Realme Narzo N53|4GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-8-pro|Realme|Realme 8 Series|Realme 8 Pro|6GB / 128GB=0;8GB / 128GB=0
realme-narzo-50-5g|Realme|Realme Narzo Series|Realme Narzo 50 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-9|Realme|Realme 9 Series|Realme 9|6GB / 128GB=0;8GB / 128GB=0
realme-9i-5g|Realme|Realme 9 Series|Realme 9i 5G|4GB / 64GB=0;6GB / 128GB=0
realme-7-pro|Realme|Realme 7 Series|Realme 7 Pro|6GB / 128GB=0;8GB / 128GB=0
realme-8|Realme|Realme 8 Series|Realme 8|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-x3-superzoom|Realme|Realme X Series|Realme X3 SuperZoom|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
realme-narzo-80-lite-4g|Realme|Realme Narzo Series|Realme Narzo 80 Lite 4G|4GB / 64GB=0;6GB / 128GB=0
realme-x3|Realme|Realme X Series|Realme X3|6GB / 128GB=0;8GB / 128GB=0
realme-10|Realme|Realme 10 Series|Realme 10|4GB / 64GB=0;8GB / 128GB=0
realme-x2-pro|Realme|Realme X Series|Realme X2 Pro|6GB / 64GB=0;8GB / 128GB=0;12GB / 256GB=0
realme-c53|Realme|Realme C Series|Realme C53|4GB / 64GB=0;6GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-6-pro|Realme|Realme 6 Series|Realme 6 Pro|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-c51|Realme|Realme C Series|Realme C51|4GB / 64GB=0;4GB / 128GB=0
realme-7|Realme|Realme 7 Series|Realme 7|6GB / 64GB=0;8GB / 128GB=0
realme-c63|Realme|Realme C Series|Realme C63|64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-6|Realme|Realme 6 Series|Realme 6|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
realme-x2|Realme|Realme X Series|Realme X2|4GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
realme-c71|Realme|Realme C Series|Realme C71|6GB / 128GB=0
realme-9i|Realme|Realme 9 Series|Realme 9i|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-x|Realme|Realme X Series|Realme X|4GB / 128GB=0;8GB / 128GB=0
realme-narzo-50|Realme|Realme Narzo Series|Realme Narzo 50|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-c33-2023|Realme|Realme C Series|Realme C33 2023|64GB=0;128GB=0
realme-c35|Realme|Realme C Series|Realme C35|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-xt|Realme|Realme X Series|Realme XT|4GB / 64GB=0;6GB / 64GB=0;8GB / 128GB=0
realme-narzo-30|Realme|Realme Narzo Series|Realme Narzo 30|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
realme-8i|Realme|Realme 8 Series|Realme 8i|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-narzo-n63|Realme|Realme Narzo Series|Realme Narzo N63|4GB / 64GB=0;4GB / 128GB=0
realme-c61|Realme|Realme C Series|Realme C61|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
realme-narzo-20-pro|Realme|Realme Narzo Series|Realme Narzo 20 Pro|6GB / 64GB=0;8GB / 128GB=0
realme-narzo-20|Realme|Realme Narzo Series|Realme Narzo 20|64GB=0;128GB=0
realme-c25y|Realme|Realme C Series|Realme C25Y|64GB=0;128GB=0
realme-narzo-n61|Realme|Realme Narzo Series|Realme Narzo N61|4GB / 64GB=0;6GB / 128GB=0
realme-7i|Realme|Realme 7 Series|Realme 7i|4GB / 64GB=0;4GB / 128GB=0
realme-6i|Realme|Realme 6 Series|Realme 6i|4GB / 64GB=0;6GB / 64GB=0
realme-narzo-50a|Realme|Realme Narzo Series|Realme Narzo 50A|4GB / 64GB=0;4GB / 128GB=0
realme-narzo-50a-prime|Realme|Realme Narzo Series|Realme Narzo 50A Prime|4GB / 64GB=0;4GB / 128GB=0
realme-c33|Realme|Realme C Series|Realme C33|3GB / 32GB=0;4GB / 64GB=0
realme-5i|Realme|Realme 5 Series|Realme 5i|4GB / 64GB=0;4GB / 128GB=0
realme-narzo-30a|Realme|Realme Narzo Series|Realme Narzo 30A|3GB / 32GB=0;4GB / 64GB=0
realme-5-pro|Realme|Realme 5 Series|Realme 5 Pro|4GB / 64GB=0;6GB / 64GB=0;8GB / 128GB=0
realme-narzo-10|Realme|Realme Narzo Series|Realme Narzo 10|4GB / 128GB=0
realme-c25s|Realme|Realme C Series|Realme C25s|4GB / 64GB=0;4GB / 128GB=0
realme-c15|Realme|Realme C Series|Realme C15|3GB / 32GB=0;3GB / 64GB=0;4GB / 64GB=0
realme-narzo-20a|Realme|Realme Narzo Series|Realme Narzo 20A|3GB / 32GB=0;4GB / 64GB=0
realme-narzo-50i|Realme|Realme Narzo Series|Realme Narzo 50i|2GB / 32GB=0;4GB / 64GB=0
realme-3-pro|Realme|Realme 3 Series|Realme 3 Pro|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
realme-c12|Realme|Realme C Series|Realme C12|3GB / 32GB=0;4GB / 64GB=0
realme-c3|Realme|Realme C Series|Realme C3|3GB / 32GB=0;4GB / 64GB=0
realme-5s|Realme|Realme 5 Series|Realme 5s|4GB / 64GB=0;4GB / 128GB=0
realme-c25|Realme|Realme C Series|Realme C25|4GB / 64GB=0;4GB / 128GB=0
realme-5|Realme|Realme 5 Series|Realme 5|3GB / 32GB=0;4GB / 64GB=0;4GB / 128GB=0
realme-narzo-50i-prime|Realme|Realme Narzo Series|Realme Narzo 50i Prime|3GB / 32GB=0;4GB / 64GB=0
realme-c11-2021|Realme|Realme C Series|Realme C11 2021|2GB / 32GB=0;4GB / 64GB=0
realme-narzo-10a|Realme|Realme Narzo Series|Realme Narzo 10A|3GB / 32GB=0;4GB / 64GB=0
realme-c21|Realme|Realme C Series|Realme C21|3GB / 32GB=0;4GB / 64GB=0
realme-c21y|Realme|Realme C Series|Realme C21Y|3GB / 32GB=0;4GB / 64GB=0
realme-c31|Realme|Realme C Series|Realme C31|3GB / 32GB=0;4GB / 64GB=0
realme-c15-qualcomm-edition|Realme|Realme C Series|Realme C15 Qualcomm Edition|3GB / 32GB=0;4GB / 64GB=0
realme-c30s|Realme|Realme C Series|Realme C30s|2GB / 32GB=0;4GB / 64GB=0
realme-c30|Realme|Realme C Series|Realme C30|2GB / 32GB=0;3GB / 32GB=0
realme-3|Realme|Realme 3 Series|Realme 3|3GB / 32GB=0;3GB / 64GB=0;4GB / 64GB=0
realme-1|Realme|Realme 1 Series|Realme 1|3GB / 32GB=0;4GB / 64GB=0;6GB / 128GB=0
realme-2-pro|Realme|Realme 2 Series|Realme 2 Pro|4GB / 64GB=0;6GB / 64GB=0;8GB / 128GB=0
realme-c11|Realme|Realme C Series|Realme C11|2GB / 32GB=0;3GB / 32GB=0
realme-2|Realme|Realme 2 Series|Realme 2|3GB / 32GB=0;4GB / 64GB=0
realme-3i|Realme|Realme 3 Series|Realme 3i|3GB / 32GB=0;4GB / 64GB=0
realme-u1|Realme|Realme U Series|Realme U1|3GB / 32GB=0;3GB / 64GB=0;4GB / 64GB=0
realme-c20|Realme|Realme C Series|Realme C20|2GB / 32GB=0
realme-c2|Realme|Realme C Series|Realme C2|2GB / 16GB=0;2GB / 32GB=0;3GB / 32GB=0
realme-c1-2019|Realme|Realme C Series|Realme C1 2019|2GB / 32GB=0;3GB / 32GB=0
realme-c1|Realme|Realme C Series|Realme C1|2GB / 16GB=0;3GB / 32GB=0
xiaomi-17-ultra|Xiaomi|17 Series|Xiaomi 17 Ultra|16GB / 512GB=0
xiaomi-15-ultra|Xiaomi|15 Series|Xiaomi 15 Ultra|16GB / 512GB=0
xiaomi-17|Xiaomi|17 Series|Xiaomi 17|256GB=0;512GB=0
xiaomi-17t|Xiaomi|17 Series|Xiaomi 17T|256GB=0;512GB=0
xiaomi-14-ultra|Xiaomi|14 Series|Xiaomi 14 Ultra|16GB / 512GB=0
xiaomi-15|Xiaomi|15 Series|Xiaomi 15|12GB / 512GB=0
xiaomi-redmi-note-17-pro-max-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 17 Pro Max 5G|8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-note-15-pro-plus-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 15 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
mi14|Xiaomi|14 Series|Xiaomi 14|12GB / 512GB=0
xiaomi-redmi-turbo-5|Xiaomi|Redmi Turbo Series|Xiaomi Redmi Turbo 5|8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-note-17-pro-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 17 Pro 5G|128GB=0;8GB / 256GB=0
xiaomi-13-pro-5g|Xiaomi|13 Series|Xiaomi 13 Pro 5G|12GB / 256GB=0
xiaomi-redmi-note-15-pro-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 15 Pro 5G|128GB=0;256GB=0
xiaomi-redmi-note-14-pro-plus-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 14 Pro Plus 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 512GB=0
xiaomi-redmi-note-17-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 17 5G|6GB / 128GB=0;8GB / 128GB=0
xiaomi-14-civi|Xiaomi|14 Series|Xiaomi 14 CIVI|8GB / 256GB=0;12GB / 512GB=0
xiaomi-redmi-note-15-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 15 5G|128GB=0;256GB=0
xiaomi-redmi-note-15-se-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 15 SE 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-note-13-pro-plus-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 13 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
xiaomi-redmi-17-5g|Xiaomi|Redmi 17 Series|Xiaomi Redmi 17 5G|6GB / 128GB=0;8GB / 128GB=0
mi-11-ultra|Xiaomi|Xiaomi Mi|Mi 11 Ultra|12GB / 256GB=0
xiaomi-redmi-note-14-pro-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 14 Pro 5G|128GB=0;256GB=0
xiaomi-12-pro-5g|Xiaomi|12 Series|Xiaomi 12 Pro 5G|8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-note-13-pro-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 13 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-15-5g|Xiaomi|Redmi 15 Series|Xiaomi Redmi 15 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-note-14-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 14 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-note-12-pro-plus-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 12 Pro Plus 5G|8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-note-12-pro-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 12 Pro 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-15c-5g|Xiaomi|Redmi 15 Series|Xiaomi Redmi 15C 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-15a-5g|Xiaomi|Redmi 15 Series|Xiaomi Redmi 15A 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-13-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 13 5G|6GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
xiaomi-mi-10|Xiaomi|Xiaomi Mi|Xiaomi Mi 10|128GB=0;256GB=0
xiaomi-redmi-12-5g|Xiaomi|12 Series|Xiaomi Redmi 12 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-note-12-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 12 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
xiaomi-11t-pro-5g|Xiaomi|11 Series|Xiaomi 11T Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
xiaomi-redmi-note-14-se-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 14 SE 5G|6GB / 128GB=0
xiaomi-redmi-13-5g|Xiaomi|13 Series|Xiaomi Redmi 13 5G|6GB / 128GB=0;8GB / 128GB=0
xiaomi-11-lite-ne-5g|Xiaomi|11 Series|Xiaomi 11 Lite NE 5G|6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-k50i-5g|Xiaomi|Redmi K Series|Xiaomi Redmi K50i 5G|6GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-14c-5g|Xiaomi|Redmi 14 Series|Xiaomi Redmi 14C 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-a7-pro-5g|Xiaomi|Redmi A Series|Xiaomi Redmi A7 Pro 5G|64GB=0;128GB=0
xiaomi-redmi-note-11-pro-plus-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 11 Pro Plus 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-13c-5g|Xiaomi|13 Series|Xiaomi Redmi 13C 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
xiaomi-11i-hypercharge-5g|Xiaomi|11 Series|Xiaomi 11i HyperCharge 5G|6GB / 128GB=0;8GB / 128GB=0
xiaomi-11i-5g|Xiaomi|11 Series|Xiaomi 11i 5G|6GB / 128GB=0;8GB / 128GB=0
xiaomi-mi-11x-pro|Xiaomi|Xiaomi Mi|Xiaomi Mi 11X Pro|128GB=0;256GB=0
xiaomi-mi-11x|Xiaomi|Xiaomi Mi|Xiaomi Mi 11X|6GB / 128GB=0;8GB / 128GB=0
xiaomi-mi-10i|Xiaomi|Xiaomi Mi|Xiaomi Mi 10i|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
mi-10t-pro|Xiaomi|Xiaomi Mi|Mi 10T Pro|8GB / 128GB=0
xiaomi-redmi-a7-pro|Xiaomi|Redmi A Series|Xiaomi Redmi A7 Pro|4GB / 64GB=0
xiaomi-redmi-note-11t-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 11T 5G|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-mi-10t|Xiaomi|Xiaomi Mi|Xiaomi Mi 10T|6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-a7|Xiaomi|Redmi A Series|Xiaomi Redmi A7|3GB / 64GB=0
xiaomi-redmi-note-12|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 12|64GB=0;128GB=0
xiaomi-redmi-a4-5g|Xiaomi|Redmi A Series|Xiaomi Redmi A4 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-10t-5g|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10T 5G|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-12|Xiaomi|12 Series|Xiaomi Redmi 12|4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-11-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 11 Pro|6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-13c|Xiaomi|13 Series|Xiaomi Redmi 13C|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-note-10-pro-max|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10 Pro Max|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-11-prime-5g|Xiaomi|11 Series|Xiaomi Redmi 11 Prime 5G|4GB / 64GB=0;6GB / 128GB=0
xiaomi-mi-11-lite|Xiaomi|Xiaomi Mi|Xiaomi Mi 11 Lite|6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-k20-pro|Xiaomi|Redmi K Series|Xiaomi Redmi K20 Pro|6GB / 128GB=0;8GB / 256GB=0
xiaomi-redmi-12c|Xiaomi|12 Series|Xiaomi Redmi 12C|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-10-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10 Pro|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-note-11s|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 11S|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-black-shark-2|Xiaomi|Other Xiaomi Series|Xiaomi Black Shark 2|6GB / 128GB=0;12GB / 256GB=0
xiaomi-redmi-note-9-pro-max|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 9 Pro Max|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-note-11|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 11|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-a5|Xiaomi|Redmi A Series|Xiaomi Redmi A5|3GB / 64GB=0;4GB / 128GB=0
redmi-10-power|Xiaomi|Redmi 10 Series|Redmi 10 Power|8GB / 128GB=0
xiaomi-redmi-note-9-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 9 Pro|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-8-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 8 Pro|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-a3|Xiaomi|Redmi A Series|Xiaomi Redmi A3|3GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-note-9|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 9|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
redmi-note-11se|Xiaomi|Redmi Note Series|Redmi Note 11SE|6GB / 64GB=0
xiaomi-redmi-k20|Xiaomi|Redmi K Series|Xiaomi Redmi K20|64GB=0;128GB=0
xiaomi-redmi-note-10s|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10S|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
xiaomi-redmi-note-10|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-10-prime|Xiaomi|Redmi 10 Series|Xiaomi Redmi 10 Prime|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-11-prime|Xiaomi|11 Series|Xiaomi Redmi 11 Prime|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-note-10-lite|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 10 Lite|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-10|Xiaomi|Redmi 10 Series|Xiaomi Redmi 10|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-10-prime-2022|Xiaomi|Redmi 10 Series|Xiaomi Redmi 10 Prime 2022|64GB=0;128GB=0
xiaomi-redmi-a3x|Xiaomi|Redmi A Series|Xiaomi Redmi A3x|3GB / 64GB=0;6GB / 64GB=0;4GB / 128GB=0
xiaomi-redmi-note-7-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 7 Pro|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
xiaomi-mi-a3|Xiaomi|Xiaomi Mi|Xiaomi Mi A3|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-a2-plus|Xiaomi|Redmi A Series|Xiaomi Redmi A2 Plus|2GB / 32GB=0;4GB / 64GB=0;4GB / 128GB=0
xiaomi-redmi-note-8|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 8|3GB / 32GB=0;4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-9-power|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9 Power|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
xiaomi-redmi-9-prime|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9 Prime|64GB=0;128GB=0
xiaomi-redmi-a2|Xiaomi|Redmi A Series|Xiaomi Redmi A2|2GB / 32GB=0;2GB / 64GB=0;4GB / 64GB=0
xiaomi-redmi-10a|Xiaomi|Redmi 10 Series|Xiaomi Redmi 10A|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-note-7s|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 7S|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-9i|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9i|64GB=0;128GB=0
xiaomi-redmi-9|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9|64GB=0;128GB=0
redmi-8|Xiaomi|Redmi 8 Series|Redmi 8|4GB / 64GB=0
xiaomi-redmi-9-activ|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9 Activ|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-note-7|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 7|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-note-6-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 6 Pro|4GB / 64GB=0;6GB / 64GB=0
xiaomi-redmi-8a-dual|Xiaomi|Redmi 8 Series|Xiaomi Redmi 8A Dual|2GB / 32GB=0;3GB / 32GB=0;3GB / 64GB=0
xiaomi-redmi-9a|Xiaomi|Redmi 9 Series|Xiaomi Redmi 9A|2GB / 32GB=0;3GB / 32GB=0
xiaomi-redmi-a1-plus|Xiaomi|Redmi A Series|Xiaomi Redmi A1 Plus|2GB / 32GB=0;3GB / 32GB=0
mi-mix-2|Xiaomi|Xiaomi Mi|Mi Mix 2|6GB / 128GB=0
xiaomi-mi-a2|Xiaomi|Xiaomi Mi|Xiaomi Mi A2|4GB / 64GB=0;6GB / 128GB=0
xiaomi-redmi-note-5-pro|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 5 Pro|4GB / 64GB=0;6GB / 64GB=0
xiaomi-redmi-7|Xiaomi|Redmi 7 Series|Xiaomi Redmi 7|2GB / 16GB=0;2GB / 32GB=0;3GB / 32GB=0;3GB / 64GB=0
xiaomi-redmi-8a|Xiaomi|Redmi 8 Series|Xiaomi Redmi 8A|2GB / 32GB=0;3GB / 32GB=0
xiaomi-redmi-a1|Xiaomi|Redmi A Series|Xiaomi Redmi A1|2GB / 32GB=0
xiaomi-redmi-y3|Xiaomi|Redmi Y Series|Xiaomi Redmi Y3|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-6-pro|Xiaomi|Redmi 6 Series|Xiaomi Redmi 6 Pro|3GB / 32GB=0;4GB / 64GB=0;6GB / 64GB=0
xiaomi-redmi-y2|Xiaomi|Redmi Y Series|Xiaomi Redmi Y2|3GB / 32GB=0;4GB / 64GB=0
xiaomi-mi-max-2|Xiaomi|Xiaomi Mi|Xiaomi Mi Max 2|32GB=0;64GB=0;128GB=0
xiaomi-redmi-note-5|Xiaomi|Redmi Note Series|Xiaomi Redmi Note 5|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-5|Xiaomi|Redmi 5 Series|Xiaomi Redmi 5|2GB / 16GB=0;3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-6|Xiaomi|Redmi 6 Series|Xiaomi Redmi 6|32GB=0;64GB=0
xiaomi-redmi-7a|Xiaomi|Redmi 7 Series|Xiaomi Redmi 7A|2GB / 32GB=0;3GB / 32GB=0;2GB / 16GB=0
xiaomi-redmi-6a|Xiaomi|Redmi 6 Series|Xiaomi Redmi 6A|32GB=0;16GB=0
xiaomi-redmi-y1|Xiaomi|Redmi Y Series|Xiaomi Redmi Y1|3GB / 32GB=0;4GB / 64GB=0
xiaomi-redmi-5a|Xiaomi|Redmi 5 Series|Xiaomi Redmi 5A|2GB / 16GB=0;3GB / 32GB=0
redmi-y1-lite|Xiaomi|Redmi Y Series|Redmi Y1 Lite|2GB / 16GB=0
xiaomi-redmi-go|Xiaomi|Other Xiaomi Series|Xiaomi Redmi Go|8GB=0;16GB=0
poco-x8-pro-max-5g|POCO|POCO X Series|Poco X8 Pro Max 5G|256GB=0;512GB=0
poco-x8-pro|POCO|POCO X Series|POCO X8 Pro|8GB / 256GB=0;12GB / 256GB=0
poco-f7-5g|POCO|POCO F Series|POCO F7 5G|256GB=0;512GB=0
poco-x7-pro-5g|POCO|POCO X Series|POCO X7 Pro 5G|8GB / 256GB=0;12GB / 256GB=0
poco-m8-5g|POCO|POCO M Series|POCO M8 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
poco-x6-pro-5g|POCO|POCO X Series|POCO X6 Pro 5G|8GB / 256GB=0;12GB / 512GB=0
poco-f6-5g|POCO|POCO F Series|POCO F6 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
poco-f5-5g|POCO|POCO F Series|POCO F5 5G|8GB / 256GB=0;12GB / 256GB=0
poco-x6-5g|POCO|POCO X Series|POCO X6 5G|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
poco-x7-5g|POCO|POCO X Series|POCO X7 5G|128GB=0;256GB=0
poco-x5-pro-5g|POCO|POCO X Series|POCO X5 Pro 5G|6GB / 128GB=0;8GB / 256GB=0
poco-x5-5g|POCO|POCO X Series|POCO X5 5G|6GB / 128GB=0;8GB / 256GB=0
poco-c85-5g|POCO|POCO C Series|POCO C85 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-m7-pro-5g|POCO|POCO M Series|POCO M7 Pro 5G|6GB / 128GB=0;8GB / 256GB=0
poco-m7-plus-5g|POCO|POCO M Series|POCO M7 Plus 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-x6-neo-5g|POCO|POCO X Series|POCO X6 Neo 5G|8GB / 128GB=0;12GB / 256GB=0
poco-m6-pro-5g|POCO|POCO M Series|POCO M6 Pro 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
poco-c85x|POCO|POCO C Series|POCO C85x|4GB / 64GB=0;4GB / 128GB=0
poco-f3-gt|POCO|POCO F Series|POCO F3 GT|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
poco-f4-5g|POCO|POCO F Series|POCO F4 5G|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
poco-x4-pro-5g|POCO|POCO X Series|POCO X4 Pro 5G|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-c81|POCO|POCO C Series|POCO C81|4GB / 64GB=0
poco-m6-plus-5g|POCO|POCO M Series|POCO M6 Plus 5G|6GB / 128GB=0;8GB / 128GB=0
poco-m4-pro-5g|POCO|POCO M Series|POCO M4 Pro 5G|4GB / 64GB=0;8GB / 128GB=0;6GB / 128GB=0
poco-c81x|POCO|POCO C Series|POCO C81X|3GB / 64GB=0
poco-m7-5g|POCO|POCO M Series|POCO M7 5G|6GB / 128GB=0;8GB / 128GB=0
poco-m3-pro-5g|POCO|POCO M Series|POCO M3 Pro 5G|4GB / 64GB=0;6GB / 128GB=0
poco-m6-5g|POCO|POCO M Series|POCO M6 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
poco-c75-5g|POCO|POCO C Series|POCO C75 5G|4GB / 64GB=0;128GB=0
poco-m4-5g|POCO|POCO M Series|POCO M4 5G|4GB / 64GB=0;6GB / 128GB=0
poco-c65|POCO|POCO C Series|POCO C65|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
poco-m4-pro|POCO|POCO M Series|POCO M4 Pro|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-x3-pro|POCO|POCO X Series|POCO X3 Pro|6GB / 128GB=0;8GB / 128GB=0
poco-c55|POCO|POCO C Series|POCO C55|4GB / 64GB=0;6GB / 128GB=0
poco-c61|POCO|POCO C Series|POCO C61|4GB / 64GB=0;6GB / 128GB=0
poco-x3|POCO|POCO X Series|POCO X3|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-m2-pro|POCO|POCO M Series|POCO M2 Pro|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
poco-c51|POCO|POCO C Series|POCO C51|4GB / 64GB=0;6GB / 128GB=0
poco-x2|POCO|POCO X Series|POCO X2|6GB / 64GB=0;6GB / 128GB=0;8GB / 256GB=0
poco-c50|POCO|POCO C Series|POCO C50|2GB / 32GB=0;3GB / 32GB=0
poco-m3|POCO|POCO M Series|POCO M3|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
poco-c71|POCO|POCO C Series|POCO C71|4GB / 64GB=0;6GB / 128GB=0
poco-m2|POCO|POCO M Series|POCO M2|6GB / 64GB=0;6GB / 128GB=0;8GB / 128GB=0
poco-m5|POCO|POCO M Series|POCO M5|4GB / 64GB=0;6GB / 128GB=0
poco-c31|POCO|POCO C Series|POCO C31|3GB / 32GB=0;4GB / 64GB=0
poco-f1|POCO|POCO F Series|POCO F1|6GB / 64GB=0;6GB / 128GB=0;8GB / 256GB=0
poco-c3|POCO|POCO C Series|POCO C3|3GB / 32GB=0;4GB / 64GB=0
poco-m2-reloaded|POCO|POCO M Series|POCO M2 Reloaded|4GB / 64GB=0
iqoo-15-5g|iQOO|iQOO Number Series|iQOO 15 5G|12GB / 256GB=0;16GB / 512GB=0
iqoo-15r|iQOO|iQOO Number Series|iQOO 15R|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
iqoo-z11-5g|iQOO|iQOO Z Series|iQOO Z11 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-13-5g|iQOO|iQOO Number Series|iQOO 13 5G|12GB / 256GB=0;16GB / 512GB=0
iqoo-12-5g|iQOO|iQOO Number Series|iQOO 12 5G|12GB / 256GB=0;16GB / 256GB=0;16GB / 512GB=0
iqoo-neo-10|iQOO|iQOO Neo Series|iQOO Neo 10|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;16GB / 512GB=0
iqoo-neo-10r-5g|iQOO|iQOO Neo Series|iQOO Neo 10R 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-neo-9-pro-5g|iQOO|iQOO Neo Series|iQOO Neo 9 Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-z11xa-5g|iQOO|iQOO Z Series|iQOO Z11xa 5G|8GB / 128GB=0
iqoo-11-5g|iQOO|iQOO Number Series|iQOO 11 5G|8GB / 256GB=0;16GB / 256GB=0
iqoo-z10-5g|iQOO|iQOO Z Series|iQOO Z10 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-neo-7-pro-5g|iQOO|iQOO Neo Series|iQOO Neo 7 Pro 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-9-pro-5g|iQOO|iQOO Number Series|iQOO 9 Pro 5G|8GB / 256GB=0;12GB / 256GB=0
iqoo-z11x-5g|iQOO|iQOO Z Series|iQOO Z11x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
iqoo-z11-lite-5g|iQOO|iQOO Z Series|iQOO Z11 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;6GB / 256GB=0
iqoo-z7-pro-5g|iQOO|iQOO Z Series|iQOO Z7 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
iqoo-z10r-5g|iQOO|iQOO Z Series|iQOO Z10R 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-9t-5g|iQOO|iQOO Number Series|iQOO 9T 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-z9s-pro-5g|iQOO|iQOO Z Series|iQOO Z9s Pro 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-z9s-5g|iQOO|iQOO Z Series|iQOO Z9s 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-9-se-5g|iQOO|iQOO Number Series|iQOO 9 SE 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-z10x-5g|iQOO|iQOO Z Series|iQOO Z10x 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
iqoo-9-5g|iQOO|iQOO Number Series|iQOO 9 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-neo-7-5g|iQOO|iQOO Neo Series|iQOO Neo 7 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-neo-6-5g|iQOO|iQOO Neo Series|iQOO Neo 6 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-7-legend-5g|iQOO|iQOO Number Series|iQOO 7 Legend 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-7-5g|iQOO|iQOO Number Series|iQOO 7 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
iqoo-z7-5g|iQOO|iQOO Z Series|iQOO Z7 5G|6GB / 128GB=0;8GB / 128GB=0
iqoo-z10-lite-5g|iQOO|iQOO Z Series|iQOO Z10 Lite 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
iqoo-z9x-5g|iQOO|iQOO Z Series|iQOO Z9x 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
iqoo-z7s-5g|iQOO|iQOO Z Series|iQOO Z7s 5G|6GB / 128GB=0;8GB / 128GB=0
iqoo-z6-pro-5g|iQOO|iQOO Z Series|iQOO Z6 Pro 5G|6GB / 128GB=0;8GB / 128GB=0;12GB / 256GB=0
iqoo-z5-5g|iQOO|iQOO Z Series|iQOO Z5 5G|8GB / 128GB=0;12GB / 256GB=0
iqoo-z9-5g|iQOO|iQOO Z Series|iQOO Z9 5G|128GB=0;256GB=0
iqoo-z6-5g|iQOO|iQOO Z Series|iQOO Z6 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
iqoo-z3-5g|iQOO|iQOO Z Series|iQOO Z3 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
iqoo-z9-lite-5g|iQOO|iQOO Z Series|iQOO Z9 Lite 5G|4GB / 128GB=0;6GB / 128GB=0
iqoo-z6-lite-5g|iQOO|iQOO Z Series|iQOO Z6 Lite 5G|4GB / 64GB=0;6GB / 128GB=0
iqoo-3-5g|iQOO|iQOO Number Series|iQOO 3 5G|12GB / 256GB=0
iqoo-z6|iQOO|iQOO Z Series|iQOO Z6|4GB / 128GB=0;6GB / 128GB=0;8GB / 128GB=0
iqoo-3|iQOO|iQOO Number Series|iQOO 3|128GB=0;256GB=0
motorola-moto-razr-60-ultra|Motorola|Moto Razr Series|Motorola Moto Razr 60 Ultra|16GB / 512GB=0
motorola-moto-signature|Motorola|Moto Signature Series|Motorola Moto Signature|12GB / 256GB=0;16GB / 512GB=0;16GB / 1TB=0
motorola-moto-edge-70-pro-plus|Motorola|Moto Edge Series|Motorola Moto Edge 70 Pro Plus|12GB / 256GB=0
motorola-moto-razr-50-ultra|Motorola|Moto Razr Series|Motorola Moto Razr 50 Ultra|12GB / 512GB=0
motorola-moto-edge-70-pro|Motorola|Moto Edge Series|Motorola Moto Edge 70 Pro|8GB / 256GB=0;12GB / 256GB=0
motorola-moto-razr-60|Motorola|Moto Razr Series|Motorola Moto Razr 60|8GB / 256GB=0
motorola-moto-edge-50-ultra|Motorola|Moto Edge Series|Motorola Moto Edge 50 Ultra|12GB / 512GB=0
motorola-moto-edge-70-fusion|Motorola|Moto Edge Series|Motorola Moto Edge 70 Fusion|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
motorola-moto-edge-60-pro|Motorola|Moto Edge Series|Motorola Moto Edge 60 Pro|8GB / 256GB=0;12GB / 256GB=0;16GB / 512GB=0
motorola-moto-razr-50|Motorola|Moto Razr Series|Motorola Moto Razr 50|8GB / 256GB=0
motorola-moto-razr-40-ultra|Motorola|Moto Razr Series|Motorola Moto Razr 40 Ultra|8GB / 256GB=0
motorola-moto-edge-70|Motorola|Moto Edge Series|Motorola Moto Edge 70|8GB / 256GB=0
motorola-moto-edge-60-fusion|Motorola|Moto Edge Series|Motorola Moto Edge 60 Fusion|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
motorola-moto-edge-50-pro|Motorola|Moto Edge Series|Motorola Moto Edge 50 Pro|8GB / 256GB=0;12GB / 256GB=0
motorola-moto-edge-60|Motorola|Moto Edge Series|Motorola Moto Edge 60|12GB / 256GB=0
motorola-moto-edge-50-neo|Motorola|Moto Edge Series|Motorola Moto Edge 50 Neo|8GB / 256GB=0
motorola-moto-edge-50|Motorola|Moto Edge Series|Motorola Moto Edge 50|8GB / 256GB=0
motorola-moto-edge-50-fusion|Motorola|Moto Edge Series|Motorola Moto Edge 50 Fusion|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-razr-40|Motorola|Moto Razr Series|Motorola Moto Razr 40|8GB / 256GB=0
motorola-moto-edge-60-stylus|Motorola|Moto Edge Series|Motorola Moto Edge 60 Stylus|8GB / 256GB=0
motorola-moto-edge-40|Motorola|Moto Edge Series|Motorola Moto Edge 40|8GB / 256GB=0
motorola-moto-edge-40-neo|Motorola|Moto Edge Series|Motorola Moto Edge 40 Neo|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-g67-power-5g|Motorola|Moto G Series|Motorola Moto G67 Power 5G|128GB=0;256GB=0;12GB / 256GB=0
motorola-moto-g85-5g|Motorola|Moto G Series|Motorola Moto G85 5G|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-g37-power-5g|Motorola|Moto G Series|Motorola Moto G37 Power 5G|4GB / 64GB=0;4GB / 128GB=0;8GB / 128GB=0
motorola-moto-g96-5g|Motorola|Moto G Series|Motorola Moto G96 5G|8GB / 128GB=0;8GB / 256GB=0
motorola-moto-razr-5g|Motorola|Moto Razr Series|Motorola Moto Razr 5G|8GB / 256GB=0
motorola-moto-edge-30-ultra|Motorola|Moto Edge Series|Motorola Moto Edge 30 Ultra|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-g86-power-5g|Motorola|Moto G Series|Motorola Moto G86 Power 5G|8GB / 128GB=0
motorola-moto-g84-5g|Motorola|Moto G Series|Motorola Moto G84 5G|12GB / 256GB=0
motorola-moto-g54-5g|Motorola|Moto G Series|Motorola Moto G54 5G|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-g64-5g|Motorola|Moto G Series|Motorola Moto G64 5G|8GB / 128GB=0;12GB / 256GB=0
motorola-moto-edge-30-fusion|Motorola|Moto Edge Series|Motorola Moto Edge 30 Fusion|8GB / 128GB=0
motorola-moto-g37-5g|Motorola|Moto G Series|Motorola Moto G37 5G|4GB / 64GB=0
motorola-moto-razr|Motorola|Moto Razr Series|Motorola Moto Razr|6GB / 128GB=0
motorola-moto-g57-power-5g|Motorola|Moto G Series|Motorola Moto G57 Power 5G|8GB / 128GB=0
motorola-moto-edge-30|Motorola|Moto Edge Series|Motorola Moto Edge 30|6GB / 128GB=0;8GB / 128GB=0
motorola-moto-g45-5g|Motorola|Moto G Series|Motorola Moto G45 5G|4GB / 128GB=0;8GB / 128GB=0
motorola-moto-g35-5g|Motorola|Moto G Series|Motorola Moto G35 5G|4GB / 128GB=0;8GB / 128GB=0
motorola-moto-edge-30-pro|Motorola|Moto Edge Series|Motorola Moto Edge 30 Pro|8GB / 128GB=0
motorola-moto-g34-5g|Motorola|Moto G Series|Motorola Moto G34 5G|4GB / 128GB=0;8GB / 128GB=0
motorola-moto-g82-5g|Motorola|Moto G Series|Motorola Moto G82 5G|6GB / 128GB=0;8GB / 128GB=0
motorola-moto-g73-5g|Motorola|Moto G Series|Motorola Moto G73 5G|8GB / 128GB=0
motorola-moto-edge-plus|Motorola|Moto Edge Series|Motorola Moto Edge Plus|12GB / 256GB=0
motorola-moto-edge-20-pro|Motorola|Moto Edge Series|Motorola Moto Edge 20 Pro|8GB / 128GB=0
motorola-moto-edge-20|Motorola|Moto Edge Series|Motorola Moto Edge 20|8GB / 128GB=0
motorola-moto-g62-5g|Motorola|Moto G Series|Motorola Moto G62 5G|8GB / 128GB=0;6GB / 128GB=0
motorola-moto-edge-20-fusion|Motorola|Moto Edge Series|Motorola Moto Edge 20 Fusion|6GB / 128GB=0;8GB / 128GB=0
motorola-moto-g71-5g|Motorola|Moto G Series|Motorola Moto G71 5G|6GB / 128GB=0
motorola-moto-g60|Motorola|Moto G Series|Motorola Moto G60|6GB / 128GB=0
motorola-moto-g51-5g|Motorola|Moto G Series|Motorola Moto G51 5G|4GB / 64GB=0
motorola-moto-g06-power|Motorola|Moto G Series|Motorola Moto G06 Power|4GB / 64GB=0
motorola-moto-g40-fusion|Motorola|Moto G Series|Motorola Moto G40 Fusion|4GB / 64GB=0;6GB / 128GB=0
motorola-moto-g52|Motorola|Moto G Series|Motorola Moto G52|4GB / 64GB=0;6GB / 128GB=0
motorola-moto-g05|Motorola|Moto G Series|Motorola Moto G05|4GB / 64GB=0
motorola-moto-g-5g|Motorola|Moto G Series|Motorola Moto G 5G|6GB / 128GB=0
motorola-moto-g72|Motorola|Moto G Series|Motorola Moto G72|6GB / 128GB=0
motorola-moto-g32|Motorola|Moto G Series|Motorola Moto G32|4GB / 64GB=0;8GB / 128GB=0
motorola-one-fusion-plus|Motorola|Moto One Series|Motorola One Fusion Plus|6GB / 128GB=0
motorola-moto-g14|Motorola|Moto G Series|Motorola Moto G14|4GB / 128GB=0
motorola-moto-e13|Motorola|Moto E Series|Motorola Moto E13|2GB / 64GB=0;4GB / 64GB=0;8GB / 128GB=0
motorola-moto-g31|Motorola|Moto G Series|Motorola Moto G31|4GB / 64GB=0;6GB / 128GB=0
motorola-moto-g04s|Motorola|Moto G Series|Motorola Moto G04s|4GB / 64GB=0
motorola-moto-g22|Motorola|Moto G Series|Motorola Moto G22|4GB / 64GB=0
motorola-moto-g04|Motorola|Moto G Series|Motorola Moto G04|4GB / 64GB=0;8GB / 128GB=0
motorola-moto-g24-power|Motorola|Moto G Series|Motorola Moto G24 Power|4GB / 128GB=0;8GB / 128GB=0
motorola-moto-e40|Motorola|Moto E Series|Motorola Moto E40|4GB / 64GB=0
motorola-moto-g42|Motorola|Moto G Series|Motorola Moto G42|4GB / 64GB=0
motorola-moto-g13|Motorola|Moto G Series|Motorola Moto G13|4GB / 64GB=0;4GB / 128GB=0
motorola-moto-g30|Motorola|Moto G Series|Motorola Moto G30|4GB / 64GB=0
motorola-moto-e32|Motorola|Moto E Series|Motorola Moto e32|4GB / 64GB=0
motorola-moto-g10-power|Motorola|Moto G Series|Motorola Moto G10 Power|4GB / 64GB=0
motorola-moto-e22s|Motorola|Moto E Series|Motorola Moto e22s|4GB / 64GB=0
motorola-moto-g9-power|Motorola|Moto G Series|Motorola Moto G9 Power|4GB / 64GB=0
motorola-moto-e32s|Motorola|Moto E Series|Motorola Moto E32s|3GB / 32GB=0;4GB / 64GB=0
motorola-moto-g9|Motorola|Moto G Series|Motorola Moto G9|4GB / 64GB=0
motorola-moto-g8-plus|Motorola|Moto G Series|Motorola Moto G8 Plus|4GB / 64GB=0
motorola-moto-g8-power-lite|Motorola|Moto G Series|Motorola Moto G8 Power Lite|4GB / 64GB=0
motorola-moto-e7-power|Motorola|Moto E Series|Motorola Moto E7 Power|2GB / 32GB=0;4GB / 64GB=0
motorola-moto-e7-plus|Motorola|Moto E Series|Motorola Moto E7 Plus|4GB / 64GB=0
motorola-one-action|Motorola|Moto One Series|Motorola One Action|4GB / 128GB=0
motorola-one-vision|Motorola|Moto One Series|Motorola One Vision|4GB / 128GB=0
motorola-one-power|Motorola|Moto One Series|Motorola One Power|4GB / 64GB=0
motorola-moto-e6s|Motorola|Moto E Series|Motorola Moto E6s|4GB / 64GB=0
motorola-moto-g7-power|Motorola|Moto G Series|Motorola Moto G7 Power|4GB / 64GB=0
motorola-moto-one|Motorola|Moto One Series|Motorola Moto One|4GB / 64GB=0
motorola-one-macro|Motorola|Moto One Series|Motorola One Macro|4GB / 64GB=0
motorola-moto-g6-plus|Motorola|Moto G Series|Motorola Moto G6 Plus|6GB / 64GB=0
motorola-moto-g7|Motorola|Moto G Series|Motorola Moto G7|4GB / 64GB=0
motorola-moto-g6|Motorola|Moto G Series|Motorola Moto G6|3GB / 32GB=0;4GB / 64GB=0
motorola-moto-z2-force|Motorola|Moto Z Series|Motorola Moto Z2 Force|6GB / 64GB=0
nothing-phone-4a-pro|Nothing|Nothing Phone Series|Nothing Phone 4a Pro|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
nothing-phone-3|Nothing|Nothing Phone Series|Nothing Phone 3|12GB / 256GB=0;16GB / 512GB=0
nothing-phone-4a|Nothing|Nothing Phone Series|Nothing Phone 4a|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
nothing-phone-4b|Nothing|Nothing Phone Series|Nothing Phone 4b|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
nothing-phone-3a-pro|Nothing|Nothing Phone Series|Nothing Phone 3a Pro|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
nothing-phone-3a|Nothing|Nothing Phone Series|Nothing Phone 3a|128GB=0;256GB=0
np2|Nothing|Nothing Phone Series|Nothing Phone 2|8GB / 128GB=0;12GB / 256GB=0;12GB / 512GB=0
nothing-phone-2a-plus|Nothing|Nothing Phone Series|Nothing Phone 2a Plus|8GB / 256GB=0;12GB / 256GB=0
nothing-phone-2a-5g|Nothing|Nothing Phone Series|Nothing Phone 2a 5G|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
nothing-phone-3a-lite|Nothing|Nothing Phone Series|Nothing Phone 3a Lite|128GB=0;256GB=0
cmf-by-nothing-phone-2-pro|Nothing|CMF Phone Series|CMF by Nothing Phone 2 Pro|128GB=0;256GB=0
nothing-phone-1|Nothing|Nothing Phone Series|Nothing Phone 1|8GB / 128GB=0;8GB / 256GB=0;12GB / 256GB=0
cmf-by-nothing-phone-1|Nothing|CMF Phone Series|CMF by Nothing Phone 1|6GB / 128GB=0;8GB / 128GB=0
honor-200-pro-5g|Honor|200 Series|Honor 200 Pro 5G|12GB / 512GB=0
honor-200-5g|Honor|200 Series|Honor 200 5G|8GB / 256GB=0;12GB / 512GB=0
honor-90|Honor|90 Series|Honor 90|8GB / 256GB=0;12GB / 256GB=0;12GB / 512GB=0
honor-200-lite-5g|Honor|200 Series|Honor 200 Lite 5G|8GB / 256GB=0
honor-9x-pro|Honor|9X Series|Honor 9X Pro|6GB / 256GB=0
honor-20|Honor|20 Series|Honor 20|6GB / 128GB=0
honor-8x|Honor|8 Series|Honor 8X|4GB / 64GB=0;6GB / 64GB=0;6GB / 128GB=0
honor-10|Honor|10 Series|Honor 10|6GB / 128GB=0
honor-20i|Honor|20 Series|Honor 20i|4GB / 128GB=0
honor-9n|Honor|9 Series|Honor 9N|3GB / 32GB=0;4GB / 64GB=0;4GB / 128GB=0
honor-play|Honor|Play Series|Honor Play|4GB / 64GB=0;6GB / 64GB=0
honor-9a|Honor|9 Series|Honor 9A|3GB / 64GB=0
honor-9-lite|Honor|9 Series|Honor 9 Lite|3GB / 32GB=0;4GB / 64GB=0
honor-8c|Honor|8 Series|Honor 8C|4GB / 64GB=0;4GB / 32GB=0
honor-7x|Honor|7 Series|Honor 7X|4GB / 64GB=0;32GB=0
honor-7a|Honor|7 Series|Honor 7A|3GB / 32GB=0
infinix-zero-flip-5g|Infinix|Infinix Zero Series|Infinix Zero Flip 5G|8GB / 512GB=0
infinix-zero-40-5g|Infinix|Infinix Zero Series|Infinix Zero 40 5G|256GB=0;512GB=0
infinix-gt-20-pro|Infinix|Infinix GT Series|Infinix GT 20 Pro|8GB / 256GB=0;12GB / 256GB=0
infinix-note-40-pro-plus-5g|Infinix|Infinix Note Series|Infinix Note 40 Pro Plus 5G|12GB / 256GB=0
infinix-gt-10-pro|Infinix|Infinix GT Series|Infinix GT 10 Pro|8GB / 256GB=0
infinix-note-40-pro-5g|Infinix|Infinix Note Series|Infinix Note 40 Pro 5G|8GB / 256GB=0
infinix-zero-ultra|Infinix|Infinix Zero Series|Infinix Zero Ultra|8GB / 256GB=0
infinix-note-30-5g|Infinix|Infinix Note Series|Infinix Note 30 5G|4GB / 128GB=0;8GB / 256GB=0
infinix-hot-60-5g-plus|Infinix|Infinix Hot Series|Infinix Hot 60 5G Plus|6GB / 128GB=0
infinix-note-50x-5g|Infinix|Infinix Note Series|Infinix Note 50X 5G|6GB / 128GB=0;8GB / 128GB=0
infinix-note-40-5g|Infinix|Infinix Note Series|Infinix Note 40 5G|8GB / 256GB=0
infinix-note-40x-5g|Infinix|Infinix Note Series|Infinix Note 40X 5G|8GB / 256GB=0;12GB / 256GB=0
infinix-hot-30-5g|Infinix|Infinix Hot Series|Infinix Hot 30 5G|4GB / 128GB=0;8GB / 128GB=0
infinix-hot-60i-5g|Infinix|Infinix Hot Series|Infinix Hot 60i 5G|4GB / 128GB=0
infinix-zero-5g-2023-turbo|Infinix|Infinix Zero Series|Infinix Zero 5G 2023 Turbo|8GB / 256GB=0
infinix-note-12-pro-5g|Infinix|Infinix Note Series|Infinix Note 12 Pro 5G|8GB / 128GB=0
infinix-zero-5g|Infinix|Infinix Zero Series|Infinix Zero 5G|8GB / 128GB=0
infinix-zero-5g-2023|Infinix|Infinix Zero Series|Infinix Zero 5G 2023|8GB / 128GB=0
infinix-hot-50-5g|Infinix|Infinix Hot Series|Infinix Hot 50 5G|4GB / 128GB=0;8GB / 128GB=0
infinix-hot-30i|Infinix|Infinix Hot Series|Infinix Hot 30i|4GB / 64GB=0;8GB / 128GB=0
infinix-note-12-pro-4g|Infinix|Infinix Note Series|Infinix Note 12 Pro 4G|8GB / 256GB=0
infinix-zero-20|Infinix|Infinix Zero Series|Infinix Zero 20|8GB / 128GB=0
infinix-hot-20-5g|Infinix|Infinix Hot Series|Infinix Hot 20 5G|4GB / 64GB=0;6GB / 128GB=0
infinix-note-10-pro|Infinix|Infinix Note Series|Infinix Note 10 Pro|8GB / 256GB=0
infinix-note-12|Infinix|Infinix Note Series|Infinix Note 12|4GB / 64GB=0;6GB / 128GB=0
infinix-note-12-5g|Infinix|Infinix Note Series|Infinix Note 12 5G|6GB / 64GB=0
infinix-hot-40i|Infinix|Infinix Hot Series|Infinix Hot 40i|8GB / 256GB=0
infinix-smart-10|Infinix|Infinix Smart Series|Infinix Smart 10|4GB / 64GB=0
infinix-smart-9-hd|Infinix|Infinix Smart Series|Infinix Smart 9 HD|3GB / 64GB=0
infinix-zero-8i|Infinix|Infinix Zero Series|Infinix Zero 8i|8GB / 128GB=0
infinix-note-11s-free-fire-edition|Infinix|Infinix Note Series|Infinix Note 11s Free Fire Edition|8GB / 128GB=0
infinix-note-12-turbo|Infinix|Infinix Note Series|Infinix Note 12 Turbo|8GB / 128GB=0
infinix-note-11|Infinix|Infinix Note Series|Infinix Note 11|4GB / 64GB=0;6GB / 128GB=0
infinix-hot-12-pro|Infinix|Infinix Hot Series|Infinix Hot 12 Pro|6GB / 64GB=0;8GB / 128GB=0
infinix-hot-10|Infinix|Infinix Hot Series|Infinix Hot 10|4GB / 64GB=0;6GB / 128GB=0
infinix-hot-12-play|Infinix|Infinix Hot Series|Infinix HOT 12 Play|4GB / 64GB=0
infinix-note-11s|Infinix|Infinix Note Series|Infinix Note 11S|6GB / 64GB=0;8GB / 128GB=0
infinix-hot-11s|Infinix|Infinix Hot Series|Infinix Hot 11S|4GB / 64GB=0;4GB / 128GB=0
infinix-hot-12|Infinix|Infinix Hot Series|Infinix Hot 12|4GB / 64GB=0
infinix-note-10|Infinix|Infinix Note Series|Infinix Note 10|4GB / 64GB=0;6GB / 128GB=0
infinix-smart-8|Infinix|Infinix Smart Series|Infinix Smart 8|4GB / 64GB=0
infinix-hot-10s|Infinix|Infinix Hot Series|Infinix Hot 10s|4GB / 64GB=0;6GB / 64GB=0
infinix-hot-11|Infinix|Infinix Hot Series|Infinix Hot 11|4GB / 64GB=0
infinix-hot-10-play|Infinix|Infinix Hot Series|Infinix Hot 10 Play|3GB / 32GB=0;4GB / 64GB=0
infinix-hot-20-play|Infinix|Infinix Hot Series|Infinix Hot 20 Play|4GB / 64GB=0
infinix-note-12i|Infinix|Infinix Note Series|Infinix Note 12i|4GB / 64GB=0
infinix-smart-8-hd|Infinix|Infinix Smart Series|Infinix Smart 8 HD|3GB / 64GB=0
infinix-hot-9-pro|Infinix|Infinix Hot Series|Infinix Hot 9 Pro|4GB / 64GB=0
infinix-note-7|Infinix|Infinix Note Series|Infinix Note 7|4GB / 64GB=0
infinix-hot-11-2022|Infinix|Infinix Hot Series|Infinix Hot 11 2022|4GB / 64GB=0
infinix-hot-9|Infinix|Infinix Hot Series|Infinix Hot 9|4GB / 64GB=0
infinix-s5-pro|Infinix|Infinix S Series|Infinix S5 Pro|4GB / 64GB=0
infinix-smart-6-plus|Infinix|Infinix Smart Series|Infinix Smart 6 Plus|3GB / 64GB=0
infinix-hot-8|Infinix|Infinix Hot Series|Infinix Hot 8|4GB / 64GB=0
infinix-smart-6|Infinix|Infinix Smart Series|Infinix Smart 6|2GB / 64GB=0
infinix-smart-7|Infinix|Infinix Smart Series|Infinix Smart 7|4GB / 64GB=0;4GB / 128GB=0
infinix-zero-5-pro|Infinix|Infinix Zero Series|Infinix Zero 5 Pro|6GB / 128GB=0
infinix-smart-4-plus|Infinix|Infinix Smart Series|Infinix Smart 4 Plus|3GB / 32GB=0
infinix-hot-7-pro|Infinix|Infinix Hot Series|Infinix Hot 7 Pro|6GB / 64GB=0
infinix-smart-5|Infinix|Infinix Smart Series|Infinix Smart 5|2GB / 32GB=0
infinix-smart-6-hd|Infinix|Infinix Smart Series|Infinix Smart 6 HD|2GB / 32GB=0
infinix-s5|Infinix|Infinix S Series|Infinix S5|4GB / 64GB=0
infinix-smart-7-hd|Infinix|Infinix Smart Series|Infinix Smart 7 HD|2GB / 64GB=0
infinix-smart-hd-2021|Infinix|Infinix Smart Series|Infinix Smart HD 2021|2GB / 32GB=0
tecno-phantom-v-fold2-5g|Tecno|Tecno Phantom Series|Tecno Phantom V Fold2 5G|12GB / 512GB=0
tecno-phantom-v-fold-5g|Tecno|Tecno Phantom Series|Tecno Phantom V Fold 5G|256GB=0;512GB=0
tecno-pova-curve-2-5g|Tecno|Tecno Pova Series|Tecno Pova Curve 2 5G|8GB / 128GB=0;8GB / 256GB=0
tecno-phantom-v-flip2-5g|Tecno|Tecno Phantom Series|Tecno Phantom V Flip2 5G|8GB / 256GB=0
tecno-phantom-v-flip-5g|Tecno|Tecno Phantom Series|Tecno Phantom V Flip 5G|8GB / 256GB=0
tecno-phantom-x2-pro-5g|Tecno|Tecno Phantom Series|Tecno Phantom X2 Pro 5G|12GB / 256GB=0
tecno-camon-30-premier-5g|Tecno|Tecno Camon Series|Tecno Camon 30 Premier 5G|12GB / 512GB=0
tecno-phantom-x2-5g|Tecno|Tecno Phantom Series|Tecno Phantom X2 5G|8GB / 256GB=0
tecno-camon-30-5g|Tecno|Tecno Camon Series|Tecno Camon 30 5G|8GB / 256GB=0
tecno-pova-slim-5g|Tecno|Tecno Pova Series|Tecno Pova Slim 5G|8GB / 128GB=0
tecno-pova-7-pro-5g|Tecno|Tecno Pova Series|Tecno Pova 7 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
tecno-pova-curve-5g|Tecno|Tecno Pova Series|Tecno Pova Curve 5G|6GB / 128GB=0;8GB / 128GB=0;8GB / 256GB=0
tecno-camon-20-premier-5g|Tecno|Tecno Camon Series|Tecno Camon 20 Premier 5G|8GB / 512GB=0;16GB / 512GB=0
tecno-camon-20-pro-5g|Tecno|Tecno Camon Series|Tecno Camon 20 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
tecno-camon-20s-pro-5g|Tecno|Tecno Camon Series|Tecno Camon 20s Pro 5G|8GB / 128GB=0
tecno-pova-7-5g|Tecno|Tecno Pova Series|Tecno Pova 7 5G|8GB / 128GB=0;8GB / 256GB=0
tecno-pova-6-pro-5g|Tecno|Tecno Pova Series|Tecno Pova 6 Pro 5G|8GB / 256GB=0
tecno-camon-19-pro-5g|Tecno|Tecno Camon Series|Tecno Camon 19 Pro 5G|128GB=0;256GB=0
tecno-spark-20-pro-5g|Tecno|Tecno Spark Series|Tecno Spark 20 Pro 5G|8GB / 128GB=0;8GB / 256GB=0
tecno-pova-5-pro|Tecno|Tecno Pova Series|Tecno Pova 5 Pro|8GB / 128GB=0;8GB / 256GB=0
tecno-spark-10-5g|Tecno|Tecno Spark Series|Tecno Spark 10 5G|4GB / 64GB=0;8GB / 128GB=0;8GB / 256GB=0
tecno-pova-6-neo-5g|Tecno|Tecno Pova Series|Tecno Pova 6 Neo 5G|6GB / 128GB=0;8GB / 256GB=0
tecno-camon-20|Tecno|Tecno Camon Series|Tecno Camon 20|8GB / 256GB=0
tecno-spark-30c-5g|Tecno|Tecno Spark Series|Tecno Spark 30C 5G|4GB / 64GB=0;4GB / 128GB=0
tecno-spark-go-3|Tecno|Tecno Spark Series|Tecno Spark GO 3|4GB / 64GB=0
tecno-spark-go-5g|Tecno|Tecno Spark Series|Tecno Spark Go 5G|4GB / 128GB=0
tecno-pop-x|Tecno|Tecno Pop Series|Tecno POP X|4GB / 64GB=0
tecno-phantom-x|Tecno|Tecno Phantom Series|Tecno Phantom X|8GB / 256GB=0
tecno-pova-5g|Tecno|Tecno Pova Series|Tecno Pova 5G|8GB / 128GB=0
tecno-camon-17-pro|Tecno|Tecno Camon Series|Tecno Camon 17 Pro|6GB / 128GB=0
tecno-spark-go-2023|Tecno|Tecno Spark Series|Tecno Spark Go 2023|4GB / 64GB=0
tecno-pova-4|Tecno|Tecno Pova Series|Tecno Pova 4|8GB / 128GB=0
tecno-camon-16-premier|Tecno|Tecno Camon Series|Tecno Camon 16 Premier|8GB / 128GB=0
tecno-camon-19-neo|Tecno|Tecno Camon Series|Tecno Camon 19 Neo|6GB / 128GB=0
tecno-camon-19|Tecno|Tecno Camon Series|Tecno Camon 19|6GB / 128GB=0
tecno-pova-3|Tecno|Tecno Pova Series|Tecno Pova 3|4GB / 64GB=0;6GB / 128GB=0
tecno-camon-17|Tecno|Tecno Camon Series|Tecno Camon 17|6GB / 128GB=0
tecno-camon-18|Tecno|Tecno Camon Series|Tecno Camon 18|4GB / 128GB=0
tecno-camon-15-pro|Tecno|Tecno Camon Series|Tecno Camon 15 Pro|6GB / 128GB=0
tecno-pova-2|Tecno|Tecno Pova Series|Tecno POVA 2|4GB / 64GB=0;6GB / 128GB=0
tecno-spark-8-pro|Tecno|Tecno Spark Series|Tecno Spark 8 Pro|4GB / 64GB=0
tecno-spark-9|Tecno|Tecno Spark Series|Tecno Spark 9|4GB / 64GB=0;6GB / 128GB=0
tecno-spark-8p|Tecno|Tecno Spark Series|Tecno Spark 8P|4GB / 64GB=0
tecno-pova-neo|Tecno|Tecno Pova Series|Tecno Pova Neo|6GB / 128GB=0
tecno-spark-7-pro|Tecno|Tecno Spark Series|Tecno Spark 7 Pro|4GB / 64GB=0;6GB / 64GB=0
tecno-spark-8c|Tecno|Tecno Spark Series|Tecno Spark 8C|3GB / 64GB=0
tecno-spark-8t|Tecno|Tecno Spark Series|Tecno Spark 8T|4GB / 64GB=0
tecno-camon-16|Tecno|Tecno Camon Series|Tecno Camon 16|4GB / 64GB=0
tecno-pova|Tecno|Tecno Pova Series|Tecno POVA|4GB / 64GB=0;6GB / 128GB=0
tecno-spark-7p|Tecno|Tecno Spark Series|Tecno Spark 7P|4GB / 128GB=0
tecno-camon-15|Tecno|Tecno Camon Series|Tecno Camon 15|4GB / 64GB=0
tecno-spark-power-2|Tecno|Tecno Spark Series|Tecno Spark Power 2|4GB / 64GB=0
tecno-spark-5-pro|Tecno|Tecno Spark Series|Tecno Spark 5 Pro|4GB / 64GB=0
tecno-spark-8|Tecno|Tecno Spark Series|Tecno Spark 8|2GB / 64GB=0
tecno-spark-power-2-air|Tecno|Tecno Spark Series|Tecno Spark Power 2 Air|3GB / 32GB=0
tecno-spark-6-air|Tecno|Tecno Spark Series|Tecno Spark 6 Air|2GB / 32GB=0;3GB / 32GB=0;3GB / 64GB=0
tecno-camon-12-air|Tecno|Tecno Camon Series|Tecno Camon 12 Air|3GB / 32GB=0;4GB / 64GB=0
tecno-spark-4|Tecno|Tecno Spark Series|Tecno Spark 4|3GB / 32GB=0;4GB / 64GB=0
tecno-spark-5|Tecno|Tecno Spark Series|Tecno Spark 5|2GB / 32GB=0
nokia-x30-5g|Nokia|Nokia X Series|Nokia X30 5G|8GB / 256GB=0
nokia-xr20|Nokia|Nokia XR Series|Nokia XR20|6GB / 128GB=0
nokia-g60-5g|Nokia|Nokia G Series|Nokia G60 5G|6GB / 128GB=0
nokia-g42-5g|Nokia|Nokia G Series|Nokia G42 5G|4GB / 128GB=0;6GB / 128GB=0;8GB / 256GB=0
nokia-8-sirocco|Nokia|Nokia Number Series|Nokia 8 Sirocco|128GB=0
nokia-g21|Nokia|Nokia G Series|Nokia G21|4GB / 64GB=0;6GB / 128GB=0
nokia-5-4|Nokia|Nokia Number Series|Nokia 5.4|4GB / 64GB=0;6GB / 64GB=0
nokia-5-3|Nokia|Nokia Number Series|Nokia 5.3|4GB / 64GB=0;6GB / 64GB=0
nokia-c22|Nokia|Nokia C Series|Nokia C22|2GB / 64GB=0;4GB / 64GB=0;6GB / 64GB=0
nokia-c32|Nokia|Nokia C Series|Nokia C32|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
nokia-7-2|Nokia|Nokia Number Series|Nokia 7.2|4GB / 64GB=0;6GB / 64GB=0
nokia-g20|Nokia|Nokia G Series|Nokia G20|4GB / 64GB=0
nokia-8-1|Nokia|Nokia Number Series|Nokia 8.1|4GB / 64GB=0;6GB / 128GB=0
nokia-c21-plus|Nokia|Nokia C Series|Nokia C21 Plus|3GB / 32GB=0;4GB / 64GB=0
nokia-c31|Nokia|Nokia C Series|Nokia C31|3GB / 32GB=0;4GB / 64GB=0
nokia-g11-plus|Nokia|Nokia G Series|Nokia G11 Plus|4GB / 64GB=0
nokia-c30|Nokia|Nokia C Series|Nokia C30|3GB / 32GB=0;4GB / 64GB=0
nokia-g10|Nokia|Nokia G Series|Nokia G10|4GB / 64GB=0
nokia-c12-pro|Nokia|Nokia C Series|Nokia C12 Pro|2GB / 64GB=0;3GB / 64GB=0;4GB / 64GB=0
nokia-5-1-plus|Nokia|Nokia Number Series|Nokia 5.1 Plus|3GB / 32GB=0;4GB / 64GB=0;6GB / 64GB=0
nokia-3-4|Nokia|Nokia Number Series|Nokia 3.4|4GB / 64GB=0
nokia-6-1-plus|Nokia|Nokia Number Series|Nokia 6.1 Plus|4GB / 64GB=0;6GB / 64GB=0
nokia-2-4|Nokia|Nokia Number Series|Nokia 2.4|3GB / 64GB=0
nokia-6-2|Nokia|Nokia Number Series|Nokia 6.2|4GB / 64GB=0
nokia-7-plus|Nokia|Nokia Number Series|Nokia 7 Plus|64GB=0
nokia-7-1|Nokia|Nokia Number Series|Nokia 7.1|4GB / 64GB=0
nokia-c12|Nokia|Nokia C Series|Nokia C12|2GB / 64GB=0
nokia-c20-plus|Nokia|Nokia C Series|Nokia C20 Plus|2GB / 32GB=0;3GB / 32GB=0
nokia-3-2|Nokia|Nokia Number Series|Nokia 3.2|3GB / 32GB=0;2GB / 16GB=0
nokia-4-2|Nokia|Nokia Number Series|Nokia 4.2|3GB / 32GB=0
nokia-c01-plus|Nokia|Nokia C Series|Nokia C01 Plus|32GB=0;16GB=0
nokia-2-2|Nokia|Nokia Number Series|Nokia 2.2|2GB / 16GB=0;3GB / 32GB=0
ai-novaflip-5g|Ai+|Ai+ Nova Series|Ai+ NovaFlip 5G|8GB / 256GB=0
ai-nova-2-ultra-5g|Ai+|Ai+ Nova Series|Ai+ Nova 2 Ultra 5G|6GB / 128GB=0;8GB / 128GB=0
ai-nova-2-pro-5g|Ai+|Ai+ Nova Series|Ai+ Nova 2 Pro 5G|6GB / 128GB=0;8GB / 128GB=0
ai-nova-2-power-5g|Ai+|Ai+ Nova Series|Ai+ Nova 2 Power 5G|6GB / 128GB=0;8GB / 128GB=0
ai-nova-2-neo-5g|Ai+|Ai+ Nova Series|Ai+ Nova 2 Neo 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
ai-nova-2-5g|Ai+|Ai+ Nova Series|Ai+ Nova 2 5G|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
ai-pulse-2|Ai+|Ai+ Pulse Series|Ai+ Pulse 2|4GB / 64GB=0;4GB / 128GB=0;6GB / 128GB=0
ai-pulse-2-fe|Ai+|Ai+ Pulse Series|Ai+ Pulse 2 FE|4GB / 64GB=0
lenovo-z6-pro|Lenovo|Lenovo Z Series|Lenovo Z6 Pro|8GB / 128GB=0
lenovo-k10-plus|Lenovo|Lenovo K Series|Lenovo K10 Plus|4GB / 64GB=0
lenovo-k10-note|Lenovo|Lenovo K Series|Lenovo K10 Note|4GB / 64GB=0;6GB / 128GB=0
lenovo-k9-note|Lenovo|Lenovo K Series|Lenovo K9 Note|4GB / 64GB=0
lenovo-a6-note|Lenovo|Lenovo A Series|Lenovo A6 Note|3GB / 32GB=0
lg-g8x-thinq|LG|LG G Series|LG G8X ThinQ|6GB / 128GB=0
lg-g8s-thinq|LG|LG G Series|LG G8S ThinQ|6GB / 128GB=0
lg-q60|LG|LG Q Series|LG Q60|3GB / 64GB=0
lg-w10|LG|LG W Series|LG W10|3GB / 32GB=0
asus-rog-phone-3|ASUS|ROG Series|Asus ROG Phone 3|8GB / 128GB=0;12GB / 128GB=0;12GB / 256GB=0
asus-rog-phone-ii-zs660kl|ASUS|ROG Series|Asus ROG Phone II ZS660KL|8GB / 128GB=0;12GB / 512GB=0
asus-8z|ASUS|8 Series|Asus 8z|8GB / 128GB=0`;
function bookModels(){return PHONEBOOK.trim()===''?[]:PHONEBOOK.split('\n').map(l=>{const [id,brand,series,name,vs]=l.split('|');const v=vs.split(';').map(x=>{const k=x.lastIndexOf('=');return[x.slice(0,k),+x.slice(k+1)]});const base=v[0][1];const m=M(id,'phone',brand,name,base,v.map(([a,p])=>[a,base?p/base:1]));m.series=series;return m})}
const POP_GRID=["ip15", "ip14", "ip13", "ip16", "ip16p", "ip15p", "s24", "samsung-galaxy-s23-5g", "a55", "samsung-galaxy-a35-5g", "op12", "nord4", "px8", "xiaomi-redmi-note-13-pro-5g", "vivo-v29-5g", "oppo-reno11-5g", "realme-12-pro-5g", "iqoo-z9-5g", "np2"];
/* index.php puts today's catalogue into the page (id="rcCat"), so it shows without waiting for a second request */
const EMB=(()=>{try{const e=document.getElementById('rcCat'),j=e?JSON.parse(e.textContent):null;return j&&Array.isArray(j.models)&&j.models.length?j:null}catch(_){return null}})();
const CATALOG=EMB?EMB.models.map(m=>({id:m.id,cat:m.cat,brand:m.brand,name:m.name,series:m.series||'',base:m.base,variants:m.variants,img:m.img||'',colors:Array.isArray(m.colors)?m.colors:[]})):[...bookModels(),
  M('mba-m3','laptop','Apple','MacBook Air M3 (13-inch)',0,[['8GB · 256GB',1],['16GB · 512GB',1.18]]),
  M('mba-m2','laptop','Apple','MacBook Air M2 (13-inch)',0,[['8GB · 256GB',1],['8GB · 512GB',1.1]]),
  M('mba-m1','laptop','Apple','MacBook Air M1',0,[['8GB · 256GB',1],['8GB · 512GB',1.1]]),
  M('mbp-m3p','laptop','Apple','MacBook Pro M3 Pro (14-inch)',0,[['18GB · 512GB',1],['18GB · 1TB',1.1]]),
  M('xps13','laptop','Dell','Dell XPS 13 (2023)',0,[['16GB · 512GB',1]]),
  M('tp-e14','laptop','Lenovo','ThinkPad E14 Gen 5',0,[['16GB · 512GB',1]]),
  M('hp-pav15','laptop','HP','HP Pavilion 15 (Intel i5)',0,[['16GB · 512GB',1]]),
  M('g14','laptop','ASUS','ROG Zephyrus G14 (2023)',0,[['16GB · 1TB',1]]),
  M('ipadpro-m4','tablet','Apple','iPad Pro M4 (11-inch)',0,[['256GB',1],['512GB',1.1]]),
  M('ipadair-m2','tablet','Apple','iPad Air M2 (11-inch)',0,[['128GB',1],['256GB',1.1]]),
  M('ipad10','tablet','Apple','iPad (10th Gen)',0,[['64GB',1],['256GB',1.14]]),
  M('tabs9','tablet','Samsung','Galaxy Tab S9',0,[['128GB',1],['256GB',1.08]]),
  M('awu2','watch','Apple','Apple Watch Ultra 2',0,[['49mm',1]]),
  M('aws9','watch','Apple','Apple Watch Series 9',0,[['41mm GPS',1],['45mm GPS',1.08],['45mm Cellular',1.18]]),
  M('gw6c','watch','Samsung','Galaxy Watch6 Classic',0,[['43mm',1],['47mm',1.06]]),
  M('opw2','watch','OnePlus','OnePlus Watch 2',0,[['46mm',1]])
];
/* Model photos that ship with the site (the admin panel can replace them) */
const BUILT_IN_PHOTOS={ip18pm:'uploads/477dccc273e141d4bad7db45.jpg'};
CATALOG.forEach(m=>{if(BUILT_IN_PHOTOS[m.id])m.img=BUILT_IN_PHOTOS[m.id]});
const byId=Object.fromEntries(CATALOG.map(m=>[m.id,m]));
function buildAliases(){CATALOG.forEach(m=>{
  const a=new Set([norm(m.name),norm(m.brand+' '+m.name)]);
  const short=norm(m.name.replace(/\s*\(.*?\)/g,''));a.add(short);
  if(short.startsWith('galaxy '))a.add(short.slice(7));
  if(short.startsWith('apple watch '))a.add('watch '+short.slice(12));
  if(short.startsWith('oneplus '))a.add('op '+short.slice(8));
  if(short.startsWith('vivo '))a.add(short.slice(5));
  if(short.startsWith('xiaomi '))a.add('mi '+short.slice(7));
  if(short.startsWith('pixel '))a.add('google '+short);
  if(short.startsWith('rog '))a.add(short.slice(4));
  m.alias=[...a].filter(x=>x.length>3);
});}
buildAliases();
const RULES={verified:1.01,floor:{phone:1000,laptop:1000,tablet:1000,watch:500}};
const pctTxt=f=>(Math.round(f*1000)/10).toString().replace(/\.0$/,'')+'%';
const BIZ={supportEmail:'recellosolutions@gmail.com',hours:'9 AM–9 PM, every day',pins:['411'],rapid:{on:true,minutes:90,from:10,to:18}};
const h12=h=>(h%12||12)+(h<12?' AM':' PM');
const rapidOpen=()=>{const r=BIZ.rapid;if(!r||!r.on)return false;const h=new Date().getHours();return h>=r.from&&h<r.to};
const rapidBy=()=>new Date(Date.now()+BIZ.rapid.minutes*60000).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'});
const pinOk=p=>!BIZ.pins.length||BIZ.pins.some(x=>String(p).startsWith(x));
const pinMsg=p=>`We don't pick up in ${p} yet. Call or WhatsApp us and we'll see what we can do.`;
/* ---------- condition questions: illustrations + defaults (shared by site and admin) ---------- */
const ILLUS=(()=>{
  const G='#009441',Y='#FAEE1C',K='#1B2A21',S='#E9F7EE',R='#D64545',M='#8FA69A';
  const front=`<rect x="40" y="6" width="40" height="78" rx="8" fill="${K}"/><rect x="43.5" y="10" width="33" height="70" rx="5" fill="${S}"/><rect x="54" y="12.5" width="12" height="3.2" rx="1.6" fill="${K}"/>`;
  const back=`<rect x="40" y="6" width="40" height="78" rx="8" fill="#2E4A3A"/><rect x="44.5" y="10.5" width="15" height="15" rx="4.5" fill="${K}"/><circle cx="49" cy="15" r="2.6" fill="#6E8E7B"/><circle cx="55" cy="21" r="2.6" fill="#6E8E7B"/><circle cx="55" cy="15" r="1.1" fill="${Y}"/>`;
  const cal=t=>`<rect x="28" y="14" width="64" height="62" rx="8" fill="#fff" stroke="${K}" stroke-width="3"/><rect x="29.5" y="15.5" width="61" height="14" rx="6.5" fill="${G}"/><path d="M28 30h64" stroke="${K}" stroke-width="3"/><rect x="40" y="8" width="4" height="12" rx="2" fill="${K}"/><rect x="76" y="8" width="4" height="12" rx="2" fill="${K}"/><text x="60" y="57" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-weight="700" font-size="19" fill="${K}">${t}</text><text x="60" y="69" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="7" letter-spacing="1" fill="${G}">MONTHS</text>`;
  return{
    'screen-ok':front+`<circle cx="60" cy="46" r="12" fill="${G}"/><path d="M54 46.5l4.2 4.2 7.6-8.4" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'screen-scratch':front+`<path d="M47 32l15-8M51 50l20-11M46 66l12-7M60 74l14-8" stroke="${M}" stroke-width="1.4" stroke-linecap="round"/>`,
    'screen-heavy':front+`<g stroke="${K}" stroke-linecap="round" opacity=".72"><path d="M46 24l26-12" stroke-width="2.4"/><path d="M45 40l29-14" stroke-width="2.8"/><path d="M47 55l27-13" stroke-width="2.4"/><path d="M45 72l24-11" stroke-width="2.8"/></g><g stroke="${M}" stroke-width="1.4" stroke-linecap="round"><path d="M50 32l12-6M54 64l14-7M49 47l8-4"/></g>`,
    'screen-display':front+`<rect x="55" y="10" width="2.6" height="70" fill="${R}"/><rect x="62" y="10" width="1.8" height="70" fill="#3B7BE0"/><rect x="67" y="10" width="1.2" height="70" fill="${G}"/><circle cx="50" cy="60" r="7" fill="${K}" opacity=".5"/>`,
    'screen-crack':front+`<g stroke="${K}" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M63 36l-7 9 7 5-9 11 4 8"/><path d="M63 36l9-7"/><path d="M63 36l11 8-3 10"/><path d="M63 36l-14-3"/><path d="M63 36l2-14"/></g><circle cx="63" cy="36" r="3" fill="${K}"/>`,
    'body-excellent':back+`<path d="M90 18l2.2 5.3 5.3 2.2-5.3 2.2L90 33l-2.2-5.3-5.3-2.2 5.3-2.2z" fill="${Y}"/><path d="M26 56l1.5 3.5 3.5 1.5-3.5 1.5L26 66l-1.5-3.5-3.5-1.5 3.5-1.5z" fill="${Y}"/>`,
    'body-good':back+`<path d="M64 62l7-3" stroke="#B9CBBF" stroke-width="2.2" stroke-linecap="round"/>`,
    'body-fair':back+`<g stroke="#B9CBBF" stroke-width="2.2" stroke-linecap="round"><path d="M64 62l8-4"/><path d="M47 48l6 2"/><path d="M58 74l6-1"/><path d="M70 36l4-3"/></g><path d="M78 76a7 7 0 0 1-5 6" stroke="#C9D8CE" stroke-width="3" fill="none"/>`,
    'body-poor':back+`<ellipse cx="66" cy="58" rx="8" ry="5" fill="#1F3529"/><g stroke="${R}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M52 40l6 6-5 7 7 6"/><path d="M58 46l8-3"/></g><path d="M41 71l6 6" stroke="${S}" stroke-width="4" stroke-linecap="round"/>`,
    'cal-3':cal('0–3'),'cal-6':cal('3–6'),'cal-11':cal('6–11'),'cal-12':cal('11+'),
    'bill':`<path d="M38 8h36l10 10v66H38z" fill="#fff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M74 8v10h10" fill="none" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M46 34h22M46 44h30M46 54h30M46 64h16" stroke="${M}" stroke-width="3" stroke-linecap="round"/><circle cx="73" cy="70" r="8.5" fill="${G}"/><text x="73" y="74" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="11" fill="#fff">₹</text>`,
    'box':`<path d="M60 14l34 14v36L60 78 26 64V28z" fill="#E8D6B5" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M26 28l34 14 34-14M60 42v36" fill="none" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M43 21l34 14" stroke="${G}" stroke-width="6"/>`,
    'charger':`<rect x="44" y="12" width="32" height="36" rx="7" fill="#fff" stroke="${K}" stroke-width="3"/><path d="M53 12V4M67 12V4" stroke="${K}" stroke-width="4" stroke-linecap="round"/><path d="M62 22l-6 9h7l-4 9" stroke="${G}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M60 48v10c0 10-14 8-14 18v8" stroke="${K}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    'none':`<circle cx="60" cy="45" r="28" fill="#fff" stroke="${R}" stroke-width="5"/><path d="M40 65l40-40" stroke="${R}" stroke-width="5" stroke-linecap="round"/>`,
    'battery-low':`<rect x="26" y="28" width="62" height="34" rx="6" fill="#fff" stroke="${K}" stroke-width="3.5"/><rect x="90" y="38" width="6" height="14" rx="2" fill="${K}"/><rect x="31" y="33" width="12" height="24" rx="2.5" fill="${R}"/>`,
    'water':front+`<path d="M60 30c8 11 12 17 12 23a12 12 0 0 1-24 0c0-6 4-12 12-23z" fill="#3B9BE0"/><path d="M55 54a5 5 0 0 0 5 5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    'no-power':`<rect x="40" y="6" width="40" height="78" rx="8" fill="${K}"/><rect x="43.5" y="10" width="33" height="70" rx="5" fill="#0D1611"/><path d="M60 34v12" stroke="${M}" stroke-width="3.5" stroke-linecap="round"/><path d="M52 39a11 11 0 1 0 16 0" stroke="${M}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    'camera-off':back+`<path d="M43 9l18 18" stroke="${R}" stroke-width="2.8" stroke-linecap="round"/>`,
    'spen-ok':front+`<g transform="rotate(16 96 46)"><rect x="92.5" y="12" width="7" height="60" rx="3.5" fill="${K}"/><rect x="92.5" y="12" width="7" height="9" rx="3.5" fill="#6E8E7B"/><path d="M92.5 70h7l-3.5 9z" fill="${K}"/></g><circle cx="26" cy="24" r="9" fill="${G}"/><path d="M21.5 24.3l3.2 3.2 5.6-6.2" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'spen-broken':front+`<g transform="rotate(16 96 46)"><rect x="92.5" y="12" width="7" height="26" rx="3.5" fill="${K}"/><rect x="92.5" y="12" width="7" height="9" rx="3.5" fill="#6E8E7B"/><rect x="92.5" y="45" width="7" height="27" rx="2" fill="${K}"/><path d="M92.5 70h7l-3.5 9z" fill="${K}"/><path d="M90 40l4 2-2 2 5 2" stroke="${R}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    'spen-missing':front+`<g transform="rotate(16 96 46)"><rect x="92.5" y="12" width="7" height="66" rx="3.5" fill="none" stroke="${M}" stroke-width="1.8" stroke-dasharray="3 3"/></g><circle cx="26" cy="24" r="9" fill="#fff" stroke="${R}" stroke-width="3"/><path d="M20 30l12-12" stroke="${R}" stroke-width="3" stroke-linecap="round"/>`,
    'fold-ok':`<rect x="42" y="4" width="36" height="82" rx="7" fill="${K}"/><rect x="45" y="7" width="30" height="76" rx="4.5" fill="${S}"/><path d="M45 45h30" stroke="#D3E3D9" stroke-width="1.4"/><rect x="55" y="9" width="10" height="3" rx="1.5" fill="${K}"/><circle cx="96" cy="24" r="9" fill="${G}"/><path d="M91.5 24.3l3.2 3.2 5.6-6.2" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'fold-crease':`<rect x="42" y="4" width="36" height="82" rx="7" fill="${K}"/><rect x="45" y="7" width="30" height="76" rx="4.5" fill="${S}"/><path d="M45 45h30" stroke="${M}" stroke-width="3.2"/><path d="M45 42.5h30M45 47.5h30" stroke="#BCCDC2" stroke-width="1"/><circle cx="54" cy="40" r="2.2" fill="none" stroke="${M}" stroke-width="1.2"/><circle cx="66" cy="50" r="2.8" fill="none" stroke="${M}" stroke-width="1.2"/><circle cx="70" cy="39" r="1.6" fill="none" stroke="${M}" stroke-width="1.1"/><rect x="55" y="9" width="10" height="3" rx="1.5" fill="${K}"/>`,
    'fold-lines':`<rect x="42" y="4" width="36" height="82" rx="7" fill="${K}"/><rect x="45" y="7" width="30" height="76" rx="4.5" fill="${S}"/><path d="M45 45h30" stroke="${M}" stroke-width="2"/><rect x="52" y="7" width="2.4" height="76" fill="${R}"/><rect x="61" y="30" width="1.8" height="53" fill="#3B7BE0"/><rect x="67" y="7" width="1.4" height="76" fill="${G}"/><ellipse cx="58" cy="45" rx="7" ry="4" fill="${K}" opacity=".55"/><rect x="55" y="9" width="10" height="3" rx="1.5" fill="${K}"/>`,
    'parts-ok':front+`<path d="M96 14l12 4.5v8.5c0 7-5 12.5-12 14.5-7-2-12-7.5-12-14.5v-8.5z" fill="${G}"/><path d="M90.5 27.3l3.6 3.6 6.4-7" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'parts-service':front+`<circle cx="97" cy="58" r="15" fill="#fff" stroke="${G}" stroke-width="3"/><g transform="rotate(-40 97 58)"><rect x="94.5" y="56" width="5" height="14" rx="2.5" fill="${K}"/><path d="M91 55.5a6 6 0 1 1 12 0h-3.2v-4.2h-5.6v4.2z" fill="${K}"/></g><circle cx="108" cy="47" r="5.5" fill="${G}"/><path d="M105.4 47.2l1.8 1.8 3.2-3.5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'parts-local':front+`<circle cx="97" cy="58" r="15" fill="#fff" stroke="${M}" stroke-width="3"/><g transform="rotate(-40 97 58)"><rect x="94.5" y="56" width="5" height="14" rx="2.5" fill="${K}"/><path d="M91 55.5a6 6 0 1 1 12 0h-3.2v-4.2h-5.6v4.2z" fill="${K}"/></g><path d="M108 40l6.5 11h-13z" fill="${Y}" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"/><path d="M108 44v3.5" stroke="${K}" stroke-width="1.6" stroke-linecap="round"/><circle cx="108" cy="49.2" r=".9" fill="${K}"/>`,
    'unsure':`<circle cx="60" cy="45" r="28" fill="#fff" stroke="${K}" stroke-width="4"/><path d="M50.5 37a9.5 9.5 0 1 1 13.8 8.5c-2.8 1.4-4.3 3.3-4.3 6.5v2" stroke="${K}" stroke-width="4.5" fill="none" stroke-linecap="round"/><circle cx="60" cy="62.5" r="3" fill="${K}"/>`,
    'origin-in':`<path d="M38 32h44l-3 50H41z" fill="#fff" stroke="${K}" stroke-width="3" stroke-linejoin="round"/><path d="M49 32v-6a11 11 0 0 1 22 0v6" fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round"/><text x="60" y="66" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="24" fill="${G}">₹</text><circle cx="86" cy="28" r="9" fill="${G}"/><path d="M81.5 28.3l3.2 3.2 5.6-6.2" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    'origin-out':`<circle cx="56" cy="50" r="27" fill="${S}" stroke="${K}" stroke-width="3"/><ellipse cx="56" cy="50" rx="11" ry="27" fill="none" stroke="${K}" stroke-width="2"/><path d="M29 50h54M33 36h46M33 64h46" stroke="${K}" stroke-width="2" fill="none"/><path d="M78 20l14 4 10-6c2-1 4.5 0 3.5 2l-8 8 3 14-3.5 2-6.5-11-7 5v5l-3 2-2-7-6-3 2-2.5 5 .5 6-6-10-5z" fill="${G}" stroke="${K}" stroke-width="1.4" stroke-linejoin="round"/>`,
    'no-issues':front+`<circle cx="96" cy="28" r="12" fill="${G}"/><path d="M90 28.4l4.2 4.2 7.6-8.4" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 54l2.2 5.3 5.3 2.2-5.3 2.2L24 69l-2.2-5.3-5.3-2.2 5.3-2.2z" fill="${Y}"/><path d="M98 60l1.5 3.5 3.5 1.5-3.5 1.5L98 70l-1.5-3.5L93 65l3.5-1.5z" fill="${Y}"/>`,
    'sound-issue':`<path d="M30 36h11l14-12v42L41 54H30z" fill="${K}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/><path d="M63 35a13 13 0 0 1 0 20M70 28a23 23 0 0 1 0 34" stroke="${M}" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="90" cy="30" r="10" fill="#fff" stroke="${R}" stroke-width="3"/><path d="M83 37l14-14" stroke="${R}" stroke-width="3" stroke-linecap="round"/>`,
    'button-issue':front+`<rect x="36.5" y="20" width="3.5" height="9" rx="1.5" fill="${K}"/><rect x="36.5" y="32" width="3.5" height="9" rx="1.5" fill="${K}"/><rect x="80" y="26" width="4" height="15" rx="1.5" fill="${R}"/><path d="M88 22l5-3M89 33.5h6M88 45l5 3" stroke="${R}" stroke-width="2.6" stroke-linecap="round"/>`,
    'charge-issue':`<rect x="48" y="44" width="24" height="20" rx="4" fill="${K}"/><rect x="53" y="34" width="14" height="10" rx="2" fill="${M}"/><rect x="56" y="37" width="8" height="3" rx="1.5" fill="${K}"/><path d="M60 64v8c0 7-12 6-12 13" stroke="${K}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M58 47l-3 6h5l-3 6" stroke="${Y}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="88" cy="32" r="10" fill="#fff" stroke="${R}" stroke-width="3"/><path d="M81 39l14-14" stroke="${R}" stroke-width="3" stroke-linecap="round"/>`,
    'bio-issue':`<g fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round"><path d="M44 52a16 16 0 0 1 32 0"/><path d="M38 42a23 23 0 0 1 44 0"/><path d="M50 60c0-10 4-15 10-15s10 5 10 13"/><path d="M56 70c-1-4-1-8-1-12a5 5 0 0 1 10 0c0 6 1 9 3 12"/><path d="M60 58v14"/></g><path d="M36 74l48-48" stroke="${R}" stroke-width="4" stroke-linecap="round"/>`,
    'network-issue':`<g fill="none" stroke="${K}" stroke-width="4" stroke-linecap="round"><path d="M36 44a34 34 0 0 1 48 0"/><path d="M44 53a22 22 0 0 1 32 0"/><path d="M52 62a10 10 0 0 1 16 0"/></g><circle cx="60" cy="70" r="4" fill="${K}"/><path d="M38 22l44 52" stroke="${R}" stroke-width="4" stroke-linecap="round"/>`,
    'vibe-issue':front+`<path d="M30 26l-5 5 5 5-5 5 5 5M90 26l5 5-5 5 5 5-5 5" stroke="${M}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="98" cy="66" r="9" fill="#fff" stroke="${R}" stroke-width="2.6"/><path d="M92 72l12-12" stroke="${R}" stroke-width="2.6" stroke-linecap="round"/>`,
    'keyboard-issue':`<rect x="30" y="12" width="60" height="40" rx="4" fill="${K}"/><rect x="33.5" y="15.5" width="53" height="33" rx="2" fill="${S}"/><path d="M22 56h76l-6 12H28z" fill="#B9CBBF" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/><path d="M34 60h6M44 60h6M54 60h6M64 60h6M74 60h6M40 64.5h34" stroke="${K}" stroke-width="2" stroke-linecap="round"/><rect x="66" y="58" width="8" height="4.5" rx="1" fill="${R}"/><path d="M60 72v6" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/><circle cx="60" cy="82" r="1.6" fill="${R}"/>`,
    'webcam-issue':`<rect x="28" y="10" width="64" height="44" rx="4" fill="${K}"/><rect x="31.5" y="16" width="57" height="34.5" rx="2" fill="${S}"/><circle cx="60" cy="13" r="2" fill="#6E8E7B"/><path d="M20 58h80l-6 10H26z" fill="#B9CBBF" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/><circle cx="60" cy="33" r="10" fill="#fff" stroke="${R}" stroke-width="3"/><path d="M53 40l14-14" stroke="${R}" stroke-width="3" stroke-linecap="round"/>`,
    'hinge-issue':`<g transform="rotate(-9 30 62)"><rect x="30" y="16" width="58" height="42" rx="4" fill="${K}"/><rect x="33.5" y="19.5" width="51" height="35" rx="2" fill="${S}"/></g><path d="M20 62h80l-6 10H26z" fill="#B9CBBF" stroke="${K}" stroke-width="2.4" stroke-linejoin="round"/><path d="M84 52l4 4-3 3 4 4" stroke="${R}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 60l-4-3M34 58l-2-4" stroke="${R}" stroke-width="2.4" stroke-linecap="round"/>`,
    'sensor-issue':`<rect x="48" y="4" width="24" height="18" rx="4" fill="#8FA69A"/><rect x="48" y="68" width="24" height="18" rx="4" fill="#8FA69A"/><circle cx="60" cy="45" r="26" fill="${K}"/><circle cx="60" cy="45" r="17" fill="#2E4A3A" stroke="#6E8E7B" stroke-width="2"/><circle cx="53" cy="40" r="2.6" fill="${G}"/><circle cx="67" cy="40" r="2.6" fill="${G}"/><circle cx="53" cy="50" r="2.6" fill="${G}"/><circle cx="67" cy="50" r="2.6" fill="${G}"/><circle cx="96" cy="26" r="9.5" fill="#fff" stroke="${R}" stroke-width="2.8"/><path d="M89.5 32.5l13-13" stroke="${R}" stroke-width="2.8" stroke-linecap="round"/>`

  };
})();
const PRESETS=[['screen-ok','Screen like new'],['screen-scratch','Minor scratches'],['screen-heavy','Heavy scratches'],['screen-display','Display issues'],['screen-crack','Cracked screen'],['body-excellent','Body excellent'],['body-good','Body good'],['body-fair','Body fair'],['body-poor','Body poor'],['cal-3','0–3 months'],['cal-6','3–6 months'],['cal-11','6–11 months'],['cal-12','11+ months'],['bill','Purchase bill'],['box','Original box'],['charger','Charger'],['none','None'],['battery-low','Weak battery'],['water','Water damage'],['no-power','Won\'t switch on'],['camera-off','Camera fault']];
const svgIllus=k=>ILLUS[k]?`<svg viewBox="0 0 120 90" aria-hidden="true">${ILLUS[k]}</svg>`:'';
const ALLC=['phone','laptop','tablet','watch'];
const QO=(id,label,deduct,img)=>({id,label,deduct,img:'preset:'+img,active:true});
const SEED_Q=[
  {id:'color',title:'Which colour is it?',help:'',type:'color',cats:ALLC,brands:[],models:[],active:true,options:[]},
  {id:'origin',title:'Where did you buy this phone?',help:'Check the box or the bill. Phones bought outside India can have a different warranty and network bands.',type:'single',cats:['phone'],brands:['Apple','Samsung','Google'],models:[],active:true,options:[QO('india','In India',0,'origin-in'),QO('abroad','Outside India',3,'origin-out')]},
  {id:'age',title:'How long have you owned this device?',help:'',type:'single',cats:ALLC,active:true,options:[QO('a0','0 - 3 Months',0,'cal-3'),QO('a3','3 - 6 Months',10,'cal-6'),QO('a6','6 - 11 Months',15,'cal-11'),QO('a11','Above 11 Months',20,'cal-12')]},
  {id:'body',title:'What is the physical condition of your device?',help:'',type:'single',cats:ALLC,active:true,options:[QO('excellent','Excellent',0,'body-excellent'),QO('good','Good',3,'body-good'),QO('fair','Fair',10,'body-fair'),QO('poor','Poor',15,'body-poor')]},
  {id:'screen',title:"What is the condition of your device's screen?",help:'',type:'single',cats:ALLC,active:true,options:[QO('likenew','Like New (No Marks or Issues)',0,'screen-ok'),QO('minor','Minor Scratches',3,'screen-scratch'),QO('heavy','Heavy Scratches',10,'screen-heavy'),QO('display','Display Issues',15,'screen-display'),QO('cracked','Cracked or Broken Screen',20,'screen-crack')]},
  {id:'battery',title:'What is the battery health?',help:'',type:'battery',cats:['phone','watch','laptop'],brands:['Apple'],models:[],active:true,options:[],bands:[{min:95,deduct:0},{min:90,deduct:0},{min:85,deduct:0},{min:80,deduct:0},{min:0,deduct:0}],unsure:0},
  {id:'spen',title:'Is the S Pen with it, and does it work?',help:'',type:'single',cats:['phone','tablet'],brands:['Samsung'],models:["samsung-galaxy-s26-ultra", "s25u", "samsung-galaxy-s24-ultra-5g", "samsung-galaxy-s23-ultra-5g", "samsung-galaxy-s22-ultra-5g", "samsung-galaxy-note-20-ultra-5g", "samsung-galaxy-note-10-plus-5g", "samsung-galaxy-note-10-plus", "samsung-galaxy-note-20", "samsung-galaxy-note-10", "samsung-galaxy-note-9", "samsung-galaxy-note-8", "samsung-galaxy-note-10-lite", "samsung-galaxy-note-5", "samsung-galaxy-note-5-dual-sim", "samsung-galaxy-note-4", "tabs9"],active:true,options:[QO('spen-ok','Yes, it works',0,'spen-ok'),QO('spen-bad','Yes, but it doesn\'t work properly',0,'spen-broken'),QO('spen-none','No S Pen',0,'spen-missing')]},
  {id:'fold',title:'How does the fold look when the phone is open?',help:'Open the phone fully and look at the middle of the inner screen.',type:'single',cats:['phone'],brands:[],models:["iphone-duo", "samsung-galaxy-z-fold-8-ultra", "samsung-galaxy-z-fold-8", "samsung-galaxy-z-fold-7", "samsung-galaxy-z-flip-8", "samsung-galaxy-z-fold6-5g", "samsung-galaxy-z-flip-7", "samsung-galaxy-z-flip-7-fe", "samsung-galaxy-z-fold5", "zflip6", "samsung-galaxy-z-fold4", "samsung-galaxy-z-flip5", "samsung-galaxy-z-fold3-5g", "samsung-galaxy-z-fold2-5g", "samsung-galaxy-z-flip4", "samsung-galaxy-z-flip3-5g", "samsung-galaxy-z-flip", "google-pixel-11-pro-fold", "google-pixel-10-pro-fold", "google-pixel-9-pro-fold", "vivo-x-fold-5", "vivo-x-fold-3-pro", "oppo-find-n3-flip", "oppo-find-n2-flip", "motorola-moto-razr-60-ultra", "motorola-moto-razr-50-ultra", "motorola-moto-razr-60", "motorola-moto-razr-50", "motorola-moto-razr-40-ultra", "motorola-moto-razr-40", "motorola-moto-razr-5g", "motorola-moto-razr", "infinix-zero-flip-5g", "tecno-phantom-v-fold2-5g", "tecno-phantom-v-fold-5g", "tecno-phantom-v-flip2-5g", "tecno-phantom-v-flip-5g", "ai-novaflip-5g"],active:true,options:[QO('fold-ok','Smooth, only a light crease',0,'fold-ok'),QO('fold-crease','Deep crease or bubbles in the screen film',0,'fold-crease'),QO('fold-lines','Lines, dead spots or flicker on the fold',0,'fold-lines')]},
  {id:'parts',title:'Has the screen, battery or camera ever been replaced?',help:'On iPhone: Settings → General → About → Parts and Service History.',type:'single',cats:['phone'],brands:['Apple'],models:[],active:true,options:[QO('parts-none','No, all original',0,'parts-ok'),QO('parts-apple','Yes, at Apple or an authorised centre',0,'parts-service'),QO('parts-local','Yes, at another shop',0,'parts-local'),QO('parts-unsure','Not sure',0,'unsure')]},
  {id:'issues',title:'Is anything not working properly?',help:'',type:'multi',cats:['phone','tablet'],brands:[],models:[],active:true,options:[QO('none-ok','None, everything works',0,'no-issues'),QO('i-batt','Battery drains fast or is swollen',0,'battery-low'),QO('i-sound','Speaker or mic',0,'sound-issue'),QO('i-btn','Power or volume buttons',0,'button-issue'),QO('i-charge','Charging port',0,'charge-issue')]},
  {id:'issues-laptop',title:'Is anything not working properly?',help:'',type:'multi',cats:['laptop'],brands:[],models:[],active:true,options:[QO('none-ok','None, everything works',0,'no-issues'),QO('i-batt','Battery drains fast or is swollen',0,'battery-low'),QO('i-sound','Speakers or mic',0,'sound-issue'),QO('i-kbd','Keyboard or trackpad',0,'keyboard-issue'),QO('i-charge','Charging port',0,'charge-issue')]},
  {id:'issues-watch',title:'Is anything not working properly?',help:'',type:'multi',cats:['watch'],brands:[],models:[],active:true,options:[QO('none-ok','None, everything works',0,'no-issues'),QO('i-batt','Battery drains fast',0,'battery-low'),QO('i-sound','Speaker or mic',0,'sound-issue'),QO('i-btn','Crown or side button',0,'button-issue'),QO('i-charge','Charging',0,'charge-issue')]},
  {id:'acc',title:'Which of the following accessories do you have? Select all that apply.',help:'',type:'multi',cats:ALLC,active:true,options:[QO('bill','Original Invoice / Purchase Bill',0,'bill'),QO('box','Original Box',0,'box'),QO('charger','Original Charger',0,'charger'),QO('none','None Available',0,'none')]}
];
/* ---------- model colours (edit in Admin > Pricing > Edit model) ---------- */
const MODEL_COLORS={
  ip18pm:[['Black','#2B2B2D'],['Silver','#E3E4E6'],['Glacier','#C9DCE6'],['Burgundy','#5E1F2C']],
  ip17pm:[['Cosmic Orange','#E3753A'],['Deep Blue','#2F3B55'],['Silver','#E6E6E8']],
  ip17p:[['Cosmic Orange','#E3753A'],['Deep Blue','#2F3B55'],['Silver','#E6E6E8']],
  ipair:[['Space Black','#1F2023'],['Cloud White','#F2F1EC'],['Light Gold','#E8DCC1'],['Sky Blue','#C7DDEB']],
  ip17:[['Black','#232325'],['White','#F4F4F2'],['Mist Blue','#A9BFD6'],['Sage','#A5B59A'],['Lavender','#C8B9DD']],
  ip16p:[['Black Titanium','#3C3C3D'],['White Titanium','#F2F1ED'],['Natural Titanium','#C2BCB2'],['Desert Titanium','#BFA48F']],
  ip16:[['Black','#3C4042'],['White','#F5F5F0'],['Pink','#F2ADDA'],['Teal','#B0D4D2'],['Ultramarine','#9AADF6']],
  ip15p:[['Black Titanium','#3B3B3C'],['White Titanium','#F2F1EB'],['Blue Titanium','#3F4A5A'],['Natural Titanium','#BAB4A9']],
  ip15:[['Black','#35393B'],['Blue','#D4E1E7'],['Green','#CAD4C5'],['Yellow','#F4EAB4'],['Pink','#E9D2D5']],
  ip14:[['Midnight','#222930'],['Starlight','#F0EBE3'],['Blue','#A0B4C7'],['Purple','#E5DDEA'],['Yellow','#F9E479'],['(PRODUCT)RED','#BA0C2E']],
  ip13:[['Midnight','#232A31'],['Starlight','#FAF6F2'],['Blue','#276787'],['Pink','#FAE0D8'],['Green','#394C38'],['(PRODUCT)RED','#BF0013']],
  s25u:[['Titanium Silverblue','#A3B3C4'],['Titanium Black','#3A3A3C'],['Titanium Gray','#8E8E8E'],['Titanium Whitesilver','#E4E4E2']],
  s24:[['Onyx Black','#2C2C2E'],['Marble Grey','#C9C8C3'],['Cobalt Violet','#6E5E8D'],['Amber Yellow','#F1DFA4']],
  zflip6:[['Blue','#8FA8C8'],['Yellow','#F2E39A'],['Mint','#C3E3D3'],['Silver Shadow','#BCBDBF']],
  a55:[['Awesome Iceblue','#BFD9EC'],['Awesome Lilac','#CDBFE0'],['Awesome Navy','#2E3A55']],
  op13:[['Black Eclipse','#1E1F24'],['Midnight Ocean','#1D2C4A'],['Arctic Dawn','#DCDCE6']],
  op12:[['Silky Black','#1F1F1F'],['Flowy Emerald','#2F6B53']],
  nord4:[['Obsidian Midnight','#24262B'],['Mercurial Silver','#C7C9CC'],['Oasis Green','#5E8C77']],
  px9p:[['Obsidian','#2B2D2F'],['Porcelain','#EFEBE3'],['Hazel','#8E9283'],['Rose Quartz','#EFC6C5']],
  px8:[['Obsidian','#2B2D2F'],['Hazel','#8C9182'],['Rose','#E9C9C3'],['Mint','#CDE7D9']],
  x200p:[['Titanium Grey','#8D8E90'],['Cosmos Black','#1F2022']],
  mi14:[['Matte Black','#222222'],['Jade Green','#8FB8A2'],['White','#F3F3F1']],
  np2:[['White','#F2F2F2'],['Dark Grey','#3E3F41']],
  'mba-m3':[['Midnight','#2E3642'],['Starlight','#F0E4D3'],['Space Grey','#7D7E80'],['Silver','#E3E4E5']],
  'mba-m2':[['Midnight','#2E3642'],['Starlight','#F0E4D3'],['Space Grey','#7D7E80'],['Silver','#E3E4E5']],
  'mba-m1':[['Space Grey','#7D7E80'],['Gold','#E6CDB6'],['Silver','#E3E4E5']],
  'mbp-m3p':[['Space Black','#2E2C2F'],['Silver','#E3E4E5']],
  'ipadpro-m4':[['Space Black','#2E2C2F'],['Silver','#E3E4E5']],
  'ipadair-m2':[['Space Grey','#7D7E80'],['Blue','#A7B8C9'],['Purple','#C9BED9'],['Starlight','#F0E4D3']],
  ipad10:[['Blue','#8FB0D2'],['Pink','#F0B5C3'],['Yellow','#F3DC7D'],['Silver','#E3E4E5']],
  tabs9:[['Graphite','#4A4B4D'],['Beige','#E6DCCB']],
  awu2:[['Natural Titanium','#C8C3B7'],['Black Titanium','#3A3A3C']],
  aws9:[['Midnight','#232A31'],['Starlight','#F0E8DD'],['Silver','#E3E4E5'],['Pink','#F4D3D3'],['(PRODUCT)RED','#BA0C2E']],
  gw6c:[['Black','#222222'],['Silver','#C9CACC']],
  opw2:[['Black Steel','#2A2B2D'],['Radiant Steel','#C9CACC']]
};
/* battery health bands: no price cut until you set one in Admin > Questions */
const BATT_BANDS=[{min:95,deduct:0},{min:90,deduct:0},{min:85,deduct:0},{min:80,deduct:0},{min:0,deduct:0}];
const BATT_LABEL=n=>n>=95?'Like new':n>=90?'Great':n>=85?'Good':n>=80?'Okay':'Service recommended';
const BATT_WHERE={phone:'On iPhone: Settings → Battery → Battery Health → Maximum Capacity.',watch:'On Apple Watch: Settings → Battery → Battery Health.',laptop:'On MacBook: System Settings → Battery → the ⓘ next to Battery Health.',tablet:''};
const qFor0=(Q,cat,m)=>(Q||[]).filter(q=>q.active!==false&&(q.cats||[]).includes(cat)&&(!m||((!(q.brands||[]).length||(q.brands||[]).some(b=>b.toLowerCase()===String(m.brand).toLowerCase()))&&(!(q.models||[]).length||q.models.includes(m.id))&&(q.type!=='color'||(m.colors||[]).length)))).map(q=>({...q,options:(q.options||[]).filter(o=>o.active!==false)})).filter(q=>q.type==='battery'||q.type==='color'||q.options.length);
const qFor=(Q,cat,m,ans)=>{const L=qFor0(Q,cat,m),vis={};let A=ans;if(!A){try{A=S.ans}catch(e){}}A=A||{};
  return L.filter(q=>{const ok=!q.when||q.when.some(c=>vis[c.q]&&(A[c.q]||[]).some(id=>c.opts.includes(String(id))));if(ok)vis[q.id]=1;return ok})};
const battBand=(q,n)=>[...(q.bands&&q.bands.length?q.bands:BATT_BANDS)].sort((a,b)=>b.min-a.min).find(b=>n>=b.min);
const ansOk=(q,m,a)=>{a=a||[];if(q.type==='battery'){const v=a[0];return v==='unsure'||(+v>=1&&+v<=100)}if(q.type==='color')return (m.colors||[]).some(c=>c[0]===a[0]);return a.some(id=>q.options.some(o=>o.id===id))};
function quoteQ(m,vi,ans,verified,Q,R){
  const v=m.variants[vi]||m.variants[0],top=m.base*v[1];let cut=0,complete=true;const detail=[];
  qFor(Q,m.cat,m,ans).forEach(q=>{
    const a=(ans||{})[q.id]||[];
    if(q.type==='battery'){
      if(!ansOk(q,m,a)){complete=false;return}
      if(a[0]==='unsure'){const c=+q.unsure||0;cut+=c;detail.push({q:q.title,a:['Not sure'],cut:c});return}
      const n=Math.round(+a[0]),b=battBand(q,n),c=b?(+b.deduct||0):0;cut+=c;detail.push({q:q.title,a:[n+'%'],cut:+c.toFixed(2)});return;
    }
    if(q.type==='color'){if(!ansOk(q,m,a)){complete=false;return}detail.push({q:q.title,a:[a[0]],cut:0});return}
    let picked=a.filter(id=>q.options.some(o=>o.id===id));if(q.type==='single')picked=picked.slice(0,1);
    if(!picked.length){complete=false;return}
    const opts=q.options.filter(o=>picked.includes(o.id)),c=opts.reduce((s,o)=>s+(+o.deduct||0),0);cut+=c;
    detail.push({q:q.title,a:opts.map(o=>o.label),cut:+c.toFixed(2)});
  });
  const bonus=verified?Math.max(0,((R&&R.verified)||1)-1)*100:0,total=Math.max(-50,Math.min(95,cut-bonus));
  let price=Math.round(top*(1-total/100)/10)*10;const floor=((R&&R.floor)||{})[m.cat]||1000;if(price<floor)price=floor;
  return{price,top:Math.round(top/10)*10,cut:+cut.toFixed(2),bonus:+bonus.toFixed(2),complete,answers:detail,variant:v[0]};
}
CATALOG.forEach(m=>{if(!m.colors||!m.colors.length)m.colors=MODEL_COLORS[m.id]||[]});
function fairFactorQ(Q,cat){let sum=0;qFor(Q,cat).forEach(q=>{if(q.type!=='single')return;const d=q.options.map(o=>+o.deduct||0).sort((a,b)=>a-b);sum+=d[Math.floor(d.length/2)]||0});return Math.max(.05,1-Math.min(95,sum)/100)}

/* Built-in questions for the offline preview. On recello.in they come from Admin → Questions, and the server works out the offer. */
const QUESTIONS=JSON.parse(JSON.stringify(SEED_Q));
let FAIR=null;
const questionsFor=x=>typeof x==='string'?qFor(QUESTIONS,x):qFor(QUESTIONS,x.cat,x);
const topPrice=(m,vi)=>r10(m.base*(m.variants[vi]||m.variants[0])[1]);
const topFor=m=>topPrice(m,m.variants.length-1);
const fairFactor=cat=>FAIR&&FAIR[cat]?FAIR[cat]:fairFactorQ(QUESTIONS,cat);
const localOffer=(m,vi,ans,verified)=>quoteQ(m,vi,ans,verified,QUESTIONS,RULES).price;
function optImg(o){
  const img=o.img||'';if(!img)return '';
  if(img.startsWith('preset:'))return `<span class="qimg">${svgIllus(img.slice(7))}</span>`;
  if(/^uploads\/[\w.%-]+$/.test(img))return `<span class="qimg"><img src="${esc(img)}" alt="" loading="lazy"></span>`;
  return '';
}
const CO2={phone:55,laptop:200,tablet:90,watch:20};
/* on narrow phones the search box shows only the example (the magnifier already says "search") */
function heroPh(full){const q=document.getElementById('heroQ');if(!q)return;if(full)q.dataset.ph=full;const f=q.dataset.ph||q.placeholder;q.dataset.ph=f;q.placeholder=innerWidth<420?f.replace(/^search[^,]*,\s*/i,''):f}
addEventListener('resize',()=>heroPh());setTimeout(heroPh,0);
/* AI helpers state (the code is further down, under "AI helpers") */
const AIX={on:false,ref:'',refModel:'',kind:'',q:'',front:'',back:'',shot:'',busy:false,res:null,err:'',opener:null,stream:null,timer:0};

/* ---------- state ---------- */
const savedOrders=store.get('orders',[]);
const S={
  cat:'phone',modelId:'ip15',vi:0,brand:'All',q:'',
  ans:{},step:1,offer:null,
  pickup:{date:null,slot:null,payout:'upi'},
  verified:false,
  orders:Array.isArray(savedOrders)?savedOrders.filter(o=>o&&typeof o.id==='string'&&o.type!=='buy'):[],
  city:store.get('city','Pune')
};
const CITIES=['Pune'];
if(!CITIES.includes(S.city))S.city=CITIES[0];
const model=()=>byId[S.modelId];
/* ---------- phone-first flow: one question at a time, offer reveal, bottom action bar ---------- */
const PHONE=window.matchMedia?matchMedia('(max-width:760px)'):{matches:false,addEventListener(){}};
const isPhone=()=>PHONE.matches;
S.qi=0;S.allModels=false;
const qpOn=()=>$('#condForm').classList.contains('qpager');
const qpList=()=>$$('#condForm .q[data-q]');
const qErrText=q=>q.type==='battery'?'Slide to your battery health, or tap I\'m not sure.':q.type==='color'?'Pick the colour.':q.type==='multi'?'Pick at least one.':'Choose an answer.';
function qpDecorate(){
  const f=$('#condForm'),qs=qpList();
  qs.forEach((q,i)=>{q.dataset.qi=i});
  f.classList.toggle('qpager',isPhone()&&qs.length>0);
  f.insertAdjacentHTML('afterbegin',`<div class="qp-head" id="qpHead"><button type="button" class="qp-prev" id="qpPrev" aria-label="Previous question"><svg class="i"><use href="#i-arrow"/></svg></button><div class="qp-meta"><b id="qpCount" aria-live="polite"></b><span class="qp-bar" aria-hidden="true"><i id="qpFill"></i></span></div></div>`);
  if(false)(f.lastChild).insertAdjacentHTML('afterend',`<div class="qp-done" id="qpDone"><span class="qp-burst" aria-hidden="true"><svg class="i"><use href="#i-check"/></svg></span><p class="qp-k" tabindex="-1">Your offer</p><b class="qp-price" id="qpPrice">${$('#qcPrice').textContent}</b><p class="qp-dev" id="qpDev"></p><ul class="qp-perks"><li><svg class="i"><use href="#i-lock"/></svg>Locked for 7 days</li><li><svg class="i"><use href="#i-truck"/></svg>Free pickup in <span data-city>${esc(S.city)}</span></li><li><svg class="i"><use href="#i-bolt"/></svg>Paid in cash or UPI at your door</li></ul><button type="button" class="qp-edit" id="qpEdit">Change my answers</button></div>`);
  qpDev();
  if(qpOn())qpShow(Math.min(S.qi,qs.length),false,true);
}
function qpDev(){const el=$('#qpDev');if(!el)return;const m=model(),c=(S.ans.color||[])[0];el.textContent=m.name+' · '+m.variants[S.vi][0]+(c?' · '+c:'')}
function qpFirstOpen(){const m=model(),qs=qpList();const k=qs.findIndex(el=>{const q=questionsFor(m).find(x=>x.id===el.dataset.q);return q&&!ansOk(q,m,S.ans[q.id])});return k<0?Math.max(0,qs.length-1):k}
function qpShow(i,focus,quiet){
  if(!qpOn())return;
  const f=$('#condForm'),qs=qpList(),n=qs.length,m=model();i=Math.max(0,Math.min(n-1,i));S.qi=i;
  qs.forEach((q,k)=>q.classList.toggle('cur',k===i));
  f.classList.toggle('at-end',i===n);
  const done=qs.filter(el=>{const q=questionsFor(m).find(x=>x.id===el.dataset.q);return q&&ansOk(q,m,S.ans[q.id])}).length;
  $('#qpCount').textContent=`Question ${i+1} of ${n}`;
  $('#qpFill').style.width=Math.round(done/Math.max(1,n)*100)+'%';
  $('#qpPrev').disabled=i===0;
  updBar();
  if(!quiet){
    const st=$('#steps'),top=st.getBoundingClientRect().top;
    if(top<56||top>innerHeight*.35)st.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
    if(focus){const t=qs[i].querySelector('.q-label');if(t){t.setAttribute('tabindex','-1');t.focus({preventScroll:true})}}
  }
  saveDraft();
}
function qpNext(){
  const qs=qpList(),i=S.qi,m=model();
  if(i<qs.length){const q=questionsFor(m).find(x=>x.id===qs[i].dataset.q);
    if(q&&!ansOk(q,m,S.ans[q.id])){const em=qs[i].querySelector('[data-qerr]');if(em)em.textContent=qErrText(q);return}}
  if(i+1>=qs.length){goStep(3);return}
  qpShow(i+1,true);
}
let qpT=0;
const qpAuto=()=>{if(!qpOn())return;clearTimeout(qpT);qpT=setTimeout(qpNext,reduceMotion?60:300)};
$('#condForm').addEventListener('click',e=>{
  if(e.target.closest('#qpPrev')){qpShow(S.qi-1,true);return}
  if(e.target.closest('#qpEdit')){qpShow(0,true)}
});

/* bottom action bar */
function updBar(){
  const b=$('#actBar');if(!b)return;
  const st=S.step,n=qpList().length;
  const go=st===1?'Continue':st===2?(qpOn()&&S.qi<n-1?'Next':'See my offer'):st===3?(S.vphone?'Book free pickup':OTP.sent?'Verify':'Send OTP'):'Confirm pickup';
  $('#abGo').innerHTML=esc(go)+' <svg class="i"><use href="#i-arrow"/></svg>';
  $('#abBack').hidden=st===1;
  barVis();
}
/* the bar's position needs a layout pass: do it once per frame, not in the middle of rendering */
let barRaf=0;
function barVis(){if(!barRaf)barRaf=requestAnimationFrame(()=>{barRaf=0;barVisNow()})}
function barVisNow(){
  const b=$('#actBar');if(!b)return;
  const r=$('#wizard').getBoundingClientRect(),on=isPhone()&&S.step<5&&r.top<innerHeight*.55&&r.bottom>140;
  if(on===barVisNow.on)return;barVisNow.on=on;   // touch the page only when it changes (this runs while scrolling)
  document.body.classList.toggle('ab-on',on);b.setAttribute('aria-hidden',String(!on));
  $$('#actBar button').forEach(x=>{x.tabIndex=on?0:-1});
}
$('#abGo').addEventListener('click',()=>{if(S.step===2&&qpOn())qpNext();else $('#wzNext').click()});
$('#abBack').addEventListener('click',()=>{if(S.step===2&&qpOn()&&S.qi>0)qpShow(S.qi-1,true);else $('#wzBack').click()});
new MutationObserver(()=>{$('#abGo').disabled=$('#wzNext').disabled}).observe($('#wzNext'),{attributes:true,attributeFilter:['disabled']});
const syncPrice=()=>{const q=$('#qcPrice'),l=$('#qcLbl').textContent,m=model(),ab=$('#abPrice'),lk=q.classList.contains('locked');ab.innerHTML=q.innerHTML;ab.classList.toggle('locked',lk);$('#abLbl').textContent=(l||'Up to')+(lk?' · locked':'')+' · '+m.name};
new MutationObserver(syncPrice).observe($('#qcPrice'),{childList:true,characterData:true,subtree:true});
new MutationObserver(syncPrice).observe($('#qcLbl'),{childList:true,characterData:true,subtree:true});
addEventListener('scroll',barVis,{passive:true});
addEventListener('resize',barVis);
/* hide the bar while the keyboard is open */
document.addEventListener('focusin',e=>{if(isPhone()&&e.target.matches('input:not([type=range]):not([type=checkbox]),textarea,select'))document.body.classList.add('kb')});
document.addEventListener('focusout',()=>{setTimeout(()=>{const a=document.activeElement;if(!a||!a.matches('input:not([type=range]):not([type=checkbox]),textarea,select'))document.body.classList.remove('kb')},120)});
PHONE.addEventListener&&PHONE.addEventListener('change',()=>{renderModels();renderCond();updBar()});

/* saved progress and saved contact details (this browser only) */
let draftT=0;
function saveDraft(){clearTimeout(draftT);draftT=setTimeout(()=>{store.set('draft',S.step>=5?null:{t:Date.now(),cat:S.cat,modelId:S.modelId,vi:S.vi,ans:S.ans,step:Math.min(S.step,4),qi:S.qi})},250)}
function loadDraft(){const d=store.get('draft',null);return d&&d.t&&Date.now()-d.t<3*864e5&&byId[d.modelId]&&catOn(byId[d.modelId].cat)?d:null}
let contactFilled=false;
function prefillContact(){
  if(contactFilled)return;contactFilled=true;const c=store.get('contact',null);if(!c)return;let n=0;
  [['pfName','name'],['pfPhone','phone'],['pfPin','pin'],['pfAddr','addr']].forEach(([id,k])=>{const el=$('#'+id);if(el&&!el.value&&c[k]){el.value=c[k];n++}});
  if(c.payout==='cash'||c.payout==='upi')S.pickup.payout=c.payout;
  const note=$('#savedNote');if(note&&n)note.hidden=false;
}

function renderResume(){
  const el=$('#resumeBtn');if(!el)return;const d=loadDraft(),m=d&&byId[d.modelId];
  const answered=d&&Object.keys(d.ans||{}).length;
  el.hidden=!(m&&(answered||d.step>1));if(el.hidden)return;
  el.innerHTML=`<svg class="i"><use href="#i-arrow"/></svg>Continue your ${esc(m.name)} quote`;
}
$('#resumeBtn').addEventListener('click',()=>{if(S.step>=2)document.body.classList.toggle('funnel',isPhone());pageScroll($('#wizard'),'start',true)});
/* ---------- the offer stays locked until the customer verifies their mobile with an OTP ---------- */
const OTP={phone:'',sent:false,timer:0,left:0,demo:null,busy:false};
S.vphone=null;S.vtoken=null;S.held=null;
(()=>{const o=store.get('otp',null);if(o&&o.t&&Date.now()-o.t<30*864e5&&/^[6-9]\d{9}$/.test(o.phone||'')){S.vphone=o.phone;S.vtoken=o.token||null}})();
const fmtHeld=t=>new Date(t).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
const lockBlocks=top=>'<span class="lk-amt" aria-label="Locked offer">'+(top>0?inr(top):'₹00,000').replace(/\d/g,'<i></i>')+'</span>';
function forgetPhone(){S.vphone=null;S.vtoken=null;S.held=null;S.offer=null;store.set('otp',null);if(PRICE_GATE)setTimeout(repaintPrices)}
/* hidden prices: the server sends them once the mobile is verified */
/* orders made on this number from another phone or before a reinstall (server: action my_orders) */
let ordSync=0;
async function syncOrders(){
  if(!LIVE||!S.vtoken||Date.now()-ordSync<15000)return;ordSync=Date.now();
  try{
    const r=await apiPost('my_orders',{token:S.vtoken}),have=new Set(S.orders.map(o=>o.id));let add=false;
    (r.orders||[]).forEach(o=>{
      if(!have.has(o.id)){S.orders.push(o);add=true}
      else{const l=S.orders.find(x=>x.id===o.id);if(l&&!l.key&&o.key){l.key=o.key;add=true}}
    });
    if(add){S.orders.sort((a,b)=>(b.created||0)-(a.created||0));S.orders=S.orders.slice(0,20);store.set('orders',S.orders);renderRecent();if(PGV.cur==='orders')renderPage('orders')}
  }catch(e){if(e&&e.status===401)forgetPhone()}
}
async function loadPrices(){
  syncOrders();
  if(!PRICE_GATE||!S.vphone)return;
  if(!PRICES_IN){
    if(!LIVE||!S.vtoken)return;
    try{const r=await apiPost('prices',{token:S.vtoken}),b=r.bases||{};CATALOG.forEach(m=>{if(b[m.id]!=null)m.base=+b[m.id]});PRICES_IN=true}
    catch(e){if(e.status===401)forgetPhone();return}
  }
  repaintPrices();
}
function repaintPrices(){
  heroOffer();renderTicker();renderBrandTiles();renderModels();renderVariants();renderPulse();
  if(!S.vphone||!answersComplete(model()))renderQuote();
  if(S.step===3&&!S.vphone)renderOffer();
}
async function fetchOffer(m){
  if(LIVE){
    try{const r=await apiPost('unlock',{token:S.vtoken,model:m.id,vi:S.vi,answers:S.ans,verified:isVerifiedFor(m)});
      return{price:r.price,until:r.lock_until?new Date(r.lock_until+'T23:59:00').getTime():Date.now()+7*864e5,top:r.top,now:r.now}}
    catch(e){if(e.status===401){forgetPhone();renderQuote();if(S.step===3)renderOffer();toast('Please verify your mobile number again.')}throw e}
  }
  if(!PRICES_IN)throw{message:'Couldn\'t load today\'s prices. Check your connection and try again.'};
  const key=S.modelId+'|'+S.vi+'|'+JSON.stringify(Object.keys(S.ans).sort().map(k=>[k,S.ans[k]]));
  const held=(store.get('held',{})||{})[key],now=Date.now(),p=localOffer(m,S.vi,S.ans,isVerifiedFor(m));
  if(held&&held.until>now)return{price:Math.max(held.price,p),until:held.until,now:p};
  const h={price:p,until:now+7*864e5};const all=store.get('held',{})||{};all[key]=h;store.set('held',all);return{...h,now:p};
}
function renderOffer(){
  const m=model(),c=(m.colors||[]).find(x=>x[0]===(S.ans.color||[])[0]);
  $('#vaultDev').innerHTML=`${esc(m.name)} · ${esc(m.variants[S.vi][0])}${c?` · <span class="qc-col" style="--c:${esc(c[1])}"><i></i>${esc(c[0])}</span>`:''}`;
  setVault(S.vphone?'open':OTP.sent?'code':'locked',false);
}
function setVault(st,anim){
  const v=$('#vault'),m=model(),top=gated()?0:topPrice(m,S.vi);v.dataset.state=st;
  $('#otpPhoneForm').hidden=st!=='locked';$('#otpCodeForm').hidden=st!=='code';paintOtpSteps(st);if(st==='locked')paintPhoneCount();
  if(st==='open'){
    $('#vaultTag').textContent='Unlocked';$('#vaultK').textContent='Your offer';
    v.classList.toggle('pop',!!anim);
    const amt=$('#vaultAmt');
    if(S.offer!=null&&S.held){if(anim){amt.dataset.v=Math.round(S.offer*.6);amt.textContent=inr(Math.round(S.offer*.6));setTimeout(()=>tweenPrice(amt,S.offer),380)}else{amt.dataset.v=S.offer;amt.textContent=inr(S.offer)}
      $('#vaultSub').textContent='Held for you until '+fmtHeld(S.held.until)+'. Price-list changes can\'t lower it before then.'}
    else{amt.innerHTML=lockBlocks(top);$('#vaultSub').textContent='Opening your offer…'}
    $('#vaultVerified').hidden=false;$('#vaultPhone').textContent='+91 '+S.vphone.replace(/(\d{5})(\d{5})/,'$1 $2');
  }else{
    v.classList.remove('pop');$('#vaultVerified').hidden=true;
    $('#vaultTag').textContent='Ready';$('#vaultK').textContent='Your offer is ready';
    $('#vaultAmt').innerHTML=lockBlocks(top);
    $('#vaultSub').textContent=st==='code'?'Enter the code and your offer opens.':'Verify your mobile number to unlock it. It takes about 20 seconds.';
  }
  paintMore(st==='open'&&S.offer!=null&&!!S.held);
  stepLabel();updBar();if(window.RC_LX)paintToday();
}
async function revealVault(){
  const m=model();setVault('open',false);
  try{const r=await fetchOffer(m);S.offer=r.price;S.held=r;tweenPrice($('#qcPrice'),r.price);setVault('open',true);
    const k=$('#vaultK');k.focus({preventScroll:true});}
  catch(e){if(S.vphone)$('#vaultSub').textContent=e.message||'Couldn\'t open your offer. Check your connection and try again.'}
}
function paintBoxes(){const v=$('#otpCode').value.replace(/\D/g,'').slice(0,6);$('#otpCode').value=v;$$('#otpBoxes span').forEach((s,i)=>{const was=s.textContent;s.textContent=v[i]||'';if(v[i]&&v[i]!==was){s.classList.remove('pop');void s.offsetWidth;s.classList.add('pop')}s.classList.toggle('on',i===Math.min(v.length,3)&&document.activeElement===$('#otpCode'))})}
function startResend(){clearInterval(OTP.timer);const b=$('#otpResend'),ring=$('#otpRing'),all=Math.max(1,OTP.left);ring.classList.remove('off');
  const tick=()=>{if(OTP.left<=0){clearInterval(OTP.timer);b.disabled=false;b.textContent='Resend code';ring.classList.add('off');return}b.disabled=true;b.textContent='Resend in 0:'+String(OTP.left).padStart(2,'0');ring.style.setProperty('--p',(OTP.left/all).toFixed(3));OTP.left--};tick();OTP.timer=setInterval(tick,1000)}
function paintOtpSteps(st){$$('#otpSteps li').forEach((li,i)=>{const n=st==='locked'?0:st==='code'?1:2;li.classList.toggle('on',i===n);li.classList.toggle('done',i<n)});$('#otpSteps').hidden=st==='open'}
function paintPhoneCount(){const v=$('#otpPhone').value.replace(/\D/g,'');$('#otpCount').textContent=v.length+'/10';$('#otpPhBox').classList.toggle('ok',/^[6-9]\d{9}$/.test(v))}
async function otpSend(resend){
  if(OTP.busy)return;
  const ph=resend?OTP.phone:$('#otpPhone').value.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,''),er=$('#otpPhoneErr');
  if(!/^[6-9]\d{9}$/.test(ph)){er.textContent='Enter a 10-digit Indian mobile number.';$('#otpPhone').focus();return}
  er.textContent='';OTP.busy=true;const btn=$('#otpSend');btn.disabled=true;$('#abGo').disabled=true;
  try{
    if(LIVE){const r=await apiPost('otp_send',{phone:ph});OTP.demo=r.dev_code||null;OTP.left=r.resend_in||30}
    else{OTP.demo=String(1000+Math.floor(Math.random()*9000));OTP.left=30}
    OTP.phone=ph;OTP.sent=true;$('#otpTo').textContent='+91 '+ph.replace(/(\d{5})(\d{5})/,'$1 $2');
    const d=$('#otpDemo');d.hidden=!OTP.demo;d.textContent=OTP.demo?(LIVE?'Test mode. Your code is ':'Preview only, no text is sent. Your code is ')+OTP.demo:'';
    $('#otpSmsTxt').innerHTML=OTP.demo?`${LIVE?'Test mode. ':'Preview, no text sent. '}Your code is <i>${esc(OTP.demo)}</i>`:'Your Recello code is <i>• • • •</i>';
    const sm=$('.otp-sms');sm.style.animation='none';void sm.offsetWidth;sm.style.animation='';
    $('#otpCodeErr').textContent='';$('#otpCode').value='';setVault('code');paintBoxes();$('#otpCode').focus();startResend();
    if(resend)toast('New code sent');
  }catch(e){(resend?$('#otpCodeErr'):er).textContent=e.message||'Couldn\'t send the code. Try again.'}
  finally{OTP.busy=false;btn.disabled=false;$('#abGo').disabled=false}
}
async function otpVerify(){
  if(OTP.busy)return;
  const code=$('#otpCode').value.replace(/\D/g,''),er=$('#otpCodeErr');
  if(code.length!==6){er.textContent='Enter all 6 digits.';$('#otpCode').focus();return}
  OTP.busy=true;$('#abGo').disabled=true;er.textContent='';$('#otpBoxes').classList.add('checking');
  try{
    if(LIVE){const r=await apiPost('otp_verify',{phone:OTP.phone,code});S.vtoken=r.token}
    else if(code!==OTP.demo)throw{message:'That code doesn\'t match. Check the message and try again.'};
    $('#otpBoxes').classList.add('done');await new Promise(r=>setTimeout(r,reduceMotion?0:380));$('#otpBoxes').classList.remove('done');
    S.vphone=OTP.phone;store.set('otp',{phone:S.vphone,token:S.vtoken||null,t:Date.now()});
    clearInterval(OTP.timer);OTP.sent=false;loadPrices();px('Lead',{content_name:model().name,content_category:'otp'});
    renderQuote();await revealVault();
  }catch(e){er.textContent=e.message||'Couldn\'t check the code. Try again.';$('#otpCode').value='';paintBoxes();const b=$('#otpBoxes');b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');$('#otpCode').focus()}
  finally{OTP.busy=false;$('#abGo').disabled=false;$('#otpBoxes').classList.remove('checking')}
}
/* every phone field accepts +91, spaces, dashes or a leading 0, and keeps just the 10 digits */
document.addEventListener('input',e=>{const t=e.target;if(!t.matches||!t.matches('input[type=tel]'))return;let v=t.value.replace(/\D/g,'');if(v.length>10&&v.startsWith('91'))v=v.slice(2);if(v.length>10&&v.startsWith('0'))v=v.slice(1);v=v.slice(0,10);if(v!==t.value)t.value=v;const er=t.id==='otpPhone'&&$('#otpPhoneErr');if(er)er.textContent=''});
$('#otpPhoneForm').addEventListener('submit',e=>{e.preventDefault();otpSend(false)});
$('#otpPhone').addEventListener('input',paintPhoneCount);
$('#otpCodeForm').addEventListener('submit',e=>{e.preventDefault();otpVerify()});
$('#otpCode').addEventListener('input',()=>{paintBoxes();$('#otpCodeErr').textContent='';if($('#otpCode').value.length===6)otpVerify()});
$('#otpCode').addEventListener('focus',paintBoxes);$('#otpCode').addEventListener('blur',paintBoxes);
$('#otpBoxes').addEventListener('click',()=>$('#otpCode').focus());
$('#otpResend').addEventListener('click',()=>otpSend(true));
$('#otpChange').addEventListener('click',()=>{OTP.sent=false;clearInterval(OTP.timer);$('#otpPhone').value=OTP.phone;setVault('locked');$('#otpPhone').focus()});
$('#vaultNotMe').addEventListener('click',()=>{forgetPhone();OTP.sent=false;renderQuote();setVault('locked');$('#otpPhone').focus()});
function stepLabel(){
  const n=S.step,lab=n===1?'Continue to condition':n===2?'See my offer':n===3?(S.vphone?'Book free pickup':OTP.sent?'Unlock my offer':'Send OTP'):'Confirm pickup';
  $('#wzNext').innerHTML=lab+' <svg class="i"><use href="#i-arrow"/></svg>';
  const as=$('#wzAssure');if(as)as.hidden=!(n===4||(n===3&&S.vphone));
}

/* ---------- focus mode on phones: once the quiz starts, only the quiz is on screen ---------- */
function setFunnel(){document.body.classList.toggle('funnel',isPhone()&&S.step>=2)}
$('#funnelExit').addEventListener('click',()=>{document.body.classList.remove('funnel');window.scrollTo({top:0,behavior:reduceMotion?'auto':'smooth'});toast('Saved. Your answers are here when you come back.')});
document.addEventListener('click',e=>{const a=e.target.closest('a[href^="#"]');if(a&&document.body.classList.contains('funnel')&&a.getAttribute('href')!=='#sell')document.body.classList.remove('funnel')},true);

/* the phone's back button moves back one step instead of leaving the site */
let popping=false;
function pushStep(n){if(popping||n<2||n>4)return;try{history.pushState({rc:n},'')}catch(_){}}
addEventListener('popstate',e=>{if(window.hsEats&&hsEats())return;if(window.RC_PG&&(RC_PG.cur||(e.state&&(e.state.pg||e.state.sm))))return;if(S.step>=5)return;const st=e.state&&e.state.rc;if(S.step<=1&&!st)return;popping=true;try{goStep(st&&st<S.step?st:Math.max(1,S.step-1))}finally{popping=false}});

/* one gentle reminder: leaving with an offer waiting (desktop), coming back to the tab (phones) */
let nudged=false,hiddenAt=0;
function nudgeText(){const m=model();return S.vphone&&S.held?`Your ${m.name} offer of ${inr(S.offer)} is held until ${fmtHeld(S.held.until)}. Pick a free pickup slot to keep it.`:`Your ${m.name} offer is ready. Verify your mobile number to see it. It takes about 20 seconds.`}
function showNudge(){
  if(nudged||S.step<2||S.step>=5||!answersComplete(model()))return;nudged=true;
  const n=$('#nudge');$('#nudgeText').textContent=nudgeText();$('#nudgeGo').textContent=S.vphone?'Book my pickup':'See my offer';n.hidden=false;$('#nudgeGo').focus();
}
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&e.clientY<8&&!isPhone())showNudge()});
document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();return}if(hiddenAt&&Date.now()-hiddenAt>15000&&S.step>=2&&S.step<5&&answersComplete(model()))toast(S.vphone&&S.held?`Welcome back. Your offer is held until ${fmtHeld(S.held.until)}.`:'Welcome back. Your offer is ready when you are.')});
$('#nudge').addEventListener('click',e=>{if(e.target.closest('#nudgeGo')){$('#nudge').hidden=true;goStep(S.vphone?4:3);pageScroll($('#wizard'),'start',true)}else if(e.target.closest('[data-nclose]')||e.target.id==='nudge')$('#nudge').hidden=true});



/* ---------- header ---------- */
/* the menu button opens the side menu (see "menu and pages" near the end) */
$$('#nav a').forEach(a=>a.addEventListener('click',()=>{$('#nav').classList.remove('open');$('#menuBtn').setAttribute('aria-expanded','false')}));
function paintCity(){$$('[data-city]').forEach(el=>{el.textContent=S.city});$$('[data-city-icon]').forEach(el=>{el.innerHTML=landmarkSvg(iconFor(S.city))});$$('[data-live-cities]').forEach(el=>{el.textContent=listTxt(CITIES)});if(typeof paintRapidBadge==='function')paintRapidBadge()}
function renderCities(wait){$('#cityChips').innerHTML=`<p class="city-sec">Pickups and repairs</p><div class="city-grid">${CITIES.map(c=>`<button type="button" class="city-card" data-c="${esc(c)}" aria-pressed="${c===S.city}">${landmarkSvg(iconFor(c))}<b>${esc(c)}</b><small>${c===S.city?'Selected':'Available'}</small></button>`).join('')}</div>${SOON.length?`<p class="city-sec">Coming soon</p><div class="city-grid">${SOON.map(c=>`<button type="button" class="city-card soon" data-soon="${esc(c)}" aria-pressed="${c===wait}">${landmarkSvg(iconFor(c))}<b>${esc(c)}</b><small>${joinedWait(c)?'On the list':'Coming soon'}</small></button>`).join('')}</div>`:''}`;renderWait(wait)}
let lastFocus=null;
function openCity(wait){wait=typeof wait==='string'?wait:null;if($('#cityModal').hidden)lastFocus=document.activeElement;renderCities(wait);$('#cityModal').hidden=false;const f=wait&&$('#waitPhone');(f||$('#cityModal [data-close]')).focus()}
function closeCity(){if($('#cityModal').hidden)return;$('#cityModal').hidden=true;if(lastFocus&&lastFocus.focus)lastFocus.focus()}
$('#cityBtn').addEventListener('click',openCity);
$('#cityModal').addEventListener('click',e=>{if(e.target.id==='cityModal'||e.target.closest('[data-close]'))closeCity()});
$('#cityChips').addEventListener('click',e=>{const w=e.target.closest('[data-soon]');if(w){renderCities(w.dataset.soon);const f=$('#waitPhone');if(f)f.focus();return}const b=e.target.closest('[data-c]');if(!b)return;S.city=b.dataset.c;store.set('city',S.city);paintCity();renderFootCities();closeCity();toast('Showing pickup for '+S.city)});
$('#cityWait').addEventListener('submit',async e=>{
  e.preventDefault();const c=$('#cityWait').dataset.city,ph=$('#waitPhone').value.replace(/\D/g,''),er=$('#waitErr');
  if(!/^[6-9]\d{9}$/.test(ph)){er.textContent='Enter a 10-digit mobile number.';return}er.textContent='';
  const btn=e.target.querySelector('button');btn.disabled=true;
  if(LIVE){try{await apiPost('waitlist_join',{city:c,phone:ph})}catch(err){btn.disabled=false;er.textContent=err.message||'Could not save your number. Try again.';return}}
  const l=store.get('waitlist',[])||[];if(!l.includes(c))l.push(c);store.set('waitlist',l);
  renderCities(c);toast('We\'ll message you when Recello reaches '+c);
});
$('#footCities').addEventListener('click',e=>{const a=e.target.closest('[data-fc]'),b=e.target.closest('[data-fcs]');if(a){S.city=a.dataset.fc;store.set('city',S.city);paintCity();toast('Showing pickup for '+S.city)}if(b)openCity(b.dataset.fcs)});
renderFootCities();
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  if(!$('#disp').hidden){endDisp(null);return}
  if(!$('#cityModal').hidden){closeCity();return}
  if(!$('#chat').hidden){closeChat();return}
  if(HS.on){hsClose();return}
  $('#heroSuggest').hidden=true;
});
if('IntersectionObserver' in window){
  const links=$$('#nav a');
  const io=new IntersectionObserver(es=>{es.forEach(en=>{if(en.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.getAttribute('href')==='#'+en.target.id))})},{rootMargin:'-45% 0px -50% 0px'});
  links.forEach(a=>{const s=document.getElementById(a.getAttribute('href').slice(1));if(s)io.observe(s)});
}

/* ---------- hero ---------- */
/* ---------- search: instant and forgiving ("ip 14 pm", "s23ultra", "samsng galaxy", "1+ 12", "redmi note13") ----------
   Every word must match a word of the model (whole word, the start of one while typing, or with one typo);
   with 3 or more words one may be missing. Best matches first, popular models break ties. */
const SQ_PHRASE=[[' 1 plus ',' oneplus '],[' one plus ',' oneplus '],[' i phone ',' iphone '],[' pm ',' pro max '],[' promax ',' pro max '],[' rn ',' redmi note '],[' iwatch ',' apple watch '],[' mbp ',' macbook pro '],[' mba ',' macbook air '],[' 5 g ',' 5g ']];
const SQ_ALT={ip:['iphone'],iph:['iphone'],ifone:['iphone'],iphon:['iphone'],sam:['samsung'],samsang:['samsung'],gal:['galaxy'],op:['oneplus'],moto:['motorola','moto'],mi:['mi','xiaomi'],google:['google','pixel'],apple:['apple','iphone','ipad','macbook'],tab:['tab','tablet','ipad','pad'],watch:['watch','galaxy watch']};
function sqPrep(q){
  let t=' '+String(q||'').toLowerCase().replace(/\+/g,' plus ').replace(/(\d+)\s?(gb|tb)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/([a-z])(\d)/g,'$1 $2').replace(/(\d)([a-z])/g,'$1 $2').replace(/\s+/g,' ').trim()+' ';
  t=' '+t;SQ_PHRASE.forEach(([a,b])=>{while(t.includes(a))t=t.replace(a,b)});
  return t.trim().split(' ').filter(Boolean);
}
function sqIndex(){CATALOG.forEach(m=>{const w=sqPrep(m.brand+' '+m.name+(m.series?' '+m.series:'')+(m.brand==='Apple'&&m.cat==='phone'?' iphone':''));m._w=[...new Set(w)];m._t=' '+w.join(' ')+' ';m._n=' '+sqPrep(m.name).join(' ')+' '})}
function dl(a,b,max){   // edit distance with swaps, stops early once it passes `max`
  if(Math.abs(a.length-b.length)>max)return max+1;const d=[];for(let i=0;i<=a.length;i++){d[i]=[i];for(let j=1;j<=b.length;j++)d[i][j]=i?0:j}
  for(let i=1;i<=a.length;i++){let row=max+1;for(let j=1;j<=b.length;j++){const c=a[i-1]===b[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);row=Math.min(row,d[i][j])}if(row>max)return max+1}
  return d[a.length][b.length]}
function sqTok(tok,m,last){
  const alts=SQ_ALT[tok]||[tok],num=/^\d+$/.test(tok);let best=0;
  for(const a of alts)for(const w of m._w){
    if(w===a)return 3;
    if(w.startsWith(a)&&(last||(!num&&a.length>=2))){best=Math.max(best,last?2.4:2);continue}
    if(!num&&a.length>=4&&w.length>=3&&!/^\d/.test(w)&&dl(a,w,a.length>=7?2:1)<=(a.length>=7?2:1))best=Math.max(best,1.2);
  }
  return best;
}
const POP_SET=new Set(POP_GRID);
function searchModels(q,pool,lim){
  const toks=sqPrep(q);if(!toks.length)return [];
  if(!CATALOG[0]||!CATALOG[0]._w)sqIndex();
  const n=toks.length,allow=n>=3?1:0,out=[],qs=' '+toks.join(' ');
  for(const m of pool||CATALOG){
    if(!m._w)sqIndex();
    let sc=0,miss=0;
    for(let i=0;i<n;i++){const v=sqTok(toks[i],m,i===n-1);if(!v&&++miss>allow)break;sc+=v}
    if(miss>allow)continue;
    if(m._n.startsWith(qs+' ')||m._n===qs+' ')sc+=5;else if(m._t.includes(qs+' '))sc+=4;else if(m._t.includes(qs))sc+=2;
    out.push([sc-miss*3-m.name.length*.03+(POP_SET.has(m.id)?1.5:0),m]);
  }
  return out.sort((a,b)=>b[0]-a[0]).slice(0,lim||8).map(x=>x[1]);
}
/* bold the words the customer typed */
function sqMark(name,q){const toks=sqPrep(q);if(!toks.length)return esc(name);
  return name.split(/(\s+)/).map(w=>{const p=sqPrep(w);return p.length&&p.some(x=>toks.some(t=>(SQ_ALT[t]||[t]).some(a=>x===a||x.startsWith(a))))?`<b>${esc(w)}</b>`:esc(w)}).join('')}
function brandHits(q){const t=sqPrep(q);if(t.length!==1||t[0].length<2)return [];const c=phoneBrands();
  return [...c.keys()].filter(b=>{const n=b.toLowerCase();return n.startsWith(t[0])||(t[0].length>=4&&dl(t[0],n.slice(0,t[0].length),1)<=1)}).slice(0,3).map(b=>[b,c.get(b)])}
function matchModels(q){return searchModels(q,sellPool(),6)}
function variantFrom(m,text){
  const mm=String(text).match(/(\d+)\s?(gb|tb)/i)||String(text).match(/\b(64|128|256|512)\b()/);if(!mm)return 0;
  const want=(mm[1]+(mm[2]||'gb')).toLowerCase();
  const i=m.variants.findIndex(v=>v[0].toLowerCase().replace(/\s/g,'').includes(want));
  return i<0?0:i;
}
const heroQ=$('#heroQ'),sug=$('#heroSuggest');
const CAT_LBL={phone:'Phone',laptop:'Laptop',tablet:'Tablet',watch:'Watch'};
const sugRow=(m,q)=>`<button type="button" class="sug" role="option" data-id="${m.id}">${thumb(m.cat,m.id,7)}<span class="n">${sqMark(m.name,q)}${m.cat!=='phone'?`<i class="sug-cat">${CAT_LBL[m.cat]||''}</i>`:''}</span><span class="p st">${esc(storRange(m))}</span></button>`;
function paintSuggest(){
  const v=heroQ.value.trim();
  if(!v){const pop=POP_GRID.map(id=>byId[id]).filter(Boolean).slice(0,5),br=[...phoneBrands().entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
    sug.innerHTML=`<p class="sug-h">Popular right now</p>${pop.map(m=>sugRow(m,'')).join('')}<p class="sug-h">Or pick a brand</p><div class="sug-brands">${br.map(([b,n])=>`<button type="button" data-sb="${esc(b)}">${esc(b)}<i>${n}</i></button>`).join('')}</div>`;
    sug.hidden=false;return}
  const list=searchModels(v,sellPool(),7),bh=brandHits(v);
  const later=list.length<3?searchModels(v,CATALOG.filter(m=>catSt(m.cat)==='soon'),3):[];
  const soon=later.length?`<p class="sug-soon"><b>${esc(later[0].name)}${later.length>1?' and similar':''}</b>${esc(soonLine())}</p>`:'';
  const brands=bh.length?`<div class="sug-brands">${bh.map(([b,n])=>`<button type="button" data-sb="${esc(b)}">All ${esc(b)} phones<i>${n}</i></button>`).join('')}</div>`:'';
  if(!list.length){if(v.length<2&&!brands&&!soon&&!HS.on){sug.hidden=true;return}
    sug.innerHTML=brands+soon+(soon?'':`<button type="button" class="sug-req" data-req-open data-req-model="${esc(v)}">No match for “${esc(v)}”. Get a price for it →</button>`);sug.hidden=false;return}
  sug.innerHTML=brands+list.map(m=>sugRow(m,v)).join('')+soon;
  sug.hidden=false;
}
/* phones: the search opens as its own screen that drops from the top. The box sits at the top of the screen,
   the list right under it and above the keyboard, and the page underneath never scrolls or jumps.
   Back (button, phone's back key or a tap on the green) closes it. */
const HS={on:false,pushed:false,eat:0,after:null,t:0,ph:null,full:innerHeight};
const hsForm=$('#heroSearch'),hsClearB=$('#hsClear'),ROOT=document.documentElement;
window.hsEats=()=>HS.on||Date.now()<HS.eat;
function hsFit(){
  if(!HS.on)return;
  const vv=window.visualViewport,vh=vv?vv.height:innerHeight,top=hsForm.getBoundingClientRect().bottom+12;
  const kbUp=(!!vv&&vv.height<innerHeight*.82)||innerHeight<HS.full*.82,typing=document.activeElement===heroQ&&matchMedia('(pointer:coarse)').matches;
  /* inside a frame the page can't see the keyboard: while typing, keep the list in the top part of the screen */
  const room=typing&&!kbUp?Math.min(vh,innerHeight*.56):vh;
  ROOT.style.setProperty('--hs-max',Math.max(170,Math.floor(room-top-14))+'px');
}
addEventListener('resize',()=>{const a=document.activeElement;if(!a||!a.matches('input,textarea,select'))HS.full=innerHeight});   // screen height without a keyboard
function hsOpen(){
  if(HS.on||!isPhone())return;
  HS.on=true;
  const ph=document.createElement('div');ph.className='hs-ph';ph.setAttribute('aria-hidden','true');ph.style.height=hsForm.offsetHeight+'px';ph.style.order=getComputedStyle(hsForm).order;hsForm.after(ph);HS.ph=ph;
  ROOT.classList.add('hs-on');
  try{history.pushState({hs:1},'');HS.pushed=true}catch(_){HS.pushed=false}
  hsFit();
}
function hsDone(){clearTimeout(HS.t);const f=HS.after;HS.after=null;if(f)f()}
function hsClose(then){
  if(!HS.on){if(then)then();return}
  HS.on=false;ROOT.classList.remove('hs-on');if(HS.ph){HS.ph.remove();HS.ph=null}
  sug.hidden=true;if(document.activeElement===heroQ)heroQ.blur();
  if(HS.pushed){HS.pushed=false;HS.eat=Date.now()+1500;HS.after=then||null;HS.t=setTimeout(hsDone,450);try{history.back()}catch(_){hsDone()}}
  else if(then)then();
}
addEventListener('popstate',e=>{
  if(Date.now()<HS.eat){HS.eat=0;e.stopImmediatePropagation();hsDone();return}
  if(HS.on){e.stopImmediatePropagation();HS.pushed=false;hsClose()}
},true);
heroQ.addEventListener('input',()=>{hsClearB.hidden=!heroQ.value;paintSuggest()});
heroQ.addEventListener('focus',()=>{hsOpen();paintSuggest()});
heroQ.addEventListener('blur',()=>setTimeout(hsFit,80));
hsClearB.addEventListener('pointerdown',e=>e.preventDefault());   // keep the keyboard up
hsClearB.addEventListener('click',()=>{heroQ.value='';hsClearB.hidden=true;heroQ.focus({preventScroll:true});paintSuggest()});
$('#hsBack').addEventListener('click',()=>hsClose());
$('#hsScrim').addEventListener('click',()=>hsClose());
if(window.visualViewport)visualViewport.addEventListener('resize',hsFit);
addEventListener('resize',hsFit);
PHONE.addEventListener&&PHONE.addEventListener('change',()=>{if(!isPhone())hsClose()});
/* phones: when a button or link sits under the round chat button, it slides to the edge so the button underneath can be tapped */
(()=>{const L=$('#chatLaunch'),F=$('#fab');if(!L||!F)return;let raf=0;
  const INT='a[href],button,input,select,textarea,label,summary,[role=button]';
  const check=()=>{raf=0;if(!isPhone()){L.classList.remove('tuck');return}
    const r=L.getBoundingClientRect();if(!r.width)return;const x0=r.right-r.height,w=r.height;let hit=false;
    for(const [fx,fy] of [[.5,.5],[.12,.5],[.88,.5],[.5,.1],[.5,.9],[.2,.2],[.8,.8]]){
      const e=document.elementsFromPoint(x0+w*fx,r.top+r.height*fy).find(e=>!L.contains(e));
      if(e&&e.closest(INT)&&!e.closest('#chat')){hit=true;break}}
    L.classList.toggle('tuck',hit)};
  const q=()=>{if(!raf)raf=requestAnimationFrame(check)};
  /* checked when the scroll settles, not on every frame of it (each check asks the browser what is under 7 points) */
  let st=0;addEventListener('scroll',()=>{clearTimeout(st);st=setTimeout(q,140)},{passive:true});
  addEventListener('resize',q);document.addEventListener('click',()=>setTimeout(q,350),true);setInterval(()=>{if(!document.hidden)q()},1500);q()})();
/* a model photo that can't load shows the drawn icon instead of a broken picture */
document.addEventListener('error',e=>{const t=e.target;if(!t||t.tagName!=='IMG')return;const ph=t.closest('.th-photo');if(!ph)return;
  const s=document.createElement('span');s.className='th th-'+(t.dataset.cat||'phone');s.style.fontSize=(t.dataset.sz||10)+'px';s.setAttribute('aria-hidden','true');ph.replaceWith(s)},true);

sug.addEventListener('click',e=>{const b=e.target.closest('[data-sb]');if(!b)return;sug.hidden=true;hsClose(()=>{heroQ.value='';hsClearB.hidden=true;openBrand(b.dataset.sb)})});
heroQ.addEventListener('keydown',e=>{if(e.key==='ArrowDown'&&!sug.hidden){e.preventDefault();const f=sug.querySelector('.sug,[data-sb],.sug-req');if(f)f.focus()}if(e.key==='Escape'){if(HS.on)hsClose();else sug.hidden=true}});
sug.addEventListener('keydown',e=>{
  const items=$$('.sug,[data-sb],.sug-req',sug),i=items.indexOf(document.activeElement);
  if(e.key==='ArrowDown'){e.preventDefault();(items[i+1]||items[0]).focus()}
  if(e.key==='ArrowUp'){e.preventDefault();i<=0?heroQ.focus():items[i-1].focus()}
});
/* a model from the search: the pop-up opens at its RAM and storage, then the questions follow in it.
   If the search already named exactly one of its storage options ("iphone 13 256gb"), it starts at the questions. */
function heroGo(m,q){sug.hidden=true;
  const mm=String(q).match(/(\d+)\s?(gb|tb)/i)||String(q).match(/\b(64|128|256|512|1024)\b()/);
  const hits=mm?m.variants.map((v,i)=>[v,i]).filter(([v])=>v[0].toLowerCase().replace(/\s/g,'').includes((mm[1]+(mm[2]||'gb')).toLowerCase())):[];
  hsClose(()=>{heroQ.value='';hsClearB.hidden=true;openModel(m,hits.length===1?hits[0][1]:0,hits.length===1)})}
sug.addEventListener('click',e=>{const b=e.target.closest('[data-id]');if(!b)return;heroGo(byId[b.dataset.id],heroQ.value)});
document.addEventListener('click',e=>{if(!HS.on&&!e.target.closest('#heroSearch'))sug.hidden=true});
$('#heroSearch').addEventListener('submit',e=>{
  e.preventDefault();const q=heroQ.value.trim();
  if(!q){sug.hidden=true;hsClose(()=>goTo('sell'));return}
  /* on the phone search screen a half-typed name ("rea") just puts the keyboard away so the whole list shows */
  if(HS.on){const ex=findModel(q),l=searchModels(q,sellPool(),7);if(!(ex&&catOn(ex.cat))&&l.length>1){heroQ.blur();paintSuggest();return}}
  sug.hidden=true;
  const fm=findModel(q),m=(fm&&catOn(fm.cat)?fm:null)||matchModels(q)[0];
  if(m){heroGo(m,q);return}
  if(fm&&catSt(fm.cat)==='soon'){toast(soonLine());return}
  hsClose(()=>{S.q=q;$('#modelSearch').value=q;renderModels();toast('No exact match. Pick the closest model from the list.');goTo('sell')});
});
function renderCatQuick(){
  $('#catQuick').innerHTML=CATS.filter(c=>catSt(c.id)!=='off').map(c=>catOn(c.id)?`<button type="button" data-cat="${c.id}">${thumb(c.id,c.id+'q',6)}Sell ${c.label.toLowerCase()}</button>`
    :`<button type="button" class="cq-soon" data-soon="${c.id}">${thumb(c.id,c.id+'q',6)}${c.label}s <i>Coming soon</i></button>`).join('');
  $$('[data-cat-link]').forEach(a=>{const st=catSt(a.dataset.catLink),li=a.closest('li');if(li)li.hidden=st==='off';a.classList.toggle('soon',st==='soon');
    const lbl=CATS.find(c=>c.id===a.dataset.catLink);if(lbl)a.textContent=st==='soon'?`${lbl.label}s: coming soon`:`Sell ${lbl.label.toLowerCase()}`});
}
renderCatQuick();
$('#catQuick').addEventListener('click',e=>{const s=e.target.closest('[data-soon]');if(s){toast(soonLine());return}const b=e.target.closest('[data-cat]');if(!b)return;setCat(b.dataset.cat);goStep(1);goTo('sell')});
$$('[data-cat-link]').forEach(a=>a.addEventListener('click',e=>{if(!catOn(a.dataset.catLink)){e.preventDefault();toast(soonLine());return}setCat(a.dataset.catLink);goStep(1)}));
function heroOffer(){
  const m=byId.ip15p;if(!m)return;
  const vi=Math.min(1,m.variants.length-1),p=r10(topPrice(m,vi)*RULES.verified),g=gated();
  $('#scrDev').textContent=m.name+' · '+m.variants[vi][0];
  if(g)$('#scrOffer').innerHTML=lockBlocks(0);else $('#scrOffer').textContent=inr(p);
  $('#scrOfferSub').textContent=g?'Unlocks with a quick OTP, held 7 days':'Includes test bonus, locked 7 days';
}
heroOffer();
if(!reduceMotion){
  const vis=$('#heroVisual'),dev=$('#device');
  vis.addEventListener('pointermove',e=>{
    const r=vis.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    dev.style.setProperty('--ry',(x*26-5).toFixed(1)+'deg');dev.style.setProperty('--rx',(-y*14+3).toFixed(1)+'deg');
  });
  vis.addEventListener('pointerleave',()=>{dev.style.removeProperty('--ry');dev.style.removeProperty('--rx')});
}
function renderTicker(){
  let ids=['ip18pm','ip17p','ip16p','s25u','ip15','op13','px9p','mba-m3','ipadpro-m4','awu2','zflip6','x200p','ip13'].filter(id=>byId[id]);
  if(ids.length<6)ids=CATALOG.slice(0,12).map(m=>m.id);
  const g=gated();$('#ticker').parentElement.setAttribute('aria-label',g?'Devices we are buying now':'Top prices right now');
  const half=`<div class="tick lbl">Buying now</div>`+ids.map(id=>{const m=byId[id];return `<div class="tick"><span class="n">${esc(m.name)}</span></div>`}).join('');
  $('#ticker').innerHTML=half+`<div style="display:contents" aria-hidden="true">${half}</div>`;
}
renderTicker();

/* ---------- sell wizard ---------- */
function renderCatTabs(){$('#catTabs').innerHTML=CATS.filter(c=>catSt(c.id)!=='off').map(c=>catOn(c.id)?`<button type="button" data-cat="${c.id}" aria-pressed="${S.cat===c.id}">${c.label}</button>`:`<button type="button" class="tab-soon" data-soon="${c.id}">${c.label}<small>Coming soon</small></button>`).join('')}
function renderBrands(){
  const brands=['All',...new Set(CATALOG.filter(m=>m.cat===S.cat).map(m=>m.brand))];
  $('#brandChips').innerHTML=brands.map(b=>`<button type="button" class="chip" data-brand="${esc(b)}" aria-pressed="${S.brand===b}">${esc(b)}</button>`).join('');
}
/* Brand, then series, then model. Names come from the master sheet; a few are merged so the chips read cleanly. */
function seriesOf(m){
  let x=String(m.series||'').trim();const b=m.brand;
  if(!x)return m.cat==='phone'?'Other '+b:'';
  if(b==='Apple'){if(/^iPhone (X|XR|XS)/.test(x))return 'iPhone X Series';if(/^iPhone SE/.test(x))return 'iPhone SE Series';if(x==='iPhone Air')return 'iPhone 17 Series';if(x==='iPhone Duo')return 'iPhone 18 Series';return /Series$/.test(x)?x:x+' Series'}
  if(b==='Xiaomi'){if(/^Redmi \d+ Series$/.test(x))return 'Redmi Series';if(/^\d+ Series$/.test(x))return 'Xiaomi Series';if(x==='Xiaomi Mi')return 'Xiaomi Mi Series';if(/^Other/.test(x))return 'Other Xiaomi'}
  if(b==='Realme'&&/^Realme \d+ Series$/.test(x))return 'Realme Number Series';
  if(b==='Honor')return x==='Play Series'?'Honor Play Series':'Honor Number Series';
  if(b==='ASUS')return x==='ROG Series'?'ROG Phone Series':'Zenfone Series';
  if(b==='Vivo'&&!/^Vivo/i.test(x))return 'Vivo '+x;
  return x;
}
function seriesGroups(ms){const g=new Map();ms.forEach(m=>{const k=seriesOf(m)||'Models';if(!g.has(k))g.set(k,{name:k,top:0,ms:[]});const e=g.get(k);e.ms.push(m);e.top=Math.max(e.top,topFor(m))});
  const out=[...g.values()].sort((a,b)=>b.top-a.top);out.forEach(e=>e.ms.sort((a,b)=>topFor(b)-topFor(a)));return out}
const modelBtn=m=>`<button type="button" class="model" data-id="${m.id}" aria-pressed="${m.id===S.modelId}">${thumb(m.cat,m.id,9)}<span><b>${esc(m.name)}</b><small class="m-st">${esc(storRange(m))}</small><small class="m-up">${upTo(m)}</small></span></button>`;
function renderModels(){
  const toks=norm(S.q).split(' ').filter(Boolean),lbl=CATS.find(c=>c.id===S.cat).label.toLowerCase(),step=isPhone()?12:24,lim=S.showN||step;
  const inCat=CATALOG.filter(m=>m.cat===S.cat&&(S.brand==='All'||m.brand===S.brand));
  const sc=$('#seriesChips');let html='',more=0,hint='',shownIds=new Set();
  if(!toks.length&&S.brand!=='All'){
    const groups=seriesGroups(inCat),many=groups.length>1;
    if(S.series&&!groups.some(g=>g.name===S.series))S.series='';
    sc.hidden=!many;
    if(many)sc.innerHTML=`<button type="button" class="chip" data-series="" aria-pressed="${!S.series}">All ${esc(S.brand)} <small>${inCat.length}</small></button>`+groups.map(g=>`<button type="button" class="chip" data-series="${esc(g.name)}" aria-pressed="${S.series===g.name}">${esc(g.name)} <small>${g.ms.length}</small></button>`).join('');
    const gs=S.series?groups.filter(g=>g.name===S.series):groups;let n=0;
    gs.forEach(g=>{let head=false;g.ms.forEach(m=>{if(n>=lim){more++;return}if(many&&!S.series&&!head){html+=`<h4 class="series-h">${esc(g.name)}</h4>`;head=true}html+=modelBtn(m);shownIds.add(m.id);n++})});
  }else{
    sc.hidden=true;
    const all=toks.length?searchModels(S.q,inCat,400):inCat;
    let list;
    if(!toks.length&&all.length>40){const by=new Map(all.map(m=>[m.id,m]));list=POP_GRID.map(id=>by.get(id)).filter(Boolean);if(list.length<6)list=all.slice(0,step);hint=`Popular ${lbl}s. Pick a brand above to see every series, or search all ${all.length}.`}
    else{list=all.slice(0,lim);more=all.length-list.length}
    list.forEach(m=>{html+=modelBtn(m);shownIds.add(m.id)});
    if(!list.length)html=`<p class="empty">No match in ${esc(lbl)}s. Try another spelling, or <button type="button" class="link-btn" data-req-open>get a price for it</button>.</p>`;
  }
  const sel=inCat.find(m=>m.id===S.modelId);if(sel&&!shownIds.has(sel.id)&&!toks.length&&S.brand==='All')html=modelBtn(sel)+html;
  $('#modelGrid').innerHTML=html+(more>0?`<button type="button" class="more-models" data-more>Show ${Math.min(more,step*2)} more</button>`:'')+(hint?`<p class="more-hint">${esc(hint)}</p>`:'');
}
function renderVariants(){
  const m=model();
  $('#variantChips').innerHTML=m.variants.map((v,i)=>`<button type="button" class="chip" data-vi="${i}" aria-pressed="${S.vi===i}">${esc(v[0])}${gated()?'':`<small>up to ${inr(topPrice(m,i))}</small>`}</button>`).join('');
}
function renderCond(){
  const m=model(),qs=questionsFor(m);
  Object.keys(S.ans).forEach(k=>{const q=qs.find(x=>x.id===k);if(!q){delete S.ans[k];return}
    if(q.type==='battery')return;
    if(q.type==='color'){if(!(m.colors||[]).some(c=>c[0]===S.ans[k][0]))delete S.ans[k];return}
    S.ans[k]=S.ans[k].filter(o=>q.options.some(x=>x.id===o))});
  $('#condForm').innerHTML=qs.map((q,i)=>{
    const head=`<div class="q-label">${i+1}. ${esc(q.title)}${q.type==='multi'&&!/select all/i.test(q.title)?' <span class="muted">Select all that apply</span>':''}</div>`;
    if(q.type==='battery'){
      const where=q.help||BATT_WHERE[m.cat]||'';
      return `<div class="q" data-q="${esc(q.id)}">${head}${where?`<p class="hint where"><svg class="i"><use href="#i-batt"/></svg><span>${esc(where)}</span></p>`:''}<div id="bq-${esc(q.id)}">${battHtml(q,S.ans[q.id])}</div>${aiLink('battery',q.id,'Read it from a screenshot')}<em class="err" data-qerr="${esc(q.id)}"></em></div>`;
    }
    if(q.type==='color')return `<div class="q" data-q="${esc(q.id)}">${head}<div class="swq">${(m.colors||[]).map(([n,h])=>`<button type="button" class="sw" data-q="${esc(q.id)}" data-col="${esc(n)}" aria-pressed="${(S.ans[q.id]||[])[0]===n}"><i style="--c:${esc(h)}"></i><span>${esc(n)}</span></button>`).join('')}</div><em class="err" data-qerr="${esc(q.id)}"></em></div>`;
    return `<div class="q" data-q="${esc(q.id)}">${head}${q.help?`<p class="hint">${esc(q.help)}</p>`:''}${q.id==='screen'||(q.id==='body'&&!qs.some(x=>x.id==='screen'))?aiCta(m):''}<div class="qopts">${q.options.map(o=>`<button type="button" class="qopt" data-q="${esc(q.id)}" data-o="${esc(o.id)}" aria-pressed="${(S.ans[q.id]||[]).includes(o.id)}">${optImg(o)}<span>${esc(o.label)}</span></button>`).join('')}</div>${q.id==='age'?aiLink('bill',q.id,'Read the date from my bill'):''}<em class="err" data-qerr="${esc(q.id)}"></em></div>`;
  }).join('')+`<div class="verify-note" id="verifyNote"></div>`;
  renderVerifyNote();
  qpDecorate();
}
function battHtml(q,a){
  const v=(a||[])[0],unsure=v==='unsure',n=unsure||v==null?null:Math.round(+v);
  const col=n==null?'var(--line-2)':n>=85?'var(--green)':n>=80?'#F2C200':'#E0582F';
  const free=(q.bands&&q.bands.length?q.bands:BATT_BANDS).every(b=>!+b.deduct)&&!+q.unsure;
  const tag=unsure?'Not sure is fine. The agent checks it at pickup.':n==null?'Slide to your battery health':`${BATT_LABEL(n)}${n<80?': the battery needs replacing soon':n>=95?': holds a charge like new':''}`;
  return `<div class="bq${n==null?' unset':''}" style="--bc:${col}"><div class="bq-cell" aria-hidden="true"><i style="--lvl:${n==null?0:Math.max(6,(n-40)/60*100)}%"></i><b>${n==null?(unsure?'?':'—%'):(n<=50?'≤50%':n+'%')}</b></div>
    <div class="bq-side"><div class="bq-tag">${n!=null?'<i></i>':''}${esc(tag)}</div><input type="range" min="50" max="100" step="1" value="${n==null?90:n}" data-bq="${esc(q.id)}" aria-label="Battery health in percent" aria-valuetext="${n==null?'Not set':n+' percent'}"><div class="bq-scale"><span>50%</span><span>75%</span><span>100%</span></div></div></div>
    <div class="bq-foot" style="margin-top:8px"><button type="button" class="chip" data-bunsure="${esc(q.id)}" aria-pressed="${unsure}">I'm not sure</button>${free?'<span class="bq-note">For our records only. It doesn\'t change your offer.</span>':''}</div>`;
}
function setBatt(id,val){
  const m=model(),q=questionsFor(m).find(x=>x.id===id);if(!q)return;
  S.ans[id]=[String(val)];$('#bq-'+id).innerHTML=battHtml(q,S.ans[id]);
  const em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===id);if(em)em.textContent='';
  renderQuote();
  if(val==='unsure')qpAuto();
}
$('#condForm').addEventListener('input',e=>{const r=e.target.closest('[data-bq]');if(!r)return;
  const id=r.dataset.bq,v=+r.value,m=model(),q=questionsFor(m).find(x=>x.id===id);if(!q)return;S.ans[id]=[String(v)];
  const box=$('#bq-'+id),bq=box.querySelector('.bq'),cell=box.querySelector('.bq-cell'),col=v>=85?'var(--green)':v>=80?'#F2C200':'#E0582F';
  bq.classList.remove('unset');bq.style.setProperty('--bc',col);cell.querySelector('i').style.setProperty('--lvl',Math.max(6,(v-40)/60*100)+'%');cell.querySelector('b').textContent=v<=50?'≤50%':v+'%';
  box.querySelector('.bq-tag').innerHTML='<i></i>'+esc(BATT_LABEL(v)+(v<80?': the battery needs replacing soon':v>=95?': holds a charge like new':''));
  r.setAttribute('aria-valuetext',v+' percent');const u=box.querySelector('[data-bunsure]');if(u)u.setAttribute('aria-pressed','false');
  const em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===id);if(em)em.textContent='';
});
$('#condForm').addEventListener('change',e=>{const r=e.target.closest('[data-bq]');if(r)setBatt(r.dataset.bq,+r.value)});
function renderVerifyNote(){
  const el=$('#verifyNote');if(!el)return;const m=model(),bonus=pctTxt(RULES.verified-1),done=TESTS.filter(t=>T[t[0]]).length;
  if(S.verified&&(m.cat==='phone'||m.cat==='tablet')){el.className='verify-note ok';el.innerHTML=`<svg class="i"><use href="#i-check"/></svg><span>Phone test passed. ${bonus} extra added to your offer.</span>`}
  else if(m.cat==='phone'||m.cat==='tablet'){el.className='verify-note';el.innerHTML=`<svg class="i"><use href="#i-touch"/></svg><span>${done?done+' of 9 phone tests done. ':'Holding the phone you\'re selling? '}<a href="#test">${done?'Finish the phone test':'Run the 2-minute phone test'}</a> for an extra ${bonus}.</span>`}
  else{el.className='verify-note';el.innerHTML='<svg class="i"><use href="#i-shield"/></svg><span>The agent confirms your answers at pickup in about 10 minutes.</span>'}
}
$('#condForm').addEventListener('click',e=>{
  const ai=e.target.closest('[data-ai]');if(ai){openAi(ai.dataset.ai,ai.dataset.aiq||'',ai);return}
  const bu=e.target.closest('[data-bunsure]');if(bu){setBatt(bu.dataset.bunsure,'unsure');return}
  const sw=e.target.closest('[data-col]');
  if(sw){const id=sw.dataset.q;S.ans[id]=[sw.dataset.col];$$('#condForm [data-col]').forEach(x=>{if(x.dataset.q===id)x.setAttribute('aria-pressed',String(x===sw))});const em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===id);if(em)em.textContent='';renderQuote();qpAuto();return}
  const b=e.target.closest('[data-o]');if(!b)return;
  const q=questionsFor(model()).find(x=>x.id===b.dataset.q);if(!q)return;const o=b.dataset.o;
  const isNone=id=>{const x=q.options.find(y=>y.id===id);return !!x&&/^none\b/i.test(x.label)};
  let cur=S.ans[q.id]||[];
  if(q.type==='multi'){if(cur.includes(o))cur=cur.filter(x=>x!==o);else cur=isNone(o)?[o]:[...cur.filter(x=>!isNone(x)),o]}
  else cur=[o];
  S.ans[q.id]=cur;
  $$('#condForm [data-o]').forEach(x=>{if(x.dataset.q===q.id)x.setAttribute('aria-pressed',String(cur.includes(x.dataset.o)))});
  const em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===q.id);if(em)em.textContent='';
  renderQuote();
  if(q.type==='single')qpAuto();
});
const answersComplete=m=>questionsFor(m).every(q=>ansOk(q,m,S.ans[q.id]));
function checkAnswers(){
  let first=null;
  const mm=model();questionsFor(mm).forEach(q=>{const miss=!ansOk(q,mm,S.ans[q.id]),em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===q.id);if(em)em.textContent=miss?(q.type==='battery'?'Slide to your battery health, or tap I\'m not sure.':q.type==='color'?'Pick the colour.':'Choose an answer.'):'';if(miss&&!first)first=q.id});
  if(first&&qpOn()){qpShow(qpList().findIndex(x=>x.dataset.q===first),true);return false}
  if(first){const el=[...$$('#condForm .q[data-q]')].find(x=>x.dataset.q===first);pageScroll(el,'center',true);toast('Answer every question to see your offer.');return false}
  return true;
}
function tweenPrice(el,target){
  el.classList.remove('locked');
  const from=+(el.dataset.v||0);el.dataset.v=target;
  if(reduceMotion||!from||from===target){el.textContent=inr(target);return}
  cancelAnimationFrame(+(el.dataset.raf||0));const t0=performance.now(),dur=420;
  const step=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=inr(r10(from+(target-from)*e));if(k<1)el.dataset.raf=requestAnimationFrame(step);else el.textContent=inr(target)};
  el.dataset.raf=requestAnimationFrame(step);
}
const isVerifiedFor=m=>S.verified&&(m.cat==='phone'||m.cat==='tablet');
const noteFor=m=>isVerifiedFor(m)?'Based on your answers. Includes your phone test bonus.':'Based on your answers.';
let qTimer=0,qSeq=0;
function serverQuote(m){
  clearTimeout(qTimer);const seq=++qSeq;if(S.step>=5)return;
  qTimer=setTimeout(async()=>{
    try{const r=await fetchOffer(m);if(seq!==qSeq)return;S.offer=r.price;S.held=r;tweenPrice($('#qcPrice'),r.price);$('#qcNote').textContent=noteFor(m)+' Held until '+fmtHeld(r.until)+'.';if(S.step===3&&$('#vault').dataset.state==='open')setVault('open',false)}
    catch(e){if(seq!==qSeq)return;$('#qcNote').textContent='Couldn\'t update your offer. Check your connection and try again.'}
  },180);
}
function renderQuote(){
  const m=model(),top=topPrice(m,S.vi);
  $('#qcDev').innerHTML=`${thumb(m.cat,m.id,12)}<div><b>${esc(m.name)}</b><small>${esc(m.variants[S.vi][0])}${(()=>{const c=(m.colors||[]).find(x=>x[0]===(S.ans.color||[])[0]);return c?` · <span class="qc-col" style="--c:${esc(c[1])}"><i></i>${esc(c[0])}</span>`:''})()} · ${esc(m.brand)}</small></div>`;
  if(!answersComplete(m)&&gated()){
    qSeq++;S.offer=null;$('#qcLbl').textContent='Your price';const pe=$('#qcPrice');pe.classList.add('locked');pe.innerHTML=lockBlocks(0);
    $('#qcNote').textContent='Answer a few quick questions, then verify your mobile number to see your price.';
  }else if(!answersComplete(m)){
    qSeq++;S.offer=null;$('#qcLbl').textContent='Up to';tweenPrice($('#qcPrice'),top);
    $('#qcNote').textContent=S.step>=2?'Answer every question to see your exact offer.':'Answer a few quick questions to see your exact offer.';
  }else if(!S.vphone){
    qSeq++;S.offer=null;$('#qcLbl').textContent='Your offer';const pe=$('#qcPrice');pe.classList.add('locked');pe.innerHTML=lockBlocks(gated()?0:top);
    $('#qcNote').textContent='Ready. Verify your mobile number to unlock it.';
  }else{
    $('#qcLbl').textContent='Your offer';
    if(LIVE){$('#qcNote').textContent='Updating your offer…';serverQuote(m)}
    else{const seq=++qSeq;fetchOffer(m).then(r=>{if(seq!==qSeq)return;S.offer=r.price;S.held=r;tweenPrice($('#qcPrice'),r.price);$('#qcNote').textContent=noteFor(m)+' Held until '+fmtHeld(r.until)+'.';if(S.step===3&&$('#vault').dataset.state==='open')setVault('open',false)}).catch(e=>{if(seq===qSeq)$('#qcNote').textContent=e.message||'Couldn\'t open your offer. Try again.'})}
  }
  renderVerifyNote();
  qpDev();if(qpOn()&&S.step===2)qpShow(S.qi,false,true);else{saveDraft();updBar()}
}
function pickModel(id,vi){
  const m=byId[id];if(!m)return;
  const catChanged=m.cat!==S.cat;
  if(catChanged){S.cat=m.cat;S.brand='All';S.q='';$('#modelSearch').value='';renderCatTabs();renderBrands()}
  if(S.modelId!==id){S.qi=0;S.ans={}}S.modelId=id;S.vi=Math.min(vi||0,m.variants.length-1);
  if(catChanged||!$(`#modelGrid [data-id="${id}"]`))renderModels();
  else $$('#modelGrid [data-id]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===id)));
  renderVariants();renderCond();renderQuote();
  if(window.RC_LX)pxView(m);
}
function selectModel(id,vi){if(S.step===5)resetWizard();S.brand='All';S.q='';$('#modelSearch').value='';pickModel(id,vi);renderBrands();renderModels();goStep(1)}
function setCat(cat){
  if(!catOn(cat))cat='phone';
  S.cat=cat;S.brand='All';S.q='';S.allModels=false;S.showN=0;S.series='';$('#modelSearch').value='';
  if(model().cat!==cat){S.modelId=CATALOG.find(m=>m.cat===cat).id;S.vi=0}
  renderCatTabs();renderBrands();renderModels();renderVariants();renderCond();renderQuote();
}
$('#catTabs').addEventListener('click',e=>{if(e.target.closest('[data-soon]')){toast(soonLine());return}const b=e.target.closest('[data-cat]');if(b)setCat(b.dataset.cat)});
$('#brandChips').addEventListener('click',e=>{const b=e.target.closest('[data-brand]');if(!b)return;S.brand=b.dataset.brand;S.showN=0;S.series='';$$('#brandChips [data-brand]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderModels()});
$('#modelSearch').addEventListener('input',e=>{S.q=e.target.value;S.showN=0;if(S.q.trim()&&S.brand!=='All'){S.brand='All';S.series='';renderBrands()}renderModels()});
$('#seriesChips').addEventListener('click',e=>{const b=e.target.closest('[data-series]');if(!b)return;S.series=b.dataset.series;S.showN=0;renderModels();const g=$('#modelGrid');if(isPhone()&&g.getBoundingClientRect().top<70)pageScroll(g,'start',false)});
$('#modelGrid').addEventListener('click',e=>{
  if(e.target.closest('[data-more]')){S.showN=(S.showN||(isPhone()?12:24))+(isPhone()?24:48);renderModels();return}
  const b=e.target.closest('[data-id]');if(!b)return;pickModel(b.dataset.id,0);
  const pm=model();if(pm.variants.length===1){autoNext();return}
  if(isPhone()){const v=$('#variantChips').closest('.q'),r=v.getBoundingClientRect();if(r.bottom>innerHeight-96||r.top<70)pageScroll(v,'center',true)}
});
$('#variantChips').addEventListener('click',e=>{const b=e.target.closest('[data-vi]');if(!b)return;S.vi=+b.dataset.vi;$$('#variantChips [data-vi]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderQuote();autoNext()});
/* Phone test from inside the selling flow (phones only): leave the flow, test, come back. */
function renderTestCta(){const m=model(),el=$('#testCta');el.hidden=!(isPhone()&&(m.cat==='phone'||m.cat==='tablet')&&!isVerifiedFor(m))}
$('#testCtaGo').addEventListener('click',()=>{$('#testBack').hidden=false;goTo('test')});
$('#testBack').addEventListener('click',()=>{$('#testBack').hidden=true;goStep(Math.max(2,S.step));pageScroll($('#wizard'),'start',false)});
/* After the phone (and its storage) is picked, go straight to the questions. */
let autoT=0;
function autoNext(){clearTimeout(autoT);const id=S.modelId;autoT=setTimeout(()=>{if(S.step===1&&S.modelId===id)goStep(2)},380)}
function goStep(n){
  const prev=S.step;S.step=n;
  $$('#wizard .wz-pane[data-pane]').forEach(p=>{p.hidden=+p.dataset.pane!==n});
  $$('#steps li').forEach((li,i)=>{li.className=n===4||i+1<n?'done':i+1===n?'on':''});
  $('#wzBack').hidden=n===1||n===5;$('#wzNext').hidden=n===5;
  stepLabel();
  if(n===3)renderOffer();
  if(n===4)renderPickup();
  setFunnel();if(n>prev)pushStep(n);
  renderQuote();
  if(n===2){renderTestCta();if(qpOn())qpShow(qpFirstOpen(),false,true)}
  updBar();saveDraft();
  const w=$('#wizard'),wt=w.getBoundingClientRect().top;if(!stepQuiet&&(wt<0||(isPhone()&&wt>140)))pageScroll(w,'start',true);
}
let stepQuiet=false;
$('#wzBack').addEventListener('click',()=>goStep(Math.max(1,S.step-1)));
$('#wzNext').addEventListener('click',async()=>{if(S.step===2&&!checkAnswers())return;if(S.step===3&&!S.vphone){if(OTP.sent)otpVerify();else otpSend(false);return}if(S.step<4)goStep(S.step+1);else if(await submitPickup())goStep(5)});
const SLOTS=[['9–11 AM',9],['11 AM–1 PM',11],['1–3 PM',13],['3–5 PM',15],['5–7 PM',17]];
/* how the customer is paid at the door: no UPI ID is asked, the agent pays by UPI to the customer's app or hands over cash */
const PAYOUTS=[['cash','Cash','Counted out to you at your door'],['upi','UPI','Sent to your UPI app at your door']];
const PAY_TXT={cash:'Cash at your door',upi:'UPI at your door',bank:'Bank transfer'};
function pickupDays(){
  const now=new Date(),out=[],start=now.getHours()<15?0:1;
  for(let i=start;i<start+5;i++){
    const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i);
    out.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),today:i===0,top:i===0?'Today':i===1?'Tomorrow':d.toLocaleDateString('en-IN',{weekday:'long'}),sub:d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})});
  }
  return out;
}
function renderRapid(){
  const box=$('#rapidBox'),pane=$('[data-pane="4"]'),r=BIZ.rapid;
  if(!r||!r.on){box.hidden=true;S.pickup.rapid=false;pane.classList.remove('is-rapid');return}
  box.hidden=false;const open=rapidOpen();if(!open)S.pickup.rapid=false;
  box.innerHTML=open?`<button type="button" class="opt fast" data-rapid="1" aria-pressed="${!!S.pickup.rapid}"><b><svg class="i"><use href="#i-bolt"/></svg>Rapid pickup</b><small>Agent at your door within ${r.minutes} minutes, by about ${rapidBy()}</small></button><button type="button" class="opt" data-rapid="0" aria-pressed="${!S.pickup.rapid}"><b>Pick a time</b><small>Choose a day and a 2-hour slot</small></button>`
    :`<p class="rapid-note"><svg class="i"><use href="#i-bolt"/></svg>Rapid pickup in ${esc(S.city)} runs ${h12(r.from)} to ${h12(r.to)}: an agent at your door within ${r.minutes} minutes. Pick a time below for now.</p>`;
  pane.classList.toggle('is-rapid',!!S.pickup.rapid);
}
function paintRapidBadge(){const el=$('#heroRapid');if(!el)return;const r=BIZ.rapid;el.hidden=!(r&&r.on);if(r&&r.on)$('#heroRapidT').textContent=`Rapid pickup in ${S.city}: at your door in ${r.minutes} min`}
function renderPickup(){
  prefillContact();renderRapid();
  {const vo=$('#videoOpt'),on=GROWTH.video_on&&S.offer!=null&&S.offer>=GROWTH.video_min;vo.hidden=!on;if(!on)$('#pfVideo').checked=false}
  const pp=$('#pfPhone');if(S.vphone){pp.value=S.vphone;pp.readOnly=true}else pp.readOnly=false;$('#pfVerified').hidden=!S.vphone;
  const days=pickupDays();
  if(!days.some(d=>d.key===S.pickup.date))S.pickup.date=(days.find(d=>!d.today)||days[0]).key;
  const day=days.find(d=>d.key===S.pickup.date),minH=day.today?new Date().getHours()+2:0;
  if(!S.pickup.slot)S.pickup.slot='11 AM–1 PM';
  const cur=SLOTS.find(s=>s[0]===S.pickup.slot);
  if(!cur||cur[1]<minH)S.pickup.slot=(SLOTS.find(s=>s[1]>=minH)||SLOTS[SLOTS.length-1])[0];
  $('#dateChips').innerHTML=days.map(d=>`<button type="button" class="chip day" data-date="${d.key}" aria-pressed="${d.key===S.pickup.date}"><b>${d.top}</b><small>${d.sub}</small></button>`).join('');
  $('#slotChips').innerHTML=SLOTS.map(([l,h])=>`<button type="button" class="chip" data-slot="${l}" aria-pressed="${l===S.pickup.slot}"${h<minH?' disabled':''}>${l}</button>`).join('');
  $('#payOpts').innerHTML=PAYOUTS.map(([k,l,d])=>`<button type="button" class="opt" data-pay="${k}" aria-pressed="${S.pickup.payout===k}"><b>${l}</b><small>${d}</small></button>`).join('');
}
$('[data-pane="4"]').addEventListener('click',e=>{
  if(e.target.closest('#pfChangeNum')){forgetPhone();renderQuote();goStep(3);setTimeout(()=>$('#otpPhone').focus(),50);return}
  const rp=e.target.closest('[data-rapid]');if(rp){S.pickup.rapid=rp.dataset.rapid==='1'&&rapidOpen();$('#slotErr').textContent='';renderRapid();return}
  const d=e.target.closest('[data-date]'),s=e.target.closest('[data-slot]'),p=e.target.closest('[data-pay]');
  if(d){S.pickup.date=d.dataset.date;renderPickup();$(`[data-date="${d.dataset.date}"]`).focus()}
  else if(s&&!s.disabled){S.pickup.slot=s.dataset.slot;$$('#slotChips [data-slot]').forEach(x=>x.setAttribute('aria-pressed',String(x===s)));$('#slotErr').textContent=''}
  else if(p){S.pickup.payout=p.dataset.pay;renderPickup();$(`[data-pay="${p.dataset.pay}"]`).focus()}
});
function showErrs(errs,ids){
  ids.forEach(id=>{const inp=document.getElementById(id),em=document.querySelector(`[data-err="${id}"]`);if(inp)inp.setAttribute('aria-invalid',String(!!errs[id]));if(em)em.textContent=errs[id]||''});
  const first=ids.find(id=>errs[id]);if(first)document.getElementById(first).focus();
  return !first;
}
function readContact(prefix){return{name:$('#'+prefix+'Name').value.trim(),phone:$('#'+prefix+'Phone').value.replace(/\D/g,''),pin:$('#'+prefix+'Pin').value.trim(),addr:$('#'+prefix+'Addr').value.trim()}}
function contactErrs(v,prefix){
  const e={};
  if(v.name.length<2)e[prefix+'Name']='Enter your name as it appears on your ID.';
  if(!/^[6-9]\d{9}$/.test(v.phone))e[prefix+'Phone']='Enter a 10-digit Indian mobile number.';
  if(!/^[1-9]\d{5}$/.test(v.pin))e[prefix+'Pin']='Pincodes have 6 digits and don\'t start with 0.';
  else if(!pinOk(v.pin))e[prefix+'Pin']=pinMsg(v.pin);
  if(v.addr.length<8)e[prefix+'Addr']='Add your flat, building and street so we can find you.';
  return e;
}
async function submitPickup(){
  const v=readContact('pf'),errs=contactErrs(v,'pf');
  if(S.pickup.rapid&&!rapidOpen()){S.pickup.rapid=false;renderPickup();toast('Rapid pickup just closed for today. Please pick a time slot.');return false}
  if(!S.pickup.rapid&&!S.pickup.slot){$('#slotErr').textContent='Pick a time slot.';return false}
  if(!showErrs(errs,['pfName','pfPhone','pfPin','pfAddr']))return false;
  const m=model(),testable=m.cat==='phone'||m.cat==='tablet';
  if(!answersComplete(m)){goStep(2);checkAnswers();return false}
  if(!S.vphone){goStep(3);toast('Verify your mobile number first.');return false}
  const rapid=!!S.pickup.rapid,t0=new Date(),todayKey=t0.getFullYear()+'-'+String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0');
  const day=pickupDays().find(d=>d.key===S.pickup.date);
  const when=rapid?'Rapid pickup · agent by about '+rapidBy():(day?day.top+', '+day.sub:'')+' · '+S.pickup.slot;
  const fmtLock=d=>d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  const upiVal='';   // no UPI ID: the agent pays to the customer's UPI app at the door
  let o;
  if(LIVE){
    const btn=$('#wzNext');btn.disabled=true;
    try{
      const r=await apiPost('create_order',{type:'sell',token:S.vtoken,model:m.id,vi:S.vi,answers:S.ans,verified:isVerifiedFor(m),payout:S.pickup.payout,upi:upiVal,
        name:v.name,phone:v.phone,pincode:v.pin,address:v.addr,city:S.city,slot_date:rapid?todayKey:S.pickup.date,slot_time:rapid?'Rapid':S.pickup.slot,
        tests:testable?{...T}:{},device:testable?deviceSummary():'',geo:S.pickup.geo||null,
        ref:S.ref?S.ref.code:'',video:!$('#videoOpt').hidden&&$('#pfVideo').checked,wa_offers:$('#pfWaOffers').checked,ai_ref:AIX.ref&&AIX.refModel===m.id?AIX.ref:''});
      const ld=r.lock_until?new Date(r.lock_until+'T00:00:00'):new Date(Date.now()+7*864e5);
      o={id:r.id,type:'sell',title:r.title,amount:r.amount,payout:S.pickup.payout,upi:upiVal,when,lock:fmtLock(ld),created:Date.now(),step:1,city:S.city,live:true,key:r.key||'',refBonus:r.ref_bonus||0,todayBonus:r.today_bonus||0,video:!!r.video,agent_card:r.agent_card||null,wa:!!r.wa};px('Schedule',{content_name:r.title,value:r.amount,currency:'INR'});
      if(r.ref_bonus)store.set('ref',null);
    }catch(e){if(e.status===401){forgetPhone();renderQuote();goStep(3)}toast(e.message||'Could not book the pickup. Please try again.');return false}
    finally{btn.disabled=false}
  }else{
    o={id:newId(),type:'sell',title:m.name+' · '+m.variants[S.vi][0]+((S.ans.color||[])[0]?' · '+S.ans.color[0]:''),amount:S.offer!=null?S.offer:localOffer(m,S.vi,S.ans,isVerifiedFor(m)),payout:S.pickup.payout,upi:upiVal,when,lock:fmtLock(new Date(Date.now()+7*864e5)),created:Date.now(),step:1,city:S.city};
  }
  o.checks=quoteQ(m,S.vi,S.ans,isVerifiedFor(m),QUESTIONS,RULES).answers.map(x=>({q:x.q,a:x.a}));
  if(!o.live&&LX.agent){o.agent_card=Object.assign({role:'pickup',open:true,slot:o.when},LX.agent);o.wa=true;o.step=2}
  if(!o.live){o.refBonus=S.ref?S.ref.bonus:0;o.video=!$('#videoOpt').hidden&&$('#pfVideo').checked;if(o.refBonus)store.set('ref',null)}
  if(o.refBonus){S.ref=null;paintRef()}
  saveOrder(o);
  store.set('contact',{name:v.name,phone:v.phone,pin:v.pin,addr:v.addr,payout:S.pickup.payout});
  const passed=TESTS.filter(t=>T[t[0]]==='pass').length;
  const payTxt=PAY_TXT[o.payout]||'Cash or UPI at your door';
  const fn=String(v.name||'').trim().split(/\s+/)[0]||'';
  $('#doneBox').innerHTML=`<div class="done"><div class="done-mark"><svg class="i"><use href="#i-check"/></svg></div><div><h3>Pickup booked</h3><div class="done-id"><b>${o.id}</b><button type="button" class="btn btn-ghost btn-sm" data-done="copy" data-id="${o.id}"><svg class="i"><use href="#i-check"/></svg>Copy order ID</button></div></div>
    ${thanksHtml(fn,o.id,o.when,false,!!o.agent_card)}
    ${agentCardHtml(o.agent_card,{wa:o.wa,phone:v.phone,slot:o.when,fresh:true})}
    <dl class="kv"><div><dt>Device</dt><dd>${esc(o.title)}</dd></div><div><dt>Offer</dt><dd>${inr(o.amount)}${o.refBonus?` <small>+ ${inr(o.refBonus)} friend's bonus</small>`:''}${o.todayBonus?` <small>+ ${inr(o.todayBonus)} book-today bonus</small>`:''}</dd></div><div><dt>Pickup</dt><dd>${esc(o.when)}</dd></div><div><dt>Payout</dt><dd>${esc(payTxt)}</dd></div><div><dt>Price locked until</dt><dd>${o.lock}</dd></div><div><dt>Phone test</dt><dd>${testable&&passed?passed+' of 9 passed, shared with the agent':'Not run'}</dd></div></dl>
    ${o.video?'<p class="promise-line"><b>Video check:</b> we\'ll WhatsApp you for a 2-minute video call before the pickup.</p>':''}
    ${checksHtml(o.checks)}
    ${readyHtml(o.id)}
    <div id="doneShare"></div>
    <div class="row"><button type="button" class="btn btn-primary" data-done="track" data-id="${o.id}">Track this order</button><button type="button" class="btn btn-ghost" data-done="again">Sell another device</button></div></div>`;
  toast('Pickup booked · '+o.id);
  myShareCode().then(c=>{const el=$('#doneShare');if(c&&el)el.innerHTML=shareHtml(c,GROWTH.ref_friend,GROWTH.ref_referrer)}).catch(()=>{});
  return true;
}
$('#doneBox').addEventListener('click',e=>{
  const b=e.target.closest('[data-done]');if(!b)return;
  if(b.dataset.done==='copy'){const id=b.dataset.id;const ok=()=>toast('Order ID copied: '+id);try{navigator.clipboard.writeText(id).then(ok,()=>toast('Your order ID is '+id))}catch(_){toast('Your order ID is '+id)}return}
  if(b.dataset.done==='track'){$('#trackIn').value=b.dataset.id;runTrack();goTo('track')}
  else{resetWizard();goStep(1)}
});
function resetWizard(){S.ans={};S.qi=0;contactFilled=false;$('#savedNote').hidden=true;S.pickup.geo=null;locMsg('Share your location so the agent can find you on Google Maps.');['pfName','pfPhone','pfPin','pfAddr'].forEach(id=>{const el=$('#'+id);if(el)el.value=''});renderCond();renderQuote()}

/* ---------- phone test lab ---------- */
const TESTS=[['touch','Touchscreen'],['multi','Multi-touch'],['display','Display'],['speaker','Speaker'],['mic','Microphone'],['camera','Cameras'],['vibration','Vibration'],['motion','Motion sensors'],['charging','Charging port']];
const CRIT=['touch','display','speaker'];
let T=store.get('tests',{});if(!T||typeof T!=='object'||Array.isArray(T))T={};
Object.keys(T).forEach(k=>{if(!TESTS.some(t=>t[0]===k)||!['pass','fail','skip'].includes(T[k]))delete T[k]});
const card=id=>$('#t-'+id);
function msg(id,text,warn){const m=card(id).querySelector('[data-msg]');if(m){m.textContent=text;m.classList.toggle('warn',!!warn)}}
function showBtn(id,sel,on){const b=card(id).querySelector(sel);if(b)b.hidden=!on}
function status(id,cls,text){const st=card(id).querySelector('[data-st]');st.className='status'+(cls?' '+cls:'');st.textContent=text}
function paintT(id){const v=T[id];status(id,v||'',v==='pass'?'Passed':v==='fail'?'Problem found':v==='skip'?'Skipped':'Not started')}
function setT(id,v,text){if(v==null)delete T[id];else T[id]=v;store.set('tests',T);paintT(id);if(text!=null)msg(id,text,v==='fail');labSummary()}
function labSummary(){
  const vals=TESTS.map(t=>T[t[0]]),done=vals.filter(Boolean).length,pass=vals.filter(v=>v==='pass').length,fail=vals.filter(v=>v==='fail').length,skip=vals.filter(v=>v==='skip').length;
  $('#labDone').textContent=done+'/9';$('#labRing').style.strokeDashoffset=(314.16*(1-done/9)).toFixed(1);
  const ok=fail===0&&CRIT.every(k=>T[k]==='pass')&&pass>=5;
  const bonus=pctTxt(RULES.verified-1);
  if(ok!==S.verified){S.verified=ok;renderQuote()}
  $('#labHead').textContent=!done?'Run the tests on the phone you\'re selling':ok?'Verified: '+bonus+' added to your quote':fail?fail+' problem'+(fail>1?'s':'')+' found':done+' of 9 done';
  $('#labSub').textContent=!done?'Each test takes 10 to 30 seconds. Touchscreen, display and speaker are needed for the bonus.':ok?'Your results are shared with the agent when you book, so the check at pickup is quicker.':fail?'Use these results in your quote so it matches the agent\'s check. No surprises at pickup.':'Pass touchscreen, display and speaker, plus at least two more, for the '+bonus+' bonus.';
  $('#labPills').innerHTML=(pass?`<span class="status pass">${pass} passed</span>`:'')+(fail?`<span class="status fail">${fail} problem${fail>1?'s':''}</span>`:'')+(skip?`<span class="status skip">${skip} skipped</span>`:'');
  $('#labApply').disabled=!done;
  renderVerifyNote();
}
$$('[data-fail]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.fail;stopAll(id);setT(id,'fail','Marked as a problem. The agent will look at it at pickup.')}));
$$('[data-pass]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.pass;stopAll(id);setT(id,'pass','Works well.')}));
$$('[data-skip]').forEach(b=>b.addEventListener('click',()=>{const id=b.dataset.skip;stopAll(id);setT(id,'skip','Skipped. The agent checks this at pickup.')}));
function stopAll(id){if(id==='mic')stopMic();if(id==='camera')stopCam();if(id==='motion')stopMotion()}
function blocked(id,what){msg(id,`${what} access was blocked. Allow it in your browser settings and try again, or skip this test.`,true);showBtn(id,'[data-skip]',true);paintT(id)}

// touch
const tg=$('#touchGrid');tg.innerHTML=Array.from({length:60},(_,i)=>`<i data-i="${i}"></i>`).join('');
let touchedN=0;const drawing=new Set();
function markCell(e){const el=document.elementFromPoint(e.clientX,e.clientY);if(el&&el.parentElement===tg&&!el.classList.contains('on')){el.classList.add('on');touchedN++;
  msg('touch',touchedN+' of 60 squares');if(touchedN>=60)setT('touch','pass','All 60 squares respond to touch.');else if(T.touch!=='pass')status('touch','run','Testing')}}
tg.addEventListener('pointerdown',e=>{drawing.add(e.pointerId);try{tg.setPointerCapture(e.pointerId)}catch(_){}markCell(e);e.preventDefault()});
tg.addEventListener('pointermove',e=>{if(drawing.has(e.pointerId))markCell(e)});
['pointerup','pointercancel'].forEach(ev=>window.addEventListener(ev,e=>drawing.delete(e.pointerId)));
$('#touchReset').addEventListener('click',()=>{$$('i',tg).forEach(c=>c.classList.remove('on'));touchedN=0;setT('touch',null,'0 of 60 squares')});

// multi-touch
const mt=$('#mtArea'),pts=new Map();let mtMax=0;
function drawPts(){$$('.mt-dot',mt).forEach(d=>d.remove());const r=mt.getBoundingClientRect();let n=0;pts.forEach(p=>{n++;const d=document.createElement('i');d.className='mt-dot';d.style.left=(p.x-r.left)+'px';d.style.top=(p.y-r.top)+'px';d.textContent=n;mt.append(d)})}
mt.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse'){msg('multi','A mouse counts as one point. Use your fingers on a touchscreen.');return}
  pts.set(e.pointerId,{x:e.clientX,y:e.clientY});try{mt.setPointerCapture(e.pointerId)}catch(_){}e.preventDefault();
  mtMax=Math.max(mtMax,pts.size);drawPts();msg('multi','Most fingers at once: '+mtMax);
  if(mtMax>=2&&T.multi!=='pass')setT('multi','pass',`Detected ${mtMax} fingers at once.`);
});
mt.addEventListener('pointermove',e=>{if(pts.has(e.pointerId)){pts.set(e.pointerId,{x:e.clientX,y:e.clientY});drawPts()}});
['pointerup','pointercancel','lostpointercapture'].forEach(ev=>mt.addEventListener(ev,e=>{if(pts.delete(e.pointerId))drawPts()}));
if((navigator.maxTouchPoints||0)<2){showBtn('multi','[data-skip]',true);if(!T.multi)msg('multi','This screen doesn\'t report multi-touch. Open the page on your phone to run it.')}

// display
const DISP=[['#FF0000','Red'],['#00FF00','Green'],['#0000FF','Blue'],['#FFFFFF','White'],['#000000','Black']];
let di=0;const disp=$('#disp');
function showDisp(){
  if(di<DISP.length){disp.style.background=DISP[di][0];$('#dispHint').textContent=DISP[di][1]+' · '+(di+1)+' of 5 · tap to continue';$('#dispHint').hidden=false;$('#dispAsk').hidden=true}
  else{disp.style.background='#F0F9F3';$('#dispHint').hidden=true;$('#dispAsk').hidden=false;$('#dispOk').focus()}
}
$('#dispStart').addEventListener('click',()=>{di=0;disp.hidden=false;showDisp();disp.focus();status('display','run','Testing');try{const p=disp.requestFullscreen&&disp.requestFullscreen();if(p&&p.catch)p.catch(()=>{})}catch(_){}});
disp.addEventListener('click',e=>{if(di<DISP.length&&!e.target.closest('button')){di++;showDisp()}});
disp.addEventListener('keydown',e=>{if(di<DISP.length&&(e.key===' '||e.key==='Enter'||e.key==='ArrowRight')){e.preventDefault();di++;showDisp()}});
function endDisp(result){
  disp.hidden=true;try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{})}catch(_){}
  if(result===true)setT('display','pass','No dead pixels, lines or patches.');else if(result===false)setT('display','fail','Display issue noted. Choose "Cracked or faulty" for the screen.');else paintT('display');
  $('#dispStart').focus();
}
$('#dispOk').addEventListener('click',()=>endDisp(true));
$('#dispBad').addEventListener('click',()=>endDisp(false));

// speaker
let ac=null,beepN=0,spTries=0;
function audio(){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;if(!ac)ac=new C();if(ac.state==='suspended')ac.resume();return ac}
$('#spPlay').addEventListener('click',()=>{
  const a=audio();if(!a){setT('speaker','skip','This browser can\'t play test sounds.');return}
  beepN=2+Math.floor(Math.random()*4);status('speaker','run','Listen');msg('speaker','Listen carefully…');$('#spAns').hidden=true;$('#spPlay').disabled=true;
  let t=a.currentTime+.2;
  for(let i=0;i<beepN;i++){const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=880;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.55,t+.02);g.gain.setValueAtTime(.55,t+.17);g.gain.linearRampToValueAtTime(0,t+.21);o.connect(g);g.connect(a.destination);o.start(t);o.stop(t+.25);t+=.55}
  setTimeout(()=>{$('#spPlay').disabled=false;$('#spPlay').textContent='Play again';$('#spChips').innerHTML=[1,2,3,4,5,6].map(n=>`<button type="button" class="chip" data-n="${n}">${n}</button>`).join('');$('#spAns').hidden=false;msg('speaker','');},beepN*550+400);
});
$('#spChips').addEventListener('click',e=>{
  const b=e.target.closest('[data-n]');if(!b)return;const n=+b.dataset.n;$('#spAns').hidden=true;
  if(n===beepN){spTries=0;setT('speaker','pass',`Correct, ${beepN} beeps. Your speaker works.`)}
  else if(++spTries<2){paintT('speaker');msg('speaker',`Not quite: it played ${beepN}. Turn the volume up and play again.`,true)}
  else{spTries=0;setT('speaker','fail',`It played ${beepN} beeps. The speaker may be weak or faulty.`)}
});

// microphone
let micStream=null,micRaf=0;
function stopMic(){cancelAnimationFrame(micRaf);if(micStream){micStream.getTracks().forEach(t=>t.stop());micStream=null}$('#micLvl').style.width='0';$('#micStart').disabled=false}
$('#micStart').addEventListener('click',async()=>{
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){msg('mic','This browser can\'t use the microphone.',true);showBtn('mic','[data-skip]',true);return}
  const a=audio();if(!a){msg('mic','This browser can\'t analyse sound.',true);showBtn('mic','[data-skip]',true);return}
  $('#micStart').disabled=true;status('mic','run','Listening');msg('mic','Say "hello" or clap near the phone.');
  try{micStream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(err){$('#micStart').disabled=false;if(err&&err.name==='NotFoundError'){msg('mic','No microphone found on this device.',true);showBtn('mic','[data-skip]',true);paintT('mic')}else blocked('mic','Microphone');return}
  const src=a.createMediaStreamSource(micStream),an=a.createAnalyser();an.fftSize=1024;src.connect(an);
  const buf=new Float32Array(an.fftSize);let loud=0;const t0=performance.now();
  const loop=()=>{
    an.getFloatTimeDomainData(buf);let pk=0;for(let i=0;i<buf.length;i++){const v=Math.abs(buf[i]);if(v>pk)pk=v}
    $('#micLvl').style.width=Math.min(100,pk*180).toFixed(0)+'%';
    if(pk>.18)loud++;
    if(loud>8){stopMic();setT('mic','pass','Your microphone picks up sound clearly.');return}
    if(performance.now()-t0>12000){stopMic();paintT('mic');msg('mic','We didn\'t hear enough. Speak closer to the bottom of the phone and try again.',true);return}
    micRaf=requestAnimationFrame(loop);
  };loop();
});

// cameras
let camStream=null;const seen=new Set();
function stopCam(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null}const v=$('#camVid');v.srcObject=null;$('#camPh').hidden=false}
async function startCam(facing){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){msg('camera','This browser can\'t open the camera.',true);showBtn('camera','[data-skip]',true);return}
  stopCam();status('camera','run','Camera on');msg('camera','Opening the '+facing+' camera…');
  try{camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing==='back'?'environment':'user'}},audio:false})}
  catch(err){if(err&&err.name==='NotFoundError'){msg('camera','No camera found on this device.',true);showBtn('camera','[data-skip]',true);paintT('camera')}else blocked('camera','Camera');return}
  const v=$('#camVid');v.srcObject=camStream;$('#camPh').hidden=true;try{await v.play()}catch(_){}
  seen.add(facing);showBtn('camera','[data-pass]',true);showBtn('camera','[data-fail]',true);
  msg('camera',seen.size<2?`Is the ${facing} camera sharp? Then check the ${facing==='back'?'front':'back'} one too.`:'Both cameras opened. Are both pictures sharp and clear?');
}
$('#camBack').addEventListener('click',()=>startCam('back'));
$('#camFront').addEventListener('click',()=>startCam('front'));

// vibration
const canVibe='vibrate' in navigator;
if(!canVibe){$('#vibGo').hidden=true;showBtn('vibration','[data-skip]',true);if(!T.vibration)msg('vibration','This browser can\'t control vibration. iPhones never allow it on websites. The agent checks it at pickup.')}
$('#vibGo').addEventListener('click',()=>{
  let ok=false;try{ok=navigator.vibrate([400,180,400])}catch(_){}
  if(!ok){msg('vibration','Your browser blocked vibration. Skip this one and the agent will check it.',true);showBtn('vibration','[data-skip]',true);return}
  status('vibration','run','Testing');msg('vibration','Did you feel two pulses?');showBtn('vibration','[data-pass]',true);showBtn('vibration','[data-fail]',true);
});

// motion sensors
let motH=null,motT=0;
function stopMotion(){if(motH){window.removeEventListener('devicemotion',motH);motH=null}clearTimeout(motT);$('#motStart').disabled=false}
$('#motStart').addEventListener('click',async()=>{
  if(!('DeviceMotionEvent' in window)){msg('motion','This browser doesn\'t share motion sensor data.',true);showBtn('motion','[data-skip]',true);return}
  if(typeof DeviceMotionEvent.requestPermission==='function'){try{const r=await DeviceMotionEvent.requestPermission();if(r!=='granted'){blocked('motion','Motion sensor');return}}catch(_){blocked('motion','Motion sensor');return}}
  stopMotion();$('#motStart').disabled=true;status('motion','run','Tilt now');msg('motion','Tilt the phone left, right, forward and back.');
  let got=false,mnx=99,mxx=-99,mny=99,mxy=-99;const dot=$('#lvlDot');
  motH=e=>{const g=e.accelerationIncludingGravity;if(!g||g.x==null||g.y==null)return;got=true;
    const x=Math.max(-1,Math.min(1,g.x/9.8)),y=Math.max(-1,Math.min(1,g.y/9.8));dot.style.left=(50-x*38)+'%';dot.style.top=(50+y*38)+'%';
    mnx=Math.min(mnx,g.x);mxx=Math.max(mxx,g.x);mny=Math.min(mny,g.y);mxy=Math.max(mxy,g.y);
    if(mxx-mnx>6&&mxy-mny>4){stopMotion();setT('motion','pass','Accelerometer and tilt sensors respond.')}};
  window.addEventListener('devicemotion',motH);
  motT=setTimeout(()=>{if(T.motion==='pass')return;stopMotion();paintT('motion');showBtn('motion','[data-fail]',true);showBtn('motion','[data-skip]',true);
    msg('motion',got?'Tilt further in every direction and try again.':'No motion data came through. This device may have no sensors, or the browser blocks them.',true)},15000);
});

// battery + charging
let batObj=null,batT=0;
function paintBatt(b){$('#battFill').style.width=Math.round(b.level*100)+'%';$('#battPct').textContent=Math.round(b.level*100)+'%';$('#battState').textContent=b.charging?'Charging':'Not charging'}
$('#batGo').addEventListener('click',async()=>{
  if(!navigator.getBattery){msg('charging','This browser doesn\'t share battery details (Safari and Firefox don\'t). The agent checks the charging port at pickup.');showBtn('charging','[data-skip]',true);return}
  try{
    const b=await navigator.getBattery();paintBatt(b);
    if(b.charging){setT('charging','pass','Charging now, so the charging port works.');return}
    status('charging','run','Plug in');msg('charging','Plug in your charger now. We\'ll detect it automatically.');
    if(batObj!==b){batObj=b;b.addEventListener('chargingchange',()=>{paintBatt(b);if(b.charging){clearTimeout(batT);setT('charging','pass','Charging detected, so the charging port works.')}});b.addEventListener('levelchange',()=>paintBatt(b))}
    clearTimeout(batT);batT=setTimeout(()=>{if(T.charging==='pass')return;paintT('charging');showBtn('charging','[data-fail]',true);msg('charging','No charging detected yet. Try another cable or socket, or report a problem.',true)},30000);
  }catch(_){msg('charging','Battery details aren\'t available here.',true);showBtn('charging','[data-skip]',true)}
});

// device info
function devInfo(){
  const ua=navigator.userAgent||'';let os='Unknown',m;
  if((m=ua.match(/Android (\d+(?:\.\d+)?)/)))os='Android '+m[1];
  else if(/iPhone|iPod/.test(ua)){m=ua.match(/OS (\d+)_(\d+)/);os='iOS '+(m?m[1]+'.'+m[2]:'')}
  else if(/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))os='iPadOS';
  else if(/Macintosh/.test(ua))os='macOS';else if(/Windows/.test(ua))os='Windows';else if(/CrOS/.test(ua))os='ChromeOS';else if(/Linux/.test(ua))os='Linux';
  const br=/SamsungBrowser/.test(ua)?'Samsung Internet':/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/CriOS|Chrome\//.test(ua)?'Chrome':/FxiOS|Firefox/.test(ua)?'Firefox':/Safari/.test(ua)?'Safari':'Unknown';
  const mdl=(ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\sBuild|\))/)||[])[1];
  const dpr=window.devicePixelRatio||1,res=Math.round(screen.width*dpr)+' × '+Math.round(screen.height*dpr);
  const touch=navigator.maxTouchPoints||0,phone=touch>0&&Math.min(screen.width,screen.height)<=900;
  return{os,br,mdl:mdl&&mdl!=='K'?mdl:'',res,touch,cores:navigator.hardwareConcurrency||0,mem:navigator.deviceMemory||0,phone};
}
const DI=devInfo();
function deviceSummary(){return [DI.mdl,DI.os,DI.br,DI.res].filter(Boolean).join(' · ').slice(0,120)}
$('#devInfo').innerHTML=`<h3>This device</h3><dl>${DI.mdl?`<dt>Model code</dt><dd class="mono">${esc(DI.mdl)}</dd>`:''}<dt>System</dt><dd>${esc(DI.os)}</dd><dt>Browser</dt><dd>${esc(DI.br)}</dd><dt>Screen</dt><dd>${esc(DI.res)} pixels</dd><dt>Touch points</dt><dd>${DI.touch||'None'}</dd>${DI.cores?`<dt>Processor cores</dt><dd>${DI.cores}</dd>`:''}${DI.mem?`<dt>Memory</dt><dd>${DI.mem} GB or more</dd>`:''}</dl>${DI.phone?'':'<p class="dev-warn">You seem to be on a computer. Open recello.in on the phone you\'re selling to run these tests.</p>'}`;
$('#labReset').addEventListener('click',()=>{stopMic();stopCam();stopMotion();T={};store.set('tests',T);$$('i',tg).forEach(c=>c.classList.remove('on'));touchedN=0;mtMax=0;seen.clear();
  TESTS.forEach(([id])=>{paintT(id);msg(id,'');card(id).querySelectorAll('[data-pass],[data-fail]').forEach(b=>{if(b.closest('#t-touch,#t-multi,#t-speaker,#t-mic'))return;b.hidden=true})});
  msg('touch','0 of 60 squares');msg('multi','Most fingers at once: 0');labSummary();toast('Tests reset')});
$('#labApply').addEventListener('click',()=>{
  if(model().cat!=='phone'&&model().cat!=='tablet')setCat('phone');
  const sq=questionsFor(model()).find(q=>q.id==='screen');
  if(sq&&(T.touch==='fail'||T.display==='fail')){const o=sq.options.find(x=>x.id==='display')||sq.options.find(x=>/display/i.test(x.label));if(o)S.ans[sq.id]=[o.id]}
  $('#testBack').hidden=true;renderCond();renderQuote();goStep(2);goTo('sell');
  const fails=TESTS.filter(t=>T[t[0]]==='fail').length;
  toast(S.verified?'Phone test bonus added to your offer':fails?'Problems noted. The agent sees your test results at pickup.':'Results saved for your booking');
});
TESTS.forEach(([id])=>paintT(id));
if(T.touch==='pass'){$$('i',tg).forEach(c=>c.classList.add('on'));touchedN=60;msg('touch','All 60 squares respond to touch.')}
labSummary();

/* ---------- sell now or wait ---------- */
const P={id:'ip15',sel:3};
function launchOf(m){
  if(m.brand==='Apple'&&m.cat==='phone')return[8,'New iPhones launch','new iPhones launch'];
  if(m.brand==='Apple'&&m.cat==='watch')return[8,'New Apple Watch launch','the next Apple Watch launches'];
  if(m.brand==='Samsung'&&m.cat==='phone')return /Galaxy Z/.test(m.name)?[6,'New foldables launch','new foldables launch']:/Galaxy S/.test(m.name)?[0,'New Galaxy S launch','the next Galaxy S launches']:null;
  if(m.brand==='Samsung'&&m.cat==='watch')return[6,'New Galaxy Watch launch','the next Galaxy Watch launches'];
  if(m.brand==='Google')return[7,'New Pixels launch','new Pixels launch'];
  if(m.brand==='OnePlus'&&m.cat==='phone'&&!/Nord/.test(m.name))return[0,'New OnePlus launch','the next OnePlus flagship launches'];
  return null;
}
const RATE={phone:.022,tablet:.018,watch:.02,laptop:.015};
function niceStep(raw){const mag=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/mag;return(n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*mag}
const compact=v=>v>=1e5?'₹'+(v/1e5).toFixed(2).replace(/\.?0+$/,'')+'L':v>=1000?'₹'+Math.round(v/1000)+'k':'₹'+v;
function projection(m){
  const L=launchOf(m),rate=RATE[m.cat],now=new Date();let v=gated()?1000:topPrice(m,0);const pts=[];
  for(let i=0;i<=12;i++){
    const d=new Date(now.getFullYear(),now.getMonth()+i,1);let launch=false;
    if(i>0){v*=1-rate;if(L&&d.getMonth()===L[0]){v*=m.cat==='phone'?.93:.95;launch=true}}
    pts.push({i,d,v:r10(v),launch});
  }
  return{pts,L,rate};
}
const mLabel=p=>p.i===0?'Now':p.d.toLocaleDateString('en-IN',{month:'short'})+(p.d.getMonth()===0?" '"+String(p.d.getFullYear()).slice(2):'');
function renderPulse(){
  const m=byId[P.id],{pts,L,rate}=projection(m),gt=gated(),val=v=>gt?Math.round(v/10)+'%':inr(v),ax=v=>gt?Math.round(v/10)+'%':compact(v);
  const W=720,H=290,pl=58,pr=18,pt=28,pb=40;
  const vals=pts.map(p=>p.v),lo=Math.min(...vals),hi=Math.max(...vals);
  const step=niceStep(Math.max(hi-lo,hi*.05)/4),y0=Math.max(0,Math.floor(lo*.98/step)*step),y1=Math.ceil(hi*1.01/step)*step;
  const X=i=>pl+i*(W-pl-pr)/12,Y=v=>pt+(y1-v)/(y1-y0)*(H-pt-pb);
  let g=`<defs><linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#009441" stop-opacity=".22"/><stop offset="1" stop-color="#009441" stop-opacity="0"/></linearGradient></defs>`;
  for(let t=y0;t<=y1+1e-6;t+=step)g+=`<line class="gl" x1="${pl}" x2="${W-pr}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="ax" x="${pl-10}" y="${(Y(t)+3.5).toFixed(1)}" text-anchor="end">${ax(t)}</text>`;
  pts.forEach(p=>{if(p.i%2===0)g+=`<text class="ax" x="${X(p.i).toFixed(1)}" y="${H-pb+22}" text-anchor="middle">${mLabel(p)}</text>`});
  const lp=pts.find(p=>p.launch);
  if(lp){const x=X(lp.i),right=x<W/2;g+=`<line class="launch" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${pt-10}" y2="${H-pb}"/><text class="launch-t" x="${(right?x+8:x-8).toFixed(1)}" y="${pt-2}" text-anchor="${right?'start':'end'}">${L[1]}</text>`}
  const line=pts.map((p,k)=>(k?'L':'M')+X(p.i).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ');
  g+=`<path d="${line} L${X(12).toFixed(1)},${H-pb} L${X(0).toFixed(1)},${H-pb} Z" fill="url(#pfill)"/><path class="pline" d="${line}"/>`;
  pts.forEach(p=>{g+=`<circle class="pdot${p.i===P.sel?' sel':''}" cx="${X(p.i).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="${p.i===P.sel?6:3.4}"/>`});
  const cw=(W-pl-pr)/12;pts.forEach(p=>{g+=`<rect class="hit" data-i="${p.i}" x="${(X(p.i)-cw/2).toFixed(1)}" y="${pt}" width="${cw.toFixed(1)}" height="${H-pt-pb}"><title>${mLabel(p)}: ${val(p.v)}</title></rect>`});
  $('#pulseChart').innerHTML=g;
  const sp=pts[P.sel],drop=pts[0].v-sp.v;
  $('#pulseRead').innerHTML=gt?(P.sel===0?`Sell now: <b>100%</b> of today's price`:`${sp.d.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}: <b>${val(sp.v)}</b> of today's price, about ${Math.round(drop/10)}% less than selling now.`)
    :P.sel===0?`Sell now: <b>${inr(pts[0].v)}</b>`:`${sp.d.toLocaleDateString('en-IN',{month:'long',year:'numeric'})}: <b>${inr(sp.v)}</b>, about ${inr(drop)} less than selling now.`;
  const tile=(lbl,p)=>{const d=pts[0].v-p.v,pc=Math.round(d/pts[0].v*100);return `<div class="panel tile${p.i?'':' now'}"><small>${lbl}</small><b>${val(p.v)}</b>${p.i?`<span class="neg">${gt?'':`−${inr(d)} · `}−${pc}%</span>`:'<span>Today, like new</span>'}</div>`};
  $('#pulseTiles').innerHTML=tile('Sell now',pts[0])+tile('Wait 3 months',pts[3])+tile('Wait 6 months',pts[6])+tile('Wait 12 months',pts[12]);
  $('#pulseAssume').textContent=`Projection for a like-new ${m.name}. It assumes value falls about ${(rate*100).toFixed(1)}% a month${L?', with a further '+(m.cat==='phone'?7:5)+'% drop when '+L[2]:''}. Real prices also move with demand, so treat this as a guide.${gt?' Shown as a share of today\'s price; verify your mobile in the quote to see it in rupees.':''}`;
}
function renderPulseSelect(){const opt=m=>`<option value="${m.id}"${m.id===P.id?' selected':''}>${esc(m.name)}</option>`;
  $('#pulseSel').innerHTML=CATS.filter(c=>catOn(c.id)).map(c=>{const ms=CATALOG.filter(m=>m.cat===c.id);if(c.id!=='phone')return `<optgroup label="${c.label}s">${ms.map(opt).join('')}</optgroup>`;
    return [...new Set(ms.map(m=>m.brand))].map(b=>`<optgroup label="${esc(b)} phones">${ms.filter(m=>m.brand===b).map(opt).join('')}</optgroup>`).join('')}).join('')}
renderPulseSelect();
$('#pulseSel').addEventListener('change',e=>{P.id=e.target.value;renderPulse()});
const pc=$('#pulseChart');
pc.addEventListener('pointerover',e=>{const r=e.target.closest('[data-i]');if(r&&+r.dataset.i!==P.sel){P.sel=+r.dataset.i;renderPulse()}});
pc.addEventListener('click',e=>{const r=e.target.closest('[data-i]');if(r){P.sel=+r.dataset.i;renderPulse()}});

/* ---------- pickup location (browser location + Google Maps when a key is set in the panel) ---------- */
const LOC={loading:false,geocoder:null};
function locMsg(html,cls){const m=$('#pfLocMsg');if(!m)return;m.innerHTML=html;m.className='loc-msg'+(cls?' '+cls:'')}
const mapsLink=g=>`https://www.google.com/maps?q=${(+g.lat).toFixed(6)},${(+g.lng).toFixed(6)}`;
function setGeo(g,label){S.pickup.geo=g;locMsg(`<svg class="i"><use href="#i-check"/></svg><span>${esc(label)}.</span><a href="${mapsLink(g)}" target="_blank" rel="noopener">Check it on Google Maps</a>`,'ok')}
function fillAddr(comps,formatted,force){
  const pin=(comps||[]).find(c=>(c.types||[]).includes('postal_code')),pv=pin&&(pin.long_name||pin.longText||'');
  if(pv&&/^[1-9]\d{5}$/.test(pv)&&(force||!$('#pfPin').value.trim()))$('#pfPin').value=pv;
  if(formatted&&(force||!$('#pfAddr').value.trim()))$('#pfAddr').value=formatted;
}
$('#pfLocBtn').addEventListener('click',()=>{
  if(!navigator.geolocation){locMsg('This browser can\'t share your location. Type your address below.','warn');return}
  const b=$('#pfLocBtn');b.disabled=true;locMsg('Finding you…');
  navigator.geolocation.getCurrentPosition(p=>{
    b.disabled=false;
    const g={lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0)};
    setGeo(g,'Location added'+(g.acc?', accurate to about '+(g.acc>=1000?(g.acc/1000).toFixed(1)+' km':g.acc+' m'):''));
    if(LOC.geocoder)LOC.geocoder.geocode({location:{lat:g.lat,lng:g.lng}},(res,st)=>{if(st==='OK'&&res&&res[0])fillAddr(res[0].address_components,res[0].formatted_address,false)});
  },err=>{
    b.disabled=false;
    locMsg(err&&err.code===1?'Location is blocked. Allow it for this site in your browser settings, or type your address below.':'Couldn\'t find your location. Type your address below.','warn');
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
});
function loadMaps(key){
  if(LOC.loading||!key||!/^[A-Za-z0-9_-]{20,80}$/.test(key))return;LOC.loading=true;
  window.__recelloMaps=async()=>{try{
    const places=await google.maps.importLibrary('places');LOC.geocoder=new google.maps.Geocoder();
    const box=$('#pfPlaceBox');
    const done=(g,comps,addr)=>{fillAddr(comps,addr,true);setGeo(g,'Address found on Google Maps')};
    if(places.PlaceAutocompleteElement){
      const el=new places.PlaceAutocompleteElement({includedRegionCodes:['in']});el.setAttribute('placeholder','Search your building or area');box.appendChild(el);
      const pick=async place=>{await place.fetchFields({fields:['formattedAddress','location','addressComponents','displayName']});
        const nm=place.displayName&&!(place.formattedAddress||'').startsWith(place.displayName)?place.displayName+', ':'';
        done({lat:place.location.lat(),lng:place.location.lng()},(place.addressComponents||[]).map(c=>({types:c.types,longText:c.longText})),nm+(place.formattedAddress||''))};
      el.addEventListener('gmp-select',e=>{if(e.placePrediction)pick(e.placePrediction.toPlace())});
      el.addEventListener('gmp-placeselect',e=>{if(e.place)pick(e.place)});
    }else if(places.Autocomplete){
      const inp=document.createElement('input');inp.placeholder='Search your building or area';inp.setAttribute('aria-label','Search your address on Google Maps');box.appendChild(inp);
      const ac=new places.Autocomplete(inp,{componentRestrictions:{country:'in'},fields:['formatted_address','geometry','address_components','name']});
      ac.addListener('place_changed',()=>{const p=ac.getPlace();if(!p.geometry)return;const nm=p.name&&!(p.formatted_address||'').startsWith(p.name)?p.name+', ':'';
        done({lat:p.geometry.location.lat(),lng:p.geometry.location.lng()},p.address_components,nm+(p.formatted_address||''))});
    }
    box.hidden=false;
  }catch(e){}};
  const sc=document.createElement('script');sc.async=true;sc.onerror=()=>{LOC.loading=false};
  sc.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&libraries=places&loading=async&region=IN&language=en&callback=__recelloMaps';
  document.head.appendChild(sc);
}
/* ---------- repair ---------- */
const RP_DEV=[['ip-new','iPhone 15, 16, 17 or 18 series'],['ip-old','iPhone 12, 13 or 14 series'],['and-flag','Galaxy S, Pixel or OnePlus flagship'],['and-mid','Other Android phones']];
const RP_ISS=[
  ['screen','Screen',[22900,12900,15900,5900],'45 to 60 min'],
  ['battery','Battery',[7900,4900,4500,2400],'30 to 45 min'],
  ['charge','Charging port',[5900,3900,3200,1500],'40 to 60 min'],
  ['back','Back glass',[8900,5900,5900,1900],'60 to 90 min'],
  ['camera','Camera',[11900,6900,7900,2900],'40 to 60 min'],
  ['speaker','Speaker or mic',[3900,2900,2600,1200],'30 to 45 min'],
  ['water','Water damage',[999,999,999,999],'Diagnosis within 24 hours']
];
const RP={dev:'ip-old',iss:'screen',mode:'door'};
let REPAIR_PRICES=false; /* Admin > Website > Sections > Repair: show prices */
function renderRepair(){
  $('#rpDev').innerHTML=RP_DEV.map(([k,l])=>`<button type="button" class="opt" data-rd="${k}" aria-pressed="${RP.dev===k}"><b>${esc(l)}</b></button>`).join('');
  $('#rpIss').innerHTML=RP_ISS.map(([k,l])=>`<button type="button" class="chip" data-ri="${k}" aria-pressed="${RP.iss===k}">${esc(l)}</button>`).join('');
  $('#rpMode').innerHTML=[['door','At my door'],['store','At a Recello store']].map(([k,l])=>`<button type="button" data-rm2="${k}" aria-pressed="${RP.mode===k}">${l}</button>`).join('');
  renderEst();
}
function renderEst(){
  const di2=Math.max(0,RP_DEV.findIndex(d=>d[0]===RP.dev)),iss=RP_ISS.find(i=>i[0]===RP.iss)||RP_ISS[0],price=iss[2][di2],water=iss[0]==='water';
  const head=REPAIR_PRICES?`<p class="eyebrow">${water?'Diagnosis fee':'Estimated cost'}</p><div class="est-price">${inr(price)}</div>`:`<p class="eyebrow">Book a repair</p><h3 class="est-title">${esc(iss[1])} repair</h3>`;
  $('#rpEst').innerHTML=`${head}
    <ul class="est-list"><li><span>Device</span><b>${esc(RP_DEV[di2][1])}</b></li><li><span>Repair</span><b>${esc(iss[1])}</b></li><li><span>Time</span><b>${esc(iss[3])}</b></li><li><span>Warranty</span><b>6 months on parts</b></li><li><span>Visit</span><b>${RP.mode==='door'?'Free doorstep visit':'Walk in, no appointment'}</b></li></ul>
    <p class="hint">${REPAIR_PRICES?(water?'The fee is adjusted against the repair if you go ahead.':'Final price is confirmed after the technician inspects the device.'):'The technician checks your phone and tells you the price before starting. You pay only if you go ahead.'}</p>
    <div class="form-grid"><label class="fld"><span>Mobile number</span><input id="rpPhone" type="tel" inputmode="numeric" autocomplete="tel-national" enterkeyhint="next"><em class="err" data-err="rpPhone"></em></label><label class="fld"><span>Pincode</span><input id="rpPin" inputmode="numeric" maxlength="6" autocomplete="postal-code"><em class="err" data-err="rpPin"></em></label></div>
    <button type="button" class="btn btn-primary" id="rpBook">Book this repair</button>`;
}
$('#repair').addEventListener('click',async e=>{
  const d=e.target.closest('[data-rd]'),i=e.target.closest('[data-ri]'),md=e.target.closest('[data-rm2]');
  const keepP=$('#rpPhone')?$('#rpPhone').value:'',keepN=$('#rpPin')?$('#rpPin').value:'';
  if(d||i||md){
    if(d)RP.dev=d.dataset.rd;if(i)RP.iss=i.dataset.ri;if(md)RP.mode=md.dataset.rm2;
    const sel=d?'[data-rd]':i?'[data-ri]':'[data-rm2]',btn=d||i||md;
    $$('#repair '+sel).forEach(x=>x.setAttribute('aria-pressed',String(x===btn)));
    renderEst();$('#rpPhone').value=keepP;$('#rpPin').value=keepN;return;
  }
  if(e.target.closest('#rpBook')){
    const phone=$('#rpPhone').value.replace(/\D/g,''),pin=$('#rpPin').value.trim(),errs={};
    if(!/^[6-9]\d{9}$/.test(phone))errs.rpPhone='Enter a 10-digit Indian mobile number.';
    if(!/^[1-9]\d{5}$/.test(pin))errs.rpPin='Enter your 6-digit pincode.';
    if(!showErrs(errs,['rpPhone','rpPin']))return;
    const di2=Math.max(0,RP_DEV.findIndex(x=>x[0]===RP.dev)),iss=RP_ISS.find(x=>x[0]===RP.iss)||RP_ISS[0];
    let o={id:newId(),type:'repair',title:iss[1]+' repair · '+RP_DEV[di2][1],amount:REPAIR_PRICES?iss[2][di2]:null,when:RP.mode==='door'?'Technician calls to fix a time':'Walk in any time',created:Date.now(),step:1,city:S.city};
    if(LIVE){
      const bb=$('#rpBook');bb.disabled=true;
      try{const r=await apiPost('create_order',{type:'repair',device:RP.dev,issue:RP.iss,mode:RP.mode,phone,pincode:pin,city:S.city});o={...o,id:r.id,key:r.key||'',title:r.title,amount:REPAIR_PRICES?r.amount:null,live:true,agent_card:r.agent_card||null,wa:!!r.wa,step:r.agent_card?2:1}}
      catch(err){bb.disabled=false;toast(err.message||'Could not book the repair. Please try again.');return}
    }
    if(!o.live&&LX.agent){o.agent_card=Object.assign({role:'technician',open:true},LX.agent);o.wa=true;o.step=2}
    saveOrder(o);px('Schedule',{content_name:o.title||'Repair'});toast('Repair booked · '+o.id);$('#trackIn').value=o.id;runTrack();
    $('#rpBook').textContent='Booked · '+o.id;$('#rpBook').disabled=true;
    // booked: the order number, then the technician (or "picking your technician"), like a sell booking
    const old=$('#rpDone');if(old)old.remove();
    $('#rpBook').insertAdjacentHTML('afterend',`<div class="rp-done" id="rpDone"><div class="done-id"><b>${esc(o.id)}</b><button type="button" class="btn btn-ghost btn-sm" data-rpdone="copy" data-id="${esc(o.id)}"><svg class="i"><use href="#i-check"/></svg>Copy order ID</button></div>
      ${thanksHtml('',o.id,o.when,true,!!o.agent_card)}
      ${agentCardHtml(o.agent_card,{tech:true,wa:o.wa,phone,fresh:true})}
      <button type="button" class="btn btn-primary" data-rpdone="track" data-id="${esc(o.id)}">Track this repair</button></div>`);
    const dn=$('#rpDone');dn.addEventListener('click',ev=>{const b=ev.target.closest('[data-rpdone]');if(!b)return;const id=b.dataset.id;
      if(b.dataset.rpdone==='copy'){const ok=()=>toast('Order ID copied: '+id);try{navigator.clipboard.writeText(id).then(ok,()=>toast('Your order ID is '+id))}catch(_){toast('Your order ID is '+id)}return}
      $('#trackIn').value=id;runTrack();goTo('track')});
    pageScroll(dn,'start',true);
  }
});

/* ---------- impact ---------- */
const DRAWER=[['phone','Phones',6500,CO2.phone,.19],['laptop','Laptops',15000,CO2.laptop,1.6],['tablet','Tablets',8000,CO2.tablet,.5],['watch','Watches and earbuds',3000,CO2.watch,.05]];
const D={phone:2,laptop:1,tablet:0,watch:1};
function renderDrawer(){
  $('#drawer').innerHTML=DRAWER.map(([k,l])=>`<div class="stp"><div class="stp-l"><span class="tw">${thumb(k,k+'d',8)}</span>${l}</div><div class="stp-c"><button type="button" data-dd="${k}" data-n="-1" aria-label="One fewer ${l.toLowerCase()}">−</button><output id="dc-${k}" aria-live="polite">${D[k]}</output><button type="button" data-dd="${k}" data-n="1" aria-label="One more ${l.toLowerCase()}">+</button></div></div>`).join('')+`<p class="hint">Example counts. Set your own.</p>`;
  renderImpact();
}
function renderImpact(){
  let worth=0,co2=0,kg=0,n=0;DRAWER.forEach(([k,,w,c,e])=>{worth+=D[k]*w;co2+=D[k]*c;kg+=D[k]*e;n+=D[k]});
  $('#impactOut').innerHTML=`<div class="panel big wide hero-num"><small>Your drawer could be worth</small><b>${inr(worth)}</b><span>${n} device${n===1?'':'s'}, at typical prices for 2 to 4 year old models.</span></div>
    <div class="panel big"><small>CO₂e avoided</small><b>≈${Math.round(co2)} kg</b><span>Manufacturing that reuse can replace</span></div>
    <div class="panel big"><small>E-waste kept out</small><b>≈${kg.toFixed(1)} kg</b><span>Reused or recycled, never dumped</span></div>
    <div class="panel big wide cta"><span>Get exact prices for each one, or book a free recycling pickup for anything that no longer works.</span><button type="button" class="btn btn-primary" id="impactGo">Price my devices</button></div>`;
}
$('#impact').addEventListener('click',e=>{
  const b=e.target.closest('[data-dd]');
  if(b){const k=b.dataset.dd;D[k]=Math.max(0,Math.min(20,D[k]+(+b.dataset.n)));$('#dc-'+k).textContent=D[k];renderImpact();return}
  if(e.target.closest('#impactGo')){const first=DRAWER.find(([k])=>D[k]>0);setCat(first?first[0]:'phone');goStep(1);goTo('sell')}
});

/* ---------- orders + tracking ---------- */
const FLOWS={sell:['Pickup booked','Agent assigned','Device checked','Paid'],repair:['Repair booked','Technician assigned','Repaired and tested','Handed back to you']};
const SAMPLE={id:'SMK000',type:'sell',title:'iPhone 14 · 128GB',amount:27450,when:'Paid at the door',step:4,sample:true,
  recheck:{was:27450,price:27450,changes:[]},share:{code:'K7Q2PW',friend:200,referrer:200},receipt:{paid_at:Math.floor(Date.now()/1000)-86400,payout:'UPI',imei4:'4821',wiped:Math.floor(Date.now()/1000)-80000,city:'Pune'}};
function saveOrder(o){S.orders.unshift(o);S.orders=S.orders.slice(0,20);store.set('orders',S.orders);renderRecent()}
function findOrder(raw){
  const id=normId(raw);if(!id)return null;
  return S.orders.find(o=>o.id===id)||(id===SAMPLE.id?SAMPLE:null);
}
/* the key that opens an SMK order page: from the booking on this device, the WhatsApp link, or a past lookup */
const trackKey=id=>{const o=S.orders.find(x=>x.id===id);return (o&&o.key)||(store.get('tkeys',{})||{})[id]||''};
function keepKey(id,k){if(!k)return;const all=store.get('tkeys',{})||{};all[id]=k;const ks=Object.keys(all);if(ks.length>30)delete all[ks[0]];store.set('tkeys',all)}
function renderRecent(){
  const ids=[...S.orders.filter(o=>!LIVE||o.live).slice(0,4).map(o=>o.id),...(LIVE?[]:[SAMPLE.id])];
  $('#recent').innerHTML=ids.length?'<span>Recent:</span>'+ids.map(id=>`<button type="button" class="chip" data-tid="${id}">${id}${id===SAMPLE.id?' (sample)':''}</button>`).join(''):'';
}
function renderTrack(o,flow,times){
  const labels={sell:'Sell',repair:'Repair',buy:'Order'};
  const fmtT=t=>new Date(t*1000).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
  $('#trackOut').innerHTML=`<div class="tr-head"><div><b>${esc(o.title)}</b><span class="tag">${labels[o.type]||'Order'}</span>${o.sample?'<span class="tag">Sample</span>':''}${o.cancelled?'<span class="tag" style="background:var(--bad-soft);color:var(--bad)">Cancelled</span>':''}</div><span class="mono">${esc(o.id)}${o.amount!=null&&!(o.type==='repair'&&!REPAIR_PRICES)?' · '+inr(Math.abs(o.amount)):''}</span></div>
    <ol class="timeline">${flow.map((s,i)=>{const done=i<o.step;const sub=done?(times&&times[i+1]?fmtT(times[i+1]):(i===o.step-1&&o.when?esc(o.when):'Done')):o.cancelled?'Cancelled':i===o.step?'Up next':'Waiting';return `<li class="${done?'done':i===o.step&&!o.cancelled?'now':''}"><b>${esc(s)}</b><small>${sub}</small></li>`}).join('')}</ol>${o.slot&&o.step<3&&!o.cancelled?`<p class="muted" style="margin-top:14px">Pickup: ${esc(o.slot)}</p>`:''}${trBlocks(o)}`;
  TR.last=o;
}
/* links in WhatsApp messages: /track/SMK001?k=… (index.php serves this page) or ?track=SMK001&k=… */
(()=>{try{const qs=new URLSearchParams(location.search),m=location.pathname.match(/\/track\/((?:SMK|RC)-?[0-9]+)\/?$/i)||[null,qs.get('track')];
  if(m[1]&&qs.get('k'))keepKey(normId(decodeURIComponent(m[1])),qs.get('k').replace(/[^A-Za-z0-9]/g,'').slice(0,16));
  if(m[1]){let n=0;const go=()=>{if(!LIVE&&n++<12){setTimeout(go,300);return}const i=document.getElementById('trackIn');if(!i)return;i.value=decodeURIComponent(m[1]).toUpperCase();runTrack();goTo('track')};setTimeout(go,300);
    if(/\/track\//i.test(location.pathname)||qs.get('k'))history.replaceState(null,'',location.pathname.replace(/track\/.*$/i,'')+'#track')}}catch(_){}})();
async function runTrack(){
  const raw=$('#trackIn').value.trim(),out=$('#trackOut');
  if(!raw){out.innerHTML='<p class="muted">Enter an order ID to see its progress.</p>';return}
  if(LIVE){
    const id=normId(raw),ph=$('#trackPh').value.replace(/\D/g,''),q={id};
    const k=trackKey(id);if(k)q.k=k;if(ph.length===4)q.ph=ph;
    out.innerHTML='<p class="muted">Checking…</p>';
    try{const r=await apiGet('track',q);keepKey(r.id,r.key);$('#trackPhBox').hidden=true;$('#trackPh').value='';
      const times={};(r.history||[]).forEach(h=>{if(!h.cancelled)times[h.step]=h.at});renderTrack(r,r.flow,times)}
    catch(e){
      if(e.need==='phone'){const b=$('#trackPhBox');b.hidden=false;out.innerHTML=`<p class="muted">${esc(e.message)}</p>`;setTimeout(()=>$('#trackPh').focus(),30)}
      else out.innerHTML=`<p class="muted">${esc(e.message||'Could not check that order right now.')}</p>`}
    return;
  }
  const o=findOrder(raw);
  if(!o){out.innerHTML=`<p class="muted">We couldn't find <b class="mono">${esc(raw.toUpperCase())}</b> on this device. Check the ID on your booking confirmation, or email ${esc(BIZ.supportEmail)}.</p>`;return}
  renderTrack(o,FLOWS[o.type]||FLOWS.sell,null);
}
$('#trackForm').addEventListener('submit',e=>{e.preventDefault();runTrack()});
$('#recent').addEventListener('click',e=>{const b=e.target.closest('[data-tid]');if(b){$('#trackIn').value=b.dataset.tid;runTrack()}});

/* ---------- Cello chatbot ---------- */
function findModel(raw){
  const t=' '+norm(raw)+' ';let best=null,len=0;
  CATALOG.forEach(m=>m.alias.forEach(a=>{if(a.length>len&&t.includes(' '+a+' ')){best=m;len=a.length}}));
  return best;
}
const repairTier=m=>{if(!m||m.cat!=='phone')return null;if(m.brand==='Apple')return /iPhone 1[5-9]|iPhone Air/.test(m.name)?0:1;if(/Galaxy S|Pixel 9 Pro|OnePlus 1[23]|X200|Xiaomi 14/.test(m.name))return 2;return 3};
const DEF_CHIPS=["What's my phone worth?",'Test my phone','Track an order','Book a repair','Is my data safe?'];
function stripHtml(h){const d=document.createElement('div');d.innerHTML=h.replace(/<br>/g,'\n');return d.textContent}
function ruleReply(raw){
  const t=' '+norm(raw)+' ',words=t.trim().split(' ');
  const w=(...a)=>a.some(x=>t.includes(' '+x+' '));
  const s=(...a)=>a.some(x=>t.includes(x));
  const R=(html,chips,actions)=>({html,text:stripHtml(html),chips:chips||DEF_CHIPS,actions:actions||[]});
  const m=findModel(raw);
  const idm=String(raw).match(ORDER_RE);
  const bonus=pctTxt(RULES.verified-1);
  if(idm){
    const o=findOrder(idm[1]),id=normId(idm[1]);
    if(o){const f=FLOWS[o.type]||FLOWS.sell;return R(`<b>${o.id}</b> · ${esc(o.title)}<br>Status: <b>${f[o.step-1]}</b> (${o.step} of ${f.length} steps)${o.step<f.length?'<br>Next: '+f[o.step].toLowerCase()+'.':''}`,null,[{label:'Open tracker',act:'track',arg:o.id}])}
    return R(`I can't find <b>${id}</b> on this device. The ID is on your booking confirmation. If it's correct, email ${esc(BIZ.supportEmail)} and the team will check it.`,null,[{label:'Open tracker',act:'track',arg:id}]);
  }
  if(w('hi','hello','hey','hii','helo','namaste','hola','yo')&&words.length<=3)return R("Hi! I can price your device in seconds, help you test your phone, book a free pickup or a repair, or check an order. What would you like to do?");
  if(s('thank','shukriya','dhanyavad')||w('thx','ty'))return R("Happy to help. Anything else I can sort out?");
  if(s('refurb','buy a ','buy an ','purchase','kharid','sell me','second hand phone','used phone for sale','emi','in stock'))return R("We don't sell phones or other devices. Recello buys your old devices, repairs phones and recycles what can't be reused. Want a price for yours?",["What's my phone worth?",'Book a repair'],[{label:'Get my price',act:'go',arg:'sell'}]);
  const sellish=s('sell','bech','price','worth','kitna','kitne','value','quote','offer','resale','rate','do you buy','you buy');
  const damaged=s('broken','crack','dead','damage','not working','kharab','not turning on','water');
  if(sellish&&damaged&&!s('repair','fix'))return R(`Yes, we buy damaged devices too: cracked screens, dead batteries, even phones that don't switch on. Pick "Display Issues", "Cracked or Broken Screen" or "Poor" in the quote and you'll see your offer straight away.${m?'':' Which device is it?'}`,['iPhone 13 cracked screen','Galaxy S24 not turning on'],m?[{label:'Get exact quote for '+m.name,act:'quote',arg:m.id,vi:variantFrom(m,raw)}]:[{label:'Start a quote',act:'go',arg:'sell'}]);
  if(s('repair','fix','screen replace','battery replace','not charging','theek','replacement','broken screen')){
    const tier=repairTier(m);
    const issue=s('screen','display','crack')?'screen':s('battery')?'battery':s('charg','port')?'charge':s('back glass','back panel')?'back':s('camera')?'camera':s('speaker','mic','sound','audio')?'speaker':s('water','liquid','wet')?'water':null;
    if(tier!=null&&issue){
      const it=RP_ISS.find(x=>x[0]===issue);
      if(it&&RP_DEV[tier])return R(REPAIR_PRICES?`${esc(it[1])} repair for the <b>${esc(m.name)}</b>: <span class="rng">${issue==='water'?inr(it[2][tier])+' diagnosis':inr(it[2][tier])}</span>Takes ${esc(it[3])}, at your door or in store, with a 6-month warranty on parts.`:`We can do the ${esc(it[1].toLowerCase())} repair on your <b>${esc(m.name)}</b>, at your door or in store. It takes ${esc(it[3])}, with a 6-month warranty on parts. The technician checks the phone and tells you the price before starting.`,null,[{label:'Book this repair',act:'repair',arg:RP_DEV[tier][0],iss:issue}]);
    }
    return R("We fix screens, batteries, charging ports, back glass, cameras and speakers, at your door or in store. Most repairs take under an hour and parts carry a 6-month warranty. Tell me your phone and what's wrong, like “iPhone 14 screen”.",['iPhone 14 screen','Galaxy S24 battery','OnePlus 12 charging port'],[{label:REPAIR_PRICES?'Estimate my repair':'Book a repair',act:'go',arg:'repair'}]);
  }
  if(s('test','check my phone','diagnos','dead pixel','touch screen','touchscreen','microphone','self check','checkup'))return R(`Open this page on the phone you're selling and go to Phone test. Nine quick checks (touchscreen, multi-touch, display, speaker, microphone, cameras, vibration, motion sensors and charging) take about 2 minutes. Pass the key ones and you get ${bonus} extra, and the pickup check is quicker. Nothing is recorded or uploaded.`,['How is the price calculated?','Book a pickup'],[{label:'Start the phone test',act:'go',arg:'test'}]);
  if(m){
    const vi=variantFrom(m,raw),hi=topPrice(m,vi),lo=r10(hi*fairFactor(m.cat));
    if(gated())return R(`<b>${esc(m.name)} (${esc(m.variants[vi][0])})</b>We buy it. Answer a few quick questions and verify your mobile number with an OTP to see your exact price. It takes about a minute, and the price is held for 7 days.`,['Test my phone','Book a pickup','How do I get paid?'],[{label:'Get my price',act:'quote',arg:m.id,vi}]);
    return R(`<b>${esc(m.name)} (${esc(m.variants[vi][0])})</b><span class="rng">${inr(lo)} – ${inr(hi)}</span>The top price is for a like-new device under 3 months old, with its bill, box and charger. For your exact offer, answer a few quick questions; it takes about a minute.`,['Test my phone','Book a pickup','How do I get paid?'],[{label:'Get exact quote',act:'quote',arg:m.id,vi}]);
  }
  if(sellish||s('how much'))return R("Sure. Which device? Tell me the model and storage, like “iPhone 14 128GB” or “Galaxy S24”. We buy phones and tablets; laptops are coming soon.",['iPhone 15 128GB','Galaxy S24','OnePlus 12','MacBook Air M2']);
  if(s('less at pickup','reduce','price cut','cut the price','lower price','bargain','haggle','price change','change the price','surprise','cheat'))return R("The agent checks only the answers you gave, with you watching. If an answer turns out different, you see which one changed and the new price from the same price list, and then you decide. Saying no at the door costs nothing.");
  if(s('higher quote','better price','better offer','more money','price match','another app','other app','another company','other company','another site','other site','offered me','giving more','paying more'))return R("If someone offered you more, tap \"Got a higher quote somewhere else?\" on your offer screen and add a screenshot of their quote. We'll check it and call you back. We can't always match it, but we'll try.");
  if(s('not listed','not in the list','cant find','can t find','dont see','don t see','other model','my model is not'))return R("We can still price it. Tell us the brand and model and we'll call or WhatsApp you with a price, usually the same day.",null,[{label:'Get a price for any model',act:'req',arg:''}]);
  if(s('calculat','how is the price','deduct'))return R("Your offer depends on your model and the condition you tell us about in a few quick questions. You see your exact offer before you book, and the agent checks the same answers at your door. Passing the phone test adds "+bonus+".",null,[{label:'Get my price',act:'go',arg:'sell'}]);
  if(s('when','wait','best time','drop','depreciat','later'))return R("Prices slide a little every month and drop harder when new models launch, like iPhones each September. If you're going to sell, sooner usually pays more. The projection chart shows the numbers for your model.",null,[{label:'See the projection',act:'go',arg:'pulse'}]);
  if(s('pickup','pick up','schedule','slot','doorstep','ghar','visit','come to'))return R(`Pickup is free. Choose a 2-hour slot between 9 AM and 7 PM, as early as today in ${esc(S.city)} if you book before 3 PM. The agent checks your device in about 10 minutes and pays you on the spot.`,null,[{label:'Book a pickup',act:'go',arg:'sell'}]);
  if(s('payment','paid','upi','money','paisa','bank','cash','transfer','payout')||w('pay'))return R("You're paid at pickup, as soon as the check passes: cash in your hand or UPI, whichever you choose when you book. The agent pays you before leaving with the device.");
  if(s('data','wipe','privacy','photo','erase','factory reset','personal','safe'))return R("Your data is safe. Every device is erased with certified wiping software and you get a wipe certificate by email. Before pickup, back up your phone and sign out of iCloud (Find My) or your Google account so the device isn't locked. The phone test records nothing.");
  if(s('document','kyc','aadhaar','aadhar','pan card','invoice','proof','licence','license')||w('id','bill'))return R("Keep a government photo ID ready: Aadhaar, PAN, driving licence or passport. If the device is under 3 months old, we also need the purchase bill.");
  if(s('warranty','guarantee'))return R("Repairs come with a 6-month warranty on every part we replace.",null,[{label:'Estimate a repair',act:'go',arg:'repair'}]);
  if(s('city','cities','available','serviceable','pincode','location','area'))return R(`We pick up and repair in ${esc(listTxt(CITIES))} right now${SOON.length?`, and we're coming soon to ${esc(listTxt(SOON.slice(0,4)))}${SOON.length>4?' and more':''}`:''}. You're set to ${esc(S.city)}.`,null,[{label:'Change city',act:'city'}]);
  if(s('recycle','e waste','ewaste','dispose','scrap','old battery'))return R("Devices we can't buy, we recycle free through authorised e-waste partners, and you get a recycling certificate. Start a quote, choose “Poor” for the physical condition, and we'll take it from there.",null,[{label:'See my drawer impact',act:'go',arg:'impact'}]);
  if(s('human','agent','talk to','customer care','support','contact','email','call','helpline','complaint'))return R(`You can reach the team at ${esc(BIZ.supportEmail)}, ${esc(BIZ.hours)}. If you have an order ID, paste it here and I'll check it now.`);
  if(s('track','status','where is','order'))return R("Type your order number (it starts with SMK, like SMK014) and I'll check it.");
  return R("I didn't quite catch that. I can price a device, help you test your phone, book a pickup or repair, or check an order. Try “price of iPhone 13 128GB”.");
}
function aiRules(){
  const said=Chat.turns.filter(t=>t.role==='user').slice(-6).map(t=>t.content).join(' ');
  const rel=new Set([S.modelId,...POP_GRID,...matchModels(said).map(m=>m.id),...CATALOG.filter(m=>m.cat!=='phone').map(m=>m.id)]);
  const g=gated();
  const list=CATALOG.filter(m=>rel.has(m.id)).map(m=>g?`${m.name} [${m.variants.map(v=>v[0]).join(' / ')}]`:`${m.name} [${m.variants.map(v=>v[0]).join(' / ')}]: ${inr(r10(topPrice(m,0)*fairFactor(m.cat)))} to ${inr(topPrice(m,0))} for base storage`).join('\n')+`\n(Recello buys ${CATALOG.filter(m=>m.cat==='phone').length} phone models in all. For a phone not listed above, tell them to search for it in "Get my price" to see the exact price.)`;
  const m=model(),done=TESTS.filter(t=>T[t[0]]),passed=done.filter(t=>T[t[0]]==='pass').map(t=>t[1]),failed=done.filter(t=>T[t[0]]==='fail').map(t=>t[1]);
  return `You are Cello, the assistant in the help chat on Recello (recello.in, tagline "Sell smart, reuse better"), an Indian company that buys used phones and tablets (laptops coming soon, smartwatches not bought), repairs phones, and recycles e-waste. Recello does NOT sell devices of any kind, new or refurbished: if asked, say so plainly and offer to price their device instead.

Style: warm, direct, at most 80 words. Plain text only: no markdown, no headings, no asterisks. Short lines starting with "•" are fine for lists. Reply in the viewer's language (English, Hindi or Hinglish). Use ₹ with Indian digit grouping, like ₹1,24,500.

What you know:
• Selling: instant quote on the site → free doorstep pickup in a 2-hour slot (9 AM–7 PM) → agent checks the device in about 10 minutes → payment at pickup in cash or by UPI (the customer chooses when booking), before the agent leaves. The quote is locked for 7 days. The price changes at pickup only if the condition differs from what was declared, and the seller can cancel free.
• Phone test on the site: 9 browser tests (touchscreen, multi-touch, display, speaker, microphone, cameras, vibration, motion sensors, charging port). Passing touchscreen, display and speaker plus two more, with no problems, adds ${pctTxt(RULES.verified-1)} to the quote. Nothing is recorded or uploaded; only pass or fail results are shared with the agent.
• Bring to pickup: the device, a government photo ID (Aadhaar, PAN, driving licence or passport), and the purchase bill if the device is under 3 months old. Sign out of iCloud/Find My or the Google account first.
• Data: certified wipe on every device, wipe certificate by email.
• Repair: at the door or in store, most jobs under an hour, 6-month warranty on parts.${REPAIR_PRICES?'':' Never quote or guess repair prices: the technician checks the phone and confirms the price before starting.'}
• Recycling: free through authorised e-waste partners, with a certificate.
• Live cities (pickup and repair): ${CITIES.join(', ')}. Coming soon: ${SOON.join(', ')||'none'}; visitors can leave their number in the city picker. The viewer's city: ${S.city}.
• Support: ${BIZ.supportEmail}, ${BIZ.hours}.

${g?'Devices we buy (prices are shown only after the viewer verifies their mobile number with an OTP on the page; never quote, estimate or hint at any price, range or amount for a device, and tell them to tap "Get my price" instead):':'Price ranges (fair condition to flawless, base storage; higher storage pays a little more):'}
${list}

The viewer's quote on the page right now: ${m.name} ${m.variants[S.vi][0]}, ${!S.vphone&&answersComplete(m)?'their offer is ready but locked until they verify their mobile number with an OTP on the page; never guess or reveal it, tell them to tap Send OTP':S.offer?inr(S.offer):g?'questions not finished yet':'questions not finished yet (up to '+inr(topPrice(m,S.vi))+')'}. Phone test so far: ${done.length?`${passed.length} passed${passed.length?' ('+passed.join(', ')+')':''}${failed.length?', problems with '+failed.join(', '):''}`:'not started'}.

Rules: Never reveal, guess or explain deduction percentages or how an offer is broken down; give only price ranges and the final offer. Only quote prices from these lists, always as a range or "up to", and point to the exact quote on the page for the final number. Never make up an order status: ask for the order ID (format RC-123456) and say the Track section shows it. If a device is not listed, say we can still price it through support. Keep off topics unrelated to devices and Recello beyond one friendly line.`;
}
const Chat={ai:null,aiOn:true,turns:[],busy:false,opened:false};
const chat=$('#chat'),log=$('#chatLog'),chipsEl=$('#chatChips'),chatIn=$('#chatIn');
function chatStatus(){$('#chatStatus').textContent=Chat.ai&&Chat.aiOn?'Recello assistant · AI answers on':'Recello assistant · instant replies'}
function openChat(){
  chat.hidden=false;$('#chatLaunch').hidden=true;$('#fab').setAttribute('aria-expanded','true');
  if(!Chat.opened){Chat.opened=true;store.set('chatSeen',true);botMsg("Hi, I'm Cello from Recello. I can price your device in seconds, help you test your phone, book a free pickup or a repair, or track an order. What can I do for you?");setChips(DEF_CHIPS)}
  setTimeout(()=>chatIn.focus(),40);
}
function closeChat(){chat.hidden=true;$('#chatLaunch').hidden=false;$('#fab').setAttribute('aria-expanded','false');$('#fab').focus()}
$('#fab').addEventListener('click',openChat);$('#chatHint').addEventListener('click',openChat);$('#chatClose').addEventListener('click',closeChat);
if(store.get('chatSeen',false))$('#chatHint').hidden=true;
function addActions(wrap,actions){
  if(!actions||!actions.length)return;const a=document.createElement('div');a.className='msg-actions';
  actions.forEach(x=>{const b=document.createElement('button');b.type='button';b.className='btn btn-ghost btn-sm';b.textContent=x.label;b.addEventListener('click',()=>runAction(x));a.append(b)});
  wrap.append(a);
}
function botMsg(html,actions,pre){
  const wrap=document.createElement('div');wrap.className='msg bot';
  const b=document.createElement('div');b.className='bubble'+(pre?' pre':'');if(pre)b.textContent=html;else b.innerHTML=html;
  wrap.append(b);addActions(wrap,actions);log.append(wrap);log.scrollTop=log.scrollHeight;return b;
}
function userMsg(text){const wrap=document.createElement('div');wrap.className='msg user';const b=document.createElement('div');b.className='bubble';b.textContent=text;wrap.append(b);log.append(wrap);log.scrollTop=log.scrollHeight}
function setChips(list){chipsEl.innerHTML=list.map(t=>`<button type="button" class="chip">${esc(t)}</button>`).join('')}
chipsEl.addEventListener('click',e=>{const b=e.target.closest('.chip');if(b)send(b.textContent)});
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();send(chatIn.value)});
function typing(){
  const wrap=document.createElement('div');wrap.className='msg bot';wrap.innerHTML='<div class="bubble"><span class="typing" aria-label="Cello is typing"><i></i><i></i><i></i></span></div>';
  log.append(wrap);log.scrollTop=log.scrollHeight;
  return new Promise(res=>setTimeout(()=>{wrap.remove();res()},reduceMotion?120:480));
}
async function send(text){
  text=String(text||'').trim().slice(0,500);if(!text||Chat.busy)return;
  userMsg(text);chatIn.value='';Chat.turns.push({role:'user',content:text});Chat.busy=true;
  try{
    const r=(LIVE&&ORDER_RE.test(text))?await liveTrack(text):ruleReply(text);
    if(Chat.ai&&Chat.aiOn)await aiAnswer(r);
    else{await typing();botMsg(r.html,r.actions);Chat.turns.push({role:'assistant',content:r.text});setChips(r.chips)}
  }finally{Chat.busy=false}
}
async function liveTrack(text){
  const id=normId(text.match(ORDER_RE)[1]),k=trackKey(id);
  const mk=(html,actions)=>({html,text:stripHtml(html),chips:DEF_CHIPS,actions:actions||[]});
  try{
    const o=await apiGet('track',k?{id,k}:{id}),f=o.flow;
    return mk(`<b>${esc(o.id)}</b> · ${esc(o.title)}<br>Status: <b>${o.cancelled?'Cancelled':esc(f[o.step-1])}</b> (${o.step} of ${f.length} steps)${!o.cancelled&&o.step<f.length?'<br>Next: '+esc(f[o.step].toLowerCase())+'.':''}`,[{label:'Open tracker',act:'track',arg:o.id}]);
  }catch(e){if(e.need==='phone')return mk(`For your privacy, open the tracker and enter <b>${esc(id)}</b> with the last 4 digits of the mobile number you booked with.`,[{label:'Open tracker',act:'track',arg:id}]);
    return mk(`I couldn't find <b>${esc(id)}</b>. The ID is on your booking confirmation. If it's right, email ${esc(BIZ.supportEmail)} and the team will check it.`)}
}
async function aiAnswer(r){
  const b=botMsg('Thinking…',null,true);b.classList.add('thinking');
  const input=[{role:'user',content:aiRules()},...Chat.turns.slice(-12)];
  try{
    const res=await Chat.ai(input,{cache:false,modelTier:'quick',onText:({text})=>{b.classList.remove('thinking');b.textContent=text;log.scrollTop=log.scrollHeight}});
    b.classList.remove('thinking');b.textContent=res.text;Chat.turns.push({role:'assistant',content:res.text});
    addActions(b.parentElement,r.actions);setChips(r.chips);
  }catch(e){
    const code=e&&e.code;b.classList.remove('thinking');
    if(['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed'].includes(code)){Chat.ai=null;$('#aiWrap').hidden=true;chatStatus()}
    if(code==='rate_limited'){Chat.aiOn=false;$('#aiToggle').checked=false;chatStatus()}
    if(e&&e.text&&code!=='refused'){b.textContent=e.text;Chat.turns.push({role:'assistant',content:e.text});addActions(b.parentElement,r.actions)}
    else{b.parentElement.remove();botMsg(r.html,r.actions);Chat.turns.push({role:'assistant',content:r.text})}
    setChips(r.chips);
  }
}
function runAction(a){
  if(a.act==='quote'){selectModel(a.arg,a.vi||0);goTo('sell')}
  else if(a.act==='go'){if(a.arg==='sell')goStep(1);goTo(a.arg)}
  else if(a.act==='track'){$('#trackIn').value=a.arg;runTrack();goTo('track')}
  else if(a.act==='city'){openCity()}
  else if(a.act==='req'){openReq({model:''})}
  else if(a.act==='repair'){RP.dev=a.arg;if(a.iss)RP.iss=a.iss;renderRepair();goTo('repair')}
  if(window.innerWidth<=560)closeChat();
}
$('#aiToggle').addEventListener('change',e=>{Chat.aiOn=e.target.checked;chatStatus()});
(async()=>{
  try{
    if(!window.claude||typeof window.claude.use!=='function')return;
    const s=await window.claude.use('sample');
    if(s){Chat.ai=s;$('#aiWrap').hidden=false;chatStatus()}
  }catch(_){}
})();

const DOORSTEP_DEF=[{"title": "Free, start to finish", "text": "Pickup, the 5-minute check and the data wipe cost nothing. No fee is taken from your payment."}, {"title": "We check your answers, with you", "text": "The agent checks the same questions you answered here, in front of you. Nothing else."}, {"title": "Any change comes with its reason", "text": "If an answer turns out different, you see which one and the new price from the same price list. Then you decide."}, {"title": "Paid before we leave", "text": "Cash in your hand or money in your UPI app, before the agent leaves with your device."}];

/* ---------- AI helpers (Claude, through our server). Suggestions only: the customer picks the final answers and the agent's check decides.
   Mirror Scan: the front camera sees the screen in a mirror (the screen turns white to show cracks, a countdown beeps and buzzes),
   the back camera sees the back. Also: battery health from a screenshot, the purchase date from a bill, and "find this phone". ---------- */
function aiCta(m){return !AIX.on?'':`<button type="button" class="ai-cta" data-ai="condition"><span class="ai-badge" aria-hidden="true"><svg class="i"><use href="#i-spark"/></svg></span><span><b>${m.cat==='phone'?'AI Mirror Scan':'AI photo check'}</b><small>${m.cat==='phone'?'Not sure what to pick? Show your phone to a mirror and AI suggests the answers.':'Not sure what to pick? Add a photo of the screen and the back, and AI suggests the answers.'}</small></span><svg class="i ai-go"><use href="#i-arrow"/></svg></button>`}
function aiLink(kind,qid,label){return !AIX.on?'':`<button type="button" class="ai-link" data-ai="${kind}" data-aiq="${esc(qid)}"><svg class="i"><use href="#i-spark"/></svg>${esc(label)}</button>`}
const canMirror=()=>!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)&&matchMedia('(pointer:coarse)').matches;
function openAi(kind,qid,opener){
  const m=model();AIX.kind=kind;AIX.q=qid||'';AIX.opener=opener||null;AIX.res=null;AIX.err='';AIX.shot='';
  if(kind==='condition'&&AIX.refModel!==m.id){AIX.front='';AIX.back=''}
  $('#aiTitle').textContent=kind==='condition'?(m.cat==='phone'?'AI Mirror Scan':'AI photo check'):kind==='battery'?'Read battery health':'Read the date from your bill';
  paintAi();$('#aiSheet').hidden=false;setTimeout(()=>{const f=$('#aiSheet [data-aiclose]');if(f)f.focus({preventScroll:true})},40);
}
function closeAi(){const sh=$('#aiSheet');if(sh.hidden)return;mirStop();sh.hidden=true;if(AIX.opener&&AIX.opener.isConnected)AIX.opener.focus({preventScroll:true})}
const aiOptLabel=(qid,id)=>{if(id==='unsure')return 'Not sure from the photos';const q=questionsFor(model()).find(x=>x.id===qid),o=q&&q.options.find(x=>x.id===id);return o?o.label:id};
function aiSlot(k,title,sub,mirror){
  const has=AIX[k];
  return `<div class="ai-slot${has?' has':''}">${has?`<img src="${has}" alt="${esc(title)} photo">`:`<span class="ai-ph" aria-hidden="true">${svgIllus(k==='back'?'body-good':k==='front'?'screen-ok':'bill')}</span>`}
    <span class="ai-st"><b>${esc(title)}</b><small>${esc(sub)}</small></span>
    <span class="ai-acts">${mirror?`<button type="button" class="chip" data-mir="${k}">${has?'Retake':'Use a mirror'}</button>`:''}<label class="chip">${has&&!mirror?'Change':'Choose a photo'}<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" data-aifile="${k}" hidden></label></span></div>`;
}
function paintAi(){
  const m=model(),b=$('#aiBody'),r=AIX.res,phone=m.cat==='phone'||m.cat==='tablet',mir=phone&&canMirror();
  const fine='<p class="ai-fine"><svg class="i"><use href="#i-lock"/></svg>Your photo goes only to Recello and our AI service for this check, without location or camera details. The final amount is confirmed at your door.</p>';
  const err=AIX.err?`<p class="ai-warn" role="alert">${esc(AIX.err)}</p>`:'';
  const go=(label,dis)=>`<button type="button" class="btn btn-primary ai-run" data-aigo${dis||AIX.busy?' disabled':''}>${AIX.busy?'<span class="ai-spin" aria-hidden="true"></span>Looking closely…':label}</button>`;
  if(AIX.kind==='condition'){
    if(r&&r.photo_ok){
      b.innerHTML=`<div class="ai-res"><p class="ai-k">AI suggests</p><ul class="ai-ans"><li><span>Screen</span><b>${esc(aiOptLabel('screen',r.screen))}</b></li><li><span>Body</span><b>${esc(aiOptLabel('body',r.body))}</b></li></ul>
        ${(r.seen||[]).length?`<p class="ai-seen"><b>What it saw:</b> ${r.seen.map(esc).join(' · ')}</p>`:''}${r.note?`<p class="ai-note">${esc(r.note)}</p>`:''}
        <p class="ai-fine">${r.confidence==='high'?'AI is fairly sure.':r.confidence==='medium'?'AI is somewhat sure.':'AI is not very sure, so check these yourself.'} The agent checks the same things at your door, so pick what you really see.</p>
        <div class="row"><button type="button" class="btn btn-primary" data-aiuse>Use these answers</button><button type="button" class="btn btn-ghost" data-aiclose>I'll choose myself</button></div></div>`;
      return;
    }
    b.innerHTML=`${r&&!r.photo_ok?`<p class="ai-warn" role="alert">${esc(r.retake||'The photos aren\'t clear enough. Try again in good light.')}</p>`:''}
      <p class="ai-lead">${m.cat==='phone'?'Stand in front of a mirror in good light. Your phone photographs its own screen and back, and AI suggests your answers.':'Add a photo of the screen and of the back in good light. AI suggests your answers.'} You pick the final answers.</p>
      <div class="ai-slots">${aiSlot('front','Screen',mir?'Screen to the mirror. It turns white and counts down.':'Screen on, facing the camera',mir)}${aiSlot('back','Back',mir?'Back to the mirror, then tap the button.':'The whole back, edges too',mir)}</div>
      ${err}${go('Check my photos',!(AIX.front||AIX.back))}${fine}`;
    return;
  }
  const bat=AIX.kind==='battery';
  if(r){
    const ok=r.found,line=bat?(ok?`Battery health: <b>${r.health}%</b>`:''):(ok?`Bought on <b>${esc(fmtYmd(r.date))}</b>, about ${r.months} month${r.months===1?'':'s'} ago${(()=>{const o=ageOpt(AIX.q,r.months);return o?`: <b>${esc(aiOptLabel(AIX.q,o))}</b>`:''})()}`:'');
    b.innerHTML=ok?`<div class="ai-res"><p class="ai-k">AI read</p><p class="ai-big">${line}</p>${!bat&&r.device_on_bill?`<p class="ai-seen">On the bill: ${esc(r.device_on_bill)}</p>`:''}<div class="row"><button type="button" class="btn btn-primary" data-aiuse>Use this</button><button type="button" class="btn btn-ghost" data-aiclose>I'll choose myself</button></div></div>`
      :`<p class="ai-warn" role="alert">${bat?'We couldn\'t find a battery health number in that picture.':'We couldn\'t read a purchase date from that picture.'}</p>${aiSlot('shot',bat?'Screenshot':'Bill',bat?'The battery health page':'Invoice or online order page',false)}${go('Read it',!AIX.shot)}`;
    return;
  }
  b.innerHTML=`<p class="ai-lead">${bat?(m.brand==='Apple'?'Open Settings → Battery → Battery Health, take a screenshot (side button + volume up), then choose it here.':'Open Settings → Battery (or Device care) and take a screenshot of the battery health page. Not every Android phone shows it; if yours doesn\'t, tap "I\'m not sure".'):'A photo of the shop bill, or a screenshot of the online order page. AI reads the purchase date.'}</p>
    ${aiSlot('shot',bat?'Screenshot':'Bill',bat?'The battery health page':'Invoice or online order page',false)}${err}${go('Read it',!AIX.shot)}${fine}`;
}
const fmtYmd=d=>{const x=new Date(d+'T00:00:00');return isNaN(x)?d:x.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})};
function ageOpt(qid,months){const q=questionsFor(model()).find(x=>x.id===qid);if(!q)return '';let best='';
  for(const o of q.options){const n=(o.label.match(/\d+/g)||[]).map(Number);if(!n.length)continue;const lo=n[0],hi=n.length>1?n[1]:Infinity;
    if(/\+|above|more|over/i.test(o.label)){if(months>=lo)best=o.id}else if(months>=lo&&months<hi){best=o.id;break}}
  return best}
/* shrink in the browser: smaller upload, and re-drawing the picture drops its location and camera details */
async function shrinkImg(file,max,cap){
  let src;try{src=await createImageBitmap(file,{imageOrientation:'from-image'})}catch(_){src=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej({message:'That picture couldn\'t be opened. Try a JPG or PNG, or take a screenshot of it.'});i.src=URL.createObjectURL(file)})}
  const w=src.width||src.naturalWidth,h=src.height||src.naturalHeight;let k=Math.min(1,max/Math.max(w,h)),q=.85,out='';
  for(let i=0;i<5;i++){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w*k));c.height=Math.max(1,Math.round(h*k));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(src,0,0,c.width,c.height);out=c.toDataURL('image/jpeg',q);if(out.length<cap)break;q-=.12;k*=.85}
  return out;
}
async function runAi(){
  if(AIX.busy)return;const m=model();AIX.busy=true;AIX.err='';paintAi();
  try{
    if(!LIVE&&!LX.preview)throw{message:'The AI check works on recello.in. Pick the answers yourself here.'};
    /* the offline preview shows a sample answer (the real check runs on recello.in) */
    const demo=!LIVE&&LX.preview?await new Promise(res=>setTimeout(()=>res(AIX.kind==='condition'?{photo_ok:true,screen:'minor',body:'good',confidence:'medium',seen:['Preview: a sample answer, not your photo'],note:'On recello.in the AI looks at your own photos.',ref:''}:AIX.kind==='battery'?{found:true,health:88}:{found:true,date:'2025-06-10',months:17,device_on_bill:'Preview: a sample bill'}),1600)):null;
    const r=demo||(AIX.kind==='condition'?await apiPost('ai',{kind:'condition',model:m.id,front:AIX.front,back:AIX.back}):await apiPost('ai',{kind:AIX.kind,model:m.id,shot:AIX.shot}));
    AIX.res=r;if(AIX.kind==='condition'&&r.ref){AIX.ref=r.ref;AIX.refModel=m.id}
    px('CustomizeProduct',{content_name:m.name,content_category:'ai_'+AIX.kind});
  }catch(e){AIX.err=e.message||'The AI check didn\'t work. Pick the answers yourself, it only takes a moment.'}
  finally{AIX.busy=false;paintAi();const f=$('#aiBody [data-aiuse]')||$('#aiBody .ai-warn');if(f)f.focus&&f.setAttribute('tabindex','-1');if(f)f.focus({preventScroll:true})}
}
function setAns(qid,ids){const q=questionsFor(model()).find(x=>x.id===qid);if(!q)return false;ids=ids.filter(id=>q.options.some(o=>o.id===id));if(!ids.length)return false;S.ans[qid]=ids;
  $$('#condForm [data-o]').forEach(x=>{if(x.dataset.q===qid)x.setAttribute('aria-pressed',String(ids.includes(x.dataset.o)))});const em=[...$$('#condForm [data-qerr]')].find(x=>x.dataset.qerr===qid);if(em)em.textContent='';return true}
function useAi(){
  const r=AIX.res;if(!r)return;let n=0;
  if(AIX.kind==='condition')['screen','body'].forEach(k=>{if(r[k]&&r[k]!=='unsure'&&setAns(k,[r[k]]))n++});
  else if(AIX.kind==='battery'&&r.found){setBatt(AIX.q,r.health);n=1}
  else if(AIX.kind==='bill'&&r.found){const o=ageOpt(AIX.q,r.months);if(o&&setAns(AIX.q,[o]))n=1}
  closeAi();renderCond();renderQuote();try{saveDraft()}catch(_){}
  if(typeof BS!=='undefined'&&BS.quiz&&!$('#brandSheet').hidden){if(n&&AIX.kind!=='battery')bsNext();else renderBSQ()}
  toast(n?'Filled in. Change anything that looks wrong.':'Nothing to fill in. Pick the answers yourself.');
}
/* Mirror Scan */
let actx=null;
function beep(f,d){try{actx=actx||new (window.AudioContext||window.webkitAudioContext)();const o=actx.createOscillator(),g=actx.createGain();o.frequency.value=f;g.gain.value=.14;o.connect(g);g.connect(actx.destination);o.start();o.stop(actx.currentTime+d)}catch(_){}}
async function startMirror(k){
  const front=k==='front';AIX.err='';
  try{beep(1,.01)}catch(_){}   // unlocks sound on iPhone (needs a tap)
  let st;
  try{st=await navigator.mediaDevices.getUserMedia({video:{facingMode:front?'user':{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}},audio:false})}
  catch(e){AIX.err='We couldn\'t open the camera. Allow camera access for this site, or tap "Choose a photo".';paintAi();return}
  AIX.stream=st;const v=$('#mirVid');v.srcObject=st;try{await v.play()}catch(_){}
  const mir=$('#mirror');mir.classList.toggle('blind',front);mir.hidden=false;
  if(front){
    let n=6;$('#mirCount').textContent='';$('#mirSay').textContent='Turn the screen to face the mirror and hold still';
    const tick=()=>{if(mir.hidden)return;n--;$('#mirCount').textContent=n>0?n:'';beep(n>0?660:990,n>0?.09:.3);try{navigator.vibrate&&navigator.vibrate(n>0?40:[120,60,120])}catch(_){}
      if(n>0)AIX.timer=setTimeout(tick,1000);else setTimeout(()=>mirSnap('front'),150)};
    AIX.timer=setTimeout(tick,1800);
  }else{$('#mirTip').textContent='Hold the back of your phone up to the mirror and fill the frame. Then tap the button.';$('#mirShoot').focus({preventScroll:true})}
}
function mirSnap(k){
  const v=$('#mirVid');if(!v.videoWidth){mirStop();AIX.err='The camera didn\'t start. Tap "Choose a photo" instead.';paintAi();return}
  const kk=Math.min(1,1280/Math.max(v.videoWidth,v.videoHeight)),c=document.createElement('canvas');c.width=Math.round(v.videoWidth*kk);c.height=Math.round(v.videoHeight*kk);
  c.getContext('2d').drawImage(v,0,0,c.width,c.height);AIX[k]=c.toDataURL('image/jpeg',.82);AIX.res=null;mirStop();paintAi();toast(k==='front'?'Screen photo taken':'Back photo taken');
}
function mirStop(){clearTimeout(AIX.timer);const mir=$('#mirror');if(mir&&!mir.hidden)mir.hidden=true;if(AIX.stream){AIX.stream.getTracks().forEach(t=>t.stop());AIX.stream=null}const v=$('#mirVid');if(v)v.srcObject=null}
$('#mirShoot').addEventListener('click',()=>mirSnap('back'));
$('#mirror').addEventListener('click',e=>{if(e.target.closest('[data-mirclose]'))mirStop()});
$('#aiSheet').addEventListener('click',e=>{
  if(e.target.id==='aiSheet'||e.target.closest('[data-aiclose]')){closeAi();return}
  const mb=e.target.closest('[data-mir]');if(mb){startMirror(mb.dataset.mir);return}
  if(e.target.closest('[data-aigo]')){runAi();return}
  if(e.target.closest('[data-aiuse]'))useAi();
});
$('#aiSheet').addEventListener('change',async e=>{const f=e.target.closest('[data-aifile]');if(!f||!f.files[0])return;const k=f.dataset.aifile;
  try{AIX[k]=await shrinkImg(f.files[0],k==='shot'?1600:1280,k==='shot'?1300000:650000);AIX.res=null;AIX.err=''}catch(x){AIX.err=x.message||'That picture couldn\'t be opened.'}paintAi()});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#mirror').hidden){mirStop();e.stopImmediatePropagation();return}if(!$('#aiSheet').hidden){closeAi();e.stopImmediatePropagation()}},true);
/* "Find this phone for me": Android's Chrome tells the site its model code (e.g. SM-S918B); AI turns it into the model */
const detectable=()=>!!(navigator.userAgentData&&navigator.userAgentData.mobile&&navigator.userAgentData.getHighEntropyValues)&&/android/i.test(navigator.userAgentData.platform||navigator.userAgent);
function paintDetect(){const b=$('#heroDetect');if(b)b.hidden=!(AIX.on&&detectable())}
$('#heroDetect').addEventListener('click',async()=>{
  const b=$('#heroDetect');if(b.disabled)return;b.disabled=true;const was=b.innerHTML;b.innerHTML='<span class="ai-spin" aria-hidden="true"></span>Finding your phone…';
  try{
    const h=await navigator.userAgentData.getHighEntropyValues(['model']);const code=String(h.model||'').trim();
    if(!code)throw{message:'Your browser didn\'t share the model. Search for it instead.'};
    const r=await apiPost('ai',{kind:'detect',code});
    if(r.id&&byId[r.id]){selectModel(r.id,0);goTo('sell');toast(`Found it: ${byId[r.id].name}. Pick the storage.`)}
    else throw{message:r.name?`It looks like a ${r.name}, which isn't in our list. Search or ask for a price.`:'We couldn\'t tell which phone this is. Search for it instead.'};
  }catch(e){toast(e.message||'We couldn\'t tell which phone this is. Search for it instead.',true)}
  finally{b.disabled=false;b.innerHTML=was}
});
/* ---------- trust: doorstep promise, beat a quote, any-model requests, receipts, reviews ---------- */
let DOORSTEP=DOORSTEP_DEF.map(x=>({...x})),REVIEW_URL='';
let DOOR_ON=true,DOOR_NOTE="Your offer comes from your answers, so the final amount is confirmed at the check. Accurate answers keep your pickup quick, and saying no at the door costs nothing.";
function renderPromise(){const box=$('#doorPromise');if(!box)return;box.hidden=!DOOR_ON;$('#doorList').innerHTML=DOORSTEP.map(p=>`<li><span><b>${esc(p.title)}</b>${esc(p.text)}</span></li>`).join('');const n=$('#doorNote');n.textContent=DOOR_NOTE;n.hidden=!DOOR_NOTE}
/* real bookings only (the same feed as the hero ticker): "12 pickups booked in Pune this week", shown from 3 up */
function paintProof(){const el=$('#vaultProof');if(!el)return;const wk=Date.now()/1000-7*86400,it=typeof LX!=='undefined'&&LX.feed&&(LIVE||LX.preview)?LX.items:[],n=it.filter(x=>x&&x.at>=wk).length;el.hidden=n<3;if(n>=3)$('#vaultProofT').textContent=`${n} pickups booked in ${S.city} this week`}
renderPromise();
/* "Got a higher quote somewhere else?" */
/* the screenshot is shrunk in the browser (longest side 1,800 px, JPEG) so it uploads quickly on mobile data */
const BEAT={shot:'',busy:false};
function shrinkShot(file){return new Promise((res,rej)=>{
  if(!file||!/^image\//.test(file.type)){rej({message:'Choose a picture (a screenshot) of their quote.'});return}
  if(file.size>25*1024*1024){rej({message:'That picture is too large. Take a screenshot instead.'});return}
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{try{const k=Math.min(1,1800/Math.max(img.naturalWidth,img.naturalHeight)),c=document.createElement('canvas');
    c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
    let d=c.toDataURL('image/jpeg',.82);if(d.length>1.9e6)d=c.toDataURL('image/jpeg',.6);URL.revokeObjectURL(url);
    if(c.width<120||c.height<120)rej({message:'That picture is too small to read. Add a full screenshot.'});else res(d)}catch(e){URL.revokeObjectURL(url);rej({message:'That picture could not be read. Try another one.'})}};
  img.onerror=()=>{URL.revokeObjectURL(url);rej({message:'That picture could not be read. Try a JPG or PNG screenshot.'})};
  img.src=url})}
function paintShot(){const on=!!BEAT.shot;$('#beatShotBox .shot-empty').hidden=on;$('#beatShotBox .shot-has').hidden=!on;if(on)$('#beatShotImg').src=BEAT.shot;else $('#beatShotImg').removeAttribute('src')}
$('#beatShot').addEventListener('change',async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
  const er=$('#beatErr');er.textContent='';BEAT.busy=true;$('#beatSend').disabled=true;
  try{BEAT.shot=await shrinkShot(f);paintShot();if(!$('#beatPrice').value)$('#beatPrice').focus()}catch(x){er.textContent=x.message}
  finally{BEAT.busy=false;$('#beatSend').disabled=false}});
let beatKey='';
const offerKey=()=>S.modelId+'|'+S.vi+'|'+JSON.stringify(Object.keys(S.ans).sort().map(k=>[k,S.ans[k]]));
function syncBeat(){
  const k=offerKey();if(k===beatKey)return;beatKey=k;
  const sent=(store.get('beatSent',{})||{})[k];
  $('#beatForm').hidden=true;$('#beatOpen').setAttribute('aria-expanded','false');$('#beatErr').textContent='';$('#beatPrice').value='';BEAT.shot='';paintShot();
  $('#beatOpen').hidden=!!sent;$('#beatOk').hidden=!sent;$('#beatOk').textContent=sent||'';
}
function paintMore(on){const b=$('#vaultMore');b.hidden=!on;if(on){syncBeat();syncNotNow();paintProof()}}
/* growth tools: refer a friend, video check, upgrade day (switched on and off in Admin > Settings > Growth tools) */
const GROWTH={ref_on:true,ref_friend:200,ref_referrer:200,video_on:true,video_min:25000,upgrade_on:true};
S.ref=null;
(()=>{try{const u=new URLSearchParams(location.search),c=(u.get('ref')||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  if(c.length===6){store.set('ref',{code:c,t:Date.now()});store.set('refHide',false);u.delete('ref');const q=u.toString();history.replaceState(null,'',location.pathname+(q?'?'+q:'')+location.hash)}}catch(_){}})();
function paintGrowth(){const u=$('[data-nn="upgrade"]');if(u)u.hidden=!GROWTH.upgrade_on}
function loadRef(){
  const r=store.get('ref',null);
  if(!r||!r.code||Date.now()-r.t>30*864e5||!GROWTH.ref_on){S.ref=null;paintRef();return}
  if(LIVE)apiGet('ref_check',{code:r.code}).then(j=>{S.ref=j.ok?{code:r.code,bonus:j.friend}:null;if(!j.ok)store.set('ref',null);paintRef()}).catch(()=>{});
  else{S.ref={code:r.code,bonus:GROWTH.ref_friend};paintRef()}
}
function paintRef(){
  const on=!!S.ref&&!store.get('refHide',false);$('#refBar').hidden=!on;
  if(S.ref)$('#refText').textContent=`🎁 Your friend's code ${S.ref.code} is applied: ${inr(S.ref.bonus)} extra when you sell your first device to Recello.`;
  const v=$('#vaultRef');v.hidden=!S.ref;if(S.ref)v.textContent=`+ ${inr(S.ref.bonus)} friend's bonus, paid with your money`;
}
$('#refX').addEventListener('click',()=>{store.set('refHide',true);paintRef()});
const shareLink=code=>location.origin+location.pathname+'?ref='+code;
const shareText=(code,friend)=>`I sold my phone to Recello: free pickup at home, paid on the spot. Use my code ${code} and get ${inr(friend)} extra: ${shareLink(code)}`;
function shareHtml(code,friend,ref){if(!GROWTH.ref_on)return '';return `<div class="share"><b>Know someone selling a phone?</b><p>Share your code <span class="mono">${esc(code)}</span>. They get ${inr(friend)} extra on their first sale, and you get ${inr(ref)} once they're paid.</p>
  <div class="row"><a class="btn btn-primary btn-sm" href="https://wa.me/?text=${encodeURIComponent(shareText(code,friend))}" target="_blank" rel="noopener">Share on WhatsApp</a><button type="button" class="btn btn-ghost btn-sm" data-share-copy="${esc(code)}">Copy my link</button></div></div>`}
async function myShareCode(){
  if(!GROWTH.ref_on||!S.vphone)return null;
  const c=store.get('myCode',null);if(c&&c.phone===S.vphone)return c.code;
  let code;if(LIVE)code=(await apiPost('ref_code',{token:S.vtoken})).code;
  else{const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let h=7;for(const ch of S.vphone)h=(h*31+ch.charCodeAt(0))>>>0;code='';for(let i=0;i<6;i++){code+=A[h%32];h=Math.floor(h/32)+(i+1)*977}}
  store.set('myCode',{phone:S.vphone,code});return code}
document.addEventListener('click',e=>{const b=e.target.closest('[data-share-copy]');if(!b)return;const l=shareLink(b.dataset.shareCopy);
  try{navigator.clipboard.writeText(l).then(()=>toast('Link copied. Paste it to a friend.'),()=>toast(l))}catch(_){toast(l)}});
paintGrowth();loadRef();
/* "Not booking today?": the customer tells us why in one tap; we call them with the right answer */
let nnKey='',nnWhen='asap';
function syncNotNow(){
  const k=offerKey();if(k===nnKey)return;nnKey=k;
  const sent=(store.get('nnSent',{})||{})[k];
  $$('#nnChips [data-nn]').forEach(b=>b.setAttribute('aria-pressed',String(!!sent&&b.dataset.nn===sent.why)));
  $$('#notNow [data-nnp]').forEach(p=>p.hidden=true);
  $('#nnOk').hidden=!(sent&&sent.msg);$('#nnOk').textContent=(sent&&sent.msg)||'';
}
function nnSave(patch){const all=store.get('nnSent',{})||{},k=offerKey();all[k]={...(all[k]||{}),...patch};const ks=Object.keys(all);if(ks.length>12)delete all[ks[0]];store.set('nnSent',all)}
$('#nnChips').addEventListener('click',async e=>{const b=e.target.closest('[data-nn]');if(!b)return;const why=b.dataset.nn;
  $$('#nnChips [data-nn]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
  $$('#notNow [data-nnp]').forEach(p=>p.hidden=p.dataset.nnp!==why);$('#nnOk').hidden=true;
  if(why==='upgrade'){const z=n=>String(n).padStart(2,'0'),k=d=>d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()),a=new Date(),b=new Date();a.setDate(a.getDate()+1);b.setDate(b.getDate()+90);const di=$('#nnDate');di.min=k(a);di.max=k(b);if(!di.value)di.value=k(a)}
  if(why==='later'){$('#nnPrice').textContent=S.offer!=null?inr(S.offer):'your price';$('#nnUntil').textContent=S.held&&S.held.until?fmtHeld(S.held.until):'7 days'}
  if(why==='just_checking'){$('#nnOk').textContent=`No problem. Your ${S.offer!=null?inr(S.offer):'price'} is held${S.held&&S.held.until?' until '+fmtHeld(S.held.until):''}, and it's the same price at your door. Come back any time.`;$('#nnOk').hidden=false}
  nnSave({why,msg:why==='just_checking'?$('#nnOk').textContent:''});
  try{if(LIVE)await apiPost('lead_reason',{token:S.vtoken,model:S.modelId,vi:S.vi,reason:why})}catch(err){if(err.status===401){forgetPhone();renderQuote();renderOffer()}}
});
$('#nnWhen').addEventListener('click',e=>{const b=e.target.closest('[data-when]');if(!b)return;nnWhen=b.dataset.when;$$('#nnWhen [data-when]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
$('#nnBeat')&&$('#nnBeat').addEventListener('click',()=>{const f=$('#beatForm');if(f.hidden)$('#beatOpen').click();pageScroll($('#beatBox'),'center',true);setTimeout(()=>$('#beatShot').focus({preventScroll:true}),300)});
$('#notNow').addEventListener('click',async e=>{const b=e.target.closest('[data-nnsend]');if(!b)return;const kind=b.dataset.nnsend,when=b.dataset.when||nnWhen;
  const WL={asap:'as soon as we can',evening:'this evening',tomorrow:'tomorrow morning',weekend:'at the weekend'};
  const body={kind,token:S.vtoken,model:S.modelId,vi:S.vi,city:S.city};
  if(kind==='callback')body.when=when;
  if(kind==='bulk'){body.count=+$('#nnCount').value;body.what=$('#nnWhat').value.trim()}
  if(kind==='upgrade'){body.date=$('#nnDate').value;if(!body.date||body.date<$('#nnDate').min||body.date>$('#nnDate').max){toast('Pick the day your new phone arrives, in the next 3 months.');$('#nnDate').focus();return}}
  b.disabled=true;
  try{
    if(LIVE)await apiPost('request',body);
    else{const all=store.get('requests',[])||[];all.unshift({...body,token:undefined,at:Date.now()});store.set('requests',all.slice(0,20))}
    const ph=S.vphone?'+91 '+S.vphone.replace(/(\d{5})(\d{5})/,'$1 $2'):'your number';
    const dTxt=d=>new Date(d+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});
    const msg=kind==='upgrade'?`Done. We'll call ${ph} the day before ${dTxt(body.date)} to fix a pickup time.`:kind==='callback'?`Done. We'll call ${ph} ${WL[when]}${when==='asap'&&BIZ.hours?' ('+BIZ.hours+')':''}.`:kind==='watch'?`Done. We'll WhatsApp ${ph} before your price ends${S.held&&S.held.until?' on '+fmtHeld(S.held.until):''}.`:`Done. We'll call ${ph} with one offer for all your devices.`;
    $$('#notNow [data-nnp]').forEach(p=>p.hidden=true);$('#nnOk').textContent=msg;$('#nnOk').hidden=false;nnSave({msg});
  }catch(err){if(err.status===401){forgetPhone();renderQuote();renderOffer();toast('Please verify your mobile number again.')}else toast(err.message||'Could not send it. Please try again.')}
  finally{b.disabled=false}
});
$('#beatOpen').addEventListener('click',()=>{const f=$('#beatForm'),open=f.hidden;f.hidden=!open;$('#beatOpen').setAttribute('aria-expanded',String(open));if(open)setTimeout(()=>$('#beatShot').focus({preventScroll:true}),30)});
$('#beatPrice').addEventListener('input',e=>{e.target.value=e.target.value.replace(/\D/g,'').slice(0,7)});
$('#beatForm').addEventListener('submit',async e=>{
  e.preventDefault();if(BEAT.busy)return;const their=+$('#beatPrice').value,er=$('#beatErr');
  if(!BEAT.shot){er.textContent='Add a screenshot of their quote.';$('#beatShot').focus();return}
  if(!(their>=100)){er.textContent='Enter the price they offered, in rupees.';$('#beatPrice').focus();return}
  if(S.offer!=null&&their<=S.offer){er.textContent=`That's less than our ${inr(S.offer)}, so ours is already the better price.`;return}
  er.textContent='';const btn=$('#beatSend');btn.disabled=true;
  try{
    if(LIVE)await apiPost('request',{kind:'beat',token:S.vtoken,model:S.modelId,vi:S.vi,their,shot:BEAT.shot,city:S.city});
    else{const all=store.get('requests',[])||[];all.unshift({kind:'beat',model:S.modelId,their,shot:true,at:Date.now()});store.set('requests',all.slice(0,20))}
    const msg=`Sent. We'll check the ${inr(their)} quote and call you${BIZ.hours?' ('+BIZ.hours+')':''}. Your offer stays held meanwhile.`;
    const all=store.get('beatSent',{})||{};all[offerKey()]=msg;const keys=Object.keys(all);if(keys.length>12)delete all[keys[0]];store.set('beatSent',all);beatKey='';syncBeat();
  }catch(err){if(err.status===401){forgetPhone();renderQuote();renderOffer();toast('Please verify your mobile number again.')}else er.textContent=err.message||'Could not send it. Please try again.'}
  finally{btn.disabled=false}
});
/* "Don't see your device?" */
const RQ={cond:'good',last:null};
function openReq(pre){
  RQ.last=document.activeElement;$('#rqBody').hidden=false;$('#rqDone').hidden=true;$('#rqErr').textContent='';
  if(pre&&pre.model)$('#rqModel').value=pre.model;
  if(!$('#rqBrand').value&&S.brand&&S.brand!=='All')$('#rqBrand').value=S.brand;
  const c=store.get('contact',null);if(!$('#rqPhone').value)$('#rqPhone').value=S.vphone||(c&&c.phone)||'';
  $('#reqSheet').hidden=false;
  setTimeout(()=>{(!$('#rqBrand').value?$('#rqBrand'):!$('#rqModel').value?$('#rqModel'):$('#rqSend')).focus({preventScroll:true})},40);
}
function closeReq(){const sh=$('#reqSheet');if(sh.hidden)return;sh.hidden=true;if(RQ.last&&RQ.last.isConnected)RQ.last.focus({preventScroll:true})}
document.addEventListener('click',e=>{const o=e.target.closest('[data-req-open]');if(!o)return;e.preventDefault();$('#heroSuggest').hidden=true;const md=o.dataset.reqModel!=null?o.dataset.reqModel:(S.q||'');hsClose(()=>openReq({model:md}))});
$('#reqSheet').addEventListener('click',e=>{if(e.target.id==='reqSheet'||e.target.closest('[data-rclose]'))closeReq()});
$('#rqCond').addEventListener('click',e=>{const b=e.target.closest('[data-c]');if(!b)return;RQ.cond=b.dataset.c;$$('#rqCond [data-c]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)))});
$('#reqForm').addEventListener('submit',async e=>{
  e.preventDefault();const er=$('#rqErr');
  const brand=$('#rqBrand').value.trim(),mdl=$('#rqModel').value.trim(),storage=$('#rqStorage').value.trim(),ph=$('#rqPhone').value.replace(/\D/g,'').replace(/^(91|0)(?=\d{10}$)/,'');
  if(mdl.length<2){er.textContent='Type the model name, like "Redmi Note 13 Pro".';$('#rqModel').focus();return}
  if(!/^[6-9]\d{9}$/.test(ph)){er.textContent='Enter a 10-digit Indian mobile number.';$('#rqPhone').focus();return}
  er.textContent='';const btn=$('#rqSend');btn.disabled=true;
  try{
    if(LIVE)await apiPost('request',{kind:'model',brand,model:mdl,storage,cond:RQ.cond,cat:S.cat,phone:ph,city:S.city});
    else{const all=store.get('requests',[])||[];all.unshift({kind:'model',brand,model:mdl,storage,cond:RQ.cond,phone:ph,at:Date.now()});store.set('requests',all.slice(0,20))}
    $('#rqBody').hidden=true;$('#rqDone').hidden=false;
    $('#rqDoneText').textContent=`We'll call or WhatsApp +91 ${ph.replace(/(\d{5})(\d{5})/,'$1 $2')} with a price for your ${(brand+' '+mdl).trim()}, usually the same day.`;
    $('#rqModel').value='';$('#rqStorage').value='';$('#rqDoneClose').focus({preventScroll:true});
  }catch(err){er.textContent=err.message||'Could not send it. Please try again.'}
  finally{btn.disabled=false}
});
/* done screen: get-ready checklist */
const READY=['Back up your photos and chats','Sign out of iCloud (Find My) or your Google account','Take out your SIM and memory card','Keep a photo ID ready: Aadhaar, PAN, licence or passport'];
const checksHtml=list=>`<details class="chk"><summary>What the agent will check</summary><ul>${list.map(c=>`<li><span>${esc(c.q)}</span><b>${(c.a||[]).map(esc).join(', ')}</b></li>`).join('')}</ul></details>`;
function readyHtml(id){const st=store.get('ready:'+id,[])||[];return `<h4 class="done-h4">Get your phone ready</h4><ul class="ready">${READY.map((t,i)=>`<li><label><input type="checkbox" data-ready="${i}" data-oid="${esc(id)}"${st.includes(i)?' checked':''}><span>${esc(t)}</span></label></li>`).join('')}</ul>`}
document.addEventListener('change',e=>{const c=e.target.closest('[data-ready]');if(!c)return;const k='ready:'+c.dataset.oid;let st=store.get(k,[])||[];const i=+c.dataset.ready;st=c.checked?[...new Set([...st,i])]:st.filter(x=>x!==i);store.set(k,st)});
/* tracker: agent, doorstep check, receipt */
const TR={last:null};
function trBlocks(o){
  if(o.cancelled)return '';
  if(o.type==='repair')return o.agent_card&&o.step>=2?agentCardHtml(o.agent_card,{tech:true}):'';
  if(o.type!=='sell')return '';
  const out=[];
  if(o.agent_card&&o.step>=2)out.push(agentCardHtml(o.agent_card,{}));
  else if(o.agent&&o.step>=2&&o.step<4)out.push(`<p class="tr-agent"><svg class="i"><use href="#i-shield"/></svg><span>Your agent is <b>${esc(o.agent)}</b>. Ask to see their Recello ID card before you hand over your phone. The name must match.</span></p>`);
  const rc=o.recheck;
  if(rc){
    out.push(rc.changes&&rc.changes.length?`<div class="tr-check"><h4>Checked at your door</h4><ul>${rc.changes.map(c=>`<li><span><b>${esc(c.q)}</b><br>You said ${esc((c.from||[]).join(', ')||'nothing')}. The agent found ${esc((c.to||[]).join(', '))}.</span></li>`).join('')}</ul><p>Offer changed from <b>${inr(rc.was)}</b> to <b>${inr(rc.price)}</b>.${o.step<4?' You can say no and keep your phone. There\'s no fee.':''}</p></div>`
      :`<div class="tr-check"><h4>Checked at your door</h4><p>Everything matched your answers. Your price stayed <b>${inr(rc.price)}</b>.</p></div>`);
  }else if(o.checks&&o.checks.length&&o.step<3)out.push(checksHtml(o.checks));
  if(o.video&&!o.video.done&&o.step<3)out.push('<p class="tr-video">📹 We\'ll WhatsApp you for a 2-minute video check before the pickup.</p>');
  if(o.receipt)out.push(`<div class="tr-acts">${o.bill?`<a class="btn btn-primary btn-sm" href="${esc(o.bill.url)}" target="_blank" rel="noopener">Your bill · ${esc(o.bill.no)}</a>`:''}<button type="button" class="btn ${o.bill?'btn-ghost':'btn-primary'} btn-sm" data-receipt>Sale receipt</button>${REVIEW_URL?`<a class="btn btn-ghost btn-sm" href="${esc(REVIEW_URL)}" target="_blank" rel="noopener">Rate us on Google</a>`:''}</div>`);
  if(o.share&&o.share.code)out.push(shareHtml(o.share.code,o.share.friend,o.share.referrer));
  return out.length?`<div class="tr-blocks">${out.join('')}</div>`:'';
}
$('#trackOut').addEventListener('click',e=>{if(e.target.closest('[data-receipt]')&&TR.last)showReceipt(TR.last)});
function closeReceipt(){const r=$('#rcpt');if(!r)return;r.remove();document.body.classList.remove('printing');const b=$('#trackOut [data-receipt]');if(b)b.focus({preventScroll:true})}
function showReceipt(o){
  closeReceipt();
  const r=o.receipt||{},paid=new Date((r.paid_at||Date.now()/1000)*1000);
  const fmt=d=>d.toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit'});
  const el=document.createElement('div');el.className='rcpt';el.id='rcpt';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label','Sale receipt');
  el.innerHTML=`<div class="rcpt-doc"><div class="rcpt-top"><b>Recello</b><span>Sale receipt</span></div>
    <div><small class="muted">Paid to you</small><div class="rcpt-amt">${inr(Math.abs(o.amount)+(o.ref_bonus||0)+(o.today_bonus||0))}</div>${o.ref_bonus?`<small class="muted">Includes ${inr(o.ref_bonus)} friend's bonus</small>`:''}${o.today_bonus?`<small class="muted">Includes ${inr(o.today_bonus)} book-today bonus</small>`:''}</div>
    <dl><dt>Order</dt><dd class="mono">${esc(o.id)}</dd><dt>Device</dt><dd>${esc(o.title)}</dd>${r.imei4?`<dt>IMEI</dt><dd class="mono">ending ${esc(r.imei4)}</dd>`:''}<dt>Paid by</dt><dd>${esc(r.payout||'UPI')}</dd><dt>Date of sale</dt><dd>${fmt(paid)}</dd>${r.city?`<dt>City</dt><dd>${esc(r.city)}</dd>`:''}<dt>Data erased</dt><dd>${r.wiped?fmt(new Date(r.wiped*1000)):'In progress'}</dd></dl>
    ${r.wiped?'<span class="rcpt-stamp"><svg class="i"><use href="#i-check"/></svg>Certified data wipe done</span>':''}
    <p class="rcpt-note">You handed this device to Recello on the date above. Keep this receipt for your records. Questions? ${esc(BIZ.supportEmail)}</p>
    <div class="rcpt-acts"><button type="button" class="btn btn-primary" data-rc="print">Save as PDF or print</button><button type="button" class="btn btn-ghost" data-rc="close">Close</button></div></div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{const b=e.target.closest('[data-rc]');if(e.target===el||(b&&b.dataset.rc==='close')){closeReceipt();return}
    if(b&&b.dataset.rc==='print'){document.body.classList.add('printing');try{window.print()}catch(_){toast('Printing isn\'t available here. Take a screenshot instead.')}setTimeout(()=>document.body.classList.remove('printing'),800)}});
  setTimeout(()=>{const c=el.querySelector('[data-rc="print"]');if(c)c.focus({preventScroll:true})},30);
}
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('#rcpt')){closeReceipt();return}if(!$('#reqSheet').hidden)closeReq()});
/* real reviews, added in Admin > Website > Reviews */
function renderReviews(list){
  const box=$('#reviews');if(!Array.isArray(list)||!list.length){box.hidden=true;return}
  $('#rvList').innerHTML=list.map(r=>`<figure class="rv"><div class="rv-stars" role="img" aria-label="${r.stars} out of 5 stars">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div><blockquote><p>${esc(r.text)}</p></blockquote><figcaption><small><b>${esc(r.name)}</b>${r.area?' · '+esc(r.area):''}${r.date?' · '+esc(r.date):''}${r.link?` · <a href="${esc(r.link)}" target="_blank" rel="noopener">source</a>`:''}</small></figcaption></figure>`).join('');
  const a=$('#rvAll');a.hidden=!REVIEW_URL;if(REVIEW_URL)a.href=REVIEW_URL;box.hidden=false;
}

$('#pfPin').addEventListener('input',e=>{const v=e.target.value.replace(/\D/g,'').slice(0,6);if(v!==e.target.value)e.target.value=v;const er=$('[data-err="pfPin"]');
  if(v.length<6){if(er.dataset.pin){er.textContent='';er.classList.remove('ok');delete er.dataset.pin;e.target.removeAttribute('aria-invalid')}return}
  er.dataset.pin=v;const ok=pinOk(v);er.textContent=ok?'✓ We pick up here':pinMsg(v);er.classList.toggle('ok',ok);e.target.setAttribute('aria-invalid',String(!ok))});
/* ---------- boot ---------- */
const DR=loadDraft();if(DR){const dm=byId[DR.modelId];S.cat=dm.cat;S.modelId=dm.id;S.vi=Math.min(DR.vi||0,dm.variants.length-1);S.ans=DR.ans||{};S.qi=DR.qi||0}
paintCity();paintRapidBadge();renderCatTabs();renderBrands();renderModels();renderVariants();renderCond();renderQuote();
renderResume();if(DR&&DR.step>1){stepQuiet=true;popping=true;goStep(DR.step);popping=false;stepQuiet=false;document.body.classList.remove('funnel')}updBar();
renderPulse();renderRepair();renderDrawer();
renderRecent();$('#trackIn').value=SAMPLE.id;runTrack();

/* ---------- live data from the admin panel ---------- */
function paintBiz(){
  $$('[data-biz="email"]').forEach(el=>{el.textContent=BIZ.supportEmail});
  $$('[data-biz="hours"]').forEach(el=>{el.textContent=BIZ.hours});
  $$('[data-verified]').forEach(el=>{el.textContent=pctTxt(RULES.verified-1)});
}
/* ---------- website content from Admin > Website ---------- */
function applySite(s){
  if(!s||typeof s!=='object')return;
  if(s.cats&&typeof s.cats==='object'){CAT_ST={...CAT_DEF};['tablet','laptop','watch'].forEach(k=>{if(['on','soon','off'].includes(s.cats[k]))CAT_ST[k]=s.cats[k]});
    renderCatQuick();renderCatTabs();renderPulseSelect();if(!catOn(S.cat))setCat('phone');paintSuggest&&heroQ.value&&paintSuggest()}
  const setT=(sel,v)=>{if(v==null||v==='')return;$$(sel).forEach(el=>{el.textContent=v})};
  const h=s.hero||{};
  ['live','title1','title2','lede','button'].forEach(k=>setT(`[data-site="hero.${k}"]`,h[k]));
  if(h.search)heroPh(h.search);
  (s.promises||[]).forEach((p,i)=>{setT(`[data-site="p${i}.title"]`,p.title);const t=$(`[data-site="p${i}.text"]`);if(t)t.textContent=p.text||''});
  const f=s.footer||{};setT('[data-site="foot.about"]',f.about);setT('[data-site="foot.note"]',f.note);
  const main=$('main');
  (s.sections||[]).forEach(sec=>{
    const el=document.getElementById(sec.id);if(!el)return;
    main.appendChild(el);
    const on=sec.id==='sell'||sec.on!==false;el.hidden=!on;
    const ids=sec.id==='track'?['track','faq']:[sec.id];
    ids.forEach(id=>$$(`a[href="#${id}"]`).forEach(a=>{a.hidden=!on;const li=a.closest('li');if(li&&li.closest('.foot'))li.hidden=!on}));
    if(sec.title){const t=el.querySelector('.sec-head h2');if(t)t.textContent=sec.title}
    if(sec.intro){const p=el.querySelector('.sec-head>p:not(.eyebrow)');if(p)p.textContent=sec.intro}
  });
  renderCatQuick();   // after the section switches above, so footer links of devices we don't buy stay hidden
  if(Array.isArray(s.doorstep)&&s.doorstep.length===4)DOORSTEP=s.doorstep.map(x=>({title:String(x.title||''),text:String(x.text||'')}));
  if('doorstepOn' in s)DOOR_ON=!!s.doorstepOn;if(typeof s.doorstepNote==='string')DOOR_NOTE=s.doorstepNote;renderPromise();
  REVIEW_URL=/^https:\/\//.test(s.reviewUrl||'')?s.reviewUrl:'';renderReviews(s.reviews);
  if(Array.isArray(s.faq)&&s.faq.length){
    const box=$('#faq');$$('details',box).forEach(d=>d.remove());
    box.insertAdjacentHTML('beforeend',s.faq.map((x,i)=>`<details${i?'':' open'}><summary>${esc(x.q)}</summary><p>${esc(x.a)}</p></details>`).join(''));
  }
  const b=s.banner||{},pr=$('#promo');
  if(pr&&b.on&&b.text){
    $('[data-promo-text]',pr).textContent=b.text;
    const a=$('.promo-a',pr),ok=b.link&&b.linkLabel&&(/^#[a-z]+$/.test(b.link)||/^https:\/\//.test(b.link));
    a.hidden=!ok;if(ok){a.href=b.link;a.textContent=b.linkLabel;if(/^https:/.test(b.link)){a.target='_blank';a.rel='noopener'}}
    const key='promo-off:'+b.text;pr.hidden=!!store.get(key,false);
    $('.promo-x',pr).onclick=()=>{pr.hidden=true;store.set(key,true)};
  }
  REPAIR_PRICES=!!s.repairPrices;renderEst();
  if(s.mapsKey)loadMaps(s.mapsKey);
  const c=s.contact||{},links=[];
  if(/^[6-9]\d{9}$/.test(c.whatsapp||''))links.push(['wa','WhatsApp +91 '+c.whatsapp.replace(/(\d{5})(\d{5})/,'$1 $2'),'https://wa.me/91'+c.whatsapp]);
  [['instagram','Instagram'],['facebook','Facebook'],['youtube','YouTube']].forEach(([k,l])=>{if(/^https:\/\//.test(c[k]||''))links.push([k,l,c[k]])});
  const fs=$('#footSocial');
  if(fs)fs.setAttribute('data-soc','');   // filled with icons by the pages code (paintShared)
  window.RC_SITE=s;if(window.RC_PAGES)RC_PAGES.site(s);
  if(s.seo){if(s.seo.title){if(PGV.cur)PGV.title=s.seo.title;else document.title=s.seo.title}const md=document.querySelector('meta[name="description"]');if(md&&s.seo.description)md.setAttribute('content',s.seo.description)}
}

/* ===================== more leads: brand tiles, call-back, leaving popup, sold feed, book-today bonus, ad source, Meta Pixel ===================== */
const LX={feed:true,leave:true,pixel:'',pixelOn:false,tiles:[],items:[],fi:0,ft:0,called:false,shown:false,viewed:new Set()};
(()=>{const c=+store.get('called',0);LX.called=!!c&&Date.now()-c<7*864e5;try{LX.shown=sessionStorage.getItem('rc-leave')==='1'}catch(_){}})();
const T0=Date.now();

/* where this visitor came from: utm_* tags on the ad link, a Facebook/Instagram or Google click, or another site.
   The first source is kept for 30 days; a new ad click replaces a visit that came without one. */
SRC=(()=>{
  let cur=store.get('src',null);
  try{
    const u=new URLSearchParams(location.search),g=k=>(u.get('utm_'+k)||'').slice(0,80),fb=u.has('fbclid'),gc=u.has('gclid');
    let ref='';try{if(document.referrer){const h=new URL(document.referrer).hostname.replace(/^www\./,''),me=location.hostname.replace(/^www\./,'');if(h&&h!==me)ref=h}}catch(_){}
    const paid=!!(g('source')||fb||gc);
    const now={source:g('source')||(fb?'facebook':gc?'google':ref),medium:g('medium')||(fb||gc?'paid':ref?'referral':''),campaign:g('campaign'),content:g('content'),term:g('term'),fb:fb?1:0,ref,landing:location.pathname.slice(0,120),at:Math.floor(Date.now()/1000),paid};
    const stale=!cur||!cur.at||Date.now()/1000-cur.at>30*86400;
    if(now.source&&(stale||(paid&&!cur.paid))){cur=now;store.set('src',cur)}
  }catch(_){}
  return cur&&cur.source?cur:null;
})();

/* Meta Pixel (Admin > Website > Leads and ads): page views, leads and bookings, so ads can be judged by what they bring */
function pixelInit(id){
  if(LX.pixelOn||!/^\d{8,20}$/.test(id||''))return;LX.pixelOn=true;
  !function(f,b,e,v,n,t,x){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;x=b.getElementsByTagName(e)[0];x.parentNode.insertBefore(t,x)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init',id);fbq('track','PageView');
}
/* Google Analytics 4 (Admin > Website > Leads and ads): visits, and the same leads and bookings as the Pixel */
function gaInit(id){
  if(LX.gaOn||!/^G-[A-Z0-9]{4,16}$/.test(id||''))return;LX.gaOn=true;
  window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments)};
  const t=document.createElement('script');t.async=true;t.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);document.head.appendChild(t);
  gtag('js',new Date());gtag('config',id);
}
const GA_EV={Lead:'generate_lead',Schedule:'book_pickup',ViewContent:'view_item'};
function px(ev,p){try{if(LX.pixelOn&&window.fbq)fbq('track',ev,p||{})}catch(_){}try{if(LX.gaOn&&window.gtag)gtag('event',GA_EV[ev]||ev,{item_name:(p||{}).content_name||'',item_category:(p||{}).content_category||''})}catch(_){}}
function pxView(m){if(!m||LX.viewed.has(m.id)||Date.now()-T0<1500)return;LX.viewed.add(m.id);px('ViewContent',{content_name:m.name,content_category:m.cat,content_ids:[m.id],content_type:'product'})}

/* ---------- brand tiles in the hero ---------- */
const DEF_BRANDS=['Apple','Samsung','OnePlus','Xiaomi','Vivo','OPPO','Realme','Google','iQOO','Motorola','POCO','Nothing'];
function phoneBrands(){const c=new Map();CATALOG.forEach(m=>{if(m.cat==='phone')c.set(m.brand,(c.get(m.brand)||0)+1)});return c}
/* Built-in logos for the 9 main brands (icons/brands, made from the owner's files): file, width ÷ height, brand colour.
   A logo uploaded in Admin > Website > Leads and ads replaces the built-in one. */
const BRAND_KIT={Apple:['apple',2.72,'#0E2A19'],Samsung:['samsung',5.36,'#1428A0'],OnePlus:['oneplus',3.85,'#F62415'],Xiaomi:['xiaomi',3.03,'#FF6A08'],Vivo:['vivo',3.49,'#415FFF'],
  OPPO:['oppo',5.17,'#00925F'],Realme:['realme',3.23,'#F2B705'],Google:['google',.92,'#4285F4'],iQOO:['iqoo',3.75,'#F0B31A'],
  ASUS:['asus',3.77,'#4D4F53'],LG:['lg',1.95,'#A50034'],Lenovo:['lenovo',3.77,'#E2231A'],'Ai+':['aiplus',1.2,'#111111'],Nothing:['nothing',3.9,'#D71921'],Honor:['honor',3.8,'#5A5AF7'],Nokia:['nokia',4.2,'#124191'],POCO:['poco',1.73,'#F5C400'],Tecno:['tecno',2.4,'#1775BB'],Infinix:['infinix',3.64,'#2B2B2B'],Motorola:['motorola',3.82,'#0E1E2F']};
const logoOf=b=>{const t=LX.tiles.find(x=>x.brand===b);return t&&t.logo?t.logo:BRAND_KIT[b]?'icons/brands/'+BRAND_KIT[b][0]+'.png':''};
const tintOf=b=>BRAND_KIT[b]?BRAND_KIT[b][2]:'';
/* every logo gets the same visual weight: wide word marks sit lower, tall marks sit taller (height ∝ 1/√(width÷height)) */
const brandFace=b=>{const l=logoOf(b),kit=BRAND_KIT[b],own=l&&!(kit&&l.endsWith(kit[0]+'.png'));
  return l?`<img class="bl"${own?' data-fit':` style="--k:${(1/Math.sqrt(kit[1])).toFixed(3)}"`} src="${esc(l)}" alt="${esc(b)}" decoding="async">`:`<span class="bt-name${b.length>7?' long':''}">${esc(b)}</span>`};
function fitLogos(root){(root||document).querySelectorAll('img[data-fit]').forEach(i=>{const go=()=>{if(i.naturalWidth&&i.naturalHeight){i.style.setProperty('--k',(1/Math.sqrt(i.naturalWidth/i.naturalHeight)).toFixed(3));i.removeAttribute('data-fit')}};if(i.complete)go();else i.addEventListener('load',go,{once:true})})}
function tileBrands(){const have=phoneBrands();return (LX.tiles.length?LX.tiles.map(t=>t.brand):DEF_BRANDS).filter(b=>have.has(b)).slice(0,9)}
function renderBrandTiles(){
  const el=$('#brandRow');if(!el)return;const ts=tileBrands();
  const n=phoneBrands().size;
  el.innerHTML=ts.map((b,i)=>`<button type="button" class="bt" data-brand="${esc(b)}" style="--i:${i}${tintOf(b)?';--tint:'+tintOf(b):''}" aria-label="Sell your ${esc(b)} phone">${brandFace(b)}</button>`).join('')
    +`<button type="button" class="bt bt-more" data-brand="" style="--i:${ts.length}"><span><b>More brands</b>${n>ts.length?`<small>+${n-ts.length}</small>`:''}</span><svg class="i" aria-hidden="true"><use href="#i-arrow"/></svg></button>`;
  fitLogos(el);
  $('#heroBrands').hidden=!ts.length;
}
$('#brandRow').addEventListener('click',e=>{const b=e.target.closest('[data-brand]');if(b)openBrand(b.dataset.brand)});

/* ---------- brand sheet: brand → model → storage, then straight to the questions ---------- */
const BS={brand:'',q:'',series:'',m:null,last:null,quiz:false,qi:0,t:0,offer:false};
function openBrand(brand){
  if(BS.offer){BS.offer=false;bsOfferOut()}
  BS.last=document.activeElement;BS.brand=brand||'';BS.q='';BS.series='';BS.m=null;BS.quiz=false;$('#bsQ').value='';
  renderBS();$('#brandSheet').hidden=false;
  setTimeout(()=>{const f=BS.brand?(isPhone()?$('#brandSheet .bs-m'):$('#bsQ')):$('#bsAll .bt');if(f)f.focus({preventScroll:true})},40);
}
function openModel(m,vi,known){
  if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
  openBrand(m.brand);BS.last=null;
  if(known||m.variants.length===1){bsPick(m,vi||0);return}
  BS.m=m;renderBS();$('#brandSheet .nudge-card').scrollTop=0;
  setTimeout(()=>{const c=$('#bsVarChips .chip');if(c)c.focus({preventScroll:true})},60);
}
function closeBS(){const sh=$('#brandSheet');if(sh.hidden)return;sh.hidden=true;if(BS.offer){BS.offer=false;bsOfferOut()}if(BS.last&&BS.last.isConnected)BS.last.focus({preventScroll:true})}
function renderBS(){
  const b=BS.brand,m=BS.m,lg=$('#bsLogo');
  $('#bsH').textContent=m?`Your ${m.name}`:b?`Sell your ${b} phone`:'Pick your brand';
  lg.hidden=!b||!logoOf(b);if(!lg.hidden)lg.innerHTML=brandFace(b);
  $('#bsAll').hidden=!!b;$('#bsSearch').hidden=!b||!!m;$('#bsSeries').hidden=!b||!!m;$('#bsGrid').hidden=!b||!!m;$('#bsVar').hidden=!m||BS.quiz;$('#bsMiss').hidden=!!m;$('#bsQuiz').hidden=!BS.quiz;
  $('#bsOffer').hidden=!BS.offer;
  if(BS.offer){['#bsAll','#bsSearch','#bsSeries','#bsGrid','#bsVar','#bsMiss','#bsQuiz'].forEach(x=>{$(x).hidden=true});bsPaintBook();return}
  if(BS.quiz){renderBSQ();return}
  if(!b){
    const c=phoneBrands(),first=tileBrands(),rest=[...c.keys()].filter(x=>!first.includes(x)).sort((x,y)=>c.get(y)-c.get(x));
    $('#bsAll').innerHTML=[...first,...rest].map(x=>`<button type="button" class="bt" data-bsb="${esc(x)}"${tintOf(x)?` style="--tint:${tintOf(x)}"`:''} aria-label="${esc(x)}, ${c.get(x)} models">${brandFace(x)}<small aria-hidden="true">${c.get(x)}</small></button>`).join('');fitLogos($('#bsAll'));
    return;
  }
  if(m){
    $('#bsDev').innerHTML=`${thumb(m.cat,m.id,10)}<b>${esc(m.name)}</b>`;
    $('#bsVarQ').textContent=m.variants.some(v=>/\d\s*GB\s*\/\s*\d/i.test(v[0]))?'Which RAM and storage does it have?':'Which storage does it have?';
    $('#bsBack').hidden=m.cat!=='phone';
    $('#bsVarChips').innerHTML=m.variants.map((v,i)=>`<button type="button" class="chip" data-bsv="${i}"><b>${esc(v[0])}</b></button>`).join('');
    return;
  }
  const all=CATALOG.filter(x=>x.cat==='phone'&&x.brand===b),groups=seriesGroups(all);
  $('#bsSeries').innerHTML=groups.length>1?`<button type="button" class="chip" data-bss="" aria-pressed="${!BS.series}">All ${all.length}</button>`+groups.map(g=>`<button type="button" class="chip" data-bss="${esc(g.name)}" aria-pressed="${BS.series===g.name}">${esc(g.name)}</button>`).join(''):'';
  const toks=norm(BS.q).split(' ').filter(Boolean);
  let list=toks.length?searchModels(BS.q,all,80):(BS.series?(groups.find(g=>g.name===BS.series)||{ms:[]}).ms:groups.flatMap(g=>g.ms));
  const more=list.length>60;list=list.slice(0,60);
  $('#bsGrid').innerHTML=list.length?list.map(x=>`<button type="button" class="bs-m" data-bsm="${x.id}">${thumb(x.cat,x.id,8)}<span><b>${esc(x.name.toLowerCase().startsWith(b.toLowerCase()+' ')?x.name.slice(b.length+1):x.name)}</b><small>${esc(storRange(x))}</small></span></button>`).join('')+(more?`<p class="bs-empty" style="grid-column:1/-1">Showing 60. Type the model name to find yours.</p>`:''):`<p class="bs-empty" style="grid-column:1/-1">No ${esc(b)} model matches “${esc(BS.q)}”.</p>`;
}
/* storage picked: ask the condition questions right here, one at a time, then open the offer */
function bsPick(m,vi){
  stepQuiet=true;try{selectModel(m.id,vi)}finally{stepQuiet=false}BS.m=m;
  const qs=questionsFor(m);if(!qs.length){bsFinish();return}
  const k=qs.findIndex(q=>!ansOk(q,m,S.ans[q.id]));
  BS.quiz=true;BS.qi=k<0?qs.length-1:k;renderBS();bsFocus();
}
/* questions done: the offer and the OTP open right here in the pop-up (the offer card moves in from the page and goes back when the pop-up closes) */
function bsOfferIn(){const v=$('#vault'),slot=$('#bsOfferSlot');if(v&&slot&&v.parentElement!==slot)slot.appendChild(v)}
function bsOfferOut(){const v=$('#vault'),p=$('[data-pane="3"]');if(v&&p&&v.parentElement!==p)p.appendChild(v)}
function bsPaintBook(){const ok=BS.offer&&!!S.vphone&&$('#vault').dataset.state==='open';$('#bsBook').hidden=!ok}
function bsFinish(){
  clearTimeout(BS.t);stepQuiet=true;try{goStep(3)}finally{stepQuiet=false}
  BS.quiz=false;BS.offer=true;bsOfferIn();renderBS();
  const c=$('#brandSheet .nudge-card');if(c)c.scrollTop=0;
  setTimeout(()=>{const k=$('#vaultK');if(k)k.focus({preventScroll:true});if(!isPhone()&&!S.vphone){const f=$('#otpPhone');if(f&&!$('#otpPhoneForm').hidden)f.focus({preventScroll:true})}},80);
}
new MutationObserver(bsPaintBook).observe($('#vault'),{attributes:true,attributeFilter:['data-state']});
/* "Book free pickup": the pop-up closes and the page opens on the pickup step */
$('#bsBook').addEventListener('click',()=>{if(!S.vphone)return;closeBS();stepQuiet=true;try{goStep(4)}finally{stepQuiet=false}pageScroll($('#wizard'),'start',false)});
$('#bsoBack').addEventListener('click',()=>{const m=model(),qs=questionsFor(m);BS.offer=false;bsOfferOut();stepQuiet=true;try{goStep(2)}finally{stepQuiet=false}
  if(!qs.length){BS.quiz=false;renderBS();return}BS.quiz=true;BS.qi=qs.length-1;renderBS();bsFocus()});
function bsFocus(){const c=$('#brandSheet .nudge-card');if(c)c.scrollTop=0;const t=$('#bsqQ .q-label');if(t){t.setAttribute('tabindex','-1');t.focus({preventScroll:true})}}
function renderBSQ(){
  const m=model(),qs=questionsFor(m),n=qs.length,i=Math.min(BS.qi,n-1),q=qs[i],a=S.ans[q.id]||[];
  const done=qs.filter(x=>ansOk(x,m,S.ans[x.id])).length,c=(S.ans.color||[])[0];
  $('#bsH').textContent=`Your ${m.name}`;
  $('#bsqCount').textContent=`Question ${i+1} of ${n}`;$('#bsqFill').style.width=Math.round(done/n*100)+'%';
  $('#bsqDev').innerHTML=esc(m.name+' · '+m.variants[S.vi][0]+(c?' · '+c:''))+(gated()?'':` <b class="bsq-up">up to ${inr(topPrice(m,S.vi))}</b>`);
  $('#bsqErr').textContent='';
  const last=qs.every((x,k)=>k===i||ansOk(x,m,S.ans[x.id]));
  $('#bsqNext').innerHTML=(last?'See my price':'Next')+' <svg class="i"><use href="#i-arrow"/></svg>';
  const head=`<p class="q-label">${esc(q.title)}${q.type==='multi'&&!/select all/i.test(q.title)?' <span class="muted">Select all that apply</span>':''}</p>`;
  let body='';
  if(q.type==='battery'){const where=q.help||BATT_WHERE[m.cat]||'';body=`${where?`<p class="hint where"><svg class="i"><use href="#i-batt"/></svg><span>${esc(where)}</span></p>`:''}<div id="bsbq">${battHtml(q,S.ans[q.id])}</div>${aiLink('battery',q.id,'Read it from a screenshot')}`}
  else if(q.type==='color')body=`<div class="swq">${(m.colors||[]).map(([nm,h])=>`<button type="button" class="sw" data-bscol="${esc(nm)}" aria-pressed="${a[0]===nm}"><i style="--c:${esc(h)}"></i><span>${esc(nm)}</span></button>`).join('')}</div>`;
  else body=`${q.help?`<p class="hint">${esc(q.help)}</p>`:''}${q.id==='screen'||(q.id==='body'&&!qs.some(x=>x.id==='screen'))?aiCta(m):''}<div class="qopts">${q.options.map(o=>`<button type="button" class="qopt" data-bso="${esc(o.id)}" aria-pressed="${a.includes(o.id)}">${optImg(o)}<span>${esc(o.label)}</span></button>`).join('')}</div>${q.id==='age'?aiLink('bill',q.id,'Read the date from my bill'):''}`;
  $('#bsqQ').innerHTML=`<div class="q">${head}${body}</div>`;
}
/* an answer in the sheet updates the main form too, so both always agree */
function bsAnswered(auto){renderCond();renderQuote();saveDraft();if(auto){clearTimeout(BS.t);BS.t=setTimeout(bsNext,reduceMotion?60:280)}else renderBSQ()}
function bsNext(){
  clearTimeout(BS.t);const m=model(),qs=questionsFor(m),q=qs[BS.qi];
  if(q&&!ansOk(q,m,S.ans[q.id])){$('#bsqErr').textContent=qErrText(q);return}
  const after=qs.findIndex((x,k)=>k>BS.qi&&!ansOk(x,m,S.ans[x.id])),any=qs.findIndex(x=>!ansOk(x,m,S.ans[x.id]));
  if(after<0&&any<0){bsFinish();return}
  BS.qi=after>=0?after:any;renderBSQ();bsFocus();
}
$('#brandSheet').addEventListener('click',e=>{
  const ai=e.target.closest('[data-ai]');if(ai){openAi(ai.dataset.ai,ai.dataset.aiq||'',ai);return}
  if(e.target.id==='brandSheet'||e.target.closest('[data-bclose]')){closeBS();return}
  if(e.target.closest('[data-req-open]')){closeBS();return}
  if(BS.quiz){
    if(e.target.closest('#bsqNext')){bsNext();return}
    if(e.target.closest('#bsqBack')){clearTimeout(BS.t);if(BS.qi>0){BS.qi--;renderBSQ();bsFocus()}else{BS.quiz=false;if(BS.m.variants.length===1)BS.m=null;renderBS()}return}
    const m=model(),q=questionsFor(m)[BS.qi];if(!q)return;
    const bu=e.target.closest('[data-bunsure]');if(bu){S.ans[q.id]=['unsure'];bsAnswered(true);return}
    const sw=e.target.closest('[data-bscol]');if(sw){S.ans[q.id]=[sw.dataset.bscol];$$('#bsqQ [data-bscol]').forEach(x=>x.setAttribute('aria-pressed',String(x===sw)));bsAnswered(true);return}
    const ob=e.target.closest('[data-bso]');if(!ob)return;const o=ob.dataset.bso;
    const isNone=id=>{const x=q.options.find(y=>y.id===id);return !!x&&/^none\b/i.test(x.label)};
    let cur=S.ans[q.id]||[];
    if(q.type==='multi'){if(cur.includes(o))cur=cur.filter(x=>x!==o);else cur=isNone(o)?[o]:[...cur.filter(x=>!isNone(x)),o]}else cur=[o];
    S.ans[q.id]=cur;$$('#bsqQ [data-bso]').forEach(x=>x.setAttribute('aria-pressed',String(cur.includes(x.dataset.bso))));$('#bsqErr').textContent='';
    if(q.type==='single')bsAnswered(true);else{renderCond();renderQuote();saveDraft();$('#bsqNext').innerHTML=(questionsFor(m).every((x,k)=>k===BS.qi||ansOk(x,m,S.ans[x.id]))?'See my price':'Next')+' <svg class="i"><use href="#i-arrow"/></svg>'}
    return;
  }
  const t=e.target.closest('[data-bsb],[data-bss],[data-bsm],[data-bsv],#bsBack');if(!t)return;
  if(t.id==='bsBack'){BS.m=null;renderBS();return}
  if(t.dataset.bsb!=null){BS.brand=t.dataset.bsb;renderBS();$('#brandSheet .nudge-card').scrollTop=0;return}
  if(t.dataset.bss!=null){BS.series=t.dataset.bss;renderBS();return}
  if(t.dataset.bsm){const m=byId[t.dataset.bsm];if(!m)return;if(m.variants.length===1){bsPick(m,0);return}BS.m=m;renderBS();$('#brandSheet .nudge-card').scrollTop=0;const c=$('#bsVarChips .chip');if(c)c.focus({preventScroll:true});return}
  if(t.dataset.bsv!=null&&BS.m)bsPick(BS.m,+t.dataset.bsv);
});
$('#bsQ').addEventListener('input',()=>{BS.q=$('#bsQ').value;BS.series='';renderBS()});
/* battery slider in the sheet: live readout while dragging, saved when let go */
$('#bsqQ').addEventListener('input',e=>{const r=e.target.closest('[data-bq]');if(!r)return;const v=+r.value,box=$('#bsbq'),bq=box.querySelector('.bq'),cell=box.querySelector('.bq-cell'),col=v>=85?'var(--green)':v>=80?'#F2C200':'#E0582F';
  bq.classList.remove('unset');bq.style.setProperty('--bc',col);cell.querySelector('i').style.setProperty('--lvl',Math.max(6,(v-40)/60*100)+'%');cell.querySelector('b').textContent=v<=50?'≤50%':v+'%';
  box.querySelector('.bq-tag').innerHTML='<i></i>'+esc(BATT_LABEL(v)+(v<80?': the battery needs replacing soon':v>=95?': holds a charge like new':''));r.setAttribute('aria-valuetext',v+' percent');
  S.ans[r.dataset.bq]=[String(v)];$('#bsqErr').textContent=''});
$('#bsqQ').addEventListener('change',e=>{const r=e.target.closest('[data-bq]');if(!r)return;S.ans[r.dataset.bq]=[String(+r.value)];renderCond();renderQuote();saveDraft();const u=$('#bsbq [data-bunsure]');if(u)u.setAttribute('aria-pressed','false')});

/* ---------- "sold near you": real recent pickups from the server, never names, numbers or prices ---------- */
function agoTxt(ts){const s=Math.max(0,Date.now()/1000-ts),m=Math.round(s/60),h=Math.round(s/3600),d=Math.round(s/86400);return s<90?'just now':m<60?m+' min ago':h<24?h+(h===1?' hour ago':' hours ago'):d===1?'yesterday':d+' days ago'}
function feedLine(f){return `<b>${esc(f.model)}</b> ${f.paid?'sold':'pickup booked'} in ${esc(f.city)}${f.pin?' '+esc(f.pin):''} · ${agoTxt(f.at)}`}
function renderFeed(){
  const el=$('#soldFeed');clearInterval(LX.ft);
  el.hidden=!(LX.feed&&(LIVE||LX.preview)&&LX.items.length);if(el.hidden)return;
  LX.fi=0;$('#soldT').innerHTML=feedLine(LX.items[0]);
  if(LX.items.length<2||reduceMotion)return;
  LX.ft=setInterval(()=>{const t=$('#soldT');t.classList.add('out');setTimeout(()=>{LX.fi=(LX.fi+1)%LX.items.length;t.innerHTML=feedLine(LX.items[LX.fi]);t.classList.remove('out')},350)},4500);
}

/* ---------- book-today bonus with a countdown to midnight (India time) ---------- */
const todayOn=()=>!!(GROWTH.today_on&&+GROWTH.today_amount>0);
function todayEnds(){const IST=19800e3,D=864e5,n=Date.now();return Math.floor((n+IST)/D)*D+D-IST}
function leftTxt(){const s=Math.max(0,Math.floor((todayEnds()-Date.now())/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return `${h}h ${String(m).padStart(2,'0')}m ${String(x).padStart(2,'0')}s`}
function paintToday(){
  const on=todayOn(),amt=inr(+GROWTH.today_amount||0),min=+GROWTH.today_min||0;
  $('#todayChip').hidden=!on;if(on)$('#todayChipT').innerHTML=`Book a pickup today, get <b>${amt} extra</b>${min?` on offers over ${inr(min)}`:''}`;
  const cb=$('#callBonus');cb.hidden=!on;if(on)cb.innerHTML=`<svg class="i" aria-hidden="true"><use href="#i-bolt"/></svg><span>Book today and get <b>${amt} extra</b>${min?` on offers over ${inr(min)}`:''}. Ends in <b class="tleft">${leftTxt()}</b></span>`;
  const vt=$('#vaultToday'),ok=on&&!!S.vphone&&S.offer!=null&&S.offer>=min;vt.hidden=!ok;if(ok)vt.innerHTML=`+ ${amt} book-today bonus if you book before midnight · <span class="tleft">${leftTxt()}</span> left`;
  $$('.tleft').forEach(el=>{el.textContent=leftTxt()});
}
setInterval(()=>{if(todayOn()&&!document.hidden)$$('.tleft').forEach(el=>{el.textContent=leftTxt()})},1000);

/* ---------- "Call me back": name + mobile, no OTP; the team gets a WhatsApp/email at once ---------- */
const CALL={where:'site',last:null};
function openCall(where){
  CALL.where=where||'site';CALL.last=document.activeElement;
  const leave=CALL.where==='leave'||CALL.where==='idle',m=byId[S.modelId],chose=!!m&&(S.step>=2||Object.keys(S.ans).length>0);
  $('#callEy').hidden=!leave;
  $('#callH').textContent=leave&&chose?`Your ${m.name} price is a minute away`:leave?'Selling a phone? Get the price on a call':'Get your price on a call';
  $('#callP').textContent=`Leave your name and number and we'll call you back in a few minutes${BIZ.hours?' ('+BIZ.hours+')':''} with your price and a free pickup slot.`;
  const st=$('#callStay');st.hidden=!leave;st.textContent=chose?'No thanks, continue to my price':'No thanks, keep looking';
  $('#callAsk').hidden=false;$('#callDone').hidden=true;$('#callErr').textContent='';
  const c=store.get('contact',null)||{};
  if(!$('#callName').value&&c.name)$('#callName').value=c.name;
  if(!$('#callPhone').value)$('#callPhone').value=S.vphone||c.phone||'';
  paintToday();$('#callSheet').hidden=false;
  setTimeout(()=>{const f=$('#callName').value?$('#callPhone'):$('#callName');f.focus({preventScroll:true})},40);
  if(leave){LX.shown=true;try{sessionStorage.setItem('rc-leave','1')}catch(_){}}
}
function closeCall(){const sh=$('#callSheet');if(sh.hidden)return;sh.hidden=true;if(CALL.last&&CALL.last.isConnected)CALL.last.focus({preventScroll:true})}
document.addEventListener('click',e=>{const b=e.target.closest('[data-call]');if(b){e.preventDefault();openCall(b.dataset.call)}});
$('#callSheet').addEventListener('click',e=>{
  if(e.target.id==='callSheet'||e.target.closest('[data-cclose]')){closeCall();return}
  if(e.target.closest('#callStay')){closeCall();const m=byId[S.modelId];if(m&&(S.step>=2||Object.keys(S.ans).length)){goStep(Math.max(2,S.step));pageScroll($('#wizard'),'start',true)}}
});
$('#callForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('#callName').value.trim(),ph=$('#callPhone').value.replace(/\D/g,'').slice(-10),er=$('#callErr');
  if(name.length<2){er.textContent='Enter your name.';$('#callName').focus();return}
  if(!/^[6-9]\d{9}$/.test(ph)){er.textContent='Enter a valid 10-digit mobile number.';$('#callPhone').focus();return}
  const go=$('#callGo');go.disabled=true;er.textContent='';
  const m=byId[S.modelId],chose=!!m&&(S.step>=2||Object.keys(S.ans).length>0);
  try{
    if(LIVE)await apiPost('request',{kind:'call',name,phone:ph,model:chose?m.id:'',vi:S.vi,city:S.city,where:CALL.where,website:$('#callWeb').value});
    store.set('called',Date.now());LX.called=true;px('Lead',{content_name:chose?m.name:'Call back',content_category:'callback'});
    const c=store.get('contact',null)||{};store.set('contact',Object.assign({},c,{name,phone:ph}));
    $('#callDoneH').textContent=`Thanks, ${name.split(' ')[0]}`;
    $('#callDoneP').textContent=`We'll call +91 ${ph.replace(/(\d{5})(\d{5})/,'$1 $2')} in a few minutes${BIZ.hours?' ('+BIZ.hours+')':''}. Keep your phone nearby so we can tell you its price.`;
    $('#callAsk').hidden=true;$('#callDone').hidden=false;$('#callDoneOk').focus();
  }catch(err){er.textContent=err.message||'Couldn\'t send that. Please try again.'}
  finally{go.disabled=false}
});

/* ---------- leaving without a number: phones (back button, 45 s idle) and computers (mouse to the tab bar) ---------- */
const leaveOk=()=>LX.leave&&!LX.shown&&!LX.called&&!S.vphone&&S.step<5&&Date.now()-T0>6000
  &&$('#callSheet').hidden&&$('#brandSheet').hidden&&$('#reqSheet').hidden&&$('#aiSheet').hidden&&$('#nudge').hidden&&$('#cityModal').hidden;
let guard=false;
function armGuard(){if(guard||!isPhone()||S.step>=2||LX.shown||LX.called||!LX.leave||(window.hsEats&&hsEats()))return;guard=true;try{history.pushState({rcGuard:1},'')}catch(_){}}
addEventListener('pointerdown',armGuard,{passive:true});
addEventListener('popstate',e=>{const st=e.state;if(window.hsEats&&hsEats())return;if(window.RC_PG&&(RC_PG.cur||(st&&(st.pg||st.sm))))return;if(!guard||(st&&(st.rcGuard||st.rc)))return;guard=false;if(leaveOk())openCall('leave')});
let idleT=0;
function idleReset(){clearTimeout(idleT);if(!isPhone()||LX.shown||LX.called)return;idleT=setTimeout(()=>{const a=document.activeElement;if(leaveOk()&&!document.hidden&&S.step<=2&&!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)))openCall('idle')},45000)}
['pointerdown','keydown','scroll','touchstart'].forEach(ev=>addEventListener(ev,idleReset,{passive:true}));idleReset();
document.addEventListener('mouseout',e=>{if(!e.relatedTarget&&e.clientY<8&&!isPhone()&&!(S.step>=2&&answersComplete(model()))&&leaveOk())openCall('leave')});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!$('#callSheet').hidden)closeCall();else if(!$('#brandSheet').hidden)closeBS()});

/* settings from Admin > Website */
function applyLeads(site,feed){
  const s=site||{};LX.feed=s.soldFeed!==false;LX.leave=s.leavePopup!==false;
  LX.tiles=Array.isArray(s.brandTiles)?s.brandTiles.filter(t=>t&&t.brand).map(t=>({brand:String(t.brand),logo:/^uploads\/[\w.-]+$/.test(t.logo||'')?t.logo:''})):[];
  if(Array.isArray(feed))LX.items=feed.filter(f=>f&&f.model&&f.at);
  if(s.pixel)pixelInit(String(s.pixel));
  if(s.ga4)gaInit(String(s.ga4));
  renderBrandTiles();renderFeed();paintToday();
}
/* a preview without the server (id="rcPreview": example bonus and feed, marked "example" on the page) */
(()=>{try{const e=document.getElementById('rcPreview'),j=e&&!EMB?JSON.parse(e.textContent):null;if(!j)return;
  Object.assign(GROWTH,j.growth||{});LX.preview=true;AIX.on=!!j.ai;if(j.agent&&j.agent.name)LX.agent=j.agent;LX.items=(j.feed||[]).map(f=>Object.assign({},f,{at:Math.floor(Date.now()/1000)-(+f.ago||0)}));
  // the preview carries small copies of the model photos (the live site gets them from photos/models/ through the API)
  if(j.photos){CATALOG.forEach(m=>{const u=j.photos[m.id];if(!m.img&&typeof u==='string'&&/^data:image\/webp;base64,/.test(u))m.img=u});if(typeof renderModels==='function')renderModels()}}catch(_){}})();
renderBrandTiles();renderFeed();paintToday();window.RC_LX=true;   // the hooks above (pickModel, setVault) may run before this point

function applyLive(j){
  if(S.vphone&&!S.vtoken)forgetPhone();
  LIVE=true;PRICE_GATE=!!j.price_gate;PRICES_IN=!j.price_gate;
  CATALOG.length=0;j.models.forEach(m=>CATALOG.push({id:m.id,cat:m.cat,brand:m.brand,name:m.name,series:m.series||'',base:m.base,variants:m.variants,img:m.img||'',colors:Array.isArray(m.colors)?m.colors:[]}));
  Object.keys(byId).forEach(k=>{delete byId[k]});CATALOG.forEach(m=>{byId[m.id]=m});buildAliases();sqIndex();
  const R=j.pricing;
  if(R){if(R.verified!=null)RULES.verified=+R.verified;if(R.floor)RULES.floor=R.floor}
  if(Array.isArray(j.questions)&&j.questions.length){QUESTIONS.length=0;j.questions.forEach(q=>QUESTIONS.push({...q,active:true,options:(q.options||[]).map(o=>({...o,active:true,deduct:0}))}))}
  if(j.fair)FAIR=j.fair;
  AIX.on=!!j.ai;paintDetect();
  if(j.business){
    if(Array.isArray(j.business.soon)){SOON.length=0;j.business.soon.forEach(c=>SOON.push(c))}
    if(j.business.icons&&typeof j.business.icons==='object')Object.assign(CITY_OVR,j.business.icons);
    if(Array.isArray(j.business.cities)&&j.business.cities.length){CITIES.length=0;j.business.cities.forEach(c=>CITIES.push(c));if(!CITIES.includes(S.city)){S.city=CITIES.includes(j.business.defaultCity)?j.business.defaultCity:CITIES[0];store.set('city',S.city)}}
    renderFootCities();
    if(Array.isArray(j.business.pins))BIZ.pins=j.business.pins.map(String);
    if(j.business.rapid&&typeof j.business.rapid==='object')BIZ.rapid=j.business.rapid;paintRapidBadge();
    if(j.business.supportEmail)BIZ.supportEmail=j.business.supportEmail;if(j.business.hours)BIZ.hours=j.business.hours;
  }
  if(j.repair&&Array.isArray(j.repair.devices)&&Array.isArray(j.repair.issues)){
    RP_DEV.length=0;j.repair.devices.forEach(d=>RP_DEV.push(d));RP_ISS.length=0;j.repair.issues.forEach(i=>RP_ISS.push(i));
    if(!RP_DEV.some(d=>d[0]===RP.dev))RP.dev=RP_DEV[0][0];if(!RP_ISS.some(i=>i[0]===RP.iss))RP.iss=RP_ISS[0][0];
  }
  if(!byId[S.modelId]){const f=CATALOG.find(m=>m.cat===S.cat)||CATALOG[0];S.modelId=f.id;S.cat=f.cat;S.vi=0}
  if(S.vi>=model().variants.length)S.vi=0;
  if(!byId[P.id])P.id=S.modelId;
  heroOffer();paintCity();paintBiz();renderTicker();renderCatTabs();renderBrands();renderModels();renderVariants();renderCond();renderQuote();labSummary();
  if(S.step===4)renderPickup();
  if(S.step===3)renderOffer();
  renderPulseSelect();renderPulse();renderRepair();renderRecent();renderResume();
  try{applySite(j.site)}catch(e){}
  if(j.growth)Object.assign(GROWTH,j.growth);paintGrowth();loadRef();
  try{applyLeads(j.site,j.feed)}catch(e){}
  if($('#trackIn').value===SAMPLE.id){$('#trackIn').value='';$('#trackOut').innerHTML='<p class="muted">Enter the order ID from your booking confirmation to see its progress.</p>'}
}
async function loadLive(){
  if(EMB){try{applyLive(EMB);await loadPrices()}catch(e){}finally{if(window.RecelloSplash)RecelloSplash.done()}return}
  try{
    const j=await apiGet('catalog');
    if(j&&Array.isArray(j.models)&&j.models.length){applyLive(j);await loadPrices()}   // a returning, verified visitor gets prices straight away
  }catch(e){console.error('[Recello] could not load live data from '+(window.RC_API_ORIGIN||'(same site)'),e);try{toast('Cannot load data from '+(window.RC_API_ORIGIN||'the server')+(e&&e.message?': '+e.message:''))}catch(_){}}
  finally{if(window.RecelloSplash)RecelloSplash.done()}   // the loading screen goes once today's prices are in
}

/* ======================= menu and pages ======================= */
/* Side menu (☰), and full-screen pages opened from it or from links like #/about: About us, Contact us, the four policies,
   My profile (log in with OTP), My orders and Request account deletion. The phone's back button closes them. */
const PD={"hq": {"address": "4th Floor, Silviana, Opposite Gera's Regent Park and Towers, PAN Card Club Road, Baner, Pune", "email": "recellosolutions@gmail.com", "phone": "9130999924"}, "legal": {"terms": {"title": "Terms & Conditions", "short": "Terms", "icon": "doc", "effective": "24/06/2024", "intro": "By using Recello's website, mobile application, or services, you agree to these Terms & Conditions.", "gist": [["user", "You must be 18+ and own the device you sell"], ["search", "The final value is set after we inspect the device"], ["lock", "Remove your accounts, SIM and activation locks first"]], "sections": [["Introduction", "By using Recello's website, mobile application, or services, you agree to these Terms & Conditions."], ["About Recello", "Recello facilitates the purchase, resale, refurbishment, and recycling of pre-owned electronic devices."], ["Eligibility", "Users must be at least 18 years old and legally own any device sold to Recello."], ["Device Ownership", "Users warrant that devices are legally owned, not stolen, and free from disputes."], ["Price Quotation", "Online prices are estimates. Final value is determined after inspection."], ["Device Inspection", "Recello may inspect condition, IMEI, functionality, battery health, and lock status."], ["User Responsibilities", "Users must remove personal data, accounts, SIM cards, and activation locks."], ["Payment Terms", "Payments are made after inspection and acceptance through approved payment methods."], ["Device Rejection", "Recello may reject devices with ownership, legal, or condition issues."], ["Warranty Disclaimer", "Warranty applies only when specifically stated at the time of sale."], ["Limitation of Liability", "Recello is not liable for data loss or indirect damages."], ["Fraud Prevention", "Identity verification and anti-fraud checks may be conducted."], ["Intellectual Property", "All Recello branding and content remain the property of Recello."], ["E-Waste Compliance", "Recello supports responsible recycling and e-waste management."], ["Governing Law", "These terms are governed by the laws of India and courts in Pune, Maharashtra."]]}, "cookies": {"title": "Cookie Policy", "short": "Cookies", "icon": "cookie", "effective": "June 11, 2026", "intro": "This Cookie Policy explains how Recello uses cookies and similar technologies on its website and services.", "gist": [["cookie", "Small files that remember your choices"], ["shield", "Used for security, speed and preferences"], ["gear", "You can switch them off in your browser"]], "sections": [["What Are Cookies?", "Cookies are small text files stored on your device to improve functionality, security, and user experience."], ["How Recello Uses Cookies", "Recello uses cookies to remember user preferences, analyze website traffic, improve performance, and maintain security."], ["Types of Cookies", "Essential Cookies, Analytics Cookies, Performance Cookies, and Preference Cookies may be used."], ["Managing Cookies", "You may manage or disable cookies through your browser settings. Some website features may not function properly if cookies are disabled."], ["Policy Updates", "Recello may update this Cookie Policy periodically. Updated versions will be posted on our website."]]}, "e-waste": {"title": "E-Waste Management Policy", "short": "E-waste", "icon": "leaf", "effective": "June 11, 2026", "intro": "Recello is committed to responsible reuse, refurbishment, and recycling of electronic devices. We aim to reduce electronic waste and support environmental sustainability through our mobile buyback and resale services.", "gist": [["recycle", "Reuse first, recycle what can’t be reused"], ["shield", "Data erased before anything else happens"], ["leaf", "Only authorised recyclers, never landfill"]], "sections": [["Our Commitment", "Recello promotes device reuse, responsible recycling, data security, and compliance with applicable e-waste management regulations in India."], ["Collection of Used Devices", "Used devices collected through Recello may be refurbished, repaired, resold, or recycled through authorized recycling channels when they are no longer suitable for reuse."], ["Responsible Recycling", "Devices that cannot be reused are sent to authorized recyclers for environmentally responsible processing and disposal."], ["Data Protection", "Recello follows industry-standard data erasure practices before refurbishment, resale, or recycling to protect customer privacy."], ["Consumer Awareness", "Customers are encouraged to recycle or sell unused devices responsibly and avoid disposal of electronics in regular household waste."], ["Environmental Benefits", "By extending the life cycle of electronic devices, Recello helps reduce landfill waste, conserve resources, and lower environmental impact."]]}, "privacy": {"title": "Privacy Policy", "short": "Privacy", "icon": "shield", "effective": "November 13, 2026", "intro": "This Privacy Policy explains what personal information Recello collects when you use our website, app and doorstep services, how we use it, who we share it with, and the choices you have.", "gist": [["lock", "We never sell your personal data"], ["mobile", "Your number is used for your offer, pickup and updates"], ["trash", "Ask us to delete your account any time"]], "sections": [["Information We Collect", "Your mobile number, which we verify with a one-time code. When you book: your name, pickup address, pincode and, only if you choose to share it, your location. About your device: the model, the condition answers you give, phone-test results if you run the test, and at pickup the IMEI and the agent's check. For payment: whether you chose cash or UPI. Anything you send us, such as a call-back request, a chat message or a screenshot of another quote. If you use an AI check, the photos or screenshots you choose for it (your device's screen and back, a battery screenshot or a purchase bill), and for \"Find this phone for me\", the model code your phone's browser reports. Technical information: the type of device and browser, the pages you visit, and the website or ad that brought you to us."], ["How We Use It", "To show and hold your offer, book and run your pickup or repair, and send you updates by SMS or WhatsApp. To verify your identity and the device's ownership and prevent fraud and theft. To pay you. To answer your questions and call you back when you ask. To improve our service and measure our advertising. To meet our legal, tax and accounting obligations."], ["Who We Share It With", "Our pickup agents and partner dealers or technicians who handle your order, with only what they need to do the job. Service providers who work for us, such as SMS and WhatsApp messaging, email, hosting, maps and advertising measurement, and our AI service provider (Anthropic), which looks at the photos you choose for an AI check and suggests answers. It doesn't use them to train its models. Government authorities when the law requires it. We do not sell your personal data."], ["Your Device's Data", "Every device is erased before it is refurbished, resold or recycled. Please back up your data and remove your accounts, SIM cards and activation locks before pickup."], ["How Long We Keep It", "One-time codes are deleted once used. Photos from the AI photo check are kept for 14 days so the agent can see them if you book, then deleted; battery and bill pictures are not kept. Sign-in on a device lasts up to 30 days. Offers and enquiries are kept while they are useful for following up with you. Orders and bills are kept for as long as tax and other laws require."], ["Your Choices", "You can ask to see, correct or delete your personal information. You can stop WhatsApp messages by replying STOP. You can request account deletion from the menu under Legal & account. You can manage cookies in your browser settings, as explained in our Cookie Policy."], ["Children", "Our services are for people aged 18 or over. We do not knowingly collect information from children."], ["Security", "We use encrypted connections, store one-time codes and sign-in keys only in protected form, and limit access to your information to the people who need it."], ["Changes to This Policy", "We may update this policy from time to time. The latest version will always be on our website, with its effective date."]]}}, "about": {"welcome": "Welcome to Recello", "tagline": "Smart Resale. Trusted Value.", "lede": "Recello is a Pune-based technology startup focused on transforming the way people sell, buy, and access refurbished smartphones. Founded by Kabier Ranveersingh Thakur, Santosh Pandit Aiwale, and Mohan Shankar Rathod, Recello was created with a simple mission: to make smartphone resale transparent, convenient, and trustworthy for everyone.", "why_exist": "As smartphone users upgrade their devices more frequently, the demand for reliable buyback and refurbishment services continues to grow. Recello aims to bridge the gap between sellers and buyers by providing a seamless platform that simplifies the entire process.", "roots": "Before Recello, our founders spent more than nine years as vendors in Pune's phone market, so they know what sellers go through.", "vision": "To become India's most trusted smartphone buyback and refurbishment platform by delivering transparency, convenience, and value at every step of the customer journey.", "mission": "We are committed to creating a hassle-free experience for customers looking to sell their old smartphones. Through fair pricing, efficient device evaluation, doorstep pickup services, and fast payments, we strive to make smartphone resale simple and accessible for all.", "do": [["mobile", "Smartphone buyback services"], ["star", "Refurbished smartphone sales"], ["recycle", "Device resale solutions"], ["search", "Transparent pricing and evaluation"], ["truck", "Convenient doorstep pickup"], ["lock", "Fast and secure payment processing"]], "why_intro": "Many consumers face challenges when selling their smartphones online, including inconsistent pricing, unexpected deductions, lengthy verification processes, and delayed payments. Recello is designed to address these concerns through a customer-first approach that prioritizes fairness and transparency.", "pains": ["Inconsistent pricing", "Unexpected deductions", "Lengthy verification processes", "Delayed payments"], "provide": ["Instant and competitive price estimates", "Clear and transparent device evaluation", "Reliable doorstep collection services", "Quick payment settlements", "A simple experience for first-time sellers"], "commitment": "At Recello, we believe technology should make everyday transactions easier. We are dedicated to building trust through honest pricing, dependable service, and a smooth customer experience. By helping users unlock the value of their old devices, we contribute to a more sustainable and circular technology ecosystem.", "join": "As we prepare for our official launch, we are excited to redefine the smartphone resale experience for customers across India. Whether you're looking to sell your old device or purchase a quality refurbished smartphone, Recello is committed to making the process simple, transparent, and rewarding.", "founders": [["Kabier Ranveersingh Thakur", "K", "Co-founder"], ["Santosh Pandit Aiwale", "S", "Co-founder"], ["Mohan Shankar Rathod", "M", "Co-founder"]], "smk": "S for Santosh, M for Mohan, K for Kabier. Every order number carries the founders' initials, because every order is a promise from all three of them.", "timeline": [["9+ years", "At the counter", "Our founders work as vendors in Pune's phone market and learn what sellers really need."], ["June 2026", "Recello is announced", "Pune-based Recello prepares to enter India's smartphone recommerce space, with clear pricing, device checks at your door and faster payments."], ["Today", "Live in Pune", "Instant prices, free doorstep pickup, payment before the agent leaves, a phone test in your browser, doorstep repair and free recycling."], ["Next", "Across India", "India's most trusted smartphone buyback and refurbishment platform."]], "press": [["ThePrint (ANI)", "Pune-Based Startup Recello Prepares to Enter India's Smartphone Recommerce Space", "18 June 2026", "https://theprint.in/ani-press-releases/pune-based-startup-recello-prepares-to-enter-indias-smartphone-recommerce-space/2963609/"], ["The Daily Guardian", "Pune-Based Startup Recello Prepares to Enter India's Smartphone Recommerce Space", "18 June 2026", "https://thedailyguardian.com/business/pune-based-startup-recello-prepares-to-enter-indias-smartphone-recommerce-space20260618180525-716742/"]], "do_intro": "Recello specializes in", "sign": "Recello – Smart Resale. Trusted Value.", "quotes": [["We wanted to build a platform where the process feels simple, fair, and reliable.", "The founders, in ThePrint (ANI)", "https://theprint.in/ani-press-releases/pune-based-startup-recello-prepares-to-enter-indias-smartphone-recommerce-space/2963609/"], ["People change phones more frequently now, but selling an old device still feels complicated for many users.", "The founders, in ThePrint (ANI)", "https://theprint.in/ani-press-releases/pune-based-startup-recello-prepares-to-enter-indias-smartphone-recommerce-space/2963609/"]]}, "ask": "Tell me about Recello (recello.in), the Pune startup founded by Kabier Thakur, Santosh Aiwale and Mohan Rathod that buys used phones with doorstep pickup. How does selling my old phone to Recello work?", "ai": [["ChatGPT", "https://chatgpt.com/?q=", ""], ["Claude", "https://claude.ai/new?q=", "claude"], ["Perplexity", "https://www.perplexity.ai/search?q=", "perplexity"]], "play": "https://play.google.com/store/search?q=recello&c=apps"};
const PGV={cur:null,pushed:false,after:null,last:null,delDone:false};window.RC_PG=PGV;
const SITE=()=>window.RC_SITE||{};
const hqAddr=()=>((SITE().contact||{}).address)||PD.hq.address;
const hqPhone=()=>{const p=String(BIZ.supportPhone||'').replace(/\D/g,'').replace(/^(91|0)(?=\d{10}$)/,'');return /^[6-9]\d{9}$/.test(p)?p:PD.hq.phone};
const hqMail=()=>BIZ.supportEmail&&BIZ.supportEmail!=='support@recello.in'?BIZ.supportEmail:PD.hq.email;   // the old placeholder address counts as not set
const fmt10=p=>'+91 '+String(p).replace(/(\d{5})(\d{5})/,'$1 $2');
const mapsUrl=()=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('Recello, '+hqAddr());
const playUrl=()=>((SITE().contact||{}).playstore)||PD.play;
const ic=n=>`<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const aiChips=()=>PD.ai.map(([n,u,l])=>`<a class="ai-chip" href="${esc(u+encodeURIComponent(PD.ask))}" target="_blank" rel="noopener" aria-label="Ask ${esc(n)} about Recello"><span class="ai-lg">${l?`<img src="icons/ai/${esc(l)}.png" alt="" width="18" height="18" loading="lazy" decoding="async">`:ic('spark')}</span>${esc(n)}</a>`).join('');
function socialList(){const c=SITE().contact||{},L=[];
  if(/^[6-9]\d{9}$/.test(c.whatsapp||''))L.push(['chat','WhatsApp','https://wa.me/91'+c.whatsapp]);
  [['instagram','Instagram','camera'],['facebook','Facebook','users'],['youtube','YouTube','play'],['linkedin','LinkedIn','case']].forEach(([k,l,i])=>{if(/^https:\/\//.test(c[k]||''))L.push([i,l,c[k]])});
  return L}
const socHtml=()=>socialList().map(([i,l,u])=>`<li><a href="${esc(u)}" target="_blank" rel="noopener">${ic(i)}${esc(l)}</a></li>`).join('');
function paintShared(){
  $$('[data-ai]').forEach(el=>{el.innerHTML=aiChips()});
  $$('[data-play]').forEach(a=>{a.href=playUrl()});
  $$('[data-hq-addr]').forEach(el=>{el.textContent=hqAddr()});
  $$('[data-hq-tel]').forEach(a=>{a.href='tel:+91'+hqPhone();a.textContent=fmt10(hqPhone())});
  $$('[data-hq-mail]').forEach(a=>{a.href='mailto:'+hqMail();a.textContent=hqMail()});
  const sh=socHtml();$$('[data-soc]').forEach(u=>{u.innerHTML=sh;u.hidden=!sh});
}
window.RC_PAGES={site(){paintShared();if(PGV.cur&&PAGES[PGV.cur]&&!document.activeElement.closest('#pgBody form'))renderPage(PGV.cur)}};

/* ---------- opening and closing (one history entry for the menu or a page, so "back" closes it) ---------- */
const SM=$('#sideMenu'),PV=$('#pageView');
function lockBody(){document.body.classList.toggle('pg-on',!SM.hidden||!PV.hidden)}
function smOpen(){
  if(!SM.hidden)return;if(!PGV.cur)PGV.last=document.activeElement;
  smPaint();paintShared();SM.hidden=false;lockBody();$('#menuBtn').setAttribute('aria-expanded','true');
  if(!PGV.cur){PGV.cur='sm';try{history.pushState({sm:1},'');PGV.pushed=true}catch(_){PGV.pushed=false}}else{PGV.cur='sm';try{history.replaceState({sm:1},'',location.pathname+location.search)}catch(_){}}
  setTimeout(()=>{const x=$('.sm-x');if(x)x.focus({preventScroll:true})},40);
}
function smHide(){SM.hidden=true;$('#menuBtn').setAttribute('aria-expanded','false');lockBody()}
function showPage(id){
  if(!PGV.cur){PGV.last=document.activeElement;PGV.title=document.title}
  smHide();renderPage(id);try{document.title=PAGES[id].t+' · Recello'}catch(_){}PV.hidden=false;lockBody();PGV.cur=id;$('#pgScroll').scrollTop=0;paintProg();
  setTimeout(()=>$('#pgBack').focus({preventScroll:true}),40);
}
function openPage(id){
  if(!PAGES[id])return;
  if(id==='delete-account'&&PGV.cur!=='delete-account')PGV.delDone=false;
  const had=!!PGV.cur&&PGV.pushed;showPage(id);
  try{if(had)history.replaceState({pg:id},'','#/'+id);else{history.pushState({pg:id},'','#/'+id);PGV.pushed=true}}catch(_){}
}
function hideAll(){smHide();PV.hidden=true;$('#pgBody').innerHTML='';if(PGV.cur&&PGV.title)document.title=PGV.title;PGV.cur=null;PGV.pushed=false;lockBody();
  const l=PGV.last;PGV.last=null;if(l&&l.isConnected&&l!==document.body)try{l.focus({preventScroll:true})}catch(_){}}
/* close whatever is open, then run `after` (go to a section, open the chat…) */
function closeTop(after){
  if(!PGV.cur){if(after)after();return}
  if(PGV.pushed){PGV.after=after||null;history.back();
    setTimeout(()=>{if(PGV.cur){hideAll();const f=PGV.after;PGV.after=null;if(f)f()}},450)}   // if the browser ignores back
  else{hideAll();if(after)after()}
}
addEventListener('popstate',e=>{const st=e.state||{};if(window.hsEats&&hsEats())return;
  if(st.pg&&PAGES[st.pg]){showPage(st.pg);PGV.pushed=true;return}
  if(PGV.cur){hideAll();const f=PGV.after;PGV.after=null;if(f)setTimeout(f,0)}
});

/* ---------- side menu ---------- */
function smPaint(){
  const c=store.get('contact',null)||{},v=S.vphone,name=String(c.name||'').trim().split(/\s+/)[0]||'';
  $('#smHi').innerHTML=v
    ?`<span class="sm-av" aria-hidden="true">${esc((name||'R')[0].toUpperCase())}</span><span class="sm-who"><b>Namaste${name?', '+esc(name):''}</b><span>${fmt10(v)} · <em>${ic('check')}Verified</em></span></span><button type="button" class="sm-pf" data-page="profile">My profile${ic('chev')}</button>`
    :`<span class="sm-av sm-av-0" aria-hidden="true">${ic('user')}</span><span class="sm-who"><b>Namaste!</b><span>Log in with your mobile to see your orders and today's prices.</span></span><button type="button" class="sm-pf" data-page="profile">Log in with OTP${ic('chev')}</button>`;
  $('#smOut').hidden=!v;
  const n=S.orders.filter(o=>!LIVE||o.live).length;$('#smOrdN').textContent=n?n+(n===1?' order':' orders')+' on this phone':'Track your pickup';
  $('#smReviews').hidden=!$('#reviews')||$('#reviews').hidden;
  $$('.sm-panel .sq,.sm-panel .sm-row').forEach((el,i)=>el.style.setProperty('--d',i));
}
$('#menuBtn').addEventListener('click',()=>{SM.hidden?smOpen():closeTop()});

/* ---------- pages ---------- */
const LEGAL_IDS=['privacy','terms','cookies','e-waste'];
const PAGES={
  about:{t:'About us',r:pAbout},contact:{t:'Contact us',r:pContact},profile:{t:'My profile',r:pProfile},orders:{t:'My orders',r:pOrders,after:ordersStatus},
  'delete-account':{t:'Delete my account',r:pDelete},
  privacy:{t:'Privacy policy',r:()=>pLegal('privacy'),after:tocWatch},terms:{t:'Terms & conditions',r:()=>pLegal('terms'),after:tocWatch},
  cookies:{t:'Cookie policy',r:()=>pLegal('cookies'),after:tocWatch},'e-waste':{t:'E-waste policy',r:()=>pLegal('e-waste'),after:tocWatch},
};
function renderPage(id){const p=PAGES[id];$('#pgTitle').textContent=p.t;$('#pgBody').innerHTML=p.r();if(p.after)p.after();paintProg()}
function paintProg(){const sc=$('#pgScroll'),max=sc.scrollHeight-sc.clientHeight;$('#pgProg').style.setProperty('--p',max>4?(sc.scrollTop/max).toFixed(3):'0');tocMark()}
$('#pgScroll').addEventListener('scroll',paintProg,{passive:true});
function tocWatch(){tocMark()}
function tocMark(){const t=$('#pgBody .toc');if(!t)return;const sc=$('#pgScroll'),top=sc.getBoundingClientRect().top+110;let on=0;
  $$('#pgBody .lg-sec').forEach((s,i)=>{if(s.getBoundingClientRect().top<=top)on=i});
  $$('button',t).forEach((b,i)=>{const was=b.classList.contains('on');b.classList.toggle('on',i===on);if(i===on&&!was&&t.scrollWidth>t.clientWidth)t.scrollTo({left:b.offsetLeft-16,behavior:'smooth'})})}
const hqCard=()=>`<div class="hq-card"><div class="hq-map" aria-hidden="true">${ic('pin')}</div><div><p class="fx-k">Recello Headquarters (HQ)</p><p class="hq-a">${esc(hqAddr())}</p>
  <div class="hq-acts"><a class="pb" href="tel:+91${hqPhone()}">${ic('call')}${fmt10(hqPhone())}</a><a class="pb" href="mailto:${esc(hqMail())}">${ic('mail')}${esc(hqMail())}</a><a class="pb pb-y" href="${esc(mapsUrl())}" target="_blank" rel="noopener">${ic('pin')}Directions</a></div></div></div>`;
const playBadge=w=>`<a class="play-badge" href="${esc(playUrl())}" target="_blank" rel="noopener"><img src="icons/google-play.png" alt="Android app on Google Play" width="${w}" height="${Math.round(w*.28)}"></a>`;

function pLegal(k){
  const d=PD.legal[k],words=d.sections.reduce((n,x)=>n+x[1].split(' ').length,0),others=LEGAL_IDS.filter(x=>x!==k);
  return `<section class="pg-hero"><p class="pg-eyebrow">${ic(d.icon)}Recello · ${esc(d.short)}</p><h1>${esc(d.title)}</h1><p class="pg-lede">${esc(d.intro)}</p>
    <p class="pg-pills"><span>${ic('clock')}Effective ${esc(d.effective)}</span><span>${ic('doc')}${d.sections.length} sections · ${Math.max(1,Math.round(words/200))} min read</span></p></section>
  <div class="gist" aria-label="In short">${d.gist.map(([i,t],n)=>`<div class="gist-c" style="--d:${n}"><span>${ic(i)}</span><b>${esc(t)}</b></div>`).join('')}</div>
  <div class="lg-wrap"><nav class="toc" aria-label="Sections">${d.sections.map(([h],i)=>`<button type="button" data-toc="${i}"><i>${String(i+1).padStart(2,'0')}</i>${esc(h)}</button>`).join('')}</nav>
  <div>${d.sections.map(([h,t],i)=>`<section class="lg-sec" id="lg-${i}"><span class="lg-n" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(h)}</h2><p>${esc(t)}</p></div></section>`).join('')}
  ${hqCard()}
  <div class="lg-more"><p class="fx-k">Other policies</p>${others.map(o=>`<button type="button" class="lg-link" data-page="${o}">${ic(PD.legal[o].icon)}${esc(PD.legal[o].title)}</button>`).join('')}</div></div></div>`;
}
function pAbout(){const a=PD.about;
  return `<section class="pg-hero ab-hero"><p class="pg-eyebrow">${ic('spark')}About us</p><h1>Welcome to<br><span>Recello.</span></h1><p class="pg-lede">${esc(a.lede)}</p><p class="pg-pills"><span>${ic('star')}${esc(a.tagline)}</span><span>${ic('pin')}Made in Pune</span></p><div class="ab-smk" aria-hidden="true"><b>S</b><b>M</b><b>K</b></div></section>
  <div class="ab-story"><p>${esc(a.why_exist)}</p><p>${esc(a.roots)}</p><blockquote>“${esc(a.quotes[0][0])}”<cite><a href="${esc(a.quotes[0][2])}" target="_blank" rel="noopener">${esc(a.quotes[0][1])}</a></cite></blockquote></div>
  <div class="vm"><div class="vm-c vm-v"><p class="fx-k">${ic('spark')}Our vision</p><p>${esc(a.vision)}</p></div><div class="vm-c vm-m"><p class="fx-k">${ic('bolt')}Our mission</p><p>${esc(a.mission)}</p></div></div>
  <h2 class="pg-h">What we do</h2><p class="ab-lead">${esc(a.do_intro)}</p>
  <div class="wd">${a.do.map(([i,t],n)=>`<div class="wd-c" style="--d:${n}">${ic(i)}<b>${esc(t)}</b></div>`).join('')}</div>
  <h2 class="pg-h">Why Recello?</h2>
  <figure class="ab-say"><blockquote>${esc(a.quotes[1][0])}</blockquote><figcaption><a href="${esc(a.quotes[1][2])}" target="_blank" rel="noopener">${esc(a.quotes[1][1])}</a></figcaption></figure>
  <p class="ab-p">${esc(a.why_intro)}</p>
  <div class="why"><div class="why-c why-x"><p class="fx-k">Selling online often means</p><ul>${a.pains.map(t=>`<li>${ic('close')}<s>${esc(t)}</s></li>`).join('')}</ul></div><span class="why-arrow" aria-hidden="true">${ic('arrow')}</span>
    <div class="why-c why-ok"><p class="fx-k">Our platform is built to provide</p><ul>${a.provide.map(t=>`<li>${ic('check')}${esc(t)}</li>`).join('')}</ul></div></div>
  <h2 class="pg-h">The people behind Recello</h2>
  <div class="founders">${a.founders.map(([n,l,r],i)=>`<div class="fd fd-${i}"><span class="fd-av" aria-hidden="true">${esc(l)}</span><b>${esc(n)}</b><small>${esc(r)}</small></div>`).join('')}</div>
  <div class="smk-card"><p class="fx-k">Why every order number starts with SMK</p><div class="smk-tiles" aria-hidden="true">${[['S','Santosh'],['M','Mohan'],['K','Kabier']].map(([l,n])=>`<span><b>${l}</b><small>${n}</small></span>`).join('')}</div><p>${esc(a.smk)}</p><p class="smk-eg">Order numbers look like <b>SMK001</b>, <b>SMK002</b>…</p></div>
  <h2 class="pg-h">Our journey so far</h2>
  <ol class="tl">${a.timeline.map(([w,h,t],i)=>`<li style="--d:${i}"><span class="tl-w">${esc(w)}</span><b>${esc(h)}</b><p>${esc(t)}</p></li>`).join('')}</ol>
  <div class="commit"><span class="commit-ic" aria-hidden="true">${ic('recycle')}</span><div><p class="fx-k">Our commitment</p><p>${esc(a.commitment)}</p></div></div>
  <h2 class="pg-h">In the news</h2>
  <div class="press">${a.press.map(([src,title,date,url])=>`<a class="press-c" href="${esc(url)}" target="_blank" rel="noopener"><small>${esc(src)} · ${esc(date)}</small><b>${esc(title)}</b><span>Read the story${ic('chev')}</span></a>`).join('')}</div>
  ${hqCard()}
  <div class="ab-ai"><div><p class="fx-k">${ic('spark')}Don't just take our word for it</p><p>Ask your favourite AI assistant about Recello.</p></div><div class="ai-chips">${aiChips()}</div></div>
  <div class="cta-band join"><div><b>Join the Recello journey</b><span>${esc(a.join)}</span><em>${esc(a.sign)}</em></div><div class="join-acts"><button type="button" class="pb pb-y pb-big" data-go="sell">Get my price${ic('arrow')}</button>${playBadge(150)}</div></div>`;
}
function pContact(){
  const c=SITE().contact||{},wa=/^[6-9]\d{9}$/.test(c.whatsapp||'')?c.whatsapp:'';
  const cards=[['call','Call us',fmt10(hqPhone()),'tel:+91'+hqPhone(),0],wa?['chat','WhatsApp',fmt10(wa),'https://wa.me/91'+wa,1]:null,['mail','Email',hqMail(),'mailto:'+hqMail(),0],['pin','Visit our HQ','Baner, Pune · get directions',mapsUrl(),1]].filter(Boolean);
  return `<section class="pg-hero"><p class="pg-eyebrow">${ic('call')}Contact us</p><h1>Talk to a real person<br><span>in Pune.</span></h1><p class="pg-lede">Our own team answers, ${esc(BIZ.hours||'every day')}. No call centre, no bots unless you want one.</p></section>
  <div class="ct-grid">${cards.map(([i,h,v,u,ext],n)=>`<a class="ct-c ct-${i}" href="${esc(u)}"${ext?' target="_blank" rel="noopener"':''} style="--d:${n}"><span class="ct-ic">${ic(i)}</span><b>${esc(h)}</b><small>${esc(v)}</small></a>`).join('')}
    <button type="button" class="ct-c" data-sm-act="call" style="--d:${cards.length}"><span class="ct-ic">${ic('call')}</span><b>Call me back</b><small>Leave your number, we call in minutes</small></button>
    <button type="button" class="ct-c ct-chat" data-sm-act="chat" style="--d:${cards.length+1}"><span class="ct-ic">${ic('chat')}</span><b>Chat with Cello</b><small>Instant answers, any time</small></button></div>
  ${hqCard()}
  ${socialList().length?`<h2 class="pg-h">Follow Recello</h2><ul class="soc">${socHtml()}</ul>`:''}
  <div class="ab-ai"><div><p class="fx-k">${ic('spark')}Ask AI about Recello</p><p>Get a second opinion from your AI assistant.</p></div><div class="ai-chips">${aiChips()}</div></div>
  <div class="cta-band"><div><b>Recello in your pocket</b><span>Get the Android app.</span></div>${playBadge(150)}</div>`;
}
const loginHtml=()=>`<div class="lg-otp"><ol class="otp-steps" id="pfoSteps"><li class="on"><i>1</i>Mobile</li><li><i>2</i>Code</li><li><i>3</i>Done</li></ol>
  <form class="otp-step" id="pfoPhoneF" novalidate><label class="otp-h" for="pfoPhone">Your mobile number</label>
    <div class="otp-row"><span class="otp-ph"><b><span class="flag" aria-hidden="true"><i></i><i></i><i></i></span>+91</b><input id="pfoPhone" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="98765 43210" enterkeyhint="send"></span><button class="btn btn-primary otp-btn" type="submit" id="pfoSend">Send code${ic('send')}</button></div>
    <em class="err" id="pfoErr"></em><ul class="otp-trust"><li>${ic('lock')}No password</li><li>${ic('shield')}No spam</li></ul></form>
  <form class="otp-step" id="pfoCodeF" novalidate hidden><div class="otp-sms" aria-hidden="true"><span class="sms-ic">${ic('chat')}</span><span class="sms-t"><small>Messages · now</small><b>RECELLO</b><span id="pfoSms">Your Recello code is <i>• • • •</i></span></span></div>
    <p class="otp-to">Type the 6-digit code sent to <b id="pfoTo"></b> <button type="button" class="link-btn" id="pfoChange">Change</button></p>
    <div class="otp-boxes" id="pfoBoxes"><input id="pfoCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="6-digit code"><span></span><span></span><span></span><span></span><span></span><span></span></div><em class="err" id="pfoCodeErr"></em></form></div>`;
function pProfile(){
  if(!S.vphone)return `<section class="pg-hero"><p class="pg-eyebrow">${ic('user')}My profile</p><h1>Log in with<br><span>your mobile.</span></h1><p class="pg-lede">See your orders and today's prices, and keep your pickup details ready. No password, just a code.</p></section>${loginHtml()}`;
  const c=store.get('contact',null)||{},n=S.orders.filter(o=>!LIVE||o.live).length;
  return `<section class="pg-hero"><div class="pf-id"><span class="sm-av" aria-hidden="true">${esc((String(c.name||'R').trim()[0]||'R').toUpperCase())}</span><div><h1>${esc(c.name||'Your profile')}</h1><p>${fmt10(S.vphone)} · <em>${ic('check')}Verified</em></p></div></div></section>
  <div class="pf-cards"><button type="button" class="pf-c" data-page="orders">${ic('box')}<b>${n}</b><small>${n===1?'Order':'Orders'} on this phone</small></button><button type="button" class="pf-c" data-go="sell">${ic('bolt')}<b>Sell</b><small>Get a new price</small></button></div>
  <form class="pf-form" id="pfEdit" novalidate><p class="fx-k">${ic('pencil')}Saved for your next pickup</p>
    <label class="fld"><span>Name</span><input id="pfeName" autocomplete="name" maxlength="60" value="${esc(c.name||'')}" placeholder="Your full name"></label>
    <label class="fld"><span>Pickup address</span><textarea id="pfeAddr" rows="2" maxlength="240" placeholder="Flat, building, street, area">${esc(c.addr||'')}</textarea></label>
    <div class="two"><label class="fld"><span>Pincode</span><input id="pfePin" inputmode="numeric" maxlength="6" value="${esc(c.pin||'')}" placeholder="411045"></label><label class="fld"><span>Paid by</span><select id="pfePay"><option value="upi"${c.payout!=='cash'?' selected':''}>UPI</option><option value="cash"${c.payout==='cash'?' selected':''}>Cash</option></select></label></div>
    <em class="err" id="pfeErr"></em><button class="pb pb-g pb-big" type="submit">${ic('check')}Save details</button><p class="pf-note">Kept only on this phone and filled in for you when you book.</p></form>
  <div class="pf-acts"><button type="button" class="pf-row" data-sm-act="logout">${ic('out')}<span><b>Log out</b><small>Forget this number on this phone</small></span></button><button type="button" class="pf-row pf-del" data-page="delete-account">${ic('trash')}<span><b>Request account deletion</b><small>Remove your details from Recello</small></span></button></div>`;
}
function pOrders(){
  const list=S.orders.filter(o=>!LIVE||o.live);
  return `<section class="pg-hero"><p class="pg-eyebrow">${ic('box')}My orders</p><h1>${list.length?'Your orders<br><span>on this phone.</span>':'No orders<br><span>yet.</span>'}</h1><p class="pg-lede">${list.length?'Tap an order to see where it is.':'Sell your phone in a few minutes, or track any order with its SMK number.'}</p></section>
  ${list.length?`<div class="or-list">${list.map(o=>`<button type="button" class="or-c" data-track="${esc(o.id)}"><span class="or-ic">${ic(o.type==='repair'?'tool':'mobile')}</span><span class="or-t"><b>${esc(o.id)}</b><span>${esc(o.title||'')}</span><small>${o.created?new Date(o.created).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):''}${o.amount?' · '+inr(o.amount):''}</small></span><span class="or-st" data-st="${esc(o.id)}">Track${ic('chev')}</span></button>`).join('')}</div>`:''}
  <div class="or-acts"><button type="button" class="pb" data-go="track">${ic('search')}Track another order</button><button type="button" class="pb pb-y" data-go="sell">Sell a phone${ic('arrow')}</button></div>`;
}
async function ordersStatus(){
  if(!LIVE)return;
  for(const o of S.orders.filter(x=>x.live).slice(0,6)){
    try{const q={id:o.id},k=trackKey(o.id);if(k)q.k=k;const r=await apiGet('track',q);const el=$(`#pgBody [data-st="${CSS.escape(o.id)}"]`);if(!el)return;
      el.innerHTML=esc(r.cancelled?'Cancelled':(r.flow||[])[Math.max(0,r.step-1)]||'Booked')+ic('chev');el.classList.toggle('x',!!r.cancelled)}catch(_){}
  }
}
function pDelete(){
  const head=`<section class="pg-hero"><p class="pg-eyebrow">${ic('trash')}Legal &amp; account</p><h1>Delete my<br><span>account.</span></h1><p class="pg-lede">Ask us to remove your details from Recello. It takes a minute, and we confirm when it's done.</p></section>
  <div class="del-what"><div class="dw dw-go"><p class="fx-k">${ic('trash')}What we delete</p><ul><li>Your verified mobile number and sign-ins</li><li>Saved offers, enquiries and call-back requests</li><li>Marketing messages: you won't hear from us again</li></ul></div>
  <div class="dw"><p class="fx-k">${ic('doc')}What the law makes us keep</p><ul><li>Bills and records of devices you sold us, for tax and legal reasons</li><li>Records needed to settle a dispute or prevent fraud</li></ul></div></div>`;
  if(PGV.delDone)return head+`<div class="del-done">${ic('check')}<b>Request received</b><p>We'll confirm on WhatsApp or by SMS once your details are removed.</p><button type="button" class="pb" data-sm-act="close">Done</button></div>`;
  if(!S.vphone)return head+`<p class="del-need">First, confirm it's your number with a one-time code.</p>`+loginHtml();
  return head+`<form class="del-form" id="delForm" novalidate><p class="del-num">Account for <b class="pmono">${fmt10(S.vphone)}</b></p>
    <label class="fld"><span>Why are you leaving? <em>optional</em></span><textarea id="delWhy" rows="2" maxlength="300" placeholder="Anything we could do better"></textarea></label>
    <label class="pchk"><input type="checkbox" id="delLocal" checked><span>Also clear everything saved on this phone: orders list, saved address and sign-in</span></label>
    <label class="pchk"><input type="checkbox" id="delSure"><span>I understand this can't be undone</span></label>
    <em class="err" id="delErr" role="alert"></em><button class="pb pb-r pb-big" type="submit" id="delGo">${ic('trash')}Request deletion</button></form>`;
}

/* ---------- log in with OTP from a page (My profile, account deletion) ---------- */
const PFO={phone:'',demo:null,busy:false};
function pfoBoxes(){const i=$('#pfoCode');if(!i)return;const v=i.value.replace(/\D/g,'').slice(0,6);i.value=v;
  $$('#pfoBoxes span').forEach((s,n)=>{const was=s.textContent;s.textContent=v[n]||'';if(v[n]&&v[n]!==was){s.classList.remove('pop');void s.offsetWidth;s.classList.add('pop')}s.classList.toggle('on',n===Math.min(v.length,3)&&document.activeElement===i)})}
function pfoSteps(n){$$('#pfoSteps li').forEach((li,i)=>{li.classList.toggle('on',i===n);li.classList.toggle('done',i<n)})}
async function pfoSend(){
  if(PFO.busy)return;const ph=$('#pfoPhone').value.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,''),er=$('#pfoErr');
  if(!/^[6-9]\d{9}$/.test(ph)){er.textContent='Enter a 10-digit Indian mobile number.';$('#pfoPhone').focus();return}
  er.textContent='';PFO.busy=true;$('#pfoSend').disabled=true;
  try{
    if(LIVE){const r=await apiPost('otp_send',{phone:ph});PFO.demo=r.dev_code||null}else PFO.demo=String(1000+Math.floor(Math.random()*9000));
    PFO.phone=ph;$('#pfoPhoneF').hidden=true;$('#pfoCodeF').hidden=false;pfoSteps(1);$('#pfoTo').textContent=fmt10(ph);
    $('#pfoSms').innerHTML=PFO.demo?`${LIVE?'Test mode. ':'Preview, no text sent. '}Your code is <i>${esc(PFO.demo)}</i>`:'Your Recello code is <i>• • • •</i>';
    $('#pfoCode').value='';pfoBoxes();$('#pfoCode').focus();
  }catch(e){er.textContent=e.message||'Couldn\'t send the code. Try again.'}
  finally{PFO.busy=false;const b=$('#pfoSend');if(b)b.disabled=false}
}
async function pfoVerify(){
  if(PFO.busy)return;const code=$('#pfoCode').value.replace(/\D/g,''),er=$('#pfoCodeErr');if(code.length!==6)return;
  PFO.busy=true;er.textContent='';$('#pfoBoxes').classList.add('checking');
  try{
    if(LIVE){const r=await apiPost('otp_verify',{phone:PFO.phone,code});S.vtoken=r.token}else if(code!==PFO.demo)throw{message:'That code doesn\'t match. Check the message and try again.'};
    $('#pfoBoxes').classList.add('done');pfoSteps(2);await new Promise(r=>setTimeout(r,reduceMotion?0:420));
    S.vphone=PFO.phone;store.set('otp',{phone:S.vphone,token:S.vtoken||null,t:Date.now()});OTP.sent=false;clearInterval(OTP.timer);
    loadPrices();renderQuote();if(S.step===3)renderOffer();px('Lead',{content_name:'Log in',content_category:'otp'});
    toast('Logged in as '+fmt10(S.vphone));renderPage(PGV.cur);
  }catch(e){er.textContent=e.message||'Couldn\'t check the code. Try again.';$('#pfoCode').value='';pfoBoxes();const b=$('#pfoBoxes');b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake');$('#pfoCode').focus()}
  finally{PFO.busy=false;const b=$('#pfoBoxes');if(b)b.classList.remove('checking')}
}
function doLogout(){forgetPhone();store.set('contact',null);OTP.sent=false;clearInterval(OTP.timer);renderQuote();if(S.step===3)renderOffer();closeTop(()=>toast('Logged out on this phone'))}
async function delSubmit(){
  const er=$('#delErr');if(!$('#delSure').checked){er.textContent='Tick the last box to confirm.';$('#delSure').focus();return}
  er.textContent='';const b=$('#delGo');b.disabled=true;
  try{
    if(LIVE)await apiPost('request',{kind:'delete',token:S.vtoken,name:(store.get('contact',null)||{}).name||'',reason:$('#delWhy').value.trim(),city:S.city});
    if($('#delLocal').checked){['orders','contact','tkeys','nnSent','beatSent','called','myCode','ref'].forEach(k=>store.set(k,null));S.orders=[];renderRecent()}
    forgetPhone();renderQuote();PGV.delDone=true;renderPage('delete-account');toast('Account deletion requested');
  }catch(e){if(e.status===401){forgetPhone();renderPage('delete-account');return}er.textContent=e.message||'Could not send it. Please try again.'}
  finally{if(b.isConnected)b.disabled=false}
}

/* ---------- the thank-you after a booking: short, then straight to who is coming ---------- */
function thanksHtml(name,id,when,tech,agent){
  const who=tech?'technician':'pickup agent';
  // the agent card shows the pickup time itself, so it is said here only while the agent is being picked (or for a repair)
  return `<section class="thanks" aria-label="Thank you">
    <p class="thanks-k">Thank you${name?', '+esc(name):''}!</p>
    <p class="thanks-sign">${when&&(tech||!agent)?`${tech?'Your repair':'Your pickup'}: <b>${esc(when)}</b>. `:''}${agent?`Your ${who} is below, with their number.`:`We're assigning your ${who} now.`}</p>
  </section>`;
}

/* ---------- your pickup agent: name, number, "Recello verified", like the ID card they carry ---------- */
function agentCardHtml(a,x){
  x=x||{};const tech=a?a.role==='technician':!!x.tech,k=tech?'Your technician':'Your pickup agent';
  const waLine=x.wa?`<p class="agc-wa"><span class="tk" aria-hidden="true">✓✓</span>${a?`Booking details and your ${tech?'technician':'agent'}'s number sent to your WhatsApp`:'Booking details sent to your WhatsApp'}${x.phone?' · '+esc(String(x.phone).replace(/\D/g,'').slice(-10).replace(/^(\d{2})\d{6}(\d{2})$/,'$1xxxxxx$2')):''}</p>`:'';
  if(!a){
    if(!x.fresh)return '';
    return `<section class="agc" aria-label="${k}"><div class="agc-top"><span class="agc-k">${k}</span><span class="agc-pend">Assigning now</span></div>
      <div class="agc-id"><span class="agc-av wait" aria-hidden="true"><svg class="i"><use href="#i-user"/></svg></span><div><b class="agc-name">We're picking your ${tech?'technician':'agent'}</b><span class="agc-sub">${x.wa?'You\'ll get their name and number on WhatsApp the moment they\'re assigned.':'Track this order to see their name and number once they\'re assigned.'}</span></div></div>${waLine}</section>`;
  }
  const nm=String(a.name||'').trim(),first=nm.split(/\s+/)[0]||'your agent',ini=nm.split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'R';
  if(a.open===false)return `<p class="agc-done"><svg class="i"><use href="#i-check"/></svg><span>${tech?'Repaired by':'Picked up by'} <b>${esc(nm)}</b>${a.verified?' · Recello verified':''}</span></p>`;
  const ph=String(a.phone||'').replace(/\D/g,'').slice(-10),ok=/^[6-9]\d{9}$/.test(ph);
  return `<section class="agc" aria-label="${k}">
    <div class="agc-top"><span class="agc-k">${k}</span>${a.verified?'<span class="agc-ver"><svg class="i"><use href="#i-check"/></svg>Recello verified</span>':'<span class="agc-team">Recello team</span>'}</div>
    <div class="agc-id"><span class="agc-av" aria-hidden="true">${esc(ini)}${a.verified?'<i><svg class="i"><use href="#i-shield"/></svg></i>':''}</span>
      <div><b class="agc-name">${esc(nm)}</b><span class="agc-sub">${a.verified?'ID checked by Recello':'Recello '+(tech?'technician':'pickup agent')}</span>${ok?`<span class="agc-sub">+91 ${ph.slice(0,5)} ${ph.slice(5)}</span>`:''}</div></div>
    ${a.slot||x.slot?`<p class="agc-when"><svg class="i"><use href="#i-clock"/></svg><span>Coming <b>${esc(a.slot||x.slot)}</b></span></p>`:''}
    ${ok?`<div class="agc-acts"><a class="btn btn-primary btn-sm" href="tel:+91${ph}"><svg class="i"><use href="#i-call"/></svg>Call ${esc(first)}</a><a class="btn btn-ghost btn-sm" href="https://wa.me/91${ph}" target="_blank" rel="noopener"><svg class="i"><use href="#i-chat"/></svg>WhatsApp</a></div>`:''}
    <p class="agc-safe"><svg class="i"><use href="#i-shield"/></svg><span>For your safety, hand over your phone only to <b>${esc(first)}</b>. Ask to see the Recello ID card. The name must match.</span></p>
    ${waLine}
  </section>`;
}

/* ---------- cookie notice: once per browser ---------- */
(()=>{const b=$('#ckBar');if(!b||store.get('ck',0))return;setTimeout(()=>{b.hidden=false},1800);
  $('#ckOk').addEventListener('click',()=>{b.hidden=true;store.set('ck',1)});b.addEventListener('click',e=>{if(e.target.closest('[data-page]')){b.hidden=true;store.set('ck',1)}})})();

/* ---------- clicks, forms and keys ---------- */
document.addEventListener('click',e=>{
  const t=e.target;
  const pg=t.closest('[data-page]');if(pg){e.preventDefault();openPage(pg.dataset.page);return}
  const a=t.closest('a[href^="#/"]');if(a){const id=a.getAttribute('href').slice(2);if(PAGES[id]){e.preventDefault();openPage(id)}return}
  if(!t.closest('#sideMenu,#pageView'))return;
  const go=t.closest('[data-go]');if(go){e.preventDefault();const id=go.dataset.go;closeTop(()=>goTo(id));return}
  const tr=t.closest('[data-track]');if(tr){const id=tr.dataset.track;closeTop(()=>{$('#trackIn').value=id;runTrack();goTo('track')});return}
  const toc=t.closest('[data-toc]');if(toc){const s=$('#lg-'+toc.dataset.toc);if(s)s.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});return}
  const ac=t.closest('[data-sm-act]');if(ac){const k=ac.dataset.smAct;
    if(k==='city')closeTop(()=>openCity());else if(k==='chat')closeTop(()=>openChat());else if(k==='call')closeTop(()=>openCall('contact'));
    else if(k==='logout')doLogout();else if(k==='close')closeTop();return}
  if(t.closest('[data-sm-close]')){closeTop();return}
  if(t.closest('#pfoChange')){$('#pfoCodeF').hidden=true;$('#pfoPhoneF').hidden=false;pfoSteps(0);$('#pfoPhone').value=PFO.phone;$('#pfoPhone').focus();return}
  if(t.closest('#pfoBoxes')){const i=$('#pfoCode');if(i)i.focus()}
});
document.addEventListener('submit',e=>{const f=e.target;
  if(f.id==='pfoPhoneF'){e.preventDefault();pfoSend()}
  else if(f.id==='pfoCodeF'){e.preventDefault();pfoVerify()}
  else if(f.id==='delForm'){e.preventDefault();delSubmit()}
  else if(f.id==='pfEdit'){e.preventDefault();const pin=$('#pfePin').value.replace(/\D/g,''),pay=$('#pfePay').value==='cash'?'cash':'upi',er=$('#pfeErr');
    if(pin&&!/^[1-9]\d{5}$/.test(pin)){er.textContent='Enter a 6-digit pincode, or leave it empty.';return}
    er.textContent='';const c=store.get('contact',null)||{};const nc={...c,name:$('#pfeName').value.trim(),addr:$('#pfeAddr').value.trim(),pin,payout:pay,phone:c.phone||S.vphone||''};delete nc.upi;store.set('contact',nc);S.pickup.payout=pay;
    toast('Saved on this phone');renderPage('profile')}
});
document.addEventListener('input',e=>{if(e.target.id==='pfoCode'){pfoBoxes();$('#pfoCodeErr').textContent='';if(e.target.value.length===6)pfoVerify()}});
document.addEventListener('focusin',e=>{if(e.target.id==='pfoCode')pfoBoxes()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&PGV.cur&&!document.querySelector('.modal:not([hidden]),.nudge:not([hidden])')){e.preventDefault();closeTop()}});
$('#pgBack').addEventListener('click',()=>closeTop());
$('#pgShare').addEventListener('click',async()=>{
  const id=PGV.cur,url=location.origin+location.pathname+'#/'+id,title=(PAGES[id]||{}).t||'Recello';
  try{if(navigator.share){await navigator.share({title:title+' · Recello',url});return}}catch(_){return}
  try{await navigator.clipboard.writeText(url);toast('Link copied')}catch(_){toast(url)}
});
paintShared();
/* links straight to a page (recello.in/#/about, #/privacy…) */
setTimeout(()=>{const m=location.hash.match(/^#\/([a-z-]+)$/);if(m&&PAGES[m[1]]){try{history.replaceState(null,'',location.pathname+location.search)}catch(_){}openPage(m[1])}},0);
/* a section address typed or opened while the sell steps fill a phone screen (#track, #repair, #faq…): leave the steps and go there */
addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(/^[a-z]+$/.test(h)&&h!=='sell'&&document.body.classList.contains('funnel')&&document.getElementById(h))goTo(h)});
addEventListener('hashchange',()=>{const m=location.hash.match(/^#\/([a-z-]+)$/);if(!m||!PAGES[m[1]]||PGV.cur===m[1])return;
  if(m[1]==='delete-account')PGV.delDone=false;showPage(m[1]);PGV.pushed=true;try{history.replaceState({pg:m[1]},'',location.hash)}catch(_){}});

loadLive();
})();
