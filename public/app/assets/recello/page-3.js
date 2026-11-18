/* Phone layout: swipeable test deck and the floating price ticket */
(function(){
  const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const deck=document.querySelector('#test .tests');
  if(deck){
    const cards=[...deck.querySelectorAll('.tcard')];
    const arrow='<svg class="i"><use href="#i-arrow"/></svg>';
    const bar=document.createElement('div');bar.className='deck-bar';
    bar.innerHTML='<p class="deck-count">Test <b id="deckN">1</b> of '+cards.length+'<small>Swipe the cards to move between tests</small></p>'+
      '<div class="deck-nav"><button type="button" class="deck-btn" data-d="-1" aria-label="Previous test">'+arrow+'</button><button type="button" class="deck-btn" data-d="1" aria-label="Next test">'+arrow+'</button></div>'+
      '<div class="deck-dots" role="group" aria-label="Jump to a test"></div>';
    deck.parentNode.insertBefore(bar,deck);
    const dots=bar.querySelector('.deck-dots'),nEl=bar.querySelector('#deckN'),prev=bar.querySelector('[data-d="-1"]'),next=bar.querySelector('[data-d="1"]');
    let cur=0;
    cards.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.className='deck-dot';b.addEventListener('click',()=>go(i));dots.appendChild(b)});
    function go(i){
      i=Math.max(0,Math.min(cards.length-1,i));
      const pad=parseFloat(getComputedStyle(deck).paddingLeft)||0;
      deck.scrollTo({left:cards[i].offsetLeft-pad,behavior:RM?'auto':'smooth'});
    }
    function mark(){
      [...dots.children].forEach((d,i)=>d.setAttribute('aria-current',i===cur?'true':'false'));
      nEl.textContent=cur+1;prev.disabled=cur===0;next.disabled=cur===cards.length-1;
    }
    function paint(){
      cards.forEach((c,i)=>{
        const st=c.querySelector('[data-st]'),h=c.querySelector('h3'),d=dots.children[i];
        const s=st?['pass','fail','skip','run'].find(k=>st.classList.contains(k)):null;
        if(s)d.dataset.s=s;else delete d.dataset.s;
        d.setAttribute('aria-label',(h?h.textContent:'Test')+': '+(st?st.textContent:''));
      });
    }
    let q=0;
    deck.addEventListener('scroll',()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;
      const x=deck.scrollLeft+(parseFloat(getComputedStyle(deck).paddingLeft)||0);let best=0,bd=Infinity;
      cards.forEach((c,i)=>{const dd=Math.abs(c.offsetLeft-x);if(dd<bd){bd=dd;best=i}});
      if(deck.scrollLeft+deck.clientWidth>=deck.scrollWidth-4)best=cards.length-1;
      if(best!==cur){cur=best;mark()}})},{passive:true});
    prev.addEventListener('click',()=>go(cur-1));next.addEventListener('click',()=>go(cur+1));
    cards.forEach(c=>{const st=c.querySelector('[data-st]');if(st)new MutationObserver(paint).observe(st,{attributes:true,attributeFilter:['class'],childList:true,characterData:true,subtree:true})});
    paint();mark();
  }

  const t=document.getElementById('mTicket'),wz=document.getElementById('wizard'),qc=document.querySelector('.quote');
  if(t&&wz&&qc){
    const P=document.getElementById('qcPrice'),L=document.getElementById('qcLbl'),D=document.getElementById('qcDev');
    const mP=document.getElementById('mtPrice'),mL=document.getElementById('mtLbl');
    const sync=()=>{const n=D&&D.querySelector('b');mP.textContent=P.textContent;mL.textContent=(L.textContent||'Your offer')+(n?' · '+n.textContent:'')};
    const mo=new MutationObserver(sync);mo.observe(P,{childList:true,characterData:true,subtree:true});mo.observe(L,{childList:true,characterData:true,subtree:true});if(D)mo.observe(D,{childList:true,subtree:true,characterData:true});
    sync();
    const mq=matchMedia('(max-width:980px)');let inWz=false,inQ=false;
    const show=()=>{const on=mq.matches&&inWz&&!inQ;t.classList.toggle('on',on);t.setAttribute('aria-hidden',on?'false':'true');t.tabIndex=on?0:-1};
    if('IntersectionObserver' in window){
      new IntersectionObserver(es=>{es.forEach(e=>{inWz=e.isIntersecting});show()},{rootMargin:'-35% 0px -20% 0px'}).observe(wz);
      new IntersectionObserver(es=>{es.forEach(e=>{inQ=e.isIntersecting});show()},{threshold:.35}).observe(qc);
    }
    if(mq.addEventListener)mq.addEventListener('change',show);
    t.addEventListener('click',()=>qc.scrollIntoView({behavior:RM?'auto':'smooth',block:'center'}));
    show();
  }
})();
