import { Button } from '../components/ui/button'
import { TUTORIAL_STEPS, splitSentences } from './village'
import type { TutorialStep } from './village'

// 튜토리얼 말풍선: 보드 영역 위쪽에 붙는 동화 일기장 톤의 안내 상자.
// 모든 단계 문구를 grid 한 칸에 겹쳐 두어 가장 긴 문구 높이로 자연히 고정하고, 현재 단계만 visible로 노출한다.
export function Tutorial({
  step,
  busy = false,
  onNext,
  onDismiss,
  onExit,
}: {
  step: TutorialStep | null
  busy?: boolean
  onNext: () => void
  onDismiss: () => void
  onExit: () => void
}) {
  return (
    <div
      className={step ? 'tut-box' : 'tut-box is-empty'}
      role={step ? 'region' : undefined}
      aria-label={step ? '튜토리얼 안내' : undefined}
    >
      <div className="tut-texts" role="status">
        {TUTORIAL_STEPS.map((s, idx) => {
          const active = step === s
          const lines = splitSentences(s.text)
          return (
            <p
              key={idx}
              className={active ? 'tut-text is-active' : 'tut-text'}
              aria-hidden={active ? undefined : true}
            >
              {lines.map((line, i) => (
                <span key={i} className="tut-line">
                  {line}
                  {i < lines.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          )
        })}
      </div>
      <div className="tut-actions">
        <div className="tut-actions-row is-sizer" aria-hidden="true">
          <Button asChild size="sm">
            <span>이어서 하기</span>
          </Button>
          <Button asChild size="sm" variant="outline">
            <span>시작 화면으로</span>
          </Button>
        </div>
        {step && (
          <div className="tut-actions-row">
            {step.finish ? (
              <>
                <Button size="sm" onClick={onDismiss}>
                  이어서 하기
                </Button>
                <Button size="sm" variant="outline" onClick={onExit} disabled={busy}>
                  시작 화면으로
                </Button>
              </>
            ) : (
              <>
                {!step.wait && (
                  <Button size="sm" onClick={onNext}>
                    다음
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={onDismiss}>
                  안내 끄기
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
