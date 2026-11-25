import { useEffect, useId, useRef } from 'react'
import { THEORY_TOPICS } from './theoryBook'
import type { TopicKey } from './village'

export function BookLink({
  label,
  sub,
  showIcon = false,
  onClick,
}: {
  label: string
  sub?: string
  showIcon?: boolean
  onClick: (opener: HTMLButtonElement) => void
}) {
  return (
    <button type="button" className="tb-book-link" onClick={(e) => onClick(e.currentTarget)}>
      {showIcon && (
        <svg width="26" height="20" viewBox="0 0 26 20" aria-hidden="true">
          <path
            d="M13 4C9 1 5 1 1 2v15c4-1 8-1 12 2 4-3 8-3 12-2V2c-4-1-8-1-12 2zm0 0v15"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span className="tb-book-link-text">{label}</span>
      {sub && <small className="tb-book-link-sub">{sub}</small>}
    </button>
  )
}

// 네이티브 <dialog> + showModal() 기반 책 오버레이.
// 열 때 닫기 버튼에 초점, 바깥 클릭·Esc로 닫히며 닫힐 때 열었던 버튼으로 초점을 되돌린다.
export function TheoryBook({
  topic,
  opener,
  onClose,
}: {
  topic: TopicKey | null
  opener?: HTMLElement | null
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (topic) {
      returnFocusRef.current =
        opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      if (!dialog.open) dialog.showModal()
      if (pageRef.current) pageRef.current.scrollTop = 0
      closeBtnRef.current?.focus({ preventScroll: true })
    } else if (dialog.open) {
      dialog.close()
    }
  }, [topic, opener])

  const handleClose = () => {
    onClose()
    const target = returnFocusRef.current
    returnFocusRef.current = null
    if (target && target.isConnected) {
      requestAnimationFrame(() => target.focus({ preventScroll: true }))
    }
  }

  const data = topic ? THEORY_TOPICS[topic] : null

  return (
    <dialog
      ref={dialogRef}
      className="tb-dialog"
      aria-labelledby={data ? titleId : undefined}
      onClose={handleClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current.close()
      }}
    >
      {data && (
        <div ref={pageRef} className="tb-page">
          <button
            ref={closeBtnRef}
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
