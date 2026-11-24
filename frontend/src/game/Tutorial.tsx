import { Button } from '../components/ui/button'
import type { TutorialStep } from './village'

// 튜토리얼 말풍선: 보드 영역 위쪽에 붙는 동화 일기장 톤의 안내 상자.
export function Tutorial({
  step,
  onNext,
  onDismiss,
  onExit,
}: {
  step: TutorialStep | null
  onNext: () => void
  onDismiss: () => void
  onExit: () => void
}) {
  return (
    <div
      className={step ? 'tut-box' : 'tut-box is-empty'}
      role="region"
      aria-label="튜토리얼 안내"
      aria-live="polite"
    >
      {step && (
        <>
          <p className="tut-text">{step.text}</p>
          <div className="tut-actions">
            {step.finish ? (
              <>
                <Button size="sm" onClick={onDismiss}>
                  이어서 하기
                </Button>
                <Button size="sm" variant="outline" onClick={onExit}>
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
        </>
      )}
    </div>
  )
}
