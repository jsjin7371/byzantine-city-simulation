import assert from 'node:assert/strict'
import test from 'node:test'
import { TUTORIAL_SEED, TUTORIAL_STEPS, splitSentences, tutorialStep } from '../src/game/village.ts'

test('splitSentences breaks on sentence-ending punctuation without changing text', () => {
  assert.deepEqual(splitSentences(''), [])
  assert.deepEqual(splitSentences('한 문장만 있어요.'), ['한 문장만 있어요.'])
  assert.deepEqual(splitSentences('질문인가요? 감탄이에요! 끝이에요.'), ['질문인가요?', '감탄이에요!', '끝이에요.'])
  for (const s of TUTORIAL_STEPS) {
    const parts = splitSentences(s.text)
    assert.ok(parts.length >= 1)
    assert.equal(parts.join(' '), s.text)
  }
})

test('tutorialStep progresses across 3 days based on turn, animation, note card, scale toggle, and game over', () => {
  assert.equal(TUTORIAL_SEED, 15)
  assert.equal(TUTORIAL_STEPS.length, 14)
  // 문구에 숫자(1/14 등)가 들어가지 않는다
  for (const s of TUTORIAL_STEPS) assert.doesNotMatch(s.text, /\d/)

  const day1 = { turn: 0, playing: false, cardOpen: false, scaleOpen: false, gameOver: false }
  // 1일 낮: 하늘 → 창문 불빛 → 집(쪽지 카드 열림 대기)
  assert.equal(tutorialStep(0, day1).step?.highlight, 'sky')
  const windowsStep = tutorialStep(1, day1)
  assert.equal(windowsStep.step?.highlight, 'windows')
  assert.match(windowsStep.step?.text ?? '', /집 아래 꼬리표.*오늘 밤 관측/)
  assert.equal(splitSentences(windowsStep.step?.text ?? '').length, 4)
  const waitCard = tutorialStep(2, day1)
  assert.equal(waitCard.step?.highlight, 'houses')
  assert.equal(waitCard.step?.wait, 'card')

  // 쪽지 카드가 열리면 자동으로 의심도 단계로 진행, 이후 카드를 닫아도 유지
  const opened = tutorialStep(2, { ...day1, cardOpen: true })
  assert.equal(opened.cursor, 3)
  assert.equal(opened.step?.highlight, 'suspicion')
  assert.match(opened.step?.text ?? '', /내려가고, 다르면 올라가요/)
  assert.equal(tutorialStep(opened.cursor, day1).step?.highlight, 'suspicion')

  // 카드를 이미 열어 둔 상태면 창문 단계에서 다음으로 넘어갈 때 카드 대기 단계를 건너뛰고 바로 의심도 단계가 된다
  const withOpenCard = { ...day1, cardOpen: true }
  assert.equal(tutorialStep(tutorialStep(1, withOpenCard).cursor + 1, withOpenCard).step?.highlight, 'suspicion')

  // 마을 이야기 위 "오늘 밤 저울" → 점선 → 밤으로 버튼(턴 제출 대기)
  const votesStep = tutorialStep(4, day1)
  assert.equal(votesStep.step?.highlight, 'votes')
  assert.match(votesStep.step?.text ?? '', /어떻게 계산됐는지는 마을 이야기 위 '오늘 밤 저울'에서 볼 수 있어요\./)
  assert.match(votesStep.step?.text ?? '', /의심하는 집에서 온 쪽지는 더 적게 반영/)
  assert.doesNotMatch(votesStep.step?.text ?? '', /카드 아래|블록/)
  assert.equal(splitSentences(votesStep.step?.text ?? '').length, 3)
  const shareStep = tutorialStep(5, day1)
  assert.equal(shareStep.step?.highlight, 'share')
  assert.match(shareStep.step?.text ?? '', /해당하는 두 집에 다른 쪽지를 보내면/)
  assert.equal(splitSentences(shareStep.step?.text ?? '').length, 2)
  const waitTurn = tutorialStep(6, day1)
  assert.equal(waitTurn.step?.highlight, 'submit')
  assert.equal(waitTurn.step?.wait, 'turn')

  // 1일 밤 연출 중에는 안내 숨김, 끝나면 깃발 → 의심 선 안내 → 마을 이야기 → › 버튼 대기 → 달라진 집 표시
  const night1 = tutorialStep(6, { turn: 1, playing: true, cardOpen: false, scaleOpen: false, gameOver: false })
  assert.equal(night1.cursor, 7)
  assert.equal(night1.step, null)

  const day2 = { turn: 1, playing: false, cardOpen: false, scaleOpen: false, gameOver: false }
  const flagsStep = tutorialStep(night1.cursor, day2)
  assert.equal(flagsStep.step?.highlight, 'flags')
  assert.match(flagsStep.step?.text ?? '', /많은 쪽으로 깃발/)
  assert.equal(splitSentences(flagsStep.step?.text ?? '').length, 2)
  assert.equal(tutorialStep(8, day2).step?.highlight, null)
  assert.match(tutorialStep(8, day2).step?.text ?? '', /의심하는 선/)
  assert.match(tutorialStep(8, day2).step?.text ?? '', /터치 화면에서는 위의 '의심선 보기'를 눌러요\./)
  assert.match(tutorialStep(8, day2).step?.text ?? '', /나를 의심하는 집에서만, 내 집으로 가는 선이 보여요\./)
  assert.equal(tutorialStep(9, day2).step?.highlight, 'log')
  const waitScale = tutorialStep(10, day2)
  assert.equal(waitScale.step?.highlight, 'scale')
  assert.equal(waitScale.step?.wait, 'scale')

  // › 버튼을 실제로 펼치면 다음 단계(달라진 집 표시)로 진행, 이후 접어도 유지
  const scaleExpanded = tutorialStep(10, { ...day2, scaleOpen: true })
  assert.equal(scaleExpanded.cursor, 11)
  assert.equal(scaleExpanded.step?.highlight, 'changed')
  assert.equal(tutorialStep(scaleExpanded.cursor, day2).step?.highlight, 'changed')

  // 이미 펼쳐 둔 상태면 마을 이야기 단계에서 다음을 누를 때 대기 단계를 건너뛰고 달라진 집 표시로 간다
  const withOpenScale = { ...day2, scaleOpen: true }
  assert.equal(tutorialStep(tutorialStep(9, withOpenScale).cursor + 1, withOpenScale).step?.highlight, 'changed')

  // 연출 중이나 지난밤 보기 중에는 scaleOpen이 true여도 단계를 넘기지 않는다
  assert.equal(tutorialStep(10, { ...day2, playing: true }).cursor, 10)
  assert.equal(tutorialStep(10, { ...day2, playing: true }).step, null)
  assert.equal(tutorialStep(10, { ...day2, scaleOpen: true, playing: true }).cursor, 10)
  assert.equal(tutorialStep(10, { ...day2, scaleOpen: true, playing: true }).step, null)
  assert.equal(tutorialStep(10, { ...day2, scaleOpen: true, viewingPast: true }).cursor, 10)
  assert.equal(tutorialStep(10, { ...day2, scaleOpen: true, viewingPast: true }).step, null)

  // 2일 마지막 단계 다음 → 안내 숨기고 3일 밤 끝날 때까지 자유 진행
  assert.equal(tutorialStep(12, day2).step, null)
  assert.equal(tutorialStep(12, { turn: 2, playing: true, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(12, { turn: 2, playing: false, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(12, { turn: 3, playing: true, cardOpen: false, gameOver: false }).step, null)

  // 3일 밤 연출이 끝난 뒤: 주민 종류 안내(다수결·AI) → 마지막 종료 단계(이어서 하기 / 시작 화면으로)
  const day3 = { turn: 3, playing: false, cardOpen: false, gameOver: false }
  const rolesStep = tutorialStep(12, day3)
  assert.equal(rolesStep.step?.highlight, null)
  assert.equal(rolesStep.step?.closing, true)
  assert.match(rolesStep.step?.text ?? '', /다수결 주민.*한 표.*재판/)
  assert.match(rolesStep.step?.text ?? '', /AI 주민.*스스로 판단/)
  assert.equal(splitSentences(rolesStep.step?.text ?? '').length, 3)

  const end = tutorialStep(13, day3)
  assert.equal(end.step?.highlight, null)
  assert.equal(end.step?.finish, true)
  assert.doesNotMatch(end.step?.text ?? '', /이론 실험실|시나리오/)
  assert.equal(splitSentences(end.step?.text ?? '').length, 2)

  // 4일째 이후에는 안내 종료
  assert.equal(tutorialStep(12, { turn: 4, playing: false, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(13, { turn: 4, playing: false, cardOpen: false, gameOver: false }).step, null)

  // 1일 낮에 단계를 덜 눌러도 밤을 넘기면 2일 안내로, 2일째 밤을 넘기면 3일 끝 마무리(주민 종류 안내)로 건너뛴다
  assert.equal(tutorialStep(0, day2).step?.highlight, 'flags')
  assert.equal(tutorialStep(7, { turn: 2, playing: false, cardOpen: false, gameOver: false }).step, null)
  assert.equal(tutorialStep(7, day3).step?.closing, true)

  // 지난밤 넘겨보기 중에는 커서를 유지하되 단계 표시와 강조를 숨긴다
  const past = tutorialStep(13, { ...day3, viewingPast: true })
  assert.equal(past.cursor, 13)
  assert.equal(past.step, null)
  assert.equal(tutorialStep(past.cursor, day3).step?.finish, true)

  // 튜토리얼 중 게임이 끝나면(재판 발각 등) 안내를 끈다
  const caught = tutorialStep(4, { turn: 2, playing: false, cardOpen: false, gameOver: true })
  assert.equal(caught.step, null)
  assert.equal(caught.cursor, TUTORIAL_STEPS.length)
})
