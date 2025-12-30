/**
 * JavaScript 兼容导出
 * 用于在 JavaScript 文件中导入 KnowledgeType
 */

// 注意：这个文件是为了 JavaScript 兼容性
// TypeScript 文件中的导出会在编译后可用
// 如果项目支持直接导入 TypeScript，可以删除此文件

module.exports = {
  KnowledgeType: {
    SEMANTIC_MODEL: 'semantic_model',
    QA_PAIR: 'qa_pair',
    SYNONYM: 'synonym',
    BUSINESS_KNOWLEDGE: 'business_knowledge',
    FILE: 'file',
  },
};

