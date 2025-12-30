const { logger } = require('@because/data-schemas');
const mongoose = require('mongoose');
const { createModels } = require('@because/data-schemas');
const VectorDBService = require('./VectorDBService');

// 确保模型已创建（如果还没有）
let KnowledgeEntry;
try {
  const models = require('~/db/models');
  KnowledgeEntry = models.KnowledgeEntry;
  if (!KnowledgeEntry) {
    // 如果模型未导出，直接创建
    const createdModels = createModels(mongoose);
    KnowledgeEntry = createdModels.KnowledgeEntry;
  }
} catch (e) {
  // 如果从 db/models 导入失败，直接创建模型
  const createdModels = createModels(mongoose);
  KnowledgeEntry = createdModels.KnowledgeEntry;
}
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
const EmbeddingService = require('./EmbeddingService');

/**
 * 向量检索服务
 * 负责从知识库中检索相关内容
 */
class RetrievalService {
  constructor() {
    this.embeddingService = new EmbeddingService();
    this.vectorDBService = new VectorDBService();
    this.ragApiUrl = process.env.RAG_API_URL; // 可选，仅用于文件检索
    this.useVectorDB = process.env.USE_VECTOR_DB !== 'false'; // 默认启用向量数据库
  }

  /**
   * 计算余弦相似度
   * @param {number[]} vec1 - 向量1
   * @param {number[]} vec2 - 向量2
   * @returns {number} 相似度分数（0-1）
   */
  cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }

  /**
   * 从知识库中检索相关内容
   * @param {Object} params
   * @param {string} params.query - 查询文本
   * @param {string} params.userId - 用户ID
   * @param {string[]} [params.types] - 要检索的知识类型数组
   * @param {string} [params.entityId] - 实体ID过滤
   * @param {number} [params.topK] - 返回前K个结果
   * @param {number} [params.minScore] - 最小相似度分数
   * @returns {Promise<Array>} 检索结果数组
   */
  async retrieveFromKnowledgeBase({ query, userId, types, entityId, topK = 10, minScore = 0.5 }) {
    try {
      // 1. 将查询文本向量化
      logger.info(`[RetrievalService] 开始向量化查询文本: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`);
      const queryEmbedding = await this.embeddingService.embedText(query, userId);
      
      if (!queryEmbedding) {
        logger.warn('[RetrievalService] 查询文本向量化失败，无法进行检索');
        return [];
      }
      
      logger.info(`[RetrievalService] 查询文本向量化完成 (维度: ${queryEmbedding.length})`);

      // 2. 优先使用向量数据库进行高效相似度搜索
      if (this.useVectorDB) {
        try {
          const searchTypes = types && types.length > 0 ? types.join(', ') : '全部类型';
          logger.info(`[RetrievalService] 开始在向量数据库中搜索相似向量 (类型: ${searchTypes}, topK: ${topK * 2}, minScore: ${minScore})`);
          const vectorResults = await this.vectorDBService.searchSimilar({
            queryEmbedding,
            userId: userId.toString(),
            types,
            topK: topK * 2, // 检索更多结果以便后续过滤
            minScore,
          });

          // 从 MongoDB 获取完整信息
          if (vectorResults.length > 0) {
            const knowledgeEntryIds = vectorResults.map(r => r.knowledgeEntryId);
            const knowledgeEntries = await KnowledgeEntry.find({
              _id: { $in: knowledgeEntryIds },
              user: userId,
            })
              .select('type title content embedding metadata')
              .lean();

            // 合并向量数据库的相似度分数和 MongoDB 的完整信息
            const resultsMap = new Map(knowledgeEntries.map(e => [e._id.toString(), e]));
            const scoredResults = vectorResults
              .map(vectorResult => {
                const entry = resultsMap.get(vectorResult.knowledgeEntryId);
                if (!entry) return null;

                // 应用实体ID过滤
                if (entityId && entry.metadata?.entity_id !== entityId) {
                  return null;
                }

                return {
                  ...entry,
                  score: vectorResult.score,
                  similarity: vectorResult.score,
                };
              })
              .filter(result => result !== null)
              .slice(0, topK);

            logger.info(`[RetrievalService] 从向量数据库检索到 ${scoredResults.length} 个相关结果`);
            return scoredResults;
          }
        } catch (vectorError) {
          logger.warn('[RetrievalService] VectorDB search failed, falling back to MongoDB:', vectorError.message);
        }
      }

      // 3. 回退到 MongoDB 中的向量相似度计算
      logger.info('[RetrievalService] 使用MongoDB进行向量相似度计算（向量数据库不可用或回退）');
      const queryConditions = { user: userId };

      if (types && types.length > 0) {
        queryConditions.type = { $in: types };
      }

      if (entityId) {
        queryConditions['metadata.entity_id'] = entityId;
      }

      const knowledgeEntries = await KnowledgeEntry.find(queryConditions)
        .select('type title content embedding metadata')
        .lean();

      if (knowledgeEntries.length === 0) {
        logger.info('[RetrievalService] 未找到相关知识条目');
        return [];
      }

      // 4. 计算相似度并排序
      const scoredResults = knowledgeEntries
        .map(entry => {
          if (!entry.embedding || entry.embedding.length === 0) {
            return null;
          }

          const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
          return {
            ...entry,
            score,
            similarity: score,
          };
        })
        .filter(result => result !== null && result.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.info(`[RetrievalService] 从MongoDB检索到 ${scoredResults.length} 个相关结果`);

      return scoredResults;
    } catch (error) {
      logger.error('[RetrievalService] 检索失败:', error);
      throw error;
    }
  }

  /**
   * 从文件向量库中检索（兼容现有文件检索）
   * 注意：如果 RAG_API_URL 未配置，此功能将不可用
   * @param {Object} params
   * @param {string} params.query - 查询文本
   * @param {string} params.fileId - 文件ID
   * @param {string} params.userId - 用户ID
   * @param {number} [params.k] - 返回前K个结果
   * @returns {Promise<Array>} 检索结果数组
   */
  async retrieveFromFiles({ query, fileId, userId, k = 4 }) {
    if (!this.ragApiUrl) {
      logger.warn('[RetrievalService] RAG_API_URL not configured, file retrieval disabled');
      return [];
    }

    try {
      const axios = require('axios');
      const { generateShortLivedToken } = require('@because/api');
      const jwtToken = generateShortLivedToken(userId);

      const response = await axios.post(
        `${this.ragApiUrl}/query`,
        {
          file_id: fileId,
          query,
          k,
        },
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // 转换格式以统一返回
      const results = (response.data || []).map(([docInfo, distance]) => ({
        type: KnowledgeType.FILE,
        title: docInfo.metadata?.source?.split('/').pop() || '文件',
        content: docInfo.page_content,
        score: 1.0 - distance, // 将距离转换为相似度分数
        similarity: 1.0 - distance,
        metadata: {
          file_id: fileId,
          filename: docInfo.metadata?.source?.split('/').pop(),
          page: docInfo.metadata?.page || null,
        },
      }));

      return results;
    } catch (error) {
      logger.error('[RetrievalService] 文件检索失败:', error);
      // 失败时返回空数组，不抛出错误
      return [];
    }
  }

  /**
   * 混合检索：从知识库和文件中检索
   * @param {Object} params
   * @param {string} params.query - 查询文本
   * @param {string} params.userId - 用户ID
   * @param {string[]} [params.fileIds] - 文件ID数组
   * @param {string[]} [params.types] - 知识类型数组
   * @param {string} [params.entityId] - 实体ID
   * @param {number} [params.topK] - 总返回数量
   * @returns {Promise<Array>} 混合检索结果
   */
  async hybridRetrieve({ query, userId, fileIds, types, entityId, topK = 10 }) {
    try {
      const promises = [];

      // 1. 从知识库检索
      promises.push(
        this.retrieveFromKnowledgeBase({
          query,
          userId,
          types,
          entityId,
          topK: Math.ceil(topK * 0.7), // 70% 来自知识库
        })
      );

      // 2. 从文件检索（如果有文件ID）
      if (fileIds && fileIds.length > 0) {
        const filePromises = fileIds.map(fileId =>
          this.retrieveFromFiles({
            query,
            fileId,
            userId,
            k: Math.ceil(topK * 0.3 / fileIds.length), // 30% 来自文件
          })
        );
        promises.push(...filePromises);
      }

      // 3. 等待所有检索完成
      const results = await Promise.all(promises);
      const flatResults = results.flat();

      // 4. 按相似度排序并返回前K个
      const sortedResults = flatResults
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.info(`[RetrievalService] 混合检索返回 ${sortedResults.length} 个结果`);

      return sortedResults;
    } catch (error) {
      logger.error('[RetrievalService] 混合检索失败:', error);
      throw error;
    }
  }
}

module.exports = RetrievalService;

