// お金の表示（万円 → 「12億3,400万円」）
export function moneyLabel(man: number): string {
  const sign = man < 0 ? '−' : '';
  const v = Math.abs(Math.round(man));
  const oku = Math.floor(v / 10000);
  const rest = v % 10000;
  if (oku > 0) return `${sign}${oku}億${rest ? `${rest.toLocaleString()}万` : ''}円`;
  return `${sign}${rest.toLocaleString()}万円`;
}
