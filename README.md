# AI写真馆（AI-Portrait）

单仓三端结构，职责分离，便于阅读与维护。

## 目录说明

| 目录 | 说明 |
|------|------|
| `miniprogram/` | 微信小程序（页面、组件、静态资源） |
| `cloudfunctions/` | 微信云开发云函数（含 `adminApi` 后台接口） |
| `admin-web/` | 网页管理后台（Vue3 + Element Plus） |

## 开发方式

### 小程序

1. 用**微信开发者工具**打开目录：`miniprogram/`（不是仓库根目录）
2. 云函数根目录已配置为上一级的 `../cloudfunctions/`，可在工具内直接上传部署云函数

### 管理后台

```bash
# 在仓库根目录
npm run dev:admin

# 或进入 admin-web
cd admin-web && npm install && npm run dev
```

默认开发配置见 `admin-web/.env.development`（Mock 模式可用 `admin` / `admin123`）。

### 云函数

进入各云函数目录执行 `npm install` 后，在微信开发者工具中部署。

`adminApi` 需在云控制台配置环境变量：`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`ADMIN_JWT_SECRET`。

## 云环境

小程序 `miniprogram/app.js` 中的云开发 `env` 需与微信云控制台环境一致。
