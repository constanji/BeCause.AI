const { logger } = require('@because/data-schemas');
const AutoKnowledgeExtractor = require('./AutoKnowledgeExtractor');
const { getMessage } = require('~/models/Message');

/**
 * 消息知识提取钩子
 * 在消息保存后自动提取知识
 */
class MessageKnowledgeHook {
  constructor() {
    this.extractor = new AutoKnowledgeExtractor();
    this.enabled = process.env.AUTO_EXTRACT_KNOWLEDGE === 'true';
  }

  /**
   * 在AI消息保存后触发知识提取
   * @param {Object} req - 请求对象
   * @param {Object} aiMessage - AI回复消息
   * @returns {Promise<void>}
   */
  async onAIMessageSaved(req, aiMessage) {
    if (!this.enabled || !aiMessage || !req?.user?.id) {
      return;
    }

    try {
      // 检查是否是AI回复（不是用户消息）
      if (aiMessage.isCreatedByUser) {
        return;
      }

      // 获取父消息（用户的问题）
      if (!aiMessage.parentMessageId || aiMessage.parentMessageId === '00000000-0000-0000-0000-000000000000') {
        return;
      }

      const parentMessage = await getMessage(req.user.id, aiMessage.parentMessageId);

      if (!parentMessage || !parentMessage.isCreatedByUser) {
        return;
      }

      // 异步提取知识（不阻塞消息保存）
      setImmediate(async () => {
        try {
          await this.extractor.extractAndStore(
            {
              text: parentMessage.text,
              user: parentMessage.user,
            },
            {
              text: aiMessage.text,
            },
            req.user.id
          );
        } catch (error) {
          logger.error('[MessageKnowledgeHook] 异步提取知识失败:', error);
        }
      });

      logger.debug('[MessageKnowledgeHook] 已触发知识提取任务');
    } catch (error) {
      logger.error('[MessageKnowledgeHook] 处理AI消息失败:', error);
      // 不抛出错误，避免影响消息保存
    }
  }
}

// 单例实例
const messageKnowledgeHook = new MessageKnowledgeHook();

module.exports = messageKnowledgeHook;

