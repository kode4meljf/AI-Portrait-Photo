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

### 管理后台 · 静态托管上线

仓库已备好：

- `admin-web/.env.production` — 生产 API 地址（build 时打入前端）
- `admin-web/cloudbaserc.json` — 云开发环境 ID 与 SPA 路由回退
- `npm run build:admin` — 仅构建
- `npm run deploy:admin` — 构建并上传到静态网站托管（需先 `tcb login`）

控制台开通静态托管、首次上传等步骤见下方「静态托管上线清单」。

#### 静态托管上线清单（需人工）

1. [微信云开发控制台](https://console.cloud.tencent.com/tcb) → 环境 `ai-ymcx-d0gcwabfjd375ffae` → **静态网站托管** → **开通**
2. 云函数 **adminApi** → **HTTP 访问服务** 已开启，URL 与 `.env.production` 中一致
3. 本机：`cd admin-web && npm install` → `npx tcb login` → 仓库根目录 `npm run deploy:admin`（无需全局安装 CLI）
4. 控制台 **静态网站托管 → 基础配置**：索引文档 `index.html`，错误文档 `index.html`（与 cloudbaserc rewrites 二选一即可）
5. 浏览器打开托管默认域名，用 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录验证
6. （可选）域名管理 → 绑定自有域名

### 云函数

进入各云函数目录执行 `npm install` 后，在微信开发者工具中部署。

`adminApi` 需在云控制台配置环境变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ADMIN_USERNAME` | 是 | 后台登录用户名 |
| `ADMIN_PASSWORD` | 是 | 后台登录密码 |
| `ADMIN_JWT_SECRET` | 是 | 登录 token 签名密钥（随机长字符串） |
| `ADMIN_VERIFY_PHONE` | 是 | 资产调整短信验证码接收手机号（11 位） |
| `ADMIN_SMS_MOCK` | 否 | 开发：`true` 时不发真实短信，验证码固定 `123456`（见 `ADMIN_SMS_MOCK_CODE`） |
| `TENCENT_SECRET_ID` | 生产 | 腾讯云 API 密钥（发短信） |
| `TENCENT_SECRET_KEY` | 生产 | 腾讯云 API 密钥 |
| `SMS_SDK_APP_ID` | 生产 | 短信应用 SdkAppId |
| `SMS_TEMPLATE_ID` | 生产 | 验证码模板 ID（模板变量为验证码） |
| `SMS_SIGN_NAME` | 生产 | 短信签名 |

部署 `adminApi` 前在 `cloudfunctions/adminApi` 执行 `npm install`（含 `tencentcloud-sdk-nodejs`）。

**物流查询（快递100）**：在 **orderApi**、**customer** 云函数环境变量中配置：

| 变量 | 必填 | 说明 |
|------|------|------|
| `KUAIDI100_CUSTOMER` | 是 | 快递100 授权码（customer） |
| `KUAIDI100_KEY` | 是 | 快递100 密钥（用于签名） |

未配置或查不到轨迹时，小程序展示「暂无物流信息」；有运单号时会自动识别快递公司（顺丰/圆通/中通等）。查询结果缓存约 15 分钟。

**资产调整**：门店详情 → 调整资产 → 获取验证码（发至 `ADMIN_VERIFY_PHONE`）→ 输入验证码 → 验证并生效。

## 云环境

小程序 `miniprogram/app.js` 中的云开发 `env` 需与微信云控制台环境一致。

## 云数据库

顾客注册（V1 双端）会用到**新集合** `customer_register_invites`，并在 `customers` 上增加 `wxOpenId`、`source` 等字段；联系平台依赖 `platform_settings` 文档 `default`。

**首次上线前请阅读：** [docs/database.md](docs/database.md)（含字段说明、建议索引、权限与初始化步骤）。

> 说明：云开发会在云函数**首次写入**时自动创建集合，但不会自动帮你配权限/索引/初始文档，需要按文档在云控制台补全。
