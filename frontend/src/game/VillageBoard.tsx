import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { decisions } from '../components/results/resultLabels'
import { SUSPICION, TOTAL_TURNS } from '../gameApi'
import type { Claim, GameState, TurnResult } from '../gameApi'
import { TRAILS, clashingPairs, pairMid, reached, sharePath, stagedHouses, suspicionPreview, talkNotes, tally, villageHouses } from './village'
import type { House, Phase } from './village'
import './village.css'

const PLAZA = { x: 450, y: 345 }
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
      <filter id="vb-rough" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={4} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id="vb-mottle" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={3} seed={11} />
        <feColorMatrix values="0 0 0 0 .17  0 0 0 0 .29  0 0 0 0 .1  1.5 0 0 0 -.6" />
      </filter>
      <filter id="vb-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={3} />
        <feColorMatrix values="0 0 0 0 .25  0 0 0 0 .18  0 0 0 0 .08  .5 0 0 0 -.2" />
      </filter>
      <radialGradient id="vb-lamp">
        <stop offset="0" stopColor="#ffe27a" stopOpacity=".95" />
        <stop offset="1" stopColor="#ffd35a" stopOpacity="0" />
      </radialGradient>
      <marker id="vb-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 Z" fill="#7a2416" />
      </marker>
      <g id="vb-tree">
        <ellipse cx="3" cy="16" rx="20" ry="6" fill="#2a3d1d" opacity=".35" />
        <circle r="19" fill="#2f4a28" />
        <circle cx="-7" cy="-6" r="10" fill="#46652f" />
        <circle cx="6" cy="-9" r="6" fill="#5e8040" />
      </g>
      <g id="vb-hut">
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#e8cf9c" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-6 2 V-16 Q0 -23 6 -16 V2 Z" fill="#6b4a2a" stroke="#3b2a1a" strokeWidth="1.5" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#b5763d" stroke="#3b2a1a" strokeWidth="2.2" />
        <path d="M-30 -36 L-18 -58 M-14 -34 L-6 -64 M2 -34 L6 -65 M16 -35 L20 -60 M30 -34 L32 -48" stroke="#7e4d22" strokeWidth="1.6" fill="none" />
      </g>
      {/* 마피아 집: 어두운 지붕 */}
      <g id="vb-hut-dark">
        <ellipse cx="2" cy="4" rx="50" ry="9" fill="#3a2a14" opacity=".28" />
        <path d="M-35 2 L-35 -32 L35 -32 L35 2 Z" fill="#cdbb98" stroke="#3b2a1a" strokeWidth="2.4" />
        <path d="M-46 -28 Q-26 -66 0 -70 Q26 -66 46 -28 Q0 -36 -46 -28 Z" fill="#4e3f35" stroke="#2a1f17" strokeWidth="2.4" />
        <rect x="-8" y="-24" width="16" height="13" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
      </g>
      {(['evacuate', 'stay'] as const).map((claim) => (
        <g key={claim} id={`vb-flag-${claim}`}>
          <line x1="0" y1="0" x2="0" y2="-52" stroke="#3b2a1a" strokeWidth="2.5" />
          <path
            d="M0 -52 Q14 -57 24 -51 Q34 -45 44 -50 L44 -30 Q34 -25 24 -31 Q14 -37 0 -32 Z"
            className={`vb-cloth is-${claim}`}
            strokeWidth="1.5"
          />
          <text x="22" y="-36" fontSize="11" fontWeight="700" textAnchor="middle" className={`vb-cloth-text is-${claim}`}>
            {decisions[claim]}
          </text>
        </g>
      ))}
      <g id="vb-win-on">
        <circle r="22" fill="url(#vb-lamp)" />
        <rect x="-8" y="-7" width="16" height="14" fill="#ffd35a" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#3b2a1a" strokeWidth="1.3" />
      </g>
      <g id="vb-win-off">
        <rect x="-8" y="-7" width="16" height="14" fill="#3e352c" stroke="#3b2a1a" strokeWidth="2" />
        <path d="M0 -7 V7 M-8 0 H8" stroke="#6b5d4b" strokeWidth="1.3" />
      </g>
      {(['evacuate', 'stay'] as const).map((claim) => (
        <g key={claim} id={`vb-note-${claim}`}>
          <path d="M-22 -11 H16 L22 -5 V11 H-22 Z" className={`vb-cloth is-${claim}`} strokeWidth="1.6" />
          <path d="M16 -11 V-5 H22" fill="none" className={`vb-cloth is-${claim}`} strokeWidth="1.3" />
          <text x="-2" y="5" fontSize="11.5" fontWeight="700" textAnchor="middle" className={`vb-cloth-text is-${claim}`}>
            {decisions[claim]}
          </text>
        </g>
      ))}
      {/* 다른 집이 보내는 주장 (작은 쪽지, 첫 글자) */}
      {(['evacuate', 'stay'] as const).map((claim) => (
        <g key={claim} id={`vb-chip-${claim}`}>
          <rect x="-10" y="-8" width="20" height="16" rx="3" className={`vb-cloth is-${claim}`} strokeWidth="1.3" />
          <text y="4" fontSize="10" fontWeight="700" textAnchor="middle" className={`vb-cloth-text is-${claim}`}>
            {decisions[claim][0]}
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
          <ellipse cx="450" cy="528" rx="62" ry="34" />
        </g>
        <ellipse cx={PLAZA.x} cy={PLAZA.y} rx="72" ry="50" fill="#c8b38a" stroke="#8b7754" strokeWidth="2" />
        <g fill="#9f9886" stroke="#5f5a4c" strokeWidth="1.5">
          {STONES.map(([x, y]) => <ellipse key={`${x}-${y}`} cx={x} cy={y} rx="9" ry="6" />)}
        </g>
        {TREES.map(([x, y]) => <use key={`${x}-${y}`} href="#vb-tree" x={x} y={y} />)}
      </g>
      <text x={PLAZA.x} y={PLAZA.y + 5} fontSize="13" fontWeight="700" textAnchor="middle" className="vb-serif">
        광장
      </text>
    </g>
  )
}

// 하늘: 정답이 위험이면 태풍 구름, 안전이면 맑은 하늘
function Sky({ danger }: { danger: boolean }) {
  return (
    <g role="img" aria-label={danger ? '하늘: 태풍이 온다, 대피가 정답' : '하늘: 태풍이 비켜 간다, 잔류가 정답'}>
      <g filter="url(#vb-rough)">
        <path
          d="M0 0 H900 V96 Q850 112 800 98 Q740 118 680 100 Q610 120 540 102 Q470 118 400 100 Q330 116 260 99 Q190 114 120 98 Q60 112 0 98 Z"
          fill={danger ? '#c4ced2' : '#bcdbe6'}
        />
        {danger ? (
          <>
            <g fill="#7d8c96">
              <ellipse cx="640" cy="44" rx="70" ry="30" />
              <ellipse cx="710" cy="34" rx="62" ry="30" />
              <ellipse cx="790" cy="46" rx="74" ry="32" />
              <ellipse cx="860" cy="30" rx="60" ry="30" />
            </g>
            <g fill="#5f6f7b">
              <ellipse cx="700" cy="62" rx="80" ry="20" />
              <ellipse cx="820" cy="66" rx="80" ry="20" />
            </g>
            <path d="M760 44 m0 -2 a4 4 0 1 1 4 4 a10 10 0 1 1 -10 -10 a17 17 0 0 1 17 17 a24 24 0 0 1 -24 24" fill="none" stroke="#eef2f2" strokeWidth="3.5" strokeLinecap="round" />
            <g stroke="#eef2f2" strokeWidth="2.5" fill="none" strokeLinecap="round">
              <path d="M230 40 Q290 26 340 42 Q380 54 420 38" />
              <path d="M300 70 Q360 58 410 70 Q450 80 500 64 a10 10 0 1 0 -6 -14" />
              <path d="M180 78 Q220 68 260 78" />
            </g>
            <g stroke="#5f6f7b" strokeWidth="2" strokeLinecap="round">
              <path d="M640 84 l-8 16 M672 88 l-8 16 M704 86 l-8 16 M736 90 l-8 16 M768 86 l-8 16 M800 90 l-8 16 M832 86 l-8 16" />
            </g>
          </>
        ) : (
          <>
            <circle cx="760" cy="46" r="30" fill="#ffd35a" stroke="#c98f1e" strokeWidth="2.5" />
            <g stroke="#e0a72a" strokeWidth="3" strokeLinecap="round">
              <path d="M760 2 v8 M760 82 v8 M716 46 h8 M796 46 h8 M729 15 l6 6 M785 71 l6 6 M729 77 l6 -6 M785 21 l6 -6" />
            </g>
            <g fill="#f4f8f8">
              <ellipse cx="640" cy="60" rx="46" ry="16" />
              <ellipse cx="672" cy="50" rx="30" ry="16" />
              <ellipse cx="860" cy="62" rx="40" ry="14" />
            </g>
          </>
        )}
      </g>
      <text x="545" y="40" fontSize="18" fontWeight="700" textAnchor="end" className="vb-serif" aria-hidden>
        {danger ? '태풍이 온다' : '태풍이 비켜 간다'}
      </text>
      <text x="545" y="60" fontSize="12" textAnchor="end" aria-hidden>
        {danger ? '대피가 정답' : '잔류가 정답'}
      </text>
    </g>
  )
}

// 달력 트랙 15칸. 지난 날은 짙게, 말은 오늘(끝났으면 마지막 날)에 선다.
function Calendar({ turn, over }: { turn: number; over: boolean }) {
  const day = over ? turn : Math.min(turn + 1, TOTAL_TURNS)
  const left = TOTAL_TURNS - turn
  const px = cellX(day) + 19
  return (
    <g role="img" aria-label={`달력: 태풍까지 D-${left}, ${day}/${TOTAL_TURNS}일`}>
      <rect x="0" y="598" width="900" height="62" fill="#7a5530" />
      <rect x="0" y="598" width="900" height="62" filter="url(#vb-grain)" />
      <text x="34" y="622" fontSize="12" fontWeight="700" className="vb-light">
        태풍까지
      </text>
      <g filter="url(#vb-rough)" stroke="#4a3119" strokeWidth="1.5">
        {Array.from({ length: TOTAL_TURNS }, (_, i) => i + 1).map((d) => (
          <rect
            key={d}
            x={cellX(d)}
            y="610"
            width="38"
            height="38"
            rx="4"
            fill={d === TOTAL_TURNS ? '#8fa0a8' : d <= turn ? '#b99662' : '#ecd9aa'}
          />
        ))}
        <path d="M785 629 m0 -1 a3 3 0 1 1 3 3 a7 7 0 1 1 -7 -7 a11 11 0 0 1 11 11" fill="none" stroke="#2c3d4f" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g fontSize="10" textAnchor="middle" className="vb-cal-num" aria-hidden>
        {Array.from({ length: TOTAL_TURNS - 1 }, (_, i) => i + 1)
          .filter((d) => d !== day)
          .map((d) => (
            <text key={d} x={cellX(d) + 19} y="643">
              {d}
            </text>
          ))}
      </g>
      <g filter="url(#vb-rough)" aria-hidden>
        <ellipse cx={px} cy="645" rx="13" ry="4" fill="#2a1a0c" opacity=".35" />
        <path d={`M${px - 11} 645 Q${px} 600 ${px + 11} 645 Z`} fill="#c0392b" stroke="#4a1a10" strokeWidth="2" />
        <circle cx={px} cy="614" r="8" fill="#c0392b" stroke="#4a1a10" strokeWidth="2" />
      </g>
      <text x="30" y="650" fontSize="28" fontWeight="700" className="vb-serif vb-dday" aria-hidden>
        D-{left}
      </text>
      <text x="842" y="642" fontSize="11" className="vb-light" aria-hidden>
        {day}/{TOTAL_TURNS}일
      </text>
    </g>
  )
}

function houseLabel(h: House) {
  const name = `${h.city}번 집`
  if (h.role === 'player') return `${name}, 나(마피아)`
  if (h.role === 'colleague') return `${name}, 동료 마피아`
  return [
    `${name}, 시민`,
    h.flag ? `지난 결정 ${decisions[h.flag]}` : '아직 결정 없음',
    h.lit != null && `다음 관측 ${h.lit ? '맞음(불 켜짐)' : '틀림(불 꺼짐)'}`,
    h.suspicion != null &&
      `나를 의심 ${h.suspicion}${h.suspicion >= SUSPICION.threshold ? ', 재판 기준 넘음' : ''}`,
    !h.reachable && '말을 보낼 수 없음',
  ]
    .filter(Boolean)
    .join(', ')
}

// 집 하나. pick이 있으면 눌러서 쪽지를 여는 버튼이 된다 (명세 1번).
type Pick = { claim?: Claim; open: boolean; next: number | null; onOpen: () => void }

const pressKey = (action: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  action()
}

function HouseView({ h, pick }: { h: House; pick?: Pick }) {
  const { x, y } = h
  const label = pick
    ? `${houseLabel(h)}. 할 말 고르기, 지금 ${pick.claim ? decisions[pick.claim] : '없음'}`
    : houseLabel(h)
  const mafia = h.role !== 'citizen'
  const over = h.suspicion != null && h.suspicion >= SUSPICION.threshold
  return (
    <g
      className={`vb-house${h.role === 'citizen' && !h.reachable ? ' is-far' : ''}${pick?.open ? ' is-open' : ''}`}
      {...(pick
        ? { role: 'button', tabIndex: 0, 'aria-expanded': pick.open, onClick: pick.onOpen, onKeyDown: pressKey(pick.onOpen) }
        : { role: 'img' })}
      data-city={h.city}
      aria-label={label}
    >
      <title>{label}</title>
      {pick && <ellipse className="vb-hl" cx={x} cy={y + 2} rx="62" ry="17" />}
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
          <text x={x - 52} y={y - 22} fontSize="14" fontWeight="700" textAnchor="middle" className="vb-light">
            나
          </text>
        </g>
      ) : (
        <g>
          <circle cx={x - 64} cy={y - 38} r="15" className={`vb-badge${mafia ? ' is-mafia' : ''}`} strokeWidth="2.5" />
          <text x={x - 64} y={y - 32} fontSize="17" fontWeight="700" textAnchor="middle" className={`vb-serif${mafia ? ' vb-light' : ''}`}>
            {h.city}
          </text>
        </g>
      )}
      {mafia && (
        <text x={x} y={y + 34} fontSize="12" fontWeight="700" textAnchor="middle">
          {h.city}번 집{h.role === 'colleague' && ' · 동료'}
        </text>
      )}
      {h.flag && (
        <g key={h.flag} className="vb-flag" transform={`translate(${x + 28},${y - 62})`}>
          <use href={`#vb-flag-${h.flag}`} filter="url(#vb-rough)" />
        </g>
      )}
      {h.lit != null && <use href={h.lit ? '#vb-win-on' : '#vb-win-off'} x={x - 18} y={y - 20} filter="url(#vb-rough)" />}
      {h.suspicion != null && (
        <g transform={`translate(${x - 10},${y + 30})`} className={over ? 'vb-gauge is-over' : 'vb-gauge'}>
          <rect x="-50" y="-5" width="100" height="10" rx="5" fill="#5a3d22" />
          <rect className="vb-gauge-fill" x="-48" y="-3" width="96" height="6" rx="3" style={{ transform: `scaleX(${Math.min(h.suspicion, 100) / 100})` }} />
          {/* 재판 기준 60 말뚝 */}
          <g className="vb-post">
            <path d={`M${-48 + 0.96 * SUSPICION.threshold} -12 V9`} />
            <path d={`M${-53 + 0.96 * SUSPICION.threshold} -13 H${-43 + 0.96 * SUSPICION.threshold}`} />
          </g>
          {over && <rect x="52" y="-12" width="30" height="22" rx="3" fill="#a8361f" />}
          <text x="58" y="5" fontSize="14" fontWeight="700" className={over ? 'vb-light' : undefined}>
            {h.suspicion}
          </text>
          {pick?.next != null && pick.next !== h.suspicion && (
            <text x="84" y="5" fontSize="13" fontWeight="700" className="vb-rust">
              →{pick.next}
            </text>
          )}
        </g>
      )}
      {pick?.claim && <use href={`#vb-note-${pick.claim}`} x={x + 70} y={y - 30} />}
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
    vote.accused === null ? '과반 없음' : `${vote.accused}번 집 ${vote.caught ? '발각' : '오지목'}`
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
              <text y="-6" fontSize="11" fontWeight="700" textAnchor="middle" className="vb-serif">
                {from}
              </text>
            </g>
          </g>
        )
      })}
      {Object.entries(votes).map(([city, n]) => {
        const t = at(Number(city))
        return (
          <g key={city} transform={`translate(${t.x + (t.x > PLAZA.x ? 68 : -102)},${t.y - 14})`} fontSize="12" fontWeight="700">
            <rect width="34" height="18" rx="3" fill="#7a2416" />
            <text x="17" y="13" textAnchor="middle" className="vb-light">
              {n}표
            </text>
          </g>
        )
      })}
      {verdict && (
        <g className={vote.caught ? 'vb-stamp is-caught' : 'vb-stamp'}>
          <rect x="390" y="400" width="120" height="30" rx="3" strokeWidth="2.5" />
          <rect x="394" y="404" width="112" height="22" rx="2" fill="none" strokeWidth="1" />
          <text x="450" y="420" fontSize="14" fontWeight="700" textAnchor="middle">
            {stamp}
          </text>
        </g>
      )}
    </g>
  )
}

// 밤에 오솔길을 따라 각 집으로 가는 말: 내 쪽지(큰 쪽지)와 다른 집의 주장(작은 쪽지).
function Talk({ result, player }: { result: TurnResult; player: number }) {
  const ref = useRef<SVGGElement>(null)
  // SMIL 시각은 문서가 열린 때 기준이라, 그려지는 순간 직접 출발시킨다 (출발 전에는 투명)
  useLayoutEffect(() => {
    ref.current?.querySelectorAll<SVGAnimationElement>('animate, animateMotion').forEach((a) => a.beginElement())
  }, [])
  const notes = talkNotes(player, result).sort((a, b) => Number(a.from === player) - Number(b.from === player)) // 내 쪽지를 맨 위에
  return (
    <g ref={ref} aria-hidden>
      {notes.map((n, i) => {
        const wait = Math.min(i * 0.025, 0.3) // 출발을 조금씩 엇갈리게
        const [p0, p1] = n.back ? [1, 0] : [0, 1]
        return (
          <g key={`${n.from}-${n.to}`} opacity="0">
            <use href={n.from === player ? `#vb-note-${n.claim}` : `#vb-chip-${n.claim}`} />
            <animateMotion begin="indefinite" dur="1200ms" fill="freeze" path={n.path} calcMode="linear" keyPoints={`${p0};${p0};${p1}`} keyTimes={`0;${wait};1`} />
            <animate attributeName="opacity" begin="indefinite" dur="1200ms" fill="freeze" values="0;1;1;0" keyTimes={`0;${wait};0.9;1`} />
          </g>
        )
      })}
    </g>
  )
}

// 길 범례: 갈색 길은 모두에게 말하기, 노란 점선은 쪽지 맞춰 보기 (선 모양도 달라 색만으로 구분하지 않는다).
function Legend({ ring }: { ring: boolean }) {
  const talk = ring ? '양옆 집에게 말하기' : '모두에게 말하기'
  const label = `범례: 갈색 길은 ${talk}, 매일 밤 ${ring ? '양옆 집끼리' : '모든 집이 서로'} 주장을 보낸다. 노란 점선은 오늘 밤 쪽지 맞춰 보기, 두 시민이 받은 쪽지를 서로 맞춰 본다`
  return (
    <g role="img" aria-label={label}>
      <title>{label}</title>
      <rect x="12" y="10" width="236" height="52" rx="4" fill="#f6ebcd" stroke="#8a6a3e" strokeWidth="1.5" opacity=".95" />
      <path d="M22 26 H52" stroke="#9c7442" strokeWidth="9" strokeLinecap="round" />
      <path d="M22 26 H52" stroke="#c9a068" strokeWidth="5" strokeLinecap="round" />
      <path d="M22 47 H52" stroke="#3b2a1a" strokeWidth="7" opacity=".35" />
      <path d="M22 47 H52" stroke="#ffd35a" strokeWidth="4" strokeDasharray="6 4" />
      <g fontSize="12" fontWeight="700" aria-hidden>
        <text x="62" y="30">갈색 길: {talk}</text>
        <text x="62" y="51">노란 점선: 오늘 밤 쪽지 맞춰 보기</text>
      </g>
    </g>
  )
}

// 집 옆에서 펼쳐지는 쪽지: 대피/잔류와 의심도 변화 미리보기 (명세 1번).
function NoteCard({
  h,
  claim,
  delta,
  onClaim,
}: {
  h: House
  claim?: Claim
  delta: (c: Claim) => number | null
  onClaim: (c: Claim) => void
}) {
  const left = h.x < 450
  const cx = left ? h.x + 100 : h.x - 268
  const cy = h.y < 300 ? h.y - 54 : h.y - 77
  return (
    <g transform={`translate(${cx},${cy})`}>
      <g className={`vb-card${left ? ' from-left' : ' from-right'}`} role="group" aria-label={`${h.city}번 집에 할 말`}>
        <rect x="4" y="5" width="168" height="96" rx="2" fill="#2a1a0c" opacity=".25" />
        <rect width="168" height="96" rx="2" fill="#f6ebcd" stroke="#8a6a3e" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="5" fill="#a8361f" stroke="#4a1a10" />
        <text x="22" y="24" fontSize="13.5" fontWeight="700">
          {h.city}번 집에 할 말
        </text>
        {(['evacuate', 'stay'] as const).map((c, i) => {
          const d = delta(c)
          return (
            <g key={c}>
              <g
                className={`vb-opt is-${c}${claim === c ? ' is-sel' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={claim === c}
                aria-label={`${decisions[c]}${d == null ? '' : `, 의심도 ${d > 0 ? '+' : ''}${d}`}`}
                onClick={() => onClaim(c)}
                onKeyDown={pressKey(() => onClaim(c))}
              >
                <rect x={14 + i * 74} y="32" width="66" height="34" rx="3" />
                <text x={47 + i * 74} y="55" fontSize="16" fontWeight="700" textAnchor="middle">
                  {decisions[c]}
                </text>
              </g>
              {d != null && (
                <text
                  x={47 + i * 74}
                  y="85"
                  fontSize="13"
                  fontWeight="700"
                  textAnchor="middle"
                  className={d > 0 ? 'vb-rust' : d < 0 ? 'vb-green' : undefined}
                  aria-hidden
                >
                  {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0'}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </g>
  )
}

const SIGNS = ['1 불빛부터 본다', '2 집마다 쪽지', '3 점선 두 집은 같은 말']

// 첫날 안내 표지판 (왼쪽 나무 기둥).
function Signs() {
  return (
    <g
      fontSize="12"
      fontWeight="700"
      role="img"
      aria-label="첫날 안내: 1 창문 불빛부터 본다, 2 집마다 할 말을 고른다, 3 점선으로 이어진 두 집에는 같은 말을 한다"
    >
      <rect x="84" y="296" width="9" height="124" fill="#5a3d22" filter="url(#vb-rough)" />
      <text x="22" y="292" className="vb-sign-title">
        첫날 안내
      </text>
      {SIGNS.map((t, i) => (
        <g key={t} className="vb-sign" style={{ animationDelay: `${80 + i * 80}ms` }}>
          <path
            d={`M14 ${304 + i * 36} H160 L172 ${318 + i * 36} L160 ${332 + i * 36} H14 Z`}
            fill="#c99a5b"
            stroke="#4a3119"
            strokeWidth="2"
            filter="url(#vb-rough)"
          />
          <text x="22" y={323 + i * 36}>
            {t}
          </text>
        </g>
      ))}
    </g>
  )
}

export type NotePicker = {
  claims: Record<string, Claim>
  onClaim: (city: number, claim: Claim) => void
  ruled: boolean // 7.6 규칙 시민일 때만 의심도 미리보기
}

// 밤 연출 중인 단계. prev는 지난 턴 결과 (깃발·의심도가 바뀌기 전 모습).
export type Stage = { phase: Phase; ballots: number; prev: TurnResult | null }

// 숲속 마을 보드 (명세 2번). result가 없으면 1턴 전, 있으면 그 턴이 끝난 상태를 그린다.
// picker가 있으면 집을 눌러 다음 턴에 할 말을 고른다 (명세 1번).
// stage가 있으면 그 턴의 밤을 단계별로 보여 준다 (밤 → 쪽지 → 깃발 → 의심 → 재판 → 판정 → 다음 날).
export function VillageBoard({
  state,
  result,
  picker,
  stage,
}: {
  state: GameState
  result: TurnResult | null
  picker?: NotePicker
  stage?: Stage
}) {
  const [open, setOpen] = useState<number | null>(null)
  const svg = useRef<SVGSVGElement>(null)
  const last = useRef<number | null>(null)
  // 쪽지가 열리면 첫 선택 버튼으로, 닫히면 그 집으로 포커스를 옮긴다.
  useEffect(() => {
    if (open != null) {
      last.current = open
      svg.current?.querySelector<SVGElement>('.vb-opt')?.focus()
    } else if (last.current != null) {
      svg.current?.querySelector<SVGElement>(`.vb-house[data-city="${last.current}"]`)?.focus()
      last.current = null
    }
  }, [open])
  const night = result && stage && stage.phase !== 'day' ? { ...stage, result } : null
  const at = (p: Phase) => !night || reached(night.phase, p)
  const turn = night ? night.result.turn - 1 : (result?.turn ?? state.turn)
  const houses = night ? stagedHouses(state, night.prev, night.result, night.phase) : villageHouses(state, result)
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
  const opened = picker ? houses.find((h) => h.city === open && h.reachable) : undefined
  return (
    <svg
      ref={svg}
      className={night ? 'vb-board is-playing' : 'vb-board'}
      viewBox="0 0 900 660"
      role="group"
      aria-label={`${turn}턴 뒤 마을 보드`}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(null)}
    >
      <Defs />
      <Ground />
      <Calendar turn={turn} over={!night && (result?.game_over ?? false)} />
      <Sky danger={state.truth === 'danger'} />
      <Legend ring={state.config.connection === 'ring'} />
      {night && <rect className="vb-night" width="900" height="598" />}
      {pairs.length > 0 && (
        <g className="vb-share" role="img" aria-label={`오늘 밤 쪽지 맞춰 보기: ${pairLabel}`}>
          <title>{`오늘 밤 쪽지 맞춰 보기: ${pairLabel}`}</title>
          {pairs.map(([a, b]) => {
            const d = sharePath(state.player_city, a, b)
            const [mx, my] = pairMid(state.player_city, a, b)
            return (
              <g key={`${a}-${b}`} className={red(a, b) ? 'is-clash' : undefined}>
                <path d={d} className="vb-share-glow" />
                <path d={d} fill="none" stroke="#3b2a1a" strokeWidth="9" strokeLinecap="round" opacity=".35" />
                <path d={d} className="vb-share-line" fill="none" stroke="#ffd35a" strokeWidth="5" strokeDasharray="11 9" strokeLinecap="round" />
                {/* 점선 이름표: 이 두 집은 오늘 밤 내가 준 쪽지를 서로 맞춰 본다 */}
                <g className="vb-share-tag" aria-hidden>
                  <rect x={mx - 74} y={my - 78} width="148" height="22" rx="11" strokeWidth="1.5" />
                  <text x={mx} y={my - 62} fontSize="12" fontWeight="700" textAnchor="middle">
                    오늘 밤 쪽지 맞춰 보기
                  </text>
                </g>
              </g>
            )
          })}
        </g>
      )}
      {picker && turn === 0 && <Signs />}
      {houses.map((h) => (
        <HouseView
          key={h.city}
          h={h}
          pick={
            picker && h.reachable
              ? {
                  claim: picker.claims[h.city],
                  open: open === h.city,
                  next: preview(h, picker.claims[h.city])?.next ?? null,
                  onOpen: () => setOpen(open === h.city ? null : h.city),
                }
              : undefined
          }
        />
      ))}
      {night && at('notes') && <Talk result={night.result} player={state.player_city} />}
      {caught.map(([a, b]) => {
        const [mx, my] = pairMid(state.player_city, a, b)
        return (
          <g key={`${a}-${b}`} role="img" aria-label={`모순 발견: ${a}번 집과 ${b}번 집`}>
            <g className="vb-knot">
              <use href="#vb-knot" x={mx} y={my} />
            </g>
            <rect x={mx - 50} y={my - 50} width="100" height="22" rx="3" fill="#f6ebcd" stroke="#a8361f" strokeWidth="1.5" />
            <text x={mx} y={my - 34} fontSize="13" fontWeight="700" textAnchor="middle" className="vb-rust">
              모순 발견
            </text>
          </g>
        )
      })}
      {result?.vote && at('trial') && (
        <Trial vote={result.vote} houses={houses} shown={night?.ballots} verdict={at('verdict')} />
      )}
      {clashes.map(([a, b]) => {
        const [mx, my] = pairMid(state.player_city, a, b)
        const label = `모순 위험: ${a}번 집과 ${b}번 집에 다른 말`
        return (
          <g key={`${a}-${b}`} role="img" aria-label={label}>
            <title>{label}</title>
            <g className="vb-knot">
              <use href="#vb-knot" x={mx} y={my} />
            </g>
            <rect x={mx - 50} y={my - 50} width="100" height="22" rx="3" fill="#f6ebcd" stroke="#a8361f" strokeWidth="1.5" />
            <text x={mx} y={my - 34} fontSize="13" fontWeight="700" textAnchor="middle" className="vb-rust">
              모순 +{SUSPICION.contradiction}
            </text>
          </g>
        )
      })}
      {opened && picker && (
        <NoteCard
          key={opened.city}
          h={opened}
          claim={picker.claims[opened.city]}
          delta={(c) => preview(opened, c)?.delta ?? null}
          onClaim={(c) => picker.onClaim(opened.city, c)}
        />
      )}
    </svg>
  )
}
