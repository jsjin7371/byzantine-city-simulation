import { useId, useState } from 'react'
import type { RefObject } from 'react'
import type { GameConfig, GameState, TurnResult } from '../gameApi'
import { BookIcon, BookLink, TheoryBook } from './TheoryBook'
import { THEORY_TOPICS } from './theoryBook'
import { loadCompletedScenarios, watchfulEyeGoalMet } from './village'
import type { TopicKey } from './village'


export type Scenario = {
  id: string
  title: string
  brief: string
  shows: string
  chips: readonly string[]
  goal: string
  rule: string
  rate: string
  seed: number
  config: Partial<GameConfig>
  topic: TopicKey
  playable: boolean
  debrief: {
    theory: string
    network: string
    reflect: string
  }
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'watchful-eye',
    title: '감시의 눈',
    brief: '"오늘 밤부터 모든 주민이 받은 쪽지를 다 같이 맞춰 봐요."',
    shows: '모든 집이 쪽지 비교를 해도, 들킨 마피아를 바로 빼내지 못하면 거짓말이 통할 수 있어요.',
    chips: ['집 5채', '모든 집 쪽지 비교', '잘못 볼 확률 45%'],
    goal: '주민 과반을 속이기',
    rule: '집마다 다른 쪽지는 쪽지 비교에서 반드시 들켜요. 모든 주민에게 같은 거짓말을 보내 보세요. 들키진 않아도 의심도는 쌓여요.',
    rate: '컴퓨터가 찾은 가장 좋은 수로 45% 이겨요',
    seed: 0,
    config: { share_mode: 'all', sensor_error: 0.45 },
    topic: 'equiv',
    playable: true,
    debrief: {
      theory:
        '집마다 다른 쪽지를 보내면 두 쪽지를 나란히 놓아 거짓말을 증명할 수 있어요. 하지만 들킨 마피아를 바로 빼내는 규칙이 없으면, 쪽지 비교만으로는 거짓말을 막기 어려워요.',
      network:
        '이더리움은 같은 차례에 다른 블록 두 개에 서명한 검증자의 보증금을 깎고 바로 퇴출해요. 웹 인증서 공개 장부도 여러 사람이 기록을 서로 비교해, 서버가 사람마다 다른 장부를 보여 주는지 잡아요.',
      reflect:
        '모두가 쪽지 비교를 하는데도 마피아가 이겼다면, 부족한 것은 감시가 아니라 들킨 뒤의 대가예요.',
    },
  },
  {
    id: 'ring-village',
    title: '고리 마을',
    brief: '"길이 좁아 양옆 두 집에만 쪽지를 보낼 수 있어요."',
    shows: '양옆 두 집에만 쪽지를 보낼 수 있는 좁은 길에서는 소식이 쉽게 막히고 왜곡돼요.',
    chips: ['집 5채', '양옆과만 연결', '잘못 볼 확률 45%'],
    goal: '주민 3명을 속이기',
    rule: '직접 말할 수 있는 집은 둘뿐이에요. 나머지 두 집 중 한 집은 이웃이 전하는 소문으로 넘겨야 해요.',
    rate: '컴퓨터가 찾은 가장 좋은 수로 42% 이겨요',
    seed: 17,
    config: { connection: 'ring', sensor_error: 0.45 },
    topic: 'ring',
    playable: false,
    debrief: {
      theory:
        '서명 없이 마피아 한 명을 확실히 막으려면, 서로 겹치지 않는 길이 세 갈래 이상 필요해요. 양옆 두 집만 이어진 고리 마을은 길이 두 갈래뿐이라, 이론상 안전한 방어를 장담할 수 없어요.',
      network:
        '비트코인 같은 P2P 망에서 공격자가 한 노드의 연결을 독점하면, 그 노드는 가짜 장부만 보게 돼요. 광통신 고리 망이 반대 방향 예비 길을 두는 것도, 한 길이 끊길 때를 대비해서예요.',
      reflect:
        '소식이 지나가는 길목을 쥔 쪽이 판을 흔들기 쉬워져요. 하지만 이 마을에서는 마피아인 나의 쪽지도 양옆 두 집에만 닿았다는 점을 떠올려 보세요.',
    },
  },
  {
    id: 'regain-trust',
    title: '신뢰를 되찾는 법',
    brief: '"재판 직전까지 밀어붙였다가, 맞는 말로 신뢰를 되찾아 보세요."',
    shows: '의심도가 오르고 내리는 폭이 같으면, 착한 척과 거짓말을 번갈아 재판을 피할 수 있어요.',
    chips: ['기본 마을', '잘못 볼 확률 45%'],
    goal: '의심도 40 넘은 주민에게 그 주민이 본 날씨와 같은 쪽지를 보내 20 이하로 낮춘 뒤, 다시 속여 이기기',
    rule: '의심도는 0 아래로 내려가지 않아요. 믿음을 미리 쌓아 둘 수 없으니, 의심도가 쌓인 뒤에 낮춰야 해요.',
    rate: '컴퓨터가 찾은 가장 좋은 수로 목표 달성 49%',
    seed: 2,
    config: { sensor_error: 0.45 },
    topic: 'onoff',
    playable: false,
    debrief: {
      theory:
        '착한 행동으로 평판을 회복했다가 다시 속이는 수법을 온오프 공격이라고 해요. 이를 막으려면 나쁜 기록을 더 오래 기억해, 신뢰를 되찾는 데 더 오래 걸리게 해야 해요.',
      network:
        'P2P나 센서 망에서는 정상 작동과 오작동을 번갈아 하며 감시를 피하는 노드가 문제예요. 온라인 장터에서도 정상 거래로 평점을 회복한 뒤 다시 불량 거래를 반복하는 수법이 나타나요.',
      reflect:
        '이 마을은 의심도가 오를 때와 내릴 때의 폭이 20으로 똑같아요. 신뢰는 천천히 쌓이고 빨리 무너져야 한다는 말은, 이런 틈을 막는 설계 원칙이기도 해요.',
    },
  },
  {
    id: 'stubborn-ally',
    title: '고집쟁이 동료',
    brief: '"동료 마피아가 한 명 더 있어요. 그런데 이 동료는 늘 같은 거짓말만 해요."',
    shows: '마피아가 둘로 늘어도, 눈치 없이 거짓말만 반복하는 동료는 오히려 먼저 재판에 걸려요.',
    chips: ['집 5채', '마피아 둘', '잘못 볼 확률 48%'],
    goal: '주민 과반을 속이기',
    rule: '동료는 금방 의심을 사요. 동료가 시선을 끄는 동안 맞는 말로 신뢰를 지키세요. 그리고 결정적인 날에만 거짓말을 보태세요.',
    rate: '컴퓨터가 찾은 가장 좋은 수로 41% 이겨요',
    seed: 1,
    config: { mafia_count: 2, sensor_error: 0.48 },
    topic: 'zealot',
    playable: false,
    debrief: {
      theory:
        '의견을 바꾸지 않는 소수가 집단의 합의를 끌어가거나 막을 수 있어요. 마피아 둘은 집 5채의 이론상 방어선 밖이지만, 고집만 부리면 의심도와 재판에 먼저 걸려요.',
      network:
        'SNS에서 같은 말만 단순하게 반복하는 봇은 눈에 띄어 탐지 시스템에 먼저 걸려요. 그래서 요즘 여론 조작 봇은 정상 글도 섞어 올리며 평범한 사람처럼 숨으려 해요.',
      reflect:
        '감시가 없는 다수결에서는 고집이 힘이지만, 의심도와 재판이 있는 마을에서는 약점이 돼요. 어떤 규칙이 고집을 힘으로 만들고, 어떤 규칙이 고집을 약점으로 바꿀까요?',
    },
  },
]

export function TheoryLab({
  headingRef,
  onBack,
  onStartScenario,
}: {
  headingRef?: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onStartScenario: (scenario: Scenario) => void
}) {
  const [bookTopic, setBookTopic] = useState<TopicKey | null>(null)
  const [completed] = useState<string[]>(loadCompletedScenarios)
  const soonId = useId()

  return (
    <div className="gm-workspace gm-lab">
      <div className="tl-wrap">
        <header className="tl-top">
          <button type="button" className="gm-exit tl-back" onClick={onBack}>
            ← 시작 화면으로
          </button>
          <div className="tl-entry">
            <h1 ref={headingRef} tabIndex={-1} className="tl-signpost">
              이론 실험실
            </h1>
            <p className="tl-entry-desc">
              분산 시스템 이론을 마을 하나에 옮겨 놓았어요. 직접 속여 보며 확인해 보세요.
            </p>
          </div>
        </header>

        <section className="tl-section" aria-labelledby="tl-scenarios-title">
          <div className="tl-section-head">
            <h2 id="tl-scenarios-title">시나리오 넷</h2>
          </div>
          <p id={soonId} className="tl-soon-note">
            지금은 &lsquo;감시의 눈&rsquo;을 바로 플레이할 수 있어요. 나머지 마을은 준비 중이고, &ldquo;이론 읽기&rdquo;는 모두 열어 볼 수 있어요.
          </p>

          <div className="tl-cards">
            {SCENARIOS.map((card) => {
              const isCompleted = completed.includes(card.id)
              return (
                <article key={card.id} className="tl-card">
                  <div className="tl-card-head">
                    <h3>{card.title}</h3>
                    <div className="tl-card-head-meta">
                      <span className="tl-topic-chip">{THEORY_TOPICS[card.topic].title}</span>
                      {isCompleted && (
                        <span className="tl-done-stamp" aria-label="목표 달성 완료">
                          완료
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="tl-real-block">
                    <p className="tl-block-label is-real">실제 네트워크에서는</p>
                    <p className="tl-real-body">{card.debrief.network}</p>
                  </div>
                  <div className="tl-village-block">
                    <p className="tl-block-label">이 마을에서는</p>
                    <p className="tl-brief">{card.brief}</p>
                    <div className="gr-chips">
                      {card.chips.map((chip) => (
                        <span key={chip} className="gr-chip tl-chip">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="tl-goal-row">
                    <p className="tl-goal">
                      <span className="tl-inline-label">목표</span>
                      <span>{card.goal}</span>
                    </p>
                    <span className="tl-rate">{card.rate}</span>
                  </div>
                  <p className="tl-tip">
                    <span className="tl-inline-label">요령</span>
                    <span>{card.rule}</span>
                  </p>
                  <div className="tl-card-foot">
                    <BookLink label="이론 읽기" icon onClick={() => setBookTopic(card.topic)} />
                    {card.playable ? (
                      <button
                        type="button"
                        className="tl-play is-ready"
                        onClick={() => onStartScenario(card)}
                      >
                        시작
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="tl-play"
                        aria-disabled="true"
                        aria-describedby={soonId}
                      >
                        시작 <span className="tl-soon-badge">준비 중</span>
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
          <p className="tl-rate-note">
            승률은 시나리오마다 1000판을 돌려 잰 값이에요.
          </p>
        </section>
      </div>

      <TheoryBook topic={bookTopic} onClose={() => setBookTopic(null)} />
    </div>
  )
}

export function ScenarioBriefing({
  scenario,
  busy,
  error,
  headingRef,
  onBack,
  onStart,
}: {
  scenario: Scenario
  busy: boolean
  error: string
  headingRef?: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  onStart: () => void
}) {
  return (
    <div className="gm-workspace gm-lab">
      <div className="tl-wrap">
        <header className="tl-top">
          <button type="button" className="gm-exit tl-back" onClick={onBack} disabled={busy}>
            ← 실험실로
          </button>
        </header>

        <section className="gr-sheet tl-briefing" aria-labelledby="tl-briefing-title">
          <p className="sc-kicker">시나리오 브리핑</p>
          <h1 id="tl-briefing-title" ref={headingRef} tabIndex={-1} className="tl-briefing-title">
            {scenario.title}
          </h1>
          <p className="tl-briefing-quote">{scenario.brief}</p>
          <div className="gr-chips">
            {scenario.chips.map((chip) => (
              <span key={chip} className="gr-chip">
                {chip}
              </span>
            ))}
          </div>

          <dl className="tl-briefing-list">
            <div>
              <dt>이번 판 목표</dt>
              <dd>{scenario.goal}</dd>
            </div>
            <div>
              <dt>요령</dt>
              <dd>{scenario.rule}</dd>
            </div>
            <div className="tl-briefing-shows">
              <dt>이 마을이 보여 주는 것</dt>
              <dd>{scenario.shows}</dd>
            </div>
          </dl>

          {error && (
            <p role="alert" className="rs-incorrect gm-error">
              {error}
            </p>
          )}

          <div className="tl-briefing-actions">
            <button type="button" className="sc-btn" onClick={onBack} disabled={busy}>
              돌아가기
            </button>
            <button type="button" className="sc-btn sc-btn-primary" onClick={onStart} disabled={busy}>
              {busy ? '마을을 여는 중…' : '시작하기'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

export function ScenarioResult({
  scenario,
  state,
  history,
  busy,
  onRetry,
  onLab,
}: {
  scenario: Scenario
  state: GameState
  history: TurnResult[]
  busy: boolean
  onRetry: () => void
  onLab: () => void
}) {
  const [bookTopic, setBookTopic] = useState<TopicKey | null>(null)
  const goalMet = watchfulEyeGoalMet(state)
  const lastDay = history.at(-1)?.turn ?? state.turn
  const blockedReason =
    state.end_reason === 'caught'
      ? `${lastDay}일째 재판에 걸렸어요.`
      : `마지막 ${lastDay}일째에 주민 과반을 속이지 못했어요.`

  return (
    <section className="gr-sheet sc-result" aria-label={`${scenario.title} 시나리오 결과`}>
      <div className="sc-result-head">
        <div>
          <p className="sc-kicker">시나리오 결과</p>
          <h2>
            {scenario.title}
            {goalMet && <span className="sr-only"> — 목표 달성</span>}
          </h2>
          {goalMet ? (
            <p className="sc-goal-done">목표 &ldquo;{scenario.goal}&rdquo;를 이뤘어요.</p>
          ) : (
            <div className="sc-miss">
              <p className="sc-miss-title">이번엔 못 이뤘어요</p>
              <p className="sc-miss-reason">{blockedReason}</p>
            </div>
          )}
        </div>
        {goalMet && (
          <div className="gr-stamp is-win sc-stamp" aria-hidden="true">
            목표
            <br />
            달성
          </div>
        )}
      </div>

      <dl className="sc-debrief">
        <div>
          <dt>이론</dt>
          <dd>{scenario.debrief.theory}</dd>
        </div>
        <div>
          <dt>실제 네트워크</dt>
          <dd>{scenario.debrief.network}</dd>
        </div>
        <div>
          <dt>생각해 볼 것</dt>
          <dd>{scenario.debrief.reflect}</dd>
        </div>
      </dl>

      <div className="sc-result-actions">
        <button type="button" className="sc-btn sc-btn-book" onClick={() => setBookTopic(scenario.topic)}>
          <BookIcon />
          <span>이론 읽기</span>
        </button>
        <button type="button" className="sc-btn sc-btn-primary" onClick={onRetry} disabled={busy}>
          다시 하기
        </button>
        <button type="button" className="sc-btn" onClick={onLab} disabled={busy}>
          실험실로
        </button>
      </div>

      <TheoryBook topic={bookTopic} onClose={() => setBookTopic(null)} />
    </section>
  )
}
