// Run with Playwright CLI run-code --filename=tests/integration-browser.js.
// All lifecycle responses in this suite are explicit browser-side mocks.
// eslint-disable-next-line no-unused-expressions -- Playwright CLI evaluates this function expression.
async page => {
  const checks = [], errors = [];
  const check = (name, ok) => { checks.push({name, pass:ok}); if (!ok) throw Error(name); };
  page.on('pageerror', error => errors.push(String(error)));
  let scenario = 'hold', posts = 0, gets = 0, payload;
  const config = {turns:10, byzantine_count:1, sensor_error:.1, drop_rate:0, flip_rate:0, seed:null};
  const exp = (status='running', done=4) => ({id:73, name:null, status, config, completed_turns:done, mean_accuracy:status==='completed'?.8:null, error:status==='failed'?'도시 3과 연결이 끊겨 실험이 중단되었습니다. (상세: ConnectionRefused)':null});
  await page.route('**/api/**', async route => {
    const request = route.request();
    if(request.method()==='POST') {
      posts++; payload=request.postDataJSON(); await page.waitForTimeout(350);
      if(scenario==='409') return route.fulfill({status:409,json:{detail:'이미 실행 중인 실험(#91)이 있습니다.'}});
      if(scenario==='422') return route.fulfill({status:422,json:{detail:[{loc:['body','turns'],msg:'턴 수는 1부터 20까지 입력해 주세요.'}]}});
      if(scenario==='lost') return route.abort('failed');
      if(scenario==='malformed') return route.fulfill({json:{id:73}});
      return route.fulfill({status:202,json:exp('pending',0)});
    }
    if(request.url().includes('?limit='))return route.fulfill({json:[exp('completed',10)]});
    if(request.url().endsWith('/turns'))return route.fulfill({json:{experiment_id:73,turns:[]}});
    gets++;
    if(scenario==='poll-error' && gets===1)return route.fulfill({status:503,json:{detail:'일시적인 조회 오류'}});
    if(scenario==='wrong-id' && gets===1)return route.fulfill({json:{...exp(),id:99}});
    return route.fulfill({json:scenario==='failed'?exp('failed',3):scenario==='hold'?exp():exp(gets===1?'running':'completed',gets===1?4:10)});
  });
  async function start(s) { scenario=s; posts=0; gets=0; await page.goto('http://127.0.0.1:8080/#/setup'); await page.reload(); await page.locator('#god-node[aria-pressed=true]').waitFor(); await page.evaluate(()=>document.fonts.ready); }
  for(const [width,height] of [[1280,720],[1440,900],[1920,1080]]) {
    await page.setViewportSize({width,height}); await start('normal');
    check('God default '+width,await page.locator('#god-node').getAttribute('aria-pressed')==='true');
    check('no overflow '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    check('run visible '+width,await page.locator('#run-button').evaluate(n=>n.getBoundingClientRect().bottom<=innerHeight));
    await page.screenshot({path:'integration-'+width+'.png',fullPage:true});
    await page.locator('[data-city="2"]').click();check('city selection '+width,await page.locator('#selection-title').innerText()==='도시 02');
    await page.locator('#run-button').evaluate(n=>{n.click();n.click()});
    await page.getByRole('heading',{name:'실험 준비 중',exact:true}).waitFor();
    check('single POST '+width,posts===1);check('payload '+width,payload.sensor_error===.1&&payload.seed===null&&payload.turns===10);
    check('locked '+width,await page.locator('#turns').count()===0);
    await page.getByRole('heading',{name:'실험 진행 중',exact:true}).waitFor();
    check('stored progress '+width,await page.getByRole('progressbar').getAttribute('aria-valuenow')==='40');
    await page.screenshot({path:'integration-running-'+width+'.png',fullPage:true});
    await page.getByRole('heading',{name:'실험 완료',exact:true}).waitFor();
    await page.screenshot({path:'integration-completed-'+width+'.png',fullPage:true});
    const count=gets;await page.waitForTimeout(1100);check('poll stops '+width,gets===count);
    await page.getByRole('button',{name:'새로운 실험 설정',exact:true}).click();check('edit again '+width,await page.locator('#turns').inputValue()==='10');
  }
  await start('hold');await page.locator('#sensor_error').fill('12.345');
  await page.getByRole('link',{name:'실험 비교',exact:true}).click();await page.getByRole('link',{name:'실험 설정',exact:true}).click();
  check('draft persists across routes',await page.locator('#sensor_error').inputValue()==='12.345');
  await page.locator('#run-button').click();await page.getByRole('heading',{name:'실험 준비 중',exact:true}).waitFor();
  check('decimal payload',payload.sensor_error===.12345);
  await page.getByRole('link',{name:'결과 탐색',exact:true}).click();await page.waitForTimeout(1400);await page.getByRole('link',{name:'실험 설정',exact:true}).click();
  check('poll survives route change',await page.getByRole('heading',{name:'실험 진행 중',exact:true}).isVisible());
  for(const s of ['failed','409','422','lost','malformed','poll-error','wrong-id']) {
    await start(s);await page.locator('#run-button').click();
    if(s==='failed') {
      await page.getByRole('heading',{name:'실험 실패',exact:true}).waitFor();
      check('Korean engine error',(await page.locator('.run-error').innerText()).includes('도시 3'));
      await page.getByText('상세 오류 정보',{exact:true}).click();check('raw error',(await page.locator('.run-error pre').innerText()).includes('ConnectionRefused'));
    } else if(s==='409'||s==='422') {
      await page.locator('#turns').waitFor();await page.waitForTimeout(450);
      check(s+' message',(await page.locator('#form-feedback').innerText()).includes(s==='409'?'#91':'턴 수는'));
      if(s==='422')check('field error',await page.locator('#turns').getAttribute('aria-invalid')==='true');
    } else if(s==='lost'||s==='malformed') {
      await page.getByRole('heading',{name:'실행 요청 확인 필요',exact:true}).waitFor();
      await page.waitForTimeout(1100);check(s+' no retry',posts===1&&gets===0);
      check('ack required '+s,await page.getByRole('button',{name:'조건으로 돌아가기',exact:true}).isDisabled());
      await page.getByRole('link',{name:'기존 실험 목록 확인',exact:true}).click();await page.getByRole('link',{name:'실험 설정',exact:true}).click();
      check('uncertain preserved '+s,await page.getByRole('heading',{name:'실행 요청 확인 필요',exact:true}).isVisible());
    } else {
      await page.getByRole('button',{name:'상태 다시 조회',exact:true}).waitFor();
      check('last state '+s,await page.getByRole('heading',{name:'실험 준비 중',exact:true}).isVisible());
      await page.getByRole('button',{name:'상태 다시 조회',exact:true}).click();
      await page.getByRole('heading',{name:'실험 완료',exact:true}).waitFor();check('same ID retry '+s,posts===1&&gets===2);
    }
    await page.screenshot({path:'integration-'+s+'.png',fullPage:true});
  }
  await start('normal');await page.locator('#turns').fill('21');await page.locator('#run-button').click();
  check('client validation',posts===0&&await page.locator('#turns').getAttribute('aria-invalid')==='true');
  await page.getByRole('button',{name:'초기화',exact:true}).click();check('reset',await page.locator('#turns').inputValue()==='10');
  check('no page errors',errors.length===0);
  await page.unroute('**/api/**');await page.goto('http://127.0.0.1:8080/#/setup');
  return {checks,errors};
}
