export const CUSTOMER_AVATAR_SIZE = 400
export const CUSTOMER_AVATAR_MAX_BYTES = 3 * 1024 * 1024

export const CUSTOMER_AVATAR_TIP =
  '支持 JPG/PNG/WebP，单张不超过 3MB；将自动裁为正方形头像'

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片读取失败'))
    }
    img.src = url
  })
}

function cropCenterSquare(img) {
  const srcW = img.naturalWidth || img.width
  const srcH = img.naturalHeight || img.height
  const side = Math.min(srcW, srcH)
  const sx = Math.floor((srcW - side) / 2)
  const sy = Math.floor((srcH - side) / 2)
  return { sx, sy, side }
}

export async function processCustomerAvatarFile(file) {
  if (!file) throw new Error('请选择图片')
  if (file.size > CUSTOMER_AVATAR_MAX_BYTES) {
    throw new Error('图片不能超过 3MB')
  }
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
  if (file.type && !allowed.includes(file.type)) {
    throw new Error('仅支持 JPG、PNG、WebP')
  }

  const img = await loadImageFromFile(file)
  const { sx, sy, side } = cropCenterSquare(img)

  const canvas = document.createElement('canvas')
  canvas.width = CUSTOMER_AVATAR_SIZE
  canvas.height = CUSTOMER_AVATAR_SIZE
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, sx, sy, side, side, 0, 0, CUSTOMER_AVATAR_SIZE, CUSTOMER_AVATAR_SIZE)

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')

  return { base64, previewUrl: dataUrl }
}
