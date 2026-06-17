/**
 * adminApi 登录凭据：CLI 参数 > 环境变量 > .env 文件
 */
const fs = require('fs')
const path = require('path')
const readline = require('readline')

const DEFAULT_API =
  'https://ai-ymcx-d0gcwabfjd375ffae-1428050257.ap-shanghai.app.tcloudbase.com/adminApi'

function parseDotenv(content) {
  const out = {}
  for (const line of String(content || '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {}
  return parseDotenv(fs.readFileSync(filePath, 'utf8'))
}

function parseCliCredentials(argv) {
  const flags = {
    checkLogin: false,
    interactive: false,
    help: false
  }
  const positional = []
  const values = {}

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check-login' || arg === '-c') flags.checkLogin = true
    else if (arg === '--interactive' || arg === '-i') flags.interactive = true
    else if (arg === '--help' || arg === '-h') flags.help = true
    else if (arg === '--no-images') flags.skipImages = true
    else if (arg === '--yes-delete') flags.yesDelete = true
    else if (arg === '--no-delete') flags.noDelete = true
    else if (arg === '--username' || arg === '-u') values.username = argv[++i]
    else if (arg === '--password' || arg === '-p') values.password = argv[++i]
    else if (arg === '--env-file' || arg === '-e') values.envFile = argv[++i]
    else if (arg === '--api') values.api = argv[++i]
    else if (arg.startsWith('--')) flags.unknown = arg
    else positional.push(arg)
  }

  return { flags, positional, values }
}

function resolveCredentials(argv) {
  const { flags, positional, values } = parseCliCredentials(argv)

  const envFiles = [
    values.envFile,
    path.join(__dirname, '.env.backup'),
    path.join(__dirname, '..', '.env.backup'),
    path.join(__dirname, '..', 'admin-web', '.env.local')
  ].filter(Boolean)

  let fileVars = {}
  for (const file of envFiles) {
    const loaded = loadEnvFile(file)
    if (Object.keys(loaded).length) {
      fileVars = { ...fileVars, ...loaded, _envFile: file }
      break
    }
  }

  const username = (
    values.username ||
    process.env.ADMIN_USERNAME ||
    fileVars.ADMIN_USERNAME ||
    'admin'
  ).trim()

  const password =
    values.password ??
    process.env.ADMIN_PASSWORD ??
    fileVars.ADMIN_PASSWORD ??
    'admin123'

  const api =
    values.api ||
    process.env.ADMIN_API_URL ||
    fileVars.ADMIN_API_URL ||
    fileVars.VITE_API_BASE_URL ||
    DEFAULT_API

  return {
    flags,
    outDir: positional[0] || '',
    api,
    username,
    password,
    envFile: fileVars._envFile || values.envFile || null,
    source: {
      username: values.username
        ? 'cli'
        : process.env.ADMIN_USERNAME
          ? 'env'
          : fileVars.ADMIN_USERNAME
            ? 'file'
            : 'default',
      password: values.password
        ? 'cli'
        : process.env.ADMIN_PASSWORD
          ? 'env'
          : fileVars.ADMIN_PASSWORD
            ? 'file'
            : 'default'
    }
  }
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

/** 交互确认，仅 y/Y 为 true，其余（含 n、回车）为 false */
async function promptYesNo(question, { defaultNo = true } = {}) {
  if (!process.stdin.isTTY) return false
  const hint = defaultNo ? ' [y/N]' : ' [Y/n]'
  const answer = (await promptLine(`${question}${hint}: `)).trim().toLowerCase()
  if (!answer) return !defaultNo
  return answer === 'y' || answer === 'yes'
}

function promptHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    if (!stdin.isTTY) {
      resolve('')
      return
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let pwd = ''
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(pwd)
      } else if (char === '\u0003') {
        process.exit(130)
      } else if (char === '\u007f') {
        pwd = pwd.slice(0, -1)
      } else {
        pwd += char
      }
    }
    stdin.on('data', onData)
  })
}

async function maybePromptCredentials(creds) {
  if (!creds.flags.interactive) return creds
  if (!process.stdin.isTTY) {
    throw new Error('交互模式需要终端（TTY），请改用 --username / --password 或 .env.backup')
  }
  const username = (await promptLine('用户名: ')).trim() || creds.username
  const password = await promptHidden('密码: ')
  return { ...creds, username, password, source: { username: 'interactive', password: 'interactive' } }
}

function printCredentialHint(creds) {
  console.log(`adminApi: ${creds.api}`)
  console.log(`用户名: ${creds.username} (来源: ${creds.source.username})`)
  console.log(`密码: ${'*'.repeat(Math.min(creds.password.length, 12))}，共 ${creds.password.length} 字符 (来源: ${creds.source.password})`)
  if (creds.envFile) console.log(`凭据文件: ${creds.envFile}`)
  if (creds.source.password === 'default') {
    console.warn('警告: 正在使用默认密码 admin123；生产环境几乎一定不正确')
  }
  if (creds.password !== creds.password.trim()) {
    console.warn('警告: 密码首尾含空白字符，可能导致校验失败')
  }
}

function printHelp() {
  console.log(`用法:
  npm run backup:styles
  node scripts/backup-style-templates.js [输出目录] [选项]

选项:
  --check-login, -c     仅测试登录，不导出
  --interactive, -i     终端交互输入用户名密码（推荐，避免 shell 转义问题）
  --username, -u NAME   用户名
  --password, -p PASS   密码（含特殊字符时优先用此方式或 -i）
  --env-file, -e PATH   从 .env 文件读取 ADMIN_USERNAME / ADMIN_PASSWORD
  --api URL             覆盖 adminApi 地址
  --no-images           不下载样图
  --yes-delete          备份后自动删除云库记录（非交互，慎用）
  --no-delete           备份后不询问、不删除（非交互）
  --help, -h            显示帮助

凭据优先级: CLI 参数 > 环境变量 > scripts/.env.backup > .env.backup > admin-web/.env.local

推荐创建 scripts/.env.backup（勿提交 git）:
  ADMIN_USERNAME=你的用户名
  ADMIN_PASSWORD=你的密码
  ADMIN_API_URL=https://.../adminApi

若网页后台能登录但脚本报错，常见原因:
  1. 密码含 ! $ & 等字符，shell 改写环境变量 → 用 -i 或 --password
  2. npm run 未带上环境变量 → 写入 .env.backup 或用 --env-file
  3. 云函数 ADMIN_USERNAME 与网页登录名不一致（区分大小写、空格）
`)
}

module.exports = {
  DEFAULT_API,
  resolveCredentials,
  maybePromptCredentials,
  printCredentialHint,
  printHelp,
  loadEnvFile,
  promptYesNo
}
