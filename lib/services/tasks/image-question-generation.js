/**
 * 图片问题生成任务处理服务
 */

import { PrismaClient } from '@prisma/client';
import { processInParallel } from '@/lib/util/async';
import { updateTask } from './index';
import { getTaskConfig } from '@/lib/db/projects';
import imageService from '@/lib/services/images';

const prisma = new PrismaClient();

/**
 * 处理图片问题生成任务
 * @param {object} task - 任务对象
 * @returns {Promise<void>}
 */
export async function processImageQuestionGenerationTask(task) {
  try {
    console.log(`开始处理图片问题生成任务: ${task.id}`);

    // 解析模型信息
    let modelInfo;
    try {
      modelInfo = JSON.parse(task.modelInfo);
    } catch (error) {
      throw new Error(`模型信息解析失败: ${error.message}`);
    }

    // 解析任务备注，获取问题数量配置
    let questionCount = 3; // 默认值
    if (task.note) {
      try {
        const noteData = JSON.parse(task.note);
        if (noteData.questionCount && noteData.questionCount >= 1 && noteData.questionCount <= 10) {
          questionCount = noteData.questionCount;
        }
      } catch (error) {
        console.warn('解析任务备注失败，使用默认问题数量:', error);
      }
    }

    console.log(`每张图片将生成 ${questionCount} 个问题`);

    // 获取项目配置
    const taskConfig = await getTaskConfig(task.projectId);
    const concurrencyLimit = taskConfig?.concurrencyLimit || 2;

    // 1. 先查询所有已有问题的图片ID（一次查询，高效）
    const imagesWithQuestions = await prisma.questions.findMany({
      where: {
        projectId: task.projectId,
        imageId: { not: null }
      },
      select: {
        imageId: true
      },
      distinct: ['imageId']
    });

    const imageIdsWithQuestions = new Set(imagesWithQuestions.map(q => q.imageId));

    // 2. 查询所有图片
    const allImages = await prisma.images.findMany({
      where: {
        projectId: task.projectId
      }
    });

    // 3. 过滤出没有问题的图片
    const imagesWithoutQuestions = allImages.filter(image => !imageIdsWithQuestions.has(image.id));

    if (imagesWithoutQuestions.length === 0) {
      console.log(`项目 ${task.projectId} 没有需要生成问题的图片`);
      await updateTask(task.id, {
        status: 1,
        completedCount: 0,
        totalCount: 0,
        note: '没有需要生成问题的图片'
      });
      return;
    }

    // 更新任务总数
    const totalCount = imagesWithoutQuestions.length;
    await updateTask(task.id, {
      totalCount,
      detail: `待处理图片数量: ${totalCount}`
    });

    // 3. 批量处理每个图片
    let successCount = 0;
    let errorCount = 0;
    let totalQuestions = 0;
    let latestTaskStatus = 0;

    // 单个图片处理函数
    const processImage = async image => {
      try {
        // 如果任务已经被标记为失败或已中断，不再继续处理
        const latestTask = await prisma.task.findUnique({ where: { id: task.id } });
        if (latestTask.status === 2 || latestTask.status === 3) {
          latestTaskStatus = latestTask.status;
          return;
        }

        // 调用图片问题生成服务
        const data = await imageService.generateQuestionsForImage(task.projectId, image.id, {
          model: modelInfo,
          language: task.language === 'zh-CN' ? 'zh' : 'en',
          count: questionCount // 使用任务配置的问题数量
        });

        // 增加成功计数
        successCount++;
        totalQuestions += data.total || 0;

        // 更新任务进度
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成问题: ${totalQuestions}`
        });

        return { success: true, imageId: image.id, imageName: image.imageName, total: data.total || 0 };
      } catch (error) {
        console.error(`处理图片 ${image.imageName} 出错:`, error);
        errorCount++;

        // 更新任务进度
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成问题: ${totalQuestions}`
        });

        return { success: false, imageId: image.id, imageName: image.imageName, error: error.message };
      }
    };

    // 并行处理所有图片，使用任务设置中的并发限制
    await processInParallel(imagesWithoutQuestions, processImage, concurrencyLimit, async (completed, total) => {
      console.log(`图片问题生成进度: ${completed}/${total}`);
    });

    if (!latestTaskStatus) {
      // 任务完成，更新状态
      const finalStatus = errorCount > 0 && successCount === 0 ? 2 : 1; // 如果全部失败，标记为失败；否则标记为完成
      await updateTask(task.id, {
        status: finalStatus,
        detail: '',
        note: '',
        endTime: new Date()
      });
    }

    console.log(`图片问题生成任务 ${task.id} 处理完成`);
  } catch (error) {
    console.error(`图片问题生成任务处理失败: ${task.id}`, error);
    await updateTask(task.id, {
      status: 2,
      detail: `处理失败: ${error.message}`,
      note: `处理失败: ${error.message}`
    });
  }
}
