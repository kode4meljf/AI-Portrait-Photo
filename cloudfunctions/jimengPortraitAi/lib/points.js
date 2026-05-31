/** 10 积分 = 1 元；stores.balance 存积分 */
const POINTS_PER_YUAN = 10;
const PORTRAIT_POINTS_3 = 10;
const PORTRAIT_POINTS_9 = 30;
const PORTRAIT_POINTS_SINGLE = 3;
const FRAME_POINTS = 99;
const INSUFFICIENT_POINTS_MSG = '剩余积分不足，请先充值';

function portraitPointsForStyleCount(count) {
  const n = Number(count) || 0;
  if (n >= 9) return PORTRAIT_POINTS_9;
  if (n >= 3) return PORTRAIT_POINTS_3;
  if (n <= 0) return PORTRAIT_POINTS_SINGLE;
  return n * PORTRAIT_POINTS_SINGLE;
}

module.exports = {
  POINTS_PER_YUAN,
  PORTRAIT_POINTS_3,
  PORTRAIT_POINTS_9,
  PORTRAIT_POINTS_SINGLE,
  FRAME_POINTS,
  INSUFFICIENT_POINTS_MSG,
  portraitPointsForStyleCount
};
