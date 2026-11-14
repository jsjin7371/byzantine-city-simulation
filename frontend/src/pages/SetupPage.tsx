import { useEffect, useRef, useState } from 'react'
import { createExperimentDraft, settingFields, validateExperimentDraft } from '../experimentForm'
import type { ExperimentDraft, ExperimentField } from '../experimentForm'
import type { useExperiment } from '../useExperiment'
import { NetworkCanvas } from '../components/NetworkCanvas'
import { AppHeader } from '../components/AppHeader'
import '../shadcn.css'
import './SetupPage.css'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '../components/ui/tooltip'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '../components/ui/accordion'
import { CircleHelp, RotateCcw, Play, ArrowUpRight } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Slider } from '../components/ui/slider'
import { Progress } from '../components/ui/progress'
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert'

type Props = { draft: ExperimentDraft; onDraftChange: (draft: ExperimentDraft) => void; run: ReturnType<typeof useExperiment> }
const titles = { submitting: '실험 생성 요청 중...', pending: '실험 준비 중', running: '실험 진행 중', completed: '실험 완료', failed: '실험 실패', uncertain: '실행 요청 확인 필요', idle: '실행 전' }
const help = { sensor_error: 'God의 힌트가 실제 상태와 다를 확률', drop_rate: '이웃에게 보낸 메시지가 사라질 확률', flip_rate: '이웃에게 보낸 메시지의 판단이 뒤집힐 확률' }
const labels = { name: '실험 이름', turns: '턴 수', byzantine_count: '비잔틴 도시 수', sensor_error: '센서 오류율', drop_rate: '메시지 누락률', flip_rate: '메시지 조작률', seed: 'Seed' }

export function SetupPage({ draft, onDraftChange, run }: Props) {
  const [showErrors, setShowErrors] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [extra, setExtra] = useState('')
  const form = useRef<HTMLFormElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  // 요청 상태를 먼저 표시하고, 이후에는 서버 상태를 그대로 사용한다. 조회 오류와 실험 실패는 구분한다.
  const state = run.submitting ? 'submitting' : run.uncertain ? 'uncertain' : run.experiment?.status ?? 'idle'
  const errors = { ...(showErrors ? validateExperimentDraft(draft) : {}), ...run.fieldErrors }
  useEffect(() => { if (state !== 'idle') title.current?.focus({ preventScroll: true }) }, [state])
  useEffect(() => { const key = Object.keys(run.fieldErrors)[0]; if (key) focusField(key) }, [run.fieldErrors])
  function focusField(key: string) {
    const input = form.current?.querySelector<HTMLInputElement>(`[name="${key}"]`)
    const details = input?.closest('details'); if (details) details.open = true
    if (key === 'name' || key === 'seed') { setExtra('reproduction'); requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>(`[name="${key}"]`)?.focus()) } else input?.focus()
  }
  function update(key: ExperimentField, value: string) { onDraftChange({ ...draft, [key]: value }); setFeedback(''); run.clearInputError() }
  function check() {
    setShowErrors(true)
    const invalid = Object.keys(validateExperimentDraft(draft))
    setFeedback(invalid.length ? '표시된 항목을 확인해 주세요.' : '입력값이 올바릅니다. 아직 실행하지 않았습니다.')
    if (invalid.length) focusField(invalid[0])
    return !invalid.length
  }
  function edit() { run.edit(acknowledged); setAcknowledged(false); setFeedback('') }
  const input = (key: ExperimentField) => <Input id={key} name={key} value={draft[key]} inputMode={key === 'name' ? 'text' : key in help ? 'decimal' : 'numeric'} onChange={e => update(key, e.target.value)} aria-invalid={Boolean(errors[key])} aria-describedby={`${key}-hint ${key}-error`} />
  const error = (key: ExperimentField) => <p className="error" id={`${key}-error`}>{errors[key]}</p>
  const exp = run.experiment
  // 입력 중인 draft 대신 서버 설정 또는 제출 당시 스냅샷을 실행 조건으로 보여준다.
  const config = exp ? { name: exp.name, ...exp.config } : run.submitted
  return <TooltipProvider delayDuration={150}><div className="a3-workspace">
    <AppHeader currentPage="setup" />
    <div className="studio-main"><div className="page-title"><div><span className="workspace-context">시뮬레이션 워크스페이스</span><h1>실험 설정<span className="title-period">.</span></h1><p>불확실한 정보 속, 다섯 도시의 합의를 실험하세요.</p></div><Badge variant="outline" className="ready-state" data-state={state} data-error={Boolean(run.error)} role="status"><span className="state-dot" aria-hidden="true"/>{titles[state]}</Badge></div>
    <div className="workbench"><NetworkCanvas/><aside className="settings-pane" aria-labelledby="settings-title">
      <div className="settings-heading"><div><span className="panel-kicker">Configuration</span><h2 id="settings-title">실험 조건</h2></div><Button className="text-button" type="button" disabled={state !== 'idle'} onClick={() => { onDraftChange(createExperimentDraft()); run.clearInputError(); setShowErrors(false); setFeedback('기본값으로 초기화했습니다.') }}><RotateCcw size={14}/>초기화</Button></div>
      {state === 'idle' ? <form id="experiment-form" ref={form} noValidate onSubmit={e => { e.preventDefault(); check() }}>
        <fieldset className="base-settings"><legend className="group-title">실험 구성</legend><div className="basic-fields">{settingFields.slice(0, 2).map(f => <div className="field" key={f.name}><label htmlFor={f.name}>{f.label}</label><div className="number-box">{input(f.name)}<span>{f.name === 'turns' ? '턴' : '/ 5개'}</span></div><p className="field-hint" id={`${f.name}-hint`}>{f.hint}</p>{error(f.name)}</div>)}</div><p className="byzantine-help">비잔틴 도시의 정체는 실행 전에 공개하지 않습니다.</p></fieldset>
        <Separator className="config-divider"/><fieldset className="uncertainty-settings"><legend>정보의 불확실성 <Badge variant="secondary">0–100%</Badge></legend>{settingFields.slice(2).map(f => <div className="rate-field" key={f.name}><div className="rate-top"><div className="rate-label"><label htmlFor={f.name}>{f.label}</label><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="help-trigger" aria-label={`${f.label} 도움말`}><CircleHelp size={14}/></Button></TooltipTrigger><TooltipContent className="workspace-tooltip">{help[f.name as keyof typeof help]}</TooltipContent></Tooltip></div><span className="rate-input">{input(f.name)}<span>%</span></span></div><p className="rate-help" id={`${f.name}-hint`}>{help[f.name as keyof typeof help]}</p><Slider min={0} max={100} step={0.1} value={[Math.max(0, Math.min(100, Number(draft[f.name]) || 0))]} onValueChange={([value]) => update(f.name, String(value))} aria-label={`${f.label} 슬라이더`} aria-valuetext={`${draft[f.name]}%`} aria-invalid={Boolean(errors[f.name])} className="rate-slider"/>{error(f.name)}</div>)}</fieldset>
        <Accordion type="single" value={extra} onValueChange={setExtra} collapsible className="extra-settings"><AccordionItem value="reproduction"><AccordionTrigger>이름과 Seed 설정 <Badge variant="secondary">선택</Badge></AccordionTrigger><AccordionContent >{(['name', 'seed'] as const).map(key => <div className="field extra-field" key={key}><label htmlFor={key}>{labels[key]}</label>{input(key)}<p className="field-hint" id={`${key}-hint`}>{key === 'name' ? '최대 50자' : '0–2,147,483,647 · 비우면 무작위'}</p>{error(key)}</div>)}<p className="field-hint">같은 엔진·조건·Seed에서 재현합니다. Mock과 실제 엔진의 결과는 다를 수 있습니다.</p></AccordionContent></AccordionItem></Accordion>
        <div className="action-area"><p role="status" id="form-feedback" className={`form-feedback ${run.error || Object.keys(errors).length ? 'invalid' : ''}`}>{run.error || feedback}</p><div className="form-actions"><Button variant="ghost" type="submit">입력 확인</Button><Button  id="run-button" type="button" onClick={() => { if (check()) void run.start(draft) }}><Play size={14}/>실험 실행</Button></div></div>
      </form> : <section className={`execution-panel ${state}`} aria-labelledby="run-title" aria-busy={run.submitting}>
        <h3 id="run-title" ref={title} tabIndex={-1}>{titles[state]}</h3>
        {exp && <><p className="run-id">실험 #{exp.id}</p><div className="progress-label"><span>저장된 턴</span><strong>{exp.completed_turns} / {exp.config.turns}</strong></div><Progress value={exp.completed_turns / exp.config.turns * 100} aria-label="서버에 저장된 턴" aria-valuetext={`${exp.completed_turns} / ${exp.config.turns} 저장된 턴`}/><p className="run-note">현재 처리 중인 턴 번호가 아닙니다.</p></>}
        {state === 'submitting' && <p className="run-description">서버에 실험 생성을 요청하고 있습니다.</p>}
        {state === 'pending' && <p className="run-description">서버가 실험을 준비하고 있습니다.</p>}
        {state === 'running' && <p className="run-description">서버에 저장된 진행 상태를 자동으로 확인합니다.</p>}
        {state === 'completed' && exp?.mean_accuracy != null && <p className="accuracy-value">평균 정확도 {(exp.mean_accuracy * 100).toFixed(1)}%</p>}
        {(run.error || state === 'failed') && <Alert variant="destructive" className="run-error"><AlertTitle>{state === 'failed' ? '실험이 중단되었습니다.' : run.uncertain ? '실험이 이미 생성되었을 수 있습니다.' : '상태를 확인할 수 없습니다.'}</AlertTitle><AlertDescription>{state === 'failed' ? (exp?.error || '서버가 실패 원인을 제공하지 않았습니다.').split('(상세:')[0] : run.error}</AlertDescription>{!run.uncertain && state !== 'failed' && <p>마지막 실행 상태를 유지합니다. 실험 실패를 의미하지 않습니다.</p>}<details><summary>상세 오류 정보</summary><pre>{state === 'failed' ? exp?.error : run.error}</pre></details></Alert>}
        <div className="run-actions">
          {(state === 'pending' || state === 'running') && <Button variant="outline" disabled={run.querying} onClick={run.refreshStatus}>{run.querying ? '조회 중...' : run.error ? '상태 다시 조회' : '상태 조회'}</Button>}
          {state === 'completed' && <><Button asChild><a href="#/results">결과 보기<ArrowUpRight size={14}/></a></Button><p className="run-note">결과 탐색에서 실험 #{exp?.id}를 선택하세요.</p><Button variant="outline" onClick={edit}>새로운 실험 설정</Button></>}
          {state === 'failed' && <Button  onClick={edit}>조건 수정 후 새 실험</Button>}
          {state === 'uncertain' && <><Button asChild><a href="#/results">기존 실험 목록 확인</a></Button><label className="confirm-new"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>목록을 확인했으며 새 요청이 필요합니다.</label><Button variant="outline" disabled={!acknowledged} onClick={edit}>조건으로 돌아가기</Button></>}
        </div>
        {config && <div className="run-config"><h4>실행에 사용한 조건</h4><dl>{Object.entries(labels).map(([key, label]) => { const val = config[key as keyof typeof config]; return <div key={key}><dt>{label}</dt><dd>{key in help ? `${Number((Number(val) * 100).toFixed(10))}%` : val ?? (key === 'seed' ? '무작위' : '이름 없음')}</dd></div> })}</dl></div>}
      </section>}
    </aside></div></div>
  </div></TooltipProvider>
}
