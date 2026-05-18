#!/usr/bin/env node
/** 打印各风格样图用的裁切友好完整 prompt（供 Cursor GenerateImage） */
const { buildAllStyleSampleImagePrompts } = require('./styleSampleImagePrompt')

for (const row of buildAllStyleSampleImagePrompts()) {
  console.log(`\n=== ${row.id} ${row.name} ===\n${row.prompt}\n`)
}
