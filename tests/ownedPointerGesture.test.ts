import { describe, expect, it, vi } from "vitest";
import { createOwnedPointerGesture } from "../src/renderer/ownedPointerGesture";

function pointerEvent(type: string, pointerId = 7): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  return event as PointerEvent;
}

function harness() {
  const owner = new EventTarget();
  const target = Object.assign(new EventTarget(), {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn()
  });
  const add = vi.spyOn(owner, "addEventListener");
  const remove = vi.spyOn(owner, "removeEventListener");
  const removeTarget = vi.spyOn(target, "removeEventListener");
  const onMove = vi.fn();
  const onEnd = vi.fn();
  const onCancel = vi.fn();
  const gesture = createOwnedPointerGesture(owner as unknown as Window);
  const input = { target: target as unknown as HTMLElement, pointerId: 7, onMove, onEnd, onCancel };
  return { owner, target, add, remove, removeTarget, onMove, onEnd, onCancel, gesture, input };
}

describe("owned pointer gesture", () => {
  it("forwards only the active pointer and removes every listener before finishing", () => {
    const h = harness();
    h.gesture.start(h.input);
    expect(h.target.setPointerCapture).toHaveBeenCalledWith(7);
    h.owner.dispatchEvent(pointerEvent("pointermove", 8));
    h.owner.dispatchEvent(pointerEvent("pointerup", 8));
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onEnd).not.toHaveBeenCalled();
    h.owner.dispatchEvent(pointerEvent("pointermove"));
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.onCancel).not.toHaveBeenCalled();
    expect(h.remove.mock.calls).toEqual(h.add.mock.calls);
    expect(h.removeTarget).toHaveBeenCalledWith("lostpointercapture", expect.any(Function));
    expect(h.target.releasePointerCapture).toHaveBeenCalledWith(7);
    h.owner.dispatchEvent(pointerEvent("pointermove"));
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("preserves the finish callback on pointercancel for existing panel persistence", () => {
    const h = harness();
    h.gesture.start(h.input);
    h.owner.dispatchEvent(pointerEvent("pointercancel"));
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledTimes(3);
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onEnd).toHaveBeenCalledTimes(1);
  });

  it("cancels on unmount without invoking persistence or pill-click finish actions", () => {
    const h = harness();
    h.gesture.start(h.input);
    h.gesture.cancel();
    h.gesture.cancel();
    h.owner.dispatchEvent(pointerEvent("pointermove"));
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(h.onMove).not.toHaveBeenCalled();
    expect(h.onEnd).not.toHaveBeenCalled();
    expect(h.remove).toHaveBeenCalledTimes(3);
    expect(h.target.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it("cancels lost capture and handles release events without recursive callbacks", () => {
    const h = harness();
    h.target.releasePointerCapture.mockImplementation(() => h.target.dispatchEvent(pointerEvent("lostpointercapture")));
    h.gesture.start(h.input);
    h.target.dispatchEvent(pointerEvent("lostpointercapture", 8));
    expect(h.onCancel).not.toHaveBeenCalled();
    h.target.dispatchEvent(pointerEvent("lostpointercapture"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledTimes(3);
    expect(h.onEnd).not.toHaveBeenCalled();
  });

  it("replaces an active drag with one owned resize session", () => {
    const h = harness();
    const resized = vi.fn();
    h.gesture.start(h.input);
    h.gesture.start({ ...h.input, onMove: resized });
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    h.owner.dispatchEvent(pointerEvent("pointermove"));
    expect(h.onMove).not.toHaveBeenCalled();
    expect(resized).toHaveBeenCalledTimes(1);
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledTimes(6);
  });

  it("still cleans up when capture is unavailable or its detached target cannot release it", () => {
    const h = harness();
    h.target.setPointerCapture.mockImplementation(() => { throw new Error("unavailable capture"); });
    h.target.releasePointerCapture.mockImplementation(() => { throw new Error("detached target"); });
    h.gesture.start(h.input);
    h.owner.dispatchEvent(pointerEvent("pointermove"));
    h.owner.dispatchEvent(pointerEvent("pointerup"));
    expect(h.onMove).toHaveBeenCalledTimes(1);
    expect(h.onEnd).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledTimes(3);
  });
});
