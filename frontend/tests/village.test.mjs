import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DIFFICULTY_STATS, RING_TRAILS, TAG_LABELS, TONIGHT_SCALE_TITLE, TRAILS, VOTE_ANIM, changedHouses, citizenScales, contradictionKnotCopy, detectTactics, nextObservationTag, regainTrustOutcomeNote, regainTrustProgress, resultBaseline, resultDeceived, resultDecisive, resultInfluence, resultVillageChips, ringVillageOutcomeNote, scaleLeader, scaleText, scaleVoteSummary, scenarioGoalMet, scenarioGoalSteps, scenarioResultNote, shareBadgeLabel, stubbornAllyOutcomeNote, stubbornAllyStatus, clashingPairs, fooledDots, gameSummary, suspicionLinks, suspicionPreview, talkNotes, houseSlots, nightStepMs, nightSteps, pairLogScales, pairMid, sharePath, stagedHouses, tally, tonightVotes, tonightVotesText, trialStampCopy, trialStampMode, villageHouses, villageLines, villageLogHeader, visibleLines, voteAnimDelays, voteItemLabel, watchfulEyeClashNote, worsens,
} from '../src/game/village.ts'
import {
  CONDORCET_NS,
  CONDORCET_PS,
  ONOFF_SAMPLE_ACTIONS,
  THEORY_TOPICS,
  condorcetMajorityProb,
  onOffTrajectory,
} from '../src/game/theoryBook.ts'
import { difficulties } from '../src/gameApi.ts'

const config = { connection: 'all', citizen_type: 'wary', memory: 'turn', share_mode: 'pairs', share_pairs: 1, mafia_count: 2, player: 'human', sensor_error: 0.4, seed: 1 }
const state = {
  config, truth: 'danger', player_city: 3,
  roles: { 1: 'citizen', 2: 'colleague', 3: 'player', 4: 'citizen', 5: 'citizen' },
  next_hints: { 1: 'danger', 4: 'safe', 5: 'danger' },
}
const empty = { role: 'citizen', hint: null, received: null, reason: null, correct: null }
const result = {
  cities: [
    { ...empty, city: 1, decision: 'evacuate', suspicion: { 2: 0, 3: 60, 4: 0, 5: 0 } },
    { ...empty, city: 2, role: 'colleague', decision: null, suspicion: null },
    { ...empty, city: 3, role: 'player', decision: null, suspicion: null },
    { ...empty, city: 4, decision: 'stay', suspicion: { 1: 0, 2: 0, 3: 20, 5: 0 } },
    { ...empty, city: 5, decision: 'stay', suspicion: null },
  ],
  next_hints: { 1: 'safe', 4: 'danger', 5: 'danger' },
}

test('my house is bottom centre and the rest go clockwise from the next number', () => {
  assert.deepEqual(houseSlots(3).map((h) => h.city), [3, 4, 5, 1, 2])
  assert.deepEqual(houseSlots(5).map((h) => h.city), [5, 1, 2, 3, 4])
  const [me, left, topLeft, topRight, right] = houseSlots(1)
  assert.equal(me.x, 450)
  assert.ok(me.y > left.y && left.y > topLeft.y)
  assert.ok(left.x < me.x && topLeft.x < topRight.x && right.x > me.x)
  assert.equal(topRight.y, topLeft.y)
})

test('all share paths go through the plaza from sender to receiver', () => {
  assert.equal(TRAILS.length, 5)
  assert.match(sharePath(3, 5, 1), /^M230 262 Q.* L502 338 Q.* 670 262$/)
  assert.match(sharePath(3, 1, 5), /^M670 262 Q.* L398 338 Q.* 230 262$/) // 반대 방향
  assert.match(sharePath(3, 4, 2), /^M230 470 Q.* L502 360 Q.* 670 470$/)
  assert.match(sharePath(3, 2, 4), /^M670 470 Q.* L398 360 Q.* 230 470$/) // 보내는 집에서 출발
})

test('before turn 1 only hints are known', () => {
  const houses = villageHouses(state, null)
  const byCity = Object.fromEntries(houses.map((h) => [h.city, h]))
  assert.equal(byCity[1].lit, true)
  assert.equal(byCity[4].lit, false)
  assert.equal(byCity[2].lit, null)
  assert.ok(houses.every((h) => h.flag === null && h.suspicion === null))
})

test('after a turn houses show decisions, suspicion of me and next hints', () => {
  const byCity = Object.fromEntries(villageHouses(state, result).map((h) => [h.city, h]))
  assert.equal(byCity[1].flag, 'evacuate')
  assert.equal(byCity[1].suspicion, 60)
  assert.equal(byCity[1].lit, false)
  assert.equal(byCity[4].suspicion, 20)
  assert.equal(byCity[5].suspicion, null) // 다수결 주민
  assert.equal(byCity[2].role, 'colleague')
  assert.equal(villageHouses(state, { ...result, next_hints: null })[0].lit, null) // 게임 종료

  // 오늘 밤 관측 꼬리표: danger→대피, safe→잔류, 불 꺼짐이면 (틀림) 표기, 힌트 없으면 null
  assert.deepEqual(nextObservationTag(byCity[4]), {
    claim: 'evacuate',
    lit: true,
    aria: '오늘 밤 관측 대피, 맞음, 불 켜짐',
  })
  assert.deepEqual(nextObservationTag(byCity[1]), {
    claim: 'stay',
    lit: false,
    aria: '오늘 밤 관측 잔류, 틀림, 불 꺼짐',
  })
  assert.deepEqual(nextObservationTag({ hint: 'danger', lit: false }), {
    claim: 'evacuate',
    lit: false,
    aria: '오늘 밤 관측 대피, 틀림, 불 꺼짐',
  })
  assert.equal(nextObservationTag(byCity[2]), null)
})

test('ring connection makes only the two neighbours reachable', () => {
  const ring = villageHouses({ ...state, config: { ...config, connection: 'ring' } }, null)
  assert.deepEqual(ring.filter((h) => h.reachable).map((h) => h.city), [4])
  assert.deepEqual(villageHouses(state, null).filter((h) => h.reachable).map((h) => h.city), [4, 5, 1])
})

test('tally counts ballots per accused city', () => {
  assert.deepEqual(tally({ 1: 3, 4: 3, 5: 1 }), { 3: 2, 1: 1 })
})

test('trialStampCopy preserves full verdict wording and distinguishes caught vs innocent in compact pill text', () => {
  assert.deepEqual(trialStampCopy({ accused: null, caught: false }), {
    full: '과반 없음',
    compact: '과반 없음',
  })
  assert.deepEqual(trialStampCopy({ accused: 4, caught: false }), {
    full: '4번 집 무고한 주민 지목',
    compact: '4번 집 · 무고',
  })
  assert.deepEqual(trialStampCopy({ accused: 3, caught: true }), {
    full: '3번 집 발각',
    compact: '3번 집 · 발각',
  })
})

test('trialStampMode matches arrows for full stamp, shrinks to compact in day, and dims when suspicion lines are active', () => {
  // 밤 연출: 원래 크기 도장
  assert.equal(
    trialStampMode({ isNight: true, trialInspect: false, hasSuspicionLines: false, hasHighlight: false, hasOpenCard: false }),
    'full',
  )
  // 낮 기본 상태: 작은 꼬리표
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: false, hasSuspicionLines: false, hasHighlight: false, hasOpenCard: false }),
    'compact',
  )
  // 낮 집 호버·포커스로 의심 선 표시: 흐린 작은 꼬리표 (광장 포커스가 겹쳐도 의심 선 우선)
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: false, hasSuspicionLines: true, hasHighlight: false, hasOpenCard: false }),
    'dimmed',
  )
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: true, hasSuspicionLines: true, hasHighlight: false, hasOpenCard: false }),
    'dimmed',
  )
  // 낮 광장 호버·포커스: 화살표와 함께 원래 크기 도장 복원
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: true, hasSuspicionLines: false, hasHighlight: false, hasOpenCard: false }),
    'full',
  )
  // 튜토리얼 강조·쪽지 카드 열림: 작은 꼬리표 유지
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: true, hasSuspicionLines: false, hasHighlight: true, hasOpenCard: false }),
    'compact',
  )
  assert.equal(
    trialStampMode({ isNight: false, trialInspect: true, hasSuspicionLines: false, hasHighlight: false, hasOpenCard: true }),
    'compact',
  )
})

test('a contradiction knot appears only when the two houses that meet hear different words', () => {
  assert.deepEqual(clashingPairs([[1, 5], [4, 5]], { 1: 'stay', 4: 'evacuate', 5: 'evacuate' }), [[1, 5]])
  assert.deepEqual(clashingPairs([[1, 5]], { 1: 'stay', 5: 'stay' }), [])
  assert.deepEqual(pairMid(3, 5, 1), [450, 308])
  assert.deepEqual(pairMid(3, 4, 2), [450, 330])
  assert.deepEqual(pairMid(3, 4, 5), [398, 319])
})

test('ai citizens omit fixed +20 contradiction copy and scale legend while wary keeps them', () => {
  const aiClash = contradictionKnotCopy('ai', 'clashes', 1, 5)
  const aiCaught = contradictionKnotCopy('ai', 'caught', 1, 5)
  assert.equal(aiClash.text, '모순 주의')
  assert.equal(aiCaught.text, '모순 발견')
  assert.doesNotMatch(aiClash.text + aiClash.label + aiCaught.text + aiCaught.label, /\+20/)
  assert.match(aiClash.label, /1번 집과 5번 집.*AI 주민이 의심할 수 있어요/)
  assert.match(aiCaught.label, /1번 집과 5번 집.*AI 주민이 의심할 수 있어요/)

  const waryClash = contradictionKnotCopy('wary', 'clashes', 1, 5)
  const waryCaught = contradictionKnotCopy('wary', 'caught', 1, 5)
  assert.equal(waryClash.text, '모순 +20')
  assert.equal(waryCaught.text, '모순 +20')
  assert.match(waryClash.label, /의심도 \+20/)
  assert.match(waryCaught.label, /의심도 \+20/)

  const aiLog = villageLogHeader('ai')
  assert.equal(aiLog.showLegend, false)
  assert.match(aiLog.intro, /AI 주민.*직접 판단한 이유/)
  assert.doesNotMatch(aiLog.intro, /›|속마음 저울/)

  const waryLog = villageLogHeader('wary')
  assert.equal(waryLog.showLegend, true)
  assert.match(waryLog.intro, /›.*속마음 저울/)
})

test('shareBadgeLabel summarizes multi-pair contradictions in one plaza badge while keeping single-pair unchanged', () => {
  assert.equal(shareBadgeLabel(0, 0, 'all', 'wary'), null)
  assert.equal(shareBadgeLabel(1, 0, 'pairs', 'wary'), '오늘 밤 쪽지 비교')
  assert.equal(shareBadgeLabel(1, 1, 'pairs', 'wary'), '오늘 밤 쪽지 비교')
  assert.equal(shareBadgeLabel(6, 0, 'all', 'wary'), '모든 집 쪽지 비교')
  assert.equal(shareBadgeLabel(6, 3, 'all', 'wary'), '모든 집 쪽지 비교 · 모순 3쌍 (집마다 +20)')
  assert.equal(shareBadgeLabel(6, 3, 'all', 'ai'), '모든 집 쪽지 비교 · 모순 3쌍')
  assert.equal(shareBadgeLabel(2, 0, 'pairs', 'wary'), '오늘 밤 쪽지 비교')
  assert.equal(shareBadgeLabel(2, 2, 'pairs', 'wary'), '오늘 밤 쪽지 비교 · 모순 2쌍 (집마다 +20)')
})

test('suspicion preview matches engine game_turn (7.6): ±20, contradiction +20, clamp 0~100, trial at 60', () => {
  // 기대값은 engine/city/logic.py game_turn(hint, {"3": claim}, shared, {"3": from})로 직접 돌려 얻은 값
  const at = (suspicion, hint) => ({ city: 1, hint, suspicion })
  const pairs = [[1, 4]]
  assert.deepEqual(suspicionPreview(at(50, 'danger'), 'stay', [], {}), { from: 50, next: 70, trial: true, contradiction: false })
  assert.deepEqual(suspicionPreview(at(30, 'danger'), 'evacuate', [], {}), { from: 30, next: 10, trial: false, contradiction: false })
  assert.equal(suspicionPreview(at(10, 'safe'), 'stay', [], {}).next, 0)
  assert.equal(suspicionPreview(at(null, 'safe'), 'evacuate', [], {}).next, 20) // 1턴 전은 0에서
  assert.deepEqual(suspicionPreview(at(50, 'safe'), 'evacuate', pairs, { 4: 'stay' }), { from: 50, next: 90, trial: true, contradiction: true })
  assert.equal(suspicionPreview(at(95, 'safe'), 'evacuate', pairs, { 4: 'evacuate' }).next, 100)
  assert.equal(suspicionPreview(at(70, 'danger'), 'evacuate', pairs, { 4: 'stay' }).next, 70)
  // 상대에게 말을 안 보냈거나(ring) 내가 없는 쌍의 모순은 더하지 않는다 (God은 자기 쌍만 shared로 넘긴다)
  assert.equal(suspicionPreview(at(50, 'safe'), 'evacuate', pairs, {}).next, 70)
  assert.equal(suspicionPreview(at(50, 'safe'), 'evacuate', [[4, 5]], { 4: 'stay', 5: 'evacuate' }).next, 70)
  assert.equal(suspicionPreview(at(50, null), 'stay', [], {}), null)
  // 미리보기 색: 100→100 불리는 나쁨, 0→0 유리는 안전, 맞는 말이라도 모순이 겹치면 의심도 0·50 모두 불리
  assert.equal(worsens(suspicionPreview(at(100, 'danger'), 'stay', [], {})), true)
  assert.equal(worsens(suspicionPreview(at(0, 'safe'), 'stay', [], {})), false)
  assert.equal(worsens(suspicionPreview(at(30, 'danger'), 'evacuate', [], {})), false)
  const agreeClash0 = suspicionPreview(at(0, 'danger'), 'evacuate', pairs, { 4: 'stay' })
  const agreeClash50 = suspicionPreview(at(50, 'danger'), 'evacuate', pairs, { 4: 'stay' })
  assert.deepEqual(agreeClash0, { from: 0, next: 0, trial: false, contradiction: true })
  assert.deepEqual(agreeClash50, { from: 50, next: 50, trial: false, contradiction: true })
  assert.equal(worsens(agreeClash0), true)
  assert.equal(worsens(agreeClash50), true)
})

test('changed houses: hint differs from today or newly on a dotted line, nothing else', () => {
  const day = {
    cities: [
      { city: 1, hint: 'danger' }, { city: 2, hint: null }, { city: 4, hint: 'safe' }, { city: 5, hint: 'danger' },
    ],
    sharing: [{ pair: [1, 4], contradictions: [] }],
    next_hints: { 1: 'safe', 4: 'safe', 5: 'danger' },
    next_share_pairs: [[4, 5]],
  }
  assert.deepEqual(changedHouses(day), { 1: ['관측 바뀜'], 5: ['쪽지 비교'] })
  assert.deepEqual(changedHouses({ ...day, next_hints: null, next_share_pairs: null }), {}) // 게임 종료
})

test('talk notes follow the trail from sender to receiver (and RING_TRAILS in ring mode)', () => {
  const notes = talkNotes(3, {
    cities: [
      { city: 4, received: { 3: { claim: 'stay', note: '' }, 5: null, 1: { claim: 'evacuate', note: '' } } },
      { city: 3, received: null },
    ],
  })
  assert.deepEqual(notes.map(({ from, to, claim }) => [from, to, claim]), [[1, 4, 'evacuate'], [3, 4, 'stay']])
  assert.equal(notes[0].path, sharePath(3, 1, 4))
  assert.equal(notes[1].path, sharePath(3, 3, 4))

  // 고리 연결: 3(slot 0)→4(slot 1)은 RING_TRAILS[0] 정방향, 3(slot 0)→2(slot 4)은 RING_TRAILS[4] 역방향
  const ringNotes = talkNotes(
    3,
    {
      cities: [
        { city: 4, received: { 3: { claim: 'stay', note: '' }, 5: { claim: 'evacuate', note: '' } } },
        { city: 2, received: { 3: { claim: 'evacuate', note: '' } } },
      ],
    },
    'ring',
  )
  const byEdge = Object.fromEntries(ringNotes.map((n) => [`${n.from}->${n.to}`, n.path]))
  assert.equal(byEdge['3->4'], RING_TRAILS[0])
  assert.equal(byEdge['5->4'], 'M230 245 Q208 358 230 470')
  assert.equal(byEdge['3->2'], 'M450 528 Q560 518 670 470')
})

const msg = (claim) => ({ claim, note: '' })
const citizen = (city, hint, claim, suspicion, reason = null) => ({
  city, role: 'citizen', hint, received: { 3: msg(claim) }, decision: 'stay', correct: false, suspicion, reason,
})
const turn = {
  turn: 4,
  cities: [
    citizen(1, 'danger', 'stay', { 2: 0, 3: 50, 4: 10, 5: 0 }, '3번이 이상하다.'),
    { city: 2, role: 'colleague', hint: null, received: null, decision: null, correct: null, suspicion: null, reason: null },
    { city: 3, role: 'player', hint: null, received: null, decision: null, correct: null, suspicion: null, reason: null },
    citizen(4, 'danger', 'evacuate', { 1: 30, 2: 0, 3: 0, 5: 0 }),
  ],
  sharing: [{ pair: [1, 4], contradictions: [{ city: 3, told: { 1: msg('stay'), 4: msg('evacuate') } }] }],
  vote: null,
}
const texts = (lines) => lines.map((l) => l.text)

test('village lines: contradiction, matching and mismatching words, trial warning, suspicion between villagers', () => {
  const lines = villageLines(state, turn)
  assert.deepEqual(lines[0], { phase: 'night', kind: 'when', text: '① 날씨 관측 (4일째, 1번과 4번이 만났다)' })
  assert.ok(lines.some((l) => l.phase === 'suspicion' && l.who === 1 && l.text === '잠깐, 3번이 나한텐 잔류라더니 4번한텐 대피라고 했대?'))
  assert.ok(texts(lines).includes('음… 내가 본 건 태풍인데, 3번은 잔류래'))
  assert.ok(texts(lines).includes('그래, 내가 본 하늘도 태풍이었어'))
  assert.ok(lines.some((l) => l.who === 1 && l.text === '3번 좀 수상한데. 한 번만 더 그러면 재판이야'))
  assert.ok(texts(lines).includes('4번이 1번을 의심하고 있다 (의심도 30)'))
  assert.ok(!texts(lines).includes('3번이 이상하다.')) // 눈치 시민은 reason 대신 템플릿
})

test('same situation gives distinct wording to all 5 citizen numbers deterministically', () => {
  const allCities = [1, 2, 3, 4, 5]
  const make = (claim, sus) =>
    villageLines(
      { ...state, player_city: 4, roles: { 1: 'citizen', 2: 'citizen', 3: 'citizen', 4: 'player', 5: 'citizen' } },
      {
        turn: 2,
        cities: allCities.map((city) => ({
          city,
          role: 'citizen',
          hint: 'danger',
          received: { 4: msg(claim) },
          decision: 'evacuate',
          correct: true,
          suspicion: { 4: sus },
          reason: null,
        })),
        sharing: [],
        vote: null,
      },
    )

  const disagreed = make('stay', 40)
  const notes = allCities.map((city) => disagreed.find((l) => l.phase === 'notes' && l.who === city).text)
  assert.equal(new Set(notes).size, 5)
  for (const t of notes) assert.ok(t.includes('태풍') && t.includes('4번') && t.includes('잔류'))

  const warns = allCities.map((city) => disagreed.find((l) => l.phase === 'suspicion' && l.who === city).text)
  assert.equal(new Set(warns).size, 5)
  for (const t of warns) assert.ok(t.includes('4번') && t.includes('재판'))

  const agreed = make('evacuate', 0)
  const oks = allCities.map((city) => agreed.find((l) => l.phase === 'notes' && l.who === city).text)
  assert.equal(new Set(oks).size, 5)
  for (const t of oks) assert.ok(t.includes('태풍'))

  assert.deepEqual(make('stay', 40), disagreed)
})

test('majority citizens have no suspicion lines and ai citizens speak their reason', () => {
  const majority = villageLines({ ...state, config: { ...config, citizen_type: 'majority' } }, turn)
  assert.ok(!texts(majority).some((t) => t.includes('수상') || t.includes('의심')))
  const ai = villageLines({ ...state, config: { ...config, citizen_type: 'ai' } }, turn)
  assert.ok(ai.some((l) => l.who === 1 && l.text === '3번이 이상하다.'))
})

test('trial lines: one accusation per voter, then the verdict (and tie note only when tied)', () => {
  const vote = (accused, caught) => villageLines(state, { ...turn, vote: { ballots: { 1: 3, 4: 1 }, accused, caught } })
  const lines = vote(null, false)
  assert.ok(lines.some((l) => l.who === 1 && l.text === '난 3번을 지목할게'))
  assert.ok(lines.some((l) => l.who === 4 && l.text === '난 1번을 지목할게'))
  assert.ok(!lines.some((l) => l.text.includes('여럿이면')))
  assert.equal(lines.at(-1).text, '과반이 모이지 않아 아무도 지목되지 않았다')
  assert.equal(vote(1, false).at(-1).text, '1번이 지목됐지만 무고한 주민이었다. 마피아는 아직 숨어 있다')
  assert.equal(vote(3, true).at(-1).text, '3번이 지목됐다. 마피아가 재판에 걸렸다')

  // 의심 근거가 없거나 동점인 투표자가 있으면 재판 안내 한 줄이 붙는다
  const tiedTurn = {
    ...turn,
    cities: turn.cities.map((c) => (c.city === 4 ? { ...c, suspicion: { 1: 0, 2: 0, 3: 0, 5: 0 } } : c)),
    vote: { ballots: { 1: 3, 4: 3 }, accused: 3, caught: true },
  }
  const tiedLines = villageLines(state, tiedTurn)
  assert.ok(tiedLines.some((l) => l.phase === 'trial' && l.kind === 'event' && l.text === '가장 의심하는 집이 여럿이면(아무도 의심하지 않을 때도) 그중 아무나 지목해요.'))
})

test('night steps: night, notes, flags (one per citizen with vote bars, single step for AI), suspicion, then ballots, verdict, day', () => {
  const fourCitizens = [1, 2, 4, 5].map((city) => ({ role: 'citizen', city }))
  const cities = [{ role: 'player', city: 3 }, ...fourCitizens]

  // AI 시민(표 줄 없음): flags 1단계(900ms, decided=Infinity), 총 3800ms
  const aiSteps = nightSteps({ vote: null, cities }, false)
  assert.deepEqual(aiSteps.map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'day'])
  assert.equal(aiSteps[2].decided, Infinity)
  assert.equal(aiSteps[2].ms, 900)
  assert.equal(aiSteps.reduce((t, s) => t + s.ms, 0), 3800)

  const trialSteps = nightSteps(
    { vote: { ballots: { 1: 3, 4: 1, 5: 3 }, accused: 3, caught: true }, cities },
    false,
  )
  assert.deepEqual(trialSteps.map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'trial', 'trial', 'trial', 'verdict', 'day'])
  assert.deepEqual(trialSteps.filter((s) => s.phase === 'trial').map((s) => s.ballots), [1, 2, 3])
  assert.equal(trialSteps.at(-1).ms, 0)

  // 눈치·다수결 시민 4명: ③ 단계가 집마다 차례로 1~4 진행, 추가 연출 시간은 합계 3000ms 이내
  const detailed = nightSteps({ vote: null, cities })
  const flagSteps = detailed.filter((s) => s.phase === 'flags')
  assert.deepEqual(flagSteps.map((s) => s.decided), [1, 2, 3, 4])
  const addedMs = detailed.reduce((t, s) => t + s.ms, 0) - 3800
  assert.ok(addedMs > 0 && addedMs <= 3000)

  // 상자 → 블록 → 많은 쪽 표시 → 꼬리표 → 깃발 → 불꽃 순으로 겹치지 않고 한 집 단계 시간 안에 끝난다 (블록 0~5개)
  for (const n of [0, 1, 2, 3, 4, 5]) {
    const d = voteAnimDelays(n)
    assert.ok(d.markDelay >= d.blocksEnd, `mark starts after blocks for n=${n}`)
    assert.ok(d.tagDelay >= d.markDelay + VOTE_ANIM.markMs, `tag starts after mark for n=${n}`)
    assert.ok(d.flagDelay >= d.tagDelay + VOTE_ANIM.tagMs, `flag starts after tag for n=${n}`)
    assert.ok(d.sparkDelay >= d.flagDelay + VOTE_ANIM.flagMs, `spark starts after flag for n=${n}`)
    assert.ok(d.totalMs <= VOTE_ANIM.stepMs, `fits in stepMs for n=${n}: ${d.totalMs} <= ${VOTE_ANIM.stepMs}`)
  }
})

test('nightStepMs slows only tutorial turn 1 flags steps and keeps all other steps unchanged', () => {
  const cities = [{ role: 'player', city: 3 }, ...[1, 2, 4, 5].map((city) => ({ role: 'citizen', city }))]
  const steps = nightSteps({ vote: { ballots: { 1: 3 }, accused: null, caught: false }, cities })
  for (const s of steps) {
    assert.equal(nightStepMs(s, true, 1), s.phase === 'flags' ? s.ms * 2.5 : s.ms)
    assert.equal(nightStepMs(s, true, 2), s.ms)
    assert.equal(nightStepMs(s, true, undefined), s.ms)
    assert.equal(nightStepMs(s, false, 1), s.ms)
  }
})

test('visible lines follow the step: words in phase order, accusations one at a time', () => {
  const lines = villageLines(state, { ...turn, vote: { ballots: { 1: 3, 4: 1 }, accused: null, caught: false } })
  const steps = nightSteps({ vote: { ballots: { 1: 3, 4: 1 } }, cities: turn.cities }, false)
  assert.deepEqual(texts(visibleLines(lines, steps[0])), ['① 날씨 관측 (4일째, 1번과 4번이 만났다)'])
  assert.ok(!texts(visibleLines(lines, steps[1])).some((t) => t.startsWith('잠깐')))
  assert.ok(texts(visibleLines(lines, steps[3])).some((t) => t.startsWith('잠깐')))
  const firstBallot = texts(visibleLines(lines, steps[4]))
  assert.ok(firstBallot.includes('난 3번을 지목할게') && !firstBallot.includes('난 1번을 지목할게'))
  assert.ok(!firstBallot.includes('과반이 모이지 않아 아무도 지목되지 않았다'))
  assert.deepEqual(visibleLines(lines, steps.at(-1)), lines)
})

test('staged houses keep last turn flags and suspicion until their phase, windows show tonight until day', () => {
  const prev = { ...result, cities: result.cities.map((c) => ({ ...c, decision: 'stay', suspicion: c.suspicion && { ...c.suspicion, 3: 0 } })) }
  const tonight = {
    ...result,
    cities: result.cities.map((c) => ({
      ...c,
      hint: c.city === 1 ? 'danger' : c.hint,
      decision: c.city === 4 ? 'evacuate' : c.decision,
    })),
  }
  const at = (phase, p = prev) => Object.fromEntries(stagedHouses(state, p, tonight, phase).map((h) => [h.city, h]))
  assert.equal(at('notes')[1].flag, 'stay')
  assert.equal(at('notes')[4].flag, 'stay')
  assert.equal(at('notes')[1].suspicion, 0)
  assert.equal(at('notes')[1].lit, true) // 오늘 밤 힌트 (태풍 = 정답)
  assert.equal(at('flags')[1].flag, 'evacuate')
  assert.equal(at('flags')[1].suspicion, 0)
  assert.equal(at('suspicion')[1].suspicion, 60)
  assert.equal(at('day')[1].lit, false) // 다음 날 힌트
  assert.equal(at('notes', null)[1].flag, null) // 첫 턴은 깃발 없음
  // flags 단계에서 decided=1이면 시계 방향 첫 시민(4번)만 새 깃발(evacuate), 뒷 시민(1번)은 이전 깃발(stay) 유지
  const firstOnly = Object.fromEntries(stagedHouses(state, prev, tonight, 'flags', 1).map((h) => [h.city, h]))
  assert.equal(firstOnly[4].flag, 'evacuate')
  assert.equal(firstOnly[1].flag, 'stay') // 아직 차례 전이라 이전 턴 값(stay)
  const allDecided = Object.fromEntries(stagedHouses(state, prev, tonight, 'flags', 3).map((h) => [h.city, h]))
  assert.equal(allDecided[1].flag, 'evacuate')
})

const over = (outcome, end_reason) => ({ ...state, outcome, end_reason })
const day = (n, extra = {}) => ({ ...turn, turn: n, sharing: [], vote: null, ...extra })

test('game summary: caught explains who accused me at which trial', () => {
  const caught = day(6, { vote: { ballots: { 1: 3, 4: 3 }, accused: 3, caught: true } })
  const s = gameSummary(over('loss', 'caught'), [day(5), caught])
  assert.equal(s.headline, '6일째 광장 재판에 걸렸어요')
  assert.ok(s.moments.some((m) => m.day === 6 && m.text === '6일째 재판에서 1번, 4번이 나를 지목했어요 (2표, 과반 2표)'))
  assert.ok(s.moments.some((m) => m.day === null && m.text === '재판이 1번 열렸어요'))
})

test('game summary: turn 7 counts fooled citizens, first crossing of 60 and caught contradictions', () => {
  const quiet = day(1, { cities: turn.cities.map((c) => (c.suspicion ? { ...c, suspicion: { ...c.suspicion, 3: 10 } } : c)) })
  const hot = day(2, { cities: turn.cities.map((c) => (c.city === 4 ? { ...c, suspicion: { ...c.suspicion, 3: 70 } } : c)), sharing: turn.sharing })
  const s = gameSummary(over('win', 'turns_done'), [quiet, hot, day(7)])
  assert.equal(s.headline, '주민 과반을 끝까지 속였어요')
  assert.ok(s.moments.some((m) => m.day === 7 && m.text === '마지막 7일째에 주민 3명 중 2명이 속았어요 (승리에 2명 필요)'))
  assert.ok(s.moments.some((m) => m.day === 2 && m.text === '2일째 4번의 의심도가 70까지 올라 처음으로 재판 기준 60 이상이 됐어요'))
  assert.ok(s.moments.some((m) => m.day === 2 && m.text === '쪽지 비교에서 모순이 1번 드러났어요 (2일째)'))
  assert.deepEqual(s.peaks, [10, 70, 50])
  assert.deepEqual(s.deceived, [2, 2, 2])
  assert.deepEqual(s.pins[1]?.labels, ['모순 드러남'])

  const lostDay = day(7, {
    cities: turn.cities.map((c) => (c.city === 4 ? { ...c, correct: true } : c)),
  })
  const lost = gameSummary(over('loss', 'turns_done'), [lostDay])
  assert.equal(lost.headline, '7일째에 주민 과반이 속지 않았어요')
  assert.ok(lost.moments.some((m) => m.day === 7 && m.text === '마지막 7일째에 주민 3명 중 1명이 속았어요 (승리에 2명 필요)'))
  assert.equal(gameSummary(over('perfect_win', 'turns_done'), [day(7)]).headline, '주민 모두를 끝까지 속였어요')
})

const turnOf = (cities) => ({ cities: cities.map((c) => ({ ...empty, ...c })) })

test('citizen scale follows engine game_turn: hint ±100, notes ±(100 − new suspicion)', () => {
  const me = { player_city: 1, config: { ...config, memory: 'turn' } }
  // 예시: 내 관측 +100 · 2번 +80 · 4번 +100 · 너(1번) −40 → +240 대피
  const t = turnOf([
    { city: 3, hint: 'danger', decision: 'evacuate', received: { 1: msg('stay'), 2: msg('evacuate'), 4: msg('evacuate'), 5: null }, suspicion: { 1: 60, 2: 20, 4: 0, 5: 0 } },
  ])
  const s = citizenScales(me, [t], 0)[3]
  assert.deepEqual(s.parts, [{ from: 'hint', value: 100 }, { from: 1, value: -40 }, { from: 2, value: 80 }, { from: 4, value: 100 }])
  assert.equal(s.total, 240)
  assert.equal(s.decision, 'evacuate')
  assert.equal(s.mine, -40)
  assert.equal(s.swayed, false)
})

test('swayed when removing my note flips the decision; tie goes to this turn hint', () => {
  const me = { player_city: 1, config: { ...config, citizen_type: 'majority', memory: 'turn' } }
  const t = turnOf([
    { city: 2, hint: 'danger', decision: 'stay', received: { 1: msg('stay'), 3: msg('stay') }, suspicion: null }, // 100−100−100 = −100
    { city: 3, hint: 'safe', decision: 'stay', received: { 1: msg('evacuate'), 2: msg('stay') }, suspicion: null }, // −100+100−100
  ])
  const s = citizenScales(me, [t], 0)
  assert.equal(s[2].decision, 'stay')
  assert.equal(s[2].swayed, true) // 내 쪽지가 없으면 0 → 힌트(대피)
  assert.equal(s[3].swayed, false)
  assert.equal(s[3].mine, 100)
})

test('citizen scale counts remembered past hints (recent: last turn, full: all) and skips AI citizens', () => {
  const day = (hint) => turnOf([{ city: 2, hint, decision: null, received: {}, suspicion: null }])
  const history = [day('safe'), day('safe'), day('danger')]
  const at = (memory) => citizenScales({ player_city: 1, config: { ...config, memory } }, history, 2)[2]
  assert.equal(at('turn').total, 100)
  assert.equal(at('recent').total, 0)
  assert.equal(at('recent').decision, 'evacuate') // 동점이면 이번 힌트
  assert.equal(at('full').total, -100)
  assert.deepEqual(citizenScales({ player_city: 1, config: { ...config, citizen_type: 'ai' } }, history, 2), {})
})

test('scale text reads in plain sentences without numbers and swayed citizens get a "내 쪽지에 넘어왔다" line at the flags phase', () => {
  const scale = { parts: [{ from: 'hint', value: 100 }, { from: 2, value: 80 }, { from: 4, value: 100 }, { from: 1, value: -40 }], total: 240, decision: 'evacuate', mine: -40, swayed: false }
  assert.deepEqual(scaleText(scale, 1, 'turn'), [
    '내가 본 하늘은 태풍이었어',
    '2번은 대피래. 조금 미심쩍어',
    '4번은 대피래. 믿을 만해',
    '너(1번)는 잔류래. 많이 의심스러워',
    '대피 쪽이 훨씬 무거워서 대피하기로 했어',
  ])
  const clear = { parts: [{ from: 'hint', value: -100 }], total: -100, decision: 'stay', mine: null, swayed: false }
  assert.deepEqual(scaleText(clear, 1, 'turn'), [
    '내가 본 하늘은 맑았어',
    '잔류 쪽이 조금 더 무거워서 잔류하기로 했어',
  ])
  const tie = { parts: [{ from: 'hint', value: 0 }, { from: 1, value: 0 }], total: 0, decision: 'evacuate', mine: 0, swayed: false }
  assert.deepEqual(scaleText(tie, 1, 'turn'), [
    '지금까지 본 하늘은 반반이었어',
    '네(1번) 쪽지는 하나도 안 믿겨',
    '양쪽이 똑같아서 이번에 본 하늘대로 대피하기로 했어',
  ])
  const remembered = { parts: [{ from: 'hint', value: -200 }], total: -200, decision: 'stay', mine: null, swayed: false }
  assert.deepEqual(scaleText(remembered, 1, 'turn'), [
    '지금까지 본 하늘은 맑음 쪽이 많았어',
    '잔류 쪽이 훨씬 무거워서 잔류하기로 했어',
  ])
  const net = citizenScales(
    { player_city: 1, config: { ...config, memory: 'full' } },
    [
      turnOf([{ city: 2, hint: 'danger', decision: null, received: {}, suspicion: null }]),
      turnOf([{ city: 2, hint: 'safe', decision: null, received: {}, suspicion: null }]),
      turnOf([{ city: 2, hint: 'danger', decision: null, received: {}, suspicion: null }]),
    ],
    2,
  )[2]
  assert.deepEqual(scaleText(net, 1, 'full'), [
    '지금까지 본 하늘은 태풍 쪽이 많았어',
    '대피 쪽이 조금 더 무거워서 대피하기로 했어',
  ])
  const lines = villageLines(state, { turn: 1, cities: result.cities, sharing: [], vote: null }, { 4: { ...scale, swayed: true } })
  const line = lines.find((l) => l.kind === 'scale' && l.who === 4 && l.phase === 'flags')
  assert.equal(line.text, '대피하기로 했어')
  assert.equal(line.summary, '4번 집 속마음 저울: 대피 쪽 무게 280, 잔류 쪽 무게 40. 대피 쪽이 더 무거워서 대피하기로 했어요.')
  assert.equal(scaleVoteSummary(2, clear, 'wary'), '2번 집 속마음 저울: 대피 쪽 무게 0, 잔류 쪽 무게 100. 잔류 쪽이 더 무거워서 잔류하기로 했어요.')
  assert.equal(scaleVoteSummary(3, tie, 'wary'), '3번 집 속마음 저울: 대피 쪽 무게 0, 잔류 쪽 무게 0. 무게가 같아서 관측대로 대피하기로 했어요.')
  // 다수결 주민은 1표=100을 정수 표 수로 읽는다
  const majScale = {
    parts: [{ from: 'hint', value: -100 }, { from: 1, value: 100 }, { from: 2, value: 100 }, { from: 3, value: 100 }],
    total: 200,
    decision: 'evacuate',
    mine: 100,
    swayed: false,
  }
  const majLines = villageLines(
    { ...state, config: { ...config, citizen_type: 'majority' } },
    { turn: 1, cities: result.cities, sharing: [], vote: null },
    { 4: majScale },
  )
  const majLine = majLines.find((l) => l.kind === 'scale' && l.who === 4 && l.phase === 'flags')
  assert.equal(majLine.summary, '4번 집 속마음 저울: 대피 3표, 잔류 1표. 대피 쪽이 더 많아서 대피하기로 했어요.')
  assert.equal(scaleVoteSummary(2, clear, 'majority'), '2번 집 속마음 저울: 대피 0표, 잔류 1표. 잔류 쪽이 더 많아서 잔류하기로 했어요.')
  assert.equal(scaleVoteSummary(3, tie, 'majority'), '3번 집 속마음 저울: 대피 0표, 잔류 0표. 표가 같아서 관측대로 대피하기로 했어요.')
  assert.deepEqual(scaleLeader(scale), { winner: 'evacuate', label: '대피 쪽이 많아요', aria: '대피 쪽이 많아 대피' })
  assert.deepEqual(scaleLeader(clear), { winner: 'stay', label: '잔류 쪽이 많아요', aria: '잔류 쪽이 많아 잔류' })
  assert.deepEqual(scaleLeader(tie), { winner: 'tie', label: '같아서 관측대로 대피', aria: '같아서 관측대로 대피' })
  assert.deepEqual(scaleLeader({ total: 0, decision: 'stay' }), { winner: 'tie', label: '같아서 관측대로 잔류', aria: '같아서 관측대로 잔류' })
  assert.deepEqual(line.detail, scaleText(scale, 3, state.config.memory))
  assert.ok(lines.some((l) => l.kind === 'event' && l.good && l.text === '4번이 내 쪽지에 넘어왔다' && l.phase === 'flags'))
})

test('fooledDots fills wrong citizens up to total and marks the majority threshold', () => {
  assert.deepEqual(fooledDots(2, 4), {
    need: 3,
    dots: [true, true, false, false],
    label: '속은 주민 2/4, 3명 필요',
  })
  assert.deepEqual(fooledDots(0, 3), {
    need: 2,
    dots: [false, false, false],
    label: '속은 주민 0/3, 2명 필요',
  })
  assert.deepEqual(fooledDots(5, 4).dots, [true, true, true, true])
})

test('pairLogScales attaches each citizen scale only to their notes quote and keeps unpaired scales', () => {
  const s1 = { parts: [{ from: 'hint', value: 100 }], total: 100, decision: 'evacuate', mine: null, swayed: false }
  const s5 = { parts: [{ from: 'hint', value: -100 }], total: -100, decision: 'stay', mine: null, swayed: false }
  const lines = villageLines(state, { ...turn, vote: { ballots: { 1: 3 }, accused: null, caught: false } }, { 1: s1, 5: s5 })
  // city 5 is not in turn.cities, add a standalone scale for city 5 directly to test ring/unpaired case
  lines.push({ phase: 'flags', kind: 'scale', who: 5, text: '잔류하기로 했어', detail: scaleText(s5, 3, state.config.memory), scale: s5, me: 3 })
  const entries = pairLogScales(lines)
  const city1Says = entries.filter((e) => e.kind === 'say' && e.who === 1)
  assert.equal(city1Says.length, 4) // notes, contradiction, trial warning, trial ballot
  assert.equal(city1Says.filter((e) => e.scale).length, 1) // attached only to notes quote
  assert.equal(city1Says[0].scale?.who, 1)
  assert.equal(entries.some((e) => e.kind === 'scale' && e.scale.who === 1), false)
  assert.equal(entries.some((e) => e.kind === 'scale' && e.scale.who === 5), true)
})

test('suspicionLinks returns thicker curves for positive suspicions and hides zero, non-citizen, majority, or pre-turn1', () => {
  assert.deepEqual(suspicionLinks(villageHouses(state, null), 1), []) // 1일째 전
  const detailed = {
    ...result,
    cities: result.cities.map((c) =>
      c.city === 1 ? { ...c, suspicion: { 2: 0, 3: 60, 4: 20, 5: 80 } } : c,
    ),
  }
  const houses = villageHouses(state, detailed)
  const links = suspicionLinks(houses, 1)
  assert.deepEqual(links.map((l) => [l.to, l.value]), [[3, 60], [4, 20], [5, 80]])
  assert.ok(links[2].strokeWidth > links[0].strokeWidth && links[0].strokeWidth > links[1].strokeWidth)
  for (const l of links) {
    assert.match(l.path, /^M\d+ \d+ Q\d+ \d+ \d+ \d+$/)
    assert.ok(l.labelX > 80 && l.labelX < 820 && l.labelY > 130 && l.labelY < 580)
  }
  // 다수결 주민(5번), 마피아(2번·3번)는 선 없음
  assert.deepEqual(suspicionLinks(houses, 5), [])
  assert.deepEqual(suspicionLinks(houses, 2), [])
  assert.deepEqual(suspicionLinks(houses, 3), [])
})

test('tonightVotes lists observation + notes with last-night trust weights, handles day 1, ring, pending claim, majority, and ai', () => {
  // 1일째: 시민 쪽지 없음, 동료 마피아는 정답(danger→대피)의 반대(stay), 나는 고르는 중(null)
  const day1Houses = villageHouses(state, null)
  const v1 = tonightVotes(state, day1Houses, 1, {})
  assert.equal(v1.noCitizenNotesYet, true)
  assert.equal(v1.usesSuspicion, true)
  assert.equal(v1.ai, false)
  assert.deepEqual(v1.items, [
    { from: 'hint', role: 'hint', claim: 'evacuate', weight: 100 },
    { from: 3, role: 'player', claim: null, weight: 100 },
    { from: 2, role: 'colleague', claim: 'stay', weight: 100 },
  ])

  // 2일째 이후: 시민은 어제 결정(깃발), 가중치는 100 − 어젯밤 의심도 (4·5번 결정을 다르게 해 출처 뒤바뀜 검증)
  const detailed = {
    ...result,
    cities: result.cities.map((c) =>
      c.city === 1
        ? { ...c, suspicion: { 2: 20, 3: 60, 4: 100, 5: 0 } }
        : c.city === 4
          ? { ...c, decision: 'evacuate' }
          : c,
    ),
  }
  const day2Houses = villageHouses(state, detailed)
  const v2 = tonightVotes(state, day2Houses, 1, { 1: 'stay' })
  assert.equal(v2.noCitizenNotesYet, false)
  assert.deepEqual(v2.items, [
    { from: 'hint', role: 'hint', claim: 'stay', weight: 100 },
    { from: 3, role: 'player', claim: 'stay', weight: 40 },
    { from: 2, role: 'colleague', claim: 'stay', weight: 80 },
    { from: 4, role: 'citizen', claim: 'evacuate', weight: 0 },
    { from: 5, role: 'citizen', claim: 'stay', weight: 100 },
  ])

  // ring 연결: 1번 집 양옆은 5번과 2번뿐
  const ringState = { ...state, config: { ...config, connection: 'ring' } }
  const vRing = tonightVotes(ringState, day2Houses, 1, { 1: 'stay' })
  assert.deepEqual(vRing.items.map((x) => x.from), ['hint', 2, 5])

  // 다수결 주민: 의심도 무시하고 모두 1표(100)
  const majState = { ...state, config: { ...config, citizen_type: 'majority' } }
  const vMaj = tonightVotes(majState, day2Houses, 1, { 1: 'evacuate' })
  assert.equal(vMaj.usesSuspicion, false)
  assert.equal(vMaj.ai, false)
  assert.ok(vMaj.items.every((x) => x.weight === 100))

  // AI 주민: LLM이 판단하므로 100 − 의심도 가중치를 쓰지 않고 모두 같은 크기(100)
  const aiState = { ...state, config: { ...config, citizen_type: 'ai' } }
  const vAi = tonightVotes(aiState, day2Houses, 1, { 1: 'evacuate' })
  assert.equal(vAi.usesSuspicion, false)
  assert.equal(vAi.ai, true)
  assert.ok(vAi.items.every((x) => x.weight === 100))

  // memory=recent/full: 기억한 과거 힌트를 ±100씩 합산해 "관측 N표"로 표기
  const hSafe = turnOf([{ city: 1, hint: 'safe', decision: 'stay' }])
  const hDanger = turnOf([{ city: 1, hint: 'danger', decision: 'evacuate' }])
  const recentState = { ...state, config: { ...config, memory: 'recent' } }
  // 어제 safe(-100) + 오늘 safe(-100) = 잔류 2표
  const vRecent2 = tonightVotes(recentState, day2Houses, 1, { 1: 'stay' }, [hDanger, hSafe])
  assert.deepEqual(vRecent2.items[0], { from: 'hint', role: 'hint', claim: 'stay', weight: 200, hintCount: 2 })
  assert.equal(voteItemLabel(vRecent2.items[0]), '관측 2표')
  assert.match(tonightVotesText(vRecent2).aria, /관측 2표 잔류/)

  // 어제 danger(+100) + 오늘 safe(-100) = 0표 상쇄
  const vRecent0 = tonightVotes(recentState, day2Houses, 1, { 1: 'stay' }, [hSafe, hDanger])
  assert.deepEqual(vRecent0.items[0], { from: 'hint', role: 'hint', claim: null, weight: 0, hintCount: 0 })
  assert.equal(voteItemLabel(vRecent0.items[0]), '관측 0표')
  assert.match(tonightVotesText(vRecent0).aria, /관측 0표 상쇄/)

  // memory=full: 지난 모든 턴 + 오늘 힌트 합산 (safe 3번 = 잔류 3표, danger 2 + safe 1 = 대피 1표)
  const fullState = { ...state, config: { ...config, memory: 'full' } }
  const vFull3 = tonightVotes(fullState, day2Houses, 1, { 1: 'stay' }, [hSafe, hSafe])
  assert.deepEqual(vFull3.items[0], { from: 'hint', role: 'hint', claim: 'stay', weight: 300, hintCount: 3 })
  assert.equal(voteItemLabel(vFull3.items[0]), '관측 3표')
  const vFull1 = tonightVotes(fullState, day2Houses, 1, { 1: 'stay' }, [hDanger, hDanger])
  assert.deepEqual(vFull1.items[0], { from: 'hint', role: 'hint', claim: 'evacuate', weight: 100, hintCount: 1 })
  assert.equal(voteItemLabel(vFull1.items[0]), '관측 1표')

  // tonightVotesText: wary / majority / ai 제목·부제·안내 문구 확인
  assert.equal(TONIGHT_SCALE_TITLE, '오늘 밤 저울')
  assert.equal(tonightVotesText(v1).subtitle, '어젯밤 기준')
  assert.equal(tonightVotesText(v1).note, '1일째는 이웃 주민 쪽지가 없어요')
  assert.equal(tonightVotesText(v1).aiNote, null)
  assert.match(tonightVotesText(v1).aria, /^오늘 밤 저울 \(어젯밤 기준\): 관측 대피 믿음 100, 내 쪽지 고르는 중 믿음 100, 동료 2번 잔류 믿음 100, 1일째는 이웃 주민 쪽지가 없어요$/)
  assert.equal(tonightVotesText(vMaj).subtitle, '모두 1표')
  assert.equal(tonightVotesText(vAi).subtitle, '스스로 판단')
  assert.equal(tonightVotesText(vAi).aiNote, 'AI 주민은 의심도를 참고해 스스로 판단해요')
  assert.match(tonightVotesText(vAi).aria, /AI 주민은 의심도를 참고해 스스로 판단해요/)
})

test('DIFFICULTY_STATS derives expected error%, mean wrong citizens, and >=3 wrong probability from preset sensor_error', () => {
  assert.equal(DIFFICULTY_STATS.length, 3)
  for (const row of DIFFICULTY_STATS) {
    const preset = difficulties[row.key]
    assert.equal(preset.mafia_count, 1)
    assert.equal(row.label, preset.label)
  }
  assert.deepEqual(
    DIFFICULTY_STATS.map((r) => [r.key, r.errorPct, r.avgWrong, r.atLeastThreePct, r.waryBotWinPct, r.majorityBotWinPct]),
    [
      ['easy', 48, 1.9, 28, 57, 86],
      ['normal', 40, 1.6, 18, 31, 74],
      ['hard', 30, 1.2, 8, 8, 49],
    ],
  )
})

const soloConfig = {
  connection: 'all',
  citizen_type: 'wary',
  memory: 'turn',
  share_mode: 'pairs',
  share_pairs: 1,
  mafia_count: 1,
  player: 'human',
  sensor_error: 0.4,
  seed: 1,
}
const soloRoles = { 1: 'citizen', 2: 'citizen', 3: 'player', 4: 'citizen', 5: 'citizen' }
const soloState = (extra = {}) => ({
  config: soloConfig,
  roles: soloRoles,
  player_city: 3,
  truth: 'danger',
  outcome: 'loss',
  end_reason: 'caught',
  ...extra,
})

test('resultVillageChips summarizes houses, mafia count, share mode, connection and citizen type', () => {
  assert.deepEqual(resultVillageChips(soloState()), [
    '집 5채',
    '마피아는 나 혼자',
    '밤마다 쪽지 비교',
    '모든 집과 연결',
    '눈치 보는 주민',
  ])
  assert.deepEqual(
    resultVillageChips(
      soloState({
        config: { ...soloConfig, mafia_count: 2, share_mode: 'all', connection: 'ring', citizen_type: 'majority' },
      }),
    ),
    ['집 5채', '마피아 둘', '모든 집 쪽지 비교', '양옆과만 연결', '다수결 주민'],
  )
  assert.deepEqual(
    resultVillageChips(
      soloState({
        config: { ...soloConfig, share_mode: 'none', citizen_type: 'ai' },
      }),
    ),
    ['집 5채', '마피아는 나 혼자', '쪽지 비교 없음', '모든 집과 연결', 'AI 주민'],
  )
})

test('resultBaseline covers all 7 cases, links byz/ring, and never exposes 3f+1 formula', () => {
  const cRow = (city, hint, claim, correct) => ({
    city,
    role: 'citizen',
    hint,
    received: { 3: msg(claim) },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 3: 20 },
    reason: null,
  })
  const makeDay = (t, rows, vote = null) => ({ turn: t, cities: rows, sharing: [], vote })

  // 1. 주민 유리, 승리 (마지막 날 인원 수 대신 "과반의 마음을 돌려 놓았어요")
  const winHist = [
    makeDay(1, [cRow(1, 'danger', 'stay', true), cRow(2, 'danger', 'stay', true), cRow(4, 'danger', 'stay', false), cRow(5, 'safe', 'stay', false)]),
    makeDay(2, [cRow(1, 'danger', 'stay', false), cRow(2, 'danger', 'stay', false), cRow(4, 'danger', 'stay', false), cRow(5, 'danger', 'stay', true)]),
    makeDay(3, [cRow(1, 'danger', 'stay', false), cRow(2, 'danger', 'stay', false), cRow(4, 'danger', 'stay', false), cRow(5, 'danger', 'stay', false)]),
  ]
  const bWin = resultBaseline(soloState({ outcome: 'win', end_reason: 'turns_done' }), winHist)
  assert.equal(bWin.topic, 'byz')
  assert.match(bWin.lines.join(' '), /원래 주민에게 유리한 판이었는데도 해냈어요/)
  assert.match(bWin.lines.join(' '), /2일째부터 과반의 마음을 돌려 놓았어요/)
  assert.doesNotMatch(bWin.lines.join(' '), /4집의 마음/)

  // 2. 15일 버텼지만 패배
  const bTurnsLoss = resultBaseline(
    soloState({ outcome: 'loss', end_reason: 'turns_done' }),
    [makeDay(15, [cRow(1, 'danger', 'stay', true), cRow(2, 'danger', 'stay', true), cRow(4, 'danger', 'stay', true), cRow(5, 'safe', 'stay', false)])],
  )
  assert.match(bTurnsLoss.lines.join(' '), /끝까지 정체는 숨겼어요/)

  // 3. 재판 패배
  const bCaught = resultBaseline(
    soloState({ outcome: 'loss', end_reason: 'caught' }),
    [makeDay(6, [cRow(1, 'danger', 'stay', false), cRow(2, 'danger', 'stay', true)], { ballots: { 1: 3, 2: 3, 4: 3 }, accused: 3, caught: true })],
  )
  assert.equal(bCaught.lines.length, 2)
  assert.match(bCaught.lines[0], /원래 주민에게 유리한 판이었어요/)

  // 4. 하늘 탓 (노트 증거 조건: 마지막 턴 주민별 mine 기준 정답 <= 오답 + f, 승패별 문구 분기)
  // f=1에서 2명 정답·2명 오답이면 2 <= 2 + 1 이므로 증거 ✘
  const skyTieHist = [
    makeDay(15, [cRow(1, 'danger', 'stay', true), cRow(2, 'danger', 'stay', true), cRow(4, 'safe', 'stay', false), cRow(5, 'safe', 'stay', false)]),
  ]
  const bSkyWin = resultBaseline(soloState({ outcome: 'win', end_reason: 'turns_done' }), skyTieHist)
  assert.match(bSkyWin.lines.join(' '), /주민들이 본 하늘부터 진짜 날씨와 많이 어긋난 판이었어요\. 하늘도 당신 편이었어요\./)
  const bSkyLoss = resultBaseline(soloState({ outcome: 'loss', end_reason: 'turns_done' }), skyTieHist)
  assert.match(bSkyLoss.lines.join(' '), /주민들이 본 하늘부터 진짜 날씨와 많이 어긋난 판이었어요\. 누가 마피아였어도 주민이 이긴다고 장담하기 어려웠어요\./)

  // memory=full에서는 마지막 턴까지 누적한 주민별 mine 다수로 판정 (마지막 턴 hint가 3:1이어도 누적 mine이 2:2면 증거 ✘)
  const fullMemorySkyHist = [
    makeDay(1, [cRow(1, 'safe', 'stay', false), cRow(2, 'danger', 'stay', true), cRow(4, 'safe', 'stay', false), cRow(5, 'danger', 'stay', true)]),
    makeDay(2, [cRow(1, 'safe', 'stay', false), cRow(2, 'danger', 'stay', true), cRow(4, 'safe', 'stay', false), cRow(5, 'danger', 'stay', true)]),
    makeDay(3, [cRow(1, 'danger', 'stay', true), cRow(2, 'danger', 'stay', true), cRow(4, 'safe', 'stay', false), cRow(5, 'danger', 'stay', true)]),
  ]
  const bSkyFull = resultBaseline(
    soloState({ config: { ...soloConfig, memory: 'full' }, outcome: 'win', end_reason: 'turns_done' }),
    fullMemorySkyHist,
  )
  assert.match(bSkyFull.lines.join(' '), /하늘도 당신 편이었어요/)

  // memory=turn이면 같은 3턴 기록이라도 마지막 턴(3:1, 3 > 1 + 1) 기준이라 증거 ✔ → 주민 유리, 승리
  const bTurnOk = resultBaseline(
    soloState({ config: { ...soloConfig, memory: 'turn' }, outcome: 'win', end_reason: 'turns_done' }),
    fullMemorySkyHist,
  )
  assert.match(bTurnOk.lines.join(' '), /원래 주민에게 유리한 판이었는데도 해냈어요/)

  // 5. 고리 마을 (ring): 승리 / 재판 패배(조기·7일) / 끝까지 버팀 패배 구분
  const bRing = resultBaseline(
    soloState({ config: { ...soloConfig, connection: 'ring' }, outcome: 'win', end_reason: 'turns_done' }),
    winHist,
  )
  assert.equal(bRing.topic, 'ring')
  assert.equal(bRing.linkTitle, '연결도 조건')
  assert.equal(bRing.linkSub, '왜 양옆만 이어지면 주민 방어가 흔들리는지')
  assert.match(bRing.lines.join(' '), /양옆 이웃하고만 이야기하는 마을은/)
  assert.match(bRing.lines.join(' '), /그렇다고 저절로 무너지는 것은 아니에요\. 이번엔 전략이 통했어요\./)
  const bRingCaught = resultBaseline(
    soloState({ config: { ...soloConfig, connection: 'ring' }, outcome: 'loss', end_reason: 'caught' }),
    [makeDay(4, [cRow(1, 'danger', 'stay', true)], { ballots: { 1: 3, 2: 3, 4: 3 }, accused: 3, caught: true })],
  )
  assert.match(bRingCaught.lines.join(' '), /이번엔 재판에 걸려 일찍 끝났어요/)
  assert.doesNotMatch(bRingCaught.lines.join(' '), /끝까지 버텨 냈어요/)
  const bRingCaught7 = resultBaseline(
    soloState({ config: { ...soloConfig, connection: 'ring' }, outcome: 'loss', end_reason: 'caught' }),
    [makeDay(7, [cRow(1, 'danger', 'stay', true)], { ballots: { 1: 3, 2: 3, 4: 3 }, accused: 3, caught: true })],
  )
  assert.match(bRingCaught7.lines.join(' '), /이번엔 마지막 밤 재판에 걸렸어요/)
  const bRingTurns = resultBaseline(
    soloState({ config: { ...soloConfig, connection: 'ring' }, outcome: 'loss', end_reason: 'turns_done' }),
    [makeDay(15, [cRow(1, 'danger', 'stay', true)])],
  )
  assert.match(bRingTurns.lines.join(' '), /이번엔 주민들이 끝까지 버텨 냈어요/)

  // 6. 마피아 둘 (n < 3f+1): 재판 기록(지목된 쪽·의심도)·7일 패·승리로 갈리고 인과를 붙이지 않는다
  const twoState = (extra = {}) =>
    soloState({
      config: { ...soloConfig, mafia_count: 2 },
      roles: { 1: 'citizen', 2: 'colleague', 3: 'player', 4: 'citizen', 5: 'citizen' },
      outcome: 'loss',
      end_reason: 'caught',
      ...extra,
    })
  const bTwo = resultBaseline(
    twoState(),
    [makeDay(4, [cRow(1, 'danger', 'stay', true)], { ballots: { 1: 2, 4: 2 }, accused: 2, caught: true })],
  )
  assert.equal(bTwo.topic, 'byz')
  assert.match(bTwo.lines.join(' '), /집 다섯에 마피아 둘이면/)
  assert.match(bTwo.lines.join(' '), /이번 재판에서는 동료가 의심도 \d+에서 지목됐어요/)
  assert.doesNotMatch(bTwo.lines.join(' '), /먼저|수적 우위/)
  const bTwoPlayerCaught = resultBaseline(
    twoState(),
    [makeDay(4, [cRow(1, 'danger', 'stay', true)], { ballots: { 1: 3, 4: 3 }, accused: 3, caught: true })],
  )
  assert.match(bTwoPlayerCaught.lines[0], /이번 재판에서는 내 집이 의심도 \d+에서 지목됐어요/)
  const bTwoTurnsLoss = resultBaseline(
    twoState({ end_reason: 'turns_done' }),
    [makeDay(15, [cRow(1, 'danger', 'stay', true)])],
  )
  assert.match(bTwoTurnsLoss.lines[0], /사라져요\. 이번엔 마지막 밤 주민 과반을 속이지 못했어요\.$/)

  // 7. 정직했는데 재판
  const bHonest = resultBaseline(
    soloState({ outcome: 'loss', end_reason: 'caught' }),
    [
      makeDay(1, [cRow(1, 'safe', 'evacuate', false), cRow(2, 'safe', 'evacuate', false)]),
      makeDay(2, [cRow(1, 'safe', 'evacuate', false), cRow(2, 'safe', 'evacuate', false)], { ballots: { 1: 3, 2: 3, 4: 3 }, accused: 3, caught: true }),
    ],
  )
  assert.match(bHonest.lines.join(' '), /진짜 날씨만 말했는데도 재판에 걸렸어요/)

  for (const b of [bWin, bTurnsLoss, bCaught, bSkyWin, bSkyLoss, bSkyFull, bRing, bRingCaught, bRingTurns, bTwo, bTwoPlayerCaught, bTwoTurnsLoss, bHonest]) {
    assert.doesNotMatch(b.lines.join(' '), /3f\+1/i)
  }
})

test('resultDecisive explains contradiction catch, trial catch, and final-day majority result', () => {
  const clashDay = {
    turn: 6,
    cities: [
      { ...empty, city: 2, correct: true },
      { ...empty, city: 4, correct: true },
    ],
    sharing: [{ pair: [2, 4], contradictions: [{ city: 3, told: { 2: msg('stay'), 4: msg('evacuate') } }] }],
    vote: { ballots: { 1: 3, 2: 3, 4: 3 }, accused: 3, caught: true },
  }
  const decClash = resultDecisive(soloState({ outcome: 'loss', end_reason: 'caught' }), [clashDay])
  assert.deepEqual(decClash, [
    '6일째 밤, 2번 집과 4번 집에 서로 다른 쪽지를 보냈어요.',
    '그날 쪽지 비교에서 모순이 드러났고, 이어진 재판에서 지목됐어요.',
  ])

  const decWin = resultDecisive(soloState({ outcome: 'win', end_reason: 'turns_done' }), [
    {
      turn: 15,
      cities: [
        { ...empty, city: 1, correct: false },
        { ...empty, city: 2, correct: false },
        { ...empty, city: 4, correct: false },
        { ...empty, city: 5, correct: true },
      ],
      sharing: [],
      vote: null,
    },
  ])
  assert.match(decWin[0], /마지막 15일째 밤, 주민 4명 중 3명을 속여 과반\(3명\)을 넘겼어요/)
})

test('detectTactics implements A2 rules, rarity priority, and max 2 tags', () => {
  const c = (city, hint, claim, sus, correct, receivedExtra = {}) => ({
    city,
    role: 'citizen',
    hint,
    received: { 3: msg(claim), ...receivedExtra },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: sus,
    reason: null,
  })

  // 1. 감사 회피: share_mode !== 'none'이고 비교가 실제 일어난 턴(sharing.length > 0) 중 이중 발언 5회 & 모순 0회
  const equivTurn = (t, sharing = [{ pair: [1, 4], contradictions: [] }]) => ({
    turn: t,
    cities: [
      c(1, 'danger', 'stay', { 3: 20 }, false),
      c(2, 'danger', 'evacuate', { 3: 0 }, true),
      c(4, 'danger', 'stay', { 3: 20 }, false),
      c(5, 'danger', 'evacuate', { 3: 0 }, true),
    ],
    sharing,
    vote: null,
  })
  assert.deepEqual(
    detectTactics(soloState(), [1, 2, 3, 4].map((t) => equivTurn(t))).map((x) => x.tag),
    [],
  )
  assert.deepEqual(
    detectTactics(soloState(), [1, 2, 3, 4, 5].map((t) => equivTurn(t))).map((x) => x.tag),
    ['audit'],
  )
  // share_mode === 'none'이면 이중 발언 5회여도 감사 회피 미발동
  assert.deepEqual(
    detectTactics(
      soloState({ config: { ...soloConfig, share_mode: 'none' } }),
      [1, 2, 3, 4, 5].map((t) => equivTurn(t, [])),
    ).map((x) => x.tag),
    [],
  )
  // pairs라도 실제 비교가 일어난 턴이 5회 미만이면 미발동
  assert.deepEqual(
    detectTactics(
      soloState(),
      [equivTurn(1), equivTurn(2), equivTurn(3), equivTurn(4), equivTurn(5, [])],
    ).map((x) => x.tag),
    [],
  )
  // 모순이 1번이라도 있으면 감사 회피 불가
  const withClash = [1, 2, 3, 4, 5].map((t) => equivTurn(t))
  withClash[2].sharing = [{ pair: [1, 2], contradictions: [{ city: 3, told: { 1: msg('stay'), 2: msg('evacuate') } }] }]
  assert.equal(detectTactics(soloState(), withClash).some((x) => x.tag === 'audit'), false)

  // 2. 온오프 공격: 의심도 >= 40 -> 그 주민이 본 날씨와 같은 쪽지로 <= 20 낮춤 -> 다시 거짓 보내 그 주민이 틀림
  const onoffHist = [
    { turn: 1, cities: [c(1, 'danger', 'stay', { 3: 40 }, true)], sharing: [], vote: null },
    { turn: 2, cities: [c(1, 'danger', 'evacuate', { 3: 20 }, true)], sharing: [], vote: null },
    { turn: 3, cities: [c(1, 'safe', 'stay', { 3: 0 }, false)], sharing: [], vote: null },
  ]
  const onoffRes = detectTactics(soloState(), onoffHist)
  assert.deepEqual(onoffRes.map((x) => x.tag), ['onoff'])
  assert.equal(onoffRes[0].day, 2)
  assert.match(onoffRes[0].text, /1번 집\(의심도 40\)에 그 집이 본 하늘과 같은 쪽지를 보내 20까지 낮춘 뒤, 다음 날 거짓 쪽지를 보냈고 그 집은 틀렸어요/)

  // 주민이 하늘을 잘못 본 날(truth=danger, hint=safe)에도 직전과 다른 쪽지(evacuate -> stay)로 의심도를 낮췄으면 온오프 공격으로 인정
  const wrongHintWash = [
    { turn: 1, cities: [c(1, 'danger', 'evacuate', { 3: 40 }, true)], sharing: [], vote: null },
    { turn: 2, cities: [c(1, 'safe', 'stay', { 3: 20 }, false)], sharing: [], vote: null },
    { turn: 3, cities: [c(1, 'safe', 'stay', { 3: 0 }, false)], sharing: [], vote: null },
  ]
  const wrongHintRes = detectTactics(soloState(), wrongHintWash)
  assert.deepEqual(wrongHintRes.map((x) => x.tag), ['onoff'])
  assert.equal(wrongHintRes[0].day, 2)

  // 항상 같은 거짓 쪽지(stay)만 보냈는데 주민이 하늘을 잘못 봐 의심도가 내려간 판이면 꼬리표가 없어야 한다
  const sameLieWrongHint = [
    { turn: 1, cities: [c(1, 'danger', 'stay', { 3: 40 }, true)], sharing: [], vote: null },
    { turn: 2, cities: [c(1, 'safe', 'stay', { 3: 20 }, false)], sharing: [], vote: null },
    { turn: 3, cities: [c(1, 'safe', 'stay', { 3: 0 }, false)], sharing: [], vote: null },
  ]
  assert.deepEqual(detectTactics(soloState(), sameLieWrongHint), [])

  // 진짜 날씨(evacuate)를 보냈더라도 그 주민이 본 날씨(safe)와 다르면 의심 세탁으로 인정하지 않는다
  const mismatchHintTruth = [
    { turn: 1, cities: [c(1, 'danger', 'stay', { 3: 40 }, true)], sharing: [], vote: null },
    { turn: 2, cities: [c(1, 'safe', 'evacuate', { 3: 20 }, true)], sharing: [], vote: null },
    { turn: 3, cities: [c(1, 'safe', 'stay', { 3: 0 }, false)], sharing: [], vote: null },
  ]
  assert.deepEqual(detectTactics(soloState(), mismatchHintTruth), [])

  // 3. 완고한 행위자(vote.accused === 동료일 때만) + 4. 거짓 양성 + 5. 이중 발언 + 우선순위 최대 2개 확인
  const noZealotAccusedOther = [
    {
      turn: 1,
      cities: [
        c(1, 'danger', 'stay', { 2: 60, 3: 0 }, false, { 4: msg('stay') }),
        c(4, 'danger', 'evacuate', { 2: 40, 3: 0 }, true),
        c(5, 'danger', 'stay', { 2: 20, 3: 0 }, false, { 4: msg('stay') }),
      ],
      sharing: [],
      vote: { ballots: { 1: 4, 4: 2, 5: 4 }, accused: 4, caught: false },
    },
    {
      turn: 2,
      cities: [
        c(1, 'danger', 'stay', { 2: 40, 3: 40 }, false, { 4: msg('stay') }),
        c(4, 'danger', 'evacuate', { 2: 40, 3: 0 }, true),
        c(5, 'danger', 'stay', { 2: 20, 3: 20 }, false, { 4: msg('stay') }),
      ],
      sharing: [],
      vote: null,
    },
  ]
  const f2State = soloState({
    config: { ...soloConfig, mafia_count: 2 },
    roles: { 1: 'citizen', 2: 'colleague', 3: 'player', 4: 'citizen', 5: 'citizen' },
  })
  // 동료 의심도가 60이어도 vote.accused !== 동료이면 zealot 미발동
  assert.deepEqual(detectTactics(f2State, noZealotAccusedOther).map((x) => x.tag), ['falsepos', 'equiv'])

  const multiHist = [
    ...noZealotAccusedOther,
    {
      turn: 3,
      cities: [
        c(1, 'danger', 'stay', { 2: 60, 3: 0 }, true),
        c(4, 'danger', 'evacuate', { 2: 60, 3: 0 }, true),
        c(5, 'danger', 'stay', { 2: 40, 3: 0 }, true),
      ],
      sharing: [],
      vote: { ballots: { 1: 2, 4: 2, 5: 2 }, accused: 2, caught: true },
    },
  ]
  // zealot(3위), falsepos(4위), equiv(5위, 4건 swayed) 모두 충족 → 드문 순서로 상위 2개만 반환
  assert.deepEqual(detectTactics(f2State, multiHist).map((x) => x.tag), ['zealot', 'falsepos'])

  // f=1이면 zealot은 빠지고 falsepos, equiv가 남는다
  const f1NoZealot = detectTactics(soloState({ roles: f2State.roles }), multiHist)
  assert.deepEqual(f1NoZealot.map((x) => x.tag), ['falsepos', 'equiv'])
  // 그래프 핀 문구도 화면 꼬리표 이름(TAG_LABELS)과 동일해야 한다
  const pinSummary = gameSummary(soloState({ roles: f2State.roles, outcome: 'win', end_reason: 'turns_done' }), multiHist)
  assert.ok(pinSummary.pins[0]?.labels.includes(TAG_LABELS.falsepos))
  assert.ok(pinSummary.pins[0]?.labels.includes(TAG_LABELS.equiv))
})

test('THEORY_TOPICS has verified content for all 8 topics and concise 2-sentence popover theory tips', () => {
  const topicKeys = ['byz', 'equiv', 'onoff', 'ring', 'condorcet', 'zealot', 'falsepos', 'audit']
  assert.deepEqual(Object.keys(THEORY_TOPICS).sort(), [...topicKeys].sort())
  for (const key of topicKeys) {
    const topic = THEORY_TOPICS[key]
    assert.ok(topic.easy.length > 0 && topic.game.length > 0 && topic.proof.length > 0, `${key} has body`)
    assert.ok(topic.boxes.length >= 2 && topic.refs.length >= 2, `${key} has boxes and refs`)
    const combined = [
      topic.easy,
      topic.game,
      topic.proof,
      ...topic.boxes.flat(),
      ...topic.refs.map((r) => `${r.before}${r.italic ?? ''}${r.after ?? ''}`),
    ].join(' ')
    assert.doesNotMatch(combined, /확인 못 함|자리표시/)
  }

  for (const tag of Object.keys(TAG_LABELS)) {
    const tip = THEORY_TOPICS[tag].tip
    assert.ok(tip.easy.length > 0 && tip.game.length > 0 && tip.theory.length > 0 && tip.cite.length > 0)
    const sentences = tip.theory
      .trim()
      .split(/(?<=[.?!])\s+/)
      .filter(Boolean)
    assert.ok(sentences.length <= 2, `${tag} tip.theory has ${sentences.length} sentences (max 2)`)
    assert.doesNotMatch(`${tip.easy} ${tip.game} ${tip.theory} ${tip.cite}`, /확인 못 함|자리표시/)
  }
})

test('resultInfluence counts swayed wrong citizens, shows default no-note rates, and hides for AI', () => {
  // truth=danger(evacuate가 정답). 1번은 hint=danger(+100), 4번 stay(-100), 내(3번) stay(-100) → -100(stay, 오답, swayed=true)
  // 2번은 hint=safe(-100), 4번 evacuate(+100), 내(3번) evacuate(+100) → +100(evacuate, 정답, swayed=true → 제외!)
  const h = [
    {
      cities: [
        { ...empty, city: 1, hint: 'danger', decision: 'stay', correct: false, received: { 3: msg('stay'), 4: msg('stay') }, suspicion: { 3: 0, 4: 0 } },
        { ...empty, city: 2, hint: 'safe', decision: 'evacuate', correct: true, received: { 3: msg('evacuate'), 4: msg('evacuate') }, suspicion: { 3: 0, 4: 0 } },
        { ...empty, city: 4, hint: 'safe', decision: 'stay', correct: false, received: { 3: msg('stay') }, suspicion: { 3: 0 } }, // 내 쪽지 빼도 -100 stay → swayed=false
      ],
    },
  ]
  assert.deepEqual(resultInfluence(soloState({ config: { ...soloConfig, sensor_error: 0.3 } }), h), {
    count: 1,
    noNoteWinRate: '92%',
  })
  assert.deepEqual(resultInfluence(soloState({ config: { ...soloConfig, sensor_error: 0.4 } }), h), {
    count: 1,
    noNoteWinRate: '82%',
  })
  assert.deepEqual(resultInfluence(soloState({ config: { ...soloConfig, sensor_error: 0.48 } }), h), {
    count: 1,
    noNoteWinRate: '72%',
  })
  // 기본 조건(집 5채, 마피아 1, 눈치, all, share_mode/memory 기본값, player human) 벗어나면 보조 확률 생략
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, connection: 'ring' } }), h)?.noNoteWinRate, null)
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, mafia_count: 2 } }), h)?.noNoteWinRate, null)
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, citizen_type: 'majority' } }), h)?.noNoteWinRate, null)
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, share_mode: 'all' } }), h)?.noNoteWinRate, null)
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, memory: 'full' } }), h)?.noNoteWinRate, null)
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, player: 'bot' } }), h)?.noNoteWinRate, null)
  assert.equal(
    resultInfluence(soloState({ roles: { 1: 'citizen', 2: 'citizen', 3: 'player' } }), h)?.noNoteWinRate,
    null,
  )
  // AI 주민은 영향력 줄 전체 숨김
  assert.equal(resultInfluence(soloState({ config: { ...soloConfig, citizen_type: 'ai' } }), h), null)
  assert.deepEqual(resultDeceived(h), [2])
})

test('condorcetMajorityProb computes exact binomial majority probabilities and increases monotonically for p > 0.5', () => {
  // n=1이면 개별 확률 p와 동일
  assert.ok(Math.abs(condorcetMajorityProb(1, 0.7) - 0.7) < 1e-12)
  assert.ok(Math.abs(condorcetMajorityProb(1, 0.52) - 0.52) < 1e-12)
  // n=3: 3p^2(1-p) + p^3 = 3p^2 - 2p^3
  assert.ok(Math.abs(condorcetMajorityProb(3, 0.6) - (3 * 0.36 - 2 * 0.216)) < 1e-12)
  assert.ok(Math.abs(condorcetMajorityProb(3, 0.7) - (3 * 0.49 - 2 * 0.343)) < 1e-12)
  // p=0.5이면 모든 홀수 n에서 정확히 0.5
  for (const n of CONDORCET_NS) {
    assert.ok(Math.abs(condorcetMajorityProb(n, 0.5) - 0.5) < 1e-12)
  }
  // p > 0.5이면 홀수 n에 대해 단조 증가하며 p가 클수록 높다
  for (const p of CONDORCET_PS) {
    const vals = CONDORCET_NS.map((n) => condorcetMajorityProb(n, p))
    for (let i = 1; i < vals.length; i++) {
      assert.ok(vals[i] > vals[i - 1], `p=${p} increases at n=${CONDORCET_NS[i]}`)
    }
  }
  assert.ok(condorcetMajorityProb(25, 0.7) > 0.98)
  assert.ok(condorcetMajorityProb(25, 0.6) > 0.84 && condorcetMajorityProb(25, 0.6) < 0.85)
  assert.ok(condorcetMajorityProb(25, 0.52) > 0.57 && condorcetMajorityProb(25, 0.52) < 0.59)
})

test('onOffTrajectory oscillates by ±20, clamps at 0..100, and sample stays below threshold 60', () => {
  const sample = onOffTrajectory(ONOFF_SAMPLE_ACTIONS)
  assert.equal(sample.length, ONOFF_SAMPLE_ACTIONS.length + 1)
  assert.equal(sample[0].suspicion, 0)
  assert.ok(sample.every((p) => p.suspicion >= 0 && p.suspicion < 60))
  assert.deepEqual(
    sample.map((p) => p.suspicion),
    [0, 20, 40, 20, 40, 20, 0, 20, 40, 20, 40],
  )
  // 하한 0·상한 100 클램프 확인
  assert.deepEqual(
    onOffTrajectory(['honest', 'lie', 'lie', 'lie', 'lie', 'lie', 'lie'], 0).map((p) => p.suspicion),
    [0, 0, 20, 40, 60, 80, 100, 100],
  )
})

test('gameSummary adds trust-broken and deception-drop moments without tags or chart pins (game 723 pattern)', () => {
  const g723State = {
    config: { ...soloConfig, sensor_error: 0.48, seed: 15 },
    roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'citizen', 5: 'citizen' },
    player_city: 1,
    truth: 'danger',
    outcome: 'loss',
    end_reason: 'turns_done',
  }
  const row = (city, hint, decision, correct, susP, received = { 1: msg('stay') }) => ({
    city,
    role: 'citizen',
    hint,
    received,
    decision,
    correct,
    suspicion: susP == null ? null : { 1: susP },
    reason: null,
  })
  const playerRow = { city: 1, role: 'player', hint: null, received: null, decision: null, correct: null, suspicion: null, reason: null }

  // 게임 723 축약 흐름: 7일 4명 속음 → 8일 2·3번 의심도 80/60(3명 속음) → 9일 관측 4명 모두 맞고 2·3번 의심도 100/80(1명 속음) → 15일 패배
  const g723Hist = [
    {
      turn: 7,
      cities: [
        playerRow,
        row(2, 'danger', 'stay', false, 60),
        row(3, 'safe', 'stay', false, 40),
        row(4, 'safe', 'stay', false, 0),
        row(5, 'safe', 'stay', false, 0),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 8,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, 80),
        row(3, 'danger', 'stay', false, 60),
        row(4, 'safe', 'stay', false, 0),
        row(5, 'safe', 'stay', false, 0),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 9,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, 100),
        row(3, 'danger', 'evacuate', true, 80),
        row(4, 'danger', 'evacuate', true, 0),
        row(5, 'danger', 'stay', false, 20),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 15,
      cities: [
        playerRow,
        row(2, 'safe', 'stay', false, 80),
        row(3, 'danger', 'evacuate', true, 100),
        row(4, 'danger', 'evacuate', true, 60),
        row(5, 'safe', 'stay', false, 20),
      ],
      sharing: [],
      vote: null,
    },
  ]

  const s = gameSummary(g723State, g723Hist)
  const trustLine = s.moments.find((m) => m.day === 8 && m.text.includes('내 쪽지를 거의 믿지 않았어요'))
  assert.ok(trustLine, 'trust-broken moment added on day 8')
  assert.equal(trustLine.tag, undefined)
  assert.equal(trustLine.text, '8일째부터 2번 집은 내 쪽지를 거의 믿지 않았어요(의심도 80 이상이면 1/5표 이하예요)')

  const dropLine = s.moments.find((m) => m.day === 9 && m.text.includes('속은 주민이'))
  assert.ok(dropLine, 'deception-drop moment added on day 9')
  assert.equal(dropLine.tag, undefined)
  assert.equal(
    dropLine.text,
    '9일째, 속은 주민이 3명에서 1명으로 줄었어요. 그날은 주민 4명 모두 관측이 맞았어요. 2·3번 집은 의심도가 80 이상이라 내 쪽지를 거의 믿지 않았어요',
  )
  // 날짜순 정렬 유지, 그래프 핀 추가 없음
  const datedDays = s.moments.filter((m) => m.day != null).map((m) => m.day)
  assert.deepEqual(datedDays, [...datedDays].sort((a, b) => a - b))
  assert.equal(s.pins[1], undefined)
  assert.equal(s.pins[2], undefined)

  // 같은 날 여러 집이 80 이상 도달 (이웃 쪽지 분기는 제거되어 관측·의심도 상태만 적는다)
  const groupedDrop = [
    {
      turn: 4,
      cities: [
        playerRow,
        row(2, 'safe', 'stay', false, 60),
        row(3, 'safe', 'stay', false, 60),
        row(4, 'safe', 'stay', false, 0),
        row(5, 'safe', 'stay', false, 0),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 5,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, 80, { 1: msg('stay'), 3: msg('evacuate') }),
        row(3, 'danger', 'evacuate', true, 80, { 1: msg('stay'), 2: msg('evacuate') }),
        row(4, 'danger', 'evacuate', true, 20, { 1: msg('stay'), 2: msg('evacuate') }),
        row(5, 'safe', 'evacuate', true, 0, { 1: msg('stay'), 2: msg('evacuate'), 3: msg('evacuate') }),
      ],
      sharing: [],
      vote: null,
    },
  ]
  const sGroup = gameSummary(g723State, groupedDrop)
  assert.ok(
    sGroup.moments.some(
      (m) => m.day === 5 && m.text === '5일째부터 2·3번 집은 내 쪽지를 거의 믿지 않았어요(의심도 80 이상이면 1/5표 이하예요)',
    ),
  )
  assert.ok(
    sGroup.moments.some(
      (m) =>
        m.day === 5 &&
        m.text ===
          '5일째, 속은 주민이 4명에서 0명으로 줄었어요. 그날은 주민 4명 중 3명은 관측이 맞았어요. 2·3번 집은 의심도가 80 이상이라 내 쪽지를 거의 믿지 않았어요',
    ),
  )
  assert.equal(sGroup.moments.some((m) => m.text.includes('이웃 쪽지를 믿고')), false)

  // 의심도가 80 이상에 도달했다가 이후 80 아래로 회복되면 "N일째부터"가 아니라 "N일째에는"으로 적는다
  const recoveredHist = [
    {
      turn: 6,
      cities: [playerRow, row(2, 'danger', 'evacuate', true, 40), row(3, 'danger', 'evacuate', true, 80)],
      sharing: [],
      vote: null,
    },
    {
      turn: 7,
      cities: [playerRow, row(2, 'danger', 'evacuate', true, 40), row(3, 'danger', 'evacuate', true, 60)],
      sharing: [],
      vote: null,
    },
  ]
  assert.ok(
    gameSummary(g723State, recoveredHist).moments.some(
      (m) => m.day === 6 && m.text === '6일째에는 3번 집은 내 쪽지를 거의 믿지 않았어요(의심도 80 이상이면 1/5표 이하예요)',
    ),
  )

  // 처음 80 이상이 모두 100으로 바로 오른 경우 (0표 표현)
  const jumpTo100 = [
    {
      turn: 3,
      cities: [playerRow, row(2, 'danger', 'evacuate', true, 100), row(3, 'danger', 'evacuate', true, 40)],
      sharing: [],
      vote: null,
    },
  ]
  assert.ok(
    gameSummary(g723State, jumpTo100).moments.some(
      (m) => m.day === 3 && m.text === '3일째부터 2번 집은 내 쪽지를 전혀 믿지 않았어요(의심도 100이면 0표예요)',
    ),
  )

  // 다수결 주민(의심도 없음): 신뢰 끊김은 생략, 한꺼번에 풀림은 관측만으로 설명
  const majHist = [
    {
      turn: 2,
      cities: [
        playerRow,
        row(2, 'safe', 'stay', false, null),
        row(3, 'safe', 'stay', false, null),
        row(4, 'safe', 'stay', false, null),
        row(5, 'safe', 'stay', false, null),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 3,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, null, { 1: msg('stay'), 3: msg('evacuate') }),
        row(3, 'danger', 'evacuate', true, null, { 1: msg('stay'), 2: msg('evacuate') }),
        row(4, 'safe', 'evacuate', true, null, { 1: msg('stay'), 2: msg('evacuate'), 3: msg('evacuate') }),
        row(5, 'safe', 'stay', false, null, { 1: msg('stay') }),
      ],
      sharing: [],
      vote: null,
    },
  ]
  const sMaj = gameSummary({ ...g723State, config: { ...g723State.config, citizen_type: 'majority' } }, majHist)
  assert.equal(sMaj.moments.some((m) => m.text.includes('믿지 않았어요')), false)
  assert.ok(
    sMaj.moments.some(
      (m) =>
        m.day === 3 &&
        m.text === '3일째, 속은 주민이 4명에서 1명으로 줄었어요. 그날은 주민 4명 중 2명은 관측이 맞았어요',
    ),
  )

  // AI 주민 판: 신뢰 끊김·한꺼번에 풀림 두 새 순간 줄을 모두 숨긴다
  const sAi = gameSummary({ ...g723State, config: { ...g723State.config, citizen_type: 'ai' } }, g723Hist)
  assert.equal(sAi.moments.some((m) => m.text.includes('믿지 않았어요') || m.text.includes('속은 주민이')), false)

  // 해당 없는 판: 의심도 80 미만 유지 + 과반 이상→미만 하락 없음
  const calmHist = [
    {
      turn: 1,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, 20),
        row(3, 'danger', 'evacuate', true, 20),
        row(4, 'safe', 'stay', false, 0),
        row(5, 'safe', 'stay', false, 0),
      ],
      sharing: [],
      vote: null,
    },
    {
      turn: 2,
      cities: [
        playerRow,
        row(2, 'danger', 'evacuate', true, 40),
        row(3, 'danger', 'evacuate', true, 40),
        row(4, 'danger', 'evacuate', true, 20),
        row(5, 'safe', 'stay', false, 0),
      ],
      sharing: [],
      vote: null,
    },
  ]
  const sCalm = gameSummary(g723State, calmHist)
  assert.equal(sCalm.moments.some((m) => m.text.includes('믿지 않았어요') || m.text.includes('속은 주민이')), false)
})

test('watchfulEyeClashNote branches on caught and player contradictions', () => {
  const clashTurn = (turnNum, city) => ({
    turn: turnNum,
    sharing: [{ pair: [1, 2], contradictions: [{ city, told: {} }] }],
  })
  const cleanTurn = (turnNum) => ({
    turn: turnNum,
    sharing: [{ pair: [1, 2], contradictions: [] }],
  })
  assert.equal(
    watchfulEyeClashNote({ player_city: 4, end_reason: 'turns_done' }, [clashTurn(1, 4), cleanTurn(2)]),
    '1일째에 집마다 다른 말을 한 게 증명됐지만, 그것만으로 쫓겨나지는 않았어요.',
  )
  assert.equal(
    watchfulEyeClashNote({ player_city: 4, end_reason: 'turns_done' }, [clashTurn(1, 4), clashTurn(3, 4)]),
    '1·3일째에 집마다 다른 말을 한 게 증명됐지만, 그것만으로 쫓겨나지는 않았어요.',
  )
  assert.equal(
    watchfulEyeClashNote({ player_city: 4, end_reason: 'turns_done' }, [clashTurn(1, 2), cleanTurn(2)]),
    '이번엔 모순이 한 번도 없었어요. 다시 해서 집마다 다르게 보낼 때와 비교해 보세요.',
  )
  assert.equal(
    watchfulEyeClashNote({ player_city: 4, end_reason: 'caught' }, [clashTurn(1, 4), clashTurn(3, 4)]),
    '1·3일째에 모순이 드러났고, 이후 의심도가 쌓여 재판에 걸렸어요.',
  )
  assert.equal(
    watchfulEyeClashNote({ player_city: 4, end_reason: 'caught' }, [cleanTurn(1)]),
    '모순은 없었지만, 주민이 본 하늘과 다른 쪽지가 쌓여 재판에 걸렸어요.',
  )
})

test('RING_TRAILS connects five adjacent clearings and scenarioGoalMet returns true only on win or perfect_win', () => {
  assert.equal(RING_TRAILS.length, 5)
  assert.equal(scenarioGoalMet({ outcome: 'win' }), true)
  assert.equal(scenarioGoalMet({ outcome: 'perfect_win' }), true)
  assert.equal(scenarioGoalMet({ outcome: 'loss' }), false)
  assert.equal(scenarioGoalMet({ outcome: null }), false)
})

test('ringVillageOutcomeNote branches on caught day and far-house observation/outcome without false causation', () => {
  const ringState = (outcome, end_reason, truth = 'danger') => ({
    config: { ...config, connection: 'ring' },
    roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'citizen', 5: 'citizen' },
    player_city: 1,
    truth,
    outcome,
    end_reason,
  })
  const dayCities = (c2, c3, h3, c4, h4, c5) => [
    { city: 1, role: 'player', hint: null, correct: null },
    { city: 2, role: 'citizen', hint: 'danger', correct: c2 },
    { city: 3, role: 'citizen', hint: h3, correct: c3 },
    { city: 4, role: 'citizen', hint: h4, correct: c4 },
    { city: 5, role: 'citizen', hint: 'danger', correct: c5 },
  ]
  // 조기 재판 패배 vs 마지막 7일째 재판 패배
  assert.equal(
    ringVillageOutcomeNote(ringState('loss', 'caught'), [{ turn: 3, cities: dayCities(true, false, 'safe', true, 'danger', true) }]),
    '마지막 밤까지 가지 못했어요. 다시 할 때는 양옆 두 집의 의심도를 살피면서, 먼 두 집의 깃발이 어떻게 바뀌는지도 지켜보세요.',
  )
  assert.equal(
    ringVillageOutcomeNote(ringState('loss', 'caught'), [{ turn: 7, cities: dayCities(true, false, 'safe', true, 'danger', true) }]),
    '마지막 밤 재판에 걸렸어요. 양옆 두 집의 의심도를 살피며 다시 해 보세요.',
  )
  // 승리: 먼 집 1채 오답 (관측 정답 → 이웃 쪽지 따라 틀림)
  assert.equal(
    ringVillageOutcomeNote(ringState('win', 'turns_done'), [{ turn: 7, cities: dayCities(false, false, 'danger', true, 'safe', false) }]),
    '마지막 밤, 먼 3번 집은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요.',
  )
  // 승리: 먼 집 1채 오답 (관측도 오답)
  assert.equal(
    ringVillageOutcomeNote(ringState('win', 'turns_done'), [{ turn: 7, cities: dayCities(false, true, 'danger', false, 'safe', false) }]),
    '마지막 밤, 먼 4번 집은 틀렸어요. 이 집은 그날 하늘도 잘못 봤어요.',
  )
  // 승리: 먼 집 2채 모두 오답 (둘 다 관측도 오답)
  assert.equal(
    ringVillageOutcomeNote(ringState('win', 'turns_done'), [{ turn: 7, cities: dayCities(false, false, 'safe', false, 'safe', true) }]),
    '마지막 밤, 먼 3·4번 집은 틀렸어요. 이 집들은 그날 하늘도 잘못 봤어요.',
  )
  // 완승/승리: 먼 집 2채 모두 오답 (혼합: 3번 관측 정답, 4번 관측 오답)
  assert.equal(
    ringVillageOutcomeNote(ringState('perfect_win', 'turns_done'), [{ turn: 7, cities: dayCities(false, false, 'danger', false, 'safe', false) }]),
    '마지막 밤, 먼 3번 집은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요. 4번 집은 그날 하늘도 잘못 보고 틀렸어요.',
  )
  // 패배: 먼 집 오답이지만 3명 미달 (관측 정답 / 관측 오답)
  assert.equal(
    ringVillageOutcomeNote(ringState('loss', 'turns_done'), [{ turn: 7, cities: dayCities(true, false, 'danger', true, 'safe', true) }]),
    '마지막 밤, 먼 3번 집은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요. 틀린 주민은 모두 합쳐 3명에 못 미쳤어요.',
  )
  assert.equal(
    ringVillageOutcomeNote(ringState('loss', 'turns_done'), [{ turn: 7, cities: dayCities(true, true, 'danger', false, 'safe', true) }]),
    '마지막 밤, 먼 4번 집은 틀렸어요. 이 집은 그날 하늘도 잘못 봤어요. 틀린 주민은 모두 합쳐 3명에 못 미쳤어요.',
  )
  // 패배: 먼 집 모두 정답
  assert.equal(
    ringVillageOutcomeNote(ringState('loss', 'turns_done'), [{ turn: 7, cities: dayCities(true, true, 'danger', true, 'safe', true) }]),
    '마지막 밤, 직접 쪽지를 못 보낸 먼 집(3·4번 집)은 모두 진짜 날씨를 지켰어요. 양옆 두 집만으로는 3명을 채울 수 없어요.',
  )
  assert.equal(
    scenarioResultNote('ring-village', ringState('win', 'turns_done'), [
      { turn: 7, cities: dayCities(false, false, 'danger', true, 'safe', false), sharing: [] },
    ]),
    '마지막 밤, 먼 3번 집은 하늘을 바로 보고도 이웃 쪽지를 따라 틀렸어요.',
  )
})

test('regainTrustProgress, scenarioGoalMet, scenarioGoalSteps, and regainTrustOutcomeNote match scenario_rates on-off rules', () => {
  const trustState = (outcome, end_reason = 'turns_done') => ({
    config: { ...soloConfig, sensor_error: 0.45, seed: 2 },
    roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'citizen', 5: 'citizen' },
    player_city: 1,
    truth: 'danger',
    outcome,
    end_reason,
  })
  const c = (city, hint, claim, sus, correct) => ({
    city,
    role: 'citizen',
    hint,
    received: { 1: msg(claim) },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 1: sus },
    reason: null,
  })
  const t = (turnNum, cities, vote = null) => ({ turn: turnNum, cities, sharing: [], vote })

  // 1. 40 이상에 도달한 적 없음 (승리해도 목표 미달성)
  const no40 = [
    t(1, [c(2, 'safe', 'stay', 0, false), c(3, 'danger', 'stay', 20, true)]),
    t(7, [c(2, 'safe', 'stay', 0, false), c(3, 'danger', 'stay', 20, false)]),
  ]
  assert.equal(scenarioGoalMet(trustState('perfect_win'), 'regain-trust', no40), false)
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState('perfect_win'), no40), [
    { label: '의심 40 이상', done: false },
    { label: '20 이하로 낮추기', done: false },
    { label: '다시 속이기', done: false },
    { label: '이기기', done: true },
  ])
  assert.equal(scenarioGoalSteps('watchful-eye', trustState('win'), no40), null)
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), no40),
    '판은 이겼지만, 의심도가 40 이상까지 오른 주민이 없었어요. 일부러 의심도를 올린 뒤 다시 낮춰 보세요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), no40),
    '의심도가 40 이상까지 오른 주민이 없었고, 마지막 밤 과반도 속이지 못했어요. 의심도를 올렸다 낮추며 다시 해 보세요.',
  )

  // 2. 40 도달 후 같은 쪽지만 보냈는데 관측 오답으로 우연히 20 이하 하락 (bot 패턴: 세탁 불인정)
  const botLike = [
    t(1, [c(2, 'danger', 'stay', 20, true)]),
    t(2, [c(2, 'danger', 'stay', 40, true)]),
    t(3, [c(2, 'safe', 'stay', 20, false)]),
    t(4, [c(2, 'safe', 'stay', 0, false)]),
  ]
  const botProg = regainTrustProgress(trustState('win'), botLike)
  assert.equal(botProg.reached40?.sus, 40)
  assert.equal(botProg.washedActive, null)
  assert.equal(botProg.washedThenSpiked, null)
  assert.equal(botProg.refooled, null)
  assert.deepEqual(botProg.droppedWithoutSwitch, { city: 2, fromSus: 40, toSus: 20, day: 3 })
  assert.equal(scenarioGoalMet(trustState('win'), 'regain-trust', botLike), false)
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), botLike),
    '판은 이겼지만, 2번 집 의심도가 40에서 20까지 내려갈 때 같은 쪽지만 보냈어요. 쪽지를 바꿔 의심도를 낮춰 보세요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), botLike),
    '2번 집 의심도가 40에서 20까지 내려갈 때 같은 쪽지만 보냈고, 마지막 밤 과반도 속이지 못했어요. 쪽지를 바꿔 의심도를 낮춰 보세요.',
  )

  // 3. 40 이상 도달했지만 20 이하로 낮추지 못함 (처음 40 이상 닿은 날 기준 / 마지막 7일째 경계 구분)
  const stuckHigh = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'evacuate', 60, true)]),
  ]
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState(null), stuckHigh), [
    { label: '의심 40 이상', done: true },
    { label: '20 이하로 낮추기', done: false },
    { label: '다시 속이기', done: false },
    { label: '이기기', done: false },
  ])
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), stuckHigh),
    '판은 이겼지만, 1일째에 의심도가 처음 40 이상(40)이 된 2번 집을 20 이하로 낮추지는 못했어요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), stuckHigh),
    '1일째에 2번 집 의심도가 처음 40 이상(40)이 됐지만 20 이하로 낮추지 못했고, 마지막 밤 과반도 속이지 못했어요.',
  )
  // 회귀: 6일째 40 → 7일째 60이면 처음 닿은 6일째 기준이라 "마지막 7일째에야"가 나오지 않아야 한다
  const stuck6To7 = [
    t(6, [c(2, 'safe', 'evacuate', 40, true)]),
    t(7, [c(2, 'safe', 'evacuate', 60, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), stuck6To7),
    '판은 이겼지만, 6일째에 의심도가 처음 40 이상(40)이 된 2번 집을 20 이하로 낮추지는 못했어요.',
  )
  assert.doesNotMatch(regainTrustOutcomeNote(trustState('loss'), stuck6To7), /마지막 7일째에야/)
  // 회귀: 0,20,60,80,60,80,100(3일째 이미 60) 및 타 집 2일째 40 + 2번 집 7일째 60 모두 가장 이른 40 도달 날 기준
  const stuckEarlyPeakDay7 = [0, 20, 60, 80, 60, 80, 100].map((sus, i) =>
    t(i + 1, [c(2, 'safe', 'evacuate', sus, true)]),
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), stuckEarlyPeakDay7),
    '3일째에 2번 집 의심도가 처음 40 이상(60)이 됐지만 20 이하로 낮추지 못했고, 마지막 밤 과반도 속이지 못했어요.',
  )
  const stuckOtherEarly = [
    t(2, [c(2, 'safe', 'stay', 0, true), c(3, 'safe', 'evacuate', 40, true)]),
    t(7, [c(2, 'safe', 'evacuate', 60, true), c(3, 'safe', 'evacuate', 40, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), stuckOtherEarly),
    '판은 이겼지만, 2일째에 의심도가 처음 40 이상(40)이 된 3번 집을 20 이하로 낮추지는 못했어요.',
  )
  const stuckDay7 = [t(7, [c(2, 'safe', 'evacuate', 40, true)])]
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), stuckDay7),
    '마지막 7일째에야 2번 집 의심도가 40에 닿아 낮출 날이 남지 않았고, 마지막 밤 과반도 속이지 못했어요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), stuckDay7),
    '판은 이겼지만, 마지막 7일째에야 2번 집 의심도가 40에 닿아 낮출 날이 남지 않았어요.',
  )

  // 4. 40 → 쪽지 전환으로 20 이하 세탁 완료, 그러나 거짓 쪽지에 틀린 날 없음 (중간 날 / 마지막 7일째 경계 구분)
  const washedEarlyNoFool = [
    t(1, [c(2, 'safe', 'evacuate', 40, true)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(3, [c(2, 'danger', 'stay', 20, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), washedEarlyNoFool),
    '2일째에 2번 집 의심도를 20까지 낮추고 판도 이겼지만, 그 뒤 2번 집에게 거짓 쪽지를 보낸 날 그 집이 틀린 적은 없었어요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), washedEarlyNoFool),
    '2일째에 2번 집 의심도를 20까지 낮췄지만, 그 뒤 2번 집에게 거짓 쪽지를 보낸 날 그 집이 틀린 적은 없었고 마지막 밤 과반도 채우지 못했어요.',
  )
  // 회귀: 2일째 거짓 세탁(남은 날 있음)과 7일째 진실 세탁(남은 날 없음)이 함께 있으면 남은 날이 있는 2일째 세탁이 우선
  const earlyLieWashBeatsDay7Truth = [
    t(1, [c(2, 'safe', 'evacuate', 40, true), c(5, 'danger', 'stay', 20, true)]),
    t(2, [c(2, 'safe', 'stay', 20, true), c(5, 'danger', 'stay', 20, true)]),
    t(6, [c(2, 'safe', 'stay', 0, true), c(5, 'danger', 'stay', 40, true)]),
    t(7, [c(2, 'safe', 'stay', 0, true), c(5, 'danger', 'evacuate', 20, true)]),
  ]
  assert.equal(regainTrustProgress(trustState('win'), earlyLieWashBeatsDay7Truth).washedActive?.city, 2)
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), earlyLieWashBeatsDay7Truth),
    '2일째에 2번 집 의심도를 20까지 낮추고 판도 이겼지만, 그 뒤 2번 집에게 거짓 쪽지를 보낸 날 그 집이 틀린 적은 없었어요.',
  )
  const washedOnly = [
    t(6, [c(2, 'safe', 'evacuate', 40, true)]),
    t(7, [c(2, 'safe', 'stay', 20, false)]),
  ]
  assert.equal(scenarioGoalMet(trustState('win'), 'regain-trust', washedOnly), false)
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState('win'), washedOnly), [
    { label: '의심 40 이상', done: true },
    { label: '20 이하로 낮추기', done: true },
    { label: '다시 속이기', done: false },
    { label: '이기기', done: true },
  ])
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), washedOnly),
    '마지막 7일째에 2번 집 의심도를 20까지 낮추고 판도 이겼지만, 그 뒤 다시 속일 날이 남지 않았어요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), washedOnly),
    '마지막 7일째에 2번 집 의심도를 20까지 낮췄지만, 그 뒤 다시 속일 날이 남지 않았고 마지막 밤 과반도 채우지 못했어요.',
  )

  // 5. 세탁 후 다시 40 이상이 먼저 되면 이전 세탁의 재기만으로 인정하지 않고 2단계 체크도 해제
  const reSpiked = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(3, [c(2, 'danger', 'stay', 40, true)]),
    t(4, [c(2, 'safe', 'stay', 20, false)]),
  ]
  const reSpikedProg = regainTrustProgress(trustState('win'), reSpiked)
  assert.equal(reSpikedProg.refooled, null)
  assert.equal(reSpikedProg.washedActive, null)
  assert.equal(reSpikedProg.washedThenSpiked?.spikeDay, 3)
  assert.equal(reSpikedProg.washedThenSpiked?.spikeSus, 40)
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState(null), reSpiked), [
    { label: '의심 40 이상', done: true },
    { label: '20 이하로 낮추기', done: false },
    { label: '다시 속이기', done: false },
    { label: '이기기', done: false },
  ])
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), reSpiked),
    '2일째에 2번 집 의심도를 20까지 낮추고 판도 이겼지만, 그 집을 거짓 쪽지로 틀리게 하지 못한 채 3일째에 의심도가 40까지 다시 올랐어요. 다시 할 때는 40 이상으로 올랐다면 20 이하로 낮추는 것부터 다시 하세요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), reSpiked),
    '2일째에 2번 집 의심도를 20까지 낮췄지만, 그 집을 거짓 쪽지로 틀리게 하지 못한 채 3일째에 의심도가 40까지 다시 올랐고 마지막 밤 과반도 채우지 못했어요. 다시 할 때는 40 이상으로 올랐다면 20 이하로 낮추는 것부터 다시 하세요.',
  )
  // 회귀: 이른 세탁 후 재상승한 집과 7일째 세탁한 집이 함께 있으면 이른 재상승 분기를 안내한다
  const earlySpikeBeatsDay7Wash = [
    t(1, [c(2, 'safe', 'evacuate', 40, false), c(5, 'danger', 'stay', 20, true)]),
    t(2, [c(2, 'safe', 'stay', 20, true), c(5, 'danger', 'stay', 20, true)]),
    t(3, [c(2, 'danger', 'stay', 40, true), c(5, 'danger', 'stay', 20, true)]),
    t(6, [c(2, 'danger', 'stay', 40, true), c(5, 'danger', 'stay', 40, true)]),
    t(7, [c(2, 'danger', 'stay', 40, true), c(5, 'danger', 'evacuate', 20, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), earlySpikeBeatsDay7Wash),
    '2일째에 2번 집 의심도를 20까지 낮췄지만, 그 집을 거짓 쪽지로 틀리게 하지 못한 채 3일째에 의심도가 40까지 다시 올랐고 마지막 밤 과반도 채우지 못했어요. 다시 할 때는 40 이상으로 올랐다면 20 이하로 낮추는 것부터 다시 하세요.',
  )

  // 5b. 다턴 세탁(60 stay -> 40 evacuate -> 40 evacuate -> 20 evacuate)은 첫 일치 시점 전환으로 인정
  const multiTurnWash = [
    t(1, [c(2, 'danger', 'stay', 60, true)]),
    t(2, [c(2, 'danger', 'evacuate', 40, true)]),
    t(3, [c(2, 'danger', 'evacuate', 40, true)]),
    t(4, [c(2, 'danger', 'evacuate', 20, true)]),
    t(5, [c(2, 'safe', 'stay', 0, false)]),
  ]
  const multiProg = regainTrustProgress(trustState('win'), multiTurnWash)
  assert.equal(multiProg.droppedWithoutSwitch, null)
  assert.equal(multiProg.refooled?.fromSus, 60)
  assert.equal(multiProg.refooled?.washDay, 4)
  assert.equal(multiProg.refooled?.foolDay, 5)
  assert.equal(scenarioGoalMet(trustState('win'), 'regain-trust', multiTurnWash), true)

  // 5c. 같은 날 세탁한 두 집 중 진실 쪽지로 세탁한 집(5번)을 대표로 우선 선택
  const honestWashPreferred = [
    t(1, [c(2, 'safe', 'evacuate', 40, true), c(5, 'danger', 'stay', 40, true)]),
    t(2, [c(2, 'safe', 'stay', 20, true), c(5, 'danger', 'evacuate', 20, true)]),
    t(4, [c(2, 'safe', 'stay', 0, true), c(5, 'safe', 'stay', 0, false)]),
    t(5, [c(2, 'safe', 'stay', 0, false), c(5, 'safe', 'stay', 0, false)]),
  ]
  const prefHit = regainTrustProgress(trustState('win'), honestWashPreferred).refooled
  assert.equal(prefHit?.city, 5)
  assert.equal(prefHit?.foolDay, 4)

  // 6. 세탁 + 재기만 완료: 패배 / 승리 / 완승 (플레이 중 3단계 체크 확인)
  // 정관측 재기만(하늘은 태풍, 거짓 쪽지 잔류 → foolMatchedHint=false): 기존 문장 유지
  const fullOnOff = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(5, [c(2, 'danger', 'stay', 40, false)]),
  ]
  assert.equal(regainTrustProgress(trustState('win'), fullOnOff).refooled?.foolMatchedHint, false)
  assert.equal(scenarioGoalMet(trustState('loss'), 'regain-trust', fullOnOff), false)
  assert.equal(scenarioGoalMet(trustState('win'), 'regain-trust', fullOnOff), true)
  assert.equal(scenarioGoalMet(trustState('perfect_win'), 'regain-trust', fullOnOff), true)
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState(null), fullOnOff), [
    { label: '의심 40 이상', done: true },
    { label: '20 이하로 낮추기', done: true },
    { label: '다시 속이기', done: true },
    { label: '이기기', done: false },
  ])
  assert.deepEqual(scenarioGoalSteps('regain-trust', trustState('win'), fullOnOff), [
    { label: '의심 40 이상', done: true },
    { label: '20 이하로 낮추기', done: true },
    { label: '다시 속이기', done: true },
    { label: '이기기', done: true },
  ])
  assert.equal(
    regainTrustOutcomeNote(trustState('loss'), fullOnOff),
    '2일째에 2번 집 의심도를 20까지 낮춘 뒤 5일째에 거짓 쪽지를 보냈고 그 집은 틀렸지만, 마지막 밤 과반은 속이지 못했어요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), fullOnOff),
    '2일째에 2번 집 의심도를 40에서 20까지 낮춘 뒤 5일째에 거짓 쪽지를 보냈고 그 집은 틀렸어요. 마지막 밤 과반을 넘겼어요.',
  )
  assert.equal(
    scenarioResultNote('regain-trust', trustState('perfect_win'), fullOnOff),
    '2일째에 2번 집 의심도를 40에서 20까지 낮춘 뒤 5일째에 거짓 쪽지를 보냈고 그 집은 틀렸어요. 마지막 밤 주민 모두를 속였어요.',
  )

  // 7. 조기 재판 / 7일째 마지막 밤 재판 / 내 의심도 60 미만에서 다른 집 의심도로 열린 재판 / 낮추기 성공 후 재판
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), [t(2, [c(2, 'safe', 'evacuate', 60, true)])]),
    '마지막 밤까지 가지 못했어요. 의심도가 60 이상이 되기 전에 본 하늘과 같은 쪽지로 낮추며 다시 해 보세요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), [t(7, [c(2, 'safe', 'evacuate', 60, true)])]),
    '마지막 밤 재판에 걸렸어요. 의심도가 60 이상이 되기 전에 본 하늘과 같은 쪽지로 낮추며 다시 해 보세요.',
  )
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), [t(5, [c(2, 'safe', 'evacuate', 40, true)])]),
    '마지막 밤까지 가지 못했어요. 다른 집 의심도로 열린 재판에서 주민 과반이 나를 지목했어요. 집마다 의심도를 더 낮게 유지하며 다시 해 보세요.',
  )
  const washedThenCaught = [
    t(1, [c(2, 'danger', 'stay', 40, true)]),
    t(2, [c(2, 'danger', 'evacuate', 20, true)]),
    t(5, [c(2, 'danger', 'stay', 60, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), washedThenCaught),
    '2일째에 2번 집 의심도를 낮추는 데는 성공했지만, 마지막 밤까지 가지 못했어요. 의심도가 60 이상이 되기 전에 본 하늘과 같은 쪽지로 낮추며 다시 해 보세요.',
  )
  const washedThenCaughtDay7 = [
    t(1, [c(2, 'danger', 'stay', 40, true)]),
    t(2, [c(2, 'danger', 'evacuate', 20, true)]),
    t(7, [c(2, 'danger', 'stay', 40, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), washedThenCaughtDay7),
    '2일째에 2번 집 의심도를 낮추는 데는 성공했지만, 마지막 밤 재판에 걸렸어요. 다른 집 의심도로 열린 재판에서 주민 과반이 나를 지목했어요. 집마다 의심도를 더 낮게 유지하며 다시 해 보세요.',
  )
  const refooledThenCaught = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(4, [c(2, 'safe', 'stay', 0, false)]),
    t(6, [c(2, 'danger', 'stay', 60, true)]),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('loss', 'caught'), refooledThenCaught),
    '2일째에 2번 집 의심도를 낮추고 4일째에 다시 속이는 데까지는 성공했지만, 마지막 밤까지 가지 못했어요. 의심도가 60 이상이 되기 전에 본 하늘과 같은 쪽지로 낮추며 다시 해 보세요.',
  )
})

test('regainTrustOutcomeNote notes misobserved refool night only when lie matched the citizen hint', () => {
  const trustState = (outcome) => ({
    config: { ...soloConfig, sensor_error: 0.45, seed: 2 },
    roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'citizen', 5: 'citizen' },
    player_city: 1,
    truth: 'danger',
    outcome,
    end_reason: 'turns_done',
  })
  const c = (city, hint, claim, sus, correct) => ({
    city,
    role: 'citizen',
    hint,
    received: { 1: msg(claim) },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 1: sus },
    reason: null,
  })
  const t = (turnNum, cities) => ({ turn: turnNum, cities, sharing: [], vote: null })
  const misobserved = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(5, [c(2, 'safe', 'stay', 0, false)]),
  ]
  assert.equal(regainTrustProgress(trustState('win'), misobserved).refooled?.foolMatchedHint, true)
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), misobserved),
    '2일째에 2번 집 의심도를 40에서 20까지 낮춘 뒤 5일째에 거짓 쪽지를 보냈고 그 집은 틀렸어요. 그날 2번 집은 하늘을 잘못 봐서, 거짓 쪽지가 그 집이 본 하늘과 같았어요. 마지막 밤 과반을 넘겼어요.',
  )
  assert.equal(
    scenarioResultNote('regain-trust', trustState('perfect_win'), misobserved),
    '2일째에 2번 집 의심도를 40에서 20까지 낮춘 뒤 5일째에 거짓 쪽지를 보냈고 그 집은 틀렸어요. 그날 2번 집은 하늘을 잘못 봐서, 거짓 쪽지가 그 집이 본 하늘과 같았어요. 마지막 밤 주민 모두를 속였어요.',
  )
  // 반대 경우(관측이 진짜 날씨)는 관측 문장을 덧붙이지 않는다
  const observedTrue = [
    t(1, [c(2, 'safe', 'evacuate', 40, false)]),
    t(2, [c(2, 'safe', 'stay', 20, true)]),
    t(5, [c(2, 'danger', 'stay', 40, false)]),
  ]
  assert.equal(regainTrustProgress(trustState('win'), observedTrue).refooled?.foolMatchedHint, false)
  assert.doesNotMatch(regainTrustOutcomeNote(trustState('win'), observedTrue), /하늘을 잘못 봐서/)
})

test('regainTrustOutcomeNote notes survived split trial on goal-not-met wins only when suspicion >= 60 triggered a split vote', () => {
  const trustState = (outcome) => ({
    config: { ...soloConfig, sensor_error: 0.45, seed: 2 },
    roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'citizen', 5: 'citizen' },
    player_city: 1,
    truth: 'danger',
    outcome,
    end_reason: 'turns_done',
  })
  const c = (city, hint, claim, sus, correct) => ({
    city,
    role: 'citizen',
    hint,
    received: { 1: msg(claim) },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 1: sus },
    reason: null,
  })
  const t = (turnNum, cities, vote = null) => ({ turn: turnNum, cities, sharing: [], vote })
  const splitVote = { ballots: { 2: 4, 3: 4, 4: 3, 5: 1 }, accused: null, caught: false }

  const botWithSplit = [
    t(1, [c(5, 'danger', 'stay', 20, true)]),
    t(2, [c(5, 'danger', 'stay', 40, true)]),
    t(3, [c(5, 'danger', 'stay', 60, true)], splitVote),
    t(4, [c(5, 'safe', 'stay', 40, true)], splitVote),
    t(5, [c(5, 'safe', 'stay', 20, false)], splitVote),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('perfect_win'), botWithSplit),
    '판은 이겼지만, 5번 집 의심도가 60에서 20까지 내려갈 때 같은 쪽지만 보냈어요. 3일째에는 5번 집 의심도가 60이라 재판이 열렸지만, 지목이 갈려 넘어갔어요. 쪽지를 바꿔 의심도를 낮춰 보세요.',
  )
  // stuck 승리 분기에서도 60 이상 갈린 재판이 있으면 덧붙인다
  const stuckWithSplit = [
    t(2, [c(5, 'danger', 'stay', 40, true)]),
    t(3, [c(5, 'danger', 'stay', 60, true)], splitVote),
  ]
  assert.equal(
    regainTrustOutcomeNote(trustState('win'), stuckWithSplit),
    '판은 이겼지만, 2일째에 의심도가 처음 40 이상(40)이 된 5번 집을 20 이하로 낮추지는 못했어요. 3일째에는 5번 집 의심도가 60이라 재판이 열렸지만, 지목이 갈려 넘어갔어요.',
  )
  // 패배 / 무고 지목 재판 / 내 의심도 60 미만 재판에는 덧붙이지 않는다
  assert.doesNotMatch(regainTrustOutcomeNote(trustState('loss'), botWithSplit), /지목이 갈려/)
  const innocentTrial = [
    t(1, [c(5, 'danger', 'stay', 20, true)]),
    t(2, [c(5, 'danger', 'stay', 40, true)]),
    t(3, [c(5, 'danger', 'stay', 60, true)], { ballots: { 2: 3, 3: 4, 4: 3, 5: 3 }, accused: 3, caught: false }),
    t(5, [c(5, 'safe', 'stay', 20, false)]),
  ]
  assert.doesNotMatch(regainTrustOutcomeNote(trustState('win'), innocentTrial), /지목이 갈려/)
  const otherSusSplit = [
    t(1, [c(5, 'danger', 'stay', 20, true)]),
    t(2, [c(5, 'danger', 'stay', 40, true)], splitVote),
    t(3, [c(5, 'safe', 'stay', 20, false)]),
  ]
  assert.doesNotMatch(regainTrustOutcomeNote(trustState('win'), otherSusSplit), /지목이 갈려/)
})

test('stubbornAllyStatus and stubbornAllyOutcomeNote track colleague survival, peak suspicion, and all 4 outcome branches', () => {
  const allyState = (outcome, end_reason = 'turns_done') => ({
    config: { ...soloConfig, mafia_count: 2, sensor_error: 0.48, seed: 222 },
    roles: { 1: 'citizen', 2: 'player', 3: 'colleague', 4: 'citizen', 5: 'citizen' },
    player_city: 2,
    truth: 'danger',
    outcome,
    end_reason,
  })
  const c = (city, pSus, colSus, correct = false) => ({
    city,
    role: 'citizen',
    hint: 'danger',
    received: { 2: msg('stay'), 3: msg('stay') },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 2: pSus, 3: colSus },
    reason: null,
  })
  const turn = (n, cities, vote = null) => ({ turn: n, cities, sharing: [], vote })

  // HUD 동료 상태 배지: 0 → 의심 상승(ok) → 60 이상(warn) → 재판 발각(caught)
  assert.deepEqual(stubbornAllyStatus(allyState(null), []), { label: '동료 무사', tone: 'ok' })
  assert.deepEqual(stubbornAllyStatus(allyState(null), [turn(2, [c(1, 20, 40)])]), { label: '동료 무사 (지금 의심도 최고 40)', tone: 'ok' })
  assert.deepEqual(stubbornAllyStatus(allyState(null), [turn(4, [c(1, 20, 60)])]), { label: '동료 무사 (지금 의심도 최고 60)', tone: 'warn' })
  const colCaughtTurn = turn(6, [c(1, 60, 60)], { ballots: { 1: 3, 4: 3, 5: 2 }, accused: 3, caught: true })
  assert.deepEqual(stubbornAllyStatus(allyState('loss', 'caught'), [colCaughtTurn]), { label: '동료 재판에 걸림', tone: 'caught' })

  // 1. 동료가 재판에 걸려 끝남 (조기 / 마지막 밤 / 60 미만, 동점 추첨)
  const voteRule = '주민은 저마다 가장 의심하는 집을 지목하고, 과반이 모인 집이 걸려요.'
  const colNote = ` 동료의 의심도는 내 쪽지로 바뀌지 않아요. ${voteRule}`
  // colCaughtTurn: 유일한 주민의 최고 의심도가 나와 동률(60) → 추첨
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss', 'caught'), [colCaughtTurn]),
    `재판에서 같은 거짓말만 되풀이한 동료(3번 집)가 의심도 60에서 지목돼 판이 끝났어요(동점이라 추첨).${colNote}`,
  )
  const colCaughtDay7 = turn(7, [c(1, 40, 80)], { ballots: { 1: 3 }, accused: 3, caught: true })
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss', 'caught'), [colCaughtDay7]),
    `마지막 밤 재판에서 같은 거짓말만 되풀이한 동료(3번 집)가 의심도 80에서 지목돼 판이 끝났어요.${colNote}`,
  )
  const colCaughtLow = turn(5, [c(1, 60, 40), c(4, 20, 40), c(5, 0, 20)], { ballots: { 1: 2, 4: 3, 5: 3 }, accused: 3, caught: true })
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss', 'caught'), [colCaughtLow]),
    `재판에서 같은 거짓말만 되풀이한 동료(3번 집)가 의심도 40에서 지목돼 판이 끝났어요. 60에는 못 미쳤지만, 다른 집 의심도 때문에 재판이 열렸어요.${colNote}`,
  )

  // 2. 내가 재판에 걸려 끝남 (60 이상 / 60 미만 + 동점 추첨)
  const meNote = ` ${voteRule} 집마다 나와 동료의 의심도를 비교하며 다시 해 보세요.`
  const meCaught = turn(3, [c(4, 60, 40)], { ballots: { 4: 2 }, accused: 2, caught: true })
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss', 'caught'), [meCaught]),
    `재판에서 동료(3번 집)가 아니라 내 집이 의심도 60에서 지목됐어요.${meNote}`,
  )
  const meCaughtLow = turn(7, [c(1, 20, 60), c(4, 20, 20), c(5, 0, 0)], { ballots: { 1: 3, 4: 2, 5: 2 }, accused: 2, caught: true })
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss', 'caught'), [meCaughtLow]),
    `마지막 밤 재판에서 동료(3번 집)가 아니라 내 집이 의심도 20에서 지목됐어요(동점이라 추첨). 60에는 못 미쳤지만, 다른 집 의심도 때문에 재판이 열렸어요.${meNote}`,
  )

  const survivedRule = ' 주민은 저마다 가장 의심하는 집을 지목하고, 과반이 모여야 걸려요.'

  // 3. 7일 버텼지만 과반 못 속임 (동료 60 이상 / 미만 구분)
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss'), [turn(7, [c(1, 40, 80, true)])]),
    `동료(3번 집) 의심도가 최고 80까지 오르는 동안 7일을 버텼지만, 마지막 밤 주민 과반(2명)은 속이지 못했어요.${survivedRule}`,
  )
  assert.equal(
    stubbornAllyOutcomeNote(allyState('loss'), [turn(7, [c(1, 20, 40, true)])]),
    '동료(3번 집)도 나도 7일 동안 재판에서 지목되지 않았지만, 마지막 밤 주민 과반(2명)은 속이지 못했어요.',
  )

  // 4. 승리 / 완승 (동료 60+ 먼저 의심 / 동료 더 높음(60 미만) / 동률 이하 / 내 60+)
  assert.equal(
    scenarioResultNote('stubborn-ally', allyState('perfect_win'), [turn(4, [c(5, 20, 60)]), turn(7, [c(1, 40, 80)])]),
    `동료(3번 집) 의심도가 최고 80까지 오르는 동안 내 의심도는 최고 40이었고, 동료도 무사히 남아 마지막 밤 주민 모두를 속였어요.${survivedRule}`,
  )
  assert.equal(
    stubbornAllyOutcomeNote(allyState('win'), [turn(7, [c(1, 20, 40)])]),
    '동료(3번 집) 의심도가 최고 40까지 오르는 동안 내 의심도는 최고 20이었고, 동료도 무사히 남아 마지막 밤 주민 과반을 넘겼어요.',
  )
  assert.equal(
    stubbornAllyOutcomeNote(allyState('win'), [turn(7, [c(1, 20, 20)])]),
    '동료(3번 집)도 나도 재판에서 지목되지 않았고, 마지막 밤 주민 과반을 넘겼어요.',
  )
  assert.equal(
    stubbornAllyOutcomeNote(allyState('win'), [turn(4, [c(1, 60, 80)]), turn(7, [c(1, 40, 60)])]),
    `내 의심도가 최고 60까지 올랐지만 재판에서 지목되지 않았고, 동료도 무사히 남아 마지막 밤 주민 과반을 넘겼어요.${survivedRule}`,
  )
})

test('stubbornAllyOutcomeNote appends majority vote rule only when suspicion reached 60+ without accusation', () => {
  const allyState = (outcome) => ({
    config: { ...soloConfig, mafia_count: 2, sensor_error: 0.48, seed: 222 },
    roles: { 1: 'citizen', 2: 'player', 3: 'colleague', 4: 'citizen', 5: 'citizen' },
    player_city: 2,
    truth: 'danger',
    outcome,
    end_reason: 'turns_done',
  })
  const c = (city, pSus, colSus, correct = false) => ({
    city,
    role: 'citizen',
    hint: 'danger',
    received: { 2: msg('stay'), 3: msg('stay') },
    decision: correct ? 'evacuate' : 'stay',
    correct,
    suspicion: { 2: pSus, 3: colSus },
    reason: null,
  })
  const splitVote = { ballots: { 1: 3, 4: 5, 5: 1 }, accused: null, caught: false }
  const t = (turn, cities, vote = null) => ({ turn, cities, sharing: [], vote })
  const rule = '주민은 저마다 가장 의심하는 집을 지목하고, 과반이 모여야 걸려요.'

  // 동료 60 이상(승리·7일 패배), 나 60 이상(승리·7일 패배) → 지목 규칙 덧붙임
  assert.ok(stubbornAllyOutcomeNote(allyState('win'), [t(7, [c(1, 20, 60)], splitVote)]).endsWith(rule))
  assert.ok(stubbornAllyOutcomeNote(allyState('loss'), [t(7, [c(1, 60, 40, true)], splitVote)]).endsWith(rule))
  assert.ok(stubbornAllyOutcomeNote(allyState('win'), [t(7, [c(1, 60, 40)], splitVote)]).endsWith(rule))
  assert.ok(stubbornAllyOutcomeNote(allyState('loss'), [t(7, [c(1, 20, 60, true)], splitVote)]).endsWith(rule))

  // 둘 다 60 미만(동료가 더 높아도 40 < 60 포함) → 지목 규칙 안 붙임
  assert.ok(!stubbornAllyOutcomeNote(allyState('win'), [t(7, [c(1, 20, 40)])]).includes(rule))
  assert.ok(!stubbornAllyOutcomeNote(allyState('loss'), [t(7, [c(1, 40, 40, true)])]).includes(rule))
})
