import { NextResponse } from 'next/server';
import { getImageById } from '@/lib/db/images';
import { db } from '@/lib/db/index';
import { getMimeType } from '@/lib/util/image';
import { getProjectPath } from '@/lib/db/base';
import path from 'path';
import fs from 'fs/promises';

// 根据图片ID获取图片详情，包含问题列表和已标注数据
export async function GET(request, { params }) {
  try {
    const { projectId, imageId } = params;

    if (!imageId) {
      return NextResponse.json({ error: '缺少图片ID' }, { status: 400 });
    }

    // 获取图片基本信息
    const image = await getImageById(imageId);
    if (!image) {
      return NextResponse.json({ error: '图片不存在' }, { status: 404 });
    }

    if (image.projectId !== projectId) {
      return NextResponse.json({ error: '图片不属于指定项目' }, { status: 403 });
    }

    // 读取图片文件并转换为base64
    let base64Image = null;
    try {
      const projectPath = await getProjectPath(projectId);
      const imagePath = path.join(projectPath, 'images', image.imageName);
      const imageBuffer = await fs.readFile(imagePath);
      const mimeType = getMimeType(image.imageName);
      base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
    } catch (err) {
      console.warn(`Failed to read image: ${image.imageName}`, err);
    }

    // 获取图片的所有问题
    const questions = await db.questions.findMany({
      where: {
        projectId,
        imageId: image.id
      },
      orderBy: {
        createAt: 'desc'
      }
    });

    // 获取所有关联的问题模板
    const templateIds = questions.map(q => q.templateId).filter(Boolean);

    const templates =
      templateIds.length > 0
        ? await db.questionTemplates.findMany({
            where: {
              id: { in: templateIds }
            }
          })
        : [];

    const templateMap = new Map(templates.map(t => [t.id, t]));

    // 获取每个问题的已标注答案
    const questionsWithAnswers = await Promise.all(
      questions.map(async question => {
        // 查找该问题的已标注答案
        const existingAnswer = await db.imageDatasets.findFirst({
          where: {
            imageId: image.id,
            question: question.question
          },
          orderBy: {
            createAt: 'desc'
          }
        });

        // 获取关联的模板
        const template = question.templateId ? templateMap.get(question.templateId) : null;

        return {
          ...question,
          template,
          hasAnswer: !!existingAnswer,
          answer: existingAnswer?.answer || null,
          answerId: existingAnswer?.id || null
        };
      })
    );

    // 分离已标注和未标注的问题
    const answeredQuestions = questionsWithAnswers
      .filter(q => q.hasAnswer)
      .map(q => ({
        id: q.id,
        question: q.question,
        answerType: q.template?.answerType || 'text',
        labels: q.template?.labels || '',
        customFormat: q.template?.customFormat || '',
        description: q.template?.description || '',
        answer: q.answer,
        answerId: q.answerId,
        templateId: q.templateId
      }));

    const unansweredQuestions = questionsWithAnswers
      .filter(q => !q.hasAnswer)
      .map(q => ({
        id: q.id,
        question: q.question,
        answerType: q.template?.answerType || 'text',
        labels: q.template?.labels || '',
        customFormat: q.template?.customFormat || '',
        description: q.template?.description || '',
        templateId: q.templateId
      }));

    return NextResponse.json({
      success: true,
      data: {
        ...image,
        base64: base64Image,
        format: image.imageName.split('.').pop()?.toLowerCase(),
        answeredQuestions,
        unansweredQuestions,
        datasetCount: answeredQuestions.length,
        questionCount: questions.length
      }
    });
  } catch (error) {
    console.error('Failed to get image details:', error);
    return NextResponse.json({ error: error.message || 'Failed to get image details' }, { status: 500 });
  }
}
