// 天候（気温と風）を決める
import { PREFECTURES } from '../../config/prefectures';
import { WEATHER } from '../../config/balance';
import type { Rng } from '../rng';
import type { Team } from '../types';
import type { Weather, WindDir } from './types';

export function makeWeather(rng: Rng, home: Team, month: number, night: boolean): Weather {
  if (home.stadium.dome) return { dome: true, temp: WEATHER.domeTemp, windDir: 'none', wind: 0 };
  const climate = PREFECTURES.find((p) => p.name === home.homePref)?.climate ?? 'normal';
  const base = WEATHER.monthTemp[month] ?? 22;
  const shift = climate === 'cold' ? WEATHER.coldShift : climate === 'warm' ? WEATHER.warmShift : 0;
  const temp = Math.round(base + shift + (night ? WEATHER.nightShift : 0) + rng.normal(0, WEATHER.tempSd));
  const maxWind = WEATHER.maxWind * (home.stadium.seaside ? WEATHER.seasideFactor : 1);
  const wind = Math.round(rng.next() * maxWind);
  const windDir: WindDir = wind === 0 ? 'none' : rng.weighted<WindDir>([['out', 3], ['in', 3], ['cross', 2]]);
  return { dome: false, temp, windDir, wind };
}

export function weatherLabel(w: Weather): string {
  if (w.dome) return `ドーム（${w.temp}度）`;
  const dir = { none: '無風', out: '追い風', in: '向かい風', cross: '横風' }[w.windDir];
  return w.windDir === 'none' ? `屋外 ${w.temp}度・無風` : `屋外 ${w.temp}度・${dir} ${w.wind}m`;
}
