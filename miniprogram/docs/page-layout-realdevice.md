# 小程序真机页面布局规范

## 问题现象

- 开发者工具正常，**真机白屏或只见导航栏**
- 常见于表单页、列表页

## 根因（已多次踩坑）

`scroll-view` 放在 `display:flex` 容器内，并写：

```css
.scroll-area {
  flex: 1;
  height: 0; /* 或仅 min-height:0 且无显式高度 */
}
```

在部分 iOS / Android 真机上，`scroll-view` **计算高度为 0**，子内容不可见。

## 推荐做法（按优先级）

### 1. 页面级滚动（首选）

与 `pages/join/join`、`customer-list` 一致：

- 根节点 `min-height: 100vh`，**不用** `scroll-view`
- 内容自然撑开，由页面本身滚动

### 2. 必须用 scroll-view 时

- **禁止** `flex:1` + `height:0` 且无 JS 显式高度
- 在 `onReady` 用 `wx.getWindowInfo().windowHeight` 设 `style="height: {{scrollViewHeight}}px"`
- 参考：`packageStore/pages/order/order-detail/order-detail.js` → `updateScrollViewHeight`

### 3. flex 内普通 view 滚动

`edit-store` 用法：`flex:1` + `overflow-y:auto`（**非** scroll-view 组件）

## 布局审计（防回归）

工具：`miniprogram/utils/pageLayoutGuard.js`

```js
const { auditPageLayout } = require('../../utils/pageLayoutGuard')

Page({
  onReady() {
    auditPageLayout(this, {
      pageRoute: 'pages/launch/create-store',
      selectors: ['.create-page', '.create-page-body']
    })
  }
})
```

- 异常会 `console.error('[pageLayoutGuard]', …)` 并写入本地 `PAGE_LAYOUT_ISSUES`（最多 30 条）
- 调试：开发者工具 Storage 查看，或 `getLayoutIssueReports()`

## 新页自检清单

- [ ] 是否必须用 `scroll-view`？否 → 用页面级滚动
- [ ] 是否出现 `height: 0` / `min-height: 0` 撑 flex 的 scroll-view？
- [ ] 是否在 `onReady` 调用 `auditPageLayout`（表单/分包首屏页建议必加）
- [ ] 真机预览：iOS + Android 各测一次

## 已接入审计的页面

| 页面 | 路由 |
|------|------|
| 创建门店 | `pages/launch/create-store` |
| 加入门店 | `pages/join/join`（页面级滚动，无 scroll-view） |
