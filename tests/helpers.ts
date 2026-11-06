// テスト用：ドラフトや球団設立の年を自動で進める
import { ROSTER_LIMIT } from '../src/config/league';
import { advanceDraft, available, beginRound1, currentTeam, drawLottery, submitRound1, userPass, userPick } from '../src/core/draft';
import { finishCamp, finishRoster, releasePlayer, syncFirstYear, userRosterCount } from '../src/core/offseason/offseason';
import { overall, potentialOverall } from '../src/core/ratings';
import type { World } from '../src/core/season/types';
import { autoFillTryout } from '../src/core/tryout';

/** 自球団は将来性の高い順に、支配下 n 人・育成 m 人を指名する。くじは空いている最初の封筒を引く */
export function playDraft(w: World, n: number, m: number): void {
  const d = w.draft!;
  if (d.phase === 'scouting') beginRound1(w);
  for (let i = 0; i < 1000 && d.phase !== 'done'; i++) {
    const best = () => available(d).sort((a, b) => potentialOverall(b) - potentialOverall(a))[0].id;
    if (d.lottery) {
      const used = new Set(Object.values(d.lottery.choices));
      drawLottery(w, [...Array(d.lottery.teams.length).keys()].find((x) => !used.has(x))!);
    } else if (d.phase === 'round1') submitRound1(w, d.round1Pending.includes(w.userTeamId) ? best() : null);
    else if (currentTeam(d) === w.userTeamId) {
      const ik = d.phase === 'ikusei';
      const have = d.picks.filter((x) => x.teamId === w.userTeamId && x.ikusei === ik).length;
      if (have < (ik ? m : n)) userPick(w, best());
      else userPass(w);
    } else advanceDraft(w);
  }
}

/** 球団設立の年を最後まで進めて開幕させる（ドラフト → 戦力の整理（合同トライアウトで足りない分を獲る） → キャンプ） */
export function completeFirstYear(w: World, siteId = 'kagoshima'): void {
  playDraft(w, 5, 1);
  syncFirstYear(w);
  autoFillTryout(w);
  while (userRosterCount(w).roster > ROSTER_LIMIT) {
    const worst = w.players.filter((p) => p.teamId === w.userTeamId && !p.retired && p.contract === 'roster').sort((a, b) => overall(a) - overall(b))[0];
    releasePlayer(w, worst.id);
  }
  const why = finishRoster(w) ?? finishCamp(w, siteId);
  if (why) throw new Error(why);
}
