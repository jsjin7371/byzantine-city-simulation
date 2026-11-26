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

type TaggedTopic = TheoryTopic & { tip: TheoryTip }

// 책 오버레이와 수법 꼬리표 팝오버의 이론 원문 데이터.
// 원문 검증본(이론기능/3_이론책_원문검증.md) 기준.
export const THEORY_TOPICS: Record<TagKey, TaggedTopic> & Record<Exclude<TopicKey, TagKey>, TheoryTopic> = {
  byz: {
    kicker: '분산 합의',
    title: '비잔틴 장군 문제',
    en: 'The Byzantine Generals Problem',
    easy: '거짓말쟁이가 섞여 있어도 정직한 사람들끼리 같은 결론에 이를 수 있을까요? 서명 없는 말만 주고받을 때는 전체가 거짓말쟁이 수의 세 배를 넘어야 그 보장이 생겨요.',
    game: '집은 장군, 마피아는 배신자, 쪽지는 전령에 해당해요. 기본 마을(집 5채, 마피아 1명)은 이 기준 안쪽이라 원래 주민에게 유리한 출발선이에요. 하지만 정리는 "어떤 규칙을 잘 설계하면 반드시 막을 수 있다"는 뜻이지, 이 마을 주민이 그 규칙을 쓴다는 뜻은 아니에요. 이 마을 주민은 매일 자기 관측과 쪽지, 의심도로만 판단하기 때문에, 유리한 출발선에서도 마피아가 이길 수 있어요.',
    boxes: [
      [
        '정의',
        '전체 n명의 장군 중 최대 f명이 배신자일 때, 사령관이 나머지 n - 1명의 부관에게 명령을 보내 다음 두 조건을 만족해야 한다. (IC1) 충성스러운 부관은 모두 같은 명령을 따른다. (IC2) 사령관이 충성스러우면 모든 충성스러운 부관은 사령관이 보낸 명령을 따른다.',
      ],
      [
        '정리 1',
        '위조 방지가 없는 구두 메시지만 쓸 때, n ≥ 3이면서 n ≤ 3f이면 위 조건을 만족하는 알고리즘은 존재하지 않는다. 반대로 n ≥ 3f + 1이면 알고리즘 OM(f)가 IC1과 IC2를 모두 만족한다.',
      ],
      [
        '정리 2',
        '충성스러운 장군의 서명을 위조할 수 없고 누구나 진위를 검증할 수 있는 서명 메시지를 쓰면, 알고리즘 SM(f)는 배신자 수 f와 전체 수 n의 비율에 관계없이 문제를 해결한다. (단, 전체 장군이 서로 직접 통신할 수 있어야 하며 n < f + 2이면 문제는 자명하다.)',
      ],
    ],
    proof:
      '장군 셋 중 하나가 배신자이고 구두 메시지만 쓴다고 하자. 충성스러운 부관 1은 "충성스러운 사령관이 \'공격\'을 보냈는데 배신자 부관 2가 \'후퇴\'로 바꿔 전했다"는 상황과 "배신자 사령관이 부관 1에게는 \'공격\', 부관 2에게는 \'후퇴\'를 보냈다"는 상황을 구별할 수 없다. 두 상황에서 모두 \'공격\'을 따를 수밖에 없고, 같은 이유로 부관 2는 \'후퇴\'를 따르게 되어 IC1이 깨진다.',
    refs: [
      {
        before: 'Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine Generals Problem. ',
        italic: 'ACM Transactions on Programming Languages and Systems',
        after: ', 4(3), 382–401. DOI: 10.1145/357172.357176',
      },
      {
        before: 'Pease, M., Shostak, R., & Lamport, L. (1980). Reaching Agreement in the Presence of Faults. ',
        italic: 'Journal of the ACM',
        after: ', 27(2), 228–234. DOI: 10.1145/322186.322188',
      },
    ],
  },
  equiv: {
    kicker: '비잔틴 장애',
    title: '이중 발언',
    en: 'Equivocation',
    easy: '같은 날, 집마다 서로 다른 말을 보내는 거예요. 쪽지 비교를 해 보기 전까지는 각 집이 자기 것만 보기 때문에 거짓을 알기 어려워요.',
    game: '쪽지 비교에서 모순이 드러나면 비교한 두 집의 의심도가 20씩 올라가요. 그런데 주민은 자기 관측과 같은 쪽지를 받으면 의심도를 20 내려요. 그래서 모든 집이 쪽지 비교를 하는 마을에서도, 각 주민이 본 하늘에 맞춰 서로 다른 쪽지를 보내면 +20과 −20이 상쇄되어 재판이 거의 열리지 않아요. 이론에서는 거짓 증거가 잡히면 그 발신자를 걸러 내지만, 이 마을에는 그런 배제 규칙이 없기 때문이에요.',
    boxes: [
      [
        '정의',
        '결함이 있는 참여자가 같은 시점이나 같은 사안에 대해 서로 다른 상대에게 모순된 메시지를 보내는 행위이다.',
      ],
      [
        '성질 1',
        '부분 동기 네트워크에서 전체 참여자 수 n 중 최대 f명이 멈춤 장애만 일으킬 때는 n ≥ 2f + 1이면 합의가 가능하지만, 비잔틴 장애에는 n ≥ 3f + 1이 필요하다.',
      ],
      [
        '성질 2',
        '비동기 모델에서 이중 발언만 막는 것으로는 하한이 n ≥ 3f + 1에서 내려가지 않는다. 신뢰 하드웨어 로그처럼 이중 발언 방지와 제3자에게 전달 가능한 인증을 함께 갖추면 n ≥ 2f + 1로도 비잔틴 장애를 견딜 수 있다.',
      ],
    ],
    proof:
      '서명이 있으면 서로 모순된 두 메시지를 나란히 놓아 발신자의 거짓을 증명할 수 있다. 그러나 그 증거를 제3자에게 검증 가능하게 전달하고, 모순을 낸 발신자를 합의 절차에서 배제하는 규칙이 함께 있어야 이중 발언의 힘이 사라진다.',
    refs: [
      {
        before: 'Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine Generals Problem. ',
        italic: 'ACM Transactions on Programming Languages and Systems',
        after: ', 4(3), 382–401. DOI: 10.1145/357172.357176',
      },
      {
        before: 'Dwork, C., Lynch, N., & Stockmeyer, L. (1988). Consensus in the Presence of Partial Synchrony. ',
        italic: 'Journal of the ACM',
        after: ', 35(2), 288–323. DOI: 10.1145/42282.42283',
      },
      {
        before:
          'Chun, B.-G., Maniatis, P., Shenker, S., & Kubiatowicz, J. (2007). Attested Append-Only Memory: Making Adversaries Stick to Their Word. In ',
        italic: "Proceedings of the 21st ACM SIGOPS Symposium on Operating Systems Principles (SOSP '07)",
        after: ', 189–204. DOI: 10.1145/1294261.1294280',
      },
      {
        before:
          'Clement, A., Junqueira, F., Kate, A., & Rodrigues, R. (2012). On the (Limited) Power of Non-Equivocation. In ',
        italic: "Proceedings of the 2012 ACM Symposium on Principles of Distributed Computing (PODC '12)",
        after: ', 301–308. DOI: 10.1145/2332432.2332490',
      },
    ],
    tip: {
      easy: '같은 날, 집마다 서로 다른 말을 보내는 거예요.',
      game: '쪽지 비교에서 모순이 드러나면 비교한 두 집의 의심도가 20씩 올라가요. 그런데 주민은 자기 관측과 같은 쪽지를 받으면 의심도를 20 내려요.',
      theory:
        '결함이 있는 참여자가 같은 시점이나 같은 사안에 대해 서로 다른 상대에게 모순된 메시지를 보내는 행위이다. 서명이 있으면 서로 모순된 두 메시지를 나란히 놓아 발신자의 거짓을 증명할 수 있다.',
      cite: 'Lamport, Shostak, & Pease (1982); Chun et al. (2007)',
    },
  },
  onoff: {
    kicker: '평판 시스템',
    title: '온오프 공격',
    en: 'On-off attack',
    easy: '착한 척해서 믿음을 회복했다가, 다시 속이기를 반복하는 수법이에요. 의심을 살 것 같으면 맞는 말을 하고, 의심이 줄어들면 다시 거짓말을 해요.',
    game: '주민이 본 하늘과 같은 쪽지는 의심도를 20 내리고, 다른 쪽지는 20 올려요. 오르내리는 폭이 똑같아서, 재판(의심도 60) 직전에 맞는 말을 보내면 의심도를 빠르게 낮출 수 있어요. 다만 의심도는 0 아래로 내려가지 않아요. 그래서 믿음을 미리 쌓아 두었다가 한꺼번에 배신하는 식은 안 되고, 의심도가 쌓인 뒤에 낮추는 식으로만 통해요.',
    boxes: [
      [
        '정의',
        '악의적인 참여자가 정직한 행동과 악의적인 행동을 번갈아 수행하여, 평판 시스템의 탐지를 피하면서 지속적으로 피해를 주는 공격이다.',
      ],
      [
        '방어',
        '과거 기록을 일정 비율로만 잊으면 공격자가 짧은 정직 구간으로 평판을 쉽게 회복한다. 이를 막으려면 나쁜 행동을 더 오래 기억하고, 신뢰를 되찾는 데는 많은 정직한 행동이 필요하도록 적응형 망각을 둔다.',
      ],
    ],
    proof:
      '평판 시스템은 참여자의 행동이 바뀔 수 있다는 이유로 오래된 기록의 비중을 줄인다. 그런데 좋은 행동과 나쁜 행동을 같은 속도로 잊거나 같은 크기로 반영하면, 공격자는 처벌 기준선 바로 아래를 오가며 계속 활동할 수 있다.',
    refs: [
      {
        before:
          'Sun, Y. L., Han, Z., Yu, W., & Liu, K. J. R. (2006). A Trust Evaluation Framework in Distributed Networks: Vulnerability Analysis and Defense Against Attacks. In ',
        italic: 'Proceedings of IEEE INFOCOM 2006 (25th IEEE International Conference on Computer Communications)',
        after: ', 1–13. DOI: 10.1109/INFOCOM.2006.154',
      },
      {
        before:
          'Sun, Y., Han, Z., & Liu, K. J. R. (2008). Defense of Trust Management Vulnerabilities in Distributed Networks. ',
        italic: 'IEEE Communications Magazine',
        after: ', 46(2), 112–119. DOI: 10.1109/MCOM.2008.4473092',
      },
      {
        before:
          'Hoffman, K., Zage, D., & Nita-Rotaru, C. (2009). A Survey of Attack and Defense Techniques for Reputation Systems. ',
        italic: 'ACM Computing Surveys',
        after: ', 42(1), Article 1, 1–31. DOI: 10.1145/1592451.1592452',
      },
      {
        before: 'Jøsang, A., & Ismail, R. (2002). The Beta Reputation System. In ',
        italic: 'Proceedings of the 15th Bled Electronic Commerce Conference (Bled 2002)',
        after: ', Paper 41, 1–14. URL: https://folk.uio.no/josang/papers/JI2002-Bled.pdf',
      },
    ],
    tip: {
      easy: '착한 척해서 믿음을 회복했다가, 다시 속이기를 반복하는 수법이에요.',
      game: '주민이 본 하늘과 같은 쪽지는 의심도를 20 내리고, 다른 쪽지는 20 올려요. 오르내리는 폭이 똑같아서, 재판(의심도 60) 직전에 맞는 말을 보내면 의심도를 빠르게 낮출 수 있어요.',
      theory:
        '악의적인 참여자가 정직한 행동과 악의적인 행동을 번갈아 수행하여, 평판 시스템의 탐지를 피하면서 지속적으로 피해를 주는 공격이다. 이를 막으려면 나쁜 행동을 더 오래 기억하고, 신뢰를 되찾는 데는 많은 정직한 행동이 필요하도록 적응형 망각을 둔다.',
      cite: 'Sun, Han, Yu, & Liu (2006); Sun, Han, & Liu (2008)',
    },
  },
  ring: {
    kicker: '분산 합의',
    title: '연결도 조건',
    en: 'Connectivity requirement',
    easy: '소식을 전할 길이 너무 적으면, 거짓말쟁이가 길목을 잡고 양쪽을 갈라놓을 수 있어요. 그래서 전체 사람 수뿐 아니라, 서로 이어진 길의 수도 충분히 많아야 해요.',
    game: '고리 모양 마을은 집마다 양옆 두 집하고만 쪽지를 주고받아요. 이 구조에서는 마피아가 한 명만 있어도, 어떤 규칙을 써도 주민이 반드시 버틴다는 보장이 깨져요. 다만 게임과 이론이 다른 점도 있어요. 고리 마을에서는 쪽지는 양옆으로만 가지만, 쪽지 비교 짝은 마을의 모든 주민 중에서 뽑히고, 마피아의 쪽지도 양옆 두 집에만 닿아요.',
    boxes: [
      [
        '정의',
        '통신 그래프의 연결도는 그래프를 둘 이상으로 끊기 위해 제거해야 하는 최소 노드 수이다. 이는 임의의 두 노드 사이에 서로 겹치지 않는 경로가 최대 몇 개 존재하는지와 같다.',
      ],
      [
        '정리 1',
        '서명이 없는 통신에서 전체 노드 수 n 중 최대 f명의 비잔틴 결함을 견디며 합의하려면 n ≥ 3f + 1과 함께 그래프의 연결도가 2f + 1 이상이어야 한다.',
      ],
      [
        '정리 2',
        '위조할 수 없는 서명을 쓰면 조건이 크게 낮아져, 정직한 노드들만 남긴 부분 그래프가 서로 연결되어 있기만 하면(최악의 배치까지 대비하면 연결도 f + 1 이상) 합의가 가능하다.',
      ],
    ],
    proof:
      '두 집단을 가르는 길목의 노드 수가 2f 이하라면, 그중 f명이 배신자일 때 정직한 길과 배신자 길의 수가 비슷하거나 배신자 쪽이 더 많아진다. 서명이 없으면 반대편은 서로 다른 소식을 전하는 두 묶음 중 어느 쪽이 배신자인지 구별할 수 없다. 연결도가 2f + 1 이상이어야 정직한 경로가 최소 f + 1개 남아 배신자 경로(f개)를 항상 압도한다.',
    refs: [
      {
        before: 'Dolev, D. (1982). The Byzantine Generals Strike Again. ',
        italic: 'Journal of Algorithms',
        after: ', 3(1), 14–30. DOI: 10.1016/0196-6774(82)90004-9',
      },
      {
        before:
          'Fischer, M. J., Lynch, N. A., & Merritt, M. (1986). Easy Impossibility Proofs for Distributed Consensus Problems. ',
        italic: 'Distributed Computing',
        after: ', 1(1), 26–39. DOI: 10.1007/BF01843568',
      },
      {
        before: 'Lamport, L., Shostak, R., & Pease, M. (1982). The Byzantine Generals Problem. ',
        italic: 'ACM Transactions on Programming Languages and Systems',
        after: ', 4(3), 382–401. DOI: 10.1145/357172.357176',
      },
      {
        before: 'Dolev, D., Lamport, L., Pease, M., & Shostak, R. (1987). The Byzantine Generals. In B. K. Bhargava (Ed.), ',
        italic: 'Concurrency Control and Reliability in Distributed Systems',
        after: ' (Ch. 12, pp. 348–369). New York: Van Nostrand Reinhold.',
      },
    ],
  },
  condorcet: {
    kicker: '사회적 선택',
    title: '콩도르세 배심원 정리',
    en: "Condorcet's jury theorem",
    easy: '각자 동전 던지기보다 조금이라도 더 자주 맞히는 사람들이 따로 판단해 투표하면, 사람이 많을수록 다수결은 거의 틀리지 않아요.',
    game: '모든 날을 기억하는 마을에서는 주민 한 명이 매일 새로 본 하늘을 하나씩 표처럼 쌓아 두는 셈이에요. 하늘을 잘못 볼 확률이 48%라면 하루만 볼 때는 반반에 가깝지만, 날짜가 쌓이면 진짜 날씨 쪽으로 판단이 단단해져요. 다만 이론과 다른 점도 있어요. 이 마을 주민들은 서로 쪽지를 주고받기 때문에 각자의 판단이 완전히 따로 움직이지 않고, 기억이 쌓일수록 자기 관측의 무게도 커져서 후반에는 쪽지로 뒤집기가 더 어려워져요.',
    boxes: [
      [
        '정리',
        '둘 중 하나의 정답이 있는 문제에서, n명의 투표자가 서로 독립적으로 판단하고 각자 옳은 답을 고를 확률이 p > 1/2로 같다면, 홀수 n이 커질수록 다수결이 옳을 확률은 커지며 n이 무한히 커지면 1에 가까워진다.',
      ],
      [
        '조건',
        '이 결론은 판단의 독립성에 크게 의존한다. 투표자들이 같은 정보원이나 소문 같은 공통 원인의 영향을 받아 판단 사이의 양의 상관이 커지면, n이 커져도 다수결의 정확도가 1에 가까워지지 않을 수 있다.',
      ],
    ],
    proof:
      '서로 독립인 판단을 모으면 누군가의 실수가 다른 사람의 정답으로 상쇄된다. 반대로 모두가 같은 소문을 그대로 믿어 판단이 강하게 묶여 있으면, 사람이 아무리 많아도 한 사람의 판단을 여러 번 복사한 것과 다름없어 실수가 상쇄되지 않는다.',
    refs: [
      {
        before: 'Condorcet, M. de (1785). ',
        italic: "Essai sur l'application de l'analyse à la probabilité des décisions rendues à la pluralité des voix",
        after: '. Paris: Imprimerie Royale.',
      },
      {
        before: 'Grofman, B., Owen, G., & Feld, S. L. (1983). Thirteen Theorems in Search of the Truth. ',
        italic: 'Theory and Decision',
        after: ', 15(3), 261–278. DOI: 10.1007/BF00125672',
      },
      {
        before: 'Ladha, K. K. (1992). The Condorcet Jury Theorem, Free Speech, and Correlated Votes. ',
        italic: 'American Journal of Political Science',
        after: ', 36(3), 617–634. DOI: 10.2307/2111584',
      },
      {
        before: 'Dietrich, F., & Spiekermann, K. (2021). Jury Theorems. In E. N. Zalta (Ed.), ',
        italic: 'The Stanford Encyclopedia of Philosophy',
        after: ' (Winter 2021 Edition). URL: https://plato.stanford.edu/entries/jury-theorems/',
      },
    ],
  },
  zealot: {
    kicker: '의견 동역학',
    title: '완고한 행위자',
    en: 'Zealots in opinion dynamics',
    easy: '절대 마음을 바꾸지 않는 사람 몇 명이 집단 전체의 의견을 한쪽으로 끌어가거나 합의를 막을 수 있어요.',
    game: '마피아 동료는 눈치 보지 않고 늘 같은 거짓말만 보내는 고집쟁이예요. 재판이 없는 다수결 마을이라면 이런 마피아 둘이 첫날부터 판을 굳혀 주민을 이겨요. 하지만 의심도와 재판이 있는 기본 마을에서는 정반대예요. 계속 틀린 쪽지만 보내는 동료의 의심도가 먼저 60을 넘어 재판에 걸리기 때문에, 감시가 있는 마을에서는 고집이 오히려 약점이 돼요. 참고로 이론의 모형은 이웃 한 명의 의견을 무작위로 따라 하는 규칙이지만, 이 게임의 주민은 여러 쪽지와 자기 관측을 함께 따져요.',
    boxes: [
      [
        '정의',
        '의견 동역학에서 완고한 행위자(zealot)란 이웃의 영향과 무관하게 특정 의견을 선호하거나 아예 의견을 바꾸지 않는 참여자를 말한다.',
      ],
      [
        '결과 1',
        '무한 격자 위의 투표자 모형에 한쪽 의견을 선호하는 완고한 행위자를 한 명 넣으면, 1차원과 2차원에서는 시간이 지날수록 각 참여자의 의견이 그 의견으로 수렴하지만, 3차원 이상에서는 거리가 멀수록 영향이 줄어 모두를 그 의견으로 끌어오지는 못한다.',
      ],
      [
        '결과 2',
        '의견을 절대 바꾸지 않는 완고한 행위자가 양쪽 진영에 각각 존재하면, 완전 그래프와 1·2차원 격자에서 전체 인구 n이 아무리 커져도 합의에 이르지 못한다. 특히 양쪽 완고 수가 같을 때 의견 분포의 폭은 n이 아니라 완고한 행위자 수 f의 제곱근에 반비례(1/√f)한다.',
      ],
    ],
    proof:
      '일반 참여자는 이웃의 의견을 그대로 복사하므로 집단 의견이 무작위로 떠돈다. 여기에 한쪽으로만 끌어당기는 완고한 행위자가 끼어들면, 낮은 차원에서는 시간이 지날수록 그 영향이 멀리까지 번져 각 참여자의 의견을 그쪽으로 수렴시키고, 양쪽에 모두 있으면 서로 끌어당겨 합의를 영구히 막는다.',
    refs: [
      {
        before: 'Mobilia, M. (2003). Does a Single Zealot Affect an Infinite Group of Voters? ',
        italic: 'Physical Review Letters',
        after: ', 91(2), 028701. DOI: 10.1103/PhysRevLett.91.028701 (arXiv: cond-mat/0304670)',
      },
      {
        before: 'Mobilia, M., Petersen, A., & Redner, S. (2007). On the Role of Zealotry in the Voter Model. ',
        italic: 'Journal of Statistical Mechanics: Theory and Experiment',
        after: ', 2007(08), P08029. DOI: 10.1088/1742-5468/2007/08/P08029 (arXiv: 0706.2892)',
      },
    ],
    tip: {
      easy: '절대 마음을 바꾸지 않는 사람 몇 명이 집단 전체의 의견을 한쪽으로 끌어가거나 합의를 막을 수 있어요.',
      game: '마피아 동료는 눈치 보지 않고 늘 같은 거짓말만 보내는 고집쟁이예요. 계속 틀린 쪽지만 보내는 동료의 의심도가 먼저 60을 넘어 재판에 걸리기 때문에, 감시가 있는 마을에서는 고집이 오히려 약점이 돼요.',
      theory:
        '의견 동역학에서 완고한 행위자(zealot)란 이웃의 영향과 무관하게 특정 의견을 선호하거나 아예 의견을 바꾸지 않는 참여자를 말한다. 무한 격자 위의 투표자 모형에 한쪽 의견을 선호하는 완고한 행위자를 한 명 넣으면, 1차원과 2차원에서는 시간이 지날수록 각 참여자의 의견이 그 의견으로 수렴하지만, 3차원 이상에서는 거리가 멀수록 영향이 줄어 모두를 그 의견으로 끌어오지는 못한다.',
      cite: 'Mobilia (2003); Mobilia, Petersen, & Redner (2007)',
    },
  },
  falsepos: {
    kicker: '평판 시스템 · 이상 탐지',
    title: '거짓 양성',
    en: 'False Positives in Reputation and Detection Systems',
    easy: '거짓말을 한 번도 안 했는데도 범인으로 몰리는 현상이에요. 판단하는 쪽의 눈 자체가 틀릴 수 있으면, 진짜를 말한 사람도 의심을 받아요.',
    game: '주민은 진짜 날씨가 아니라 "자기가 본 하늘"과 다른 쪽지를 받으면 의심도를 20 올려요. 그래서 마피아가 진짜 날씨만 정직하게 보내도, 하늘을 잘못 본 주민이 겹치면 의심도가 60을 넘어 재판에 걸릴 수 있어요. 실제로 하늘을 잘못 볼 확률이 48%인 마을에서는 정직하게만 해도 약 3분의 1은 재판에 걸리고, 때로는 무고한 주민이 재판에서 지목되기도 해요. 이론에서는 관측이 틀릴 가능성을 함께 따져 성급한 처벌을 줄이지만, 이 마을은 고정 점수(+20, −20)와 기준선(60)만 쓰기 때문에 억울한 재판이 쉽게 생겨요.',
    boxes: [
      [
        '정의',
        '거짓 양성(오탐)은 정직하거나 정상인 참여자를 악의적이거나 결함이 있는 것으로 잘못 판정하는 오류이다.',
      ],
      [
        '성질 1',
        '전체 참여자 n명 중 실제 공격자 f명의 비율(기저율)이 낮을수록, 경보가 울렸을 때 진짜 공격자일 사후 확률을 높이려면 거짓 양성률을 극도로 낮춰야 한다.',
      ],
      [
        '성질 2',
        '외부 관측(예: 기상 관측) 자체가 틀릴 수 있는 환경에서는 메시지만으로 노드의 정직성을 단정하기 어렵다. 베타 평판 시스템 같은 통계적 평판 모델은 관측 결과를 믿음·불신과 함께 불확실성으로 나누어 다룬다.',
      ],
    ],
    proof:
      '정직한 사람이 공격자보다 훨씬 많으면, 정직한 사람에게 오탐이 아주 가끔만 나도 실제 공격자를 잡은 횟수보다 오탐 횟수가 더 커질 수 있다. 여기에 관측 잡음까지 겹치면 "내 관측과 다르다"는 사실만으로 상대의 거짓을 단정할 수 없게 된다.',
    refs: [
      {
        before: 'Axelsson, S. (2000). The Base-Rate Fallacy and the Difficulty of Intrusion Detection. ',
        italic: 'ACM Transactions on Information and System Security',
        after: ', 3(3), 186–205. DOI: 10.1145/357830.357849',
      },
      {
        before: 'Jøsang, A., & Ismail, R. (2002). The Beta Reputation System. In ',
        italic: 'Proceedings of the 15th Bled Electronic Commerce Conference (Bled 2002)',
        after: ', Paper 41, 1–14. URL: https://folk.uio.no/josang/papers/JI2002-Bled.pdf',
      },
      {
        before:
          'Haeberlen, A., Kuznetsov, P., & Druschel, P. (2007). PeerReview: Practical Accountability for Distributed Systems. In ',
        italic: "Proceedings of the 21st ACM SIGOPS Symposium on Operating Systems Principles (SOSP '07)",
        after: ', 175–188. DOI: 10.1145/1294261.1294279',
      },
    ],
    tip: {
      easy: '거짓말을 한 번도 안 했는데도 범인으로 몰리는 현상이에요.',
      game: '주민은 진짜 날씨가 아니라 "자기가 본 하늘"과 다른 쪽지를 받으면 의심도를 20 올려요. 그래서 마피아가 진짜 날씨만 정직하게 보내도, 하늘을 잘못 본 주민이 겹치면 의심도가 60을 넘어 재판에 걸릴 수 있어요.',
      theory:
        '거짓 양성(오탐)은 정직하거나 정상인 참여자를 악의적이거나 결함이 있는 것으로 잘못 판정하는 오류이다. 외부 관측(예: 기상 관측) 자체가 틀릴 수 있는 환경에서는 메시지만으로 노드의 정직성을 단정하기 어렵다.',
      cite: 'Axelsson (2000); Jøsang & Ismail (2002); Haeberlen, Kuznetsov, & Druschel (2007)',
    },
  },
  audit: {
    kicker: '검사 게임 · 분산 책임성',
    title: '감사 회피',
    en: 'Audit Evasion and Predictable Inspection',
    easy: '언제 누가 검사할지 미리 알면, 검사 없는 틈만 골라 규칙을 어길 수 있어요. 미리 예고된 감사는 거짓말을 막지 못해요.',
    game: '플레이어는 오늘 밤 어느 두 집이 쪽지 비교를 할지 미리 보고 쪽지를 보낼 수 있어요. 그래서 비교할 두 집에는 같은 말을 보내고, 나머지 집에는 다른 말을 보내면 모순에 한 번도 걸리지 않고 여러 날 집마다 다른 쪽지를 보낼 수 있어요. 이론의 감사 모델에서는 검사 시점이나 대상을 무작위로 숨겨 위반을 억제하지만, 이 게임은 비교 짝을 미리 공개해 두었기 때문에 이런 빈틈이 생겨요.',
    boxes: [
      [
        '정의',
        '검사 게임(inspection game)은 규칙을 어길 유인이 있는 피검사자와, 제한된 자원으로 위반을 적발하려는 검사자 사이의 비협력 게임이다.',
      ],
      [
        '성질 1',
        '검사 자원이 제한되어 모든 대상을 매번 감시할 수 없을 때, 검사 일정이 예측 가능하면 합리적인 피검사자는 검사받지 않는 틈만 골라 위반한다. 따라서 균형에서는 검사를 무작위화하는 혼합 전략이 필요하다.',
      ],
      [
        '성질 2',
        '분산 책임성 시스템은 서명된 위변조 방지 기록과 증인 노드의 감사를 통해 n명 중 f명의 결함이 정직한 노드에 영향을 미치면 끝내 적발한다. 비용을 줄이려 확률적 감사를 쓸 때도, 공격자가 어느 메시지가 검사될지 미리 알 수 없어야 탐지 확률이 유지된다.',
      ],
    ],
    proof:
      '검사자가 확정된 시간이나 짝만 검사하고 피검사자가 이를 미리 알면, 피검사자는 검사 구간에서는 정직하게 행동하고 비검사 구간에서만 위반해 적발 확률을 0으로 만들 수 있다. 검사를 불시에 무작위로 배치해야만 위반 시 적발 위험이 생겨 억제 효과가 나타난다.',
    refs: [
      {
        before: 'Avenhaus, R., von Stengel, B., & Zamir, S. (2002). Inspection Games. In R. J. Aumann & S. Hart (Eds.), ',
        italic: 'Handbook of Game Theory with Economic Applications',
        after: ' (Vol. 3, Ch. 51, pp. 1947–1987). Elsevier. DOI: 10.1016/S1574-0005(02)03014-X',
      },
      {
        before: 'von Stengel, B. (1991). ',
        italic: 'Recursive Inspection Games',
        after: ' (Technical Report IASFOR-Bericht S-9106). Armed Forces University Munich. URL: http://www.maths.lse.ac.uk/Personal/stengel/TEXTE/recu.pdf',
      },
      {
        before:
          'Haeberlen, A., Kuznetsov, P., & Druschel, P. (2007). PeerReview: Practical Accountability for Distributed Systems. In ',
        italic: "Proceedings of the 21st ACM SIGOPS Symposium on Operating Systems Principles (SOSP '07)",
        after: ', 175–188. DOI: 10.1145/1294261.1294279',
      },
    ],
    tip: {
      easy: '언제 누가 검사할지 미리 알면, 검사 없는 틈만 골라 규칙을 어길 수 있어요.',
      game: '플레이어는 오늘 밤 어느 두 집이 쪽지 비교를 할지 미리 보고 쪽지를 보낼 수 있어요. 그래서 비교할 두 집에는 같은 말을 보내고, 나머지 집에는 다른 말을 보내면 모순에 한 번도 걸리지 않고 여러 날 집마다 다른 쪽지를 보낼 수 있어요.',
      theory:
        '검사 자원이 제한되어 모든 대상을 매번 감시할 수 없을 때, 검사 일정이 예측 가능하면 합리적인 피검사자는 검사받지 않는 틈만 골라 위반한다. 따라서 균형에서는 검사를 무작위화하는 혼합 전략이 필요하다.',
      cite: 'Avenhaus, von Stengel, & Zamir (2002); von Stengel (1991); Haeberlen, Kuznetsov, & Druschel (2007)',
    },
  },
}

export const CONDORCET_NS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25] as const
export const CONDORCET_PS = [0.7, 0.6, 0.52] as const

// 콩도르세 배심원 정리: 홀수 n명의 독립 투표자(개별 정답 확률 p)의 다수결 정답 확률 (이항분포 누적합).
export function condorcetMajorityProb(n: number, p: number): number {
  const half = Math.floor(n / 2) + 1
  let sum = 0
  let comb = 1
  for (let k = 0; k <= n; k++) {
    if (k >= half) sum += comb * p ** k * (1 - p) ** (n - k)
    comb = (comb * (n - k)) / (k + 1)
  }
  return sum
}

export type OnOffAction = 'lie' | 'honest'
export type OnOffPoint = { day: number; action: 'start' | OnOffAction; suspicion: number }

export const ONOFF_SAMPLE_ACTIONS: readonly OnOffAction[] = [
  'lie',
  'lie',
  'honest',
  'lie',
  'honest',
  'honest',
  'lie',
  'lie',
  'honest',
  'lie',
]

// 온오프 공격 의심도 궤적: 거짓(+20)과 정직(-20)을 번갈아 수행하며 0~100 범위로 제한.
export function onOffTrajectory(actions: readonly OnOffAction[], start = 0): OnOffPoint[] {
  let cur = Math.min(100, Math.max(0, start))
  const points: OnOffPoint[] = [{ day: 0, action: 'start', suspicion: cur }]
  actions.forEach((action, idx) => {
    cur = Math.min(100, Math.max(0, cur + (action === 'lie' ? 20 : -20)))
    points.push({ day: idx + 1, action, suspicion: cur })
  })
  return points
}
