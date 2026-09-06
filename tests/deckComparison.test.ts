import { describe, expect, it } from "vitest";
import {
  buildCommunityAverageComparisonSource,
  buildCommunityDeckComparisonSource,
  buildDeckComparisonRows,
  buildSavedDeckComparisonSource,
  deckComparisonSectionLabel,
  type DeckComparisonSource
} from "../src/renderer/deckComparison";
import type { CommunityDeckGroup } from "../src/shared/communityDecks";
import type { DeckSnapshot, SavedDeck } from "../src/shared/types";

function snapshot(patch: Partial<DeckSnapshot> = {}): DeckSnapshot {
  return {
    title: "Akali Tempo", legend: "Akali", legendKey: "akali", sourceUrl: "", sourceKey: "",
    mainDeck: [], sideboard: [], battlefields: [], runes: [], ...patch
  };
}

function savedDeck(patch: Partial<SavedDeck> = {}): SavedDeck {
  return {
    id: "saved-1", title: "My saved list", legend: "Diana", sourceUrl: "", sourceKey: "",
    snapshotJson: JSON.stringify(snapshot()), lastImportedAt: "2026-09-04T10:00:00.000Z",
    lastRefreshStatus: "ok", lastRefreshError: "", ...patch
  };
}

function communityGroup(deck: DeckSnapshot | null, patch: Partial<CommunityDeckGroup> = {}): CommunityDeckGroup {
  return {
    key: "public-1", title: "Public list", legend: "Akali", sourceUrl: "", sourceKey: "",
    snapshotJson: JSON.stringify(deck), snapshot: deck, representativeMatchId: "match-1",
    matchIds: ["match-1"], matches: [], bo1: 1, bo3: 0,
    total: 1, wins: 1, losses: 0, draws: 0, incomplete: 0, decisive: 1,
    record: "1-0", winRate: 100, winRateLabel: "100%", ...patch
  };
}

describe("deck comparison sources", () => {
  it.each(["", "{broken", "[]", "null", "42"])("rejects unusable saved snapshots: %s", (snapshotJson) => {
    expect(buildSavedDeckComparisonSource(savedDeck({ snapshotJson }))).toBeNull();
  });

  it("combines named cards across compared sections while retaining the first name/section and first usable art", () => {
    const deck = snapshot({
      mainDeck: [{ name: "Test-Spell", qty: 2 }],
      sideboard: [{ name: "test spell", qty: 1, imageUrl: "https://example.com/spell.png" }],
      battlefields: [{ name: "Test Arena", qty: 1, imageUrl: "https://example.com/arena.png" }, { name: "!!!", qty: 1 }],
      runes: [{ name: "Test Rune", qty: 6 }],
      legendEntry: { name: "Legend art", qty: 1 }
    });
    const result = buildSavedDeckComparisonSource(savedDeck({ snapshotJson: JSON.stringify(deck) }))!;
    expect(result).toMatchObject({
      key: "saved:saved-1", kind: "saved", label: "My saved list", legend: "Akali", subLabel: "Akali - 2 cards"
    });
    expect([...result.cards.values()]).toEqual([
      { key: "testspell", name: "Test-Spell", imageUrl: "https://example.com/spell.png", section: "mainDeck", qty: 3, label: "3x" },
      { key: "testarena", name: "Test Arena", imageUrl: "https://example.com/arena.png", section: "battlefields", qty: 1, label: "1x" }
    ]);
  });

  it("keeps saved-deck metadata fallbacks and the legacy snapshot parser", () => {
    const result = buildSavedDeckComparisonSource(savedDeck({
      snapshotJson: JSON.stringify({ main_deck: [{ card_name: "Legacy Card", quantity: 2 }] })
    }))!;
    expect(result).toMatchObject({ label: "My saved list", legend: "Diana", subLabel: "Diana - 1 cards" });
    expect(result.cards.get("legacycard")).toMatchObject({ name: "Legacy Card", qty: 2, label: "2x" });
    expect(buildSavedDeckComparisonSource(savedDeck({ legend: "", snapshotJson: "{}" })))
      .toMatchObject({ legend: "", subLabel: "Saved deck - 0 cards" });
  });

  it("keeps individual community deck labels and does not mutate its snapshot", () => {
    const deck = snapshot({
      mainDeck: [{ name: "Test Spell", qty: -2 }, { name: "Other Card", qty: 3, imageUrl: "first-art" }],
      sideboard: [{ name: "Test Spell", qty: 2 }, { name: "Other Card", qty: 1, imageUrl: "later-art" }]
    });
    const before = JSON.stringify(deck);
    for (const section of [deck.mainDeck, deck.sideboard, deck.battlefields, deck.runes]) {
      section.forEach(Object.freeze);
      Object.freeze(section);
    }
    Object.freeze(deck);
    const result = buildCommunityDeckComparisonSource(communityGroup(deck, { title: "", total: 17 }))!;
    expect(result).toMatchObject({
      key: "community-deck:public-1", kind: "community-deck", label: "Akali deck", subLabel: "Akali - 17 public matches", legend: "Akali"
    });
    expect(result.cards.get("testspell")).toMatchObject({ qty: 2, label: "2x", section: "mainDeck" });
    expect(result.cards.get("othercard")).toMatchObject({ qty: 4, label: "4x", imageUrl: "first-art" });
    expect(JSON.stringify(deck)).toBe(before);
    expect(buildCommunityDeckComparisonSource(communityGroup(null))).toBeNull();
  });

  it("averages unique decklists instead of match counts and counts a repeated card once per list", () => {
    const first = snapshot({
      mainDeck: [{ name: "Shared Card", qty: 1 }, { name: "Rare Card", qty: 2 }],
      sideboard: [{ name: "shared-card", qty: 1 }]
    });
    const second = snapshot({ mainDeck: [{ name: "Shared Card", qty: 3, imageUrl: "shared-art" }] });
    const groups = [
      communityGroup(first, { total: 100 }),
      communityGroup(second, { key: "public-2", total: 1 }),
      communityGroup(snapshot(), { key: "empty-list" }),
      communityGroup(null, { key: "missing-list", total: 999 })
    ];
    const before = JSON.stringify(groups);
    const result = buildCommunityAverageComparisonSource("Akali", groups)!;
    expect(result).toMatchObject({
      key: "community-average:Akali", kind: "community-average", label: "Akali community average",
      subLabel: "3 unique public decklists", legend: "Akali"
    });
    expect([...result.cards.values()]).toEqual([
      { key: "sharedcard", name: "Shared Card", section: "mainDeck", imageUrl: "shared-art", inclusionRate: 66.7, qty: 2.5, label: "66.7% / 2.5x avg" },
      { key: "rarecard", name: "Rare Card", section: "mainDeck", imageUrl: "", inclusionRate: 33.3, qty: 2, label: "33.3% / 2x avg" }
    ]);
    expect(JSON.stringify(groups)).toBe(before);
  });

  it("distinguishes a missing community snapshot from an empty usable list", () => {
    expect(buildCommunityAverageComparisonSource("Akali", [])).toBeNull();
    expect(buildCommunityAverageComparisonSource("Akali", [communityGroup(null)])).toBeNull();
    const result = buildCommunityAverageComparisonSource("Akali", [communityGroup(snapshot())])!;
    expect(result.subLabel).toBe("1 unique public decklists");
    expect(result.cards.size).toBe(0);
  });

  it.each([
    ["mainDeck", "Main"], ["sideboard", "Sideboard"], ["battlefields", "Battlefield"],
    ["runes", "Rune"], ["champions", "Champion"], ["unknown", "Deck"]
  ])("retains the %s section label", (section, label) => {
    expect(deckComparisonSectionLabel(section)).toBe(label);
  });
});

function comparisonSource(cards: Array<{ key: string; name: string; qty: number; inclusionRate?: number; imageUrl?: string; section?: string }>): DeckComparisonSource {
  return {
    key: "source", kind: "saved", label: "Test list", subLabel: "", legend: "Akali",
    cards: new Map(cards.map((card) => [card.key, { imageUrl: "", section: "mainDeck", label: `${card.qty}x`, ...card }]))
  };
}

describe("deck comparison rows", () => {
  it("requires two selected sources", () => {
    const source = comparisonSource([]);
    expect(buildDeckComparisonRows(source, null)).toEqual([]);
    expect(buildDeckComparisonRows(null, source)).toEqual([]);
    expect(buildDeckComparisonRows(null, null)).toEqual([]);
  });

  it("orders missing recommendations before shared and left-only cards, then by importance and name", () => {
    const left = comparisonSource([
      { key: "left-low", name: "Left Low", qty: 1 },
      { key: "left-high", name: "Left High", qty: 3 },
      { key: "shared", name: "Shared left label", qty: 2.7, imageUrl: "left-art", section: "mainDeck" }
    ]);
    const right = comparisonSource([
      { key: "zulu", name: "Zulu", qty: 1, inclusionRate: 50 },
      { key: "alpha", name: "Alpha", qty: 3, inclusionRate: 50 },
      { key: "popular", name: "Popular", qty: 1, inclusionRate: 90 },
      { key: "shared", name: "Shared right label", qty: 2.4, imageUrl: "right-art", section: "sideboard", inclusionRate: 100 }
    ]);
    const rows = buildDeckComparisonRows(left, right);
    expect(rows.map((row) => [row.key, row.status, row.delta, row.importance])).toEqual([
      ["popular", "right-only", -1, 90], ["alpha", "right-only", -3, 50], ["zulu", "right-only", -1, 50],
      ["shared", "shared", 0.3, 100], ["left-high", "left-only", 3, 3], ["left-low", "left-only", 1, 1]
    ]);
    expect(rows[3]).toMatchObject({ name: "Shared right label", imageUrl: "right-art", section: "sideboard" });
    expect(rows[3].left).toBe(left.cards.get("shared"));
    expect(rows[3].right).toBe(right.cards.get("shared"));
    expect([...left.cards.keys()]).toEqual(["left-low", "left-high", "shared"]);
    expect([...right.cards.keys()]).toEqual(["zulu", "alpha", "popular", "shared"]);
  });

  it("keeps equal-rank rows stable and respects an explicit zero inclusion rate", () => {
    const right = comparisonSource([
      { key: "first", name: "Same label", qty: 1 },
      { key: "second", name: "Same label", qty: 1 },
      { key: "zero-inclusion", name: "Zero", qty: 9, inclusionRate: 0 }
    ]);
    expect(buildDeckComparisonRows(comparisonSource([]), right).map((row) => [row.key, row.importance]))
      .toEqual([["first", 1], ["second", 1], ["zero-inclusion", 0]]);
  });
});
