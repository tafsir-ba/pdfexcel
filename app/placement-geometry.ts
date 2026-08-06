import type { StaticPlacement } from "./static-pdf";

export const MIN_PLACEMENT_WIDTH = 24;
export const MIN_PLACEMENT_HEIGHT = 8;
const GAP = 1;
/** Soft align snap distance in PDF points while dragging. */
export const SNAP_THRESHOLD = 3;

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

/**
 * Push `candidate` clear of `others` using the minimum translation vector.
 * Nudges by overlap depth only — never teleports to the far side of a neighbor.
 */
export function separateFromOthers(
  candidate: StaticPlacement,
  others: StaticPlacement[],
  page: Bounds,
): StaticPlacement {
  let next = clampToPage(candidate, page);
  for (let pass = 0; pass < 12; pass += 1) {
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
          x: next.x + (moveRight ? depth.x + GAP : -(depth.x + GAP)),
        },
        page,
      );
    } else {
      const moveUp = next.y + next.height / 2 >= hit.y + hit.height / 2;
      next = clampToPage(
        {
          ...next,
          y: next.y + (moveUp ? depth.y + GAP : -(depth.y + GAP)),
        },
        page,
      );
    }
  }
  return next;
}

/** 1:1 cursor tracking — page clamp only, no collision jumps. */
export function movePlacementFree(
  start: StaticPlacement,
  dx: number,
  dy: number,
  page: Bounds,
): StaticPlacement {
  return clampToPage(
    {
      ...start,
      x: start.x + dx,
      y: start.y + dy,
    },
    page,
  );
}

/**
 * Soft-align to neighboring field edges/centers for accurate placement.
 * Returns snapped placement and which guide edges were used (PDF coords).
 */
export function softSnapPlacement(
  placement: StaticPlacement,
  others: StaticPlacement[],
  page: Bounds,
  threshold = SNAP_THRESHOLD,
): { placement: StaticPlacement; guides: { x: number[]; y: number[] } } {
  const x = placement.x;
  const y = placement.y;
  const { width, height } = placement;
  let bestDx = threshold + 1;
  let bestDy = threshold + 1;
  let snapX = x;
  let snapY = y;
  const guides = { x: [] as number[], y: [] as number[] };

  const considerX = (delta: number, targetX: number, guide: number) => {
    const abs = Math.abs(delta);
    if (abs <= threshold && abs < bestDx) {
      bestDx = abs;
      snapX = targetX;
      guides.x = [guide];
    }
  };
  const considerY = (delta: number, targetY: number, guide: number) => {
    const abs = Math.abs(delta);
    if (abs <= threshold && abs < bestDy) {
      bestDy = abs;
      snapY = targetY;
      guides.y = [guide];
    }
  };

  for (const other of others) {
    if (other.pageIndex !== placement.pageIndex) continue;
    const oLeft = other.x;
    const oRight = other.x + other.width;
    const oBottom = other.y;
    const oTop = other.y + other.height;
    const oMidX = other.x + other.width / 2;
    const oMidY = other.y + other.height / 2;

    considerX(x - oLeft, oLeft, oLeft);
    considerX(x + width - oRight, oRight - width, oRight);
    considerX(x - oRight, oRight, oRight);
    considerX(x + width - oLeft, oLeft - width, oLeft);
    considerX(x + width / 2 - oMidX, oMidX - width / 2, oMidX);

    considerY(y - oBottom, oBottom, oBottom);
    considerY(y + height - oTop, oTop - height, oTop);
    considerY(y - oTop, oTop, oTop);
    considerY(y + height - oBottom, oBottom - height, oBottom);
    considerY(y + height / 2 - oMidY, oMidY - height / 2, oMidY);
  }

  return {
    placement: clampToPage(
      { ...placement, x: bestDx <= threshold ? snapX : x, y: bestDy <= threshold ? snapY : y },
      page,
    ),
    guides,
  };
}

/** Live drag: free move + soft snap. Collision resolved on pointer-up. */
export function movePlacementInteractive(
  start: StaticPlacement,
  dx: number,
  dy: number,
  others: StaticPlacement[],
  page: Bounds,
): { placement: StaticPlacement; guides: { x: number[]; y: number[] } } {
  const free = movePlacementFree(start, dx, dy, page);
  return softSnapPlacement(free, others, page);
}

export function movePlacementWithoutOverlap(
  start: StaticPlacement,
  dx: number,
  dy: number,
  others: StaticPlacement[],
  page: Bounds,
): StaticPlacement {
  const proposed = movePlacementFree(start, dx, dy, page);
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
