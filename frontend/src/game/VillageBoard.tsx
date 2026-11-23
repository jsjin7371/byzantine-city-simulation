import { useEffect, useRef, useState } from 'react'
import { decisions } from '../components/results/resultLabels'
import { SUSPICION, TOTAL_TURNS } from '../gameApi'
import type { Claim, GameState, TurnResult } from '../gameApi'
import { onActivateKey } from '../lib/keyboard'
import { SharedVillageDefs } from './SharedVillageDefs'
import { PHASE_LABEL, TRAILS, changedHouses, clashingPairs, pairMid, reached, sharePath, stagedHouses, suspicionPreview, talkNotes, tally, villageHouses, worsens } from './village'
import type { House, Phase, Preview } from './village'
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
function Sky({ danger }: { danger: boolean }) {
  return (
    <g role="img" aria-label={danger ? '하늘: 오늘 밤 진짜 날씨는 태풍, 주민은 대피해야 산다' : '하늘: 오늘 밤 진짜 날씨는 맑음, 주민은 집에 있어야 산다'}>
      <g filter="url(#vb-rough)" aria-hidden>
        <path
          d="M0 0 H900 V96 Q850 112 800 98 Q740 118 680 100 Q610 120 540 102 Q470 118 400 100 Q330 116 260 99 Q190 114 120 98 Q60 112 0 98 Z"
          fill={danger ? '#c4ced2' : '#bcdbe6'}
        />
      </g>
      {danger ? (
        <>
          <g className="vb-cloud" fill="#7d8c96" aria-hidden>
            <ellipse cx="640" cy="44" rx="70" ry="30" />
            <ellipse cx="710" cy="34" rx="62" ry="30" />
            <ellipse cx="790" cy="46" rx="74" ry="32" />
            <ellipse cx="860" cy="30" rx="60" ry="30" />
          </g>
          <g className="vb-cloud is-b" fill="#5f6f7b" aria-hidden>
            <ellipse cx="700" cy="62" rx="80" ry="20" />
            <ellipse cx="820" cy="66" rx="80" ry="20" />
          </g>
          <g className="vb-wind" stroke="#eef2f2" strokeWidth="2.5" fill="none" strokeLinecap="round" aria-hidden>
            <path d="M230 40 Q290 26 340 42 Q380 54 420 38" />
            <path d="M300 70 Q360 58 410 70 Q450 80 500 64 a10 10 0 1 0 -6 -14" />
            <path d="M180 78 Q220 68 260 78" />
          </g>
          <g stroke="#5f6f7b" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path className="vb-rain" d="M640 76 l-6 12 M704 78 l-6 12 M768 78 l-6 12 M832 78 l-6 12" />
            <path className="vb-rain is-b" d="M672 78 l-6 12 M736 80 l-6 12 M800 80 l-6 12" />
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
      <text x="545" y="40" fontSize="18" fontWeight="700" textAnchor="end" className="vb-pencil" aria-hidden>
        {danger ? '오늘 밤 진짜 날씨: 태풍' : '오늘 밤 진짜 날씨: 맑음'}
      </text>
      <text x="545" y="62" fontSize="14.5" textAnchor="end" aria-hidden>
        {danger ? '주민은 대피해야 산다' : '주민은 집에 있어야 산다'}
      </text>
    </g>
  )
}

// 달력 트랙 15칸. 지난 날은 짙게, 말은 오늘(끝났으면 마지막 날)에 선다.
function Calendar({ turn, over }: { turn: number; over: boolean }) {
  const day = over ? turn : Math.min(turn + 1, TOTAL_TURNS)
  const left = TOTAL_TURNS - turn
  const px = cellX(day) + CELL_W / 2
  return (
    <g role="img" aria-label={`달력: 결정의 날 D-${left}, ${day}/${TOTAL_TURNS}일`}>
      <rect x="0" y="598" width="900" height="62" fill="#7a5530" />
      <rect x="0" y="598" width="900" height="62" filter="url(#vb-grain)" />
      <text x="30" y="620" fontSize="14" fontWeight="700" className="vb-light">
        결정의 날
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

// 쪽지 하나로 바뀔 의심도 읽기용 문구. 예) "의심도 50에서 70, 재판 열림"
const previewText = (p: Preview) => `의심도 ${p.from}에서 ${p.next}${p.trial ? ', 재판 열림' : ''}`

function houseLabel(h: House) {
  const name = `${h.city}번 집`
  if (h.role === 'player') return `${name}, 나(마피아)`
  if (h.role === 'colleague') return `${name}, 동료 마피아`
  return [
    `${name}, 주민`,
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
// changed: 어제와 달라진 점 (힌트 바뀜, 새 점선). 어제 쪽지를 그대로 두었으니 여기만 다시 보면 된다.
type Pick = { claim?: Claim; open: boolean; preview: Preview | null; changed?: string[]; onOpen: () => void }

// swayed: 내 쪽지가 없었다면 반대로 골랐을 시민 (작은 불꽃 한 번)
function HouseView({ h, pick, swayed }: { h: House; pick?: Pick; swayed?: boolean }) {
  const { x, y } = h
  const base = `${houseLabel(h)}${swayed ? ', 내 쪽지에 마음이 바뀜' : ''}`
  const label = pick
    ? `${base}${pick.changed ? `, 변동: ${pick.changed.join(', ')}` : ''}. 쪽지 고르기, 지금 ${pick.claim ? decisions[pick.claim] : '없음'}${pick.preview ? `, ${previewText(pick.preview)}` : ''}`
    : base
  const mafia = h.role !== 'citizen'
  const over = h.suspicion != null && h.suspicion >= SUSPICION.threshold
  // 어긋난 쪽지 한 장이면 재판: 막대가 약하게 두근거린다
  const near = !over && h.suspicion != null && h.suspicion >= SUSPICION.threshold - SUSPICION.disagree
  const postX = -48 + 0.96 * SUSPICION.threshold
  return (
    <g
      className={`vb-house${h.role === 'citizen' && !h.reachable ? ' is-far' : ''}${pick?.open ? ' is-open' : ''}`}
      {...(pick
        ? { role: 'button', tabIndex: 0, 'aria-expanded': pick.open, onClick: pick.onOpen, onKeyDown: onActivateKey(pick.onOpen) }
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
        <g key={h.flag} className="vb-flag" transform={`translate(${x + 28},${y - 62})`}>
          <use href={`#vb-flag-${h.flag}`} />
        </g>
      )}
      {swayed && (
        <g className="vb-spark" transform={`translate(${x + 8},${y - 78})`} aria-hidden>
          <path d="M0 -13 L3.5 -3.5 L13 0 L3.5 3.5 L0 13 L-3.5 3.5 L-13 0 L-3.5 -3.5 Z" />
        </g>
      )}
      {h.lit != null && <use href={h.lit ? '#vb-win-on' : '#vb-win-off'} x={x - 18} y={y - 20} filter="url(#vb-rough)" />}
      {h.suspicion != null && (
        <g transform={`translate(${x - 10},${y + 30})`} className={over ? 'vb-gauge is-over' : near ? 'vb-gauge is-near' : 'vb-gauge'}>
          <rect x="-50" y="-5" width="100" height="10" rx="5" fill="#5a3d22" />
          <rect className="vb-gauge-fill" x="-48" y="-3" width="96" height="6" rx="3" style={{ transform: `scaleX(${Math.min(h.suspicion, 100) / 100})` }} />
          {/* 재판 기준 60 말뚝 */}
          <g className="vb-post">
            <path d={`M${postX} -12 V9`} />
            <path d={`M${postX - 5} -13 H${postX + 5}`} />
          </g>
          {over && (
            <g className="vb-knot" aria-hidden>
              <circle cx="-62" r="10" fill="#a8361f" stroke="#4a1a10" strokeWidth="1.5" />
              <text x="-62" y="5.5" fontSize="15" fontWeight="800" textAnchor="middle" className="vb-light">
                !
              </text>
            </g>
          )}
          {over && <rect x="53" y="-14" width="38" height="26" rx="3" fill="#a8361f" />}
          <text x="58" y="6" fontSize="18" fontWeight="700" className={over ? 'vb-light' : undefined}>
            {h.suspicion}
          </text>
          {pick?.preview && (pick.preview.next !== h.suspicion || pick.preview.trial) && (
            <text x="94" y="6" fontSize="17.5" fontWeight="700" className={worsens(pick.preview) ? 'vb-rust' : 'vb-green'}>
              →{pick.preview.next}
              {pick.preview.trial && ' 재판'}
            </text>
          )}
        </g>
      )}
      {pick?.claim && <use href={`#vb-note-${pick.claim}`} x={x + 70} y={y - 30} />}
      {pick?.changed && (
        <g className="vb-new" transform={`translate(${x - 10},${y + 54})`} aria-hidden>
          <rect x="-92" y="-11.5" width="184" height="23" rx="11.5" />
          <text y="4.5" fontSize="13.5" fontWeight="700" textAnchor="middle" className="vb-light">
            변동: {pick.changed.join('·')}
          </text>
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

// 집 옆에서 펼쳐지는 쪽지: 대피/잔류와 의심도 변화 미리보기 (명세 1번). 예) 50 → 70, 재판 열림
function NoteCard({
  h,
  claim,
  preview,
  onClaim,
}: {
  h: House
  claim?: Claim
  preview: (c: Claim) => Preview | null
  onClaim: (c: Claim) => void
}) {
  const left = h.x < PLAZA.x
  const cx = left ? h.x + 100 : h.x - 284
  const cy = h.y < 300 ? h.y - 54 : h.y - 77
  return (
    <g transform={`translate(${cx},${cy})`}>
      <g className={`vb-card${left ? ' from-left' : ' from-right'}`} role="group" aria-label={`${h.city}번 집에 쪽지`}>
        <rect x="4" y="5" width="184" height="122" rx="2" fill="#2a1a0c" opacity=".25" />
        <rect width="184" height="122" rx="2" fill="#f6ebcd" stroke="#8a6a3e" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="5" fill="#a8361f" stroke="#4a1a10" />
        <text x="22" y="25" fontSize="15.5" fontWeight="700">
          {h.city}번 집에 쪽지
        </text>
        {(['evacuate', 'stay'] as const).map((c, i) => {
          const p = preview(c)
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
                <rect x={14 + i * 82} y="34" width="74" height="36" rx="3" />
                <text x={51 + i * 82} y="58" fontSize="17.5" fontWeight="700" textAnchor="middle">
                  {decisions[c]}
                </text>
              </g>
              {p && (
                <g fontWeight="700" textAnchor="middle" aria-hidden>
                  <text x={51 + i * 82} y="91" fontSize="15" className={worsens(p) ? 'vb-rust' : 'vb-green'}>
                    {p.from} → {p.next}
                  </text>
                  {p.trial && (
                    <text x={51 + i * 82} y="110" fontSize="13.5" className="vb-rust">
                      재판 열림
                    </text>
                  )}
                </g>
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
      fontSize="15.5"
      fontWeight="700"
      role="img"
      aria-label="첫날 안내: 1 창문 불빛부터 본다, 2 집마다 쪽지를 고른다, 3 점선으로 이어진 두 집에는 같은 말을 한다"
    >
      <rect x="88" y="296" width="9" height="128" fill="#5a3d22" filter="url(#vb-rough)" />
      <text x="18" y="292" className="vb-sign-title">
        첫날 안내
      </text>
      {SIGNS.map((t, i) => (
        <g key={t} className="vb-sign" style={{ animationDelay: `${80 + i * 80}ms` }}>
          <path
            d={`M10 ${304 + i * 38} H188 L200 ${319 + i * 38} L188 ${334 + i * 38} H10 Z`}
            fill="#c99a5b"
            stroke="#4a3119"
            strokeWidth="2"
            filter="url(#vb-rough)"
          />
          <text x="18" y={324 + i * 38}>
            {t}
          </text>
        </g>
      ))}
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

type NotePicker = {
  claims: Record<string, Claim>
  onClaim: (city: number, claim: Claim) => void
  ruled: boolean // 7.6 규칙 시민일 때만 의심도 미리보기
}

// 밤 연출 중인 단계. prev는 지난 턴 결과 (깃발·의심도가 바뀌기 전 모습).
type Stage = { phase: Phase; ballots: number; prev: TurnResult | null }

// 숲속 마을 보드 (명세 2번). result가 없으면 1턴 전, 있으면 그 턴이 끝난 상태를 그린다.
// picker가 있으면 집을 눌러 다음 턴에 할 말을 고른다 (명세 1번).
// stage가 있으면 그 턴의 밤을 단계별로 보여 준다 (밤 → 쪽지 → 깃발 → 의심 → 재판 → 판정 → 다음 날).
export function VillageBoard({
  state,
  result,
  picker,
  stage,
  swayed = [],
}: {
  state: GameState
  result: TurnResult | null
  picker?: NotePicker
  stage?: Stage
  swayed?: number[] // 내 쪽지가 결정을 뒤집은 시민 (citizenScales)
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
  // 선택창과 집 바깥을 누르면(터치 포함) 접는다. 집 클릭은 기존 토글이 처리한다.
  useEffect(() => {
    if (open == null) return
    const close = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.vb-card, .vb-house')) setOpen(null)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
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
  const changed = picker && result ? changedHouses(result) : {}
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
        <g className="vb-share" role="img" aria-label={`오늘 밤 쪽지 대조: ${pairLabel}`}>
          <title>{`오늘 밤 쪽지 대조: ${pairLabel}`}</title>
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
                  <rect x={mx - 82} y={my - 80} width="164" height="25" rx="12.5" strokeWidth="1.5" />
                  <text x={mx} y={my - 62.5} fontSize="14.5" fontWeight="700" textAnchor="middle">
                    오늘 밤 쪽지 대조
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
      {picker && turn === 0 && <Signs />}
      {houses.map((h) => (
        <HouseView
          key={h.city}
          h={h}
          swayed={at('flags') && swayed.includes(h.city)}
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
      ))}
      {night && at('notes') && <Talk result={night.result} player={state.player_city} />}
      {caught.map(([a, b]) => {
        const [mx, my] = pairMid(state.player_city, a, b)
        return <ContradictionKnot key={`${a}-${b}`} x={mx} y={my} label={`모순 발견: ${a}번 집과 ${b}번 집`} text="모순 발견" />
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
            label={`모순 위험: ${a}번 집과 ${b}번 집에 다른 말`}
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
        />
      )}
    </svg>
  )
}
