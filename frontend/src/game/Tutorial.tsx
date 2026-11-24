import { Button } from '../components/ui/button'
import { splitSentences } from './village'
import type { TutorialStep } from './village'

// 튜토리얼 말풍선: 보드 영역 위쪽에 붙는 동화 일기장 톤의 안내 상자.
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
  const lines = step ? splitSentences(step.text) : []
  return (
    <div
      className={step ? 'tut-box' : 'tut-box is-empty'}
      role={step ? 'region' : undefined}
      aria-label={step ? '튜토리얼 안내' : undefined}
    >
      <p className="tut-text" role="status">
        {lines.map((line, i) => (
          <span key={i} className="tut-line">
            {line}
            {i < lines.length - 1 ? ' ' : ''}
          </span>
        ))}
      </p>
      {step && (
        <div className="tut-actions">
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
  )
}
