const axios = require('axios');

const DOWNLOAD_TIMEOUT_MS = 30000;

async function downloadSeedreamImage(url) {
  const response = await axios({
    method: 'GET',
    url,
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS
  });
  return Buffer.from(response.data);
}

module.exports = {
  downloadSeedreamImage,
  DOWNLOAD_TIMEOUT_MS
};
