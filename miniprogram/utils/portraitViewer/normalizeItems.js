const { isPortraitGenerating } = require('../jimengPortraitAi.js');
const { portraitFailPresentation } = require('../portraitBilling.js');

function mapGenerateStatus(photo) {
  const genStatus = photo.generateStatus || 'pending';
  if (genStatus === 'failed') return 'failed';
  if (isPortraitGenerating(genStatus)) return 'generating';
  if (photo.isGenerated && photo.aiUrl) return 'success';
  if (genStatus === 'completed' && photo.aiUrl) return 'success';
  return 'pending';
}

/**
 * 云相册 photos 行 → 与 generate-result results[] 同构
 */
function normalizePhotoRow(photo) {
  const status = mapGenerateStatus(photo);
  const url = photo.aiUrl || photo.originalUrl || '';
  const failMeta = status === 'failed' ? portraitFailPresentation(photo.errorMsg) : {};
  return {
    id: photo.styleId || photo._id,
    photoId: photo._id,
    styleId: photo.styleId || '',
    name: photo.styleName || '',
    url,
    status,
    errorMsg: photo.errorMsg || '',
    ...failMeta,
    imageMode: 'portrait',
    aspectRatio: 3 / 4
  };
}

function normalizePhotos(photos) {
  return (photos || []).map(normalizePhotoRow);
}

function countDownloadable(items) {
  const list = items || [];
  const total = list.length;
  const ready = list.filter((item) => item.status === 'success' && item.url).length;
  return { ready, total };
}

function downloadCountText(items) {
  const { ready, total } = countDownloadable(items);
  return total > 0 ? `${ready}/${total}` : '';
}

module.exports = {
  normalizePhotoRow,
  normalizePhotos,
  countDownloadable,
  downloadCountText
};
