/* Creative layer: the hero's touch-test grid and the loop arrow's scroll turn */
(function(){
  const hero=document.querySelector('.hero'),cv=document.getElementById('heroGrid');
  if(!hero||!cv||!cv.getContext)return;
  const ctx=cv.getContext('2d');
  const RM=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  /* The faint squares are one tiled background (free to scroll). The canvas only paints the yellow cells that
     light up, and only over the top of the hero, so it stays small on tall phone layouts. A finger scrolling the
     page does not repaint it; a tap lights the squares around the finger. */
  let W=0,H=0,CH=0,dpr=1,S=44,G=5,cols=0,rows=0,ox=0,oy=0,lit=new Float32Array(0),raf=0,last=null,intro=0;
  const rr=(x,y,w,h,r)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h)};
  function size(){
    const b=hero.getBoundingClientRect();
    dpr=Math.min(2,window.devicePixelRatio||1);W=Math.round(b.width);H=Math.round(b.height);
    S=W<640?34:46;G=W<640?4:6;
    const step=S+G;CH=Math.min(H,Math.max(760,Math.round(innerHeight*1.3)));
    cols=Math.ceil(W/step)+1;rows=Math.ceil(CH/step)+1;
    ox=Math.round((W-(cols*step-G))/2);oy=-Math.round(S*.35);
    hero.style.backgroundImage='url("data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${step}" height="${step}"><rect width="${S}" height="${S}" rx="9" fill="#fff" fill-opacity=".06"/></svg>`)+'")';
    hero.style.backgroundSize=step+'px '+step+'px';hero.style.backgroundPosition=ox+'px '+oy+'px';
    cv.style.height=CH+'px';cv.width=W*dpr;cv.height=CH*dpr;lit=new Float32Array(cols*rows);draw();
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,CH);
    const step=S+G,now=performance.now();let any=false;
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const k=r*cols+c;
      if(intro){const d=(c+r)*38,t=now-intro-d;if(t>0&&t<520){const w=Math.sin(t/520*Math.PI);if(w>lit[k])lit[k]=w*.75}}
      const v=lit[k];
      if(v>.012){any=true;const x=ox+c*step,y=oy+r*step;
        const side=Math.min(1,Math.max(0,(x/W-.08)/.55)),f=W<900?.55:.32+.68*side;
        ctx.fillStyle='rgba(250,238,28,'+(v*.92*f).toFixed(3)+')';rr(x,y,S,S,9);ctx.fill();
      }
    }
    if(intro&&now-intro>(cols+rows)*38+600)intro=0;
    return any||!!intro;
  }
  function loop(){raf=0;if(!RM)for(let k=0;k<lit.length;k++)lit[k]*=.952;if(draw()&&!RM)raf=requestAnimationFrame(loop)}
  function kick(){if(RM){draw();return}if(!raf)raf=requestAnimationFrame(loop)}
  function light(px,py,v){
    const step=S+G,c=Math.floor((px-ox)/step),r=Math.floor((py-oy)/step);
    if(c<0||r<0||c>=cols||r>=rows)return;const k=r*cols+c;lit[k]=Math.max(lit[k],v==null?1:v);
  }
  function trail(px,py){
    if(last){const dx=px-last[0],dy=py-last[1],n=Math.min(24,Math.ceil(Math.hypot(dx,dy)/(S*.5)));
      for(let i=1;i<=n;i++)light(last[0]+dx*i/n,last[1]+dy*i/n)}
    else light(px,py);
    last=[px,py];kick();
  }
  hero.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'&&e.pointerType!=='pen')return;const b=hero.getBoundingClientRect();trail(e.clientX-b.left,e.clientY-b.top)},{passive:true});
  hero.addEventListener('pointerleave',()=>{last=null});
  hero.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch'||document.documentElement.classList.contains('hs-on'))return;const b=hero.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top,st=S+G;
    light(x,y,1);[[st,0],[-st,0],[0,st],[0,-st]].forEach(([a,c])=>light(x+a,y+c,.55));kick()},{passive:true});
  size();
  if('ResizeObserver' in window)new ResizeObserver(()=>{const b=hero.getBoundingClientRect();if(Math.round(b.width)!==W||Math.abs(b.height-H)>40)size()}).observe(hero);
  else addEventListener('resize',size);
  const startIntro=()=>{if(!RM){intro=performance.now()+120;kick()}};
  if(document.readyState==='complete')setTimeout(startIntro,200);else addEventListener('load',()=>setTimeout(startIntro,200),{once:true});

  /* endless decorations (scanner beam, seal, ticker, live dots) rest while off screen */
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver(es=>es.forEach(e=>e.target.classList.toggle('anim-rest',!e.isIntersecting)),{rootMargin:'80px 0px'});
    document.querySelectorAll('.beam,.seal-ring,.ticker,.sold-dot,.live .dot').forEach(el=>io.observe(el));
  }

  /* the yellow loop turns a little as you scroll */
  const lp=document.querySelector('.loop');
  if(lp&&!RM){let q=0;addEventListener('scroll',()=>{if(q)return;q=requestAnimationFrame(()=>{q=0;if(scrollY<H+200)lp.style.setProperty('--spin',(scrollY*.12).toFixed(1)+'deg')})},{passive:true})}
})();
