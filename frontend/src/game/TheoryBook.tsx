import { useEffect, useId, useRef } from 'react'
import { THEORY_TOPICS } from './theoryBook'
import type { TopicKey } from './village'

export function BookLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tb-book-link" onClick={onClick}>
      <span className="tb-book-link-text">{label}</span>
    </button>
  )
}

// 네이티브 <dialog> + showModal() 기반 책 오버레이.
// 바깥 클릭·Esc로 닫히며 포커스 이동과 복귀는 브라우저 기본 동작에 맡긴다.
export function TheoryBook({ topic, onClose }: { topic: TopicKey | null; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const backdropDownRef = useRef(false)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (topic) {
      if (!dialog.open) dialog.showModal()
      if (pageRef.current) pageRef.current.scrollTop = 0
    } else if (dialog.open) {
      dialog.close()
    }
  }, [topic])

  const data = topic ? THEORY_TOPICS[topic] : null

  return (
    <dialog
      ref={dialogRef}
      className="tb-dialog"
      aria-labelledby={data ? titleId : undefined}
      onClose={onClose}
      onMouseDown={(e) => {
        backdropDownRef.current = e.target === dialogRef.current
      }}
      onClick={(e) => {
        if (backdropDownRef.current && e.target === dialogRef.current) dialogRef.current.close()
        backdropDownRef.current = false
      }}
    >
      {data && (
        <div ref={pageRef} className="tb-page">
          <button
            type="button"
            className="tb-close"
            aria-label="이론 책 닫기"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
          <p className="tb-kicker">{data.kicker}</p>
          <h2 id={titleId}>{data.title}</h2>
          <p className="tb-en">{data.en}</p>

          <h3>쉽게 말하면</h3>
          <p className="tb-easy">{data.easy}</p>

          <h3>이 게임에서는</h3>
          <p>{data.game}</p>

          <h3>이론</h3>
          {data.boxes.map(([kind, body]) => (
            <div key={kind} className="tb-box">
              <b className="tb-box-kind">{kind}</b>
              <p>{body}</p>
            </div>
          ))}
          {data.proof && (
            <p className="tb-proof">
              <b>왜 그런가.</b> {data.proof}
            </p>
          )}

          <h3>참고 문헌</h3>
          <ol className="tb-refs">
            {data.refs.map((ref, i) => (
              <li key={i}>
                {ref.before}
                {ref.italic && <i>{ref.italic}</i>}
                {ref.after}
              </li>
            ))}
          </ol>
        </div>
      )}
    </dialog>
  )
}
