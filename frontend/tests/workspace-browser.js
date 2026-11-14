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
  await page.getByRole('button',{name:'이름과 재현 설정'}).click();await page.locator('#seed').fill('123');
  check('seed reachable '+width+'x'+height,await page.locator('#seed').inputValue()==='123');
  const r=await page.locator('#run-button').boundingBox();check('run stays visible with expanded settings '+width+'x'+height,r.y>=0&&r.y+r.height<=height);
  await page.getByRole('button',{name:'이름과 재현 설정'}).click();
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
 await page.getByRole('slider',{name:'센서 오류율 슬라이더'}).focus();await page.keyboard.press('ArrowRight');
 check('slider synchronizes input',await page.locator('#sensor_error').inputValue()==='10.1');
 await page.getByRole('button',{name:'이름과 재현 설정'}).click();await page.locator('#seed').fill('-1');
 await page.getByRole('button',{name:'이름과 재현 설정'}).click();await page.getByRole('button',{name:'입력 확인',exact:true}).click();
 await page.locator('#seed').waitFor();check('invalid hidden seed revealed',await page.locator('#seed').getAttribute('aria-invalid')==='true');
 await page.getByRole('button',{name:'초기화',exact:true}).click();await page.getByRole('button',{name:'이름과 재현 설정'}).click();
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
  await page.getByRole('button', {name:'도시 2 상세 보기', exact:true}).click();
  await page.getByTestId('city-detail').waitFor();
  await page.getByRole('button', {name:'전체 턴 표', exact:true}).click();
  await page.waitForFunction(count => document.querySelectorAll('.rs-all-table tbody tr').length === count, summary.turns.length * 5);
  await page.getByRole('button', {name:`${last.turn}턴 도시 2 보기`, exact:true}).click();
  await page.getByTestId('city-detail').waitFor();
  return { results: 'passed', realExperimentId: experiment.id, turns: summary.turns.length };
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
  return { comparison: 'passed', ids: completed.slice(0,2).map(row => row.id) };
 })());
 return results;
 } finally { await page.unroute("**/api/**"); await page.unroute("**/api/experiments?**"); }
}
