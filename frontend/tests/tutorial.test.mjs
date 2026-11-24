import assert from 'node:assert/strict'
import test from 'node:test'
import { TUTORIAL_SEED, TUTORIAL_STEPS, tutorialStep } from '../src/game/village.ts'

test('tutorialStep progresses across 3 days based on turn, animation, note card, and game over', () => {
  assert.equal(TUTORIAL_SEED, 15)
  assert.equal(TUTORIAL_STEPS.length, 10)
  // 문구에 숫자(1/10 등)가 들어가지 않는다
  for (const s of TUTORIAL_STEPS) assert.doesNotMatch(s.text, /\d/)

  const day1 = { turn: 0, playing: false, cardOpen: false, gameOver: false }
  // 1일 낮: 하늘 → 창문 불빛 → 집(쪽지 카드 열림 대기)
  assert.equal(tutorialStep(0, day1).step?.highlight, 'sky')
  assert.equal(tutorialStep(1, day1).step?.highlight, 'windows')
  const waitCard = tutorialStep(2, day1)
  assert.equal(waitCard.step?.highlight, 'houses')
  assert.equal(waitCard.step?.wait, 'card')

  // 쪽지 카드가 열리면 자동으로 4단계(의심도 막대)로 진행, 이후 카드를 닫아도 유지
  const opened = tutorialStep(2, { ...day1, cardOpen: true })
  assert.equal(opened.cursor, 3)
  assert.equal(opened.step?.highlight, 'suspicion')
  assert.equal(tutorialStep(opened.cursor, day1).step?.highlight, 'suspicion')

  // 점선 → 밤으로 버튼(턴 제출 대기)
  assert.equal(tutorialStep(4, day1).step?.highlight, 'share')
  const waitTurn = tutorialStep(5, day1)
  assert.equal(waitTurn.step?.highlight, 'submit')
  assert.equal(waitTurn.step?.wait, 'turn')

  // 1일 밤 연출 중에는 안내 숨김, 끝나면 7단계(깃발) → 8단계(마을 이야기) → 9단계(달라진 집 표시)
  const night1 = tutorialStep(5, { turn: 1, playing: true, cardOpen: false, gameOver: false })
  assert.equal(night1.cursor, 6)
  assert.equal(night1.step, null)

  const day2 = { turn: 1, playing: false, cardOpen: false, gameOver: false }
  assert.equal(tutorialStep(night1.cursor, day2).step?.highlight, 'flags')
  assert.equal(tutorialStep(7, day2).step?.highlight, 'log')
  assert.equal(tutorialStep(8, day2).step?.highlight, 'changed')

  // 9단계 다음 → 안내 숨기고 3일 밤 끝날 때까지 자유 진행
  assert.equal(tutorialStep(9, day2).step, null)
  assert.equal(tutorialStep(9, { turn: 2, playing: true, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(9, { turn: 2, playing: false, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(9, { turn: 3, playing: true, cardOpen: false, gameOver: false }).step, null)

  // 3일 밤 연출이 끝난 뒤: 마지막 단계(대상 없음, 이어서 하기 / 시작 화면으로)
  const end = tutorialStep(9, { turn: 3, playing: false, cardOpen: false, gameOver: false })
  assert.equal(end.step?.highlight, null)
  assert.equal(end.step?.finish, true)

  // 4일째 이후에는 안내 종료
  assert.equal(tutorialStep(9, { turn: 4, playing: false, cardOpen: false, gameOver: false }).step, null)

  // 1일 낮에 단계를 덜 눌러도 밤을 넘기면 2일 안내로, 2일째 밤을 넘기면 3일 끝 대기로 건너뛴다
  assert.equal(tutorialStep(0, day2).step?.highlight, 'flags')
  assert.equal(tutorialStep(6, { turn: 2, playing: false, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(6, { turn: 3, playing: false, cardOpen: false, gameOver: false }).step?.finish, true)

  // 지난밤 넘겨보기 중에는 커서를 유지하되 단계 표시와 강조를 숨긴다
  const past = tutorialStep(9, { turn: 3, playing: false, cardOpen: false, gameOver: false, viewingPast: true })
  assert.equal(past.cursor, 9)
  assert.equal(past.step, null)
  assert.equal(tutorialStep(past.cursor, { turn: 3, playing: false, cardOpen: false, gameOver: false, viewingPast: false }).step?.finish, true)

  // 튜토리얼 중 게임이 끝나면(재판 발각 등) 안내를 끈다
  const caught = tutorialStep(4, { turn: 2, playing: false, cardOpen: false, gameOver: true })
  assert.equal(caught.step, null)
  assert.equal(caught.cursor, TUTORIAL_STEPS.length)
})
