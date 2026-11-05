import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'

const settingFields = [
  { name: 'turns', label: '턴 수', value: 10, hint: '1–20턴', unit: '턴' },
  { name: 'byzantine_count', label: '비잔틴 도시 수', value: 1, hint: '전체 5개 중 0–5개', unit: '개' },
  { name: 'sensor_error', label: '센서 오류율', value: 10, hint: '0–100%', unit: '%' },
  { name: 'drop_rate', label: '메시지 누락률', value: 0, hint: '0–100%', unit: '%' },
  { name: 'flip_rate', label: '메시지 조작률', value: 0, hint: '0–100%', unit: '%' },
] as const

export function SetupPage() {
  return (
    <>
      <PageHeading eyebrow="EXPERIMENT" title="새 실험 설정" description="도시의 판단과 메시지에 영향을 줄 조건을 설정하세요." />
      <div className="setup-layout">
        <Panel title="실험 조건" description="전체 도시 수는 5개로 고정됩니다." aside={<span className="badge">설정 준비 중</span>}>
          <p className="availability-note" id="settings-note">현재는 화면 구성 단계입니다. 입력과 실행 기능은 준비 중입니다.</p>
          <fieldset className="settings-fields" disabled aria-describedby="settings-note">
            <legend className="sr-only">실험 조건 입력</legend>
            <label className="field field--full" htmlFor="experiment-name">
              <span>실험 이름 <span className="optional">선택</span></span>
              <input id="experiment-name" name="name" type="text" placeholder="예: 비잔틴 1개 · 센서 오류 10%" aria-describedby="name-hint" />
              <small id="name-hint">최대 50자</small>
            </label>
            {settingFields.map((field) => (
              <label key={field.name} className="field" htmlFor={`setting-${field.name}`}>
                <span>{field.label}</span>
                <span className="input-with-unit">
                  <input id={`setting-${field.name}`} name={field.name} type="number" defaultValue={field.value} aria-describedby={`hint-${field.name}`} />
                  <span aria-hidden="true">{field.unit}</span>
                </span>
                <small id={`hint-${field.name}`}>{field.hint}</small>
              </label>
            ))}
            <label className="field" htmlFor="setting-seed">
              <span>Seed <span className="optional">선택</span></span>
              <input id="setting-seed" name="seed" type="number" placeholder="비우면 매번 랜덤" aria-describedby="seed-hint" />
              <small id="seed-hint">0–2,147,483,647 · 0도 사용할 수 있습니다.</small>
            </label>
          </fieldset>
          <div className="form-footer">
            <span>조건을 정한 뒤 실험을 시작합니다.</span>
            <button className="button button--primary" disabled aria-describedby="settings-note">실험 실행</button>
          </div>
        </Panel>
        <aside className="side-stack" aria-label="실행 안내">
          <Panel title="실행 상태" aside={<span className="badge">실행 전</span>}>
            <div className="execution-idle"><span className="idle-symbol" aria-hidden="true">○</span><h3>시작할 실험을 기다리고 있어요.</h3><p>실행하면 진행 상태와 저장된 턴 수가 표시됩니다.</p></div>
            <dl className="status-values"><div><dt>저장된 턴</dt><dd>—</dd></div></dl>
          </Panel>
          <section className="guide-block" aria-labelledby="flow-heading">
            <h2 id="flow-heading">실험은 이렇게 진행돼요</h2>
            <ol className="flow-list">
              <li><span>01</span><div><strong>조건 설정</strong><p>오류율과 비잔틴 도시 수를 정합니다.</p></div></li>
              <li><span>02</span><div><strong>실험 실행</strong><p>실행 상태와 완료된 턴을 확인합니다.</p></div></li>
              <li><span>03</span><div><strong>결과 탐색</strong><p>완료된 결과를 턴별로 살펴봅니다.</p></div></li>
            </ol>
          </section>
          <p className="quiet-note">같은 엔진·설정·seed로 결과를 재현할 수 있습니다. Mock과 실제 엔진의 결과는 서로 다를 수 있습니다.</p>
        </aside>
      </div>
    </>
  )
}
