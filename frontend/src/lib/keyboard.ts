import type { KeyboardEvent } from 'react'

// role="button"인 SVG 요소를 실제 버튼처럼 Enter·Space로 누를 수 있게 한다.
export const onActivateKey = (action: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    action()
  }
}
