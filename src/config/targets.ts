// 成績の目標範囲（design.md 5.4）と、検証ツールの合格基準（提案）

export interface Target {
  key: string;
  label: string;
  min: number;
  max: number;
  /** 表示の小数桁 */
  digits: number;
}

/** チームごとの指標（143試合あたり） */
export const TEAM_TARGETS: Target[] = [
  { key: 'avg', label: 'チーム打率', min: 0.24, max: 0.275, digits: 3 },
  { key: 'hr', label: 'チーム本塁打', min: 80, max: 170, digits: 0 },
  { key: 'runs', label: 'チーム得点', min: 450, max: 680, digits: 0 },
  { key: 'sb', label: 'チーム盗塁', min: 40, max: 130, digits: 0 },
  { key: 'era', label: 'チーム防御率', min: 2.7, max: 4.2, digits: 2 },
];

/** リーグごとのタイトル */
export const LEADER_TARGETS: Target[] = [
  { key: 'battingTitle', label: '首位打者の打率', min: 0.31, max: 0.35, digits: 3 },
  { key: 'hrKing', label: '本塁打王', min: 32, max: 50, digits: 0 },
  { key: 'eraTitle', label: '最優秀防御率', min: 1.6, max: 2.5, digits: 2 },
];

/** リーグ平均の目安 */
export const LEAGUE_AVG_TARGET = { avg: 0.255, era: 3.4, avgTolerance: 0.008, eraTolerance: 0.25 };

/** 合格の基準：チームの指標は95%以上、タイトルは90%以上が範囲内 */
export const TEAM_PASS_RATE = 0.95;
export const LEADER_PASS_RATE = 0.9;
