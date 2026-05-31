/** 10 积分 = 1 元；stores.balance 存积分 */
const POINTS_PER_YUAN = 10;
const PORTRAIT_POINTS_3 = 10;
const PORTRAIT_POINTS_9 = 30;
const PORTRAIT_POINTS_SINGLE = 3;
const FRAME_POINTS = 99;
const ALBUM_POINTS_MEMBER = 590;
const ALBUM_POINTS_STD = 690;
const PHOTOBOOK_POINTS = 1290;
const INSUFFICIENT_POINTS_MSG = '剩余积分不足，请先充值';

function isPremiumMemberLevel(level) {
  const s = String(level || '');
  return /至尊|荣耀|VIP/i.test(s);
}

function formatBalanceText(points) {
  const n = Math.floor(Number(points) || 0);
  return String(n);
}

function formatWanText(n) {
  const wan = n / 10000;
  if (wan >= 100) {
    return `${Math.round(wan)}w`;
  }
  const rounded = Math.round(wan * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}w` : `${rounded.toFixed(1)}w`;
}

/**
 * 门店积分展示：5 位数及以下原样显示；≥ 10 万用 w
 * @returns {{ text: string, size: 'lg'|'md'|'sm', full: string, compact: boolean }}
 */
function formatBalanceDisplay(points) {
  const n = Math.floor(Number(points) || 0);
  const full = formatBalanceText(n);

  if (n >= 100000000) {
    const yi = Math.round((n / 100000000) * 10) / 10;
    const text = yi % 1 === 0 ? `${yi}亿` : `${yi.toFixed(1)}亿`;
    return { text, size: 'md', full, compact: true };
  }

  if (n >= 100000) {
    return { text: formatWanText(n), size: 'lg', full, compact: true };
  }

  const text = full;
  let size = 'lg';
  if (n >= 1000) {
    size = 'md';
  }
  return { text, size, full, compact: false };
}

function portraitPointsForStyleCount(count) {
  const n = Number(count) || 0;
  if (n >= 9) return PORTRAIT_POINTS_9;
  if (n >= 3) return PORTRAIT_POINTS_3;
  if (n <= 0) return PORTRAIT_POINTS_SINGLE;
  return n * PORTRAIT_POINTS_SINGLE;
}

function pointsToYuan(points) {
  return (Number(points) || 0) / POINTS_PER_YUAN;
}

function formatPointsUsageHint(balance) {
  const b = Number(balance) || 0;
  const shoot9 = Math.floor(b / PORTRAIT_POINTS_9);
  const shoot3 = Math.floor(b / PORTRAIT_POINTS_3);
  const frames = Math.floor(b / FRAME_POINTS);
  return `约 ${shoot9} 次9张 / ${shoot3} 次3张 / ${frames} 个相框`;
}

function formatWalletUsageHint(balance, isMember) {
  const b = Number(balance) || 0;
  const shoot9 = Math.floor(b / PORTRAIT_POINTS_9);
  const frames = Math.floor(b / FRAME_POINTS);
  const albums = Math.floor(b / ALBUM_POINTS_MEMBER);
  if (albums > 0) {
    return `约 ${shoot9} 次 9 张写真 · ${frames} 个相框 · ${albums} 本照片集`;
  }
  return `约 ${shoot9} 次 9 张写真 · ${frames} 个相框`;
}

/** 门店端展示用：单一积分价（套餐赠送已体现优惠，不再区分会员价） */
function getPointsPriceList() {
  const rows = [
    { icon: '📸', name: '9 张写真', points: PORTRAIT_POINTS_9 },
    { icon: '📷', name: '3 张写真', points: PORTRAIT_POINTS_3 },
    { icon: '🔄', name: '单张重试', points: PORTRAIT_POINTS_SINGLE },
    { icon: '🖼', name: '摆台相框', points: FRAME_POINTS },
    { icon: '📖', name: '照片集', points: ALBUM_POINTS_MEMBER },
    { icon: '📕', name: '精装画册', points: PHOTOBOOK_POINTS }
  ];
  return rows.map((row) => ({
    ...row,
    pointsText: formatBalanceText(row.points)
  }));
}

module.exports = {
  POINTS_PER_YUAN,
  PORTRAIT_POINTS_3,
  PORTRAIT_POINTS_9,
  PORTRAIT_POINTS_SINGLE,
  FRAME_POINTS,
  ALBUM_POINTS_MEMBER,
  ALBUM_POINTS_STD,
  PHOTOBOOK_POINTS,
  INSUFFICIENT_POINTS_MSG,
  isPremiumMemberLevel,
  formatBalanceText,
  formatBalanceDisplay,
  portraitPointsForStyleCount,
  pointsToYuan,
  formatPointsUsageHint,
  formatWalletUsageHint,
  getPointsPriceList
};
