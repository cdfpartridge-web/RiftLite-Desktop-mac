import { parseCommunityDeckSnapshot, type CommunityDeckGroup } from "../shared/communityDecks";
import type { DeckEntry, DeckSnapshot, SavedDeck } from "../shared/types";

type DeckComparisonSourceKind = "saved" | "community-average" | "community-deck";

type DeckComparisonCardSide = {
  key: string;
  name: string;
  imageUrl: string;
  section: string;
  qty: number;
  label: string;
  inclusionRate?: number;
};

export type DeckComparisonSource = {
  key: string;
  kind: DeckComparisonSourceKind;
  label: string;
  subLabel: string;
  legend: string;
  cards: Map<string, DeckComparisonCardSide>;
};

type DeckComparisonRow = {
  key: string;
  name: string;
  imageUrl: string;
  section: string;
  status: "shared" | "left-only" | "right-only";
  left?: DeckComparisonCardSide;
  right?: DeckComparisonCardSide;
  delta: number;
  importance: number;
};

function deckComparisonKeyFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function deckComparisonSectionLabel(section: string): string {
  if (section === "mainDeck") return "Main";
  if (section === "sideboard") return "Sideboard";
  if (section === "battlefields") return "Battlefield";
  if (section === "runes") return "Rune";
  if (section === "champions") return "Champion";
  return "Deck";
}

function entriesForDeckComparison(snapshot: DeckSnapshot): Array<{ entry: DeckEntry; section: string }> {
  return [
    ...(snapshot.mainDeck ?? []).map((entry) => ({ entry, section: "mainDeck" })),
    ...(snapshot.sideboard ?? []).map((entry) => ({ entry, section: "sideboard" })),
    ...(snapshot.battlefields ?? []).map((entry) => ({ entry, section: "battlefields" }))
  ];
}

export function buildSavedDeckComparisonSource(deck: SavedDeck): DeckComparisonSource | null {
  const snapshot = parseCommunityDeckSnapshot(deck.snapshotJson);
  if (!snapshot) {
    return null;
  }
  const cards = new Map<string, DeckComparisonCardSide>();
  for (const { entry, section } of entriesForDeckComparison(snapshot)) {
    const key = deckComparisonKeyFromName(entry.name);
    if (!key) {
      continue;
    }
    const current = cards.get(key);
    const qty = Math.max(0, entry.qty ?? 1);
    cards.set(key, {
      key,
      name: current?.name || entry.name,
      imageUrl: current?.imageUrl || entry.imageUrl || "",
      section: current?.section || section,
      qty: (current?.qty ?? 0) + qty,
      label: `${(current?.qty ?? 0) + qty}x`
    });
  }
  return {
    key: `saved:${deck.id}`,
    kind: "saved",
    label: deck.title,
    subLabel: `${snapshot.legend || deck.legend || "Saved deck"} - ${cards.size} cards`,
    legend: snapshot.legend || deck.legend,
    cards
  };
}

export function buildCommunityDeckComparisonSource(group: CommunityDeckGroup): DeckComparisonSource | null {
  if (!group.snapshot) {
    return null;
  }
  const cards = new Map<string, DeckComparisonCardSide>();
  for (const { entry, section } of entriesForDeckComparison(group.snapshot)) {
    const key = deckComparisonKeyFromName(entry.name);
    if (!key) {
      continue;
    }
    const current = cards.get(key);
    const qty = Math.max(0, entry.qty ?? 1);
    cards.set(key, {
      key,
      name: current?.name || entry.name,
      imageUrl: current?.imageUrl || entry.imageUrl || "",
      section: current?.section || section,
      qty: (current?.qty ?? 0) + qty,
      label: `${(current?.qty ?? 0) + qty}x`
    });
  }
  return {
    key: `community-deck:${group.key}`,
    kind: "community-deck",
    label: group.title || `${group.legend} deck`,
    subLabel: `${group.legend} - ${group.total} public matches`,
    legend: group.legend,
    cards
  };
}

export function buildCommunityAverageComparisonSource(legend: string, groups: CommunityDeckGroup[]): DeckComparisonSource | null {
  const snapshotGroups = groups.filter((group) => group.snapshot);
  if (!snapshotGroups.length) {
    return null;
  }
  const aggregate = new Map<string, {
    name: string;
    imageUrl: string;
    section: string;
    totalQty: number;
    deckCount: number;
  }>();
  for (const group of snapshotGroups) {
    if (!group.snapshot) continue;
    const perDeck = new Map<string, DeckComparisonCardSide>();
    for (const { entry, section } of entriesForDeckComparison(group.snapshot)) {
      const key = deckComparisonKeyFromName(entry.name);
      if (!key) continue;
      const current = perDeck.get(key);
      const qty = Math.max(0, entry.qty ?? 1);
      perDeck.set(key, {
        key,
        name: current?.name || entry.name,
        imageUrl: current?.imageUrl || entry.imageUrl || "",
        section: current?.section || section,
        qty: (current?.qty ?? 0) + qty,
        label: ""
      });
    }
    for (const card of perDeck.values()) {
      const current = aggregate.get(card.key) ?? {
        name: card.name,
        imageUrl: card.imageUrl,
        section: card.section,
        totalQty: 0,
        deckCount: 0
      };
      current.totalQty += card.qty;
      current.deckCount += 1;
      if (!current.imageUrl && card.imageUrl) {
        current.imageUrl = card.imageUrl;
      }
      aggregate.set(card.key, current);
    }
  }
  const cards = new Map<string, DeckComparisonCardSide>();
  for (const [key, card] of aggregate) {
    const inclusionRate = Math.round((card.deckCount / snapshotGroups.length) * 1000) / 10;
    const averageCopies = Math.round((card.totalQty / card.deckCount) * 10) / 10;
    cards.set(key, {
      key,
      name: card.name,
      imageUrl: card.imageUrl,
      section: card.section,
      qty: averageCopies,
      label: `${inclusionRate}% / ${averageCopies}x avg`,
      inclusionRate
    });
  }
  return {
    key: `community-average:${legend}`,
    kind: "community-average",
    label: `${legend} community average`,
    subLabel: `${snapshotGroups.length} unique public decklists`,
    legend,
    cards
  };
}

export function buildDeckComparisonRows(left: DeckComparisonSource | null, right: DeckComparisonSource | null): DeckComparisonRow[] {
  if (!left || !right) {
    return [];
  }
  const keys = new Set([...left.cards.keys(), ...right.cards.keys()]);
  return [...keys].map((key) => {
    const leftCard = left.cards.get(key);
    const rightCard = right.cards.get(key);
    const status: DeckComparisonRow["status"] = leftCard && rightCard ? "shared" : leftCard ? "left-only" : "right-only";
    const primary = rightCard ?? leftCard;
    const rightWeight = rightCard?.inclusionRate ?? rightCard?.qty ?? 0;
    const leftWeight = leftCard?.inclusionRate ?? leftCard?.qty ?? 0;
    return {
      key,
      name: primary?.name ?? "Unknown card",
      imageUrl: primary?.imageUrl ?? "",
      section: primary?.section ?? "mainDeck",
      status,
      left: leftCard,
      right: rightCard,
      delta: Math.round(((leftCard?.qty ?? 0) - (rightCard?.qty ?? 0)) * 10) / 10,
      importance: Math.max(leftWeight, rightWeight)
    };
  }).sort((a, b) => {
    const statusOrder = { "right-only": 0, shared: 1, "left-only": 2 } as const;
    return statusOrder[a.status] - statusOrder[b.status] || b.importance - a.importance || a.name.localeCompare(b.name);
  });
}
