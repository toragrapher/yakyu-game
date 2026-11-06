// AI球団を自動で作るときの候補（架空）。実在球団の愛称は使わない。

/** 本拠地の候補：地名と都道府県、海沿いかどうか */
export const CITY_CANDIDATES: readonly { city: string; pref: string; seaside: boolean }[] = [
  { city: '札幌', pref: '北海道', seaside: false },
  { city: '函館', pref: '北海道', seaside: true },
  { city: '仙台', pref: '宮城県', seaside: false },
  { city: '盛岡', pref: '岩手県', seaside: false },
  { city: '新潟', pref: '新潟県', seaside: true },
  { city: '宇都宮', pref: '栃木県', seaside: false },
  { city: '水戸', pref: '茨城県', seaside: false },
  { city: '東京', pref: '東京都', seaside: false },
  { city: '八王子', pref: '東京都', seaside: false },
  { city: '横浜', pref: '神奈川県', seaside: true },
  { city: '川崎', pref: '神奈川県', seaside: true },
  { city: '千葉', pref: '千葉県', seaside: true },
  { city: '大宮', pref: '埼玉県', seaside: false },
  { city: '静岡', pref: '静岡県', seaside: true },
  { city: '浜松', pref: '静岡県', seaside: false },
  { city: '名古屋', pref: '愛知県', seaside: false },
  { city: '金沢', pref: '石川県', seaside: true },
  { city: '京都', pref: '京都府', seaside: false },
  { city: '大阪', pref: '大阪府', seaside: false },
  { city: '堺', pref: '大阪府', seaside: true },
  { city: '神戸', pref: '兵庫県', seaside: true },
  { city: '岡山', pref: '岡山県', seaside: false },
  { city: '広島', pref: '広島県', seaside: true },
  { city: '松山', pref: '愛媛県', seaside: true },
  { city: '高知', pref: '高知県', seaside: true },
  { city: '北九州', pref: '福岡県', seaside: true },
  { city: '福岡', pref: '福岡県', seaside: true },
  { city: '熊本', pref: '熊本県', seaside: false },
  { city: '鹿児島', pref: '鹿児島県', seaside: true },
  { city: '那覇', pref: '沖縄県', seaside: true },
];

/** 愛称の候補（球団設立画面の候補一覧にも使う） */
export const NICKNAME_CANDIDATES: readonly string[] = [
  'シーガルズ', 'ファルコンズ', 'ウルブズ', 'スティーラーズ', 'ブレイブス', 'コメッツ',
  'サンダース', 'ペガサス', 'ドルフィンズ', 'レッドフォックス', 'グリフォンズ', 'オーシャンズ',
  'スターズ', 'ブリザーズ', 'フェニックス', 'ナイツ', 'マーベリックス', 'ハリケーンズ',
  'ストームズ', 'ベアーズ', 'ホーネッツ', 'クレインズ', 'パンサーズ', 'ルーキーズ',
];

/** チームカラーの候補（メイン、サブ） */
export const COLOR_CANDIDATES: readonly [string, string][] = [
  ['#c8102e', '#1b1b1b'], ['#0b3d91', '#f2a900'], ['#006747', '#ffffff'], ['#f47920', '#002d62'],
  ['#5b2c83', '#e8c547'], ['#00a3e0', '#0b2340'], ['#8a1538', '#c9a227'], ['#1b1b1b', '#e03a3e'],
  ['#2e7d32', '#fdd835'], ['#ad1457', '#ffffff'], ['#283593', '#e53935'], ['#00897b', '#ff7043'],
];

export const STADIUM_SUFFIXES: readonly string[] = ['スタジアム', '球場', 'ボールパーク', 'ドーム', 'フィールド'];
