// 検証ツール：100シーズンを自動で回し、成績が目標範囲（design.md 5.4）に入るか確かめる
// 使い方： npm run balance              （毎年作り直した世界で100シーズン）
//          npm run balance -- 20        （シーズン数を指定）
//          npm run balance -- --long 100（1つの世界を100年続けて回す。成長・引退・ドラフトを含む）
import { DEFAULT_INTERLEAGUE_GAMES, DEFAULT_INTERLEAGUE_MODE, DEFAULT_TEAM_COUNTS } from '../src/config/league';
import { LEADER_PASS_RATE, LEADER_TARGETS, LEAGUE_AVG_TARGET, TEAM_PASS_RATE, TEAM_TARGETS, type Target } from '../src/config/targets';
import { runBalanceSeason, seasonMetrics, talentLevel, type BalanceSeason } from '../src/core/balance/season';
import { runOffseasonAuto } from '../src/core/offseason/offseason';
import { advanceDays, createWorld } from '../src/core/season/advance';
import { runPostseason } from '../src/core/season/postseason';

const longMode = process.argv.includes('--long');
const numArg = process.argv.slice(2).find((a) => /^\d+$/.test(a));
const seasons = Number(numArg ?? 100);
const started = Date.now();
const results: BalanceSeason[] = [];
const drift: { year: number; bat: number; pitch: number; age: number }[] = [];
if (longMode) {
  const w = createWorld(20270, {
    teamCounts: [DEFAULT_TEAM_COUNTS[0], DEFAULT_TEAM_COUNTS[1]], games: null,
    interleague: { mode: DEFAULT_INTERLEAGUE_MODE, games: DEFAULT_INTERLEAGUE_GAMES }, dh: [true, true], postseason: { teams: [3, 3], advantage: true },
  }, 2027, -1);
  for (let i = 0; i < seasons; i++) {
    advanceDays(w, 100000);
    results.push(seasonMetrics(w));
    const t = talentLevel(w);
    drift.push({ year: w.season.year, ...t });
    runPostseason(w);
    runOffseasonAuto(w);
    if ((i + 1) % 10 === 0) process.stderr.write(`  ${i + 1}/${seasons} 年完了\n`);
  }
} else {
  for (let i = 0; i < seasons; i++) {
    results.push(runBalanceSeason(10000 + i));
    if ((i + 1) % 10 === 0) process.stderr.write(`  ${i + 1}/${seasons} シーズン完了\n`);
  }
}

const fmt = (v: number, d: number) => (d === 0 ? Math.round(v).toString() : v.toFixed(d));
let allPass = true;

function report(title: string, target: Target, values: number[], passRate: number): void {
  const ok = values.filter((v) => v >= target.min && v <= target.max).length / values.length;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const pass = ok >= passRate;
  if (!pass) allPass = false;
  const sorted = values.slice().sort((a, b) => a - b);
  const p5 = sorted[Math.floor(sorted.length * 0.05)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(
    `${pass ? '○' : '×'} ${title}${target.label.padEnd(8, '　')} 目標 ${fmt(target.min, target.digits)}〜${fmt(target.max, target.digits)}｜平均 ${fmt(mean, target.digits)}｜中央90% ${fmt(p5, target.digits)}〜${fmt(p95, target.digits)}｜最小 ${fmt(sorted[0], target.digits)} 最大 ${fmt(sorted[sorted.length - 1], target.digits)}｜範囲内 ${(ok * 100).toFixed(1)}%`,
  );
}

console.log(`\n=== 検証結果：${longMode ? `1つの世界を${seasons}年続けて` : `${seasons}シーズン`}（${results[0].teams.length}球団、本番と同じ日程・一軍二軍・疲労・調子${longMode ? '・成長・引退・ドラフト' : ''}。数字は143試合換算）===\n`);
console.log(`【チーム成績】（範囲内が${TEAM_PASS_RATE * 100}%以上で合格）`);
const teams = results.flatMap((r) => r.teams);
for (const t of TEAM_TARGETS) report('', t, teams.map((x) => x[t.key as keyof typeof x] as number), TEAM_PASS_RATE);

console.log(`\n【タイトル】（リーグごと。範囲内が${LEADER_PASS_RATE * 100}%以上で合格）`);
const leaders = results.flatMap((r) => r.leaders);
for (const t of LEADER_TARGETS) report('', t, leaders.map((x) => x[t.key as keyof typeof x] as number).filter((v) => !Number.isNaN(v)), LEADER_PASS_RATE);

console.log('\n【リーグ平均】');
const lgAvg = results.reduce((s, r) => s + r.leagueAvg, 0) / results.length;
const lgEra = results.reduce((s, r) => s + r.leagueEra, 0) / results.length;
const avgOk = Math.abs(lgAvg - LEAGUE_AVG_TARGET.avg) <= LEAGUE_AVG_TARGET.avgTolerance;
const eraOk = Math.abs(lgEra - LEAGUE_AVG_TARGET.era) <= LEAGUE_AVG_TARGET.eraTolerance;
if (!avgOk || !eraOk) allPass = false;
console.log(`${avgOk ? '○' : '×'} 打率 ${lgAvg.toFixed(3)}（目安 .255前後）`);
console.log(`${eraOk ? '○' : '×'} 防御率 ${lgEra.toFixed(2)}（目安 3.40前後）`);

const mean = (k: 'k' | 'bb' | 'errors' | 'obp' | 'slg' | 'paPerGame') => teams.reduce((s, t) => s + t[k], 0) / teams.length;
const wins = teams.map((t) => t.wins);
console.log(`\n（参考）三振率 ${(mean('k') * 100).toFixed(1)}%・四球率 ${(mean('bb') * 100).toFixed(1)}%・出塁率 ${mean('obp').toFixed(3)}・長打率 ${mean('slg').toFixed(3)}・1試合の打席 ${mean('paPerGame').toFixed(1)}・勝利数 最少${Math.min(...wins)} 最多${Math.max(...wins)}`);
if (longMode) {
  console.log('\n【10年ごとの変化】（主力の能力の平均と、リーグの打率・本塁打・防御率）');
  for (let i = 0; i < results.length; i += 10) {
    const chunk = results.slice(i, i + 10);
    const d = drift.slice(i, i + 10);
    const m = (f: (r: BalanceSeason) => number) => chunk.reduce((s2, r) => s2 + f(r), 0) / chunk.length;
    const hr = m((r) => r.teams.reduce((a, t) => a + t.hr, 0) / r.teams.length);
    const dm = (k: 'bat' | 'pitch' | 'age') => d.reduce((a, x) => a + x[k], 0) / d.length;
    console.log(`  ${d[0].year}〜${d[d.length - 1].year}年：野手${dm('bat').toFixed(1)}・投手${dm('pitch').toFixed(1)}・平均年齢${dm('age').toFixed(1)}｜打率${m((r) => r.leagueAvg).toFixed(3)}・本塁打${hr.toFixed(0)}・防御率${m((r) => r.leagueEra).toFixed(2)}`);
  }
}
console.log(`\n総合：${allPass ? '○ すべて目標範囲内' : '× 範囲外の指標あり'}（${((Date.now() - started) / 1000).toFixed(1)}秒）\n`);
process.exitCode = allPass ? 0 : 1;
