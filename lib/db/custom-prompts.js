'use server';
import { db } from '@/lib/db/index';

/**
 * 获取项目的自定义提示词
 * @param {string} projectId 项目ID
 * @param {string} promptType 提示词类型 (如: question, answer, label等)
 * @param {string} language 语言 (zh-CN, en)
 * @returns {Promise<Array>} 自定义提示词列表
 */
export async function getCustomPrompts(projectId, promptType = null, language = null) {
  try {
    const where = {
      projectId,
      isActive: true
    };

    if (promptType) {
      where.promptType = promptType;
    }

    if (language) {
      where.language = language;
    }

    return await db.customPrompts.findMany({
      where,
      orderBy: {
        createAt: 'desc'
      }
    });
  } catch (error) {
    console.error('Failed to get custom prompts:', error);
    throw error;
  }
}

/**
 * 获取特定的自定义提示词内容
 * @param {string} projectId 项目ID
 * @param {string} promptType 提示词类型
 * @param {string} promptKey 提示词键名
 * @param {string} language 语言
 * @returns {Promise<Object|null>} 自定义提示词对象或null
 */
export async function getCustomPrompt(projectId, promptType, promptKey, language) {
  try {
    return await db.customPrompts.findUnique({
      where: {
        projectId_promptType_promptKey_language: {
          projectId,
          promptType,
          promptKey,
          language
        }
      }
    });
  } catch (error) {
    console.error('Failed to get custom prompt:', error);
    return null;
  }
}

/**
 * 保存自定义提示词
 * @param {string} projectId 项目ID
 * @param {string} promptType 提示词类型
 * @param {string} promptKey 提示词键名
 * @param {string} language 语言
 * @param {string} content 提示词内容
 * @returns {Promise<Object>} 保存后的提示词对象
 */
export async function saveCustomPrompt(projectId, promptType, promptKey, language, content) {
  try {
    return await db.customPrompts.upsert({
      where: {
        projectId_promptType_promptKey_language: {
          projectId,
          promptType,
          promptKey,
          language
        }
      },
      update: {
        content,
        updateAt: new Date()
      },
      create: {
        projectId,
        promptType,
        promptKey,
        language,
        content
      }
    });
  } catch (error) {
    console.error('Failed to save custom prompt:', error);
    throw error;
  }
}

/**
 * 删除自定义提示词
 * @param {string} projectId 项目ID
 * @param {string} promptType 提示词类型
 * @param {string} promptKey 提示词键名
 * @param {string} language 语言
 * @returns {Promise<boolean>} 删除成功返回true
 */
export async function deleteCustomPrompt(projectId, promptType, promptKey, language) {
  try {
    await db.customPrompts.delete({
      where: {
        projectId_promptType_promptKey_language: {
          projectId,
          promptType,
          promptKey,
          language
        }
      }
    });
    return true;
  } catch (error) {
    console.error('Failed to delete custom prompt:', error);
    return false;
  }
}

/**
 * 批量保存自定义提示词
 * @param {string} projectId 项目ID
 * @param {Array} prompts 提示词数组
 * @returns {Promise<Array>} 保存结果
 */
export async function batchSaveCustomPrompts(projectId, prompts) {
  try {
    const results = [];
    for (const prompt of prompts) {
      const { promptType, promptKey, language, content } = prompt;
      const result = await saveCustomPrompt(projectId, promptType, promptKey, language, content);
      results.push(result);
    }
    return results;
  } catch (error) {
    console.error('Failed to batch save custom prompts:', error);
    throw error;
  }
}

/**
 * 启用/禁用自定义提示词
 * @param {string} id 提示词ID
 * @param {boolean} isActive 是否启用
 * @returns {Promise<Object>} 更新后的提示词对象
 */
export async function toggleCustomPrompt(id, isActive) {
  try {
    return await db.customPrompts.update({
      where: { id },
      data: { isActive, updateAt: new Date() }
    });
  } catch (error) {
    console.error('Failed to toggle custom prompt:', error);
    throw error;
  }
}

/**
 * 获取所有可用的提示词类型和键名信息
 * @returns {Promise<Object>} 提示词配置信息
 */
export async function getPromptTemplates() {
  // 重新组织的提示词分类配置
  return {
    generation: {
      displayName: {
        'zh-CN': '内容生成',
        en: 'Content Generation'
      },
      prompts: {
        QUESTION_PROMPT: {
          name: '基础问题生成',
          description:
            '根据文本内容生成高质量问题的基础提示词，变量：{{text}} 待生成问题的文本，{{textLength}} 文本字数，{{number}} 目标问题数量，可选 {{gaPrompt}} 用于体裁受众增强',
          type: 'question'
        },
        QUESTION_PROMPT_EN: {
          name: 'Basic Question Generation',
          description:
            'Prompt for generating high-quality questions from text content in English. Variables: {{text}} source text, {{textLength}} text length, {{number}} question count, optional {{gaPrompt}} for GA enhancement',
          type: 'question'
        },
        ANSWER_PROMPT: {
          name: '基础答案生成',
          description:
            '基于给定文本和问题生成准确答案的基础提示词，变量：{{text}} 参考文本，{{question}} 需要回答的问题，{{templatePrompt}} 问题模版提示词，{{outputFormatPrompt}} 问题模版自定义输出格式',
          type: 'answer'
        },
        ANSWER_PROMPT_EN: {
          name: 'Basic Answer Generation',
          description:
            'Prompt for generating accurate answers based on given text and questions in English. Variables: {{text}} reference text, {{question}} question to answer, {{templatePrompt}} question template prompt, {{outputFormatPrompt}} question template custom output format',
          type: 'answer'
        },
        ENHANCED_ANSWER_PROMPT: {
          name: 'MGA增强答案生成',
          description:
            '结合体裁受众信息生成风格化答案的高级提示词，变量：{{text}} 参考文本，{{question}} 原始问题，可选 {{gaPrompt}} 表示体裁受众要求，{{templatePrompt}} 问题模版提示词，{{outputFormatPrompt}} 问题模版自定义输出格式',
          type: 'enhancedAnswer'
        },
        ENHANCED_ANSWER_PROMPT_EN: {
          name: 'MGA Enhanced Answer Generation',
          description:
            'Advanced prompt for generating stylized answers with GA information in English. Variables: {{text}} reference content, {{question}} original question, optional {{gaPrompt}} for GA adaptation, {{templatePrompt}} question template prompt, {{outputFormatPrompt}} question template custom output format',
          type: 'enhancedAnswer'
        },
        GA_GENERATION_PROMPT: {
          name: 'GA组合生成',
          description: '根据文本内容自动生成体裁受众组合的提示词，变量：{{text}} 原始文本',
          type: 'ga-generation'
        },
        GA_GENERATION_PROMPT_EN: {
          name: 'GA Pair Generation',
          description:
            'Prompt for automatically generating GA pairs from text content in English. Variable: {{text}} source text',
          type: 'ga-generation'
        },
        DISTILL_QUESTIONS_PROMPT: {
          name: '问题蒸馏生成',
          description:
            '基于特定标签领域生成多样化高质量问题的蒸馏提示词，变量：{{currentTag}} 当前标签，{{tagPath}} 标签完整链路，{{count}} 目标问题数，可选 {{existingQuestions}} 用于避免重复',
          type: 'distillQuestions'
        },
        DISTILL_QUESTIONS_PROMPT_EN: {
          name: 'Question Distillation',
          description:
            'Distillation prompt for generating questions for tag domains in English. Variables: {{currentTag}} current tag, {{tagPath}} tag path, {{count}} question count, optional {{existingQuestionsText}} for deduplication',
          type: 'distillQuestions'
        },
        ASSISTANT_REPLY_PROMPT: {
          name: '多轮对话回复生成',
          description:
            '生成多轮对话中助手角色回复的提示词，变量：{{scenario}} 对话场景，{{roleA}} 提问者角色，{{roleB}} 回答者角色，{{chunkContent}} 原始文本，{{conversationHistory}} 对话历史，{{currentRound}} 当前轮次，{{totalRounds}} 总轮次',
          type: 'multiTurnConversation'
        },
        ASSISTANT_REPLY_PROMPT_EN: {
          name: 'Multi-turn Conversation Reply Generation',
          description:
            'Prompt for generating assistant role replies in multi-turn conversations. Variables: {{scenario}} conversation scenario, {{roleA}} questioner role, {{roleB}} responder role, {{chunkContent}} original text, {{conversationHistory}} conversation history, {{currentRound}} current round, {{totalRounds}} total rounds',
          type: 'multiTurnConversation'
        },
        NEXT_QUESTION_PROMPT: {
          name: '多轮对话问题生成',
          description:
            '基于对话历史生成下一轮问题的提示词，变量：{{scenario}} 对话场景，{{roleA}} 提问者角色，{{roleB}} 回答者角色，{{chunkContent}} 原始文本，{{conversationHistory}} 对话历史，{{nextRound}} 下一轮次，{{totalRounds}} 总轮次',
          type: 'multiTurnConversation'
        },
        NEXT_QUESTION_PROMPT_EN: {
          name: 'Multi-turn Conversation Question Generation',
          description:
            'Prompt for generating next round questions based on conversation history. Variables: {{scenario}} conversation scenario, {{roleA}} questioner role, {{roleB}} responder role, {{chunkContent}} original text, {{conversationHistory}} conversation history, {{nextRound}} next round, {{totalRounds}} total rounds',
          type: 'multiTurnConversation'
        },
        IMAGE_QUESTION_PROMPT: {
          name: '图像问题生成',
          description:
            '基于图像内容生成高质量问题的专业提示词，用于构建视觉问答训练数据集。变量：{{number}} 目标问题数量',
          type: 'imageQuestion'
        },
        IMAGE_QUESTION_PROMPT_EN: {
          name: 'Image Question Generation',
          description:
            'Professional prompt for generating high-quality questions based on image content for visual question-answering training datasets. Variables: {{number}} target question count',
          type: 'imageQuestion'
        }
      }
    },
    labeling: {
      displayName: {
        'zh-CN': '标签管理',
        en: 'Label Management'
      },
      prompts: {
        LABEL_PROMPT: {
          name: '领域树生成',
          description: '根据文档目录结构自动生成领域分类标签树的提示词，变量：{{text}} 待分析目录文本',
          type: 'label'
        },
        LABEL_PROMPT_EN: {
          name: 'Domain Tree Generation',
          description:
            'Prompt for generating domain label tree from document structure in English. Variable: {{text}} catalog content',
          type: 'label'
        },
        ADD_LABEL_PROMPT: {
          name: '问题标签匹配',
          description:
            '为生成的问题匹配最合适领域标签的智能匹配提示词，变量：{{label}} 标签数组，{{question}} 问题数组',
          type: 'addLabel'
        },
        ADD_LABEL_PROMPT_EN: {
          name: 'Question Label Matching',
          description:
            'Intelligent matching prompt for assigning domain labels to questions in English. Variables: {{label}} label list, {{question}} question list',
          type: 'addLabel'
        },
        LABEL_REVISE_PROMPT: {
          name: '领域树修订',
          description:
            '在内容变化时对现有领域树进行增量修订的提示词，变量：{{existingTags}} 现有标签树，{{text}} 最新目录汇总，可选 {{deletedContent}}/{{newContent}} 表示删除或新增内容',
          type: 'labelRevise'
        },
        LABEL_REVISE_PROMPT_EN: {
          name: 'Domain Tree Revision',
          description:
            'Prompt for incrementally revising domain tree in English environment. Variables: {{existingTags}} current tag tree, {{text}} combined TOC, optional {{deletedContent}}/{{newContent}} blocks',
          type: 'labelRevise'
        },
        DISTILL_TAGS_PROMPT: {
          name: '标签蒸馏生成',
          description:
            '基于现有标签体系生成更细粒度子标签的蒸馏提示词，变量：{{parentTag}} 当前父标签，{{path}}/{{tagPath}} 标签链路，{{count}} 子标签数量，可选 {{existingTagsText}} 表示已有子标签',
          type: 'distillTags'
        },
        DISTILL_TAGS_PROMPT_EN: {
          name: 'Tag Distillation',
          description:
            'Distillation prompt for generating sub-tags based on tag system in English. Variables: {{parentTag}} parent tag, {{path}}/{{tagPath}} hierarchy path, {{count}} target number, optional {{existingTagsText}} existing sub-tags',
          type: 'distillTags'
        }
      }
    },
    optimization: {
      displayName: {
        'zh-CN': '内容优化',
        en: 'Content Optimization'
      },
      prompts: {
        NEW_ANSWER_PROMPT: {
          name: '答案优化重写',
          description:
            '根据用户反馈建议对答案进行优化重写的提示词，变量：{{chunkContent}} 原始文本块，{{question}} 原始问题，{{answer}} 待优化答案，{{cot}} 待优化思维链，{{advice}} 优化建议',
          type: 'newAnswer'
        },
        NEW_ANSWER_PROMPT_EN: {
          name: 'Answer Optimization Rewrite',
          description:
            'Prompt for optimizing and rewriting answers based on feedback in English. Variables: {{chunkContent}} original chunk, {{question}} question, {{answer}} answer, {{cot}} chain of thought, {{advice}} feedback',
          type: 'newAnswer'
        },
        OPTIMIZE_COT_PROMPT: {
          name: '思维链优化',
          description:
            '优化答案中思维链推理过程和逻辑结构的提示词，变量：{{originalQuestion}} 原始问题，{{answer}} 答案，{{originalCot}} 原始思维链',
          type: 'optimizeCot'
        },
        OPTIMIZE_COT_PROMPT_EN: {
          name: 'Chain-of-Thought Optimization',
          description:
            'Prompt for optimizing chain-of-thought reasoning process in English. Variables: {{originalQuestion}} question, {{answer}} answer, {{originalCot}} original chain of thought',
          type: 'optimizeCot'
        }
      }
    },
    processing: {
      displayName: {
        'zh-CN': '数据处理',
        en: 'Data Processing'
      },
      prompts: {
        DATA_CLEAN_PROMPT: {
          name: '文本数据清洗',
          description: '清理和标准化原始文本数据格式的提示词，变量：{{text}} 需清洗文本，{{textLength}} 文本字数',
          type: 'dataClean'
        },
        DATA_CLEAN_PROMPT_EN: {
          name: 'Text Data Cleaning',
          description:
            'Prompt for cleaning and standardizing text data in English environment. Variables: {{text}} text to clean, {{text.length}} length placeholder',
          type: 'dataClean'
        }
      }
    },
    evaluation: {
      displayName: {
        'zh-CN': '质量评估',
        en: 'Quality Evaluation'
      },
      prompts: {
        DATASET_EVALUATION_PROMPT: {
          name: '数据集质量评估',
          description:
            '对问答数据集进行多维度质量评估的专业提示词，变量：{{chunkContent}} 原始文本块内容，{{question}} 问题，{{answer}} 答案',
          type: 'datasetEvaluation'
        },
        DATASET_EVALUATION_PROMPT_EN: {
          name: 'Dataset Quality Evaluation',
          description:
            'Professional prompt for multi-dimensional quality evaluation of Q&A datasets. Variables: {{chunkContent}} original text chunk, {{question}} question, {{answer}} answer',
          type: 'datasetEvaluation'
        }
      }
    }
  };
}
