const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');
const path = require('path');

// 延迟加载RAGService，避免路径别名问题
let RAGService = null;
function loadRAGService() {
  if (!RAGService) {
    try {
      RAGService = require('~/server/services/RAG').RAGService;
    } catch (e) {
      RAGService = require(path.resolve(__dirname, '../../../api/server/services/RAG')).RAGService;
    }
  }
  return RAGService;
}

/**
 * Intent Classification Tool - 意图分类工具
 * 
 * 轻量级意图分类工具，使用RAG检索提高分类准确性
 * 只返回分类结果，不包含冗长的模板说明
 */
class IntentClassificationTool extends Tool {
  name = 'intent_classification';

  description =
    '分类用户查询意图：TEXT_TO_SQL（需要生成SQL）、GENERAL（数据库一般问题）、MISLEADING_QUERY（无关查询）。' +
    '自动使用RAG检索相关知识提高分类准确性。';

  schema = z.object({
    query: z
      .string()
      .min(1)
      .describe('用户查询文本'),
    use_rag: z
      .boolean()
      .optional()
      .default(true)
      .describe('是否使用RAG检索提高分类准确性，默认启用'),
    top_k: z
      .number()
      .int()
      .positive()
      .max(10)
      .optional()
      .default(5)
      .describe('RAG检索返回数量，默认5'),
    entity_id: z
      .string()
      .optional()
      .describe('实体ID过滤（数据源ID）'),
  });

  constructor(fields = {}) {
    super();
    this.userId = fields.userId || 'system';
    this.req = fields.req;
    this.conversation = fields.conversation; // 保存conversation信息
    this.ragService = null; // 延迟初始化
  }

  /**
   * 获取RAGService实例（延迟加载）
   */
  getRAGService() {
    if (!this.ragService) {
      const RAGServiceClass = loadRAGService();
      this.ragService = new RAGServiceClass();
    }
    return this.ragService;
  }

  /**
   * 调用RAG服务检索相关知识（直接调用RAGService，不通过HTTP）
   */
  async retrieveRAGKnowledge(query, userId, topK = 5, entityId = null) {
    try {
      const ragService = this.getRAGService();
      
      const result = await ragService.query({
        query,
        userId,
        options: {
          types: ['semantic_model', 'qa_pair', 'business_knowledge'],
          topK,
          useReranking: true,
          entityId,
        },
      });

      return result;
    } catch (error) {
      logger.warn('[IntentClassificationTool] RAG检索失败:', error.message);
      return null;
    }
  }

  /**
   * 基于RAG结果和查询文本分析意图
   */
  analyzeIntent(query, ragResults) {
    const ragContext = {
      semantic_models_found: false,
      qa_pairs_found: false,
      business_knowledge_found: false,
    };

    if (ragResults && ragResults.results) {
      const results = ragResults.results;
      ragContext.semantic_models_found = results.some(r => r.type === 'semantic_model');
      ragContext.qa_pairs_found = results.some(r => r.type === 'qa_pair');
      ragContext.business_knowledge_found = results.some(r => r.type === 'business_knowledge');
    }

    // 简单的意图判断逻辑（实际应该调用LLM）
    let intent = 'MISLEADING_QUERY';
    let confidence = 0.3;
    let reasoning = '';

    // 如果找到语义模型，更可能是TEXT_TO_SQL
    if (ragContext.semantic_models_found) {
      intent = 'TEXT_TO_SQL';
      confidence = 0.8;
      reasoning = '检索到相关数据库语义模型';
    } else if (ragContext.qa_pairs_found || ragContext.business_knowledge_found) {
      // 如果找到QA对或业务知识，可能是GENERAL
      intent = 'GENERAL';
      confidence = 0.6;
      reasoning = '检索到相关问答或业务知识';
    } else {
      // 检查查询文本中的关键词
      const sqlKeywords = ['查询', '统计', '显示', '列出', '计算', 'select', 'count', 'sum'];
      const hasSqlKeywords = sqlKeywords.some(keyword => 
        query.toLowerCase().includes(keyword.toLowerCase())
      );

      if (hasSqlKeywords) {
        intent = 'TEXT_TO_SQL';
        confidence = 0.5;
        reasoning = '查询包含SQL相关关键词';
      } else {
        intent = 'MISLEADING_QUERY';
        confidence = 0.3;
        reasoning = '未找到相关数据库信息';
      }
    }

    return {
      intent,
      confidence,
      reasoning,
      rag_context: ragContext,
    };
  }

  /**
   * 获取entityId（从conversation或input）
   */
  async getEntityId(input) {
    // 优先使用input中的entity_id
    if (input.entity_id) {
      return input.entity_id;
    }

    // 从conversation中获取数据源ID
    if (this.conversation) {
      // 优先使用conversation.data_source_id
      if (this.conversation.data_source_id) {
        return this.conversation.data_source_id;
      }
      
      // 如果conversation有project_id，从项目获取data_source_id
      if (this.conversation.project_id) {
        try {
          let getProjectById = null;
          try {
            getProjectById = require('~/models/Project').getProjectById;
          } catch (e) {
            getProjectById = require(path.resolve(__dirname, '../../../api/models/Project')).getProjectById;
          }
          const project = await getProjectById(this.conversation.project_id);
          if (project && project.data_source_id) {
            return project.data_source_id.toString();
          }
        } catch (error) {
          logger.warn('[IntentClassificationTool] 获取项目数据源失败:', error.message);
        }
      }
    }

    return null;
  }

  /**
   * @override
   */
  async _call(input) {
    const { query, use_rag = true, top_k = 5 } = input;

    try {
      logger.info('[IntentClassificationTool] 开始意图分类:', { query: query.substring(0, 50) });

      let ragResults = null;
      if (use_rag) {
        const userId = this.userId || 'system';
        const entityId = await this.getEntityId(input);
        ragResults = await this.retrieveRAGKnowledge(query, userId, top_k, entityId);
      }

      const analysis = this.analyzeIntent(query, ragResults);

      const result = {
        intent: analysis.intent,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        rephrased_question: query, // 简化处理，实际应调用LLM重述
        rag_context: analysis.rag_context,
      };

      logger.info('[IntentClassificationTool] 分类完成:', result);

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error('[IntentClassificationTool] 分类失败:', error);
      return JSON.stringify(
        {
          intent: 'MISLEADING_QUERY',
          confidence: 0.0,
          reasoning: `分类失败: ${error.message}`,
          error: error.message,
        },
        null,
        2,
      );
    }
  }
}

module.exports = IntentClassificationTool;

