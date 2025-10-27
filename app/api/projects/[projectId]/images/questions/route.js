import { NextResponse } from 'next/server';
import { getImageByName, getImageChunk } from '@/lib/db/images';
import { saveQuestions } from '@/lib/db/questions';
import { getImageQuestionPrompt } from '@/lib/llm/prompts/imageQuestion';
import { extractJsonFromLLMOutput } from '@/lib/llm/common/util';
import { getProjectPath } from '@/lib/db/base';
import path from 'path';
import fs from 'fs/promises';
import { getMimeType } from '@/lib/util/image';

const LLMClient = require('@/lib/llm/core');

// 生成图片问题
export async function POST(request, { params }) {
  try {
    const { projectId } = params;
    const { imageName, count = 3, model, language = 'zh' } = await request.json();

    if (!imageName) {
      return NextResponse.json({ error: '缺少图片名称' }, { status: 400 });
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
    const prompt = await getImageQuestionPrompt(language, { number: count }, projectId);
    const { answer } = await llmClient.getVisionResponse(prompt, base64Image, mimeType);
    const questions = extractJsonFromLLMOutput(answer);
    const imageChunk = await getImageChunk(projectId);
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

    return NextResponse.json({
      success: true,
      questions: savedQuestions
    });
  } catch (error) {
    console.error('Failed to generate image questions:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate questions' }, { status: 500 });
  }
}
