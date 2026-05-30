/** 充值套餐（与小程序 recharge 页一致，下单以服务端为准） */
const RECHARGE_PACKAGES = [
  {
    id: 1,
    name: '体验套餐',
    times: 10,
    price: 99,
    originalPrice: 199,
    tag: '限时5折',
    expireDays: 30
  },
  {
    id: 2,
    name: '标准套餐',
    times: 50,
    price: 399,
    originalPrice: 599,
    tag: '推荐',
    expireDays: 30
  },
  {
    id: 3,
    name: '尊享套餐',
    times: 200,
    price: 1299,
    originalPrice: 1999,
    tag: '超值',
    expireDays: 30
  }
];

function listPackages() {
  return RECHARGE_PACKAGES.map((pkg) => ({ ...pkg }));
}

function getPackageById(packageId) {
  const id = Number(packageId);
  return RECHARGE_PACKAGES.find((p) => p.id === id) || null;
}

function yuanToFen(yuan) {
  return Math.round(Number(yuan) * 100);
}

module.exports = {
  RECHARGE_PACKAGES,
  listPackages,
  getPackageById,
  yuanToFen
};
