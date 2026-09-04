export type PointerGestureTarget = Pick<HTMLElement, "addEventListener" | "removeEventListener">
  & Partial<Pick<HTMLElement, "setPointerCapture" | "releasePointerCapture">>;

export type OwnedPointerGesture = {
  start(input: {
    target: PointerGestureTarget;
    pointerId: number;
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
    onCancel: () => void;
  }): void;
  cancel(): void;
};

/** Owns one gesture's global listeners, including when its React panel disappears. */
export function createOwnedPointerGesture(owner: Pick<Window, "addEventListener" | "removeEventListener">): OwnedPointerGesture {
  let cancel: (() => void) | null = null;
  return {
    start(input) {
      cancel?.();
      let active = true;
      const cleanup = () => {
        if (!active) return;
        active = false;
        cancel = null;
        owner.removeEventListener("pointermove", onMove, true);
        owner.removeEventListener("pointerup", onEnd, true);
        owner.removeEventListener("pointercancel", onEnd, true);
        input.target.removeEventListener("lostpointercapture", onLostCapture);
        try {
          input.target.releasePointerCapture?.(input.pointerId);
        } catch {
          // A detached target or an already-ended pointer no longer owns capture.
        }
      };
      const cancelGesture = () => {
        if (!active) return;
        cleanup();
        input.onCancel();
      };
      const onMove = (event: PointerEvent) => {
        if (active && event.pointerId === input.pointerId) input.onMove(event);
      };
      const onEnd = (event: PointerEvent) => {
        if (!active || event.pointerId !== input.pointerId) return;
        cleanup();
        input.onEnd(event);
      };
      const onLostCapture = (event: PointerEvent) => {
        if (event.pointerId === input.pointerId) cancelGesture();
      };
      cancel = cancelGesture;
      owner.addEventListener("pointermove", onMove, true);
      owner.addEventListener("pointerup", onEnd, true);
      owner.addEventListener("pointercancel", onEnd, true);
      input.target.addEventListener("lostpointercapture", onLostCapture);
      try {
        input.target.setPointerCapture?.(input.pointerId);
      } catch {
        // Window listeners still finish the gesture when capture is unavailable.
      }
    },
    cancel() { cancel?.(); }
  };
}
