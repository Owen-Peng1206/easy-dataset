import { processPrompt } from '../common/prompt-loader';

// 原始问题就是默认提示词，templatePrompt、outputFormatPrompt 只有在定义问题模版时才会存在
export const IMAGE_ANSWER_PROMPT = `{{question}}{{templatePrompt}}{{outputFormatPrompt}}`;

/**
 * 生成图像答案提示词
 * @param {string} language - 语言，'en' 或 'zh-CN'
 * @param {Object} params - 参数对象
 * @param {number} params.number - 问题数量
 * @param {string} projectId - 项目ID（用于自定义提示词）
 * @returns {string} - 完整的提示词
 */
export async function getImageAnswerPrompt(language, { question, questionTemplate }, projectId = null) {
  let templatePrompt = '';
  let outputFormatPrompt = '';

  if (questionTemplate) {
    const { customFormat, description, labels, answerType } = questionTemplate;
    if (description) {
      templatePrompt = `\n\n${description}`;
    }
    if (answerType === 'label') {
      outputFormatPrompt =
        language === 'en'
          ? ` \n\n ## Output Format \n\n Final output must be a string array, and must be selected from the following array, if the answer is not in the target array, return: ["other"] No additional information can be added: \n\n${labels}`
          : `\n\n ## 输出格式 \n\n 最终输出必须是一个字符串数组，而且必须在以下数组中选择，如果答案不在目标数组中，返回：["其他"] 不得额外添加任何其他信息：\n\n${labels}`;
    } else if (answerType === 'custom_format') {
      outputFormatPrompt =
        language === 'en'
          ? ` \n\n ## Output Format \n\n Final output must strictly follow the following structure, no additional information can be added: \n\n${customFormat}`
          : `\n\n ## 输出格式 \n\n 最终输出必须严格遵循以下结构，不得额外添加任何其他信息：\n\n${customFormat}`;
    }
  }

  const result = await processPrompt(
    language,
    'imageAnswer',
    'IMAGE_ANSWER_PROMPT',
    { zh: IMAGE_ANSWER_PROMPT, en: IMAGE_ANSWER_PROMPT },
    {
      question,
      templatePrompt,
      outputFormatPrompt
    },
    projectId
  );
  return result;
}
