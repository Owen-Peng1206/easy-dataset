/**
 * 图片数据集生成任务处理器
 * 负责异步处理图片数据集生成任务，获取所有未生成答案的图片问题并批量处理
 */

import { PrismaClient } from '@prisma/client';
import { processInParallel } from '@/lib/util/async';
import { updateTask } from './index';
import { getTaskConfig } from '@/lib/db/projects';
import imageService from '@/lib/services/images';
import logger from '@/lib/util/logger';

const prisma = new PrismaClient();

/**
 * 处理图片数据集生成任务
 * 查询未生成答案的图片问题并批量处理
 * @param {Object} task 任务对象
 * @returns {Promise<void>}
 */
export async function processImageDatasetGenerationTask(task) {
  try {
    console.log(`开始处理图片数据集生成任务: ${task.id}`);

    // 解析模型信息
    let modelInfo;
    try {
      modelInfo = JSON.parse(task.modelInfo);
    } catch (error) {
      throw new Error(`模型信息解析失败: ${error.message}`);
    }

    const projectId = task.projectId;

    // 1. 查询未生成答案的图片问题
    console.log(`开始处理项目 ${projectId} 的图片数据集生成任务`);
    const imageQuestionsWithoutAnswers = await prisma.questions.findMany({
      where: {
        projectId,
        answered: false,
        imageId: { not: null } // 只查询图片问题
      }
    });

    // 如果没有需要处理的问题，直接完成任务
    if (imageQuestionsWithoutAnswers.length === 0) {
      await updateTask(task.id, {
        status: 1,
        completedCount: 0,
        totalCount: 0,
        detail: '没有需要处理的图片问题',
        note: '',
        endTime: new Date()
      });
      return;
    }

    // 获取任务配置，包括并发限制
    const taskConfig = await getTaskConfig(projectId);
    const concurrencyLimit = taskConfig?.concurrencyLimit || 2;

    // 更新任务总数
    const totalCount = imageQuestionsWithoutAnswers.length;
    await updateTask(task.id, {
      totalCount,
      detail: `待处理图片问题数量: ${totalCount}`,
      note: ''
    });

    // 2. 批量处理每个图片问题
    let successCount = 0;
    let errorCount = 0;
    let totalDatasets = 0;
    let latestTaskStatus = 0;

    // 单个图片问题处理函数
    const processImageQuestion = async question => {
      try {
        // 如果任务已经被标记为失败或已中断，不再继续处理
        const latestTask = await prisma.task.findUnique({ where: { id: task.id } });
        if (latestTask.status === 2 || latestTask.status === 3) {
          latestTaskStatus = latestTask.status;
          return;
        }

        // 调用图片数据集生成服务
        await imageService.generateDatasetForImage(projectId, question.imageId, question.question, {
          model: modelInfo
        });

        // 增加成功计数
        successCount++;
        totalDatasets++;

        // 更新任务进度
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成数据集: ${totalDatasets}`
        });

        return { success: true, questionId: question.id };
      } catch (error) {
        console.error(`处理图片问题 ${question.id} 出错:`, error);
        errorCount++;

        // 更新任务进度
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成数据集: ${totalDatasets}`
        });

        return { success: false, questionId: question.id, error: error.message };
      }
    };

    // 并行处理所有图片问题
    await processInParallel(
      imageQuestionsWithoutAnswers,
      processImageQuestion,
      concurrencyLimit,
      async (completed, total) => {
        console.log(`图片数据集生成进度: ${completed}/${total}`);
      }
    );

    if (!latestTaskStatus) {
      // 任务完成，更新状态
      const finalStatus = errorCount > 0 && successCount === 0 ? 2 : 1;
      await updateTask(task.id, {
        status: finalStatus,
        detail: '',
        note: '',
        endTime: new Date()
      });
    }

    console.log(`图片数据集生成任务 ${task.id} 处理完成`);
  } catch (error) {
    console.error(`图片数据集生成任务处理失败: ${task.id}`, error);
    await updateTask(task.id, {
      status: 2,
      detail: `处理失败: ${error.message}`,
      note: `处理失败: ${error.message}`
    });
  }
}
