// 球団ロゴ（SVGで描く。画像素材は使わない）
import type { Logo } from '../core/types';
import { esc } from './common';

export const SHAPE_LABEL: Record<Logo['shape'], string> = { shield: '盾', circle: '円', emblem: 'エンブレム', diamond: 'ひし形' };
export const MOTIF_LABEL: Record<Logo['motif'], string> = { animal: '鳥', star: '星', wave: '波', bat: 'バット', none: 'なし' };

function outline(shape: Logo['shape'], inset: number): string {
  const i = inset;
  switch (shape) {
    case 'shield':
      return `M50 ${4 + i} L${92 - i} ${18 + i * 0.6} V50 C${92 - i} ${75 - i * 0.5} ${72 - i * 0.4} ${90 - i} 50 ${97 - i} C${28 + i * 0.4} ${90 - i} ${8 + i} ${75 - i * 0.5} ${8 + i} 50 V${18 + i * 0.6} Z`;
    case 'circle':
      return `M50 ${4 + i} A${46 - i} ${46 - i} 0 1 1 49.99 ${4 + i} Z`;
    case 'emblem': {
      const r = 46 - i;
      const pts = Array.from({ length: 8 }, (_, k) => {
        const a = (Math.PI / 8) * (2 * k + 1);
        return `${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
      });
      return `M${pts.join(' L')} Z`;
    }
    case 'diamond':
      return `M50 ${3 + i * 1.4} L${97 - i * 1.4} 50 L50 ${97 - i * 1.4} L${3 + i * 1.4} 50 Z`;
  }
}

function motif(m: Logo['motif'], color: string, cy: number): string {
  const g = (inner: string) => `<g transform="translate(30 ${cy - 14})">${inner}</g>`;
  switch (m) {
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, k) => {
        const r = k % 2 === 0 ? 15 : 6.5;
        const a = -Math.PI / 2 + (Math.PI / 5) * k;
        return `${(20 + r * Math.cos(a)).toFixed(1)},${(14 + r * Math.sin(a)).toFixed(1)}`;
      });
      return g(`<polygon points="${pts.join(' ')}" fill="${color}"/>`);
    }
    case 'wave':
      return g(`<path d="M0 10 Q5 3 10 10 T20 10 T30 10 T40 10" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M0 20 Q5 13 10 20 T20 20 T30 20 T40 20" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    case 'bat':
      return g(`<rect x="18" y="-2" width="5" height="32" rx="2.5" fill="${color}" transform="rotate(40 20 14)"/><rect x="18" y="-2" width="5" height="32" rx="2.5" fill="${color}" transform="rotate(-40 20 14)"/><circle cx="20" cy="5" r="5" fill="${color}"/>`);
    case 'animal':
      return g(`<path d="M0 16 Q10 4 20 15 Q30 4 40 16 Q30 11 20 21 Q10 11 0 16 Z" fill="${color}"/>`);
    case 'none':
      return '';
  }
}

/** ロゴのSVG（size はピクセル） */
export function logoSvg(logo: Logo, size = 64): string {
  const text = esc(logo.text.slice(0, 3));
  const hasMotif = logo.motif !== 'none';
  const fs = text.length >= 3 ? 18 : text.length === 2 ? 23 : 30;
  const ty = hasMotif ? 76 : 50 + fs * 0.36;
  const tsize = hasMotif ? fs : fs * 1.5;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="ロゴ" style="flex:0 0 auto">
    <path d="${outline(logo.shape, 0)}" fill="${logo.main}"/>
    <path d="${outline(logo.shape, 5)}" fill="none" stroke="${logo.sub}" stroke-width="2.5"/>
    ${motif(logo.motif, logo.sub, 38)}
    ${text ? `<text x="50" y="${ty}" text-anchor="middle" font-size="${tsize}" font-weight="800" fill="${logo.sub}" font-family="-apple-system, 'Hiragino Sans', sans-serif">${text}</text>` : ''}
  </svg>`;
}
