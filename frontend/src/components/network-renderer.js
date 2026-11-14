// NetworkCanvas 내부만 관리하는 통신 구조 미리보기다. 실제 실행 결과나 비잔틴 정체를 표시하지 않는다.
export function mountNetwork(root,onLayerChange){
// 화면의 연결선은 논리적인 원형 통신 관계를 표현한다.
const neighbours=n=>({left:n===1?5:n-1,right:n===5?1:n+1});
const $=selector=>root.querySelector(selector);
let selected='god',playing=false,frame=null;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const stage=$('#network-stage'),svg=$('#edges'),preview=$('#preview-button');
const playIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 8 6-8 6Z"/></svg>';
const stopIcon='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5h10v10H5Z"/></svg>';
const arrow='<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12m-4-4 4 4-4 4"/></svg>';
const doubleArrow='<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12M6 6 3 9l3 3m6-6 3 3-3 3"/></svg>';

$('#city-nodes').innerHTML=[1,2,3,4,5].map(city=>`<button class="city-node" type="button" data-city="${city}" aria-label="도시 ${city} 연결 보기" aria-pressed="${city===selected}" aria-describedby="keyboard-help"><span class="node-index">0${city}</span><span class="node-copy"><span class="city-label">도시 ${city}</span><span class="node-subtitle">${city===selected?'선택됨':'이웃 2개 연결'}</span></span><span class="node-port" aria-hidden="true"></span><svg class="node-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg></button>`).join('')+'<span id="keyboard-help" class="sr-only">Tab으로 이동하고 Enter로 선택하세요. 선택 후 좌우 방향키로 다른 도시를 탐색할 수 있습니다.</span>';

svg.innerHTML=`<defs>
  <marker id="ring-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse"><path d="m2 2 6 3-6 3" fill="none" stroke="#7a8795" stroke-width="1.4"/></marker>
  <marker id="active-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="m2 2 6 3-6 3" fill="none" stroke="#3758b5" stroke-width="1.5"/></marker>
  <marker id="hint-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="m2 2 6 3-6 3" fill="none" stroke="#93632c" stroke-width="1.4"/></marker>
  </defs>${[1,2,3,4,5].map(city=>`<path class="edge message" id="message-${city}" data-from="${city}" data-to="${neighbours(city).right}" marker-start="url(#ring-arrow)" marker-end="url(#ring-arrow)"/>`).join('')}${[1,2,3,4,5].map(city=>`<path class="edge hint" id="hint-${city}" data-from="god" data-to="${city}" marker-end="url(#hint-arrow)"/>`).join('')}<g id="packets"></g>`;

function geometry(){
  stopPlayback();
  const width=stage.clientWidth,height=stage.clientHeight,cx=width/2,cy=height/2+8;
  const radius=Math.min((height-76)/2,(width-230)/2,274);
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const nodeWidth=$('.city-node').offsetWidth,nodeHeight=$('.city-node').offsetHeight;
  const sourceWidth=$('#god-node').offsetWidth,sourceHeight=$('#god-node').offsetHeight;
  // 72도 간격으로 정오각형을 만들고 연결선 끝은 노드 경계에서 잘라 글자와 겹치지 않게 한다.
  const points=Array.from({length:5},(_,i)=>({x:cx+radius*Math.cos((-90+i*72)*Math.PI/180),y:cy+radius*Math.sin((-90+i*72)*Math.PI/180)}));
  const clip=(a,b,halfWidth,halfHeight)=>{const dx=b.x-a.x,dy=b.y-a.y;const t=Math.min(halfWidth/Math.max(Math.abs(dx),.0001),halfHeight/Math.max(Math.abs(dy),.0001));return {x:a.x+dx*t,y:a.y+dy*t};};
  const line=(a,b)=>`M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  points.forEach((point,i)=>{
    const node=$(`[data-city="${i+1}"]`);node.style.left=point.x+'px';node.style.top=point.y+'px';
    const next=points[(i+1)%5];
    $(`#message-${i+1}`).setAttribute('d',line(clip(point,next,nodeWidth/2+5,nodeHeight/2+5),clip(next,point,nodeWidth/2+5,nodeHeight/2+5)));
    const origin={x:cx,y:cy};
    $(`#hint-${i+1}`).setAttribute('d',line(clip(origin,point,sourceWidth/2+1,sourceHeight/2+1),clip(point,origin,nodeWidth/2+5,nodeHeight/2+5)));
  });
  $('#god-node').style.left=cx+'px';$('#god-node').style.top=cy+'px';
}

function updateSelection(next){
  stopPlayback();selected=next;
  root.querySelectorAll('.city-node').forEach(node=>{
    const active=Number(node.dataset.city)===selected;
    node.setAttribute('aria-pressed',String(active));node.querySelector('.node-subtitle').textContent=active?'선택됨':'이웃 2개 연결';
  });
  $('#god-node').setAttribute('aria-pressed',String(selected==='god'));
  root.querySelectorAll('.edge').forEach(edge=>{
    const active=edge.classList.contains('hint')?(selected==='god'||Number(edge.dataset.to)===selected):(Number(edge.dataset.from)===selected||Number(edge.dataset.to)===selected);
    edge.classList.toggle('active',active);
    if(edge.classList.contains('message')){edge.setAttribute('marker-start',`url(#${active?'active-arrow':'ring-arrow'})`);edge.setAttribute('marker-end',`url(#${active?'active-arrow':'ring-arrow'})`);}
  });
  const content=$('#connection-content');
  if(selected==='god'){
    $('.selection-caption').textContent='정보의 출처';$('#selection-title').textContent='God';
    content.innerHTML='<p class="god-description">실제 상태는 실험 시작 시 한 번 정해집니다.<br>God은 매 턴 각 도시에 개별 힌트를 전달합니다.</p>';
  }else{
    const {left,right}=neighbours(selected);$('.selection-caption').textContent='선택한 도시';$('#selection-title').textContent='도시 0'+selected;
    content.innerHTML=`<div class="connection-row"><span>힌트 수신</span><div class="route-parts"><button type="button" class="path-link" data-select="god">God</button>${arrow}<span class="current-city">도시 0${selected}</span></div></div><div class="connection-row"><span>메시지 교환</span><div class="route-parts"><button type="button" class="path-link" data-select="${left}">도시 0${left}</button>${doubleArrow}<span class="current-city">도시 0${selected}</span>${doubleArrow}<button type="button" class="path-link" data-select="${right}">도시 0${right}</button></div></div>`;
    content.querySelectorAll('[data-select]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.select==='god'?'god':Number(button.dataset.select);updateSelection(next);(next==='god'?$('#god-node'):$(`[data-city="${next}"]`)).focus({preventScroll:true});}));
  }
}

root.querySelectorAll('.city-node').forEach(node=>{
  node.addEventListener('click',()=>updateSelection(Number(node.dataset.city)));
  node.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const current=Number(node.dataset.city);const next=event.key==='Home'?1:event.key==='End'?5:event.key==='ArrowRight'?neighbours(current).right:neighbours(current).left;
    updateSelection(next);$(`[data-city="${next}"]`).focus({preventScroll:true});
  });
});
$('#god-node').addEventListener('click',()=>updateSelection('god'));
function setLayer(next){stopPlayback();stage.dataset.layer=next;onLayerChange?.(next);}
root.querySelectorAll('button[data-layer]').forEach(button=>button.addEventListener('click',()=>setLayer(button.dataset.layer)));

function setPlaybackText(text,active=false){$('#playback-status').textContent=text;$('#playback-status').classList.toggle('playing',active);}
function stopPlayback(message){
  if(frame!==null)cancelAnimationFrame(frame);frame=null;playing=false;
  $('#packets').replaceChildren();preview.setAttribute('aria-pressed','false');preview.innerHTML=playIcon+'<span>전달 과정 보기</span>';
  setPlaybackText(message||'연결 구조 미리보기입니다. 이 화면은 연결 구조만 보여줍니다.');
}
function play(){
  if(playing){stopPlayback('재생을 멈췄습니다. 도시나 경로를 선택해 다시 확인할 수 있습니다.');return;}
  setLayer('all');
  const city=selected;
  if(reducedMotion.matches){setPlaybackText(city==='god'?'God은 현재 턴에 다섯 도시 모두에게 힌트를 줍니다. 각 도시의 메시지는 다음 턴에 양쪽 이웃에게 도착합니다.':'현재 턴에 God의 힌트를 받고, 이웃에게 보낸 메시지는 다음 턴에 도착합니다. 동작 줄이기 설정으로 이동 효과를 생략했습니다.');return;}
  const specs=city==='god'?[1,2,3,4,5].map(n=>({path:`hint-${n}`,from:0,to:1000,reverse:false,hint:true})):[{path:`hint-${city}`,from:0,to:1000,reverse:false,hint:true},{path:`message-${city}`,from:1200,to:2500,reverse:false,hint:false},{path:`message-${neighbours(city).left}`,from:1200,to:2500,reverse:true,hint:false}];
  const paths=specs.map(spec=>{const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.setAttribute('r','4.5');dot.setAttribute('class',`packet ${spec.hint?'hint-packet':''}`);dot.style.display='none';$('#packets').append(dot);const path=$('#'+spec.path);return {...spec,dot,path,length:path.getTotalLength()};});
  playing=true;preview.setAttribute('aria-pressed','true');preview.innerHTML=stopIcon+'<span>재생 멈추기</span>';
  const started=performance.now();let announced=-1;const finish=city==='god'?1200:2700;
  function tick(now){
    const elapsed=now-started,phase=elapsed<1200?0:1;
    if(phase!==announced){announced=phase;setPlaybackText(phase===0?(city==='god'?'현재 턴 · God이 각 도시에 힌트를 전달합니다.':`현재 턴 · God의 힌트가 도시 ${city}에 도착합니다.`):`다음 턴 · 도시 ${city}이 보낸 메시지가 양쪽 이웃에 도착합니다.`,true);}
    paths.forEach(spec=>{const visible=elapsed>=spec.from&&elapsed<=spec.to;spec.dot.style.display=visible?'':'none';if(!visible)return;let progress=(elapsed-spec.from)/(spec.to-spec.from);if(spec.reverse)progress=1-progress;const point=spec.path.getPointAtLength(spec.length*progress);spec.dot.setAttribute('cx',point.x);spec.dot.setAttribute('cy',point.y);});
    if(elapsed<finish)frame=requestAnimationFrame(tick);else stopPlayback('전달 과정을 확인했습니다. 이 화면은 연결 구조만 보여줍니다.');
  }
  frame=requestAnimationFrame(tick);
}
preview.addEventListener('click',play);
const motionChange=()=>stopPlayback(); reducedMotion.addEventListener('change',motionChange);
const visibility=()=>{if(document.hidden)stopPlayback();}; document.addEventListener('visibilitychange',visibility);


updateSelection('god');geometry();const observer=new ResizeObserver(geometry);observer.observe(stage);
return {setLayer, destroy:()=>{stopPlayback();observer.disconnect();reducedMotion.removeEventListener('change',motionChange);document.removeEventListener('visibilitychange',visibility);root.replaceChildren();}};
}
