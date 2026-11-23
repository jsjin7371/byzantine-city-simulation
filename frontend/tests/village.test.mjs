import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TOP_ARC, changedHouses, citizenScales, scaleText, clashingPairs, gameSummary, suspicionPreview, talkNotes, houseSlots, nightSteps, pairMid, sharePath, stagedHouses, tally, villageHouses, villageLines, visibleLines, worsens,
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

test('share paths use the forest arc between the top houses, else go through the plaza', () => {
  assert.equal(sharePath(3, 5, 1), TOP_ARC)
  assert.equal(sharePath(3, 1, 5), 'M615 215 Q450 115 285 215') // 반대 방향
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
  assert.deepEqual(pairMid(3, 5, 1), [450, 165])
  assert.deepEqual(pairMid(3, 4, 2), [450, 330])
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
  assert.deepEqual(changedHouses(day), { 1: ['관측 바뀜'], 5: ['쪽지 대조'] })
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
  assert.ok(texts(lines).includes('그치, 나도 태풍이라고 봤어'))
  assert.ok(lines.some((l) => l.who === 1 && l.text === '3번 좀 수상한데. 한 번만 더 그러면 재판이야'))
  assert.ok(texts(lines).includes('4번이 1번을 의심하고 있다'))
  assert.ok(!texts(lines).includes('3번이 이상하다.')) // 눈치 시민은 reason 대신 템플릿
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
  assert.ok(lines.some((l) => l.who === 1 && l.text === '나는 3번을 지목한다'))
  assert.ok(lines.some((l) => l.who === 4 && l.text === '나는 1번을 지목한다'))
  assert.equal(lines.at(-1).text, '과반이 모이지 않아 아무도 지목되지 않았다')
  assert.equal(vote(1, false).at(-1).text, '1번이 지목됐지만 무고한 주민이었다. 게임은 계속된다')
  assert.equal(vote(3, true).at(-1).text, '3번이 지목됐다. 사기꾼이 들켰다')
})

test('night steps: night, notes, flags, suspicion, then one step per ballot and the verdict, ending on day', () => {
  assert.deepEqual(nightSteps({ vote: null }).map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'day'])
  const steps = nightSteps({ vote: { ballots: { 1: 3, 4: 1, 5: 3 }, accused: 3, caught: true } })
  assert.deepEqual(steps.map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'trial', 'trial', 'trial', 'verdict', 'day'])
  assert.deepEqual(steps.filter((s) => s.phase === 'trial').map((s) => s.ballots), [1, 2, 3])
  assert.equal(steps.at(-1).ms, 0)
  assert.equal(nightSteps({ vote: null }).reduce((t, s) => t + s.ms, 0), 3800)
})

test('visible lines follow the step: words in phase order, accusations one at a time', () => {
  const lines = villageLines(state, { ...turn, vote: { ballots: { 1: 3, 4: 1 }, accused: null, caught: false } })
  const steps = nightSteps({ vote: { ballots: { 1: 3, 4: 1 } } })
  assert.deepEqual(texts(visibleLines(lines, steps[0])), ['① 날씨 관측 (4일째, 1번과 4번이 만났다)'])
  assert.ok(!texts(visibleLines(lines, steps[1])).some((t) => t.startsWith('잠깐')))
  assert.ok(texts(visibleLines(lines, steps[3])).some((t) => t.startsWith('잠깐')))
  const firstBallot = texts(visibleLines(lines, steps[4]))
  assert.ok(firstBallot.includes('나는 3번을 지목한다') && !firstBallot.includes('나는 1번을 지목한다'))
  assert.ok(!firstBallot.includes('과반이 모이지 않아 아무도 지목되지 않았다'))
  assert.deepEqual(visibleLines(lines, steps.at(-1)), lines)
})

test('staged houses keep last turn flags and suspicion until their phase, windows show tonight until day', () => {
  const prev = { ...result, cities: result.cities.map((c) => ({ ...c, decision: 'stay', suspicion: c.suspicion && { ...c.suspicion, 3: 0 } })) }
  const tonight = { ...result, cities: result.cities.map((c) => ({ ...c, hint: c.city === 1 ? 'danger' : c.hint })) }
  const at = (phase, p = prev) => Object.fromEntries(stagedHouses(state, p, tonight, phase).map((h) => [h.city, h]))
  assert.equal(at('notes')[1].flag, 'stay')
  assert.equal(at('notes')[1].suspicion, 0)
  assert.equal(at('notes')[1].lit, true) // 오늘 밤 힌트 (태풍 = 정답)
  assert.equal(at('flags')[1].flag, 'evacuate')
  assert.equal(at('flags')[1].suspicion, 0)
  assert.equal(at('suspicion')[1].suspicion, 60)
  assert.equal(at('day')[1].lit, false) // 다음 날 힌트
  assert.equal(at('notes', null)[1].flag, null) // 첫 턴은 깃발 없음
})

const over = (outcome, end_reason) => ({ ...state, outcome, end_reason })
const day = (n, extra = {}) => ({ ...turn, turn: n, sharing: [], vote: null, ...extra })

test('game summary: caught explains who accused me at which trial', () => {
  const caught = day(6, { vote: { ballots: { 1: 3, 4: 3 }, accused: 3, caught: true } })
  const s = gameSummary(over('loss', 'caught'), [day(5), caught])
  assert.equal(s.headline, '6일째 광장 재판에서 들켰다')
  assert.ok(s.moments.includes('6일째 재판에서 1번, 4번이 나를 지목했다 (2표, 과반 2표)'))
  assert.ok(s.moments.includes('재판이 1번 열렸다'))
})

test('game summary: turn 15 counts wrong citizens, first crossing of 60 and caught contradictions', () => {
  const quiet = day(1, { cities: turn.cities.map((c) => (c.suspicion ? { ...c, suspicion: { ...c.suspicion, 3: 10 } } : c)) })
  const hot = day(2, { cities: turn.cities.map((c) => (c.city === 4 ? { ...c, suspicion: { ...c.suspicion, 3: 70 } } : c)), sharing: turn.sharing })
  const s = gameSummary(over('win', 'turns_done'), [quiet, hot, day(15)])
  assert.equal(s.headline, '주민 과반을 끝까지 속였다')
  assert.ok(s.moments.includes('마지막 15일째에 주민 3명 중 2명이 오답을 골랐다 (승리에 2명 필요)'))
  assert.ok(s.moments.includes('2일째 4번의 의심이 70까지 올라 처음으로 재판 기준 60을 넘었다'))
  assert.ok(s.moments.includes('만난 두 주민에게 다른 말을 했다가 1번 들켰다 (2일째)'))
  assert.deepEqual(s.peaks, [10, 70, 50])
  assert.match(s.lesson, /같은 말/)
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

test('scale text reads like the brief and swayed citizens get a "마음을 돌림" line at the flags phase', () => {
  const scale = { parts: [{ from: 'hint', value: 100 }, { from: 2, value: 80 }, { from: 4, value: 100 }, { from: 1, value: -40 }], total: 240, decision: 'evacuate', mine: -40, swayed: false }
  assert.equal(scaleText(scale, 1), '내 관측 +100 · 2번 +80 · 4번 +100 · 너(1번) −40 → 합 +240, 대피')
  const lines = villageLines(state, { turn: 1, cities: result.cities, sharing: [], vote: null }, { 4: { ...scale, swayed: true } })
  const line = lines.find((l) => l.kind === 'scale' && l.who === 4 && l.phase === 'flags')
  assert.equal(line.text, '대피 +240')
  assert.equal(line.detail, scaleText(scale, 3))
  assert.ok(lines.some((l) => l.kind === 'event' && l.good && l.text === '4번 마음을 돌림' && l.phase === 'flags'))
})
