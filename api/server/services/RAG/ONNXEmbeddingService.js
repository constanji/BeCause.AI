const path = require('path');
const fs = require('fs');
const { logger } = require('@because/data-schemas');

/**
 * ONNX 嵌入服务
 * 使用本地 ONNX 模型进行文本向量化
 * 使用 @xenova/transformers 库来处理 ONNX 模型
 */
class ONNXEmbeddingService {
  constructor() {
    this.modelPath = path.join(__dirname, 'onnx', 'embedding', 'resources');
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
      const modelFile = path.join(this.modelPath, 'bge-small-zh-v1.5-q.onnx');
      const tokenizerFile = path.join(this.modelPath, 'bge-small-zh-v1.5-q-tokenizer.json');

      if (!fs.existsSync(modelFile)) {
        throw new Error(`ONNX embedding model not found at: ${modelFile}`);
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
        throw new Error('@xenova/transformers is required for ONNX embedding. Install it with: npm install @xenova/transformers');
      }

      // 配置 @xenova/transformers 环境
      // 如果遇到 SSL 证书问题，允许使用不安全的连接（仅用于开发环境）
      if (process.env.NODE_ENV === 'development' || process.env.ALLOW_INSECURE_SSL === 'true') {
        // 注意：这会跳过 SSL 验证，仅用于开发环境
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        logger.warn('[ONNXEmbeddingService] SSL verification disabled (development mode or ALLOW_INSECURE_SSL=true)');
      }
      
      // 使用模型名称加载，@xenova/transformers 会自动处理缓存
      // 第一次运行时会下载必要的文件到缓存目录，后续会使用缓存
      const { pipeline } = transformers;
      const modelName = 'Xenova/bge-small-zh-v1.5';
      
      logger.info(`[ONNXEmbeddingService] Loading model: ${modelName}`);
      logger.info(`[ONNXEmbeddingService] Note: First run will download config/tokenizer files, subsequent runs will use cache`);

      // 创建特征提取 pipeline（用于嵌入）
      this.pipeline = await pipeline(
        'feature-extraction',
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
      logger.info('[ONNXEmbeddingService] ONNX embedding model initialized successfully');
    } catch (error) {
      logger.error('[ONNXEmbeddingService] Failed to initialize ONNX model:', error);
      throw error;
    }
  }

  /**
   * 对文本进行向量嵌入
   * @param {string} text - 要向量化的文本
   * @returns {Promise<number[]>} 向量嵌入数组
   */
  async embedText(text) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 使用 pipeline 进行特征提取
      const output = await this.pipeline(text, {
        pooling: 'mean', // 使用 mean pooling
        normalize: true, // 归一化向量
      });

      // 提取嵌入向量
      let embedding;
      if (output && output.data) {
        // 如果是 Tensor 对象
        embedding = Array.from(output.data);
      } else if (Array.isArray(output)) {
        // 如果是数组
        embedding = output;
      } else if (typeof output === 'object' && 'data' in output) {
        // 尝试获取 data 属性
        embedding = Array.from(output.data);
      } else {
        throw new Error('Unexpected output format from embedding model');
      }

      logger.debug(`[ONNXEmbeddingService] Generated embedding with dimension: ${embedding.length}`);
      return embedding;
    } catch (error) {
      logger.error('[ONNXEmbeddingService] Error embedding text:', error);
      throw new Error(`ONNX embedding failed: ${error.message}`);
    }
  }

  /**
   * 批量向量化文本
   * @param {string[]} texts - 要向量化的文本数组
   * @returns {Promise<number[][]>} 向量嵌入数组的数组
   */
  async embedTexts(texts) {
    const results = [];
    for (const text of texts) {
      const embedding = await this.embedText(text);
      results.push(embedding);
    }
    return results;
  }
}

module.exports = ONNXEmbeddingService;

