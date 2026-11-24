import { makeGood, parseSpec } from '../goods';
import { drawFilterIcon, drawGood, drawPart, iconURL } from '../render/art';
import type { Good, PartKind } from '../types';

/** Data-URL icons for the DOM, drawn with the same art as the board. */
export function goodIcon(code: string): string {
  return iconURL(`g:${code}`, (ctx, s) => {
    const spec = parseSpec(code);
    // An order line names only what matters; draw it with sensible defaults (a red-lantern order shows a red lantern).
    const g: Good = makeGood(code);
    if (spec.kind === 'lantern' && spec.lit === undefined) g.lit = false;
    drawGood(ctx, g, s / 2, s / 2 - (g.kind === 'lantern' ? s * 0.06 : 0), s * 1.25, 0.4);
  });
}
export function partIcon(kind: PartKind, dial?: string): string {
  return iconURL(`p:${kind}:${dial ?? ''}`, (ctx, s) => {
    if (kind === 'belt') {
      ctx.fillStyle = '#b8873c'; ctx.fillRect(s * 0.08, s * 0.28, s * 0.84, s * 0.44);
      ctx.fillStyle = '#2f2622'; ctx.fillRect(s * 0.08, s * 0.32, s * 0.84, s * 0.36);
      ctx.strokeStyle = '#5a4b40'; ctx.lineWidth = s * 0.05;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(s * 0.08 + i * s * 0.17, s * 0.32); ctx.lineTo(s * 0.08 + i * s * 0.17, s * 0.68); ctx.stroke(); }
      ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.moveTo(s * 0.7, s * 0.5); ctx.lineTo(s * 0.5, s * 0.38); ctx.lineTo(s * 0.5, s * 0.62); ctx.closePath(); ctx.fill();
      return;
    }
    drawPart(ctx, { kind, dir: 0, dial }, s / 2, s / 2, s * 0.98, { work: 0 }, 0);
  });
}
export function dialIcon(kind: PartKind, value: string): string {
  return iconURL(`d:${kind}:${value}`, (ctx, s) => {
    if (kind === 'folder') drawGood(ctx, { kind: 'shell', shape: value as Good['shape'], color: 'plain' }, s / 2, s / 2, s * 1.2);
    else if (kind === 'stamp') drawGood(ctx, { kind: 'shell', shape: 'round', color: 'red', stamp: value as Good['stamp'] }, s / 2, s / 2, s * 1.2);
    else if (kind === 'vat') {
      if (value === 'fed') drawGood(ctx, { kind: 'dye', color: 'blue' }, s / 2, s / 2, s * 1.1);
      else drawFilterIcon(ctx, value, s / 2, s / 2, s * 1.4);
    } else if (kind === 'sorter') drawFilterIcon(ctx, value, s / 2, s / 2, s * 1.1);
    else {
      ctx.fillStyle = '#ffe9b8'; ctx.font = `900 ${Math.round(s * 0.5)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(value, s / 2, s / 2 + 1);
    }
  });
}
