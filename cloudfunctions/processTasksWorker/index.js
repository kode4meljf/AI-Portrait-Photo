const cloud = require('wx-server-sdk');
const Jimp = require('jimp');
const axios = require('axios');
const tencentcloud = require('tencentcloud-sdk-nodejs');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const secretId = process.env.TENCENT_SECRET_ID;
const secretKey = process.env.TENCENT_SECRET_KEY;
if (!secretId || !secretKey) {
    throw new Error('请在云函数环境变量中设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY');
}

// 导入 AI Art 客户端
const AiartClient = tencentcloud.aiart.v20221229.Client;
const clientConfig = {
    credential: { secretId, secretKey },
    region: 'ap-guangzhou',
    profile: { httpProfile: { endpoint: 'aiart.tencentcloudapi.com' } },
};
const client = new AiartClient(clientConfig);

// ==================== 辅助函数 ====================
async function segmentPortrait(imageBuffer) {
    console.log('[Worker] 开始人像分割');
    const base64Image = imageBuffer.toString('base64');
    const res = await cloud.callFunction({
        name: 'testSegment',
        data: { imageBase64: base64Image }
    });
    if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '人像分割失败');
    }
    const resultImage = res.result.data?.ResultImage;
    if (!resultImage) throw new Error('人像分割结果为空');
    console.log('[Worker] 人像分割完成');
    return Buffer.from(resultImage, 'base64');
}

async function uploadToTempUrl(buffer, prefix = 'temp') {
    const cloudPath = `${prefix}/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.png`;
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: buffer });
    const tempRes = await cloud.getTempFileURL({ fileList: [uploadRes.fileID] });
    return tempRes.fileList[0].tempFileURL;
}

async function downloadImage(url) {
    if (url.startsWith('cloud://')) {
        const res = await cloud.downloadFile({ fileID: url });
        return res.fileContent;
    } else {
        const resp = await axios.get(url, { responseType: 'arraybuffer' });
        return Buffer.from(resp.data);
    }
}

// ==================== 核心：使用SDK调用混元3.0多图融合 ====================
async function generateWithHunyuan(personBuffer, bgBuffer, userPrompt) {
    console.log('[Worker] ==== 使用混元生图3.0融合方案（SDK） ====');
    
    // 上传参考图获取临时URL
    const [personUrl, bgUrl] = await Promise.all([
        uploadToTempUrl(personBuffer, 'hunyuan_person'),
        uploadToTempUrl(bgBuffer, 'hunyuan_bg')
    ]);
    console.log(`[Worker] 人物图URL: ${personUrl}`);
    console.log(`[Worker] 背景图URL: ${bgUrl}`);

    // 构造融合提示词
    const fusionPrompt = `请执行多图融合任务。严格参考第一张参考图像（参考图-1）中的人物脸部特征、发型、人物姿势和服装细节，严格参考第二张参考图像（参考图-2）中的背景、构图、光影和整体氛围。最终生成一张高质量的图片：人物必须完美融入背景之中，保持一致的光影和透视关系，画面自然逼真、高清、主体突出。【补充风格要求】：${userPrompt}`;
    console.log(`[Worker] 融合Prompt: ${fusionPrompt}`);

    // 提交任务
    const submitParams = {
        Prompt: fusionPrompt,
        Images: [personUrl, bgUrl],
        Resolution: '1024:1024',
        LogoAdd: 0
    };
    console.log('[Worker] 提交任务参数:', JSON.stringify(submitParams));
    const submitRes = await client.SubmitTextToImageJob(submitParams);
    const jobId = submitRes.JobId;
    console.log('[Worker] 任务提交成功，JobId:', jobId);

    // 轮询结果
    const maxAttempts = 60;
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const queryParams = { JobId: jobId };
        const queryRes = await client.QueryTextToImageJob(queryParams);
        console.log(`[Worker] 轮询 ${i+1}, 状态码: ${queryRes.JobStatusCode}`);
        if (queryRes.JobStatusCode === '5') { // 成功
            if (queryRes.ResultImage && queryRes.ResultImage.length > 0) {
                console.log('[Worker] 混元生图成功，图片URL:', queryRes.ResultImage[0]);
                const imgResp = await axios.get(queryRes.ResultImage[0], { responseType: 'arraybuffer' });
                console.log('[Worker] 最终图片下载完成，大小:', imgResp.data.length);
                return Buffer.from(imgResp.data);
            }
            throw new Error('任务成功但未返回图片');
        } else if (queryRes.JobStatusCode === '4') { // 失败
            throw new Error(`混元生图失败: ${queryRes.JobErrorMsg || '未知错误'}`);
        }
    }
    throw new Error('混元生图超时');
}

// ==================== 任务处理逻辑 ====================
async function processTask(task) {
    const { _id, photoId, templateId } = task;
    console.log(`[Worker] 开始处理任务 ${_id}, photoId: ${photoId}, templateId: ${templateId}`);
    
    // 获取模板
    let template = null;
    const byId = await db.collection('templates').where({ id: templateId }).get();
    if (byId.data.length) {
        template = byId.data[0];
    } else {
        const byDoc = await db.collection('templates').doc(templateId).get();
        if (byDoc.data) template = byDoc.data;
    }
    if (!template) throw new Error(`模板不存在，templateId: ${templateId}`);
    
    const prompt = template.prompt;
    const bgImageUrl = template.imageUrl;
    if (!prompt) throw new Error(`模板缺少 prompt 字段`);
    if (!bgImageUrl) throw new Error(`模板缺少 imageUrl 字段`);
    
    // 获取原始照片
    const photoRes = await db.collection('photos').doc(photoId).get();
    if (!photoRes.data) throw new Error('照片不存在');
    const originalBuffer = await downloadImage(photoRes.data.originalUrl);
    console.log(`[Worker] 原图下载完成，大小: ${originalBuffer.length}`);
    
    // 人像分割
    const personBuffer = await segmentPortrait(originalBuffer);
    console.log('[Worker] 人像分割完成，大小:', personBuffer.length);
    
    // 下载模板背景图
    const bgBuffer = await downloadImage(bgImageUrl);
    console.log('[Worker] 模板背景图下载完成，大小:', bgBuffer.length);
    
    // 调用混元生图
    const finalBuffer = await generateWithHunyuan(personBuffer, bgBuffer, prompt);
    console.log('[Worker] 混元生图成功，最终图片大小:', finalBuffer.length);
    
    // 上传最终图片
    const cloudPath = `ai-generated/${Date.now()}_${Math.random().toString(36).substr(2, 8)}.png`;
    const uploadRes = await cloud.uploadFile({ cloudPath, fileContent: finalBuffer });
    console.log('[Worker] 最终图片上传完成，fileID:', uploadRes.fileID);
    
    // 更新数据库
    await db.collection('photos').doc(photoId).update({
        data: {
            aiUrl: uploadRes.fileID,
            isGenerated: true,
            generateStatus: 'completed',
            updateTime: new Date()
        }
    });
    await db.collection('ai_tasks').doc(_id).update({
        data: {
            status: 'completed',
            resultFileID: uploadRes.fileID,
            updateTime: new Date()
        }
    });
    console.log(`[Worker] 任务 ${_id} 处理成功`);
}

// ==================== 云函数入口 ====================
exports.main = async (event) => {
    const taskRes = await db.collection('ai_tasks')
        .where({ status: 'pending' })
        .orderBy('createTime', 'asc')
        .limit(1)
        .get();
    if (!taskRes.data.length) return { processed: 0 };
    
    const task = taskRes.data[0];
    await db.collection('ai_tasks').doc(task._id).update({
        data: { status: 'processing', updateTime: new Date() }
    });
    try {
        await processTask(task);
        return { processed: 1 };
    } catch (err) {
        console.error('任务处理失败:', err);
        await db.collection('ai_tasks').doc(task._id).update({
            data: { status: 'failed', errorMsg: err.message, updateTime: new Date() }
        });
        await db.collection('photos').doc(task.photoId).update({
            data: { generateStatus: 'failed', updateTime: new Date() }
        });
        return { processed: 0, error: err.message };
    }
};