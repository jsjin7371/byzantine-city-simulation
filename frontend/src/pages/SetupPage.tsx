import { useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeading } from '../components/PageHeading'
import { Panel } from '../components/Panel'
import { createExperimentDraft, settingFields, validateExperimentDraft } from '../experimentForm'
import type { ExperimentDraft, ExperimentField } from '../experimentForm'
import type { useExperiment } from '../useExperiment'

export function SetupPage({ draft, onDraftChange, run }: { draft: ExperimentDraft; onDraftChange: (draft: ExperimentDraft) => void; run: ReturnType<typeof useExperiment> }) {
  const [showErrors, setShowErrors] = useState(false)
  const [checked, setChecked] = useState(false)
  const errors = validateExperimentDraft(draft)
  const visibleError = (field: ExperimentField) => showErrors ? errors[field] : undefined
  const statusLabels = { pending: '실행 준비', running: '실행 중', completed: '완료', failed: '실패' }
  const experiment = run.experiment
  // '입력 확인'을 거치지 않고 실행을 눌러도 현재 값이 유효해야 요청한다.
  function execute() {
    setShowErrors(true)
    if (Object.keys(errors).length) return
    setChecked(false)
    void run.start(draft)
  }
  function update(field: ExperimentField, value: string) {
    onDraftChange({ ...draft, [field]: value })
    setChecked(false)
  }
  // 폼 제출(Enter 포함)은 입력 검사만 수행한다. 서버 요청은 별도 '실험 실행' 버튼에서 한다.
  function check(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setShowErrors(true)
    setChecked(Object.keys(errors).length === 0)
    const firstError = (Object.keys(draft) as ExperimentField[]).find((field) => errors[field])
    if (firstError) event.currentTarget.querySelector<HTMLInputElement>(`[name="${firstError}"]`)?.focus()
  }
  function reset() {
    onDraftChange(createExperimentDraft())
    setShowErrors(false)
    setChecked(false)
  }
  return (
    <>
      <PageHeading eyebrow="EXPERIMENT" title="새 실험 설정" description="도시의 판단과 메시지에 영향을 줄 조건을 설정하세요." />
      <div className="setup-layout">
        <Panel title="실험 조건" description="전체 도시 수는 5개로 고정됩니다." aside={<span className="badge">조건 입력</span>}>
          <p className="availability-note" id="settings-note">실험 실행 시 입력한 조건을 서버로 전송합니다. 메뉴를 이동해도 실행 상태를 확인하며, 새로고침하면 화면의 입력값과 실행 상태가 초기화됩니다. 서버에서 시작한 실험은 계속 진행됩니다.</p>
          <form noValidate onSubmit={check}>
          <fieldset className="settings-fields" disabled={run.busy} aria-describedby="settings-note">
            <legend className="sr-only">실험 조건 입력</legend>
            <label className="field field--full" htmlFor="experiment-name">
              <span>실험 이름 <span className="optional">선택</span></span>
              <input id="experiment-name" name="name" type="text" value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="예: 비잔틴 1개 · 센서 오류 10%" aria-invalid={Boolean(visibleError('name'))} aria-describedby="name-hint name-error" />
              <small id="name-hint">최대 50자</small>
              <small className="field-error" id="name-error">{visibleError('name')}</small>
            </label>
            {settingFields.map((field) => (
              <label key={field.name} className="field" htmlFor={`setting-${field.name}`}>
                <span>{field.label}</span>
                <span className="input-with-unit">
                  <input id={`setting-${field.name}`} name={field.name} type="text" inputMode={field.integer ? 'numeric' : 'decimal'} required value={draft[field.name]} onChange={(event) => update(field.name, event.target.value)} aria-invalid={Boolean(visibleError(field.name))} aria-describedby={`hint-${field.name} error-${field.name}`} />
                  <span aria-hidden="true">{field.unit}</span>
                </span>
                <small id={`hint-${field.name}`}>{field.hint}</small>
                <small className="field-error" id={`error-${field.name}`}>{visibleError(field.name)}</small>
              </label>
            ))}
            <label className="field" htmlFor="setting-seed">
              <span>Seed <span className="optional">선택</span></span>
              <input id="setting-seed" name="seed" type="text" inputMode="numeric" value={draft.seed} onChange={(event) => update('seed', event.target.value)} placeholder="비우면 매번 랜덤" aria-invalid={Boolean(visibleError('seed'))} aria-describedby="seed-hint seed-error" />
              <small id="seed-hint">0–2,147,483,647 · 0도 사용할 수 있습니다.</small>
              <small className="field-error" id="seed-error">{visibleError('seed')}</small>
            </label>
          </fieldset>
          <div className="form-footer">
            <button className="button" type="button" onClick={reset} disabled={run.busy}>기본값으로 초기화</button>
            <div className="form-actions"><button className="button" type="submit" disabled={run.busy}>입력 확인</button><button className="button button--primary" type="button" disabled={run.busy} onClick={execute} aria-describedby="settings-note">{run.submitting ? '요청 중…' : '실험 실행'}</button></div>
          </div>
          <p className="form-feedback" role="status">{checked ? '입력값이 올바릅니다. 아직 실험을 실행하거나 서버에 저장하지 않았습니다.' : ''}</p>
          </form>
        </Panel>
        <aside className="side-stack" aria-label="실행 안내">
          <Panel title="실행 상태" aside={<span className="badge">{run.submitting ? '요청 중' : experiment ? statusLabels[experiment.status] : '실행 전'}</span>}>
            <div className="execution-idle" role="status">
              <h3>{run.submitting ? '실험을 생성하고 있어요.' : experiment ? `실험 #${experiment.id} · ${statusLabels[experiment.status]}` : '시작할 실험을 기다리고 있어요.'}</h3>
              <p>{experiment?.status === 'completed' ? '실험 결과가 서버에 저장되었습니다. 결과 탐색 메뉴에서 실험을 선택해 주세요.' : run.busy ? '준비 또는 실행 대기 중에는 저장된 턴이 0일 수 있습니다.' : '실행하면 진행 상태와 저장된 턴 수가 표시됩니다.'}</p>
              {experiment && <dl className="status-values"><div><dt>저장된 턴</dt><dd>{experiment.completed_turns} / {experiment.config.turns}</dd></div>{experiment.status === 'completed' && experiment.mean_accuracy !== null && <div><dt>평균 정확도</dt><dd>{(experiment.mean_accuracy * 100).toFixed(1)}%</dd></div>}</dl>}
            </div>
            {(run.error || experiment?.status === 'failed') && <p className="execution-error" role="alert">{run.error || experiment?.error || '실험 실행에 실패했습니다.'}</p>}
            {run.error && experiment && run.busy && <button type="button" className="button" onClick={run.refreshStatus}>상태 다시 조회</button>}
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
