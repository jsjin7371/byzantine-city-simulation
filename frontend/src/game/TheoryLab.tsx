import { useId, useState } from 'react'
import type { RefObject } from 'react'
import type { GameConfig, GameState, TurnResult } from '../gameApi'
import { BookIcon, BookLink, TheoryBook } from './TheoryBook'
import { THEORY_TOPICS } from './theoryBook'
import { loadCompletedScenarios, scenarioGoalMet, scenarioResultNote } from './village'
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
    shows: '모든 집이 쪽지를 맞춰 보는 마을에서, 거짓말은 어디까지 막히고 어디로 새어 나갈까요?',
    chips: ['집 5채', '모든 집 쪽지 비교', '잘못 볼 확률 45%'],
    goal: '주민 과반을 속이기',
    rule: '첫날엔 의심도가 60에 못 미쳐 재판이 안 열려요. 집을 눌러 쪽지를 고를 때 뜨는 의심도 미리 보기로, 집마다 다르게 고른 경우와 모두에게 똑같이 고른 경우를 비교해 보세요. 숫자는 본 하늘과 같으면 −20, 다르면 +20, 비교에서 모순이면 +20을 합친 값이에요.',
    rate: '모두에게 같은 거짓말만 보내도 45% 이겨요',
    seed: 0,
    config: { share_mode: 'all', sensor_error: 0.45 },
    topic: 'equiv',
    playable: true,
    debrief: {
      theory:
        '집마다 다른 쪽지(이중 발언)는 비교로 증명되지만, 모순 한 번으로 바로 쫓아내는 규칙이 없으면 버틸 수 있어요. 모두에게 같은 거짓말은 이중 발언이 아니라서 비교로 안 잡혀요. 비교는 말이 다른지만 보지, 맞는 말인지는 몰라요.',
      network:
        '이더리움에서는 검증자가 같은 시점에 서로 다른 두 블록에 서명하면 예치금 일부가 깎이고 강제 퇴출돼요. 웹 인증서 공개 장부도 로그 서버가 사람마다 다른 장부를 보여 주면, 여럿이 기록 요약을 비교해 증명할 수 있게 설계됐어요.',
      reflect:
        '그래도 감시는 쓸모 있어요. 필요할 때 집마다 다르게 말하는 전략의 승률이 밤마다 두 집만 쪽지를 비교하는 기본 마을에서는 50%지만, 모든 집이 비교하면 39%로 떨어져요. 그럼 모두에게 같은 거짓말은 무엇으로 막을 수 있을까요?',
    },
  },
  {
    id: 'ring-village',
    title: '고리 마을',
    brief: '"길이 좁아 양옆 두 집에만 쪽지를 보낼 수 있어요."',
    shows: '양옆 두 집하고만 통하는 고리 마을에서, 소식은 어떻게 퍼지고 방어는 어디서 흔들릴까요?',
    chips: ['집 5채', '양옆과만 연결', '잘못 볼 확률 45%'],
    goal: '주민 3명 이상을 속이기',
    rule: '직접 쪽지를 보낼 수 있는 집은 양옆 둘뿐이에요. 양옆 두 집의 깃발이 바뀔 때와 그대로일 때, 다음 날 먼 두 집의 판단을 그 집이 본 하늘과 함께 비교해 보세요. 지난밤 하늘은 마을 이야기 줄 옆 ›에서 볼 수 있어요.',
    rate: '컴퓨터 전략으로 42% 이겨요',
    seed: 767,
    config: { connection: 'ring', sensor_error: 0.45 },
    topic: 'ring',
    playable: true,
    debrief: {
      theory:
        '서명 없이 마피아 한 명을 확실히 막으려면, 어느 두 집 사이에도 서로 겹치지 않는 길이 세 갈래 이상 필요해요. 고리 마을은 두 갈래뿐이라 보장이 없어요. 보장이 없다는 뜻이지, 늘 마피아가 이긴다는 뜻은 아니에요.',
      network:
        '비트코인 같은 P2P 망에서 공격자가 한 노드의 연결을 모두 차지하면, 그 노드는 공격자가 골라 준 장부만 보게 돼요. 광통신 고리 망의 두 길은 끊김에는 버티지만, 거짓말을 가려내기에는 부족해요.',
      reflect:
        '이 판에서는 내 쪽지도 양옆 두 집에만 닿았어요. 길이 좁으면 주민끼리도 관측을 덜 모으게 돼요. 마피아가 정직한 쪽지만 보내도 모두 연결된 마을보다 주민이 틀리는 일이 늘까요?',
    },
  },
  {
    id: 'regain-trust',
    title: '신뢰를 되찾는 법',
    brief: '"의심을 샀다가, 그 집이 본 하늘에 맞춰 신뢰를 되찾아 보세요."',
    shows: '의심도가 오르고 내리는 폭이 똑같은 마을에서, 높아진 의심도를 낮추고 다시 속이는 일이 통할까요?',
    chips: ['집 5채', '밤마다 두 집 쪽지 비교', '잘못 볼 확률 45%'],
    goal: '의심도 40 이상인 주민에게 그 주민이 본 하늘과 같은 쪽지를 보내 20\u00a0이하로 낮춘 뒤, 그 주민을 다시 속여 이기기',
    rule: '의심도는 0 아래로 내려가지 않아요. 의심도가 오른 집을 눌러, 그 집이 본 하늘과 같은 쪽지를 고를 때와 다른 쪽지를 고를 때의 의심도 미리 보기를 비교해 보세요. 하늘을 잘못 본 날엔 어느 쪽이 진짜 날씨인지도 함께 보세요.',
    rate: '컴퓨터 전략으로 목표 달성 49%',
    seed: 2,
    config: { sensor_error: 0.45 },
    topic: 'onoff',
    playable: true,
    debrief: {
      theory:
        '착한 행동으로 평판을 회복했다가 다시 속이는 수법을 온오프 공격이라고 해요. 좋은 행동과 나쁜 행동을 같은 크기로 반영하면 재판 기준 아래를 오갈 수 있어, 나쁜 기록을 더 오래 기억하게 설계해요. 이 마을의 의심도는 진실이 아니라 그 집이 본 하늘과 맞았는지로 매겨져요.',
      network:
        'P2P나 센서 망에서는 정상 작동과 악의적 행동을 번갈아 하며 감시를 피하는 노드가 문제로 지적돼요. 온라인 장터에서도 정상 거래로 평점을 회복한 뒤 다시 불량 거래를 반복하는 수법이 논의돼요.',
      reflect:
        '이 마을은 의심도가 오를 때와 내릴 때의 폭이 20으로 똑같았어요. 본 하늘과 같은 쪽지를 보내도 의심도가 훨씬 조금만 내려갔다면, 이번 판처럼 다시 낮출 수 있었을까요?',
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
    rate: '컴퓨터 전략으로 41% 이겨요',
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
            지금은 &lsquo;감시의 눈&rsquo;, &lsquo;고리 마을&rsquo;, &lsquo;신뢰를 되찾는 법&rsquo;을 바로 플레이할 수 있어요. &lsquo;고집쟁이 동료&rsquo;는 준비 중이고, &ldquo;이론 읽기&rdquo;는 모두 열어 볼 수 있어요.
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
            승률과 목표 달성률은 시나리오마다 1000판을 돌려 잰 값이에요.
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
  const goalMet = scenarioGoalMet(state, scenario.id, history)
  const resultNote = scenarioResultNote(scenario.id, state, history)
  const lastDay = history.at(-1)?.turn ?? state.turn
  const blockedReason =
    state.end_reason === 'caught'
      ? `${lastDay}일째 재판에 걸렸어요.`
      : '이번 판에서 목표를 이루지 못했어요.'

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

      {resultNote && <p className="sc-clash-note">{resultNote}</p>}

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
