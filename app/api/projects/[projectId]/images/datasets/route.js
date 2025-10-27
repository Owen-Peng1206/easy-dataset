import { NextResponse } from 'next/server';
import { getImageByName } from '@/lib/db/images';
import { createImageDataset } from '@/lib/db/imageDatasets';
import { getProjectPath } from '@/lib/db/base';
import path from 'path';
import fs from 'fs/promises';
import { getMimeType } from '@/lib/util/image';

const LLMClient = require('@/lib/llm/core');

// 生成图像数据集
export async function POST(request, { params }) {
  try {
    const { projectId } = params;
    const { imageName, question, model, language = 'zh' } = await request.json();

    if (!imageName || !question) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: '请选择一个视觉模型' }, { status: 400 });
    }

    // 获取图片信息
    const image = await getImageByName(projectId, imageName);
    if (!image) {
      return NextResponse.json({ error: '图片不存在' }, { status: 404 });
    }

    // 读取图片文件
    const projectPath = await getProjectPath(projectId);
    const imagePath = path.join(projectPath, 'images', imageName);
    const imageBuffer = await fs.readFile(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = getMimeType(imageName);

    const llmClient = new LLMClient(model);
    const { answer } = await llmClient.getVisionResponse(question, base64Image, mimeType);
    const dataset = await createImageDataset(projectId, {
      imageId: image.id,
      imageName: imageName,
      question: question,
      answer: answer,
      model: model.modelId || model
    });

    return NextResponse.json({
      success: true,
      dataset
    });
  } catch (error) {
    console.error('Failed to generate image dataset:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate dataset' }, { status: 500 });
  }
}
