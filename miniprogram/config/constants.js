/**
 * @file 全局常量配置
 */

const STYLE_TEMPLATES_COLLECTION = 'style_templates';

/**
 * 当前小程序登录主体（开发阶段用配置切换，注册上线后改由账号数据决定）
 * - store: 门店
 * - personal: 个人
 */
const ACCOUNT_TYPE = 'store';

const PROFILE_COLLECTION = {
  store: 'stores',
  personal: 'personal_profile'
};

module.exports = {
  STYLE_TEMPLATES_COLLECTION,
  ACCOUNT_TYPE,
  PROFILE_COLLECTION
};
