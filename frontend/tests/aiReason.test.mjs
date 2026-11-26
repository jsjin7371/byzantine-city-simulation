import assert from 'node:assert/strict'
import test from 'node:test'
import { plainAiReason } from '../src/game/village.ts'

const plain = 'AI 주민이 답하지 못해 눈치 규칙으로 판단했어요.'

test('plainAiReason replaces the engine fallback prefix and hides the error type', () => {
  assert.equal(plainAiReason('[AI 응답 실패(TimeoutError)로 눈치 규칙 대체]'), plain)
  assert.equal(
    plainAiReason('[AI 응답 실패(HTTPError)로 눈치 규칙 대체] 2번이 서로 다른 도시에 다른 말을 했다.'),
    `${plain} 2번이 서로 다른 도시에 다른 말을 했다.`,
  )
  assert.equal(plainAiReason('힌트를 믿었어요.'), '힌트를 믿었어요.')
})
