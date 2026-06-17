#!/usr/bin/env node
/**
 * 备份云库 style_templates 全部记录，并可选下载样图
 * 用法：npm run backup:styles -- --interactive
 * 详见：node scripts/backup-style-templates.js --help
 */
const fs = require('fs')
const path = require('path')
const {
  resolveCredentials,
  maybePromptCredentials,
  printCredentialHint,
  printHelp,
  promptYesNo
} = require('./adminApiCredentials')

function parseArgs(flags) {
  return {
    skipImages: Boolean(flags.skipImages),
    checkLogin: Boolean(flags.checkLogin),
    yesDelete: Boolean(flags.yesDelete),
    noDelete: Boolean(flags.noDelete)
  }
}

function timestampDirName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function defaultOutDir() {
  return path.join(__dirname, '..', 'backup', 'style-templates', timestampDirName())
}

async function post(api, body, token) {
  const res = await fetch(api, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  })
  const json = await res.json()
  if (!json.success) {
    const err = json.error || JSON.stringify(json)
    if (body.action === 'login') {
      throw new Error(
        `${err}\n\n登录失败排查:\n` +
          '  • 网页后台能登录时，请用: npm run backup:styles -- --interactive\n' +
          '  • 或创建 scripts/.env.backup（参考 scripts/.env.backup.example）\n' +
          '  • 密码含特殊字符不要用 shell 的 export，改用 --password 或 -i\n' +
          '  • 用户名区分大小写，且须与云函数 adminApi 环境变量 ADMIN_USERNAME 完全一致'
      )
    }
    throw new Error(err)
  }
  return json.data
}

function extFromUrl(url, fallback = '.jpg') {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 5) return ext
  } catch (_) {
    /* ignore */
  }
  return fallback
}

async function downloadFile(url, destPath) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buf)
  return buf.length
}

async function backupSampleImages(rows, samplesDir) {
  fs.mkdirSync(samplesDir, { recursive: true })
  const results = []

  for (const row of rows) {
    const tasks = [
      { field: 'sampleUrl', suffix: '' },
      { field: 'sampleThumbUrl', suffix: '-thumb' }
    ]

    for (const task of tasks) {
      const url = String(row[task.field] || '').trim()
      if (!url || !url.startsWith('http')) continue

      const styleId = row.id || row._id || 'unknown'
      const ext = extFromUrl(url)
      const filename = `${styleId}${task.suffix}${ext}`
      const destPath = path.join(samplesDir, filename)

      try {
        const bytes = await downloadFile(url, destPath)
        results.push({ id: styleId, file: filename, bytes, ok: true })
        console.log(`  ✓ 样图 ${filename} (${bytes} bytes)`)
      } catch (err) {
        results.push({ id: styleId, file: filename, ok: false, error: err.message })
        console.warn(`  ✗ 样图 ${filename} 下载失败: ${err.message}`)
      }
    }
  }

  return results
}

async function deleteBackedUpStyles(api, token, rows) {
  const deleted = []
  const failed = []

  for (const row of rows) {
    const docId = row._id
    const label = `${row.id || docId} ${row.name || ''}`.trim()
    if (!docId) {
      failed.push({ id: row.id, name: row.name, error: '缺少 _id' })
      continue
    }
    try {
      await post(api, { action: 'styles.delete', _id: docId }, token)
      deleted.push({ _id: docId, id: row.id, name: row.name })
      console.log(`  ✓ 已删除 ${label}`)
    } catch (err) {
      failed.push({ _id: docId, id: row.id, name: row.name, error: err.message })
      console.warn(`  ✗ 删除失败 ${label}: ${err.message}`)
    }
  }

  return { deleted, failed }
}

async function maybeDeleteAfterBackup(api, token, rows, options) {
  if (!rows.length) return { prompted: false, confirmed: false, deleted: [], failed: [] }

  const { yesDelete, noDelete } = options
  let confirmed = false

  if (yesDelete && noDelete) {
    throw new Error('不能同时使用 --yes-delete 与 --no-delete')
  }
  if (noDelete) {
    console.log('\n已跳过删除（--no-delete）')
    return { prompted: false, confirmed: false, deleted: [], failed: [] }
  }
  if (yesDelete) {
    confirmed = true
    console.log(`\n将删除云库中刚备份的 ${rows.length} 条风格模板（--yes-delete）…`)
  } else {
    if (!process.stdin.isTTY) {
      console.log('\n非交互终端，已保留云库记录（可用 --yes-delete 或 --no-delete 显式控制）')
      return { prompted: false, confirmed: false, deleted: [], failed: [] }
    }
    console.log('\n即将删除的风格：')
    rows.forEach((row) => {
      console.log(`  ${row.id || '-'} ${row.name || ''}`)
    })
    confirmed = await promptYesNo(
      `是否删除云库中刚备份的 ${rows.length} 条风格模板？输入 y 删除，输入 n 保留`
    )
    if (!confirmed) {
      console.log('已保留云库记录。')
      return { prompted: true, confirmed: false, deleted: [], failed: [] }
    }
    console.log('\n正在删除云库记录…')
  }

  const { deleted, failed } = await deleteBackedUpStyles(api, token, rows)
  console.log(`\n删除完成: 成功 ${deleted.length} 条，失败 ${failed.length} 条`)
  return { prompted: !yesDelete, confirmed: true, deleted, failed }
}

async function main() {
  let creds = resolveCredentials(process.argv.slice(2))
  if (creds.flags.help) {
    printHelp()
    return
  }

  creds = await maybePromptCredentials(creds)
  const { skipImages, checkLogin, yesDelete, noDelete } = parseArgs(creds.flags)

  printCredentialHint(creds)

  const login = await post(
    creds.api,
    { action: 'login', username: creds.username, password: creds.password }
  )

  if (checkLogin) {
    console.log('\n✓ 登录成功')
    console.log(`  用户: ${login.user?.username || creds.username}`)
    console.log(`  token 有效期: ${Math.round((login.expiresIn || 0) / 86400000)} 天`)
    return
  }

  const outDir = creds.outDir ? path.resolve(creds.outDir) : defaultOutDir()
  const samplesDir = path.join(outDir, 'samples')
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`输出目录: ${outDir}`)

  const list = await post(
    creds.api,
    { action: 'styles.list', page: 1, pageSize: 100 },
    login.token
  )
  const rows = list.list || []

  const payload = {
    exportedAt: new Date().toISOString(),
    source: {
      api: creds.api,
      collection: 'style_templates'
    },
    summary: {
      total: list.total,
      enabledCount: list.enabledCount,
      exportedCount: rows.length
    },
    styles: rows
  }

  const jsonPath = path.join(outDir, 'style_templates.json')
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`\n已导出 ${rows.length} 条风格 → ${jsonPath}`)
  rows.forEach((row) => {
    console.log(`  ${row.id || '-'} ${row.name || ''} ${row.enabled === false ? '(停用)' : ''}`)
  })

  let imageResults = []
  if (!skipImages) {
    console.log('\n下载样图…')
    imageResults = await backupSampleImages(rows, samplesDir)
    const okCount = imageResults.filter((r) => r.ok).length
    console.log(`样图: ${okCount}/${imageResults.length} 成功`)
  } else {
    console.log('\n跳过样图下载 (--no-images)')
  }

  console.log(`\n备份完成: ${outDir}`)

  const deletion = await maybeDeleteAfterBackup(creds.api, login.token, rows, {
    yesDelete,
    noDelete
  })

  const manifestPath = path.join(outDir, 'manifest.json')
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(
      {
        exportedAt: payload.exportedAt,
        outDir,
        jsonPath,
        samplesDir: skipImages ? null : samplesDir,
        summary: payload.summary,
        images: imageResults,
        deletion: {
          prompted: deletion.prompted,
          confirmed: deletion.confirmed,
          deletedCount: deletion.deleted.length,
          failedCount: deletion.failed.length,
          deleted: deletion.deleted,
          failed: deletion.failed
        }
      },
      null,
      2
    )}\n`,
    'utf8'
  )
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
