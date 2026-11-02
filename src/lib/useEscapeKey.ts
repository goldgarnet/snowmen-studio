import { useEffect, useRef } from 'react';

// 창(모달)을 Esc 로 닫는다. 여러 창이 겹치면 가장 나중에 뜬 창만 받는다.
// 창이 떠 있는 동안 Esc 는 뒤의 에디터·플레이 단축키(에디터의 Esc = 도구 해제 등)로 가지
// 않는다 — window 캡처 단계에서 먼저 받고 전파를 막는다. 처리 중(saving·busy)이면 무시하는
// 판단은 onEscape 가 한다.

type Handler = { current: () => void };
const stack: Handler[] = [];
let installed = false;

function onKeyDown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  stack[stack.length - 1].current();
}

export function useEscapeKey(onEscape: () => void, enabled = true): void {
  const handler = useRef(onEscape);
  useEffect(() => { handler.current = onEscape; });
  useEffect(() => {
    if (!enabled) return;
    if (!installed) {
      window.addEventListener('keydown', onKeyDown, true);
      installed = true;
    }
    stack.push(handler);
    return () => {
      const i = stack.lastIndexOf(handler);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [enabled]);
}
