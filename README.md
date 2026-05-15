# AI写真馆 - 页面清单

## 主包页面

| 页面路径 | 中文名称 | 说明 |
|---------|---------|------|
| `/pages/index/index` | 首页 | 入口页面，拍照入口 |
| `/pages/gallery/gallery` | 云相册 | 用户AI生成照片展示 |
| `/pages/order-list/order-list` | 订单列表 | 订单管理 |
| `/pages/profile/profile` | 我的 | 用户中心 |

## 云功能页面 (cloud)

| 页面路径 | 中文名称 | 说明 |
|---------|---------|------|
| `/pages/cloud/browse/browse` | 浏览风格 | 浏览AI生成风格模板 |
| `/pages/cloud/photo-edit/photo-edit` | 编辑照片 | 照片编辑功能 |
| `/pages/cloud/style-selector/style-selector` | 选择风格 | 选择AI生成风格 |
| `/pages/cloud/change-original/change-original` | 更换原图 | 更换原始照片 |

## 订单页面 (order)

| 页面路径 | 中文名称 | 说明 |
|---------|---------|------|
| `/pages/order/order-detail/order-detail` | 订单详情 | 查看订单详细信息 |
| `/pages/order/frame-template/frame-template` | 相框模板 | 选择相框模板下单 |

## 门店/客户页面 (profile)

| 页面路径 | 中文名称 | 说明 |
|---------|---------|------|
| `/pages/profile/customer-list/customer-list` | 客户列表 | 客户管理列表 |
| `/pages/profile/recharge/recharge` | 充值 | 用户充值页面 |
| `/pages/profile/unchecked-list/unchecked-list` | 未审核列表 | 待审核订单列表 |
| `/pages/profile/edit-store/edit-store` | 编辑门店 | 门店信息编辑 |
| `/pages/profile/customer-edit/customer-edit` | 编辑客户 | 客户信息编辑 |

---

## 组件

| 组件路径 | 说明 |
|---------|------|
| `/components/customer-picker/customer-picker` | 客户选择器 |

---

## 更新日志

- 2026-05-15: 重构项目结构，取消分包机制，所有页面迁移至 pages/ 目录
