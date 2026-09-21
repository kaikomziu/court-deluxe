// 裁判官BOTのセリフ生成(すべてテンプレートによる決定論的な文章生成。外部AI呼び出しはしない)
function rolesInRoom(participants, roleKey) {
  return participants.filter((p) => p.role_key === roleKey && p.nickname);
}

function nicknameList(list) {
  return list.map((p) => p.nickname).join('・');
}

export function openingMessage(topic) {
  return `【開廷】ただいまより審議を開始します。本日の議題は――\n\n「${topic}」\n\nについてです。関係者は着席の上、それぞれの立場から意見を述べてください。`;
}

export function introduceParticipants(rolesConfig, participants) {
  const lines = [];
  for (const role of rolesConfig) {
    const members = rolesInRoom(participants, role.key);
    if (members.length === 0) continue;
    lines.push(`${role.icon || ''} ${role.label}: ${nicknameList(members)}`);
  }
  if (lines.length === 0) {
    return '出席者の役職確認ができませんでした。各自役職を選択してください。';
  }
  return '出席の確認をします。\n' + lines.join('\n');
}

export function explainProcedure() {
  return 'これより順番に発言を求めます。指名されていない方も、挙手のうえ自由に発言して構いません。傍聴人の方も⭐印で重要だと思う発言にマークをつけてください。議論が出尽くしたら、誰でも「まとめを求める」ボタンで本日の論点整理を依頼できます(裁判官は判決を下しません、あくまで論点の整理のみ行います)。';
}

export function callOnRole(role, participants) {
  const members = rolesInRoom(participants, role.key);
  const who = members.length > 0 ? nicknameList(members) : `(${role.label}の方)`;
  return `それでは ${role.icon || ''}${role.label} の ${who} さん、ご意見をどうぞ。`;
}

export function callOnFreeDiscussion() {
  return '一通りの立場からの意見が出ました。ここからは自由討論とします。傍聴人の方々も含め、質問や反論があれば自由に発言してください。';
}

export function noOneToCall() {
  return '指名できる役職者がいないため、このまま自由討論とします。皆さん、自由にご発言ください。';
}

function pickRepresentativeMessage(messages) {
  if (messages.length === 0) return null;
  const starred = messages.filter((m) => m.star_count > 0);
  const pool = starred.length > 0 ? starred : messages;
  return pool.reduce((best, m) => {
    if (!best) return m;
    if (m.star_count !== best.star_count) return m.star_count > best.star_count ? m : best;
    return new Date(m.created_at) > new Date(best.created_at) ? m : best;
  }, null);
}

export function buildSummary(rolesConfig, messages) {
  const chatMessages = messages.filter((m) => m.kind === 'chat');
  if (chatMessages.length === 0) {
    return '【審議まとめ】発言が記録されていないため、まとめる論点がありません。これにて本日の審議を終了します。';
  }

  const lines = [];
  for (const role of rolesConfig) {
    const roleMessages = chatMessages.filter((m) => m.role_key === role.key);
    const rep = pickRepresentativeMessage(roleMessages);
    if (!rep) continue;
    const marker = rep.star_count > 0 ? ` (⭐${rep.star_count})` : '';
    lines.push(`・${role.label}(${rep.nickname})${marker}: 「${rep.body}」`);
  }

  const header = '【審議まとめ】\n本日の議論で出た主な意見は以下の通りです。\n';
  const body = lines.length > 0 ? lines.join('\n') : '(まとめられる発言がありませんでした)';
  const footer = '\n\n以上、双方(全員)の主張を記録として整理しました。本ツールは判決や勝敗を下すものではありません。これにて本日の審議は終了とします。';
  return header + body + footer;
}
