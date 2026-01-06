const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');
const path = require('path');

// 导入 BeCauseSkills 中的各个工具
// 使用相对路径从api/app/clients/tools/structured访问项目根目录的BeCauseSkills
// __dirname = api/app/clients/tools/structured
// 需要回到项目根目录: ../../../../BeCauseSkills
// 但实际路径是: 从 api/app/clients/tools/structured 到项目根目录需要 5 级向上
const projectRoot = path.resolve(__dirname, '../../../../..');
const BeCauseSkills = require(path.join(projectRoot, 'BeCauseSkills'));

/**
 * BeCause问数工具 - 统一的智能问数工具入口
 * 
 * 这是一个统一的工具入口，内部集成了 BeCauseSkills 中的所有工具能力：
 * - 意图分类 (intent-classification)
 * - RAG知识检索 (rag-retrieval)
 * - 结果重排序 (reranker)
 * - SQL校验 (sql-validation)
 * - 结果分析 (result-analysis)
 * - SQL执行 (sql-executor)
 * 
 * 通过统一的 command 参数来调用不同的子工具能力。
 */
class BeCauseSkillsTool extends Tool {
  name = 'because_skills';

  description =
    'BeCause问数工具 - 智能问数（自然语言转SQL）的完整能力集。' +
    'Commands: intent-classification (意图分类), rag-retrieval (RAG知识检索), ' +
    'reranker (结果重排序), sql-validation (SQL校验), result-analysis (结果分析), ' +
    'sql-executor (SQL执行)。' +
    '此工具集成了RAG服务、知识库检索、SQL生成与执行等完整问数流程。';

  schema = z.object({
    command: z.enum([
      'intent-classification',
      'rag-retrieval',
      'reranker',
      'sql-validation',
      'result-analysis',
      'sql-executor',
    ]),
    arguments: z
      .string()
      .optional()
      .describe('命令参数，JSON字符串格式，包含各命令所需的参数'),
  });

  constructor(fields = {}) {
    super();
    this.userId = fields.userId || 'system';
    this.req = fields.req;
    this.projectRoot = fields.projectRoot || process.cwd();
    this.conversation = fields.conversation; // 保存conversation信息
    
    // 初始化各个子工具实例
    this.tools = {
      'intent-classification': new BeCauseSkills.IntentClassificationTool({
        userId: this.userId,
        req: this.req,
        conversation: this.conversation, // 传递conversation给IntentClassificationTool
      }),
      'rag-retrieval': new BeCauseSkills.RAGRetrievalTool({
        userId: this.userId,
        req: this.req,
        conversation: this.conversation, // 传递conversation给RAGRetrievalTool
      }),
      'reranker': new BeCauseSkills.RerankerTool({
        userId: this.userId,
        req: this.req,
      }),
      'sql-validation': new BeCauseSkills.SQLValidationTool({
        userId: this.userId,
        req: this.req,
      }),
      'result-analysis': new BeCauseSkills.ResultAnalysisTool({
        userId: this.userId,
        req: this.req,
      }),
      'sql-executor': new BeCauseSkills.SqlExecutorTool({
        userId: this.userId,
        req: this.req,
        conversation: this.conversation, // 传递conversation给SqlExecutorTool
      }),
    };
  }

  /**
   * 解析 arguments 参数
   */
  parseArguments(argsString) {
    if (!argsString || !argsString.trim()) {
      return {};
    }
    try {
      return JSON.parse(argsString);
    } catch (error) {
      logger.warn('[BeCauseSkillsTool] Failed to parse arguments:', error);
      return {};
    }
  }

  /**
   * @override
   */
  async _call(input) {
    const startTime = Date.now();
    try {
      const { command, arguments: argsString } = input;

      logger.info('[BeCauseSkillsTool] ========== 开始调用 ==========');
      logger.info(`[BeCauseSkillsTool] Command: ${command}, UserId: ${this.userId}`);

      const tool = this.tools[command];
      if (!tool) {
        return JSON.stringify(
          {
            success: false,
            error: `未知命令: ${command}`,
          },
          null,
          2,
        );
      }

      // 解析参数
      const args = this.parseArguments(argsString);

      // 调用对应的子工具
      const result = await tool._call(args);

      const duration = Date.now() - startTime;
      logger.info(`[BeCauseSkillsTool] 执行完成，耗时: ${duration}ms`);
      logger.info('[BeCauseSkillsTool] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      logger.error(`[BeCauseSkillsTool] 执行错误 (耗时: ${duration}ms):`, err);
      return JSON.stringify(
        {
          success: false,
          error: err.message || 'BeCause问数工具执行失败',
        },
        null,
        2,
      );
    }
  }
}

module.exports = BeCauseSkillsTool;

