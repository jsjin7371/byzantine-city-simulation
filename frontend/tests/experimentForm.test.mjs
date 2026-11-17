import assert from 'node:assert/strict'
import test from 'node:test'
import { createExperimentDraft, validateExperimentDraft } from '../src/experimentForm.ts'

const errorsFor = (changes) => validateExperimentDraft({ ...createExperimentDraft(), ...changes })

test('defaults and optional fields are valid, including seed zero', () => {
  assert.deepEqual(errorsFor({}), {})
  assert.deepEqual(errorsFor({ name: '', seed: '0', byzantine_count: '0' }), {})
  assert.deepEqual(errorsFor({ seed: '2147483647', turns: '20', byzantine_count: '5' }), {})
})

test('turns and Byzantine city counts require integers within the specified bounds', () => {
  for (const turns of ['', ' ', '0', '21', '1.5', 'NaN', 'Infinity', '0x10']) {
    assert.ok(errorsFor({ turns }).turns, turns)
  }
  for (const byzantine_count of ['', '-1', '6', '0.5']) {
    assert.ok(errorsFor({ byzantine_count }).byzantine_count, byzantine_count)
  }
  assert.deepEqual(errorsFor({ turns: '1' }), {})
})

test('each percentage allows zero, fractional values and 100, but rejects missing or invalid values', () => {
  for (const field of ['sensor_error', 'drop_rate', 'flip_rate']) {
    for (const value of ['0', '0.25', '.5', '10.', '100']) assert.deepEqual(errorsFor({ [field]: value }), {})
    for (const value of ['', '-0.1', '100.01', 'abc', '1e999', '0x10']) assert.ok(errorsFor({ [field]: value })[field])
  }
})

test('seed is optional but nonempty malformed values cannot silently become a random seed', () => {
  for (const seed of ['-1', '2147483648', '1.5', 'abc', '1e', 'Infinity']) assert.ok(errorsFor({ seed }).seed, seed)
  assert.deepEqual(errorsFor({ seed: '   ' }), {})
})

test('name length matches backend Unicode character counting', () => {
  assert.deepEqual(errorsFor({ name: '가'.repeat(50) }), {})
  assert.ok(errorsFor({ name: '가'.repeat(51) }).name)
  assert.deepEqual(errorsFor({ name: '🌆'.repeat(50) }), {})
  assert.ok(errorsFor({ name: '🌆'.repeat(51) }).name)
})
