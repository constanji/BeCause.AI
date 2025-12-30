const { logger } = require('@because/data-schemas');

/**
 * 向量数据库服务
 * 按照 DAT 系统架构，为每种知识类型创建独立的存储表
 * 直接连接 PostgreSQL + pgvector 数据库存储和检索向量
 */

// Embedding 模型维度配置
// bge-small-zh-v1.5 模型输出 512 维向量
const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '512', 10);
/**
 * 检测是否在 Docker 容器内运行
 */
function isRunningInDocker() {
  try {
    const fs = require('fs');
    return fs.existsSync('/.dockerenv') || 
           (fs.existsSync('/proc/self/cgroup') && fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker'));
  } catch (error) {
    return false;
  }
}

class VectorDBService {
  constructor() {
    this.pool = null;
    this.initialized = false;
    
    // 自动检测运行环境并设置默认连接信息
    let defaultHost = 'vectordb';
    let defaultPort = 5432;
    
    // 如果未显式设置环境变量，根据运行环境自动选择
    if (!process.env.VECTOR_DB_HOST && !process.env.DB_HOST) {
      if (!isRunningInDocker()) {
        // 在本地开发环境：使用 localhost 和映射的端口
        defaultHost = 'localhost';
        defaultPort = parseInt(process.env.VECTOR_DB_PORT || process.env.DB_PORT || '5434', 10);
        logger.debug('[VectorDBService] 检测到本地开发环境，使用 localhost:5434 连接向量数据库');
      } else {
        // 在 Docker 容器内：使用容器网络内的主机名
        defaultHost = 'vectordb';
        defaultPort = 5432;
        logger.debug('[VectorDBService] 检测到 Docker 容器环境，使用 vectordb:5432 连接向量数据库');
      }
    }
    
    // 从环境变量或配置获取连接信息
    this.config = {
      host: process.env.VECTOR_DB_HOST || process.env.DB_HOST || defaultHost,
      port: parseInt(process.env.VECTOR_DB_PORT || process.env.DB_PORT || defaultPort.toString(), 10),
      database: process.env.VECTOR_DB_NAME || process.env.POSTGRES_DB || 'mydatabase',
      user: process.env.VECTOR_DB_USER || process.env.POSTGRES_USER || 'myuser',
      password: process.env.VECTOR_DB_PASSWORD || process.env.POSTGRES_PASSWORD || 'mypassword',
      embeddingDimension: EMBEDDING_DIMENSION, // 向量维度
    };
    
    logger.info(`[VectorDBService] 向量数据库连接配置: ${this.config.host}:${this.config.port}/${this.config.database}`);
    logger.info(`[VectorDBService] Embedding 维度: ${this.config.embeddingDimension} (可通过 EMBEDDING_DIMENSION 环境变量配置)`);
  }

  /**
   * 初始化数据库连接
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      // 动态加载 pg 库
      let pg;
      try {
        pg = require('pg');
      } catch (error) {
        logger.error('pg (node-postgres) not found. Please install it: npm install pg');
        throw new Error('pg package is required for vector database connection. Install it with: npm install pg');
      }

      // 创建连接池
      const { Pool } = pg;
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: 20, // 最大连接数
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // 测试连接
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();

      // 确保 pgvector 扩展已启用
      await this.ensureExtension();

      // 确保表结构存在
      await this.ensureTables();

      this.initialized = true;
      logger.info('[VectorDBService] Vector database connection initialized successfully');
    } catch (error) {
      logger.error('[VectorDBService] Failed to initialize vector database:', error);
      throw error;
    }
  }

  /**
   * 确保 pgvector 扩展已启用
   */
  async ensureExtension() {
    try {
      await this.pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      logger.debug('[VectorDBService] pgvector extension enabled');
    } catch (error) {
      logger.warn('[VectorDBService] Failed to enable pgvector extension (may already be enabled):', error.message);
    }
  }

  /**
   * 确保表结构存在
   * 按照 DAT 系统架构，为每种知识类型创建独立的表（独立存储空间）
   */
  async ensureTables() {
    try {
      const embeddingDim = this.config.embeddingDimension;
      
      // 按照 DAT 系统架构，创建四种独立的向量存储表
      // 1. 语义模型向量表 (MDL - Model Definition Language)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS semantic_model_vectors (
          id SERIAL PRIMARY KEY,
          knowledge_entry_id VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(${embeddingDim}),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. QA对向量表 (SQL - Question-SQL Pair)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS qa_pair_vectors (
          id SERIAL PRIMARY KEY,
          knowledge_entry_id VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(${embeddingDim}),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. 同义词向量表 (SYN - Synonym Pair)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS synonym_vectors (
          id SERIAL PRIMARY KEY,
          knowledge_entry_id VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(${embeddingDim}),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 4. 业务知识向量表 (DOC - Document)
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS business_knowledge_vectors (
          id SERIAL PRIMARY KEY,
          knowledge_entry_id VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          content TEXT NOT NULL,
          embedding vector(${embeddingDim}),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 为每个表创建用户索引
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_semantic_model_vectors_user_id 
        ON semantic_model_vectors(user_id)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_qa_pair_vectors_user_id 
        ON qa_pair_vectors(user_id)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_synonym_vectors_user_id 
        ON synonym_vectors(user_id)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_business_knowledge_vectors_user_id 
        ON business_knowledge_vectors(user_id)
      `);

      // 为每个表创建向量相似度搜索索引（使用 HNSW）
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_semantic_model_vectors_embedding_hnsw 
        ON semantic_model_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_qa_pair_vectors_embedding_hnsw 
        ON qa_pair_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_synonym_vectors_embedding_hnsw 
        ON synonym_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_business_knowledge_vectors_embedding_hnsw 
        ON business_knowledge_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);

      // 创建文件向量表（兼容现有文件向量化）
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS file_vectors (
          id SERIAL PRIMARY KEY,
          file_id VARCHAR(255) NOT NULL,
          user_id VARCHAR(255),
          entity_id VARCHAR(255),
          chunk_index INTEGER DEFAULT 0,
          content TEXT NOT NULL,
          embedding vector(${embeddingDim}),
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 创建文件向量索引
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_file_vectors_file_id 
        ON file_vectors(file_id)
      `);

      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_file_vectors_embedding_hnsw 
        ON file_vectors 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
      `);

      logger.debug('[VectorDBService] Database tables and indexes created (DAT architecture: independent tables per type)');
    } catch (error) {
      logger.error('[VectorDBService] Failed to create tables:', error);
      throw error;
    }
  }

  /**
   * 获取表名（根据知识类型）
   * 按照 DAT 系统架构，每种类型对应独立的表
   * @param {string} type - 知识类型
   * @returns {string} 表名
   */
  getTableName(type) {
    const tableMap = {
      semantic_model: 'semantic_model_vectors',
      qa_pair: 'qa_pair_vectors',
      synonym: 'synonym_vectors',
      business_knowledge: 'business_knowledge_vectors',
    };
    return tableMap[type] || null;
  }

  /**
   * 存储知识条目向量
   * 按照 DAT 系统架构，每种类型存储到对应的独立表
   * 存储流程：JSON序列化 → 向量化 → 存储到对应的独立表
   * @param {Object} params
   * @param {string} params.knowledgeEntryId - 知识条目ID
   * @param {string} params.userId - 用户ID
   * @param {string} params.type - 知识类型
   * @param {string} params.content - 内容（JSON序列化）
   * @param {number[]} params.embedding - 向量嵌入
   * @param {Object} params.metadata - 元数据
   * @returns {Promise<boolean>} 是否成功
   */
  async storeKnowledgeVector({ knowledgeEntryId, userId, type, content, embedding, metadata = {} }) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // 验证 embedding 维度
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Embedding must be a non-empty array');
      }

      const actualDimension = embedding.length;
      const expectedDimension = this.config.embeddingDimension;
      
      if (actualDimension !== expectedDimension) {
        const errorMsg = `Embedding dimension mismatch: got ${actualDimension}, expected ${expectedDimension}. ` +
          `Please check your embedding model output dimension and VectorDB table schema. ` +
          `You can configure EMBEDDING_DIMENSION environment variable to match your model.`;
        logger.error(`[VectorDBService] ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // 根据类型获取对应的表名
      const tableName = this.getTableName(type);
      if (!tableName) {
        throw new Error(`不支持的知识类型: ${type}`);
      }

      // 将数组转换为 pgvector 格式
      const embeddingStr = `[${embedding.join(',')}]`;

      // 存储到对应的独立表（按照 DAT 架构）
      await this.pool.query(
        `INSERT INTO ${tableName} 
         (knowledge_entry_id, user_id, content, embedding, metadata, updated_at)
         VALUES ($1, $2, $3, $4::vector, $5::jsonb, CURRENT_TIMESTAMP)
         ON CONFLICT (knowledge_entry_id) 
         DO UPDATE SET 
           content = EXCLUDED.content,
           embedding = EXCLUDED.embedding::vector,
           metadata = EXCLUDED.metadata::jsonb,
           updated_at = CURRENT_TIMESTAMP`,
        [knowledgeEntryId, userId, content, embeddingStr, JSON.stringify(metadata)]
      );

      logger.debug(`[VectorDBService] Stored vector for ${type} in table ${tableName}: ${knowledgeEntryId}`);
      return true;
    } catch (error) {
      logger.error('[VectorDBService] Failed to store knowledge vector:', error);
      throw error;
    }
  }

  /**
   * 从单个表中搜索相似向量
   * 按照 DAT 系统架构，每个类型在独立的表中搜索
   * @param {Object} params
   * @param {string} params.tableName - 表名
   * @param {string} params.queryEmbedding - 查询向量
   * @param {string} params.userId - 用户ID
   * @param {string} params.type - 知识类型
   * @param {number} params.topK - 返回前K个结果
   * @param {number} params.minScore - 最小相似度分数
   * @returns {Promise<Array>} 搜索结果数组
   */
  async searchInTable({ tableName, queryEmbedding, userId, type, topK, minScore }) {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    const query = `
      SELECT 
        knowledge_entry_id,
        user_id,
        content,
        metadata,
        1 - (embedding <=> $1::vector) as similarity
      FROM ${tableName}
      WHERE user_id = $2
        AND embedding IS NOT NULL
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    `;

    const result = await this.pool.query(query, [
      embeddingStr,
      userId,
      minScore,
      topK,
    ]);

    return result.rows.map(row => ({
      knowledgeEntryId: row.knowledge_entry_id,
      userId: row.user_id,
      type: type, // 添加类型信息
      content: row.content,
      metadata: row.metadata,
      score: parseFloat(row.similarity),
      similarity: parseFloat(row.similarity),
    }));
  }

  /**
   * 相似度搜索
   * 按照 DAT 系统架构，从对应的独立表中搜索
   * 查找流程：问题向量化 → 在对应的独立表中搜索 → 返回结果
   * @param {Object} params
   * @param {number[]} params.queryEmbedding - 查询向量
   * @param {string} params.userId - 用户ID
   * @param {string[]} params.types - 知识类型过滤（如果为空，搜索所有类型）
   * @param {number} params.topK - 返回前K个结果（每个类型）
   * @param {number} params.minScore - 最小相似度分数
   * @returns {Promise<Array>} 搜索结果数组
   */
  async searchSimilar({ queryEmbedding, userId, types, topK = 10, minScore = 0.5 }) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const allTypes = ['semantic_model', 'qa_pair', 'synonym', 'business_knowledge'];
      const searchTypes = types && types.length > 0 ? types : allTypes;
      logger.info(`[VectorDBService] 开始向量相似度搜索 (用户: ${userId}, 类型数: ${searchTypes.length}, topK: ${topK}, minScore: ${minScore})`);

      // 按照 DAT 架构，从每个类型的独立表中搜索
      const searchPromises = searchTypes.map(async (type) => {
        const tableName = this.getTableName(type);
        if (!tableName) {
          logger.warn(`[VectorDBService] 未知的知识类型: ${type}`);
          return [];
        }

        try {
          return await this.searchInTable({
            tableName,
            queryEmbedding,
            userId,
            type,
            topK, // 每个类型返回 topK 个结果
            minScore,
          });
        } catch (error) {
          logger.warn(`[VectorDBService] 从表 ${tableName} 搜索失败:`, error.message);
          return [];
        }
      });

      // 等待所有搜索完成
      const resultsArrays = await Promise.all(searchPromises);
      const allResults = resultsArrays.flat();

      // 按相似度分数排序，返回前 topK 个结果
      const sortedResults = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      logger.info(`[VectorDBService] 从 ${searchTypes.length} 个独立表中完成向量相似度搜索，返回 ${sortedResults.length} 个结果 (搜索类型: ${searchTypes.join(', ')})`);
      logger.debug(`[VectorDBService] Found ${sortedResults.length} similar vectors from ${searchTypes.length} independent tables (DAT architecture)`);
      return sortedResults;
    } catch (error) {
      logger.error('[VectorDBService] Failed to search similar vectors:', error);
      throw error;
    }
  }

  /**
   * 删除知识条目向量
   * 按照 DAT 系统架构，从对应的独立表中删除
   * @param {string} knowledgeEntryId - 知识条目ID
   * @param {string} type - 知识类型（可选，如果不提供则从所有表中删除）
   * @returns {Promise<boolean>} 是否成功
   */
  async deleteKnowledgeVector(knowledgeEntryId, type = null) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      if (type) {
        // 从指定类型的表中删除
        const tableName = this.getTableName(type);
        if (!tableName) {
          throw new Error(`不支持的知识类型: ${type}`);
        }

        const result = await this.pool.query(
          `DELETE FROM ${tableName} WHERE knowledge_entry_id = $1`,
          [knowledgeEntryId]
        );

        logger.debug(`[VectorDBService] Deleted vector for ${type} from ${tableName}: ${knowledgeEntryId}`);
        return result.rowCount > 0;
      } else {
        // 从所有表中删除（用于兼容性）
        const allTypes = ['semantic_model', 'qa_pair', 'synonym', 'business_knowledge'];
        let deleted = false;

        for (const t of allTypes) {
          const tableName = this.getTableName(t);
          if (tableName) {
            const result = await this.pool.query(
              `DELETE FROM ${tableName} WHERE knowledge_entry_id = $1`,
              [knowledgeEntryId]
            );
            if (result.rowCount > 0) {
              deleted = true;
              logger.debug(`[VectorDBService] Deleted vector from ${tableName}: ${knowledgeEntryId}`);
            }
          }
        }

        return deleted;
      }
    } catch (error) {
      logger.error('[VectorDBService] Failed to delete knowledge vector:', error);
      throw error;
    }
  }

  /**
   * 获取连接池（用于高级操作）
   * @returns {Object} pg Pool 实例
   */
  getPool() {
    if (!this.initialized) {
      throw new Error('VectorDBService not initialized');
    }
    return this.pool;
  }
}

module.exports = VectorDBService;
