import { describe, expect, it, vi } from "vitest";
import { handleAtlasDeckBeforeUnload } from "../src/main/services/atlasDeckDeparture";

describe("Atlas unsaved deck departure", () => {
  it("preserves unsaved changes when the user chooses Stay", () => {
    const event = { preventDefault: vi.fn() };
    const confirmLeave = vi.fn(() => false);
    handleAtlasDeckBeforeUnload(event, "https://riftatlas.com/decks/my-deck/edit", confirmLeave);
    expect(confirmLeave).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("allows the pending same-guest navigation only after Leave without saving", () => {
    const event = { preventDefault: vi.fn() };
    const confirmLeave = vi.fn(() => true);
    handleAtlasDeckBeforeUnload(event, "https://riftatlas.com/en/decks/my-deck/edit", confirmLeave);
    expect(confirmLeave).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("preserves unsaved changes if the confirmation cannot be displayed", () => {
    const event = { preventDefault: vi.fn() };
    handleAtlasDeckBeforeUnload(event, "https://riftatlas.com/decks/new", () => {
      throw new Error("Owner window unavailable");
    });
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each([
    "https://play.riftatlas.com/game/active-match",
    "https://play.riftatlas.com/",
    "https://riftatlas.com/sign-in",
    "https://riftatlas.com/decks-unrelated",
    "https://riftatlas.com.attacker.test/decks/my-deck/edit",
    "https://riftatlas.com@attacker.test/decks/my-deck/edit",
    "https://user@riftatlas.com/decks/my-deck/edit",
    "https://riftatlas.com:8443/decks/my-deck/edit",
    "http://riftatlas.com/decks/my-deck/edit",
    "not a URL"
  ])("never grants the deck editor's departure override to %s", (url) => {
    const event = { preventDefault: vi.fn() };
    const confirmLeave = vi.fn(() => true);
    handleAtlasDeckBeforeUnload(event, url, confirmLeave);
    expect(confirmLeave).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
