const { logger } = require('@because/data-schemas');
const RAGService = require('./RAGService');
// 从编译后的包中导入，或使用本地 JavaScript 文件
let KnowledgeType;
try {
  KnowledgeType = require('@because/data-schemas/schema/knowledgeBase').KnowledgeType;
} catch (e) {
  try {
    KnowledgeType = require('../../../../packages/data-schemas/src/schema/knowledgeBase').KnowledgeType;
  } catch (e2) {
    KnowledgeType = {
      SEMANTIC_MODEL: 'semantic_model',
      QA_PAIR: 'qa_pair',
      SYNONYM: 'synonym',
      BUSINESS_KNOWLEDGE: 'business_knowledge',
      FILE: 'file',
    };
  }
}

/**
 * 自动知识提取服务
 * 从对话中自动提取并存储知识条目
 */
class AutoKnowledgeExtractor {
  constructor() {
    this.ragService = new RAGService();
    this.enabled = process.env.AUTO_EXTRACT_KNOWLEDGE === 'true';
    this.minScore = parseFloat(process.env.AUTO_EXTRACT_MIN_SCORE || '0.8');
  }

  /**
   * 从消息对中提取QA对
   * @param {Object} userMessage - 用户消息
   * @param {Object} aiMessage - AI回复消息
   * @returns {Promise<Object|null>} QA对数据，如果不适合提取则返回null
   */
  async extractQAFromMessages(userMessage, aiMessage) {
    if (!this.enabled) {
      return null;
    }

    try {
      // 检查是否适合提取为QA对
      if (!this.isValidQA(userMessage, aiMessage)) {
        return null;
      }

      // 检查是否已存在相似的QA对（避免重复）
      const existingQA = await this.checkDuplicateQA(
        userMessage.text,
        userMessage.user
      );

      if (existingQA) {
        logger.debug('[AutoKnowledgeExtractor] 发现相似的QA对，跳过提取');
        return null;
      }

      return {
        type: KnowledgeType.QA_PAIR,
        question: userMessage.text.trim(),
        answer: aiMessage.text.trim(),
      };
    } catch (error) {
      logger.error('[AutoKnowledgeExtractor] 提取QA对失败:', error);
      return null;
    }
  }

  /**
   * 判断消息对是否适合提取为QA对
   * @param {Object} userMessage - 用户消息
   * @param {Object} aiMessage - AI回复消息
   * @returns {boolean} 是否适合
   */
  isValidQA(userMessage, aiMessage) {
    if (!userMessage || !aiMessage) {
      return false;
    }

    const userText = userMessage.text?.trim() || '';
    const aiText = aiMessage.text?.trim() || '';

    // 基本验证
    if (userText.length < 5 || aiText.length < 10) {
      return false;
    }

    // 检查用户消息是否是问题形式
    const isQuestion = 
      userText.includes('?') || 
      userText.includes('？') ||
      userText.includes('什么') ||
      userText.includes('如何') ||
      userText.includes('怎么') ||
      userText.includes('为什么') ||
      userText.includes('能否') ||
      userText.length < 200; // 短消息更可能是问题

    // 检查AI回复是否是回答形式
    const isAnswer = 
      aiText.length > 20 && // 回答应该有一定长度
      !aiText.startsWith('抱歉') && // 排除无法回答的情况
      !aiText.startsWith('我不确定');

    return isQuestion && isAnswer;
  }

  /**
   * 检查是否存在重复的QA对
   * @param {string} question - 问题文本
   * @param {string} userId - 用户ID
   * @returns {Promise<boolean>} 是否存在重复
   */
  async checkDuplicateQA(question, userId) {
    try {
      // 使用RAG服务查询相似的问题
      const results = await this.ragService.query({
        query: question,
        userId: userId.toString(),
        options: {
          types: [KnowledgeType.QA_PAIR],
          topK: 1,
          useReranking: true,
        },
      });

      // 如果找到相似度很高的QA对，认为是重复
      if (results.results && results.results.length > 0) {
        const topResult = results.results[0];
        if (topResult.score >= this.minScore) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn('[AutoKnowledgeExtractor] 检查重复QA失败:', error);
      return false; // 出错时不阻止提取
    }
  }

  /**
   * 从对话中提取知识并存储
   * @param {Object} params
   * @param {Object} params.userMessage - 用户消息
   * @param {Object} params.aiMessage - AI回复消息
   * @param {string} params.userId - 用户ID
   * @returns {Promise<Object|null>} 存储的知识条目，如果未提取则返回null
   */
  async extractAndStore(userMessage, aiMessage, userId) {
    if (!this.enabled) {
      return null;
    }

    try {
      // 提取QA对
      const qa = await this.extractQAFromMessages(userMessage, aiMessage);

      if (qa) {
        // 存储到知识库
        const result = await this.ragService.addKnowledge({
          userId: userId.toString(),
          type: qa.type,
          data: {
            question: qa.question,
            answer: qa.answer,
          },
        });

        logger.info('[AutoKnowledgeExtractor] 自动提取并存储QA对:', {
          question: qa.question.substring(0, 50),
        });

        return result;
      }

      return null;
    } catch (error) {
      logger.error('[AutoKnowledgeExtractor] 提取和存储知识失败:', error);
      return null;
    }
  }

  /**
   * 批量从对话历史中提取知识
   * @param {Object} params
   * @param {Array} params.messages - 消息数组
   * @param {string} params.userId - 用户ID
   * @returns {Promise<Array>} 提取的知识条目数组
   */
  async extractFromConversation({ messages, userId }) {
    if (!this.enabled || !messages || messages.length < 2) {
      return [];
    }

    const extractedKnowledge = [];

    try {
      // 遍历消息，寻找用户问题和AI回答的配对
      for (let i = 0; i < messages.length - 1; i++) {
        const currentMessage = messages[i];
        const nextMessage = messages[i + 1];

        // 检查是否是用户消息后跟AI消息
        if (
          currentMessage.isCreatedByUser &&
          !nextMessage.isCreatedByUser
        ) {
          const qa = await this.extractAndStore(
            currentMessage,
            nextMessage,
            userId
          );

          if (qa) {
            extractedKnowledge.push(qa);
          }
        }
      }

      logger.info(`[AutoKnowledgeExtractor] 从对话中提取了 ${extractedKnowledge.length} 个知识条目`);

      return extractedKnowledge;
    } catch (error) {
      logger.error('[AutoKnowledgeExtractor] 从对话提取知识失败:', error);
      return [];
    }
  }
}

module.exports = AutoKnowledgeExtractor;

