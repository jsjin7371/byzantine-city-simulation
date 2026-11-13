import assert from 'node:assert/strict'
import test from 'node:test'
import { createExperimentDraft } from '../src/experimentForm.ts'
import { experimentPayload, apiErrorMessage, createExperiment, getExperiment, listExperiments, listTurns, getTurn, compareExperiments } from '../src/experimentsApi.ts'

test('request converts percentages and optional values without losing seed zero', () => {
  assert.deepEqual(experimentPayload(createExperimentDraft()), { name: null, turns: 10, byzantine_count: 1, sensor_error: .1, drop_rate: 0, flip_rate: 0, seed: null })
  const payload = experimentPayload({ ...createExperimentDraft(), sensor_error: '12.5', drop_rate: '100', flip_rate: '0.5', seed: '0', name: ' 검증 ' })
  assert.equal(payload.sensor_error, .125)
  assert.equal(payload.drop_rate, 1)
  assert.equal(payload.flip_rate, .005)
  assert.equal(payload.seed, 0)
  assert.equal(payload.name, '검증')
})

test('API error detail supports strings, validation arrays and unexpected content', () => {
  assert.equal(apiErrorMessage('not found'), 'not found')
  assert.equal(apiErrorMessage([{ loc: ['body', 'turns'], msg: 'invalid' }]), 'turns: invalid')
  assert.equal(apiErrorMessage([null, {}]), '서버가 요청을 처리하지 못했습니다.')
})

test('HTTP errors and malformed success responses are not treated as an experiment', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ detail: 'invalid config' }), { status: 422 }))
  await assert.rejects(createExperiment(createExperimentDraft(), new AbortController().signal), /invalid config/)
  fetchMock.mock.mockImplementation(async () => new Response('<html>proxy error</html>', { status: 502 }))
  await assert.rejects(getExperiment(1, new AbortController().signal), /502/)
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ status: 'ok' })))
  await assert.rejects(getExperiment(1, new AbortController().signal), /응답 형식/)
})

test('creation rejection preserves backend messages without a duplicate warning', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch')
  const cases = [
    { status: 409, detail: '이미 실행 중인 실험(#8)이 있습니다. 끝난 뒤 다시 실행해 주세요.' },
    { status: 422, detail: '비잔틴 도시 수가 범위를 벗어났습니다.' },
    { status: 422, detail: [{ loc: ['body', 'turns'], msg: 'invalid' }] },
  ]
  for (const { status, detail } of cases) {
    fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ detail }), { status }))
    await assert.rejects(createExperiment(createExperimentDraft(), new AbortController().signal), {
      message: apiErrorMessage(detail),
    })
  }
  assert.equal(fetchMock.mock.callCount(), cases.length)
})

test('uncertain creation warns to check the list and never retries automatically', async (context) => {
  const fetchMock = context.mock.method(globalThis, 'fetch')
  const failures = [
    async () => { throw new TypeError('Failed to fetch') },
    async () => { throw new DOMException('Timed out', 'TimeoutError') },
    async () => new Response(JSON.stringify({ detail: '저장 처리 중 오류가 발생했습니다.' }), { status: 500 }),
    async () => new Response('<html>proxy error</html>', { status: 502 }),
    async () => new Response('{}', { status: 202 }),
    async () => new Response('invalid JSON', { status: 202 }),
  ]
  for (const failure of failures) {
    fetchMock.mock.mockImplementation(failure)
    await assert.rejects(createExperiment(createExperimentDraft(), new AbortController().signal), /실험이 생성되었을 수 있으므로 실험 목록을 확인한 뒤/)
  }
  assert.equal(fetchMock.mock.callCount(), failures.length)
})

test('successful creation and stored Korean engine errors are returned intact', async (context) => {
  const experiment = { id: 8, status: 'pending', config: { turns: 5 }, completed_turns: 0, error: null }
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(experiment), { status: 202 }))
  const signal = new AbortController().signal
  assert.deepEqual(await createExperiment(createExperimentDraft(), signal), experiment)
  const failed = { ...experiment, status: 'failed', error: '도시 3에 연결하지 못해 실험을 시작하지 못했습니다.' }
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify(failed)))
  assert.deepEqual(await getExperiment(8, signal), failed)
})

test('result requests use pagination and reject data for a different experiment or turn', async (context) => {
  const signal = new AbortController().signal
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response('[]'))
  assert.deepEqual(await listExperiments(50, signal), [])
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/experiments?limit=50&offset=50')
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ experiment_id: 2, turns: [] })))
  await assert.rejects(listTurns(1, signal), /응답 형식/)
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ experiment_id: 1, turn: 3, cities: [] })))
  await assert.rejects(getTurn(1, 2, signal), /응답 형식/)
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ detail: 'results are not ready' }), { status: 409 }))
  await assert.rejects(listTurns(1, signal), /results are not ready/)
})

test('comparison repeats ids, preserves A/B order and rejects duplicate selection before requesting', async (context) => {
  const row = (id) => ({ id, name: null, config: { turns: 1 }, mean_accuracy: 1, accuracy: [{ turn: 1, truth: 'safe', accuracy: 1 }] })
  const fetchMock = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ experiments: [row(2), row(1)] })))
  const signal = new AbortController().signal
  await assert.rejects(compareExperiments(1, 1, signal), /서로 다른/)
  assert.equal(fetchMock.mock.callCount(), 0)
  assert.deepEqual((await compareExperiments(1, 2, signal)).map((item) => item.id), [1, 2])
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/experiments/compare?ids=1&ids=2')
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ experiments: [row(1), row(3)] })))
  await assert.rejects(compareExperiments(1, 2, signal), /응답 형식/)
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ detail: 'not completed' }), { status: 409 }))
  await assert.rejects(compareExperiments(1, 2, signal), /not completed/)
})
