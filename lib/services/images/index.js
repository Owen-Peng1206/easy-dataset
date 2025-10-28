/**
 * 图片问题和答案生成服务
 */

import LLMClient from '@/lib/llm/core/index';
import { getImageQuestionPrompt } from '@/lib/llm/prompts/imageQuestion';
import { getImageAnswerPrompt } from '@/lib/llm/prompts/imageAnswer';
import { extractJsonFromLLMOutput, safeParseJSON } from '@/lib/llm/common/util';
import { getImageById, getImageChunk } from '@/lib/db/images';
import { saveQuestions, updateQuestionAnsweredStatus, getQuestionTemplateById } from '@/lib/db/questions';
import { createImageDataset } from '@/lib/db/imageDatasets';
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

/**
 * 为指定图片生成数据集（问答对）
 * @param {String} projectId 项目ID
 * @param {String} imageId 图片ID
 * @param {String} question 问题文本
 * @param {Object} options 选项
 * @param {Object} options.model 模型配置
 * @returns {Promise<Object>} 生成结果
 */
export async function generateDatasetForImage(projectId, imageId, question, options) {
  try {
    const { model, language = 'zh', previewOnly = false } = options;

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

    // 获取问题模版
    const llmClient = new LLMClient(model);
    const { id, question: questionText } = question;
    let questionTemplate = null;
    if (id) {
      questionTemplate = await getQuestionTemplateById(id);
    }
    const prompt = await getImageAnswerPrompt(language, { question: questionText, questionTemplate }, projectId);
    let { answer } = await llmClient.getVisionResponse(prompt, base64Image, mimeType);
    const answerJson = safeParseJSON(answer);
    if (typeof answerJson !== 'string') {
      answer = JSON.stringify(answerJson, null, 2);
    }

    // 如果是预览模式，只返回答案，不保存数据集
    if (previewOnly) {
      return {
        imageId: image.id,
        imageName: image.imageName,
        question: questionText,
        answer: answer,
        dataset: null
      };
    }

    // 保存图片数据集
    const dataset = await createImageDataset(projectId, {
      imageId: image.id,
      imageName: image.imageName,
      question: questionText,
      answer: answer,
      model: model.modelId || model.modelName
    });

    // 更新对应问题的 answered 状态为 true
    await updateQuestionAnsweredStatus(projectId, image.id, questionText, true);

    logger.info(`图片 ${image.imageName} 的问题 "${questionText}" 已生成数据集`);

    return {
      imageId: image.id,
      imageName: image.imageName,
      question: questionText,
      answer: answer,
      dataset: dataset
    };
  } catch (error) {
    logger.error(`为图片 ${imageId} 生成数据集时出错:`, error);
    throw error;
  }
}

export default {
  generateQuestionsForImage,
  generateDatasetForImage
};
