---
name: style-sample-image
description: >-
  Generates AI photo studio style sample images via Cursor GenerateImage (1536×1024),
  then center-crops to 3:4 (540×720) without black bars. Use when creating or
  refreshing style_templates sample images, style-s01–s09 assets, or when the user
  mentions style sample generation, 3:4 crop, or styles-raw/styles-34.
---

# 风格样图：横图生成 + 竖裁

## 约束

- 内置 `GenerateImage` 固定输出 **1536×1024**，无法直接出 3:4。
- 云库 `style_templates.prompt` **只存风格描述**，不要写入构图后缀（混元融合仍用原 prompt）。
- 样图生成时用 `scripts/styleSampleImagePrompt.js` 的 `buildStyleSampleImagePrompt(prompt)` 拼接构图说明。
- 裁切只用 `scripts/crop-style-sample.py`（Pillow），**禁止** macOS `sips`。

## 流程

1. 从云库或 `seedStyles.js` 读取风格 `prompt`。
2. `buildStyleSampleImagePrompt(prompt)` 得到完整 description，调用 `GenerateImage`。
3. 保存横图到 `~/Desktop/AI写真/styles-raw/{s01-raw.png,...}`（勿放入 miniprogram）。
4. `node scripts/process-style-sample-images.js` → `~/Desktop/AI写真/styles-34/style-s01.jpg` …
5. `npm run upload:style-samples` 写入 `sampleFileId`。

## 构图后缀要点（已封装在脚本中）

- 单人、水平正中
- 全身或半身竖向主体
- 左右对称留白，人物不贴左右边
- 避免超宽场景与多人

## 命令

```bash
node scripts/print-style-sample-prompts.js   # 查看完整 prompt
node scripts/process-style-sample-images.js  # 批量裁切
node scripts/process-style-sample-images.js S03  # 单张
npm run upload:style-samples
```
