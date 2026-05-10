const cloud = require('wx-server-sdk');
const tencentcloud = require('tencentcloud-sdk-nodejs');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const secretId = process.env.TENCENT_SECRET_ID;
const secretKey = process.env.TENCENT_SECRET_KEY;
if (!secretId || !secretKey) {
    throw new Error('环境变量 TENCENT_SECRET_ID 或 TENCENT_SECRET_KEY 未设置');
}

const AiartClient = tencentcloud.aiart.v20221229.Client;
const client = new AiartClient({
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'aiart.tencentcloudapi.com' } }
});

async function getTempFileURL(fileID) {
    const res = await cloud.getTempFileURL({ fileList: [fileID] });
    return res.fileList[0].tempFileURL;
}

async function fetchImageBase64(url) {
    const encodedUrl = encodeURI(url);
    const response = await axios.get(encodedUrl, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
}

exports.main = async (event) => {
    console.log('[testImageToImage] 收到参数:', JSON.stringify(event));
    const { imageUrl, prompt } = event;
    if (!imageUrl || !prompt) {
        return { success: false, error: '缺少 imageUrl 或 prompt' };
    }

    try {
        let finalUrl = imageUrl;
        if (imageUrl.startsWith('cloud://')) {
            finalUrl = await getTempFileURL(imageUrl);
        }
        const imageBase64 = await fetchImageBase64(finalUrl);
        console.log(`[testImageToImage] 输入图片 Base64 长度: ${imageBase64.length}`);

        const submitParams = {
            InputImage: imageBase64,
            Prompt: prompt,
            ResultConfig: { Resolution: '1024:1024' },
            LogoAdd: 0
        };
        // 直接调用 ImageToImage 接口（同步）
        const response = await client.ImageToImage(submitParams);
        console.log('[testImageToImage] 接口返回:', JSON.stringify(response));

        if (response.ResultImage) {
            return { success: true, imageBuffer: response.ResultImage };
        } else {
            throw new Error('返回结果中无 ResultImage');
        }
    } catch (err) {
        console.error('[testImageToImage] 失败:', err);
        return { success: false, error: err.message };
    }
};