import type { StaticPlacement } from "./static-pdf";

export const MIN_PLACEMENT_WIDTH = 24;
export const MIN_PLACEMENT_HEIGHT = 8;
const GAP = 1;

type Bounds = { width: number; height: number };

export type ResizeEdge = "e" | "w" | "n" | "s";

function rect(placement: StaticPlacement) {
  return {
    left: placement.x,
    right: placement.x + placement.width,
    bottom: placement.y,
    top: placement.y + placement.height,
  };
}

export function placementsOverlap(a: StaticPlacement, b: StaticPlacement, gap = GAP) {
  if (a.pageIndex !== b.pageIndex) return false;
  const left = rect(a);
  const right = rect(b);
  return !(
    left.right + gap <= right.left ||
    right.right + gap <= left.left ||
    left.top + gap <= right.bottom ||
    right.top + gap <= left.bottom
  );
}

/** Keep a placement on-page without enlarging small detected boxes (e.g. checkboxes). */
export function clampToPage(placement: StaticPlacement, page: Bounds): StaticPlacement {
  const width = Math.min(Math.max(1, placement.width), page.width);
  const height = Math.min(Math.max(1, placement.height), page.height);
  const x = Math.min(Math.max(0, placement.x), Math.max(0, page.width - width));
  const y = Math.min(Math.max(0, placement.y), Math.max(0, page.height - height));
  return { ...placement, x, y, width, height };
}

/** Interactive minimum size, then page clamp. */
export function clampPlacement(placement: StaticPlacement, page: Bounds): StaticPlacement {
  return clampToPage(
    {
      ...placement,
      width: Math.max(MIN_PLACEMENT_WIDTH, placement.width),
      height: Math.max(MIN_PLACEMENT_HEIGHT, placement.height),
    },
    page,
  );
}

function penetration(a: StaticPlacement, b: StaticPlacement) {
  const left = rect(a);
  const right = rect(b);
  return {
    x: Math.min(left.right - right.left, right.right - left.left),
    y: Math.min(left.top - right.bottom, right.top - left.bottom),
  };
}

/** Push `candidate` just clear of `others` with the smallest translation. */
export function separateFromOthers(
  candidate: StaticPlacement,
  others: StaticPlacement[],
  page: Bounds,
): StaticPlacement {
  let next = clampToPage(candidate, page);
  for (let pass = 0; pass < 8; pass += 1) {
    let hit: StaticPlacement | null = null;
    for (const other of others) {
      if (placementsOverlap(next, other)) {
        hit = other;
        break;
      }
    }
    if (!hit) return next;

    const depth = penetration(next, hit);
    if (depth.x <= depth.y) {
      const moveRight = next.x + next.width / 2 >= hit.x + hit.width / 2;
      next = clampToPage(
        {
          ...next,
          x: moveRight ? hit.x + hit.width + GAP : hit.x - next.width - GAP,
        },
        page,
      );
    } else {
      const moveUp = next.y + next.height / 2 >= hit.y + hit.height / 2;
      next = clampToPage(
        {
          ...next,
          y: moveUp ? hit.y + hit.height + GAP : hit.y - next.height - GAP,
        },
        page,
      );
    }
  }
  return next;
}

export function movePlacementWithoutOverlap(
  start: StaticPlacement,
  dx: number,
  dy: number,
  others: StaticPlacement[],
  page: Bounds,
): StaticPlacement {
  const proposed = clampToPage(
    {
      ...start,
      x: start.x + dx,
      y: start.y + dy,
    },
    page,
  );
  return separateFromOthers(proposed, others, page);
}

export function resizePlacementWithoutOverlap(
  start: StaticPlacement,
  edge: ResizeEdge,
  dx: number,
  dy: number,
  others: StaticPlacement[],
  page: Bounds,
): StaticPlacement {
  let next = { ...start };

  if (edge === "e") {
    next.width = Math.max(MIN_PLACEMENT_WIDTH, start.width + dx);
  } else if (edge === "w") {
    const width = Math.max(MIN_PLACEMENT_WIDTH, start.width - dx);
    next.x = start.x + start.width - width;
    next.width = width;
  } else if (edge === "n") {
    next.height = Math.max(MIN_PLACEMENT_HEIGHT, start.height + dy);
  } else if (edge === "s") {
    const height = Math.max(MIN_PLACEMENT_HEIGHT, start.height - dy);
    next.y = start.y + start.height - height;
    next.height = height;
  }

  next = clampToPage(next, page);

  // If still overlapping after clamp, shrink from the active edge until clear.
  for (let pass = 0; pass < 24; pass += 1) {
    const blocker = others.find((other) => placementsOverlap(next, other));
    if (!blocker) return next;

    if (edge === "e") {
      next.width = Math.max(MIN_PLACEMENT_WIDTH, blocker.x - GAP - next.x);
    } else if (edge === "w") {
      const right = next.x + next.width;
      next.x = Math.min(right - MIN_PLACEMENT_WIDTH, blocker.x + blocker.width + GAP);
      next.width = Math.max(MIN_PLACEMENT_WIDTH, right - next.x);
    } else if (edge === "n") {
      next.height = Math.max(MIN_PLACEMENT_HEIGHT, blocker.y - GAP - next.y);
    } else {
      const top = next.y + next.height;
      next.y = Math.min(top - MIN_PLACEMENT_HEIGHT, blocker.y + blocker.height + GAP);
      next.height = Math.max(MIN_PLACEMENT_HEIGHT, top - next.y);
    }
    next = clampToPage(next, page);
  }

  return separateFromOthers(next, others, page);
}

/** Stable pass that nudges later fields so no two on a page overlap. */
export function resolveFieldOverlaps<T extends { name: string; placement: StaticPlacement }>(
  fields: T[],
  page: Bounds,
): T[] {
  const next = fields.map((field) => ({
    ...field,
    placement: clampToPage(field.placement, page),
  }));

  next.sort(
    (left, right) =>
      left.placement.pageIndex - right.placement.pageIndex ||
      right.placement.y + right.placement.height - (left.placement.y + left.placement.height) ||
      left.placement.x - right.placement.x,
  );

  for (let index = 0; index < next.length; index += 1) {
    const others = next.slice(0, index).map((field) => field.placement);
    next[index] = {
      ...next[index],
      placement: separateFromOthers(next[index].placement, others, page),
    };
  }

  return next;
}

export function findOpenPlacement(
  pageIndex: number,
  page: Bounds,
  occupied: StaticPlacement[],
  preferred?: Partial<StaticPlacement>,
): StaticPlacement {
  const width = preferred?.width ?? Math.min(180, Math.max(80, page.width * 0.35));
  const height = preferred?.height ?? 11;
  const startX = preferred?.x ?? Math.max(24, page.width * 0.12);
  const startY = preferred?.y ?? Math.max(40, page.height * 0.55);

  const seed = clampToPage({ pageIndex, x: startX, y: startY, width, height }, page);
  const samePage = occupied.filter((placement) => placement.pageIndex === pageIndex);
  if (!samePage.some((placement) => placementsOverlap(seed, placement))) return seed;

  const stepY = height + 8;
  for (let row = 0; row < 40; row += 1) {
    const y = Math.max(8, startY - row * stepY);
    const candidate = clampToPage({ ...seed, y }, page);
    if (!samePage.some((placement) => placementsOverlap(candidate, placement))) {
      return candidate;
    }
  }

  return separateFromOthers(seed, samePage, page);
}
