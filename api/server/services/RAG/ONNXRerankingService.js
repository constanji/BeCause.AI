const path = require('path');
const fs = require('fs');
const { logger } = require('@because/data-schemas');

/**
 * ONNX 重排服务
 * 使用本地 ONNX 模型进行文档重排序
 * 使用 @xenova/transformers 库来处理 ONNX 模型
 */
class ONNXRerankingService {
  constructor() {
    this.modelPath = path.join(__dirname, 'onnx', 'reranker', 'resources');
    this.pipeline = null;
    this.initialized = false;
  }

  /**
   * 初始化 ONNX 模型和 tokenizer
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 检查模型文件是否存在
      const modelFile = path.join(this.modelPath, 'ms-marco-MiniLM-L6-v2.onnx');
      const tokenizerFile = path.join(this.modelPath, 'ms-marco-MiniLM-L6-v2-tokenizer.json');

      if (!fs.existsSync(modelFile)) {
        throw new Error(`ONNX reranker model not found at: ${modelFile}`);
      }

      if (!fs.existsSync(tokenizerFile)) {
        throw new Error(`Tokenizer not found at: ${tokenizerFile}`);
      }

      // 动态加载 @xenova/transformers
      let transformers;
      try {
        transformers = require('@xenova/transformers');
      } catch (error) {
        logger.error('@xenova/transformers not found. Please install it: npm install @xenova/transformers');
        throw new Error('@xenova/transformers is required for ONNX reranking. Install it with: npm install @xenova/transformers');
      }

      // 配置 @xenova/transformers 环境
      // 如果遇到 SSL 证书问题，允许使用不安全的连接（仅用于开发环境）
      if (process.env.NODE_ENV === 'development' || process.env.ALLOW_INSECURE_SSL === 'true') {
        // 注意：这会跳过 SSL 验证，仅用于开发环境
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        logger.warn('[ONNXRerankingService] SSL verification disabled (development mode or ALLOW_INSECURE_SSL=true)');
      }
      
      // 使用模型名称加载，@xenova/transformers 会自动处理缓存
      const { pipeline } = transformers;
      const modelName = 'Xenova/ms-marco-MiniLM-L-6-v2';
      
      logger.info(`[ONNXRerankingService] Loading model: ${modelName}`);
      logger.info(`[ONNXRerankingService] Note: First run will download config/tokenizer files, subsequent runs will use cache`);

      // 创建文本分类 pipeline（用于重排序）
      // 重排序模型通常使用 cross-encoder 架构
      this.pipeline = await pipeline(
        'text-classification',
        modelName,
        {
          quantized: true,
          device: 'cpu', // 使用 CPU，也可以使用 'gpu' 如果有 GPU
        }
      );
      
      // 恢复 SSL 验证（如果之前禁用了）
      if (process.env.NODE_ENV === 'development' || process.env.ALLOW_INSECURE_SSL === 'true') {
        delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      }

      this.initialized = true;
      logger.info('[ONNXRerankingService] ONNX reranker model initialized successfully');
    } catch (error) {
      logger.error('[ONNXRerankingService] Failed to initialize ONNX model:', error);
      throw error;
    }
  }

  /**
   * 对文档进行重排序
   * @param {string} query - 查询文本
   * @param {string[]} documents - 文档数组
   * @param {number} topK - 返回前K个结果
   * @returns {Promise<Array>} 重排后的结果数组，格式: [{ text: string, score: number }]
   */
  async rerank(query, documents, topK = 5) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!documents || documents.length === 0) {
      return [];
    }

    try {
      const results = [];

      // 对每个文档计算相关性分数
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        
        // 构建查询-文档对
        // Cross-encoder 模型需要将查询和文档组合在一起
        const inputText = `${query} [SEP] ${doc}`;

        // 使用 pipeline 进行分类/评分
        const output = await this.pipeline(inputText);

        // 提取分数
        let score = 0;
        if (Array.isArray(output)) {
          // 如果有多个标签，取最高分的标签
          const maxScoreLabel = output.reduce((max, item) => 
            (item.score > max.score ? item : max)
          );
          score = maxScoreLabel.score;
        } else if (typeof output === 'object' && 'score' in output) {
          score = output.score;
        } else if (typeof output === 'number') {
          score = output;
        } else if (output && output.data) {
          // 如果是 Tensor，取第一个值
          score = Array.from(output.data)[0] || 0;
        }

        results.push({
          text: doc,
          score: score,
          index: i,
        });
      }

      // 按分数降序排序
      results.sort((a, b) => b.score - a.score);

      // 返回前K个结果
      const topResults = results.slice(0, topK).map(item => ({
        text: item.text,
        score: item.score,
      }));

      logger.debug(`[ONNXRerankingService] Reranked ${documents.length} documents, returning top ${topResults.length}`);
      return topResults;
    } catch (error) {
      logger.error('[ONNXRerankingService] Error reranking documents:', error);
      // 失败时返回原始顺序
      return documents.slice(0, topK).map((doc, index) => ({
        text: doc,
        score: 1.0 - (index / documents.length), // 简单的降序分数
      }));
    }
  }
}

module.exports = ONNXRerankingService;

