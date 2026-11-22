import assert from 'node:assert/strict'
import test from 'node:test'
import {
  TOP_ARC, clashingPairs, gameSummary, houseSlots, nightSteps, pairMid, sharePath, stagedHouses, tally, villageHouses, villageLines, visibleLines,
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
  assert.equal(sharePath(3, 1, 5), TOP_ARC)
  assert.equal(sharePath(3, 4, 2), sharePath(3, 2, 4))
  assert.match(sharePath(3, 4, 2), /^M230 470 Q.* L502 360 Q.* 670 470$/)
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
  assert.equal(byCity[5].suspicion, null) // 다수결 시민
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
  assert.deepEqual(lines[0], { phase: 'night', kind: 'when', text: '4일째 밤, 1번과 4번이 만났다' })
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
  assert.equal(vote(1, false).at(-1).text, '1번이 지목됐지만 마을 사람이었다. 게임은 계속된다')
  assert.equal(vote(3, true).at(-1).text, '3번이 지목됐다. 사기꾼이 들켰다')
})

test('night steps: night, notes, flags, suspicion, then one step per ballot and the verdict, ending on day', () => {
  assert.deepEqual(nightSteps({ vote: null }).map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'day'])
  const steps = nightSteps({ vote: { ballots: { 1: 3, 4: 1, 5: 3 }, accused: 3, caught: true } })
  assert.deepEqual(steps.map((s) => s.phase), ['night', 'notes', 'flags', 'suspicion', 'trial', 'trial', 'trial', 'verdict', 'day'])
  assert.deepEqual(steps.filter((s) => s.phase === 'trial').map((s) => s.ballots), [1, 2, 3])
  assert.equal(steps.at(-1).ms, 0)
})

test('visible lines follow the step: words in phase order, accusations one at a time', () => {
  const lines = villageLines(state, { ...turn, vote: { ballots: { 1: 3, 4: 1 }, accused: null, caught: false } })
  const steps = nightSteps({ vote: { ballots: { 1: 3, 4: 1 } } })
  assert.deepEqual(texts(visibleLines(lines, steps[0])), ['4일째 밤, 1번과 4번이 만났다'])
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
