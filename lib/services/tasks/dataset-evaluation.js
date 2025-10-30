/**
 * 数据集评估任务处理器
 * 处理批量数据集质量评估的异步任务
 */

import { PrismaClient } from '@prisma/client';
import { processInParallel } from '@/lib/util/async';
import { updateTask } from './index';
import { getDatasetsByPagination } from '@/lib/db/datasets';
import { evaluateDataset } from '@/lib/services/datasets/evaluation';
import { getTaskConfig } from '@/lib/db/projects';
import { TASK } from '@/constant';

const prisma = new PrismaClient();

/**
 * 处理数据集评估任务
 * @param {object} task - 任务对象
 */
export async function processDatasetEvaluationTask(task) {
  const { id: taskId, projectId, modelInfo, language } = task;

  try {
    console.log(`开始处理数据集评估任务: ${taskId}`);

    // 更新任务状态为处理中
    await updateTask(taskId, {
      status: TASK.STATUS.PROCESSING,
      startTime: new Date().toISOString()
    });

    // 解析模型信息
    const model = typeof modelInfo === 'string' ? JSON.parse(modelInfo) : modelInfo;

    if (!model || !model.modelName) {
      throw new Error('模型配置不完整');
    }

    // 1. 查找所有未评估的数据集（score为0或null的数据集）
    console.log(`查找项目 ${projectId} 中未评估的数据集...`);

    const unevaluatedDatasets = [];
    let page = 1;
    const pageSize = 2000;
    let hasMore = true;

    while (hasMore) {
      const response = await getDatasetsByPagination(projectId, page, pageSize, {
        // 不传递任何筛选条件，获取所有数据集
      });

      console.log(`获取到第 ${page} 页数据集，共 ${response.data?.length || 0} 个数据集`);

      if (response.data && response.data.length > 0) {
        // 在内存中筛选未评估的数据集
        const unscored = response.data.filter(
          dataset => !dataset.score || dataset.score === 0 || !dataset.aiEvaluation
        );
        unevaluatedDatasets.push(...unscored);

        page++;
        hasMore = response.data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    console.log(`找到 ${unevaluatedDatasets.length} 个未评估的数据集`);

    if (unevaluatedDatasets.length === 0) {
      await updateTask(taskId, {
        status: TASK.STATUS.COMPLETED,
        endTime: new Date().toISOString(),
        completedCount: 0,
        totalCount: 0,
        note: '没有找到需要评估的数据集'
      });
      return;
    }

    // 获取任务配置，包括并发限制
    const taskConfig = await getTaskConfig(projectId);
    const concurrencyLimit = taskConfig.concurrencyLimit || 5;

    // 更新任务总数
    const totalCount = unevaluatedDatasets.length;
    await updateTask(taskId, {
      totalCount,
      detail: `待评估数据集数量: ${totalCount}`,
      note: ''
    });

    // 2. 批量处理每个数据集
    let successCount = 0;
    let errorCount = 0;
    let latestTaskStatus = 0;

    // 单个数据集处理函数
    const processDataset = async dataset => {
      try {
        // 如果任务已经被标记为失败或已中断，不再继续处理
        const latestTask = await prisma.task.findUnique({ where: { id: taskId } });
        if (latestTask.status === 2 || latestTask.status === 3) {
          latestTaskStatus = latestTask.status;
          return;
        }

        // 调用数据集评估服务
        const result = await evaluateDataset(projectId, dataset.id, model, language);

        if (result.success) {
          console.log(
            `数据集 ${dataset.id} 评估完成，评分: ${result.data.score}，进度: ${successCount + errorCount}/${totalCount}`
          );
          successCount++;
        } else {
          console.error(`数据集 ${dataset.id} 评估失败:`, result.error);
          errorCount++;
        }

        // 更新任务进度
        const progressNote = `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}`;
        await updateTask(taskId, {
          completedCount: successCount + errorCount,
          detail: progressNote,
          note: progressNote
        });

        return { success: result.success, datasetId: dataset.id, ...result };
      } catch (error) {
        console.error(`处理数据集 ${dataset.id} 出错:`, error);
        errorCount++;

        // 更新任务进度
        const progressNote = `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}`;
        await updateTask(taskId, {
          completedCount: successCount + errorCount,
          detail: progressNote,
          note: progressNote
        });

        return { success: false, datasetId: dataset.id, error: error.message };
      }
    };

    // 并行处理所有数据集，使用任务设置中的并发限制
    await processInParallel(unevaluatedDatasets, processDataset, concurrencyLimit, async (completed, total) => {});

    const evaluationResults = {
      success: successCount,
      failed: errorCount,
      results: [] // 简化结果存储
    };

    // 3. 更新任务完成状态
    if (!latestTaskStatus) {
      // 如果任务没有被中断，根据处理结果更新状态
      const finalStatus = errorCount === 0 ? TASK.STATUS.COMPLETED : TASK.STATUS.FAILED;
      const endTime = new Date().toISOString();
      const note = `评估完成: 成功 ${successCount} 个，失败 ${errorCount} 个`;

      await updateTask(taskId, {
        status: finalStatus,
        endTime,
        completedCount: successCount + errorCount,
        note,
        detail: `总计: ${totalCount}, 成功: ${successCount}, 失败: ${errorCount}`
      });

      console.log(`数据集评估任务完成: ${taskId}, ${note}`);
    }
  } catch (error) {
    console.error(`数据集评估任务失败: ${taskId}`, error);

    // 更新任务为失败状态
    await updateTask(taskId, {
      status: TASK.STATUS.FAILED,
      endTime: new Date().toISOString(),
      note: `评估失败: ${error.message}`
    });

    throw error;
  }
}
