/**
 * 解析「银梦畅想」类 Markdown：### F01 名称 + 下一行提示词
 */
const fs = require('fs')

const HEADER_RE = /^###\s+((F|M)(\d{2}))\s+(.+?)\s*$/
const SECTION_FEMALE = /女性风格/
const SECTION_MALE = /男性风格/

function parseStylePromptsMarkdown(content) {
  const lines = String(content || '').split(/\r?\n/)
  const styles = []
  let section = ''

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()

    if (line.includes('女性风格')) section = 'female'
    if (line.includes('男性风格')) section = 'male'

    const m = line.match(HEADER_RE)
    if (!m) continue

    const externalId = m[1].toUpperCase()
    const genderCode = m[2]
    const name = m[4].trim()
    let prompt = ''

    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].trim()
      if (!next) continue
      if (next.startsWith('###')) break
      if (next.startsWith('##')) break
      if (next.startsWith('---')) break
      if (next.startsWith('|')) break
      prompt = next
      break
    }

    if (!prompt) {
      throw new Error(`${externalId} ${name} 缺少提示词段落`)
    }

    const gender = genderCode === 'F' ? '女' : '男'
    styles.push({
      externalId,
      genderCode,
      gender,
      name,
      prompt,
      sort: (genderCode === 'F' ? 0 : 3000) + Number(m[3]) * 10
    })
  }

  if (!styles.length) {
    throw new Error('未解析到任何风格（期望 ### F01 名称 格式）')
  }

  return styles
}

function parseStylePromptsMarkdownFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`找不到数据文件: ${filePath}`)
  }
  const content = fs.readFileSync(filePath, 'utf8')
  return parseStylePromptsMarkdown(content)
}

module.exports = {
  parseStylePromptsMarkdown,
  parseStylePromptsMarkdownFile,
  HEADER_RE
}
