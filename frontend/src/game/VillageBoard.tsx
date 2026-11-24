import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent, RefObject } from 'react'
import { decisions } from '../components/results/resultLabels'
import { SUSPICION, TOTAL_TURNS } from '../gameApi'
import type { Claim, GameState, TurnResult } from '../gameApi'
import { onActivateKey } from '../lib/keyboard'
import { SharedVillageDefs } from './SharedVillageDefs'
import { PHASE_LABEL, TRAILS, VOTE_ANIM, changedHouses, clashingPairs, pairMid, reached, scaleLeader, sharePath, stagedHouses, suspicionLinks, suspicionPreview, talkNotes, tally, villageHouses, voteAnimDelays, worsens } from './village'
import type { House, Phase, Preview, Scale, SuspicionLink, TutorialHighlight } from './village'
import './village.css'

const PLAZA = { x: 450, y: 345 }
const STAMP = { minW: 136, charW: 13, padX: 28, y: PLAZA.y + 54, h: 32 }
const CELL_W = 38
const TREES = [
  [60, 150], [112, 178], [40, 455], [82, 505], [44, 560], [850, 150], [806, 182], [860, 300], [818, 346], [866, 400],
  [852, 515], [812, 560], [350, 556], [314, 582], [760, 566], [520, 230], [380, 232], [140, 130], [772, 128], [128, 560],
]
const STONES = [
  [380, 345], [398, 315], [430, 298], [470, 298], [502, 315], [520, 345], [502, 376], [470, 392], [430, 392], [398, 376],
]
const cellX = (day: number) => 150 + 44 * (day - 1)

// 목업 A3의 공용 그림 (거친 선 필터, 오두막, 깃발, 창문, 말)
function Defs() {
  return (
    <defs>
      <SharedVillageDefs prefix="vb" />
      <marker id="vb-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="#7a2416" />
      </marker>
      <marker id="vb-sus-arr" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
        <path d="M0 1 L9 5 L0 9 Z" fill="#7a2416" />
      </marker>
      {(['evacuate', 'stay'] as const).map((claim) => (
        <g key={claim} id={`vb-flag-${claim}`}>
          <g filter="url(#vb-rough)">
            <line x1="0" y1="0" x2="0" y2="-53" stroke="#3b2a1a" strokeWidth="2.5" />
            <path
              d="M0 -53 Q15 -58 26 -52 Q37 -46 48 -51 L48 -29 Q37 -24 26 -30 Q15 -36 0 -31 Z"
              className={`vb-cloth is-${claim}`}
              strokeWidth="1.5"
            />
          </g>
          <text x="24" y="-36" fontSize="13.5" fontWeight="700" textAnchor="middle" className={`vb-cloth-text is-${claim}`}>
            {decisions[claim]}
          </text>
        </g>
      ))}
      {(['evacuate', 'stay'] as const).map((claim) => (
        <g key={claim} id={`vb-note-${claim}`}>
          <path d="M-24 -12 H18 L24 -6 V12 H-24 Z" className={`vb-cloth is-${claim}`} strokeWidth="1.6" />
          <path d="M18 -12 V-6 H24" fill="none" className={`vb-cloth is-${claim}`} strokeWidth="1.3" />
          <text x="-2" y="5.5" fontSize="14" fontWeight="700" textAnchor="middle" className={`vb-cloth-text is-${claim}`}>
            {decisions[claim]}
          </text>
        </g>
      ))}
      <g id="vb-knot">
        <path d="M0 -20 L6 -9 L19 -12 L12 -1 L20 9 L7 9 L3 21 L-4 10 L-17 14 L-11 2 L-20 -7 L-7 -8 Z" fill="#a8361f" stroke="#4a1a10" strokeWidth="2" />
        <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#f3e7c6" strokeWidth="2.6" strokeLinecap="round" />
      </g>
      <g id="vb-pawn">
        <ellipse cy="14" rx="12" ry="4" fill="#2a1a0c" opacity=".35" />
        <path d="M-11 14 Q0 -26 11 14 Z" fill="#d9a95f" stroke="#4a3119" strokeWidth="2" />
        <circle cy="-10" r="9" fill="#d9a95f" stroke="#4a3119" strokeWidth="2" />
      </g>
    </defs>
  )
}

// 풀밭, 오솔길, 공터, 광장, 숲 (바뀌지 않는 바닥판)
function Ground() {
  return (
    <g aria-hidden>
      <rect width="900" height="660" fill="#93a85a" />
      <rect width="900" height="660" filter="url(#vb-mottle)" />
      <g filter="url(#vb-rough)">
        <g fill="none" strokeLinecap="round">
          <g stroke="#9c7442" strokeWidth="20">
            {TRAILS.map((d) => <path key={d} d={d} />)}
          </g>
          <g stroke="#c9a068" strokeWidth="13">
            {TRAILS.map((d) => <path key={d} d={d} />)}
          </g>
        </g>
        <g fill="#d9bb7c" stroke="#a9884f" strokeWidth="2">
          <ellipse cx="230" cy="245" rx="80" ry="46" />
          <ellipse cx="670" cy="245" rx="80" ry="46" />
          <ellipse cx="230" cy="470" rx="80" ry="46" />
          <ellipse cx="670" cy="470" rx="80" ry="46" />
          <ellipse cx={PLAZA.x} cy="528" rx="62" ry="34" />
        </g>
        <ellipse cx={PLAZA.x} cy={PLAZA.y} rx="72" ry="50" fill="#c8b38a" stroke="#8b7754" strokeWidth="2" />
        <g fill="#9f9886" stroke="#5f5a4c" strokeWidth="1.5">
          {STONES.map(([x, y]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="9" ry="6" />)}
        </g>
        {TREES.map(([x, y]) => <use key={`${x}-${y}`} href="#vb-tree" x={x} y={y} />)}
      </g>
    </g>
  )
}

// 맑은 하늘 해 주변 ✦ 반짝이 자리 [x, y, 크기 배율, 시작 어긋남(초)]
const SKY_SPARKS = [
  [702, 28, 0.9, 0],
  [826, 32, 1, -0.8],
  [812, 90, 0.75, -1.6],
] as const

// 하늘: 정답이 위험이면 태풍 구름, 안전이면 맑은 하늘
function Sky({ danger, highlighted = false }: { danger: boolean; highlighted?: boolean }) {
  return (
    <g
      className={highlighted ? 'vb-sky vb-tut-hl' : 'vb-sky'}
      role="img"
      aria-label={
        danger
          ? '하늘: 이번 판 진짜 날씨는 태풍, 주민들은 대피해야 합니다. 내 목표: 주민을 집에 붙잡아 두기'
          : '하늘: 이번 판 진짜 날씨는 맑음, 주민들은 집에 있어야 합니다. 내 목표: 주민을 대피시키기'
      }
    >
      <g filter="url(#vb-rough)" aria-hidden>
        <path
          d="M0 0 H900 V96 Q850 112 800 98 Q740 118 680 100 Q610 120 540 102 Q470 118 400 100 Q330 116 260 99 Q190 114 120 98 Q60 112 0 98 Z"
          fill={danger ? '#c4ced2' : '#bcdbe6'}
        />
      </g>
      {danger ? (
        <>
          <g className="vb-cloud" fill="#7d8c96" aria-hidden>
            <ellipse cx="665" cy="44" rx="70" ry="30" />
            <ellipse cx="735" cy="34" rx="62" ry="30" />
            <ellipse cx="815" cy="46" rx="74" ry="32" />
            <ellipse cx="885" cy="30" rx="60" ry="30" />
          </g>
          <g className="vb-cloud is-b" fill="#5f6f7b" aria-hidden>
            <ellipse cx="725" cy="62" rx="80" ry="20" />
            <ellipse cx="845" cy="66" rx="80" ry="20" />
          </g>
          <g className="vb-wind" stroke="#eef2f2" strokeWidth="2.5" fill="none" strokeLinecap="round" aria-hidden>
            <path d="M120 40 Q180 26 230 42 Q265 54 300 38" />
            <path d="M150 70 Q205 58 250 70 Q280 78 315 64 a10 10 0 1 0 -6 -14" />
            <path d="M70 78 Q110 68 150 78" />
          </g>
          <g stroke="#5f6f7b" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path className="vb-rain" d="M665 76 l-6 12 M729 78 l-6 12 M793 78 l-6 12 M857 78 l-6 12" />
            <path className="vb-rain is-b" d="M697 78 l-6 12 M761 80 l-6 12 M825 80 l-6 12" />
          </g>
        </>
      ) : (
        <>
          <circle cx="760" cy="54" r="30" fill="#ffd35a" stroke="#c98f1e" strokeWidth="2.5" aria-hidden />
          <g className="vb-sun-rays" stroke="#e0a72a" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M760 10 v8 M760 90 v8 M716 54 h8 M796 54 h8 M729 23 l6 6 M785 79 l6 6 M729 85 l6 -6 M785 29 l6 -6" />
          </g>
          {SKY_SPARKS.map(([x, y, s, delay]) => (
            <g key={`${x}-${y}`} transform={`translate(${x},${y}) scale(${s})`} aria-hidden>
              <path
                className="vb-twinkle"
                style={{ animationDelay: `${delay}s` }}
                d="M0 -8 L2.2 -2.2 L8 0 L2.2 2.2 L0 8 L-2.2 2.2 L-8 0 L-2.2 -2.2 Z"
                fill="#ffd35a"
                stroke="#e0a72a"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </g>
          ))}
          <g className="vb-cloud is-slow" fill="#f4f8f8" aria-hidden>
            <ellipse cx="640" cy="60" rx="46" ry="16" />
            <ellipse cx="672" cy="50" rx="30" ry="16" />
          </g>
          <g className="vb-cloud is-slow is-b" fill="#f4f8f8" aria-hidden>
            <ellipse cx="860" cy="62" rx="40" ry="14" />
          </g>
        </>
      )}
      <text x="450" y="40" fontSize="18" fontWeight="700" textAnchor="middle" className="vb-pencil" aria-hidden>
        {danger ? '이번 판 진짜 날씨: 태풍' : '이번 판 진짜 날씨: 맑음'}
      </text>
      <text x="450" y="62" fontSize="14.5" textAnchor="middle" aria-hidden>
        {danger ? '내 목표: 주민을 집에 붙잡아 두기' : '내 목표: 주민을 대피시키기'}
      </text>
      {highlighted && <rect className="vb-tut-ring" x="8" y="6" width="884" height="92" rx="10" aria-hidden />}
    </g>
  )
}

// 달력 트랙 15칸. 지난 날은 짙게, 말은 오늘(끝났으면 마지막 날)에 선다.
function Calendar({ turn, over }: { turn: number; over: boolean }) {
  const day = over ? turn : Math.min(turn + 1, TOTAL_TURNS)
  const left = TOTAL_TURNS - turn
  const px = cellX(day) + CELL_W / 2
  return (
    <g role="img" aria-label={`달력: 마지막 밤 D-${left}, ${day}/${TOTAL_TURNS}일`}>
      <rect x="0" y="598" width="900" height="62" fill="#7a5530" />
      <rect x="0" y="598" width="900" height="62" filter="url(#vb-grain)" />
      <text x="30" y="620" fontSize="14" fontWeight="700" className="vb-light">
        마지막 밤
      </text>
      <g filter="url(#vb-rough)" stroke="#4a3119" strokeWidth="1.5">
        {Array.from({ length: TOTAL_TURNS }, (_, i) => i + 1).map((d) => (
          <rect
            key={d}
            x={cellX(d)}
            y="610"
            width={CELL_W}
            height={CELL_W}
            rx="4"
            fill={d === TOTAL_TURNS ? '#8fa0a8' : d <= turn ? '#b99662' : '#ecd9aa'}
          />
        ))}
        <path d="M785 629 m0 -1 a3 3 0 1 1 3 3 a7 7 0 1 1 -7 -7 a11 11 0 0 1 11 11" fill="none" stroke="#2c3d4f" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g fontSize="13.5" fontWeight="700" textAnchor="middle" className="vb-cal-num" aria-hidden>
        {Array.from({ length: TOTAL_TURNS - 1 }, (_, i) => i + 1)
          .filter((d) => d !== day)
          .map((d) => (
            <text key={d} x={cellX(d) + CELL_W / 2} y="642">
              {d}
            </text>
          ))}
      </g>
      <g filter="url(#vb-rough)" aria-hidden>
        <ellipse cx={px} cy="645" rx="13" ry="4" fill="#2a1a0c" opacity=".35" />
        <path d={`M${px - 11} 645 Q${px} 600 ${px + 11} 645 Z`} fill="#c0392b" stroke="#4a1a10" strokeWidth="2" />
        <circle cx={px} cy="614" r="8" fill="#c0392b" stroke="#4a1a10" strokeWidth="2" />
      </g>
      <text x="30" y="650" fontSize="28" fontWeight="700" className="vb-dday vb-pencil" aria-hidden>
        D-{left}
      </text>
      <text x="852" y="642" fontSize="14" fontWeight="700" textAnchor="middle" className="vb-light" aria-hidden>
        {day}/{TOTAL_TURNS}일
      </text>
    </g>
  )
}

// 보드 하단 상시 범례: 깃발(지난밤 결정)과 창문 불빛(다음 관측).
function BoardLegend() {
  return (
    <g
      className="vb-legend"
      role="img"
      aria-label="보드 범례: 깃발은 지난밤 결정(대피/잔류)이에요. 창문 불이 켜지면 다음 관측이 맞고, 꺼지면 틀려요."
    >
      <rect x="0" y="660" width="900" height="38" fill="#efe0b9" />
      <line x1="0" y1="660" x2="900" y2="660" stroke="#4a3119" strokeWidth="2" />
      <g aria-hidden>
        <use href="#vb-flag-evacuate" transform="translate(108,691) scale(.48)" />
        <use href="#vb-flag-stay" transform="translate(136,691) scale(.48)" />
        <text x="168" y="684" fontSize="14.5" fontWeight="700">
          깃발: 지난밤 결정(대피/잔류)
        </text>
        <line x1="420" y1="669" x2="420" y2="689" stroke="#c3a878" strokeWidth="1.5" />
        <use href="#vb-win-on" transform="translate(450,679) scale(.85)" />
        <text x="468" y="684" fontSize="14.5" fontWeight="700">
          창문 불 켜짐: 다음 관측 맞음
        </text>
        <use href="#vb-win-off" transform="translate(698,679) scale(.85)" />
        <text x="714" y="684" fontSize="14.5" fontWeight="700">
          꺼짐: 틀림
        </text>
      </g>
    </g>
  )
}

// 쪽지 하나로 바뀔 의심도 읽기용 문구. 예) "의심도 50에서 70, 재판 열림"
const previewText = (p: Preview) => `의심도 ${p.from}에서 ${p.next}${p.trial ? ', 재판 열림' : ''}`

function houseLabel(h: House, playerCity: number) {
  const name = `${h.city}번 집`
  if (h.role === 'player') return `${name}, 나(마피아)`
  if (h.role === 'colleague') return `${name}, 동료 마피아`
  const others = h.suspicions
    ? Object.entries(h.suspicions)
        .map(([city, value]) => [Number(city), value] as const)
        .filter(([city, value]) => city !== playerCity && value > 0)
        .sort(([a], [b]) => a - b)
        .map(([city, value]) => `${city}번 집 의심도 ${value}`)
    : []
  return [
    `${name}, 주민`,
    h.flag ? `지난밤 결정 ${decisions[h.flag]}` : '아직 결정 없음',
    h.lit != null && `다음 관측 ${h.lit ? '맞음(불 켜짐)' : '틀림(불 꺼짐)'}`,
    h.suspicion != null &&
      `나에 대한 의심도 ${h.suspicion}${h.suspicion >= SUSPICION.threshold ? ', 재판 기준 넘음' : ''}`,
    ...others,
    !h.reachable && '쪽지를 보낼 수 없음',
  ]
    .filter(Boolean)
    .join(', ')
}

// 집 하나. pick이 있으면 눌러서 쪽지를 여는 버튼이 된다 (명세 1번).
// changed: 어제와 달라진 점 (힌트 바뀜, 새 점선). 어제 쪽지를 그대로 두었으니 여기만 다시 보면 된다.
type Pick = { claim?: Claim; open: boolean; preview: Preview | null; changed?: string[]; onOpen: () => void }

const VOTE_ROWS = [
  { side: 1 as const, claim: 'evacuate' as const, label: '대피', top: 6, tagRx: 7, blkRx: 2.5, dotFill: '#f3e7c6' },
  { side: -1 as const, claim: 'stay' as const, label: '잔류', top: 27, tagRx: 2, blkRx: 1, dotFill: '#3d3a36' },
] as const

// ③ 주민 결정 단계의 집별 표 줄: 실제 저울 값(citizenScales)을 대피·잔류 두 줄로 쌓고, 많은 쪽을 손그림 선과 꼬리표로 가리킨다.
function VoteStack({ x, y, scale, me, animate }: { x: number; y: number; scale: Scale; me: number; animate: boolean }) {
  let blockIndex = 0
  const rows = VOTE_ROWS.map((row) => {
    let cursor = 39
    const blocks = scale.parts
      .filter((p) => p.value * row.side > 0)
      .map((p) => {
        const w = Math.max(4, Math.min(18, Math.round((Math.abs(p.value) / 100) * 15)))
        const item = { from: p.from, x: cursor, w, index: blockIndex++ }
        cursor += w + 2
        return item
      })
    return { ...row, blocks, endX: blocks.length > 0 ? cursor - 2 : 35 }
  })
  const leader = scaleLeader(scale)
  const delays = voteAnimDelays(blockIndex)
  const targetRow = rows.find((r) => r.claim === leader.side) ?? rows[0]
  const x0 = 3
  const x1 = Math.min(123, Math.max(56, targetRow.endX + 4))
  const y0 = targetRow.top - 2.5
  const y1 = targetRow.top + 16.5
  const ym = (y0 + y1) / 2
  const markPath =
    leader.winner === 'tie'
      ? `M 5 ${targetRow.top + 16.5} Q ${(5 + x1) / 2} ${targetRow.top + 18.2} ${x1} ${targetRow.top + 15.8}`
      : `M ${x0 + 8} ${y0} Q ${(x0 + x1) / 2} ${y0 - 1.8} ${x1 - 5} ${y0 + 0.6} Q ${x1 + 2.5} ${ym} ${x1 - 4} ${y1 - 0.5} Q ${(x0 + x1) / 2} ${y1 + 1.8} ${x0 + 6} ${y1 - 0.5} Q ${x0 - 2} ${ym} ${x0 + 10} ${y0 + 0.5}`
  return (
    <g transform={`translate(${x - 134},${y - 118})`} aria-hidden="true">
      <g className={animate ? 'vb-votes is-anim' : 'vb-votes'}>
        <rect width="126" height="48" rx="5" fill="#f6ebcd" stroke="#6b4a2a" strokeWidth="1.8" filter="url(#vb-rough)" />
        {rows.map((row) => (
          <g key={row.claim}>
            <g className={`vb-votes-tag is-${row.claim}`}>
              <rect x="5" y={row.top} width="30" height="14" rx={row.tagRx} strokeWidth="1.2" />
              <text x="20" y={row.top + 10.5} fontSize="11.5" fontWeight="700" textAnchor="middle">
                {row.label}
              </text>
            </g>
            {row.blocks.map((b) => (
              <g
                key={String(b.from)}
                className="vb-vote-blk"
                style={
                  animate
                    ? { animationDelay: `${VOTE_ANIM.blockStartMs + b.index * VOTE_ANIM.blockStaggerMs}ms` }
                    : undefined
                }
              >
                <rect
                  x={b.x}
                  y={row.top + 1}
                  width={b.w}
                  height="12"
                  rx={row.blkRx}
                  className={`vb-vote-sq is-${row.claim}${b.from === me ? ' is-mine' : ''}`}
                />
                {b.from === 'hint' && <circle cx={b.x + b.w / 2} cy={row.top + 7} r="2" fill={row.dotFill} />}
              </g>
            ))}
          </g>
        ))}
        <path
          d={markPath}
          pathLength="100"
          className={`vb-votes-mark is-${leader.winner}`}
          filter="url(#vb-rough)"
          style={animate ? ({ '--mark-delay': `${delays.markDelay}ms` } as CSSProperties) : undefined}
        />
        <g
          className={`vb-votes-leader is-${leader.winner}`}
          style={animate ? ({ '--tag-delay': `${delays.tagDelay}ms` } as CSSProperties) : undefined}
        >
          <rect x="-8" y="-32" width="142" height="26" rx="13" strokeWidth="2" filter="url(#vb-rough)" />
          <text x="63" y="-13" fontSize="18" fontWeight="700" textAnchor="middle">
            {leader.label}
          </text>
        </g>
      </g>
    </g>
  )
}

// swayed: 내 쪽지가 없었다면 반대로 골랐을 시민 (작은 불꽃 한 번)
function HouseView({
  h,
  playerCity,
  pick,
  inspect,
  voteBar,
  freshFlag = false,
  swayed,
  highlight,
  pointed = false,
}: {
  h: House
  playerCity: number
  pick?: Pick
  inspect?: { onEnter: () => void; onLeave: () => void; onFocus: (e: FocusEvent<SVGGElement>) => void; onBlur: () => void }
  voteBar?: { scale: Scale; me: number; animate: boolean }
  freshFlag?: boolean
  swayed?: boolean
  highlight?: TutorialHighlight | null
  pointed?: boolean
}) {
  const { x, y } = h
  const base = `${houseLabel(h, playerCity)}${swayed ? ', 내 쪽지에 넘어옴' : ''}`
  const label = pick
    ? `${base}${pick.changed ? `, 변동: ${pick.changed.join(', ')}` : ''}. 쪽지 고르기, 지금 ${pick.claim ? decisions[pick.claim] : '없음'}${pick.preview ? `, ${previewText(pick.preview)}` : ''}`
    : base
  const mafia = h.role !== 'citizen'
  const over = h.suspicion != null && h.suspicion >= SUSPICION.threshold
  // 어긋난 쪽지 한 장이면 재판: 막대가 약하게 두근거린다
  const near = !over && h.suspicion != null && h.suspicion >= SUSPICION.threshold - SUSPICION.disagree
  const postX = -48 + 0.96 * SUSPICION.threshold
  const hlHouse = Boolean(pick && pointed)
  const hlWindow = highlight === 'windows'
  const hlSuspicion = highlight === 'suspicion'
  const hlFlag = highlight === 'flags'
  const hlChanged = highlight === 'changed'
  const focusable = Boolean(pick || inspect)
  const delays = voteBar ? voteAnimDelays(voteBar.scale.parts.filter((p) => p.value !== 0).length) : null
  return (
    <g
      className={`vb-house${h.role === 'citizen' && !h.reachable ? ' is-far' : ''}${pick?.open ? ' is-open' : ''}${hlHouse ? ' vb-tut-hl' : ''}`}
      {...(pick
        ? { role: 'button', tabIndex: 0, 'aria-expanded': pick.open, onClick: pick.onOpen, onKeyDown: onActivateKey(pick.onOpen) }
        : focusable
          ? { role: 'group', tabIndex: 0 }
          : { role: 'img' })}
      onMouseEnter={inspect?.onEnter}
      onMouseLeave={inspect?.onLeave}
      onFocus={inspect?.onFocus}
      onBlur={inspect?.onBlur}
      data-city={h.city}
      aria-label={label}
    >
      <title>{label}</title>
      {focusable && <ellipse className="vb-hl" cx={x} cy={y + 2} rx="62" ry="17" />}
      {hlHouse && <ellipse className="vb-tut-ring" cx={x} cy={y - 30} rx="62" ry="48" filter="url(#vb-rough)" aria-hidden />}
      {h.role === 'player' ? (
        <g filter="url(#vb-rough)" transform={`translate(${x},${y}) scale(.8)`}>
          <use href="#vb-hut-dark" />
        </g>
      ) : (
        <use href={mafia ? '#vb-hut-dark' : '#vb-hut'} x={x} y={y} filter="url(#vb-rough)" />
      )}
      {h.role === 'player' ? (
        <g>
          <circle cx={x - 52} cy={y - 28} r="15" className="vb-badge is-mafia" strokeWidth="2.5" />
          <text x={x - 52} y={y - 22} fontSize="15.5" fontWeight="700" textAnchor="middle" className="vb-light">
            나
          </text>
        </g>
      ) : (
        <g>
          <circle cx={x - 64} cy={y - 38} r="15" className={`vb-badge${mafia ? ' is-mafia' : ''}`} strokeWidth="2.5" />
          <text x={x - 64} y={y - 32} fontSize="17" fontWeight="700" textAnchor="middle" className={`vb-pencil${mafia ? ' vb-light' : ''}`}>
            {h.city}
          </text>
        </g>
      )}
      {mafia && (
        <text x={x} y={y + 36} fontSize="14.5" fontWeight="700" textAnchor="middle">
          {h.city}번 집{h.role === 'colleague' && ' · 동료'}
        </text>
      )}
      {h.flag && (
        <g transform={`translate(${x + 28},${y - 62})`}>
          <g
            key={freshFlag ? `fresh-${h.flag}` : h.flag}
            className={`vb-flag${freshFlag ? ' is-fresh' : ''}${freshFlag && voteBar ? ' after-votes' : ''}${hlFlag ? ' vb-tut-hl' : ''}`}
            style={freshFlag && delays ? ({ '--flag-delay': `${delays.flagDelay}ms` } as CSSProperties) : undefined}
          >
            <use href={`#vb-flag-${h.flag}`} />
            {hlFlag && <rect className="vb-tut-ring" x="-6" y="-61" width="60" height="64" rx="8" aria-hidden />}
          </g>
        </g>
      )}
      {voteBar && <VoteStack x={x} y={y} {...voteBar} />}
      {swayed && (
        <g
          className="vb-spark"
          transform={`translate(${x + 8},${y - 78})`}
          style={delays ? ({ '--spark-delay': `${delays.sparkDelay}ms` } as CSSProperties) : undefined}
          aria-hidden
        >
          <path d="M0 -13 L3.5 -3.5 L13 0 L3.5 3.5 L0 13 L-3.5 3.5 L-13 0 L-3.5 -3.5 Z" />
        </g>
      )}
      {h.lit != null && (
        <g className={hlWindow ? 'vb-window vb-tut-hl' : 'vb-window'}>
          <use href={h.lit ? '#vb-win-on' : '#vb-win-off'} x={x - 18} y={y - 20} filter="url(#vb-rough)" />
          {hlWindow && <rect className="vb-tut-ring" x={x - 32} y={y - 33} width="28" height="26" rx="6" aria-hidden />}
        </g>
      )}
      {h.suspicion != null && (
        <g
          transform={`translate(${x - 20},${y + 30})`}
          className={`${over ? 'vb-gauge is-over' : near ? 'vb-gauge is-near' : 'vb-gauge'}${hlSuspicion ? ' vb-tut-hl' : ''}`}
        >
          {hlSuspicion && <rect className="vb-tut-ring" x="-56" y="-15" width="146" height="41" rx="8" aria-hidden />}
          <rect x="-50" y="-5" width="100" height="10" rx="5" fill="#5a3d22" />
          <rect className="vb-gauge-fill" x="-48" y="-3" width="96" height="6" rx="3" style={{ transform: `scaleX(${Math.min(h.suspicion, 100) / 100})` }} />
          {/* 재판 기준 60 말뚝 */}
          <g className="vb-post">
            <path d={`M${postX} -9 V10`} />
            <path d={`M${postX - 5} -9 H${postX + 5}`} />
            <text x={postX} y="22" fontSize="11.5" fontWeight="700" textAnchor="middle" className="vb-post-label" aria-hidden>
              재판 {SUSPICION.threshold}
            </text>
          </g>
          {over && (
            <g className="vb-knot" aria-hidden>
              <circle cx="-62" r="10" fill="#a8361f" stroke="#4a1a10" strokeWidth="1.5" />
              <text x="-62" y="5.5" fontSize="15" fontWeight="800" textAnchor="middle" className="vb-light">
                !
              </text>
            </g>
          )}
          {over && <rect x="53" y="-14" width="32" height="26" rx="3" fill="#a8361f" />}
          <text x="56" y="6" fontSize="18" fontWeight="700" className={over ? 'vb-light' : undefined}>
            {h.suspicion}
          </text>
          {pick?.preview && (pick.preview.next !== h.suspicion || pick.preview.trial) && (
            <text x="88" y="6" fontSize="17.5" fontWeight="700" className={worsens(pick.preview) ? 'vb-rust' : 'vb-green'}>
              →{pick.preview.next}
              {pick.preview.trial && ' 재판'}
            </text>
          )}
        </g>
      )}
      {pick?.claim && <use href={`#vb-note-${pick.claim}`} x={x + 70} y={y - 30} />}
      {pick?.changed && (
        <g
          className={hlChanged ? 'vb-new vb-tut-hl' : 'vb-new'}
          transform={`translate(${x - 10},${y + (h.suspicion != null ? 70 : 54)})`}
          aria-hidden
        >
          <rect x="-92" y="-11.5" width="184" height="23" rx="11.5" />
          <text y="4.5" fontSize="13.5" fontWeight="700" textAnchor="middle" className="vb-light">
            변동: {pick.changed.join('·')}
          </text>
          {hlChanged && <rect className="vb-tut-ring" x="-96" y="-15.5" width="192" height="31" rx="15.5" />}
        </g>
      )}
    </g>
  )
}

// 광장 재판: 투표한 시민의 말이 광장에서 지목한 집으로 실을 잇는다.
// shown: 지금까지 나온 지목 수, verdict: 판정 도장을 찍었는가 (연출 중에는 한 명씩).
function Trial({
  vote,
  houses,
  shown = Infinity,
  verdict = true,
}: {
  vote: NonNullable<TurnResult['vote']>
  houses: House[]
  shown?: number
  verdict?: boolean
}) {
  const at = (city: number) => houses.find((h) => h.city === city)!
  const ballots = Object.entries(vote.ballots).slice(0, shown)
  const votes = tally(Object.fromEntries(ballots))
  const stamp =
    vote.accused === null ? '과반 없음' : `${vote.accused}번 집 ${vote.caught ? '발각' : '무고한 주민 지목'}`
  const stampW = Math.max(STAMP.minW, stamp.length * STAMP.charW + STAMP.padX)
  const stampX = PLAZA.x - stampW / 2
  // 연출 중에는 지금까지 나온 지목만 읽어 준다
  const label = `광장 재판: ${ballots.map(([from, to]) => `${from}번이 ${to}번 지목`).join(', ')}${
    verdict ? `. 결과 ${stamp}` : ''
  }`
  return (
    <g role="img" aria-label={label}>
      <title>{label}</title>
      {ballots.map(([from, to]) => {
        const v = at(Number(from))
        const t = at(to)
        const d = Math.hypot(v.x - PLAZA.x, v.y - PLAZA.y)
        const px = PLAZA.x + ((v.x - PLAZA.x) / d) * 56
        const py = PLAZA.y + ((v.y - PLAZA.y) / d) * 40
        // 지붕 쪽을 겨눠 화살촉이 집 아래 의심 게이지 숫자를 가리지 않게
        const ty = t.y - 40
        const e = Math.hypot(t.x - px, ty - py)
        const ex = t.x - ((t.x - px) / e) * 50
        const ey = ty - ((ty - py) / e) * 36
        const cx = (px + ex) / 2 + ((ey - py) / e) * 30
        const cy = (py + ey) / 2 - ((ex - px) / e) * 30
        return (
          <g key={from} className="vb-ballot">
            <path d={`M${px} ${py - 18} Q${cx} ${cy} ${ex} ${ey}`} fill="none" stroke="#7a2416" strokeWidth="2.6" strokeDasharray="7 5" markerEnd="url(#vb-arr)" />
            <g transform={`translate(${px},${py})`}>
              <use href="#vb-pawn" />
              <text y="-5.5" fontSize="13" fontWeight="700" textAnchor="middle">
                {from}
              </text>
            </g>
          </g>
        )
      })}
      {Object.entries(votes).map(([city, n]) => {
        const t = at(Number(city))
        return (
          <g key={city} transform={`translate(${t.x + (t.x > PLAZA.x ? 68 : -108)},${t.y - 14})`} fontSize="14" fontWeight="700">
            <rect width="40" height="22" rx="3" fill="#7a2416" />
            <text x="20" y="15.5" textAnchor="middle" className="vb-light">
              {n}표
            </text>
          </g>
        )
      })}
      {verdict && (
        <g className={vote.caught ? 'vb-stamp is-caught' : 'vb-stamp'}>
          <rect x={stampX} y={STAMP.y} width={stampW} height={STAMP.h} rx="3" strokeWidth="2.5" />
          <rect x={stampX + 4} y={STAMP.y + 4} width={stampW - 8} height={STAMP.h - 8} rx="2" fill="none" strokeWidth="1" />
          <text x={PLAZA.x} y={STAMP.y + 21} fontSize="15.5" fontWeight="700" textAnchor="middle">
            {stamp}
          </text>
          <rect className="vb-stamp-ink" x={stampX} y={STAMP.y} width={stampW} height={STAMP.h} rx="3" aria-hidden />
        </g>
      )}
    </g>
  )
}

// 밤에 오솔길을 따라 각 집으로 가는 말: 내 쪽지(큰 쪽지)와 다른 집의 주장(작은 쪽지).
function Talk({ result, player }: { result: TurnResult; player: number }) {
  const notes = talkNotes(player, result).sort((a, b) => Number(a.from === player) - Number(b.from === player)) // 내 쪽지를 맨 위에
  return (
    <g aria-hidden>
      {notes.map((n, i) => (
        <g
          key={`${n.from}-${n.to}`}
          className={n.from === player ? 'vb-fly' : 'vb-fly is-other'} // 다른 주민끼리 오가는 쪽지는 흐리게
          style={{ offsetPath: `path("${n.path}")`, animationDelay: `${Math.min(i * 20, 160)}ms` }} // 출발을 조금씩 엇갈리게
        >
          <use href={`#vb-note-${n.claim}`} transform={n.from === player ? undefined : 'scale(.6)'} />
        </g>
      ))}
    </g>
  )
}

// 집 옆에서 펼쳐지는 쪽지: 대피/잔류와 의심도 변화 미리보기 (명세 1번).
function NoteCard({
  h,
  claim,
  preview,
  onClaim,
  onCardFocusChange,
  highlightSuspicion = false,
}: {
  h: House
  claim?: Claim
  preview: (c: Claim) => Preview | null
  onClaim: (c: Claim) => void
  onCardFocusChange: (focused: boolean) => void
  highlightSuspicion?: boolean
}) {
  const cardW = 192
  const left = h.x < PLAZA.x
  const pEvac = preview('evacuate')
  const pStay = preview('stay')
  const hasPreview = Boolean(pEvac || pStay)
  const hasTrial = Boolean(pEvac?.trial || pStay?.trial)
  const cardH = hasPreview ? (hasTrial ? 108 : 88) : 68
  // 위쪽 집은 점선 이름표(y=228) 위로(하늘 경계 y=106 아래), 아래쪽 집은 광장(y=395)·양쪽 오솔길(y<=397)·게이지(x<=352, x>=578) 사이 빈 공간에 놓는다.
  const cx = h.y < 300 ? (left ? h.x + 100 : h.x - 100 - cardW) : 354
  const cy = h.y < 300 ? Math.max(106, Math.min(h.y - 54, 224 - cardH)) : 398
  return (
    <g transform={`translate(${cx},${cy})`}>
      <g
        className={`vb-card${left ? ' from-left' : ' from-right'}`}
        role="group"
        aria-label={`${h.city}번 집에 보낼 쪽지`}
        onFocus={() => onCardFocusChange(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onCardFocusChange(false)
        }}
      >
        <rect x="4" y="5" width={cardW} height={cardH} rx="2" fill="#2a1a0c" opacity=".25" />
        <rect width={cardW} height={cardH} rx="2" fill="#f6ebcd" stroke="#8a6a3e" strokeWidth="1.5" />
        <circle cx="10" cy="11" r="4.5" fill="#a8361f" stroke="#4a1a10" />
        <text x="20" y="22" fontSize="18" fontWeight="700">
          {h.city}번 집에 보낼 쪽지
        </text>
        {(['evacuate', 'stay'] as const).map((c, i) => {
          const p = c === 'evacuate' ? pEvac : pStay
          const btnX = 14 + i * 86
          return (
            <g key={c}>
              <g
                className={`vb-opt is-${c}${claim === c ? ' is-sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={claim === c}
                aria-label={`${decisions[c]}${p ? `, ${previewText(p)}` : ''}`}
                onClick={() => onClaim(c)}
                onKeyDown={onActivateKey(() => onClaim(c))}
              >
                <rect x={btnX} y="30" width="78" height="30" rx="3" />
                <text x={btnX + 39} y="51" fontSize="18" fontWeight="700" textAnchor="middle">
                  {decisions[c]}
                </text>
              </g>
              {p && (
                <g fontWeight="700" textAnchor="middle" aria-hidden>
                  <text x={btnX + 39} y="79" fontSize="18" className={worsens(p) ? 'vb-rust' : 'vb-green'}>
                    {p.from} → {p.next}
                  </text>
                  {p.trial && (
                    <text x={btnX + 39} y="98" fontSize="18" className="vb-rust">
                      재판 열림
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}
        {highlightSuspicion && hasPreview && (
          <rect className="vb-tut-ring" x="10" y="63" width="172" height={hasTrial ? 40 : 21} rx="5" aria-hidden />
        )}
      </g>
    </g>
  )
}

const SIGNS = ['1 불빛부터 봐요', '2 집마다 쪽지 골라요', '3 쪽지 비교엔 같은 쪽지']

// 첫날 안내 표지판 (왼쪽 나무 기둥).
function Signs() {
  return (
    <g
      fontSize="14"
      fontWeight="700"
      role="img"
      aria-label="첫날 안내: 1 창문 불빛부터 봐요, 2 집마다 쪽지를 골라요, 3 오늘 밤 쪽지 비교로 이어진 두 집에는 같은 쪽지를 보내요"
    >
      <rect x="80" y="302" width="9" height="112" fill="#5a3d22" filter="url(#vb-rough)" />
      <text x="16" y="298" className="vb-sign-title">
        첫날 안내
      </text>
      {SIGNS.map((t, i) => (
        <g key={t} className="vb-sign" style={{ animationDelay: `${80 + i * 80}ms` }}>
          <path
            d={`M8 ${308 + i * 33} H174 L184 ${322 + i * 33} L174 ${336 + i * 33} H8 Z`}
            fill="#c99a5b"
            stroke="#4a3119"
            strokeWidth="2"
            filter="url(#vb-rough)"
          />
          <text x="14" y={327 + i * 33}>
            {t}
          </text>
        </g>
      ))}
    </g>
  )
}

// 튜토리얼 행동 단계(집 누르기): 안내 대상 집 옆의 빈 풀밭에 손그림 화살표와 "여기를 눌러 보세요" 쪽지를 놓는다.
function HousePointer({ target }: { target: House }) {
  const left = target.x < PLAZA.x
  const top = left && target.y < PLAZA.y
  const noteX = left ? 24 : 700
  const noteY = top ? 314 : 346
  const noteW = 176
  const noteH = 38
  const fold = 12
  const dx = left ? '4px' : '-4px'
  const dy = top ? '-4px' : '4px'
  const arrowD = left
    ? top
      ? 'M 160 309 Q 184 288 206 266 M 192 267 L 207 265 L 204 280'
      : 'M 160 389 Q 184 408 206 424 M 192 422 L 207 425 L 203 410'
    : 'M 740 389 Q 716 408 694 424 M 708 422 L 693 425 L 697 410'
  return (
    <g className="vb-tut-pointer" aria-hidden="true">
      <g filter="url(#vb-rough)">
        <path
          d={`M${noteX} ${noteY} H${noteX + noteW - fold} L${noteX + noteW} ${noteY + fold} V${noteY + noteH} H${noteX} Z`}
          fill="#f6ebcd"
          stroke="#a8361f"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d={`M${noteX + noteW - fold} ${noteY} V${noteY + fold} H${noteX + noteW}`}
          fill="#e4d2a6"
          stroke="#a8361f"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
      <text
        x={noteX + (noteW - fold / 2) / 2}
        y={noteY + 25}
        fontSize="18"
        fontWeight="700"
        textAnchor="middle"
        className="vb-pencil-sm"
      >
        여기를 눌러 보세요
      </text>
      <g className="vb-tut-arrow" style={{ '--dx': dx, '--dy': dy } as CSSProperties}>
        <path
          d={arrowD}
          fill="none"
          stroke="#7a2416"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#vb-rough)"
        />
      </g>
    </g>
  )
}

function ContradictionKnot({ x, y, label, text, title }: { x: number; y: number; label: string; text: string; title?: boolean }) {
  return (
    <g role="img" aria-label={label}>
      {title && <title>{label}</title>}
      <g className="vb-knot">
        <use href="#vb-knot" x={x} y={y} />
      </g>
      <rect x={x - 54} y={y - 52} width="108" height="25" rx="4" fill="#f6ebcd" stroke="#a8361f" strokeWidth="1.5" />
      <text x={x} y={y - 34} fontSize="15" fontWeight="700" textAnchor="middle" className="vb-rust">
        {text}
      </text>
    </g>
  )
}

// 시민 집에 마우스를 올리거나 초점을 맞추면 그 주민이 다른 집(나 포함)을 의심하는 정도를 손그림 선과 꼬리표로 보여 준다.
function SuspicionLines({ links }: { links: SuspicionLink[] }) {
  if (links.length === 0) return null
  return (
    <g className="vb-sus-links" aria-hidden="true">
      {links.map((link) => {
        const over = link.value >= SUSPICION.threshold
        const w = link.value >= 100 ? 44 : 36
        return (
          <g key={`${link.from}-${link.to}`} className={over ? 'vb-sus-link is-over' : 'vb-sus-link'}>
            <path
              d={link.path}
              className="vb-sus-path"
              strokeWidth={link.strokeWidth}
              markerEnd="url(#vb-sus-arr)"
              filter="url(#vb-rough)"
            />
            <g transform={`translate(${link.labelX},${link.labelY})`} className="vb-sus-tag">
              <rect x={-w / 2} y="-12" width={w} height="24" rx="12" strokeWidth={over ? 2 : 1.6} />
              <text y="5.5" fontSize="15" fontWeight="700" textAnchor="middle">
                {link.value}
              </text>
            </g>
          </g>
        )
      })}
    </g>
  )
}

type NotePicker = {
  claims: Record<string, Claim>
  onClaim: (city: number, claim: Claim) => void
  ruled: boolean // 7.6 규칙 시민일 때만 의심도 미리보기
}

// 밤 연출 중인 단계. prev는 지난 턴 결과 (깃발·의심도가 바뀌기 전 모습).
type Stage = { phase: Phase; ballots: number; decided: number; prev: TurnResult | null }

// 숲속 마을 보드 (명세 2번). result가 없으면 1턴 전, 있으면 그 턴이 끝난 상태를 그린다.
// picker가 있으면 집을 눌러 다음 턴에 할 말을 고른다 (명세 1번).
// stage가 있으면 그 턴의 밤을 단계별로 보여 준다 (밤 → 쪽지 → 깃발 → 의심 → 재판 → 판정 → 다음 날).
export function VillageBoard({
  state,
  result,
  picker,
  stage,
  scales = {},
  swayed = [],
  highlight = null,
  hideSigns = false,
  onCardOpen,
  boardRef,
}: {
  state: GameState
  result: TurnResult | null
  picker?: NotePicker
  stage?: Stage
  scales?: Record<number, Scale> // ③ 주민 결정 표 줄에 쓸 실제 저울 값 (citizenScales)
  swayed?: number[] // 내 쪽지가 결정을 뒤집은 시민 (citizenScales)
  highlight?: TutorialHighlight | null // 튜토리얼 강조 대상 이름
  hideSigns?: boolean // 튜토리얼에서는 첫날 안내 표지판을 숨긴다
  onCardOpen?: (city: number | null) => void
  boardRef?: RefObject<SVGSVGElement | null>
}) {
  const [open, setOpen] = useState<number | null>(null)
  const [prevHighlight, setPrevHighlight] = useState(highlight)
  const [hovered, setHovered] = useState<number | null>(null)
  const [focused, setFocused] = useState<number | null>(null)
  const night = result && stage && stage.phase !== 'day' ? { ...stage, result } : null
  const inspectScope = `${state.game_id}-${Boolean(night)}-${result?.turn ?? 0}`
  const [prevInspectScope, setPrevInspectScope] = useState(inspectScope)
  if (prevHighlight !== highlight) {
    setPrevHighlight(highlight)
    // 쪽지 비교(share) 안내로 넘어가면 중앙 점선을 가리지 않게 카드를 접는다.
    if (highlight === 'share') setOpen(null)
  }
  if (prevInspectScope !== inspectScope) {
    setPrevInspectScope(inspectScope)
    setOpen(null)
    setHovered(null)
    setFocused(null)
  }
  const svg = useRef<SVGSVGElement>(null)
  const assignSvg = (node: SVGSVGElement | null) => {
    svg.current = node
    if (boardRef) boardRef.current = node
  }
  const last = useRef<number | null>(null)
  const cardFocused = useRef(false)
  // 쪽지가 열리면 첫 선택 버튼으로, 닫힐 때는 포커스가 카드 안에 있을 때만 그 집으로 되돌린다.
  useEffect(() => {
    if (open != null) {
      last.current = open
      svg.current?.querySelector<SVGElement>('.vb-opt')?.focus()
    } else if (last.current != null) {
      if (cardFocused.current) {
        svg.current?.querySelector<SVGElement>(`.vb-house[data-city="${last.current}"]`)?.focus()
      }
      cardFocused.current = false
      last.current = null
    }
  }, [open])
  // 선택창과 집·튜토리얼 말풍선·오늘 밤 저울 바깥을 누르면(터치 포함) 접는다. 집 클릭은 기존 토글이 처리한다.
  useEffect(() => {
    if (open == null) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.vb-card, .vb-house, .tut-box, .vl-tonight')) setOpen(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])
  const at = (p: Phase) => !night || reached(night.phase, p)
  const turn = night ? night.result.turn - 1 : (result?.turn ?? state.turn)
  const houses = night
    ? stagedHouses(state, night.prev, night.result, night.phase, night.decided)
    : villageHouses(state, result)
  const pairs = (night ? night.result.sharing.map((s) => s.pair) : result ? result.next_share_pairs : state.next_share_pairs) ?? []
  const clashes = picker ? clashingPairs(pairs, picker.claims) : []
  // 연출 중 모순이 들킨 쌍 (내가 두 집에 다른 말을 했다)
  const caught =
    night && at('suspicion')
      ? night.result.sharing.filter((s) => s.contradictions.some((c) => c.city === state.player_city)).map((s) => s.pair)
      : []
  const red = (a: number, b: number) => [...clashes, ...caught].some(([x, y]) => x === a && y === b)
  const pairLabel = pairs.map(([a, b]) => `${a}번 집과 ${b}번 집${red(a, b) ? '(모순)' : ''}`).join(', ')
  const preview = (h: House, claim?: Claim) =>
    picker?.ruled && claim ? suspicionPreview(h, claim, pairs, picker.claims) : null
  const changed = picker && result ? changedHouses(result) : {}
  const opened = picker ? houses.find((h) => h.city === open && h.reachable) : undefined
  // 집 누르기 안내 단계에서는 한 집(왼쪽 위 우선)만 가리켜 화면에 움직이는 요소를 하나로 유지한다.
  const pointerTarget =
    highlight === 'houses' && picker && !opened
      ? (houses.find((h) => h.slot === 2 && h.reachable) ??
        houses.find((h) => h.slot === 1 && h.reachable) ??
        houses.find((h) => h.slot === 4 && h.reachable) ??
        null)
      : null
  const openCity = opened?.city ?? null
  const inspected = hovered ?? focused
  const activeSuspicionLinks =
    !night && !highlight && !opened && inspected != null ? suspicionLinks(houses, inspected) : []
  useEffect(() => {
    onCardOpen?.(openCity)
  }, [openCity, onCardOpen])
  return (
    <svg
      ref={assignSvg}
      tabIndex={-1}
      className={night ? 'vb-board is-playing' : 'vb-board'}
      viewBox="0 0 900 698"
      role="group"
      aria-label={turn === 0 ? '1일째 낮 마을 보드' : `${turn}일째 밤 뒤 마을 보드`}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
    >
      <Defs />
      <Ground />
      <Calendar turn={turn} over={!night && (result?.game_over ?? false)} />
      <BoardLegend />
      <Sky danger={state.truth === 'danger'} highlighted={highlight === 'sky'} />
      {night && <rect className="vb-night" width="900" height="598" />}
      {night && (
        // 단계 이름표: 하늘 왼쪽. key로 단계마다 다시 페이드. 스크린리더는 마을 이야기(live)가 읽는다
        <g key={night.phase} className="vb-phase" aria-hidden>
          <rect x="12" y="16" width={28 + PHASE_LABEL[night.phase].length * 14} height="28" rx="14" fill="#2b1a0c" opacity=".85" />
          <text x="26" y="35" fontSize="15" fontWeight="700" className="vb-light">
            {PHASE_LABEL[night.phase]}
          </text>
        </g>
      )}
      {pairs.length > 0 && (
        <g className={highlight === 'share' ? 'vb-share vb-tut-hl' : 'vb-share'} role="img" aria-label={`오늘 밤 쪽지 비교: ${pairLabel}`}>
          <title>{`오늘 밤 쪽지 비교: ${pairLabel}`}</title>
          {pairs.map(([a, b]) => {
            const d = sharePath(state.player_city, a, b)
            const [mx, my] = pairMid(state.player_city, a, b)
            return (
              <g key={`${a}-${b}`} className={red(a, b) ? 'is-clash' : undefined}>
                <path d={d} className="vb-share-glow" />
                <path d={d} fill="none" stroke="#3b2a1a" strokeWidth="9" strokeLinecap="round" opacity=".35" />
                <path d={d} className="vb-share-line" fill="none" stroke="#ffd35a" strokeWidth="5" strokeDasharray="11 9" strokeLinecap="round" />
                {/* 점선 이름표: 이 두 집은 오늘 밤 내가 준 쪽지를 서로 비교한다 */}
                <g className="vb-share-tag" aria-hidden>
                  <rect x={mx - 82} y={my - 80} width="164" height="25" rx="12.5" strokeWidth="1.5" />
                  <text x={mx} y={my - 62.5} fontSize="14.5" fontWeight="700" textAnchor="middle">
                    오늘 밤 쪽지 비교
                  </text>
                </g>
              </g>
            )
          })}
        </g>
      )}
      <text x={PLAZA.x} y={PLAZA.y + 5} fontSize="15" fontWeight="700" textAnchor="middle" className="vb-plaza-label" aria-hidden>
        광장
      </text>
      {picker && turn === 0 && !hideSigns && <Signs />}
      {houses.map((h) => {
        const inFlags = night?.phase === 'flags' && h.order > 0
        const decided = !night || reached(night.phase, 'suspicion') || (inFlags && h.order <= night.decided)
        const activeDeciding = Boolean(inFlags && (night.decided === Infinity || h.order === night.decided))
        const scale = scales[h.city]
        const hasSuspicion =
          h.role === 'citizen' && h.suspicions != null && Object.values(h.suspicions).some((v) => v > 0)
        return (
          <HouseView
            key={h.city}
            h={h}
            playerCity={state.player_city}
            voteBar={
              inFlags && h.order <= night.decided && scale
                ? { scale, me: state.player_city, animate: activeDeciding }
                : undefined
            }
            freshFlag={activeDeciding}
            swayed={decided && swayed.includes(h.city)}
            highlight={highlight}
            pointed={pointerTarget?.city === h.city}
            inspect={
              !night && hasSuspicion
                ? {
                    onEnter: () => setHovered(h.city),
                    onLeave: () => setHovered((cur) => (cur === h.city ? null : cur)),
                    onFocus: (e) => {
                      if (e.currentTarget.matches(':focus-visible')) setFocused(h.city)
                    },
                    onBlur: () => setFocused((cur) => (cur === h.city ? null : cur)),
                  }
                : undefined
            }
            pick={
              picker && h.reachable
                ? {
                    claim: picker.claims[h.city],
                    open: open === h.city,
                    preview: preview(h, picker.claims[h.city]),
                    changed: changed[h.city],
                    onOpen: () => setOpen(open === h.city ? null : h.city),
                  }
                : undefined
            }
          />
        )
      })}
      {activeSuspicionLinks.length > 0 && <SuspicionLines links={activeSuspicionLinks} />}
      {pointerTarget && <HousePointer target={pointerTarget} />}
      {night && at('notes') && <Talk result={night.result} player={state.player_city} />}
      {caught.map(([a, b]) => {
        const [mx, my] = pairMid(state.player_city, a, b)
        return (
          <ContradictionKnot
            key={`${a}-${b}`}
            x={mx}
            y={my}
            label={`모순 발견: ${a}번 집과 ${b}번 집, 의심도 +${SUSPICION.contradiction}`}
            text={`모순 +${SUSPICION.contradiction}`}
          />
        )
      })}
      {result?.vote && at('trial') && (
        <Trial vote={result.vote} houses={houses} shown={night?.ballots} verdict={at('verdict')} />
      )}
      {clashes.map(([a, b]) => {
        const [mx, my] = pairMid(state.player_city, a, b)
        return (
          <ContradictionKnot
            key={`${a}-${b}`}
            x={mx}
            y={my}
            label={`모순 위험: ${a}번 집과 ${b}번 집에 다른 쪽지, 의심도 +${SUSPICION.contradiction}`}
            text={`모순 +${SUSPICION.contradiction}`}
            title
          />
        )
      })}
      {opened && picker && (
        <NoteCard
          key={opened.city}
          h={opened}
          claim={picker.claims[opened.city]}
          preview={(c) => preview(opened, c)}
          onClaim={(c) => picker.onClaim(opened.city, c)}
          onCardFocusChange={(hasFocus) => {
            cardFocused.current = hasFocus
          }}
          highlightSuspicion={highlight === 'suspicion'}
        />
      )}
    </svg>
  )
}
