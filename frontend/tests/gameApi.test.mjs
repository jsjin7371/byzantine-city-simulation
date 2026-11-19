import assert from 'node:assert/strict'
import test from 'node:test'
import { claimTargets, defaultClaims, createGame, getGame, playTurn } from '../src/gameApi.ts'

const config = { connection: 'all', citizen_type: 'wary', memory: 'turn', share_mode: 'pairs', share_pairs: 1, mafia_count: 2, player: 'human', sensor_error: 0.4, seed: 1 }
const state = {
  game_id: 7, config, truth: 'danger', player_city: 1, turn: 0, game_over: false, outcome: null, end_reason: null,
  roles: { 1: 'player', 2: 'citizen', 3: 'citizen', 4: 'colleague', 5: 'citizen' },
  next_hints: { 2: 'danger', 3: 'safe', 5: 'danger' }, bot_win_rate: 0.57,
}

test('claim targets are neighbouring citizens only', () => {
  assert.deepEqual(claimTargets(state), [2, 3, 5])
  assert.deepEqual(claimTargets({ ...state, config: { ...config, connection: 'ring' } }), [2, 5])
  const ring3 = { ...state, player_city: 3, roles: { 1: 'citizen', 2: 'colleague', 3: 'player', 4: 'citizen', 5: 'citizen' }, config: { ...config, connection: 'ring' } }
  assert.deepEqual(claimTargets(ring3), [4])
  assert.deepEqual(defaultClaims(state), { 2: 'stay', 3: 'stay', 5: 'stay' })
  assert.deepEqual(defaultClaims({ ...state, truth: 'safe' }), { 2: 'evacuate', 3: 'evacuate', 5: 'evacuate' })
})

test('createGame posts the difficulty preset and validates the state', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(state), { status: 201 }))
  assert.deepEqual(await createGame('easy'), state)
  const [url, options] = fetchMock.mock.calls[0].arguments
  assert.equal(url, '/api/games')
  assert.equal(options.method, 'POST')
  assert.deepEqual(JSON.parse(options.body), { mafia_count: 2, sensor_error: 0.4, citizen_type: 'wary' })
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(state), { status: 201 }))
  await createGame('hard', 'majority')
  assert.deepEqual(JSON.parse(fetchMock.mock.calls[1].arguments[1].body), { mafia_count: 1, sensor_error: 0.2, citizen_type: 'majority' })
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ detail: '실험이 실행 중입니다.' }), { status: 409 }))
  await assert.rejects(createGame('easy'), /실험이 실행 중/)
  fetchMock.mock.mockImplementation(async () => new Response('{}', { status: 201 }))
  await assert.rejects(createGame('easy'), /응답 형식/)
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(state)))
  await assert.rejects(getGame(8), /응답 형식/)
})

test('playTurn wraps claims in message objects and rejects a different turn', async (context) => {
  const result = { game_id: 7, turn: 1, truth: 'danger', accuracy: 0.5, cities: [], sharing: [], vote: null, game_over: false, outcome: null, end_reason: null, next_hints: {} }
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(result)))
  assert.deepEqual(await playTurn(7, 1, { 2: 'stay', 3: 'evacuate' }), result)
  const [url, options] = fetchMock.mock.calls[0].arguments
  assert.equal(url, '/api/games/7/turns')
  assert.deepEqual(JSON.parse(options.body), { turn: 1, claims: { 2: { claim: 'stay', note: '' }, 3: { claim: 'evacuate', note: '' } } })
  await assert.rejects(playTurn(7, 2, {}), /응답 형식/)
})
