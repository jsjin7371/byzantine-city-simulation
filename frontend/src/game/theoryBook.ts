import type { TagKey, TopicKey } from './village.ts'

export type TheoryRef = {
  before: string
  italic?: string
  after?: string
}

export type TheoryTip = {
  easy: string
  game: string
  theory: string
  cite: string
}

export type TheoryTopic = {
  kicker: string
  title: string
  en: string
  easy: string
  game: string
  boxes: readonly (readonly [string, string])[]
  proof: string
  refs: readonly TheoryRef[]
  tip?: TheoryTip
}

// 책 오버레이와 수법 꼬리표 팝오버의 이론 원문 데이터.
// 원문 검증 워커가 본문을 교체할 때 이 파일 한 곳만 바꾼다.
export const THEORY_TOPICS: Record<TopicKey, TheoryTopic> = {
  byz: {
    kicker: '분산 합의',
    title: '비잔틴 장군 문제',
    en: 'The Byzantine Generals Problem',
    easy: '거짓말쟁이가 섞여 있어도 정직한 사람들끼리 같은 결론을 낼 수 있을까요? 거짓말쟁이가 전체의 3분의 1 미만이어야 가능해요.',
    game: '집은 장군, 마피아는 배신자, 쪽지는 전령이에요. 집 5채에 마피아 하나면 이 한계 안쪽이라 원래 주민이 유리한 판이에요. 다만 이 말은 "올바른 규칙이 있다"는 뜻일 뿐, 이 마을 주민이 그 규칙을 쓴다는 뜻은 아니에요. 그래서 한계 안쪽에서도 마피아가 이길 수 있어요.',
    boxes: [
      [
        '정의',
        'n명의 장군 중 최대 f명이 배신자일 때, 충성스러운 장군들은 (1) 모두 같은 결정을 내리고, (2) 사령관이 충성스러우면 그 명령을 따라야 한다.',
      ],
      [
        '정리 1',
        '구두 메시지만 쓸 때, n ≤ 3f이면 위 조건을 만족하는 알고리즘은 없다. n ≥ 3f + 1이면 OM(f) 알고리즘이 조건을 만족한다.',
      ],
      [
        '정리 2',
        '위조할 수 없는 서명을 쓰면, 배신자 수와 관계없이 SM(f) 알고리즘이 조건을 만족한다.',
      ],
    ],
    proof:
      '장군 셋 중 하나가 배신자라고 하자. 충성스러운 부관은 "사령관이 서로 다른 명령을 보냈다"는 상황과 "다른 부관이 명령을 거짓으로 전했다"는 상황을 구별할 수 없다. 두 상황에서 같은 결정을 내리면 어느 한쪽에서 조건이 깨진다.',
    refs: [
      {
        before: 'Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine Generals Problem. ',
        italic: 'ACM TOPLAS',
        after: ', 4(3), 382–401.',
      },
    ],
  },
  equiv: {
    kicker: '비잔틴 장애',
    title: '이중 발언',
    en: 'Equivocation',
    easy: '같은 날, 집마다 다른 말을 하는 거예요. 서로 맞춰 보기 전까지는 아무도 모르죠.',
    game: '쪽지 비교에서 들키면 두 집의 의심도가 20씩 올라가요. 그런데 주민이 자기가 본 하늘과 같은 말을 들으면 의심도가 20 내려가요. 그래서 모든 집이 쪽지 비교를 해도 이중 발언이 완전히 막히지 않아요. 증거를 잡아도 거짓말한 쪽을 빼지 않으면 소용이 없다는 뜻이에요.',
    boxes: [
      ['정의', '참여자가 같은 라운드에 서로 다른 상대에게 서로 모순되는 메시지를 보내는 행위.'],
      [
        '성질',
        '부분 동기 네트워크에서 정지 장애만 견디려면 n ≥ 2f + 1이면 충분하다(Paxos, Raft). 이중 발언까지 가능한 비잔틴 장애에는 n ≥ 3f + 1이 필요하다. 신뢰 하드웨어로 이중 발언 자체를 막으면 비잔틴 장애도 2f + 1로 견딜 수 있다.',
      ],
    ],
    proof:
      '서명이 있으면 모순된 두 메시지를 맞대어 거짓의 증거로 만들 수 있다. 증거를 받은 참여자가 그 발신자를 배제하는 규칙이 있어야 증거가 힘을 가진다.',
    refs: [
      {
        before: 'Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine Generals Problem. ',
        italic: 'ACM TOPLAS',
        after: ', 4(3).',
      },
      {
        before: 'Chun, B.-G., Maniatis, P., Shenker, S., & Kubiatowicz, J. (2007). Attested Append-Only Memory. ',
        italic: 'SOSP',
        after: '.',
      },
    ],
    tip: {
      easy: '같은 날, 집마다 다른 말을 하는 거예요.',
      game: '쪽지 비교에서 들키면 두 집의 의심도가 20씩 올라가요. 어느 집이 비교할지는 미리 보여요.',
      theory:
        '한 참여자가 같은 라운드에 서로 다른 상대에게 모순된 메시지를 보내는 행위. 비잔틴 장애가 단순 정지 장애보다 어려운 핵심 이유이며, 서명이 있으면 두 메시지를 맞대어 거짓의 증거로 쓸 수 있다.',
      cite: 'Lamport, Shostak & Pease (1982); Chun et al. (2007)',
    },
  },
  onoff: {
    kicker: '평판 시스템',
    title: '온오프 공격',
    en: 'On-off attack',
    easy: '믿음을 되찾았다가 다시 배신하는 수법이에요. 들킬 듯하면 착하게 굴고, 잊힐 만하면 다시 속이죠.',
    game: '맞는 말은 의심도를 20 내리고, 틀린 말은 20 올려요. 오르내림이 같아서 신뢰를 금방 되찾을 수 있어요. 대신 의심도는 0 아래로 내려가지 않아 믿음을 미리 쌓아 둘 수는 없어요.',
    boxes: [
      [
        '정의',
        '공격자가 정직한 행동과 악의적 행동을 번갈아 하여, 평판을 처벌 기준 위로 유지하면서 이득을 얻는 공격.',
      ],
      [
        '방어',
        '나쁜 행동에 더 큰 가중치를 두고 더 오래 기억한다(비대칭 가중과 망각). 이 마을처럼 대칭이면 공격이 쉬워진다.',
      ],
    ],
    proof: '',
    refs: [
      {
        before:
          'Hoffman, K., Zage, D., & Nita-Rotaru, C. (2009). A Survey of Attack and Defense Techniques for Reputation Systems. ',
        italic: 'ACM Computing Surveys',
        after: ', 42(1).',
      },
    ],
    tip: {
      easy: '믿음을 되찾았다가 다시 배신하는 수법이에요.',
      game: '맞는 말을 하면 의심도가 20씩 내려가요. 재판 직전에 정직하게 굴면 다시 속일 여유가 생겨요.',
      theory:
        '평판 시스템에서 공격자가 정직한 행동과 악의적 행동을 번갈아 하여, 평판을 처벌 기준 위로 유지하며 이득을 얻는 공격. 나쁜 행동을 더 무겁고 오래 기억하는 비대칭 가중으로 방어한다.',
      cite: 'Hoffman, Zage & Nita-Rotaru (2009), ACM Computing Surveys 42(1)',
    },
  },
  ring: {
    kicker: '분산 합의',
    title: '연결도 조건',
    en: 'Connectivity requirement',
    easy: '말을 전할 길이 적으면, 거짓말쟁이 하나가 길목을 막고 소식을 바꿔 버릴 수 있어요.',
    game: '고리 마을은 집마다 양옆 두 집하고만 이어져 있어요. 마피아 하나만 있어도 이론상 주민이 꼭 지켜 낸다는 보장이 없는 구조예요. 대신 마피아의 쪽지도 두 집에만 닿아요.',
    boxes: [
      [
        '정리',
        'f명의 비잔틴 장애를 견디는 합의에는 n ≥ 3f + 1과 함께, 통신망의 연결도가 2f + 1 이상이어야 한다.',
      ],
      ['이 마을', '고리의 연결도는 2이고, f = 1일 때 필요한 값은 3이다.'],
    ],
    proof:
      '두 집 사이의 모든 길이 f개 이하의 집을 거친다면, 그 f개 집이 배신자일 때 양쪽은 서로의 진짜 메시지를 확인할 방법이 없다.',
    refs: [
      {
        before: 'Dolev, D. (1982). The Byzantine Generals Strike Again. ',
        italic: 'Journal of Algorithms',
        after: ', 3(1), 14–30.',
      },
    ],
  },
  condorcet: {
    kicker: '사회적 선택',
    title: '콩도르세 배심원 정리',
    en: "Condorcet's jury theorem",
    easy: '각자 조금이라도 더 자주 맞히는 사람들이 모이면, 다수결은 거의 틀리지 않아요.',
    game: '모든 날을 기억하는 주민은 날마다 본 하늘이 한 표씩 쌓이는 것과 같아요. 하늘을 잘못 볼 확률이 48%면 하루치는 동전 던지기와 비슷하지만, 쌓일수록 다수결이 단단해져 후반엔 쪽지로 뒤집기 어려워요.',
    boxes: [
      [
        '정리',
        '서로 독립인 n명이 각각 p > 1/2의 확률로 옳은 답을 고르면, 다수결이 옳을 확률은 n이 커질수록 1에 가까워진다.',
      ],
      [
        '조건',
        '독립성이 깨지면 결론도 깨진다. 같은 소문을 들은 사람들은 n명이 아니라 사실상 한 명에 가깝다.',
      ],
    ],
    proof: '',
    refs: [
      {
        before: 'Condorcet, M. de (1785). ',
        italic: "Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix",
        after: '.',
      },
    ],
  },
  zealot: {
    kicker: '의견 동역학',
    title: '완고한 행위자',
    en: 'Zealots in opinion dynamics',
    easy: '절대 마음을 바꾸지 않는 사람 하나가 집단 전체의 의견을 끌어당길 수 있어요.',
    game: '재판이 없는 다수결 마을이라면 마피아 둘은 언제나 이겨요. 하지만 이 마을은 의심도를 재기 때문에, 같은 거짓말을 되풀이하는 동료가 먼저 재판에 걸려요. 감시가 있는 마을에서는 오히려 고집이 약점이 돼요.',
    boxes: [
      [
        '결과',
        '투표자 모형에 의견을 바꾸지 않는 행위자를 하나 넣으면, 다른 행위자들의 의견 분포가 그쪽으로 치우친다.',
      ],
    ],
    proof: '',
    refs: [
      {
        before: 'Mobilia, M. (2003). Does a Single Zealot Affect an Infinite Group of Voters? ',
        italic: 'Physical Review Letters',
        after: ', 91, 028701.',
      },
    ],
    tip: {
      easy: '늘 같은 거짓말만 되풀이하는 동료가 먼저 시선을 끄는 상황이에요.',
      game: '동료 마피아는 주민 눈치를 보지 않고 매번 같은 거짓말만 해요. 그래서 의심도가 빨리 쌓여 재판을 열게 돼요.',
      theory:
        '투표자 모형에 의견을 바꾸지 않는 완고한 행위자를 넣으면 집단의 의견 분포가 그쪽으로 치우친다. 다만 평판 감시가 있으면 일관된 거짓말이 오히려 먼저 탐지된다.',
      cite: 'Mobilia (2003), Physical Review Letters 91, 028701',
    },
  },
  falsepos: {
    kicker: '평판 시스템',
    title: '거짓 양성',
    en: 'False positive in reputation systems',
    easy: '거짓말을 하지 않은 무고한 주민이 오해를 받아 마피아로 지목되는 일이에요.',
    game: '하늘을 잘못 본 주민이 많아지면 정직한 주민의 말도 어긋난 것처럼 보여 의심도가 쌓여요. 재판에서 무고한 주민이 지목되면 마피아는 위기를 넘기게 돼요.',
    boxes: [
      [
        '정의',
        '정직하게 행동한 참여자가 관측 오차나 환경 잡음 때문에 악의적 행위자로 오인되어 처벌·배제되는 현상. (자리표시 본문)',
      ],
      [
        '성질',
        '처벌 기준을 낮추면 공격자를 빨리 잡을 수 있지만 무고한 참여자가 억울하게 지목될 위험도 함께 커진다.',
      ],
    ],
    proof: '',
    refs: [
      {
        before:
          'Hoffman, K., Zage, D., & Nita-Rotaru, C. (2009). A Survey of Attack and Defense Techniques for Reputation Systems. ',
        italic: 'ACM Computing Surveys',
        after: ', 42(1).',
      },
    ],
    tip: {
      easy: '무고한 주민이 마피아로 오해받아 지목되는 일이에요.',
      game: '하늘을 잘못 본 주민이 많으면 정직한 주민도 의심도가 쌓여 재판에서 지목될 수 있어요.',
      theory:
        '평판 기반 탐지에서는 관측 잡음 때문에 정직한 참여자도 처벌 기준을 넘어 거짓 양성(오탐)으로 지목될 수 있다. 탐지 민감도와 오탐률 사이에는 상충이 존재한다.',
      cite: 'Hoffman, Zage & Nita-Rotaru (2009), ACM Computing Surveys 42(1)',
    },
  },
  audit: {
    kicker: '비잔틴 장애',
    title: '감사 회피',
    en: 'Evading announced audits',
    easy: '누가 서로 맞춰 볼지 미리 알면, 그 둘에게만 같은 말을 해 들키지 않고 넘어갈 수 있어요.',
    game: '이 마을은 밤마다 쪽지를 비교할 두 집이 점선으로 미리 보여요. 그 두 집에만 같은 쪽지를 보내고 나머지 집에는 다른 말을 하면, 이중 발언을 여러 번 하고도 모순이 한 번도 안 생겨요.',
    boxes: [
      [
        '정의',
        '검사 대상이나 시점이 사전에 공개될 때, 공격자가 검사 경로에서만 일관되게 행동해 탐지를 피하는 현상. (자리표시 본문)',
      ],
      [
        '방어',
        '누가 누구와 대조할지 공격자가 미리 알 수 없도록 불시 감사나 전체 교차 검증을 사용한다.',
      ],
    ],
    proof: '',
    refs: [
      {
        before: 'Haeberlen, A., Kouznetsov, P., & Druschel, P. (2007). PeerReview: Practical Accountability for Distributed Systems. ',
        italic: 'SOSP',
        after: '.',
      },
    ],
    tip: {
      easy: '쪽지 비교 짝을 피해 집마다 다른 말을 하고도 한 번도 안 들키는 수법이에요.',
      game: '점선으로 이어진 두 집에만 같은 쪽지를 보내면, 다른 집에 반대 말을 보내도 모순이 생기지 않아요.',
      theory:
        '감사 대상이 미리 드러나면 공격자는 감사 경로에서만 일관성을 유지해 탐지를 회피할 수 있다. 효과적인 감사를 위해서는 검사 시점과 대상을 예측할 수 없어야 한다.',
      cite: 'Haeberlen, Kouznetsov & Druschel (2007), SOSP',
    },
  },
}

export function getTacticTip(tag: TagKey): TheoryTip {
  const topic = THEORY_TOPICS[tag]
  return (
    topic.tip ?? {
      easy: topic.easy,
      game: topic.game,
      theory: topic.boxes[0]?.[1] ?? '',
      cite: topic.refs[0]?.before ?? '',
    }
  )
}
