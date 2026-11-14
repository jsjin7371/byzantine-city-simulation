// API·네트워크 오류를 화면 문구로 바꾼다. Error가 아니면 호출부의 기본 문구를 쓴다.
export const errorMessage = (cause: unknown, fallback: string) =>
  cause instanceof Error ? cause.message : fallback
