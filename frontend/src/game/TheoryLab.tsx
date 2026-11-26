import { useId, useState } from 'react'
import type { RefObject } from 'react'
import { BookLink, TheoryBook } from './TheoryBook'
import type { TopicKey } from './village'

const RATE_BASIS = '시나리오마다 찾은 전략 중 가장 잘 이긴 것 기준(1000판)'

const SCENARIOS: readonly {
  id: string
  title: string
  brief: string
  chips: readonly string[]
  goal: string
  rule: string
  rate: string
  seed: number
  topic: TopicKey
}[] = [
  {
    id: 'watchful-eye',
    title: '감시의 눈',
    brief: '"오늘 밤부터 모든 주민이 받은 쪽지를 다 같이 맞춰 봐요."',
    chips: ['집 5채', '모든 집 쪽지 비교', '잘못 볼 확률 45%'],
    goal: '주민 과반을 속이기',
    rule: '집마다 다른 쪽지는 쪽지 비교에서 반드시 들켜요. 모든 주민에게 같은 말을 보내 보세요.',
    rate: '잘하면 45% 이겨요',
    seed: 0,
    topic: 'equiv',
  },
  {
    id: 'ring-village',
    title: '고리 마을',
    brief: '"길이 좁아 양옆 두 집에만 쪽지를 보낼 수 있어요."',
    chips: ['집 5채', '양옆과만 연결', '잘못 볼 확률 45%'],
    goal: '주민 3명을 속이기',
    rule: '직접 말할 수 있는 집은 둘뿐이에요. 나머지 한 집은 이웃이 전하는 소문으로 넘겨야 해요.',
    rate: '잘하면 42% 이겨요',
    seed: 17,
    topic: 'ring',
  },
  {
    id: 'regain-trust',
    title: '신뢰를 되찾는 법',
    brief: '"재판 직전까지 밀어붙였다가, 맞는 말로 신뢰를 되찾아 보세요."',
    chips: ['기본 마을', '잘못 볼 확률 45%'],
    goal: '의심도 40 넘은 주민에게 그 주민이 본 날씨와 같은 쪽지를 보내 20 이하로 낮춘 뒤, 다시 속여 이기기',
    rule: '의심도는 0 아래로 내려가지 않아요. 믿음을 미리 쌓아 둘 수 없으니, 의심도가 쌓인 뒤에 낮춰야 해요.',
    rate: '잘하면 목표 달성 49%',
    seed: 2,
    topic: 'onoff',
  },
  {
    id: 'stubborn-ally',
    title: '고집쟁이 동료',
    brief: '"동료 마피아가 한 명 더 있어요. 그런데 이 동료는 늘 같은 거짓말만 해요."',
    chips: ['집 5채', '마피아 둘', '잘못 볼 확률 48%'],
    goal: '주민 과반을 속이기',
    rule: '동료는 금방 의심을 사요. 동료가 시선을 끄는 동안 맞는 말로 신뢰를 지키세요. 그리고 결정적인 날에만 거짓말을 보태세요.',
    rate: '잘하면 41% 이겨요',
    seed: 1,
    topic: 'zealot',
  },
]

export function TheoryLab({
  headingRef,
  onBack,
}: {
  headingRef?: RefObject<HTMLHeadingElement | null>
  onBack: () => void
}) {
  const [bookTopic, setBookTopic] = useState<TopicKey | null>(null)
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
              마을 규칙을 하나씩 바꾼 시나리오와 그 바탕이 되는 이론을 모아 둔 공간이에요.
            </p>
          </div>
        </header>

        <section className="tl-section" aria-labelledby="tl-scenarios-title">
          <div className="tl-section-head">
            <h2 id="tl-scenarios-title">시나리오</h2>
            <p>지금 엔진으로 바로 열 수 있는 마을 넷</p>
          </div>
          <p id={soonId} className="tl-soon-note">
            시나리오 실제 플레이는 준비 중이에요. 지금은 각 마을의 &ldquo;이론 읽기&rdquo;를 먼저 열어 볼 수 있어요.
          </p>

          <div className="tl-cards">
            {SCENARIOS.map((card) => (
              <article key={card.id} className="tl-card">
                <h3>{card.title}</h3>
                <p className="tl-brief">{card.brief}</p>
                <dl>
                  <div>
                    <dt>마을</dt>
                    <dd className="gr-chips">
                      {card.chips.map((chip) => (
                        <span key={chip} className="gr-chip tl-chip">
                          {chip}
                        </span>
                      ))}
                    </dd>
                  </div>
                  <div>
                    <dt>목표</dt>
                    <dd>{card.goal}</dd>
                  </div>
                  <div>
                    <dt>이 마을에서는</dt>
                    <dd>{card.rule}</dd>
                  </div>
                </dl>
                <p className="tl-rate">{card.rate}*</p>
                <div className="tl-card-foot">
                  <BookLink label="이론 읽기" icon onClick={() => setBookTopic(card.topic)} />
                  <button
                    type="button"
                    className="tl-play"
                    aria-disabled="true"
                    aria-describedby={soonId}
                  >
                    시작 <span className="tl-soon-badge">준비 중</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
          <p className="tl-rate-note">
            * 승률은 {RATE_BASIS}이에요. &lsquo;신뢰를 되찾는 법&rsquo;은 목표까지 달성한 비율이에요.
          </p>
        </section>
      </div>

      <TheoryBook topic={bookTopic} onClose={() => setBookTopic(null)} />
    </div>
  )
}
