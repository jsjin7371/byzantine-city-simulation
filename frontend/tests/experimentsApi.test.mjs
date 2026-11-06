import assert from 'node:assert/strict'
import test from 'node:test'
import { createExperimentDraft } from '../src/experimentForm.ts'
import { experimentPayload, apiErrorMessage, createExperiment, getExperiment, listExperiments, listTurns, getTurn } from '../src/experimentsApi.ts'

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
