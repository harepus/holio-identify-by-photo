import { useLayoutEffect, useRef, type KeyboardEvent } from "react";

const OVERLAY = '[role="dialog"], .hid';

function controls(overlay: HTMLElement) {
  return [...overlay.querySelectorAll<HTMLElement>('button, input, a[href], select, textarea, [tabindex]')]
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0);
}

export function useOverlayFocus(kind: string) {
  const stage = useRef<HTMLElement>(null);
  const origin = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && !event.target.closest(OVERLAY)) origin.current = event.target;
    };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);

  useLayoutEffect(() => {
    if (kind === 'none') {
      if (origin.current?.isConnected) origin.current.focus();
      return;
    }
    const overlay = stage.current?.querySelector<HTMLElement>(OVERLAY);
    if (overlay && !overlay.contains(document.activeElement)) controls(overlay)[0]?.focus();
  }, [kind]);

  function onKeyDown(event: KeyboardEvent) {
    if (kind === 'none' || event.key !== 'Tab') return;
    const overlay = stage.current?.querySelector<HTMLElement>(OVERLAY);
    if (!overlay) return;
    const items = controls(overlay);
    const first = items[0];
    const last = items.at(-1);
    const active = document.activeElement;
    if (event.shiftKey ? active === first || !overlay.contains(active) : active === last || !overlay.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    }
  }

  return { stage, onKeyDown };
}
