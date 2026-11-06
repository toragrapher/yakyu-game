// ゲーム全体で使うデータの形

/** 投げる手 */
export type Throws = 'R' | 'L';
/** 打つ手（S＝両打） */
export type Bats = 'R' | 'L' | 'S';

/** 守備位置（投手以外） */
export type FieldPos = 'C' | '1B' | '2B' | '3B' | 'SS' | 'OF';
/** 本職のポジション */
export type MainPos = 'P' | FieldPos;
/** 投手の役割 */
export type PitcherRole = 'SP' | 'RP' | 'CL';

export type GrowthType = 'superEarly' | 'early' | 'normal' | 'late' | 'veryLate' | 'steady';
export type Personality = 'loyal' | 'ambitious' | 'money' | 'local' | 'mypace';
/** 入団前の経歴 */
export type Career = 'highSchool' | 'college' | 'industrial';
/** 打順適性 */
export type OrderFit = 'leadoff' | 'second' | 'cleanup' | 'middle' | 'lower';
/** 支配下か育成か */
export type ContractType = 'roster' | 'ikusei';
/** 一軍・二軍 */
export type Level = 'first' | 'farm';

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

/** 野手の能力（投手も打席に立つので全員が持つ） */
export interface BatAbilities {
  contact: number; // 巧打
  power: number; // 長打
  speed: number; // 走塁
  defense: number; // 守備
}

/** 投手の能力 */
export interface PitchAbilities {
  velocity: number; // 速球
  control: number; // 制球
  breaking: number; // 変化球
  stamina: number; // 体力
}

export interface Player {
  id: number;
  familyName: string;
  givenName: string;
  age: number;
  birthPref: string; // 出身都道府県
  throws: Throws;
  bats: Bats;
  mainPos: MainPos;
  role: PitcherRole | null; // 投手のみ
  /** 守備位置ごとの適性（0〜100。本職は100） */
  posFit: Partial<Record<FieldPos, number>>;
  bat: BatAbilities;
  pitch: PitchAbilities | null; // 投手のみ
  /** 能力上限（能力ごと） */
  batCap: BatAbilities;
  pitchCap: PitchAbilities | null;
  growthType: GrowthType;
  orderFit: OrderFit;
  // 隠しステータス
  personality: Personality;
  attachment: number; // 愛着 0〜100
  // 試合ごとに変わる値
  condition: number; // 調子 1(絶不調)〜5(絶好調)
  fatigue: number; // 疲労 0〜100
  // 契約・経歴
  salary: number; // 年俸（万円）
  contract: ContractType;
  career: Career;
  proYears: number; // プロ在籍年数
  firstTeamDays: number; // 一軍登録日数の累計
  draftTeamId: number | null; // ドラフトで入団した球団
  teamId: number | null; // 所属球団（null＝無所属）
  level: Level;
  retired: boolean;
}

/** 球場の特性 */
export interface Stadium {
  name: string;
  size: 'small' | 'normal' | 'large'; // 広さ
  fence: 'low' | 'normal' | 'high'; // フェンスの高さ
  terrace: boolean; // ホームランテラス
  dome: boolean; // 屋根（ドーム）
  turf: 'natural' | 'artificial'; // 芝
  seaside: boolean; // 海沿い（風が強い）
}

export interface Logo {
  shape: 'shield' | 'circle' | 'emblem' | 'diamond';
  motif: 'animal' | 'star' | 'wave' | 'bat' | 'none';
  text: string;
  main: string; // 色（#rrggbb）
  sub: string;
}

export interface Team {
  id: number;
  name: string; // 例：「横浜シーガルズ」
  shortName: string; // 略称（全角数文字）
  homePref: string; // 本拠地の都道府県
  stadium: Stadium;
  logo: Logo;
  colorMain: string;
  colorSub: string;
  league: 0 | 1; // 所属リーグ
  isUser: boolean;
}
