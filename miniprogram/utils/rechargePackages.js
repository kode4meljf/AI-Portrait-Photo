const { PORTRAIT_POINTS_9 } = require('./storePoints');

/** 充值页展示的四档套餐 id */
const RECHARGE_CATALOG_IDS = [1, 3, 5, 6];

/** 旧库无新字段时，按 id 补全展示信息 */
const PACKAGE_UI = {
  1: { name: '尝鲜包', slogan: '新客试拍，低门槛体验', group: 'casual', bonusPoints: 0 },
  3: {
    name: '优享包',
    slogan: '客流稳定，性价比之选',
    group: 'casual',
    bonusPoints: 80
  },
  5: {
    name: '至尊套餐',
    slogan: '年度主推 · 会员价 + 约 10% 赠送',
    group: 'annual',
    badge: 'hot',
    bonusPoints: 2000,
    icon: '👑'
  },
  6: {
    name: '荣耀套餐',
    slogan: '高客流门店 · 约 12% 赠送',
    group: 'annual',
    badge: 'crown',
    bonusPoints: 5000,
    icon: '✨✨'
  }
};

/** 库中尚无年度套餐时的兜底（需 payApi 同步 id 5/6 方可真实下单） */
const FALLBACK_PACKAGES = [
  {
    id: 5,
    name: '至尊套餐',
    points: 21800,
    bonusPoints: 2000,
    price: 1980,
    originalPrice: 1980,
    slogan: '年度主推 · 会员价 + 约 10% 赠送',
    group: 'annual',
    badge: 'hot',
    tag: '至尊会员',
    expireDays: 365,
    sort: 100,
    enabled: true
  },
  {
    id: 6,
    name: '荣耀套餐',
    points: 44800,
    bonusPoints: 5000,
    price: 3980,
    originalPrice: 3980,
    slogan: '高客流门店 · 约 12% 赠送',
    group: 'annual',
    badge: 'crown',
    tag: '荣耀会员',
    expireDays: 365,
    sort: 110,
    enabled: true
  }
];

function formatPointsNum(n) {
  return String(Math.floor(Number(n) || 0));
}

function portrait9Hint(points) {
  const n = Math.floor((Number(points) || 0) / PORTRAIT_POINTS_9);
  if (n <= 0) return '';
  if (n === 1) return '约 1 次 9 张写真';
  return `约 ${n} 次 9 张写真`;
}

function enrichPackage(raw) {
  const id = Number(raw.id);
  const ui = PACKAGE_UI[id] || {};
  const points = Number(raw.points) || 0;
  const bonusPoints =
    raw.bonusPoints != null && raw.bonusPoints !== ''
      ? Number(raw.bonusPoints) || 0
      : (ui.bonusPoints || 0);
  const basePoints = Math.max(0, points - bonusPoints);
  const group = raw.group || ui.group || 'casual';
  const eqHint = portrait9Hint(points);
  let subHint = eqHint;
  if (id === 5 && eqHint) {
    subHint = `${eqHint} · 享画册会员价`;
  }

  return {
    ...raw,
    id,
    name: raw.name || ui.name || '积分套餐',
    points,
    bonusPoints,
    price: Number(raw.price) || 0,
    slogan: raw.slogan || ui.slogan || raw.tag || '',
    group,
    badge: raw.badge || ui.badge || '',
    icon: ui.icon || '',
    pointsText: formatPointsNum(basePoints),
    totalPointsText: formatPointsNum(points),
    bonusText: bonusPoints > 0 ? formatPointsNum(bonusPoints) : '',
    eqHint: subHint
  };
}

function mergeFallbackPackages(list) {
  const rows = (Array.isArray(list) ? list.slice() : []).filter((p) =>
    RECHARGE_CATALOG_IDS.includes(Number(p.id))
  );
  const ids = new Set(rows.map((p) => Number(p.id)));
  FALLBACK_PACKAGES.forEach((pkg) => {
    if (!ids.has(pkg.id)) rows.push(pkg);
  });
  return rows;
}

function sortByCatalogOrder(a, b) {
  return RECHARGE_CATALOG_IDS.indexOf(Number(a.id)) - RECHARGE_CATALOG_IDS.indexOf(Number(b.id));
}

function splitPackages(list) {
  const enriched = mergeFallbackPackages(list).map(enrichPackage).sort(sortByCatalogOrder);
  const casualPackages = enriched.filter((p) => p.group !== 'annual');
  const annualPackages = enriched.filter((p) => p.group === 'annual');
  return { enriched, casualPackages, annualPackages };
}

function pickDefaultPackage(enriched) {
  if (!enriched.length) return null;
  return enriched.find((p) => p.id === 3) || enriched[0];
}

module.exports = {
  RECHARGE_CATALOG_IDS,
  enrichPackage,
  mergeFallbackPackages,
  splitPackages,
  pickDefaultPackage,
  formatPointsNum,
  portrait9Hint
};
