import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TONIGHT_SCALE_TITLE, TRAILS, VOTE_ANIM, changedHouses, citizenScales, scaleLeader, scaleText, scaleVoteSummary, clashingPairs, fooledDots, gameSummary, suspicionLinks, suspicionPreview, talkNotes, houseSlots, nightSteps, pairLogScales, pairMid, sharePath, stagedHouses, tally, tonightVotes, tonightVotesText, villageHouses, villageLines, visibleLines, voteAnimDelays, voteItemLabel, worsens,
} from '../src/game/village.ts'

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
})

test('ring connection makes only the two neighbours reachable', () => {
  const ring = villageHouses({ ...state, config: { ...config, connection: 'ring' } }, null)
  assert.deepEqual(ring.filter((h) => h.reachable).map((h) => h.city), [4])
  assert.deepEqual(villageHouses(state, null).filter((h) => h.reachable).map((h) => h.city), [4, 5, 1])
})

test('tally counts ballots per accused city', () => {
  assert.deepEqual(tally({ 1: 3, 4: 3, 5: 1 }), { 3: 2, 1: 1 })
})

test('a contradiction knot appears only when the two houses that meet hear different words', () => {
  assert.deepEqual(clashingPairs([[1, 5], [4, 5]], { 1: 'stay', 4: 'evacuate', 5: 'evacuate' }), [[1, 5]])
  assert.deepEqual(clashingPairs([[1, 5]], { 1: 'stay', 5: 'stay' }), [])
  assert.deepEqual(pairMid(3, 5, 1), [450, 308])
  assert.deepEqual(pairMid(3, 4, 2), [450, 330])
  assert.deepEqual(pairMid(3, 4, 5), [398, 319])
})

test('suspicion preview matches engine game_turn (7.6): ±20, contradiction +20, clamp 0~100, trial at 60', () => {
  // 기대값은 engine/city/logic.py game_turn(hint, {"3": claim}, shared, {"3": from})로 직접 돌려 얻은 값
  const at = (suspicion, hint) => ({ city: 1, hint, suspicion })
  const pairs = [[1, 4]]
  assert.deepEqual(suspicionPreview(at(50, 'danger'), 'stay', [], {}), { from: 50, next: 70, trial: true })
  assert.deepEqual(suspicionPreview(at(30, 'danger'), 'evacuate', [], {}), { from: 30, next: 10, trial: false })
  assert.equal(suspicionPreview(at(10, 'safe'), 'stay', [], {}).next, 0)
  assert.equal(suspicionPreview(at(null, 'safe'), 'evacuate', [], {}).next, 20) // 1턴 전은 0에서
  assert.deepEqual(suspicionPreview(at(50, 'safe'), 'evacuate', pairs, { 4: 'stay' }), { from: 50, next: 90, trial: true })
  assert.equal(suspicionPreview(at(95, 'safe'), 'evacuate', pairs, { 4: 'evacuate' }).next, 100)
  assert.equal(suspicionPreview(at(70, 'danger'), 'evacuate', pairs, { 4: 'stay' }).next, 70)
  // 상대에게 말을 안 보냈거나(ring) 내가 없는 쌍의 모순은 더하지 않는다 (God은 자기 쌍만 shared로 넘긴다)
  assert.equal(suspicionPreview(at(50, 'safe'), 'evacuate', pairs, {}).next, 70)
  assert.equal(suspicionPreview(at(50, 'safe'), 'evacuate', [[4, 5]], { 4: 'stay', 5: 'evacuate' }).next, 70)
  assert.equal(suspicionPreview(at(50, null), 'stay', [], {}), null)
  // 미리보기 색: 100→100 불리는 나쁨, 0→0 유리는 안전
  assert.equal(worsens(suspicionPreview(at(100, 'danger'), 'stay', [], {})), true)
  assert.equal(worsens(suspicionPreview(at(0, 'safe'), 'stay', [], {})), false)
  assert.equal(worsens(suspicionPreview(at(30, 'danger'), 'evacuate', [], {})), false)
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

test('talk notes follow the trail from sender to receiver', () => {
  const notes = talkNotes(3, {
    cities: [
      { city: 4, received: { 3: { claim: 'stay', note: '' }, 5: null, 1: { claim: 'evacuate', note: '' } } },
      { city: 3, received: null },
    ],
  })
  assert.deepEqual(notes.map(({ from, to, claim }) => [from, to, claim]), [[1, 4, 'evacuate'], [3, 4, 'stay']])
  assert.equal(notes[0].path, sharePath(3, 1, 4))
  assert.equal(notes[1].path, sharePath(3, 3, 4))
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

test('trial lines: one accusation per voter, then the verdict', () => {
  const vote = (accused, caught) => villageLines(state, { ...turn, vote: { ballots: { 1: 3, 4: 1 }, accused, caught } })
  const lines = vote(null, false)
  assert.ok(lines.some((l) => l.who === 1 && l.text === '난 3번을 지목할게'))
  assert.ok(lines.some((l) => l.who === 4 && l.text === '난 1번을 지목할게'))
  assert.equal(lines.at(-1).text, '과반이 모이지 않아 아무도 지목되지 않았다')
  assert.equal(vote(1, false).at(-1).text, '1번이 지목됐지만 무고한 주민이었다. 마피아는 아직 숨어 있다')
  assert.equal(vote(3, true).at(-1).text, '3번이 지목됐다. 마피아가 들켰다')
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

  // 눈치·다수결 시민 4명: ③ 단계가 집마다 차례로 1~4 진행, 추가 연출 시간은 2000ms 이내
  const detailed = nightSteps({ vote: null, cities })
  const flagSteps = detailed.filter((s) => s.phase === 'flags')
  assert.deepEqual(flagSteps.map((s) => s.decided), [1, 2, 3, 4])
  const addedMs = detailed.reduce((t, s) => t + s.ms, 0) - 3800
  assert.ok(addedMs > 0 && addedMs <= 2000)

  // 블록 전부 등장 → 깃발 → 불꽃 순으로 겹치지 않고 한 집 단계 시간 안에 끝난다 (블록 1~5개)
  for (const n of [1, 2, 3, 4, 5]) {
    const d = voteAnimDelays(n)
    assert.ok(d.flagDelay >= d.blocksEnd, `flag starts after blocks for n=${n}`)
    assert.ok(d.sparkDelay >= d.flagDelay + VOTE_ANIM.flagMs, `spark starts after flag for n=${n}`)
    assert.ok(d.totalMs <= VOTE_ANIM.stepMs, `fits in stepMs for n=${n}: ${d.totalMs} <= ${VOTE_ANIM.stepMs}`)
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
  assert.equal(s.headline, '6일째 광장 재판에서 들켰어요')
  assert.ok(s.moments.includes('6일째 재판에서 1번, 4번이 나를 지목했어요 (2표, 과반 2표)'))
  assert.ok(s.moments.includes('재판이 1번 열렸어요'))
})

test('game summary: turn 15 counts fooled citizens, first crossing of 60 and caught contradictions', () => {
  const quiet = day(1, { cities: turn.cities.map((c) => (c.suspicion ? { ...c, suspicion: { ...c.suspicion, 3: 10 } } : c)) })
  const hot = day(2, { cities: turn.cities.map((c) => (c.city === 4 ? { ...c, suspicion: { ...c.suspicion, 3: 70 } } : c)), sharing: turn.sharing })
  const s = gameSummary(over('win', 'turns_done'), [quiet, hot, day(15)])
  assert.equal(s.headline, '주민 과반을 끝까지 속였어요')
  assert.ok(s.moments.includes('마지막 15일째에 주민 3명 중 2명이 속았어요 (승리에 2명 필요)'))
  assert.ok(s.moments.includes('2일째 4번의 의심도가 70까지 올라 처음으로 재판 기준 60을 넘었어요'))
  assert.ok(s.moments.includes('쪽지 비교에서 다른 쪽지를 보냈다가 1번 들켰어요 (2일째)'))
  assert.deepEqual(s.peaks, [10, 70, 50])
  assert.match(s.lesson, /같은 쪽지/)

  const lostDay = day(15, {
    cities: turn.cities.map((c) => (c.city === 4 ? { ...c, correct: true } : c)),
  })
  const lost = gameSummary(over('loss', 'turns_done'), [lostDay])
  assert.equal(lost.headline, '15일째에 주민 과반이 속지 않았어요')
  assert.ok(lost.moments.includes('마지막 15일째에 주민 3명 중 1명이 속았어요 (승리에 2명 필요)'))
  assert.equal(lost.lesson, '들키지는 않았지만 주민 과반을 속이지 못했어요. 창문 불이 꺼진 집은 관측이 틀려 속이기 쉬워요.')
  assert.equal(gameSummary(over('perfect_win', 'turns_done'), [day(15)]).headline, '주민 모두를 끝까지 속였어요')
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
  assert.equal(line.summary, '4번 집 대피 280표, 잔류 40표, 대피 쪽이 많아 대피')
  assert.equal(scaleVoteSummary(2, clear), '2번 집 대피 0표, 잔류 100표, 잔류 쪽이 많아 잔류')
  assert.equal(scaleVoteSummary(3, tie), '3번 집 대피 0표, 잔류 0표, 같아서 관측대로 대피')
  assert.deepEqual(scaleLeader(scale), { winner: 'evacuate', side: 'evacuate', label: '대피 쪽이 많아요', aria: '대피 쪽이 많아 대피' })
  assert.deepEqual(scaleLeader(clear), { winner: 'stay', side: 'stay', label: '잔류 쪽이 많아요', aria: '잔류 쪽이 많아 잔류' })
  assert.deepEqual(scaleLeader(tie), { winner: 'tie', side: 'evacuate', label: '같아서 관측대로', aria: '같아서 관측대로 대피' })
  assert.deepEqual(scaleLeader({ total: 0, decision: 'stay' }), { winner: 'tie', side: 'stay', label: '같아서 관측대로', aria: '같아서 관측대로 잔류' })
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
