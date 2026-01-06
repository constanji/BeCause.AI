/**
 * BeCauseSkills - 智能问数工具集合
 * 
 * 重构后的智能问数工具系统，将原来的大而全的 because 工具拆分为多个独立工具：
 * 1. intent-classification-tool: 意图分类
 * 2. rag-retrieval-tool: RAG知识检索
 * 3. reranker-tool: 结果重排序
 * 4. sql-validation-tool: SQL校验
 * 5. result-analysis-tool: 结果分析
 * 
 * 优势：
 * - 每个工具职责单一，token占用少
 * - 深度集成RAG服务，检索更高效
 * - 工具可以独立使用，也可以组合使用
 * - 符合skill结构，易于维护和扩展
 */

const IntentClassificationTool = require('./intent-classification-tool/scripts/IntentClassificationTool');
const RAGRetrievalTool = require('./rag-retrieval-tool/scripts/RAGRetrievalTool');
const RerankerTool = require('./reranker-tool/scripts/RerankerTool');
const SQLValidationTool = require('./sql-validation-tool/scripts/SQLValidationTool');
const ResultAnalysisTool = require('./result-analysis-tool/scripts/ResultAnalysisTool');
const SqlExecutorTool = require('./sql-executor-tool/scripts/SqlExecutorTool');

module.exports = {
  IntentClassificationTool,
  RAGRetrievalTool,
  RerankerTool,
  SQLValidationTool,
  ResultAnalysisTool,
  SqlExecutorTool,
};

