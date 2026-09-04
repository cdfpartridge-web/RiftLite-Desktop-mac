import { useCallback, useEffect, useRef } from "react";
import { createOwnedPointerGesture, type OwnedPointerGesture } from "./ownedPointerGesture";

export function useOwnedPointerGesture() {
  const gesture = useRef<OwnedPointerGesture | null>(null);
  useEffect(() => () => {
    gesture.current?.cancel();
    gesture.current = null;
  }, []);
  const start = useCallback((input: Parameters<OwnedPointerGesture["start"]>[0]) => {
    gesture.current ??= createOwnedPointerGesture(window);
    gesture.current.start(input);
  }, []);
  const cancel = useCallback(() => gesture.current?.cancel(), []);
  return { start, cancel };
}
