// 役職(タグ)の定義。judge は BOT固定でroles_configには含めない。
export const JUDGE_ROLE = { key: 'judge', label: '裁判官', color: '#b8860b', icon: '⚖️' };
export const AUDIENCE_ROLE = { key: 'audience', label: '傍聴人', color: '#7f8c8d', icon: '👥' };
export const SYSTEM_ROLE = { key: 'system', label: '進行', color: '#95a5a6', icon: '📋' };

// 部屋作成時に人数を設定できる基本タグ一覧(すべて0にすれば使わないタグにできる)
export const ROLE_CATALOG = [
  { key: 'plaintiff', label: '原告・検察官', color: '#c0392b', icon: '📢', defaultCap: 1 },
  { key: 'defendant', label: '被告人', color: '#2c3e50', icon: '🙍', defaultCap: 1 },
  { key: 'defense', label: '弁護人', color: '#2980b9', icon: '🛡️', defaultCap: 1 },
  { key: 'witness', label: '証人', color: '#8e44ad', icon: '🎤', defaultCap: 0 },
];

const CUSTOM_COLORS = ['#16a085', '#d35400', '#27ae60', '#8e44ad', '#2980b9', '#c0392b'];

export function customColor(index) {
  return CUSTOM_COLORS[index % CUSTOM_COLORS.length];
}

export function findRoleMeta(rolesConfig, roleKey) {
  if (roleKey === 'judge') return JUDGE_ROLE;
  if (roleKey === 'audience') return AUDIENCE_ROLE;
  if (roleKey === 'system') return SYSTEM_ROLE;
  const found = (rolesConfig || []).find((r) => r.key === roleKey);
  if (found) return found;
  const catalog = ROLE_CATALOG.find((r) => r.key === roleKey);
  if (catalog) return catalog;
  return { key: roleKey, label: roleKey, color: '#999', icon: '❔' };
}

export function slugifyCustomKey(label, existingKeys) {
  let base = 'custom_' + Array.from(label)
    .map((ch) => ch.codePointAt(0).toString(36))
    .join('')
    .slice(0, 12);
  let key = base;
  let n = 1;
  while (existingKeys.includes(key)) {
    key = base + '_' + n;
    n += 1;
  }
  return key;
}
