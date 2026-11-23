import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Line } from './village'

// 마을 이야기 (명세 3번). 턴 결과에서 만든 대사를 양피지에 적는다.
// live: 밤 연출 중. 새 줄이 한 줄씩 나타나고 맨 아래로 따라간다.
export function VillageLog({ lines, live = false, children }: { lines: Line[] | null; live?: boolean; children?: ReactNode }) {
  const log = useRef<HTMLDivElement>(null)
  const count = lines?.length ?? 0
  useEffect(() => {
    if (live && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [live, count])
  return (
    <aside className="vl-talk" aria-label="마을 이야기">
      <h3>마을 이야기</h3>
      <div ref={log} className={live ? 'vl-log is-live' : 'vl-log'} aria-live={live ? 'polite' : undefined}>
        {!lines && <p className="vl-event is-quiet">아직 첫날 밤이 오지 않았다. 집마다 할 말을 고르고 밤으로 넘긴다.</p>}
        {lines?.map((line, i) =>
          line.kind === 'when' ? (
            <p key={i} className="vl-when">
              {line.text}
            </p>
          ) : line.kind === 'say' ? (
            <p key={i} className="vl-line">
              <span className="vl-tok" aria-label={`${line.who}번`}>
                {line.who}
              </span>
              <span>{line.text}</span>
            </p>
          ) : line.kind === 'scale' ? (
            <p key={i} className="vl-line vl-scale">
              <span className="vl-tok" aria-label={`${line.who}번 저울`}>
                {line.who}
              </span>
              <span>{line.text}</span>
            </p>
          ) : (
            <p key={i} className="vl-event">
              {line.text}
            </p>
          ),
        )}
      </div>
      {children}
    </aside>
  )
}
