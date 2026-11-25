// 엔진(engine/city/ai.py)이 AI 응답 실패 때 붙이는 접두어를 화면용 쉬운 문장으로 바꾼다. 오류 종류는 숨긴다.
export const plainAiReason = (reason: string) =>
  reason.replace(/^\[AI 응답 실패\([^)]*\)로 눈치 규칙 대체\]/, 'AI 주민이 답하지 못해 눈치 규칙으로 판단했어요.')
