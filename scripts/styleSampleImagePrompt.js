/**
 * 内置生图（1536×1024 横图）→ 居中裁 3:4 时的构图友好提示词
 * 云库 style_templates.prompt 仅存风格描述，样图生成时再拼接本模块后缀。
 */
const { SEED_STYLES } = require('../cloudfunctions/adminApi/lib/seedStyles')

/** 横图居中裁为 768×1024（3:4）时减少裁切损失 */
const CROP_SAFE_COMPOSITION = [
  'single Asian woman, one person only',
  'subject perfectly centered horizontally in frame',
  'full-body or half-body vertical portrait pose',
  'equal soft empty space on left and right of subject',
  'subject must not touch left or right frame edges',
  'avoid wide panoramic background, avoid group shots',
  'safe for center crop from 1536x1024 landscape to 3:4 vertical',
  'photorealistic, high detail, style reference sample for AI photo studio',
  'no text, no watermark'
].join(', ')

function buildStyleSampleImagePrompt(stylePrompt) {
  const core = String(stylePrompt || '').trim()
  if (!core) throw new Error('缺少风格 prompt')
  return `${core}, ${CROP_SAFE_COMPOSITION}`
}

function buildAllStyleSampleImagePrompts() {
  return SEED_STYLES.map((row) => ({
    id: row.id,
    name: row.name,
    prompt: buildStyleSampleImagePrompt(row.prompt)
  }))
}

module.exports = {
  CROP_SAFE_COMPOSITION,
  buildStyleSampleImagePrompt,
  buildAllStyleSampleImagePrompts,
  SEED_STYLES
}
