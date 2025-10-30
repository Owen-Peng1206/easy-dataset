/**
 * 多轮对话生成任务处理器
 * 负责异步处理多轮对话生成任务，获取所有未生成多轮对话的问题并批量处理
 */

import { PrismaClient } from '@prisma/client';
import { processInParallel } from '@/lib/util/async';
import { updateTask } from './index';
import { generateMultiTurnConversation } from '@/lib/services/multi-turn/index';
import { getTaskConfig } from '@/lib/db/projects';
import { getAllDatasetConversations } from '@/lib/db/dataset-conversations';

const prisma = new PrismaClient();

/**
 * 处理多轮对话生成任务
 * 查询未生成多轮对话的问题并批量处理
 * @param {Object} task 任务对象
 * @returns {Promise<void>}
 */
export async function processMultiTurnGenerationTask(task) {
  try {
    console.log(`开始处理多轮对话生成任务: ${task.id}`);
    let modelInfo;
    try {
      modelInfo = JSON.parse(task.modelInfo);
    } catch (error) {
      throw new Error(`配置信息解析失败: ${error.message}`);
    }

    // 从任务对象直接获取项目 ID
    const projectId = task.projectId;
    const taskConfig = await getTaskConfig(projectId);
    const multiTurnConfig = taskConfig;

    // 1. 获取项目中所有问题
    console.log(`开始处理项目 ${projectId} 的多轮对话生成任务`);
    const allQuestions = await prisma.questions.findMany({
      where: {
        projectId,
        imageId: null
      },
      select: {
        id: true,
        question: true,
        chunkId: true
      }
    });

    if (allQuestions.length === 0) {
      await updateTask(task.id, {
        status: 1, // 1 表示完成
        detail: '没有可处理的问题（需要已生成答案的问题）',
        note: '',
        endTime: new Date()
      });
      return;
    }

    // 2. 获取已生成多轮对话的问题ID
    const existingConversations = await getAllDatasetConversations(projectId);
    const existingQuestionIds = new Set(existingConversations.map(conv => conv.questionId));

    // 3. 筛选出未生成多轮对话的问题
    const questionsWithoutMultiTurn = allQuestions.filter(q => !existingQuestionIds.has(q.id));

    // 如果没有需要处理的问题，直接完成任务
    if (questionsWithoutMultiTurn.length === 0) {
      await updateTask(task.id, {
        status: 1, // 1 表示完成
        detail: '所有问题都已生成多轮对话',
        note: '',
        endTime: new Date()
      });
      return;
    }

    // 获取任务配置，包括并发限制
    const concurrencyLimit = taskConfig.concurrencyLimit || 2; // 多轮对话生成较复杂，默认并发数较低

    // 更新任务总数
    const totalCount = questionsWithoutMultiTurn.length;
    await updateTask(task.id, {
      totalCount,
      detail: `待处理问题数量: ${totalCount}`,
      note: ''
    });

    // 4. 构建多轮对话配置
    const config = {
      systemPrompt: multiTurnConfig.multiTurnSystemPrompt || '',
      scenario: multiTurnConfig.multiTurnScenario || '学术讨论',
      rounds: multiTurnConfig.multiTurnRounds || 3,
      roleA: multiTurnConfig.multiTurnRoleA || '用户',
      roleB: multiTurnConfig.multiTurnRoleB || '助手',
      model: modelInfo,
      language: task.language === 'zh-CN' ? '中文' : 'en'
    };

    // 5. 批量处理每个问题
    let successCount = 0;
    let errorCount = 0;
    let totalConversations = 0;
    let latestTaskStatus = 0;

    // 单个问题处理函数
    const processQuestion = async question => {
      try {
        // 如果任务已经被标记为失败或已中断，不再继续处理
        const latestTask = await prisma.task.findUnique({ where: { id: task.id } });
        if (latestTask.status === 2 || latestTask.status === 3) {
          latestTaskStatus = latestTask.status;
          return;
        }

        // 调用单个多轮对话生成服务
        const result = await generateMultiTurnConversation(projectId, question.id, config);

        if (result.success) {
          console.log(`问题 ${question.id} 已生成多轮对话`);
          successCount++;
          totalConversations += 1;
        } else {
          console.error(`问题 ${question.id} 生成多轮对话失败:`, result.error);
          errorCount++;
        }

        // 更新任务进度
        const progressNote = `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成对话: ${totalConversations}`;
        console.log(progressNote);
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: progressNote,
          note: progressNote
        });

        return {
          success: result.success,
          questionId: question.id,
          conversationCount: result.success ? 1 : 0
        };
      } catch (error) {
        console.error(`处理问题 ${question.id} 出错:`, error);
        errorCount++;

        // 更新任务进度
        const progressNote = `已处理: ${successCount + errorCount}/${totalCount}, 成功: ${successCount}, 失败: ${errorCount}, 共生成对话: ${totalConversations}`;
        await updateTask(task.id, {
          completedCount: successCount + errorCount,
          detail: progressNote,
          note: progressNote
        });

        return { success: false, questionId: question.id, error: error.message };
      }
    };

    // 并行处理所有问题，使用任务设置中的并发限制
    await processInParallel(questionsWithoutMultiTurn, processQuestion, concurrencyLimit, async (completed, total) => {
      console.log(`多轮对话生成进度: ${completed}/${total}`);
    });

    if (!latestTaskStatus) {
      // 任务完成，更新状态
      const finalStatus = errorCount > 0 && successCount === 0 ? 2 : 1; // 如果全部失败，标记为失败；否则标记为完成
      await updateTask(task.id, {
        status: finalStatus,
        completedCount: successCount + errorCount,
        detail: '',
        note: '',
        endTime: new Date()
      });
    }

    console.log(`任务 ${task.id} 已完成`);
  } catch (error) {
    console.error('处理多轮对话生成任务出错:', error);
    await updateTask(task.id, {
      status: 2, // 2 表示失败
      detail: `处理失败: ${error.message}`,
      note: `处理失败: ${error.message}`,
      endTime: new Date()
    });
  }
}

export default {
  processMultiTurnGenerationTask
};
