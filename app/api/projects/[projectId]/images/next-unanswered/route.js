import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 获取下一个有未标注问题的图片
export async function GET(request, { params }) {
  try {
    const { projectId } = params;

    // 查找第一个有未标注问题的图片
    const unansweredQuestion = await prisma.questions.findFirst({
      where: {
        projectId,
        imageId: {
          not: null
        },
        answered: false
      }
    });

    if (!unansweredQuestion) {
      return NextResponse.json({
        success: true,
        data: null
      });
    }

    // 获取该图片的完整详情
    const imageResponse = await fetch(
      `${request.nextUrl.origin}/api/projects/${projectId}/images/${unansweredQuestion.imageId}`
    );
    const imageData = await imageResponse.json();

    return NextResponse.json({
      success: true,
      data: imageData.data
    });
  } catch (error) {
    console.error('Failed to get next unanswered image:', error);
    return NextResponse.json({ error: error.message || 'Failed to get next unanswered image' }, { status: 500 });
  }
}
