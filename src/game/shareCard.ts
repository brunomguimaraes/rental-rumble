import type { Creature, Opponent } from './types.js';
import { TYPE_COLORS, typeIconUrl, typeLabel } from './typechart.js';
import { signIconUrl, signTier } from './zodiac.js';
import { bracketCup, type BracketId } from './gens.js';
import { DIFFICULTY_INFO, type Difficulty } from './run.js';

// All assets are served from the same origin (public/sprites), so the canvas
// never gets tainted and we can export the result as a PNG / share a File.
const ASSET = import.meta.env?.BASE_URL ?? '/';

export interface ShareCardData {
  team: Creature[];
  won: boolean;
  clearedStages: number;
  gauntlet: Opponent[];
  /** The generation bracket the run was played on — its Ribbon Cup becomes the
   *  champion card's header emblem. */
  bracket?: BracketId;
  /** The difficulty the run was played on — drawn as a badge under the title. */
  difficulty?: Difficulty;
  /** Roster of the trainer who ended the run; drawn on the loss card. */
  fellToTeam?: Creature[];
}

// 4:5 portrait — the friendliest aspect ratio for Instagram, X, Discord, etc.
const W = 1080;
const H = 1350;

const FONT = '"Outfit", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const COLORS = {
  bg: '#0a0a0f',
  ink: '#e6e6ee',
  faint: 'rgba(255,255,255,0.45)',
  gold: '#f5c542',
  rose: '#fb7185',
  emerald: '#34d399',
};

// Accent colour per difficulty, climbing from a calm green to a regal purple so
// the badge reads its stakes at a glance.
const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  easy: '#34d399',
  normal: '#60a5fa',
  hard: '#f59e0b',
  master: '#c084fc',
};

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Draw an image "cover"-style into a rounded box (center-cropped). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.save();
  roundRect(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

/**
 * Draw a Pokémon mini icon. These are 2-frame horizontal sprite sheets, so we
 * only blit the left frame (matching how `MiniSprite` shows them in the UI).
 */
function drawMini(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  size: number,
) {
  const sw = img.width / 2;
  const sh = img.height;
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, sw, sh, x, y, size, size);
  ctx.imageSmoothingEnabled = prev;
}

// Celestial-sign rainbow ring — mirrors the animated `.sign-rare` border the
// live cards wear. Drawn as a diagonal multi-stop gradient (the export is a
// still image, so there's no spin, just the full spectrum).
const RAINBOW_STOPS = [
  '#ff4d4d',
  '#ffb84d',
  '#fff24d',
  '#4dff88',
  '#4dd2ff',
  '#8c4dff',
  '#ff4dd2',
  '#ff4d4d',
];

function rainbowGradient(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  RAINBOW_STOPS.forEach((c, i) => g.addColorStop(i / (RAINBOW_STOPS.length - 1), c));
  return g;
}

/** Mix a hex color toward black/white by alpha; returns rgba string. */
function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const rr = (n >> 16) & 255;
  const gg = (n >> 8) & 255;
  const bb = n & 255;
  return `rgba(${rr},${gg},${bb},${alpha})`;
}

async function drawTypeChip(
  ctx: CanvasRenderingContext2D,
  type: Creature['types'][number],
  icon: HTMLImageElement | null,
  x: number,
  y: number,
  h: number,
): Promise<number> {
  const color = TYPE_COLORS[type];
  const label = typeLabel(type).toUpperCase();
  ctx.font = `700 ${Math.round(h * 0.46)}px ${FONT}`;
  const iconSize = h * 0.62;
  const padL = icon ? h * 0.22 : h * 0.42;
  const gap = icon ? h * 0.18 : 0;
  const textW = ctx.measureText(label).width;
  const w = padL + (icon ? iconSize + gap : 0) + textW + h * 0.42;

  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = withAlpha(color, 0.5);
  ctx.stroke();

  let cx = x + padL;
  if (icon) {
    ctx.drawImage(icon, cx, y + (h - iconSize) / 2, iconSize, iconSize);
    cx += iconSize + gap;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, y + h / 2 + 1);
  return w;
}

/**
 * Render the shareable team card to a canvas. Loads every sprite up front so
 * the export is fully painted (no blank images). All assets are same-origin,
 * so the returned canvas is exportable to a PNG Blob / shareable File.
 */
export async function renderShareCard(
  data: ShareCardData,
): Promise<HTMLCanvasElement> {
  const { team, won, clearedStages, gauntlet, bracket = 'all', difficulty, fellToTeam = [] } = data;

  // The header emblem is the era's Ribbon Cup — the "trophy" for the mode you
  // played. It's full-colour on a win and greyed-out on a loss.
  const cupSrc = `${ASSET}sprites/ui/cup-${bracketCup(bracket)}.png`;

  // Trainer who ended the run (only meaningful on a loss).
  const fellTo = !won ? gauntlet[clearedStages] : null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Preload sprites in parallel: portraits, type icons, pokeball, and — on a
  // loss — the defeating trainer's art plus their team's mini icons.
  const typeSet = new Set<Creature['types'][number]>();
  team.forEach((c) => c.types.forEach((t) => typeSet.add(t)));
  const typeList = [...typeSet];

  const signList = [...new Set(team.map((c) => c.sign))];

  const [portraits, typeIcons, signIcons, pokeball, cup, foeArt, foeMinis] = await Promise.all([
    Promise.all(
      team.map(async (c) => (await loadImage(c.portrait)) ?? loadImage(c.sprite)),
    ),
    Promise.all(typeList.map((t) => loadImage(typeIconUrl(t)))),
    Promise.all(signList.map((s) => loadImage(signIconUrl(s)))),
    loadImage(`${ASSET}sprites/ui/pokeball.png`),
    loadImage(cupSrc),
    fellTo ? loadImage(fellTo.art) : Promise.resolve(null),
    Promise.all(fellToTeam.map((c) => loadImage(c.mini))),
  ]);
  const iconByType = new Map(typeList.map((t, i) => [t, typeIcons[i]]));
  const iconBySign = new Map(signList.map((s, i) => [s, signIcons[i]]));

  // ---- Background ---------------------------------------------------------
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const glow = (
    cx: number,
    cy: number,
    radius: number,
    color: string,
  ) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.85, -40, 720, 'rgba(99,102,241,0.30)');
  glow(W * 0.05, H * 1.02, 760, 'rgba(236,72,153,0.26)');
  glow(W * 0.5, H * 0.42, 560, won ? 'rgba(245,197,66,0.10)' : 'rgba(99,102,241,0.06)');

  // Inner frame
  roundRect(ctx, 24, 24, W - 48, H - 48, 40);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();

  const cx = W / 2;

  // ---- Header -------------------------------------------------------------
  // Crown the card with the era's Ribbon Cup (a small pixel-art sprite, so
  // scale it up cleanly and keep its aspect). It's full-colour on a win and
  // greyed-out on a loss. Falls back to the Poké Ball if the cup is missing.
  const emblem = cup ?? pokeball;
  if (emblem) {
    const box = 72;
    const s = Math.min(box / emblem.width, box / emblem.height);
    const ew = emblem.width * s;
    const eh = emblem.height * s;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (!won) ctx.filter = 'grayscale(1) brightness(0.85)';
    ctx.drawImage(emblem, cx - ew / 2, 64 + (box - eh) / 2, ew, eh);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = COLORS.ink;
  ctx.font = `800 66px ${FONT}`;
  ctx.fillText('RENTAL RUMBLE', cx, 196);
  ctx.fillStyle = COLORS.faint;
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText('DRAFT · BATTLE · BECOME CHAMPION', cx, 230);

  // ---- Difficulty badge ---------------------------------------------------
  // A small pill under the title so the share card always says how hard the run
  // was — its colour climbs with the stakes.
  if (difficulty) {
    const diffColor = DIFFICULTY_COLORS[difficulty];
    const diffLabel = `${DIFFICULTY_INFO[difficulty].label.toUpperCase()} DIFFICULTY`;
    const badgeH = 40;
    const dotR = 5;
    const padX = 22;
    const dotGap = 12;
    ctx.font = `800 22px ${FONT}`;
    const labelW = ctx.measureText(diffLabel).width;
    const badgeW = padX * 2 + dotR * 2 + dotGap + labelW;
    const badgeX = cx - badgeW / 2;
    const badgeY = 244;

    roundRect(ctx, badgeX, badgeY, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = withAlpha(diffColor, won ? 0.16 : 0.12);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(diffColor, 0.55);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(badgeX + padX + dotR, badgeY + badgeH / 2, dotR, 0, Math.PI * 2);
    ctx.fillStyle = diffColor;
    ctx.fill();

    ctx.fillStyle = diffColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(diffLabel, badgeX + padX + dotR * 2 + dotGap, badgeY + badgeH / 2 + 1);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
  }

  // ---- Result banner ------------------------------------------------------
  const total = gauntlet.length;

  ctx.font = `800 54px ${FONT}`;
  if (won) {
    ctx.fillStyle = COLORS.gold;
    ctx.fillText('CHAMPION!', cx, 322);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(`Ran the full gauntlet — ${total}/${total} cleared`, cx, 360);
  } else {
    ctx.fillStyle = COLORS.rose;
    ctx.fillText('RUN OVER', cx, 322);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 26px ${FONT}`;
    const foe = fellTo ? `fell to ${fellTo.name}` : 'fell short';
    ctx.fillText(`Cleared ${clearedStages}/${total} — ${foe}`, cx, 360);
  }

  // Progress pips
  const pipR = 7;
  const pipGap = 26;
  const pipsW = total * pipGap - (pipGap - pipR * 2);
  let px = cx - pipsW / 2 + pipR;
  for (let i = 0; i < total; i++) {
    ctx.beginPath();
    ctx.arc(px, 386, pipR, 0, Math.PI * 2);
    if (i < clearedStages) ctx.fillStyle = COLORS.emerald;
    else if (i === clearedStages && !won) ctx.fillStyle = COLORS.rose;
    else ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fill();
    px += pipGap;
  }

  // ---- "Defeated by" strip (loss only) ------------------------------------
  // Shows the trainer who ended the run alongside a row of their team's mini
  // icons, so the share card tells the whole story of how the run died.
  let gridTop = 432;
  if (fellTo) {
    const sideP = 48;
    const panelX = sideP;
    const panelY = 408;
    const panelW = W - sideP * 2;
    const panelH = 120;
    const accent = TYPE_COLORS[fellTo.type];

    roundRect(ctx, panelX, panelY, panelW, panelH, 28);
    ctx.fillStyle = withAlpha(COLORS.rose, 0.08);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = withAlpha(COLORS.rose, 0.4);
    ctx.stroke();

    // Trainer art (front-facing PNG), boxed on the left.
    const artSize = 84;
    const artX = panelX + 20;
    const artY = panelY + (panelH - artSize) / 2;
    roundRect(ctx, artX, artY, artSize, artSize, 18);
    ctx.fillStyle = withAlpha(accent, 0.18);
    ctx.fill();
    if (foeArt) {
      ctx.save();
      roundRect(ctx, artX, artY, artSize, artSize, 18);
      ctx.clip();
      ctx.imageSmoothingEnabled = false;
      const s = Math.min(artSize / foeArt.width, artSize / foeArt.height);
      const dw = foeArt.width * s;
      const dh = foeArt.height * s;
      ctx.drawImage(foeArt, artX + (artSize - dw) / 2, artY + (artSize - dh) / 2, dw, dh);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
    }
    roundRect(ctx, artX, artY, artSize, artSize, 18);
    ctx.lineWidth = 2;
    ctx.strokeStyle = withAlpha(accent, 0.7);
    ctx.stroke();

    // Their team's mini icons, right-aligned within the panel.
    const drawn = foeMinis.filter((m): m is HTMLImageElement => m !== null);
    const miniSize = 46;
    const miniGap = 8;
    const minisW = drawn.length
      ? drawn.length * miniSize + (drawn.length - 1) * miniGap
      : 0;
    if (drawn.length > 0) {
      let mx = panelX + panelW - 20 - minisW;
      const my = panelY + (panelH - miniSize) / 2;
      for (const m of drawn) {
        drawMini(ctx, m, mx, my, miniSize);
        mx += miniSize + miniGap;
      }
    }

    // Label + trainer name (clamped so it never collides with the mini row).
    const textX = artX + artSize + 22;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLORS.rose;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText('DEFEATED BY', textX, panelY + 44);
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 38px ${FONT}`;
    let foeName = fellTo.name;
    const nameMaxW = panelW - (textX - panelX) - 20 - (minisW ? minisW + 24 : 24);
    while (ctx.measureText(foeName).width > nameMaxW && foeName.length > 4) {
      foeName = foeName.slice(0, -1);
    }
    if (foeName !== fellTo.name) foeName = foeName.slice(0, -1) + '…';
    ctx.fillText(foeName, textX, panelY + 82);

    gridTop = panelY + panelH + 20;
  }

  // ---- Team grid ----------------------------------------------------------
  const cols = 3;
  const rows = Math.ceil(team.length / cols);
  const gridBottom = H - 132;
  const gap = 22;
  const sideP = 48;
  const tileW = (W - sideP * 2 - gap * (cols - 1)) / cols;
  const tileH = (gridBottom - gridTop - gap * (rows - 1)) / rows;

  for (let i = 0; i < team.length; i++) {
    const c = team[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = sideP + col * (tileW + gap);
    const y = gridTop + row * (tileH + gap);
    const color = TYPE_COLORS[c.types[0]];
    const special = c.tier !== 'normal';
    const accent = special ? COLORS.gold : color;
    // A rare/mythic zodiac sign gets the rainbow celestial border on its
    // portrait, just like the live draft cards.
    const sTier = signTier(c.sign);
    const celestial = sTier === 'rare' || sTier === 'mythic';

    // Tile card
    roundRect(ctx, x, y, tileW, tileH, 26);
    ctx.fillStyle = withAlpha(color, 0.1);
    ctx.fill();
    ctx.lineWidth = special ? 2.5 : 1.5;
    ctx.strokeStyle = special ? withAlpha(COLORS.gold, 0.85) : withAlpha(color, 0.35);
    ctx.stroke();

    // Portrait
    const portrait = portraits[i];
    const pSize = Math.min(tileW - 56, 168);
    const pX = x + (tileW - pSize) / 2;
    const pY = y + 22;
    // accent backing
    roundRect(ctx, pX - 6, pY - 6, pSize + 12, pSize + 12, 26);
    ctx.fillStyle = withAlpha(accent, 0.18);
    ctx.fill();
    if (portrait) {
      drawCover(ctx, portrait, pX, pY, pSize, pSize, 22);
    } else {
      roundRect(ctx, pX, pY, pSize, pSize, 22);
      ctx.fillStyle = withAlpha(accent, 0.25);
      ctx.fill();
    }
    roundRect(ctx, pX, pY, pSize, pSize, 22);
    if (celestial) {
      ctx.lineWidth = sTier === 'mythic' ? 5 : 4;
      ctx.strokeStyle = rainbowGradient(ctx, pX, pY, pSize);
    } else {
      ctx.lineWidth = 2;
      ctx.strokeStyle = withAlpha(accent, 0.7);
    }
    ctx.stroke();

    // Name
    ctx.fillStyle = COLORS.ink;
    ctx.font = `800 30px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let name = c.name;
    while (ctx.measureText(name).width > tileW - 28 && name.length > 4) {
      name = name.slice(0, -1);
    }
    if (name !== c.name) name = name.slice(0, -1) + '…';
    const nameY = pY + pSize + 44;
    ctx.fillText(name, x + tileW / 2, nameY);

    // Type chips (centered row)
    const chipH = 30;
    ctx.font = `700 ${Math.round(chipH * 0.46)}px ${FONT}`;
    const chipWidths = c.types.map((t) => {
      const icon = iconByType.get(t) ?? null;
      const iconSize = chipH * 0.62;
      const padL = icon ? chipH * 0.22 : chipH * 0.42;
      const gp = icon ? chipH * 0.18 : 0;
      const textW = ctx.measureText(typeLabel(t).toUpperCase()).width;
      return padL + (icon ? iconSize + gp : 0) + textW + chipH * 0.42;
    });
    const chipsTotal = chipWidths.reduce((a, b) => a + b, 0) + (c.types.length - 1) * 8;
    let chipX = x + (tileW - chipsTotal) / 2;
    const chipY = nameY + 16;
    for (let t = 0; t < c.types.length; t++) {
      // eslint-disable-next-line no-await-in-loop
      await drawTypeChip(ctx, c.types[t], iconByType.get(c.types[t]) ?? null, chipX, chipY, chipH);
      chipX += chipWidths[t] + 8;
    }

    // Zodiac sign — just the glyph sprite, centered (no label).
    const signIcon = iconBySign.get(c.sign) ?? null;
    if (signIcon) {
      const sSize = 26;
      const sX = x + tileW / 2 - sSize / 2;
      const sY = chipY + chipH + 16;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.drawImage(signIcon, sX, sY, sSize, sSize);
      ctx.restore();
    }
  }

  // ---- Footer -------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.fillStyle = won ? withAlpha(COLORS.gold, 0.9) : 'rgba(255,255,255,0.6)';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(
    won ? 'Same gauntlet — can you take the crown too?' : 'Same draft pool — can you do better?',
    cx,
    H - 44,
  );

  return canvas;
}

/** Convenience: render and export to a PNG Blob. */
export async function renderShareBlob(data: ShareCardData): Promise<Blob> {
  const canvas = await renderShareCard(data);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
    );
  });
}
