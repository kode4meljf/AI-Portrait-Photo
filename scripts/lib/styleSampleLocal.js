const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const CROP_PY = path.join(__dirname, '..', 'crop-style-sample.py')
const CROP_LANDSCAPE_PY = path.join(__dirname, '..', 'crop-landscape-sample.py')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function findSampleRawPath(sampleDir, externalId) {
  if (!sampleDir || !externalId) return null
  const base = externalId.toLowerCase()
  const names = [
    `${externalId}.jpg`,
    `${externalId}.jpeg`,
    `${externalId}.png`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.png`,
    `style-${base}.jpg`
  ]
  for (const name of names) {
    const p = path.join(sampleDir, name)
    if (fs.existsSync(p)) return p
  }
  return null
}

function cropSampleToJpeg(srcPath, destPath) {
  execSync(`python3 "${CROP_PY}" "${srcPath}" "${destPath}"`, { stdio: 'pipe' })
  return destPath
}

function cropLandscape43ToJpeg(srcPath, destPath) {
  execSync(`python3 "${CROP_LANDSCAPE_PY}" "${srcPath}" "${destPath}"`, { stdio: 'pipe' })
  return destPath
}

function readJpegBase64(filePath) {
  return fs.readFileSync(filePath).toString('base64')
}

function prepareSampleBase64(srcPath, workDir, externalId) {
  const ext = path.extname(srcPath).toLowerCase()
  const out = path.join(workDir, `${externalId}-sample.jpg`)
  if (ext === '.jpg' || ext === '.jpeg') {
    cropSampleToJpeg(srcPath, out)
  } else {
    cropSampleToJpeg(srcPath, out)
  }
  return readJpegBase64(out)
}

module.exports = {
  sleep,
  findSampleRawPath,
  cropSampleToJpeg,
  cropLandscape43ToJpeg,
  readJpegBase64,
  prepareSampleBase64
}
