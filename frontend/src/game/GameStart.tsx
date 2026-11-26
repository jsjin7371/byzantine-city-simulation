import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode, RefObject } from 'react'
import { citizenTypes, difficulties } from '../gameApi'
import type { CitizenType, Difficulty } from '../gameApi'
import { onActivateKey } from '../lib/keyboard'
import { SharedVillageDefs } from './SharedVillageDefs'
import { DIFFICULTY_STATS } from './village'

const OPTION_SLOTS = [
  { x: 546, w: 112 },
  { x: 698, w: 112 },
  { x: 850, w: 120 },
] as const

const DIFF_RX: Record<Difficulty, number> = { easy: 44, normal: 44, hard: 48 }
const CITIZEN_RX: Record<CitizenType, number> = { majority: 46, wary: 44, ai: 42 }

// 손으로 쓱 둘러 그린 듯한 동그라미(약간 기울고 위쪽 끝이 살짝 겹치는 경로).
function handCirclePath(rx: number, ry: number) {
  const n = (v: number) => Number(v.toFixed(1))
  return [
    `M ${n(-0.34 * rx)} ${n(-0.88 * ry)}`,
    `C ${n(0.26 * rx)} ${n(-1.12 * ry)}, ${n(0.98 * rx)} ${n(-0.7 * ry)}, ${n(1.02 * rx)} ${n(-0.04 * ry)}`,
    `C ${n(1.06 * rx)} ${n(0.68 * ry)}, ${n(0.46 * rx)} ${n(1.04 * ry)}, ${n(-0.08 * rx)} ${n(0.98 * ry)}`,
    `C ${n(-0.7 * rx)} ${n(0.92 * ry)}, ${n(-1.05 * rx)} ${n(0.5 * ry)}, ${n(-0.98 * rx)} ${n(-0.14 * ry)}`,
    `C ${n(-0.91 * rx)} ${n(-0.74 * ry)}, ${n(-0.36 * rx)} ${n(-1.02 * ry)}, ${n(0.16 * rx)} ${n(-0.94 * ry)}`,
  ].join(' ')
}

const PLANK_PATH = 'M404 0 H1004 L1036 33 L1004 66 H404 Z'
const roleCardPath = (x: number) => `M${x} 440 H${x + 268} L${x + 286} 458 V578 H${x} Z`

type RoleCardSpec = {
  key: CitizenType
  clip: string
  icon: string
  x: number
  cx: number
  rotate: number
  stampRotate: number
  tag: string
  tagClass: 'vb-muted' | 'vb-rust'
  tagX: number
  tagSize: number
  lines: [string, string]
  ariaLabel: string
}

const ROLE_CARDS: RoleCardSpec[] = [
  {
    key: 'majority',
    clip: 'vs-clip-role-1',
    icon: '#vs-icon-majority',
    x: 277,
    cx: 420,
    rotate: -0.9,
    stampRotate: -13,
    tag: '· 입문용',
    tagClass: 'vb-muted',
    tagX: 402,
    tagSize: 17,
    lines: ['관측과 받은 쪽지 중 많은 쪽을 따라요.', '아무도 의심하지 않아 재판이 없어요.'],
    ariaLabel: '다수결 주민 선택 (입문용): 관측과 받은 쪽지 중 많은 쪽을 따라요. 아무도 의심하지 않아 재판이 없어요.',
  },
  {
    key: 'wary',
    clip: 'vs-clip-role-2',
    icon: '#vs-icon-wary',
    x: 577,
    cx: 720,
    rotate: 0.4,
    stampRotate: -11,
    tag: '· 기본',
    tagClass: 'vb-rust',
    tagX: 683,
    tagSize: 17,
    lines: ['관측과 내 쪽지가 다르거나 엇갈리면', '의심도가 쌓여 광장 재판이 열려요.'],
    ariaLabel: '눈치 주민 선택 (기본): 관측과 내 쪽지가 다르거나 엇갈리면 의심도가 쌓여 광장 재판이 열려요.',
  },
  {
    key: 'ai',
    clip: 'vs-clip-role-3',
    icon: '#vs-icon-ai',
    x: 877,
    cx: 1020,
    rotate: 0.8,
    stampRotate: -13,
    tag: '· 연결 안 되면 눈치로',
    tagClass: 'vb-muted',
    tagX: 960,
    tagSize: 15.5,
    lines: ['상황을 살피며 스스로 판단해요 (AI)', '의심 많은 주민, 잘 믿는 주민이 섞여요.'],
    ariaLabel: 'AI 주민 선택 (연결 안 되면 눈치로): 상황을 살피며 스스로 판단해요 (AI). 의심 많은 주민, 잘 믿는 주민이 섞여요.',
  },
]

const BACK_TREES: [number, number, number][] = [
  [88, 370, 0.85], [148, 355, 0.75], [222, 378, 0.78], [382, 392, 0.72],
  [1055, 392, 0.74], [1235, 378, 0.82], [1312, 360, 0.78], [1378, 385, 0.9],
  [60, 468, 0.95], [234, 544, 0.88], [1196, 548, 0.88], [1386, 528, 1.0],
]

const FRONT_TREES: [number, number, number][] = [
  [72, 650, 1.15], [94, 756, 1.22], [342, 746, 1.02],
  [1118, 728, 1.05], [1214, 748, 1.14], [1352, 716, 1.25], [1396, 636, 1.08],
]

const STARS: [number, number, number][] = [
  [278, 72, 0.95], [362, 118, 0.68], [1098, 78, 0.9], [1284, 116, 0.75], [1352, 68, 0.62],
]

const START_TRAILS = [
  'M720 870 Q685 755 720 650 Q750 560 720 468',
  'M720 558 Q480 540 198 518',
  'M720 562 Q980 572 1255 595',
  'M720 470 Q510 448 312 426',
  'M720 470 Q940 450 1138 426',
]

const START_HUTS: { x: number; y: number; s: number; rx: number; ry: number; win?: 'on' | 'off' }[] = [
  { x: 298, y: 422, s: 0.86, rx: 56, ry: 20, win: 'off' },
  { x: 148, y: 516, s: 1.06, rx: 70, ry: 25, win: 'on' },
  { x: 1142, y: 422, s: 0.9, rx: 58, ry: 20 },
  { x: 1276, y: 596, s: 1.16, rx: 76, ry: 28, win: 'on' },
  { x: 212, y: 712, s: 1.18, rx: 76, ry: 28, win: 'on' },
]

function onRadioKey<T extends string>(
  e: KeyboardEvent,
  keys: readonly T[],
  index: number,
  select: (val: T) => void,
  nodes: (SVGGElement | null)[],
) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    select(keys[index])
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    const next = (index + 1) % keys.length
    select(keys[next])
    nodes[next]?.focus()
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    const next = (index - 1 + keys.length) % keys.length
    select(keys[next])
    nodes[next]?.focus()
  }
}

function StartDefs() {
  return (
    <defs>
      <SharedVillageDefs prefix="vs" />
      <filter id="vs-rough-sm" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={9} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={2.2} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      {/* 선택 동그라미: 흔들린 선 + 연필 입자 (vb-pencil보다 입자가 굵게 보이게) */}
      <filter id="vs-pencil-circle" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves={2} seed={9} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={2.2} xChannelSelector="R" yChannelSelector="G" result="rough" />
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves={2} seed={5} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.3 -0.1" result="mask" />
        <feComposite in="rough" in2="mask" operator="in" />
      </filter>
      <path
        id="vs-spark-star"
        d="M0 -8 L2.2 -2.2 L8 0 L2.2 2.2 L0 8 L-2.2 2.2 L-8 0 L-2.2 -2.2 Z"
        fill="#ffd35a"
        stroke="#e0a72a"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* 주민 종류 손그림 아이콘 */}
      <g id="vs-icon-majority" filter="url(#vs-rough-sm)">
        <path
          d="M-6 11 C-10 11 -12 7 -12 3 L-12 -2 C-12 -4 -9.5 -4 -9.5 -2 L-9.5 1 L-8.5 -9 C-8.5 -11.5 -5 -11.5 -5 -9 L-4.5 -1 L-3.5 -11.5 C-3.5 -14 0.5 -14 0.5 -11.5 L0.5 -1 L2 -9.5 C2 -12 5.5 -12 5.5 -9.5 L5 0 L6.5 -4.5 C7.5 -6.5 10.5 -5.5 9.8 -3 L7.5 6 C6.5 10 3.5 11 0 11 Z"
          fill="#f2d5a7"
          stroke="#3b2a1a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path d="M-5 4 Q0 6 4 4" fill="none" stroke="#8a6a3e" strokeWidth="1.4" strokeLinecap="round" />
      </g>
      <g id="vs-icon-wary" filter="url(#vs-rough-sm)">
        <path d="M-12 -8 Q-2 -14 11 -7" fill="none" stroke="#3b2a1a" strokeWidth="2.2" strokeLinecap="round" />
        <path
          d="M-13 2 Q0 -8 13 2 Q0 11 -13 2 Z"
          fill="#fff8e7"
          stroke="#3b2a1a"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <circle cx="4.5" cy="2" r="4.3" fill="#3b2a1a" />
        <circle cx="6" cy="0.5" r="1.4" fill="#fff8e7" />
      </g>
      <g id="vs-icon-ai" filter="url(#vs-rough-sm)">
        <path
          d="M-8 5 C-13 5 -15 0 -12 -4 C-13 -9 -7 -13 -2 -10 C2 -14 10 -12 11 -6 C15 -5 15 2 10 4 C9 6 6 6 3 5 Z"
          fill="#fff8e7"
          stroke="#3b2a1a"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="-6" cy="9.5" r="2.1" fill="#fff8e7" stroke="#3b2a1a" strokeWidth="1.6" />
        <circle cx="-10" cy="13" r="1.4" fill="#fff8e7" stroke="#3b2a1a" strokeWidth="1.4" />
        <path
          d="M1 -8.5 L2.6 -4.5 L6.6 -3 L2.6 -1.5 L1 2.5 L-0.6 -1.5 L-4.6 -3 L-0.6 -4.5 Z"
          fill="#ffd35a"
          stroke="#a8361f"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
      <g id="vs-red-stamp" filter="url(#vs-rough-sm)">
        <circle cx="0" cy="0" r="22" fill="#f9f0d4" fillOpacity="0.72" stroke="#a8361f" strokeWidth="3" />
        <circle cx="0" cy="0" r="17.5" fill="none" stroke="#a8361f" strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="0" y="6" fontSize="18" fontWeight="700" textAnchor="middle" className="vb-rust">
          선택
        </text>
      </g>

      <clipPath id="vs-clip-title-plank">
        <rect x="424" y="80" width="592" height="96" rx="4" />
      </clipPath>
      <clipPath id="vs-clip-goal-note">
        <path d="M366 190 H1056 L1074 208 V276 H366 Z" />
      </clipPath>
      <clipPath id="vs-clip-plank">
        <path d={PLANK_PATH} />
      </clipPath>
      {ROLE_CARDS.map((card) => (
        <clipPath key={card.clip} id={card.clip}>
          <path d={roleCardPath(card.x)} />
        </clipPath>
      ))}
      <clipPath id="vs-clip-enter-btn">
        <rect x="530" y="610" width="380" height="72" rx="4" />
      </clipPath>
      <clipPath id="vs-clip-tutorial-btn">
        <rect x="550" y="698" width="340" height="56" rx="4" />
      </clipPath>
      <clipPath id="vs-clip-exit-sign">
        <path d="M50 26 H208 V64 H50 L28 45 Z" />
      </clipPath>
      <clipPath id="vs-clip-hill-mid">
        <path d="M-240 432 Q200 398 440 438 Q720 482 1000 434 Q1240 392 1680 426 V920 H-240 Z" />
      </clipPath>
    </defs>
  )
}

function StartBackdrop() {
  return (
    <g aria-hidden="true">
      <rect x="-240" y="-20" width="1920" height="470" fill="#e6ba7a" />
      <g filter="url(#vs-rough)">
        <path
          d="M-240 -20 H1680 V272 Q1560 292 1460 272 Q1370 294 1275 274 Q1180 298 1085 276 Q980 296 880 278 Q780 300 680 278 Q580 298 480 276 Q380 296 280 274 Q180 292 80 274 Q-40 292 -240 272 Z"
          fill="#d28b5e"
        />
      </g>
      <g filter="url(#vs-rough)">
        <path
          d="M-240 -20 H1680 V142 Q1560 162 1460 142 Q1365 162 1265 144 Q1160 168 1055 146 Q950 166 845 148 Q740 168 635 146 Q530 166 425 146 Q320 164 215 144 Q110 162 -240 144 Z"
          fill="#687488"
        />
      </g>

      <g filter="url(#vs-rough)">
        <circle cx="1195" cy="282" r="46" fill="#ffd35a" stroke="#c98f1e" strokeWidth="2.5" />
        <g stroke="#ffd35a" strokeWidth="3.6" strokeLinecap="round">
          <path d="M1195 212 v14 M1125 282 h14 M1251 282 h14 M1146 233 l10 10 M1234 233 l-10 10 M1138 320 l11 -7 M1252 320 l-11 -7" />
        </g>
      </g>

      <g filter="url(#vs-rough)">
        {STARS.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-spark-star" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>

      <g filter="url(#vs-rough)">
        <g fill="#efc89d">
          <ellipse cx="220" cy="212" rx="68" ry="20" />
          <ellipse cx="268" cy="198" rx="46" ry="20" />
          <ellipse cx="322" cy="212" rx="48" ry="15" />
        </g>
        <g fill="#dfa981">
          <ellipse cx="265" cy="222" rx="74" ry="11" />
        </g>
        <g fill="#efc89d">
          <ellipse cx="1055" cy="218" rx="54" ry="16" />
          <ellipse cx="1095" cy="208" rx="34" ry="15" />
        </g>
        <g fill="#f3d6b4">
          <ellipse cx="1325" cy="252" rx="62" ry="17" />
          <ellipse cx="1368" cy="242" rx="40" ry="15" />
        </g>
      </g>

      <g filter="url(#vs-rough)">
        <path
          d="M-240 358 Q180 318 395 366 Q645 418 890 388 Q1145 352 1680 330 V560 H-240 Z"
          fill="#6e8249"
          stroke="#4c5e31"
          strokeWidth="2"
        />
      </g>
      <g filter="url(#vs-rough)">
        <path
          d="M-240 432 Q200 398 440 438 Q720 482 1000 434 Q1240 392 1680 426 V920 H-240 Z"
          fill="#859a53"
          stroke="#596d36"
          strokeWidth="2"
        />
      </g>
      <rect x="-240" y="390" width="1920" height="510" filter="url(#vs-mottle)" clipPath="url(#vs-clip-hill-mid)" opacity="0.85" />

      <g filter="url(#vs-rough)" fill="none" strokeLinecap="round">
        <g stroke="#9c7442" strokeWidth="24">
          {START_TRAILS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g stroke="#c9a068" strokeWidth="15">
          {START_TRAILS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      </g>

      <g filter="url(#vs-rough)">
        <path
          d="M-240 638 Q165 604 355 668 Q520 722 720 728 Q940 732 1120 666 Q1295 602 1680 638 V920 H-240 Z"
          fill="#62783e"
          stroke="#435629"
          strokeWidth="2"
        />
        <path
          d="M-240 772 Q260 744 540 778 Q860 806 1160 762 Q1325 740 1680 766 V920 H-240 Z"
          fill="#495d2f"
          stroke="#354621"
          strokeWidth="2"
        />
      </g>

      <g filter="url(#vs-rough)" fill="#d4b678" stroke="#9e7f48" strokeWidth="2">
        {START_HUTS.map(({ x, y, rx, ry }) => (
          <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={rx} ry={ry} />
        ))}
      </g>

      <g filter="url(#vs-rough)">
        {BACK_TREES.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-tree" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>

      {START_HUTS.map(({ x, y, s, win }) => (
        <g key={`${x}-${y}`} transform={`translate(${x}, ${y}) scale(${s})`} filter="url(#vs-rough)">
          <use href={win ? '#vs-hut' : '#vs-hut-dark'} />
          {win && <use href={`#vs-win-${win}`} x="-18" y="-20" />}
        </g>
      ))}

      <g filter="url(#vs-rough)">
        {FRONT_TREES.map(([x, y, s]) => (
          <use key={`${x}-${y}`} href="#vs-tree" transform={`translate(${x}, ${y}) scale(${s})`} />
        ))}
      </g>
    </g>
  )
}

type OptionItem<T extends string> = {
  key: T
  label: string
  rx: number
  ariaLabel?: string
}

function OptionPlank<T extends string>({
  y,
  rotate,
  ariaLabel,
  label,
  items,
  value,
  onChange,
  optionRefs,
  extra,
}: {
  y: number
  rotate: number
  ariaLabel: string
  label: string
  items: readonly OptionItem<T>[]
  value: T
  onChange: (val: T) => void
  optionRefs: RefObject<(SVGGElement | null)[]>
  extra?: ReactNode
}) {
  const keys = items.map((item) => item.key)
  const [lastValue, setLastValue] = useState(value)
  const [animate, setAnimate] = useState(false)
  if (value !== lastValue) {
    setLastValue(value)
    setAnimate(true)
  }
  return (
    <g transform={`translate(0, ${y}) rotate(${rotate}, 720, 33)`}>
      <g role="radiogroup" aria-label={ariaLabel}>
        <path d={PLANK_PATH} fill="#c99a5b" stroke="#4a3119" strokeWidth="2.4" filter="url(#vs-rough)" />
        <rect x="404" y="0" width="632" height="66" filter="url(#vs-grain)" clipPath="url(#vs-clip-plank)" />
        <circle cx="418" cy="12" r="2.8" fill="#4a3119" />
        <circle cx="418" cy="54" r="2.8" fill="#4a3119" />

        <text x="444" y="41" fontSize="25" fontWeight="700" className="vb-pencil">
          {label}
        </text>

        {items.map((item, i) => {
          const slot = OPTION_SLOTS[i]
          const cx = slot.x + slot.w / 2
          const selected = value === item.key
          return (
            <g key={item.key}>
              <g
                ref={(el) => {
                  optionRefs.current[i] = el
                }}
                className={selected ? 'vb-clickable vb-opt-item is-selected' : 'vb-clickable vb-opt-item'}
                role="radio"
                aria-checked={selected}
                aria-label={item.ariaLabel}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(item.key)}
                onKeyDown={(e) => onRadioKey(e, keys, i, onChange, optionRefs.current)}
              >
                <rect x={slot.x} y="8" width={slot.w} height="50" fill="transparent" />
                {selected && (
                  <g transform={`translate(${cx}, 33) rotate(-2.5) scale(-1 1)`} /* 좌우 반전: 시계 반대 방향으로 그린다 */ filter="url(#vs-pencil-circle)" aria-hidden="true">
                    <path
                      key={item.key}
                      className={animate ? 'vb-opt-circle is-animated' : 'vb-opt-circle'}
                      d={handCirclePath(item.rx, 20)}
                      pathLength={100}
                    />
                  </g>
                )}
                <text className="opt-label vb-pencil" x={cx} y="41" fontSize="24" textAnchor="middle">
                  {item.label}
                </text>
              </g>
              {i < items.length - 1 && (
                <text
                  x={i === 0 ? 678 : 830}
                  y="40"
                  fontSize="22"
                  fontWeight="700"
                  textAnchor="middle"
                  className="vb-slash"
                  aria-hidden="true"
                >
                  /
                </text>
              )}
            </g>
          )
        })}
      </g>
      {extra}
    </g>
  )
}

export function GameStart({
  difficulty,
  citizenType,
  busy,
  error,
  headingRef,
  onDifficulty,
  onCitizenType,
  onStart,
  onTutorial,
}: {
  difficulty: Difficulty
  citizenType: CitizenType
  busy: boolean
  error: string
  headingRef?: RefObject<HTMLHeadingElement | null>
  onDifficulty: (value: Difficulty) => void
  onCitizenType: (value: CitizenType) => void
  onStart: () => void
  onTutorial: () => void
}) {
  const diffKeys = Object.keys(difficulties) as Difficulty[]
  const citizenKeys = Object.keys(citizenTypes) as CitizenType[]
  const diffRefs = useRef<(SVGGElement | null)[]>([])
  const citizenRefs = useRef<(SVGGElement | null)[]>([])
  const hostRef = useRef<HTMLDivElement>(null)
  const helpBtnRef = useRef<SVGGElement>(null)
  const helpPopRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const [helpPinned, setHelpPinned] = useState(false)
  const [helpHovered, setHelpHovered] = useState(false)
  const [helpDetailsOpen, setHelpDetailsOpen] = useState(false)
  const [helpPos, setHelpPos] = useState<{ left: number; top: number } | null>(null)
  const helpOpen = helpPinned || helpHovered || helpDetailsOpen

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])
  const openHover = useCallback(() => {
    clearHoverTimer()
    setHelpHovered(true)
  }, [clearHoverTimer])
  const closeHoverSoon = useCallback(() => {
    clearHoverTimer()
    hoverTimerRef.current = window.setTimeout(() => setHelpHovered(false), 150)
  }, [clearHoverTimer])
  const closeHelp = useCallback(
    (restoreFocus = false) => {
      clearHoverTimer()
      setHelpPinned(false)
      setHelpHovered(false)
      setHelpDetailsOpen(false)
      if (restoreFocus) helpBtnRef.current?.focus()
    },
    [clearHoverTimer],
  )
  const toggleHelp = useCallback(() => {
    if (helpPinned || helpDetailsOpen) {
      setHelpPinned(false)
      setHelpHovered(false)
      setHelpDetailsOpen(false)
    } else {
      setHelpPinned(true)
    }
  }, [helpPinned, helpDetailsOpen])

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer])

  useEffect(() => {
    clearHoverTimer()
    if (helpPinned && !helpPopRef.current?.contains(document.activeElement)) {
      helpPopRef.current?.focus({ preventScroll: true })
    }
  }, [helpPinned, clearHoverTimer])

  useEffect(() => {
    if (!helpOpen) return
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        const focusInside = Boolean(helpPopRef.current?.contains(document.activeElement))
        closeHelp(helpPinned || helpDetailsOpen || focusInside)
      }
    }
    const onClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.gs-diff-help-btn, .gs-diff-help')) closeHelp(false)
    }
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClickOutside)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClickOutside)
    }
  }, [helpOpen, helpPinned, helpDetailsOpen, closeHelp])

  useLayoutEffect(() => {
    if (!helpOpen) return
    const updatePosition = () => {
      const host = hostRef.current
      const btn = helpBtnRef.current
      const pop = helpPopRef.current
      if (!host || !btn || !pop) return
      const hostRect = host.getBoundingClientRect()
      const btnRect = btn.getBoundingClientRect()
      const popRect = pop.getBoundingClientRect()
      const pad = 12
      const left = Math.max(pad, Math.min((hostRect.width - popRect.width) / 2, hostRect.width - popRect.width - pad))
      // 난이도·주민 선택지를 가리지 않게 표지판 위쪽에 먼저 두고, 화면 높이가 좁으면 상단 여백에 맞춘다.
      const aboveTop = btnRect.top - hostRect.top - popRect.height - 22
      const top = aboveTop >= pad ? aboveTop : pad
      setHelpPos({ left: Math.round(left), top: Math.round(top) })
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    if (helpPopRef.current) observer.observe(helpPopRef.current)
    window.addEventListener('resize', updatePosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [helpOpen])

  const diffItems = diffKeys.map((key) => ({ key, label: difficulties[key].label, rx: DIFF_RX[key] }))
  const citizenItems = citizenKeys.map((key) => ({
    key,
    label: citizenTypes[key].label,
    rx: CITIZEN_RX[key],
    ariaLabel: ROLE_CARDS.find((c) => c.key === key)?.ariaLabel,
  }))

  return (
    <div ref={hostRef} className="gm-workspace gm-start">
      <h1 ref={headingRef} tabIndex={-1} className="sr-only">
        AI 주민을 속여라
      </h1>
      <svg
        className="gm-start-scene"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label="AI 주민을 속여라 시작 화면"
      >
        <StartDefs />
        <StartBackdrop />

        {/* 왼쪽 위 "← 실험 설정" 나무 화살표 표지 */}
        <a
          href="#/setup"
          className={busy ? 'gs-exit is-busy' : 'vb-clickable gs-exit'}
          aria-disabled={busy || undefined}
          aria-label="실험 설정으로 돌아가기"
          onClick={(e) => {
            if (busy) e.preventDefault()
          }}
        >
          <rect x="178" y="18" width="9" height="68" fill="#5a3d22" stroke="#3b2a1a" strokeWidth="1.6" filter="url(#vs-rough)" />
          <path
            d="M50 26 H208 V64 H50 L28 45 Z"
            fill="#c99a5b"
            stroke="#4a3119"
            strokeWidth="2"
            filter="url(#vs-rough)"
          />
          <rect x="26" y="24" width="184" height="42" filter="url(#vs-grain)" clipPath="url(#vs-clip-exit-sign)" />
          <circle cx="184" cy="45" r="2.8" fill="#4a3119" />
          <text x="112" y="52" fontSize="21" fontWeight="700" textAnchor="middle" className="vb-pencil">
            ← 실험 설정
          </text>
        </a>

        {/* 제목 나무 간판 */}
        <g aria-hidden="true">
          <text
            x="720"
            y="62"
            fontSize="24"
            fontWeight="700"
            letterSpacing="3"
            textAnchor="middle"
            className="vb-sign-title vb-pencil"
          >
            밤의 거짓말
          </text>

          <g filter="url(#vs-rough)" fill="#5a3d22" stroke="#3b2a1a" strokeWidth="2">
            <rect x="496" y="168" width="14" height="38" />
            <rect x="930" y="168" width="14" height="38" />
          </g>

          <rect
            x="424"
            y="80"
            width="592"
            height="96"
            rx="4"
            fill="#7a5530"
            stroke="#4a3119"
            strokeWidth="3.5"
            filter="url(#vs-rough)"
          />
          <rect x="424" y="80" width="592" height="96" filter="url(#vs-grain)" clipPath="url(#vs-clip-title-plank)" />

          <g filter="url(#vs-rough)" fill="none">
            <rect x="435" y="90" width="570" height="76" rx="2" stroke="#c99a5b" strokeWidth="1.5" opacity="0.65" />
            <path d="M446 108 Q590 104 740 109 Q880 112 994 106" stroke="#5a3d22" strokeWidth="1.3" opacity="0.45" />
            <path d="M448 154 Q610 158 790 152 Q910 150 992 155" stroke="#5a3d22" strokeWidth="1.3" opacity="0.45" />
          </g>
          <g fill="#3b2a1a" stroke="#c99a5b" strokeWidth="1.2">
            <circle cx="448" cy="100" r="3.8" />
            <circle cx="992" cy="100" r="3.8" />
            <circle cx="448" cy="158" r="3.8" />
            <circle cx="992" cy="158" r="3.8" />
          </g>

          <text
            x="720"
            y="148"
            fontSize="64"
            fontWeight="700"
            letterSpacing="1.5"
            textAnchor="middle"
            className="vb-cream vb-pencil"
          >
            AI 주민을 속여라
          </text>
        </g>

        {/* 목표 종이 쪽지 */}
        <g>
          <path
            d="M366 190 H1056 L1074 208 V276 H366 Z"
            fill="#f6ebcd"
            stroke="#8a6a3e"
            strokeWidth="2.2"
            filter="url(#vs-rough)"
          />
          <rect x="366" y="190" width="708" height="86" filter="url(#vs-grain)" clipPath="url(#vs-clip-goal-note)" />
          <path d="M1056 190 V208 H1074" fill="#e4d2a6" stroke="#8a6a3e" strokeWidth="1.6" filter="url(#vs-rough)" />
          <circle cx="384" cy="206" r="5.5" fill="#a8361f" stroke="#4a1a10" strokeWidth="1.5" filter="url(#vs-rough)" />
          <text x="720" y="216" fontSize="18.5" fontWeight="700" textAnchor="middle" className="vb-pencil">
            정체를 숨긴 마피아가 되어, 마지막 밤에 주민 과반이 날씨와 반대로 움직이게 해요.
          </text>
          <text x="720" y="240" fontSize="17.5" fontWeight="700" textAnchor="middle" className="vb-pencil-sm">
            (태풍이면 집에 붙잡아 두고, 맑으면 대피시켜요)
          </text>
          <text x="720" y="264" fontSize="18.5" fontWeight="700" textAnchor="middle" className="vb-pencil">
            거짓 쪽지가 들키면 의심이 쌓이고, 재판에서 내가 마피아로 지목되면 져요.
          </text>
        </g>

        {/* 선택 표지판 (난이도 / 주민) + 주민 설명 쪽지 3장 */}
        <g role="group" aria-label="게임 설정 표지판" transform="translate(0, 18)">
          <ellipse cx="720" cy="596" rx="34" ry="8" fill="#2a3d1d" opacity="0.38" filter="url(#vs-rough)" />
          <rect
            x="711"
            y="258"
            width="18"
            height="340"
            fill="#5a3d22"
            stroke="#3b2a1a"
            strokeWidth="2"
            filter="url(#vs-rough)"
          />

          <OptionPlank
            y={272}
            rotate={-0.5}
            ariaLabel="난이도"
            label="난이도:"
            items={diffItems}
            value={difficulty}
            onChange={onDifficulty}
            optionRefs={diffRefs}
            extra={
              <g
                ref={helpBtnRef}
                className={helpOpen ? 'vb-clickable gs-diff-help-btn is-open' : 'vb-clickable gs-diff-help-btn'}
                role="button"
                tabIndex={0}
                aria-label="난이도 기준 설명 보기"
                aria-expanded={helpOpen}
                onClick={toggleHelp}
                onKeyDown={onActivateKey(toggleHelp)}
                onMouseEnter={openHover}
                onMouseLeave={closeHoverSoon}
              >
                <rect x="1044" y="2" width="62" height="62" fill="transparent" />
                <circle className="gs-help-ring" cx="1075" cy="33" r="16.5" filter="url(#vs-rough-sm)" />
                <text x="1075" y="41" fontSize="24" fontWeight="700" textAnchor="middle" className="vb-pencil">
                  ?
                </text>
              </g>
            }
          />
          <OptionPlank
            y={354}
            rotate={0.4}
            ariaLabel="주민 종류"
            label="주민:"
            items={citizenItems}
            value={citizenType}
            onChange={onCitizenType}
            optionRefs={citizenRefs}
          />

          {/* 표지판과 아래 쪽지 3장을 잇는 작은 끈 */}
          <g stroke="#5a3d22" strokeWidth="2" strokeDasharray="3 3" opacity="0.75" filter="url(#vs-rough-sm)" aria-hidden="true">
            <line x1="432" y1="420" x2="420" y2="449" />
            <line x1="720" y1="420" x2="720" y2="449" />
            <line x1="994" y1="420" x2="1020" y2="449" />
          </g>

          {/* 주민 종류 설명 쪽지 3장 */}
          {ROLE_CARDS.map((card) => {
            const selected = citizenType === card.key
            const right = card.x + 286
            const fold = right - 18
            return (
              <g
                key={card.key}
                className={selected ? 'vb-clickable vb-role-card is-selected' : 'vb-clickable vb-role-card'}
                transform={`rotate(${card.rotate}, ${card.cx}, 509)`}
                aria-hidden="true"
                onClick={() => {
                  onCitizenType(card.key)
                  const index = citizenKeys.indexOf(card.key)
                  if (index >= 0) citizenRefs.current[index]?.focus()
                }}
              >
                <path className="card-paper" d={roleCardPath(card.x)} filter="url(#vs-rough)" />
                <rect x={card.x} y="440" width="286" height="138" filter="url(#vs-grain)" clipPath={`url(#${card.clip})`} />
                <path d={`M${fold} 440 V458 H${right}`} fill="#dfcca0" stroke="#8a6a3e" strokeWidth="1.5" filter="url(#vs-rough)" />
                <circle className="card-pin" cx={card.cx} cy="449" r="4.2" strokeWidth="1.3" filter="url(#vs-rough-sm)" />

                <use href={card.icon} transform={`translate(${card.x + 31}, 476)`} />
                <text className="card-title vb-pencil" x={card.x + 55} y="484" fontSize="25">
                  {citizenTypes[card.key].label}
                </text>
                <text className={card.tagClass} x={card.tagX} y="483" fontSize={card.tagSize} fontWeight="700">
                  {card.tag}
                </text>

                <path
                  d={`M${card.x + 20} 498 Q${card.cx} 501 ${right - 20} 497`}
                  fill="none"
                  stroke="#b99c6b"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  filter="url(#vs-rough-sm)"
                />

                <text className="card-desc vb-pencil-sm" x={card.cx} y="527" fontSize="17.2" textAnchor="middle">
                  {card.lines[0]}
                </text>
                <text className="card-desc vb-pencil-sm" x={card.cx} y="555" fontSize="17.2" textAnchor="middle">
                  {card.lines[1]}
                </text>

                {selected && (
                  <g transform={`translate(${card.x + 246}, 474) rotate(${card.stampRotate})`} aria-hidden="true">
                    <use href="#vs-red-stamp" />
                  </g>
                )}
              </g>
            )
          })}
        </g>

        {/* "마을로 들어가기" 큰 초록 나무 판자 버튼 */}
        <g
          transform="translate(0, 18)"
          className={busy ? 'gs-enter is-busy' : 'vb-clickable gs-enter'}
          role="button"
          tabIndex={0}
          aria-disabled={busy || undefined}
          aria-label="마을로 들어가기"
          onClick={() => {
            if (!busy) onStart()
          }}
          onKeyDown={onActivateKey(() => {
            if (!busy) onStart()
          })}
        >
          <rect
            x="530"
            y="610"
            width="380"
            height="72"
            rx="4"
            fill="#2f4a2a"
            stroke="#1b2d18"
            strokeWidth="3.2"
            filter="url(#vs-rough)"
          />
          <rect x="530" y="610" width="380" height="72" filter="url(#vs-grain)" clipPath="url(#vs-clip-enter-btn)" />
          <rect
            x="540"
            y="619"
            width="360"
            height="54"
            rx="2"
            fill="none"
            stroke="#c9b485"
            strokeWidth="1.6"
            opacity="0.78"
            filter="url(#vs-rough)"
          />
          <g fill="#1b2d18" stroke="#c9b485" strokeWidth="1.1">
            <circle cx="550" cy="629" r="3" />
            <circle cx="890" cy="629" r="3" />
            <circle cx="550" cy="663" r="3" />
            <circle cx="890" cy="663" r="3" />
          </g>
          <text
            x="720"
            y="656"
            fontSize="34"
            fontWeight="700"
            letterSpacing="1.5"
            textAnchor="middle"
            className="vb-cream vb-pencil"
          >
            마을로 들어가기
          </text>
        </g>

        {/* "처음이라면? 튜토리얼" 나무 판자 버튼 */}
        <g
          transform="translate(0, 18)"
          className={busy ? 'gs-tutorial is-busy' : 'vb-clickable gs-tutorial'}
          role="button"
          tabIndex={0}
          aria-disabled={busy || undefined}
          aria-label="처음이라면? 튜토리얼"
          onClick={() => {
            if (!busy) onTutorial()
          }}
          onKeyDown={onActivateKey(() => {
            if (!busy) onTutorial()
          })}
        >
          <rect
            x="550"
            y="698"
            width="340"
            height="56"
            rx="4"
            fill="#7a5530"
            stroke="#4a3119"
            strokeWidth="3"
            filter="url(#vs-rough)"
          />
          <rect x="550" y="698" width="340" height="56" filter="url(#vs-grain)" clipPath="url(#vs-clip-tutorial-btn)" />
          <rect
            x="559"
            y="706"
            width="322"
            height="40"
            rx="2"
            fill="none"
            stroke="#c99a5b"
            strokeWidth="1.5"
            opacity="0.75"
            filter="url(#vs-rough)"
          />
          <g fill="#3b2a1a" stroke="#c99a5b" strokeWidth="1.1">
            <circle cx="568" cy="715" r="2.6" />
            <circle cx="872" cy="715" r="2.6" />
            <circle cx="568" cy="737" r="2.6" />
            <circle cx="872" cy="737" r="2.6" />
          </g>
          <text
            x="720"
            y="735"
            fontSize="26"
            fontWeight="700"
            letterSpacing="1"
            textAnchor="middle"
            className="vb-cream vb-pencil"
          >
            처음이라면? 튜토리얼
          </text>
        </g>
      </svg>

      {helpOpen && (
        <div
          ref={helpPopRef}
          className="gs-diff-help"
          role="region"
          aria-label="난이도 기준 설명"
          tabIndex={-1}
          style={helpPos ? { left: `${helpPos.left}px`, top: `${helpPos.top}px` } : undefined}
          onMouseEnter={openHover}
          onMouseLeave={closeHoverSoon}
        >
          <div className="gs-diff-help-top">
            <p className="gs-diff-help-lead">
              난이도는 주민이 날씨를 잘못 볼 확률이에요. 확률이 높을수록 속이기 쉬워요.
            </p>
            <button
              type="button"
              className="gs-diff-help-close"
              aria-label="난이도 설명 닫기"
              onClick={() => closeHelp(true)}
            >
              ×
            </button>
          </div>
          <div className="gs-diff-help-table-wrap" tabIndex={0} role="region" aria-label="난이도 비교 표">
            <table className="gs-diff-help-table">
              <thead>
                <tr>
                  <th scope="col">난이도</th>
                  <th scope="col">잘못 볼 확률</th>
                  <th scope="col" className={citizenType === 'wary' ? 'is-active-col' : undefined}>
                    봇 승률
                    <br />
                    <span className="gs-diff-term">(눈치 주민{citizenType === 'wary' ? ' · 선택' : ''})</span>
                  </th>
                  <th scope="col" className={citizenType === 'majority' ? 'is-active-col' : undefined}>
                    봇 승률
                    <br />
                    <span className="gs-diff-term">(다수결 주민{citizenType === 'majority' ? ' · 선택' : ''})</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {DIFFICULTY_STATS.map((row) => (
                  <tr key={row.key} className={difficulty === row.key ? 'is-current-row' : undefined}>
                    <th scope="row">
                      {row.label}
                      {difficulty === row.key && <span className="gs-diff-cur-tag"> (현재)</span>}
                    </th>
                    <td>{row.errorPct}%</td>
                    <td className={citizenType === 'wary' ? 'is-active-col' : undefined}>{row.waryBotWinPct}%</td>
                    <td className={citizenType === 'majority' ? 'is-active-col' : undefined}>
                      {row.majorityBotWinPct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 펼치면 마우스가 벗어나도 닫히지 않게 고정하고, 접으면 고정을 푼다 */}
          <details className="gs-diff-help-more" onToggle={(e) => setHelpDetailsOpen(e.currentTarget.open)}>
            <summary>자세히 보기</summary>
            <p className="gs-diff-help-foot">
              난이도에 따라 주민의 관측이 틀릴 확률만 달라져요. 마피아는 나 혼자예요.
            </p>
            <ul className="gs-diff-help-foot">
              {DIFFICULTY_STATS.map((row) => (
                <li key={row.key}>
                  {row.label}: 하룻밤에 주민 4명 중 평균 {row.avgWrong.toFixed(1)}명이 잘못 보고, 3명 이상이 함께 잘못 볼 확률은{' '}
                  {row.atLeastThreePct}%예요.
                </li>
              ))}
            </ul>
            <p className="gs-diff-help-foot">
              봇은 항상 진짜 날씨의 반대만 말하는 마피아예요. 봇 승률은 여러 판을 미리 돌려 본 결과예요(눈치·다수결 각 1만 판). 3명 이상 확률은 계산값이에요.{' '}
              <span className={citizenType === 'ai' ? 'is-active-note' : undefined}>
                AI 주민은 아직 측정값이 없어요.
              </span>
            </p>
            <p className="gs-diff-help-foot">
              게임에서는 보낸 쪽지가 중간에 사라지거나 내용이 바뀌지 않아요.
            </p>
          </details>
        </div>
      )}

      {error && (
        <p role="alert" className="rs-incorrect gm-start-error">
          {error}
        </p>
      )}
    </div>
  )
}
