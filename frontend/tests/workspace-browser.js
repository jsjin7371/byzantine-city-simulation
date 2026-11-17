// Playwright CLI: run-code --filename=tests/workspace-browser.js
// 화면·가독성·메뉴·입력 검증. 목록/조회 오류만 Mock이며 실제 엔진 검증과 별개다.
// eslint-disable-next-line no-unused-expressions -- Playwright CLI entry point.
async page => {
 const results=[];
 try {
  results.push(await (async () => {
const checks=[];
 const check=(name,ok)=>{checks.push({name,pass:ok});if(!ok)throw Error(name)};
 await page.goto('http://127.0.0.1:8080/#/setup');await page.reload();
 for(const [width,height] of [[1024,600],[1280,650],[1280,720],[1366,681],[1440,765],[1536,776],[1920,993],[2560,1320]]) {
  await page.setViewportSize({width,height});await page.locator('#god-node').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  check('no document clipping '+width+'x'+height,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));
  const run=await page.locator('#run-button').boundingBox();check('run visible '+width+'x'+height,run.y>=0&&run.y+run.height<=height);
  await page.locator('[data-city="2"]').click();await page.locator('#preview-button').scrollIntoViewIfNeeded();
  const preview=await page.locator('#preview-button').boundingBox();check('city inspector reachable '+width+'x'+height,preview.y>=0&&preview.y+preview.height<=height);
  await page.getByRole('button',{name:'이름과 Seed 설정'}).click();await page.locator('#seed').fill('123');
  check('seed reachable '+width+'x'+height,await page.locator('#seed').inputValue()==='123');
  const r=await page.locator('#run-button').boundingBox();check('run stays visible with expanded settings '+width+'x'+height,r.y>=0&&r.y+r.height<=height);
  await page.getByRole('button',{name:'이름과 Seed 설정'}).click();
  await page.locator('#god-node').click();
  await page.screenshot({path:'integration-flex-'+width+'x'+height+'.png'});
 }
 return checks;

  })());
  results.push(await (async () => {
await page.goto('http://127.0.0.1:8080/#/setup'); await page.reload();
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#god-node').waitFor();await page.evaluate(()=>document.fonts.ready);
 const contrast=await page.evaluate(()=>{
  const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
  const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  return ['h1','.page-title p','.canvas-caption','.city-label','.node-subtitle','.node-index','.god-node strong','.god-node>span','.field-hint','.byzantine-help','.rate-help','.rate-input input','#run-button','.selection-caption','.god-description','.playback-status'].map(selector=>{
   const n=document.querySelector(selector);const fg=rgb(getComputedStyle(n).color);let parent=n,bg;
   while(parent){const color=rgb(getComputedStyle(parent).backgroundColor);if(color.length===3||color[3]===1){bg=color;break}parent=parent.parentElement}
   const a=lum(fg),b=lum(bg||[10,14,26]);return {selector,ratio:+((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toFixed(2)};
  });
 });
 if(contrast.some(s=>s.ratio<4.5))throw Error(JSON.stringify(contrast));
 return {contrast,desktopSizes:[1280,1440,1920],bottomClipping:false};

  })());
  results.push(await (async () => {
const checks=[],errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const check=(name,ok)=>{checks.push({name,pass:ok});if(!ok)throw Error(name)};
 await page.route('**/api/experiments?**',route=>route.fulfill({json:[]}));
 await page.goto('http://127.0.0.1:8080/#/setup');await page.locator('#turns').fill('7');
 for(const [width,height] of [[1280,720],[1440,765],[1920,1080]]) {
  await page.setViewportSize({width,height});
  let reference;
  for(const [route,label] of [['setup','실험 설정'],['results','결과 탐색'],['compare','실험 비교']]) {
   await page.getByRole('navigation',{name:'주요 메뉴'}).getByRole('link',{name:label,exact:true}).click();
   await page.waitForURL('**/#/'+route);await page.locator(`.site-navigation a[aria-current="page"][href="#/${route}"]`).waitFor();await page.evaluate(()=>document.fonts.ready);
   check('single header '+route+width,await page.locator('.site-header').count()===1);
   check('active menu '+route+width,await page.locator('.site-navigation [aria-current=page]').innerText()===label);
   const style=await page.locator('.site-header').evaluate(n=>{const s=getComputedStyle(n);return {height:n.getBoundingClientRect().height,bg:s.backgroundColor,color:s.color,font:s.fontFamily,padding:s.paddingLeft}});
   reference??=style;check('same header '+route+width,JSON.stringify(style)===JSON.stringify(reference));
   check('no horizontal overflow '+route+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(route==='setup'){check('draft preserved '+width,await page.locator('#turns').inputValue()==='7');check('run fits '+width,await page.locator('#run-button').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight));}
   await page.screenshot({path:'integration-shared-'+route+'-'+width+'.png',fullPage:true});
  }
 }
 await page.getByRole('link',{name:'결과 탐색',exact:true}).click();
 await page.unroute('**/api/experiments?**');await page.route('**/api/**',route=>route.fulfill({status:503,json:{detail:'테스트: 결과 목록 조회 실패'}}));
 await page.reload();await page.getByText('테스트: 결과 목록 조회 실패',{exact:true}).waitFor();
 check('error uses shared color',await page.locator('.rs-list .rs-error').evaluate(n=>getComputedStyle(n).color==='rgb(255, 158, 172)'));
 await page.unroute('**/api/**');
 await page.getByRole('link',{name:'실험 설정',exact:true}).click();
 check('no JS errors',errors.length===0);
 return {checks,errors};

  })());
  results.push(await (async () => {
const checks=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const check=(name,ok)=>{checks.push({name,pass:ok});if(!ok)throw Error(name)};
 await page.unroute('**/api/**');await page.goto('http://127.0.0.1:8080/#/setup');await page.reload();
 await page.getByLabel('힌트 경로',{exact:true}).click();
 check('hint filter',await page.locator('#network-stage').getAttribute('data-layer')==='hint');
 await page.locator('#preview-button').click();
 check('preview synchronizes filter',await page.getByLabel('전체 경로',{exact:true}).getAttribute('data-state')==='on');
 await page.locator('[data-city="1"]').click();await page.locator('[data-city="1"]').press('ArrowRight');
 check('node keyboard',await page.locator('#selection-title').innerText()==='도시 02');
 await page.locator('#preview-button').click();
 await page.waitForFunction(()=>document.querySelectorAll('#packets circle').length>0);
 await page.locator('[data-city="3"]').click();
 check('selection stops playback',await page.locator('#preview-button').getAttribute('aria-pressed')==='false'&&await page.locator('#packets circle').count()===0);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#preview-button').click();
 check('reduced motion explains without animation',(await page.locator('#playback-status').innerText()).includes('동작 줄이기')&&await page.locator('#packets circle').count()===0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.getByRole('slider',{name:'센서 오류율 슬라이더'}).focus();await page.keyboard.press('ArrowRight');
 check('slider synchronizes input',await page.locator('#sensor_error').inputValue()==='10.1');
 await page.getByRole('button',{name:'이름과 Seed 설정'}).click();await page.locator('#seed').fill('-1');
 await page.getByRole('button',{name:'이름과 Seed 설정'}).click();await page.getByRole('button',{name:'입력 확인',exact:true}).click();
 await page.locator('#seed').waitFor();check('invalid hidden seed revealed',await page.locator('#seed').getAttribute('aria-invalid')==='true');
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('button',{name:'이름과 Seed 설정'}).click();
 await page.getByRole('button',{name:'센서 오류율 도움말',exact:true}).hover();await page.getByRole('tooltip').waitFor();check('tooltip',await page.getByRole('tooltip').isVisible());
 await page.mouse.move(10,10);
 check('no JS errors',errors.length===0);
 await page.setViewportSize({width:1440,height:900});
 return {checks,errors};

  })());
 // 결과 탐색은 기존 Docker DB의 완료된 실험으로 검증한다. 결과 API 응답을 가짜로 만들지 않는다.
 results.push(await (async () => {
  await page.goto('http://127.0.0.1:8080/?workspace-results-check=1#/results'); await page.reload();
  const response = await page.request.get('http://127.0.0.1:8080/api/experiments?limit=50');
  if (!response.ok()) throw Error('실제 결과 API 연결 실패');
  const experiments = await response.json();
  const experiment = experiments.find(row => row.status === 'completed');
  if (!experiment) return { results: 'skipped: 완료된 실험이 없어 실제 데이터 검증을 생략했습니다.' };
  await page.locator('.rs-experiment').filter({hasText: '#' + experiment.id + '\n'}).first().click();
  await page.getByTestId('city-overview').waitFor();
  const summary = await (await page.request.get(`http://127.0.0.1:8080/api/experiments/${experiment.id}/turns`)).json();
  if (await page.locator('.rs-chart g[role=button]').count() !== summary.turns.length) throw Error('그래프 턴 누락');
  const last = summary.turns.at(-1);
  await page.locator('.rs-chart g[role=button]').last().press('Enter');
  await page.waitForFunction(turn => document.querySelector('.rs-network').dataset.turn === String(turn), last.turn);
  if (await page.getByTestId('turn-accuracy').innerText() !== `${Number((last.accuracy * 100).toFixed(2))}%`) throw Error('선택 정확도 불일치');
  // 네트워크의 비잔틴 강조와 누락·조작 표시, 표의 색은 선택 턴의 저장된 결과와 일치해야 한다.
  const detail = await (await page.request.get('http://127.0.0.1:8080/api/experiments/'+experiment.id+'/turns/'+last.turn)).json();
  const sent = status => detail.cities.reduce((n, c) => n + (c.to_left === status) + (c.to_right === status), 0);
  const byzantine = detail.cities.filter(c => c.is_byzantine).length;
  if (await page.locator('.rs-result-node.is-byzantine').count() !== byzantine) throw Error('비잔틴 도시 강조 불일치');
  if (await page.locator('.rs-message').count() !== detail.cities.length * 2) throw Error('방향별 메시지 선 누락');
  for (const status of ['dropped', 'flipped']) {
   if (await page.locator(`.rs-message[data-send=${status}]`).count() !== sent(status)) throw Error('메시지 '+status+' 선 불일치');
   if (await page.locator(`.rs-send-badge[data-send=${status}]`).count() !== sent(status)) throw Error('메시지 '+status+' 표시 불일치');
   if (await page.locator(`.rs-city-table td[data-tone=${status}]`).count() !== sent(status)) throw Error('표의 '+status+' 색 불일치');
  }
  if (await page.locator('.rs-city-table td[data-tone=byzantine]').count() !== byzantine) throw Error('표의 비잔틴 색 불일치');
  if (experiment.created_at && await page.locator('.rs-experiment[aria-pressed=true] .rs-created').count() !== 1) throw Error('생성 시각 누락');
  await page.getByRole('button', {name:'도시 2 상세 보기', exact:true}).click();
  await page.getByTestId('city-detail').waitFor();
  await page.getByRole('button', {name:'전체 턴 표', exact:true}).click();
  await page.waitForFunction(count => document.querySelectorAll('.rs-all-table tbody tr').length === count, summary.turns.length * 5);
  await page.getByRole('button', {name:`${last.turn}턴 도시 2 보기`, exact:true}).click();
  await page.getByTestId('city-detail').waitFor();
  return { results: 'passed', realExperimentId: experiment.id, turns: summary.turns.length };
 })());
 // 실제 응답을 지연해 선택 턴/전체 표의 동시 조회를 재현한다. 실패 응답만 별도로 주입한다.
 results.push(await (async () => {
  const experiments = await (await page.request.get('http://127.0.0.1:8080/api/experiments?limit=50')).json();
  const experiment = experiments.find(row => row.status === 'completed' && row.config.turns > 1);
  if (!experiment) return {sharedTurn: 'skipped: 두 턴 이상 완료 실험 필요'};
  const summary = await (await page.request.get('http://127.0.0.1:8080/api/experiments/'+experiment.id+'/turns')).json();
  const first = Math.min(...summary.turns.map(row => row.turn));
  const pattern = '**/api/experiments/'+experiment.id+'/turns/'+first;
  let count=0, release, started;
  const gate=new Promise(resolve=>{release=resolve});
  const received=new Promise(resolve=>{started=resolve});
  await page.route(pattern, async route=>{
   count++; const response=await route.fetch(); started(); await gate;
   await route.fulfill({response});
  });
  try {
   await page.goto('http://127.0.0.1:8080/#/results');await page.reload();
   await page.locator('.rs-experiment').filter({hasText:'#'+experiment.id+'\n'}).click();
   await received;
   await page.getByRole('button',{name:'전체 턴 표',exact:true}).click();
   await page.locator('.rs-all-table tbody tr').first().waitFor();
   if(count!==1)throw Error('선택 턴과 전체 표가 같은 요청을 중복 전송함');
   // 전체 표를 닫아도 선택 턴 구독자가 남아 있으므로 공유 요청이 살아 있어야 한다.
   await page.getByRole('button',{name:'네트워크로 돌아가기',exact:true}).click();
   release();await page.getByTestId('city-overview').waitFor();
   await page.getByRole('button',{name:'전체 턴 표',exact:true}).click();
   await page.waitForFunction(n=>document.querySelectorAll('.rs-all-table tbody tr').length===n,summary.turns.length*5);
   if(count!==1)throw Error('완료된 턴 캐시를 재사용하지 않음');
  } finally { release(); await page.unroute(pattern); }
  let attempts=0;
  await page.route(pattern,route=>{attempts++;return attempts===1?route.abort('failed'):route.continue();});
  try {
   await page.reload();
   await page.locator('.rs-experiment').filter({hasText:'#'+experiment.id+'\n'}).click();
   await page.getByRole('button',{name:'도시 결과 다시 조회',exact:true}).click();
   await page.getByTestId('city-overview').waitFor();
   if(attempts!==2)throw Error('실패한 공유 요청이 재조회되지 않음');
  } finally { await page.unroute(pattern); }
  const other=experiments.find(row=>row.status==='completed'&&row.id!==experiment.id);
  let switched=false;
  if(other){
   let open, arrived, delivered, calls=0;
   const held=new Promise(resolve=>{open=resolve});
   const receivedOld=new Promise(resolve=>{arrived=resolve});
   const sentOld=new Promise(resolve=>{delivered=resolve});
   await page.route(pattern,async route=>{
    calls++;
    if(calls!==1)return route.continue();
    const response=await route.fetch();arrived();await held;
    try {await route.fulfill({response});} finally {delivered();}
   });
   try{
    await page.reload();
    await page.locator('.rs-experiment').filter({hasText:'#'+experiment.id+'\n'}).click();
    await receivedOld;
    await page.locator('.rs-experiment').filter({hasText:'#'+other.id+'\n'}).click();
    await page.getByTestId('city-overview').waitFor();
    const current=await page.getByTestId('city-overview').innerText();
    open();await sentOld;
    if(await page.getByTestId('city-overview').innerText()!==current)throw Error('늦은 응답이 다른 실험 결과를 덮어씀');
    await page.locator('.rs-experiment').filter({hasText:'#'+experiment.id+'\n'}).click();
    await page.getByTestId('city-overview').waitFor();
    if(calls!==2)throw Error('이전 실험 요청 또는 캐시가 다음 선택에 남음');
    switched=true;
   }finally{open();await page.unroute(pattern);}
  }
  return {sharedTurn:'passed',requests:count,retryAttempts:attempts,experimentSwitch:switched?'passed':'skipped'};
 })());
 // 비교 화면은 실제 완료 실험 두 개를 사용하고, 결과 배열 순서가 아닌 ID로 선택한다.
 results.push(await (async () => {
  const rows = await (await page.request.get('http://127.0.0.1:8080/api/experiments?limit=50')).json();
  const completed = rows.filter(row => row.status === 'completed');
  if (completed.length < 2) return { comparison: 'skipped: 완료된 실험 두 개가 필요합니다.' };
  await page.goto('http://127.0.0.1:8080/?comparison-check=1#/compare'); await page.reload();
  await page.locator('#compare-A').selectOption(String(completed[0].id));
  await page.locator('#compare-B').selectOption(String(completed[1].id));
  await page.locator('.cp-chart').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.cp-slot-network .rs-result-node').length === 10);
  await page.getByRole('button', {name:'도시 2 상세 보기',exact:true}).first().click();
  if (await page.locator('.cp-slot-network .rs-result-node[aria-pressed=true]').count() !== 2) throw Error('A/B 도시 선택 불일치');
  await page.locator('.cp-chart g[role=button]').last().press('Enter');
  if (await page.locator('.cp-chart g[aria-pressed=true]').count() !== 1) throw Error('그래프 턴 선택 불일치');
  const markerIds = await page.locator('.cp-slot-network marker').evaluateAll(nodes=>nodes.map(n=>n.id));
  if(new Set(markerIds).size!==markerIds.length)throw Error('비교 네트워크 화살표 ID 중복');
  // A·B 값이 다른 칸만 강조한다. 턴 수가 다른 실험도 있으므로 양쪽 모두에 있는 첫 턴에서 확인한다.
  await page.locator('.cp-chart g[role=button]').first().press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.cp-city-table .cp-cell-value[data-tone=muted]').length === 0);
  const cells = await page.locator('.cp-city-table tbody td:has(.cp-cell-value)').evaluateAll(nodes => nodes.map(td => {
   const [a, b] = [...td.querySelectorAll('.cp-cell-value')].map(value => value.lastChild.textContent);
   return { marked: td.dataset.different === 'true', differs: a !== b };
  }));
  if (!cells.length || cells.some(cell => cell.marked !== cell.differs)) throw Error('A/B 차이 강조 불일치');
  // 한쪽에 없는 턴은 비교 대상이 아니므로 어떤 칸도 강조하지 않는다.
  if (completed[0].config.turns !== completed[1].config.turns) {
   await page.locator('.cp-chart g[role=button]').last().press('Enter');
   await page.waitForFunction(() => !document.querySelector('.cp-side-status [role=status]') && document.querySelectorAll('.cp-city-table .cp-cell-value[data-tone=muted]').length > 0);
   if (await page.locator('.cp-city-table td[data-different=true]').count() !== 0) throw Error('없는 턴을 차이로 강조함');
  }
  // 실제 턴 응답은 그대로 사용하고 한쪽의 통신 실패만 주입한다.
  await page.reload();
  const failedPath=`**/api/experiments/${completed[1].id}/turns/1`;
  await page.route(failedPath,route=>route.abort('failed'));
  await page.locator('#compare-A').selectOption(String(completed[0].id));
  await page.locator('#compare-B').selectOption(String(completed[1].id));
  await page.getByRole('button',{name:'B 다시 조회',exact:true}).waitFor();
  if(await page.locator('.cp-slot-network').first().locator('.rs-result-node').count()!==5)throw Error('한쪽 오류가 다른 결과를 지움');
  await page.unroute(failedPath);
  await page.getByRole('button',{name:'B 다시 조회',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.cp-slot-network .rs-result-node').length===10);
  // 빠른 A/B 교체 후 양쪽 실험에 해당하는 1턴만 보여야 한다.
  await page.locator('#compare-A').selectOption('');
  await page.locator('#compare-B').selectOption(String(completed[0].id));
  await page.locator('#compare-A').selectOption(String(completed[1].id));
  await page.waitForFunction(()=>document.querySelectorAll('.cp-slot-network .rs-network[data-turn="1"] .rs-result-node').length===10);
  return { comparison: 'passed', ids: completed.slice(0,2).map(row => row.id) };
 })());
 return results;
 } finally { await page.unroute("**/api/**"); await page.unroute("**/api/experiments?**"); }
}
