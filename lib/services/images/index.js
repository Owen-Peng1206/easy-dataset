/**
 * 图片问题生成服务
 * 封装单个图片的问题生成逻辑，供 API 和批量任务复用
 */

import LLMClient from '@/lib/llm/core/index';
import { getImageQuestionPrompt } from '@/lib/llm/prompts/imageQuestion';
import { extractJsonFromLLMOutput } from '@/lib/llm/common/util';
import { getImageByName, getImageById, getImageChunk } from '@/lib/db/images';
import { saveQuestions } from '@/lib/db/questions';
import { getProjectPath } from '@/lib/db/base';
import { getMimeType } from '@/lib/util/image';
import path from 'path';
import fs from 'fs/promises';
import logger from '@/lib/util/logger';

/**
 * 为指定图片生成问题
 * @param {String} projectId 项目ID
 * @param {String} imageId 图片ID
 * @param {Object} options 选项
 * @param {Object} options.model 模型配置
 * @param {String} options.language 语言(zh/en)
 * @param {Number} options.count 问题数量(默认3)
 * @returns {Promise<Object>} 生成结果
 */
export async function generateQuestionsForImage(projectId, imageId, options) {
  try {
    const { model, language = 'zh', count = 3 } = options;

    if (!model) {
      throw new Error('模型配置不能为空');
    }

    // 获取图片信息
    const image = await getImageById(imageId);
    if (!image) {
      throw new Error('图片不存在');
    }

    if (image.projectId !== projectId) {
      throw new Error('图片不属于指定项目');
    }

    // 读取图片文件
    const projectPath = await getProjectPath(projectId);
    const imagePath = path.join(projectPath, 'images', image.imageName);
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(image.imageName);

    // 创建 LLM 客户端
    const llmClient = new LLMClient(model);

    // 生成问题提示词
    const prompt = await getImageQuestionPrompt(language, { number: count }, projectId);

    // 调用视觉模型生成问题
    const { answer } = await llmClient.getVisionResponse(prompt, base64Image, mimeType);

    // 提取问题列表
    const questions = extractJsonFromLLMOutput(answer);

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      throw new Error('生成问题失败或问题列表为空');
    }

    // 获取或创建图片专用的虚拟 chunk
    const imageChunk = await getImageChunk(projectId);

    // 保存问题到数据库
    const savedQuestions = await saveQuestions(
      projectId,
      questions.map(q => ({
        question: q,
        label: 'image',
        imageId: image.id,
        imageName: image.imageName,
        chunkId: imageChunk.id
      }))
    );

    logger.info(`图片 ${image.imageName} 生成了 ${questions.length} 个问题`);

    return {
      imageId: image.id,
      imageName: image.imageName,
      questions: questions,
      total: questions.length
    };
  } catch (error) {
    logger.error(`为图片 ${imageId} 生成问题时出错:`, error);
    throw error;
  }
}

export default {
  generateQuestionsForImage
};
