/**
 * 数据蒸馏任务处理器
 * 负责异步处理全自动蒸馏任务
 */

import { PrismaClient } from '@prisma/client';
import { updateTask } from './index';
import { getTaskConfig } from '@/lib/db/projects';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * 处理数据蒸馏任务
 * @param {Object} task 任务对象
 * @returns {Promise<void>}
 */
export async function processDataDistillationTask(task) {
  try {
    console.log(`开始处理数据蒸馏任务: ${task.id}`);

    // 解析任务配置
    let taskNote;
    try {
      taskNote = JSON.parse(task.note);
    } catch (error) {
      throw new Error(`任务配置解析失败: ${error.message}`);
    }

    // 解析模型信息
    let modelInfo;
    try {
      modelInfo = JSON.parse(task.modelInfo);
    } catch (error) {
      throw new Error(`模型信息解析失败: ${error.message}`);
    }

    const {
      topic,
      levels,
      tagsPerLevel,
      questionsPerTag,
      datasetType = 'single-turn',
      estimatedTags,
      estimatedQuestions
    } = taskNote;

    const projectId = task.projectId;
    const language = task.language || 'zh';

    // 获取项目配置
    const taskConfig = await getTaskConfig(projectId);
    const concurrencyLimit = taskConfig?.concurrencyLimit || 5;

    // 初始化进度统计
    let progress = {
      stage: 'initializing',
      tagsTotal: estimatedTags || 0,
      tagsBuilt: 0,
      questionsTotal: estimatedQuestions || 0,
      questionsBuilt: 0,
      datasetsTotal: estimatedQuestions || 0,
      datasetsBuilt: 0,
      multiTurnDatasetsTotal: datasetType === 'multi-turn' || datasetType === 'both' ? estimatedQuestions : 0,
      multiTurnDatasetsBuilt: 0
    };

    // 更新任务初始状态
    await updateTask(task.id, {
      totalCount: estimatedQuestions,
      detail: `开始构建标签树，层级: ${levels}, 每层标签数: ${tagsPerLevel}, 每标签问题数: ${questionsPerTag}`
    });
    console.log(
      `[数据蒸馏任务 ${task.id}] 开始构建标签树，层级: ${levels}, 每层标签数: ${tagsPerLevel}, 每标签问题数: ${questionsPerTag}`
    );

    // 阶段1: 构建标签树
    await buildTagTree({
      taskId: task.id,
      projectId,
      topic,
      levels,
      tagsPerLevel,
      model: modelInfo,
      language,
      progress,
      concurrencyLimit
    });

    // 阶段2: 生成问题
    await generateQuestionsForTags({
      taskId: task.id,
      projectId,
      levels,
      questionsPerTag,
      model: modelInfo,
      language,
      progress,
      concurrencyLimit
    });

    // 阶段3: 生成数据集
    if (datasetType === 'single-turn' || datasetType === 'both') {
      await generateDatasetsForQuestions({
        taskId: task.id,
        projectId,
        model: modelInfo,
        language,
        progress,
        concurrencyLimit
      });
    }

    // 阶段4: 生成多轮对话数据集
    if (datasetType === 'multi-turn' || datasetType === 'both') {
      await generateMultiTurnDatasetsForQuestions({
        taskId: task.id,
        projectId,
        model: modelInfo,
        language,
        progress,
        concurrencyLimit
      });
    }

    // 任务完成
    await updateTask(task.id, {
      status: 1,
      completedCount: progress.datasetsBuilt + progress.multiTurnDatasetsBuilt,
      detail: `蒸馏任务完成: 标签 ${progress.tagsBuilt}/${progress.tagsTotal}, 问题 ${progress.questionsBuilt}/${progress.questionsTotal}, 单轮数据集 ${progress.datasetsBuilt}/${progress.datasetsTotal}, 多轮数据集 ${progress.multiTurnDatasetsBuilt}/${progress.multiTurnDatasetsTotal}`,
      endTime: new Date()
    });

    console.log(`数据蒸馏任务 ${task.id} 处理完成`);
  } catch (error) {
    console.error('处理数据蒸馏任务出错:', error);
    await updateTask(task.id, {
      status: 2,
      detail: `处理失败: ${error.message}`,
      note: `处理失败: ${error.message}`,
      endTime: new Date()
    });
  }
}

/**
 * 构建标签树
 */
async function buildTagTree({
  taskId,
  projectId,
  topic,
  levels,
  tagsPerLevel,
  model,
  language,
  progress,
  concurrencyLimit
}) {
  console.log(`[任务 ${taskId}] 开始构建标签树 (层级: ${levels}, 每层标签数: ${tagsPerLevel})`);

  // 更新任务状态
  await updateTask(taskId, {
    detail: `正在构建标签树 (层级: ${levels})`
  });

  // 获取项目名称作为根标签
  let projectName = topic;
  try {
    const projectResponse = await axios.get(`http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}`);
    if (projectResponse && projectResponse.data && projectResponse.data.name) {
      projectName = projectResponse.data.name;
      console.log(`[任务 ${taskId}] 使用项目名称作为根标签: "${projectName}"`);
    }
  } catch (error) {
    console.warn(`[任务 ${taskId}] 获取项目名称失败，使用主题作为默认值: ${error.message}`);
  }

  // 递归构建标签树
  const buildTagsForLevel = async (parentTag = null, parentTagPath = '', level = 1) => {
    // 检查任务是否被中断
    const latestTask = await prisma.task.findUnique({ where: { id: taskId } });
    if (latestTask.status === 2 || latestTask.status === 3) {
      throw new Error('任务已被中断');
    }

    if (level > levels) return;

    // 更新阶段
    await updateTask(taskId, {
      detail: `正在构建第 ${level} 层标签...`
    });

    // 获取当前层级已有标签
    let currentLevelTags = [];
    try {
      const response = await axios.get(
        `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/distill/tags/all`
      );
      if (parentTag) {
        currentLevelTags = response.data.filter(tag => tag.parentId === parentTag.id);
      } else {
        currentLevelTags = response.data.filter(tag => !tag.parentId);
      }
    } catch (error) {
      console.error(`[任务 ${taskId}] 获取${level}级标签失败:`, error.message);
      return;
    }

    // 计算需要创建的标签数量
    const needToCreate = Math.max(0, tagsPerLevel - currentLevelTags.length);

    if (needToCreate > 0) {
      const parentTagName = level === 1 ? topic : parentTag?.label || '';
      let tagPathWithProjectName;
      if (level === 1) {
        tagPathWithProjectName = projectName;
      } else {
        if (!parentTagPath) {
          tagPathWithProjectName = projectName;
        } else if (!parentTagPath.startsWith(projectName)) {
          tagPathWithProjectName = `${projectName} > ${parentTagPath}`;
        } else {
          tagPathWithProjectName = parentTagPath;
        }
      }

      try {
        const response = await axios.post(
          `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/distill/tags`,
          {
            parentTag: parentTagName,
            parentTagId: parentTag ? parentTag.id : null,
            tagPath: tagPathWithProjectName || parentTagName,
            count: needToCreate,
            model,
            language
          }
        );

        // 更新进度
        progress.tagsBuilt += response.data.length;
        await updateTask(taskId, {
          detail: `已创建 ${progress.tagsBuilt}/${progress.tagsTotal} 个标签 (第 ${level} 层)`
        });

        currentLevelTags = [...currentLevelTags, ...response.data];
      } catch (error) {
        console.error(`[任务 ${taskId}] 创建${level}级标签失败:`, error.message);
      }
    }

    // 递归构建下一层
    if (level < levels) {
      for (const tag of currentLevelTags) {
        let tagPath;
        if (parentTagPath) {
          tagPath = `${parentTagPath} > ${tag.label}`;
        } else {
          tagPath = `${projectName} > ${tag.label}`;
        }
        await buildTagsForLevel(tag, tagPath, level + 1);
      }
    }
  };

  // 从第一层开始构建
  await buildTagsForLevel();

  console.log(`[任务 ${taskId}] 标签树构建完成: ${progress.tagsBuilt}/${progress.tagsTotal}`);
}

/**
 * 为标签生成问题
 */
async function generateQuestionsForTags({
  taskId,
  projectId,
  levels,
  questionsPerTag,
  model,
  language,
  progress,
  concurrencyLimit
}) {
  console.log(`[任务 ${taskId}] 开始生成问题`);

  await updateTask(taskId, {
    detail: '正在为叶子标签生成问题...'
  });

  try {
    // 获取项目名称
    let projectName = '';
    try {
      const projectResponse = await axios.get(`http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}`);
      if (projectResponse && projectResponse.data && projectResponse.data.name) {
        projectName = projectResponse.data.name;
      }
    } catch (error) {
      console.warn(`[任务 ${taskId}] 获取项目名称失败: ${error.message}`);
    }

    // 获取所有标签
    const response = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/distill/tags/all`
    );
    const allTags = response.data;

    // 找出所有叶子标签
    const childrenMap = {};
    allTags.forEach(tag => {
      if (tag.parentId) {
        if (!childrenMap[tag.parentId]) {
          childrenMap[tag.parentId] = [];
        }
        childrenMap[tag.parentId].push(tag);
      }
    });

    const leafTags = allTags.filter(tag => !childrenMap[tag.id] && getTagDepth(tag, allTags) === levels);

    // 获取所有问题
    const questionsResponse = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/questions/tree?isDistill=true`
    );
    const allQuestions = questionsResponse.data;

    // 更新总问题数量
    progress.questionsTotal = leafTags.length * questionsPerTag;

    // 准备生成任务
    const generateTasks = [];
    for (const tag of leafTags) {
      const tagPath = getTagPath(tag, allTags, projectName);
      const existingQuestions = allQuestions.filter(q => q.label === tag.label);
      const needToCreate = Math.max(0, questionsPerTag - existingQuestions.length);

      if (needToCreate > 0) {
        generateTasks.push({ tag, tagPath, needToCreate });
      }
    }

    console.log(`[任务 ${taskId}] 需要为 ${generateTasks.length} 个标签生成 ${progress.questionsTotal} 个问题`);

    // 分批并发生成问题
    for (let i = 0; i < generateTasks.length; i += concurrencyLimit) {
      // 检查任务是否被中断
      const latestTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (latestTask.status === 2 || latestTask.status === 3) {
        throw new Error('任务已被中断');
      }

      const batch = generateTasks.slice(i, i + concurrencyLimit);

      await Promise.all(
        batch.map(async ({ tag, tagPath, needToCreate }) => {
          try {
            const response = await axios.post(
              `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/distill/questions`,
              {
                tagPath,
                currentTag: tag.label,
                tagId: tag.id,
                count: needToCreate,
                model,
                language
              }
            );

            progress.questionsBuilt += response.data.length;
            await updateTask(taskId, {
              detail: `[数据蒸馏任务 ${taskId}] 已生成 ${progress.questionsBuilt}/${progress.questionsTotal} 个问题`
            });
            console.log(`[数据蒸馏任务 ${taskId}] 已生成 ${progress.questionsBuilt}/${progress.questionsTotal} 个问题`);
          } catch (error) {
            console.error(`[任务 ${taskId}] 为标签 "${tag.label}" 生成问题失败:`, error.message);
          }
        })
      );
    }
  } catch (error) {
    console.error(`[任务 ${taskId}] 生成问题失败:`, error.message);
    throw error;
  }

  console.log(`[任务 ${taskId}] 问题生成完成: ${progress.questionsBuilt}/${progress.questionsTotal}`);
}

/**
 * 为问题生成数据集
 */
async function generateDatasetsForQuestions({ taskId, projectId, model, language, progress, concurrencyLimit }) {
  console.log(`[任务 ${taskId}] 开始生成单轮数据集`);

  await updateTask(taskId, {
    detail: '正在生成单轮对话数据集...'
  });

  try {
    // 获取所有问题
    const response = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/questions/tree?isDistill=true`
    );
    const allQuestions = response.data;

    // 找出未回答的问题
    const unansweredQuestions = allQuestions.filter(q => !q.answered);
    const answeredQuestions = allQuestions.filter(q => q.answered);

    // 更新数据集总数和已生成数量
    progress.datasetsTotal = allQuestions.length;
    progress.datasetsBuilt = answeredQuestions.length;

    if (unansweredQuestions.length === 0) {
      console.log(`[任务 ${taskId}] 所有问题都已生成答案，跳过数据集生成阶段`);
      return;
    }

    console.log(`[任务 ${taskId}] 需要为 ${unansweredQuestions.length} 个问题生成答案`);

    // 分批并发生成数据集
    for (let i = 0; i < unansweredQuestions.length; i += concurrencyLimit) {
      // 检查任务是否被中断
      const latestTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (latestTask.status === 2 || latestTask.status === 3) {
        throw new Error('任务已被中断');
      }

      const batch = unansweredQuestions.slice(i, i + concurrencyLimit);

      await Promise.all(
        batch.map(async question => {
          try {
            await axios.post(`http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/datasets`, {
              projectId,
              questionId: question.id,
              model,
              language: language || 'zh-CN'
            });

            progress.datasetsBuilt++;
            await updateTask(taskId, {
              completedCount: progress.datasetsBuilt,
              detail: `[数据蒸馏任务 ${taskId}] 已生成 ${progress.datasetsBuilt}/${progress.datasetsTotal} 个单轮数据集`
            });
            console.log(`已生成 ${progress.datasetsBuilt}/${progress.datasetsTotal} 个单轮数据集`);
          } catch (error) {
            console.error(`[任务 ${taskId}] 为问题 "${question.id}" 生成数据集失败:`, error.message);
          }
        })
      );
    }
  } catch (error) {
    console.error(`[任务 ${taskId}] 生成数据集失败:`, error.message);
    throw error;
  }

  console.log(`[任务 ${taskId}] 单轮数据集生成完成: ${progress.datasetsBuilt}/${progress.datasetsTotal}`);
}

/**
 * 为问题生成多轮对话数据集
 */
async function generateMultiTurnDatasetsForQuestions({
  taskId,
  projectId,
  model,
  language,
  progress,
  concurrencyLimit
}) {
  console.log(`[任务 ${taskId}] 开始生成多轮对话数据集`);

  await updateTask(taskId, {
    detail: '正在生成多轮对话数据集...'
  });

  try {
    // 获取项目的多轮对话配置
    const configResponse = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/tasks`
    );
    const taskConfig = configResponse.data;

    const multiTurnConfig = {
      systemPrompt: taskConfig.multiTurnSystemPrompt || '',
      scenario: taskConfig.multiTurnScenario || '',
      rounds: taskConfig.multiTurnRounds || 3,
      roleA: taskConfig.multiTurnRoleA || '',
      roleB: taskConfig.multiTurnRoleB || ''
    };

    // 检查配置
    if (!multiTurnConfig.scenario || !multiTurnConfig.roleA || !multiTurnConfig.roleB || !multiTurnConfig.rounds) {
      console.error(`[任务 ${taskId}] 项目未配置多轮对话参数，跳过多轮对话生成`);
      throw new Error('项目未配置多轮对话参数');
    }

    // 获取所有已回答的问题
    const response = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/questions/tree?isDistill=true`
    );
    const answeredQuestions = response.data;

    // 获取已生成多轮对话的问题ID
    const conversationsResponse = await axios.get(
      `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/dataset-conversations?pageSize=1000`
    );
    const existingConversationIds = new Set(
      (conversationsResponse.data.conversations || []).map(conv => conv.questionId)
    );

    // 筛选需要生成多轮对话的问题
    const questionsForMultiTurn = answeredQuestions.filter(q => !existingConversationIds.has(q.id));

    // 更新多轮对话数据集总数和已生成数量
    progress.multiTurnDatasetsTotal = answeredQuestions.length;
    progress.multiTurnDatasetsBuilt = answeredQuestions.length - questionsForMultiTurn.length;

    if (questionsForMultiTurn.length === 0) {
      console.log(`[任务 ${taskId}] 所有问题都已生成多轮对话，跳过多轮对话生成阶段`);
      return;
    }

    console.log(`[任务 ${taskId}] 需要为 ${questionsForMultiTurn.length} 个问题生成多轮对话`);

    // 分批并发生成 (并发数更低)
    const multiTurnConcurrency = Math.min(concurrencyLimit, 2);

    for (let i = 0; i < questionsForMultiTurn.length; i += multiTurnConcurrency) {
      // 检查任务是否被中断
      const latestTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (latestTask.status === 2 || latestTask.status === 3) {
        throw new Error('任务已被中断');
      }

      const batch = questionsForMultiTurn.slice(i, i + multiTurnConcurrency);

      await Promise.all(
        batch.map(async question => {
          try {
            await axios.post(
              `http://localhost:${process.env.PORT || 1717}/api/projects/${projectId}/dataset-conversations`,
              {
                questionId: question.id,
                ...multiTurnConfig,
                model,
                language
              }
            );

            progress.multiTurnDatasetsBuilt++;
            await updateTask(taskId, {
              completedCount: progress.multiTurnDatasetsBuilt,
              detail: `已生成 ${progress.multiTurnDatasetsBuilt}/${progress.multiTurnDatasetsTotal} 个多轮对话数据集`
            });
            console.log(
              `已生成 ${progress.multiTurnDatasetsBuilt}/${progress.multiTurnDatasetsTotal} 个多轮对话数据集`
            );
          } catch (error) {
            console.error(`[任务 ${taskId}] 为问题 "${question.id}" 生成多轮对话失败:`, error.message);
          }
        })
      );
    }
  } catch (error) {
    console.error(`[任务 ${taskId}] 生成多轮对话数据集失败:`, error.message);
    throw error;
  }

  console.log(
    `[任务 ${taskId}] 多轮对话数据集生成完成: ${progress.multiTurnDatasetsBuilt}/${progress.multiTurnDatasetsTotal}`
  );
}

/**
 * 获取标签深度
 */
function getTagDepth(tag, allTags) {
  let depth = 1;
  let currentTag = tag;

  while (currentTag.parentId) {
    depth++;
    currentTag = allTags.find(t => t.id === currentTag.parentId);
    if (!currentTag) break;
  }

  return depth;
}

/**
 * 获取标签路径
 */
function getTagPath(tag, allTags, projectName = '') {
  const path = [];
  let currentTag = tag;

  while (currentTag) {
    path.unshift(currentTag.label);
    if (currentTag.parentId) {
      currentTag = allTags.find(t => t.id === currentTag.parentId);
    } else {
      currentTag = null;
    }
  }

  // 如果有项目名称且路径不以项目名称开头,则添加
  if (projectName && path.length > 0 && path[0] !== projectName) {
    path.unshift(projectName);
  }

  return path.join(' > ');
}

export default {
  processDataDistillationTask
};
