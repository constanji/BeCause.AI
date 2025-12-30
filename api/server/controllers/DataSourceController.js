const crypto = require('crypto');
const mongoose = require('mongoose');
const { logger } = require('@because/data-schemas');
const { SystemRoles } = require('@because/data-provider');
const {
  createDataSource,
  getDataSources,
  getDataSourceById,
  updateDataSource,
  deleteDataSource,
} = require('~/models/DataSource');

// 加密密钥，应该从环境变量读取
// AES-256-GCM 需要32字节（256位）的密钥
// 如果从环境变量读取，应该是64个十六进制字符（32字节）
// 如果没有设置，生成一个随机密钥（仅用于开发，生产环境必须设置）
let ENCRYPTION_KEY = process.env.DATASOURCE_ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  // 生成一个随机密钥（仅用于开发）
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  logger.warn('[DataSourceController] DATASOURCE_ENCRYPTION_KEY not set, using random key. This is not secure for production!');
} else {
  // 验证密钥长度
  // 如果是hex字符串，应该是64个字符（32字节）
  // 如果是普通字符串，需要转换为32字节的buffer
  if (ENCRYPTION_KEY.length === 64) {
    // 已经是hex格式，直接使用
    ENCRYPTION_KEY = ENCRYPTION_KEY;
  } else if (ENCRYPTION_KEY.length >= 32) {
    // 如果长度>=32，使用前32个字符的hash
    ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex');
  } else {
    // 如果长度<32，使用hash扩展到32字节
    ENCRYPTION_KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest('hex');
  }
}

const ALGORITHM = 'aes-256-gcm';

/**
 * 加密密码
 * @param {string} text - 要加密的文本
 * @returns {string} 加密后的文本（格式：iv:authTag:encrypted）
 */
function encryptPassword(text) {
  try {
    const iv = crypto.randomBytes(16);
    // 确保密钥是32字节的Buffer
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${keyBuffer.length}`);
    }
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    logger.error('[encryptPassword] Error:', error);
    logger.error('[encryptPassword] Key length:', ENCRYPTION_KEY.length);
    throw new Error('密码加密失败');
  }
}

/**
 * 解密密码
 * @param {string} encryptedText - 加密的文本（格式：iv:authTag:encrypted）
 * @returns {string} 解密后的文本
 */
function decryptPassword(encryptedText) {
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('无效的加密格式');
    }
    const [ivHex, authTagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    // 确保密钥是32字节的Buffer
    const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (keyBuffer.length !== 32) {
      throw new Error(`Invalid key length: expected 32 bytes, got ${keyBuffer.length}`);
    }
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    logger.error('[decryptPassword] Error:', error);
    throw new Error('密码解密失败');
  }
}

/**
 * 测试数据库连接
 * @param {Object} config - 数据库配置
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function testDatabaseConnection(config) {
  const { type, host, port, database, username, password } = config;

  try {
    if (type === 'mysql') {
      // 动态加载 mysql2
      let mysql;
      try {
        mysql = require('mysql2/promise');
      } catch (error) {
        logger.error('[testDatabaseConnection] mysql2 not found:', error);
        return {
          success: false,
          error: 'mysql2 包未安装，请运行: npm install mysql2',
        };
      }

      const connection = await mysql.createConnection({
        host,
        port,
        user: username,
        password,
        database,
        connectTimeout: 10000,
      });

      await connection.ping();
      await connection.end();

      return { success: true };
    } else if (type === 'postgresql') {
      // 动态加载 pg
      let pg;
      try {
        pg = require('pg');
      } catch (error) {
        logger.error('[testDatabaseConnection] pg not found:', error);
        return {
          success: false,
          error: 'pg 包未安装，请运行: npm install pg',
        };
      }

      const { Client } = pg;
      const client = new Client({
        host,
        port,
        database,
        user: username,
        password,
        connectionTimeoutMillis: 10000,
      });

      await client.connect();
      await client.query('SELECT NOW()');
      await client.end();

      return { success: true };
    } else {
      return {
        success: false,
        error: `不支持的数据库类型: ${type}`,
      };
    }
  } catch (error) {
    logger.error('[testDatabaseConnection] Connection test failed:', error);
    return {
      success: false,
      error: error.message || '连接测试失败',
    };
  }
}

/**
 * 获取所有数据源
 * @route GET /api/config/data-sources
 */
async function getDataSourcesHandler(req, res) {
  try {
    const { id: userId } = req.user;
    const dataSources = await getDataSources({ createdBy: userId });

    // 移除密码字段
    const sanitizedDataSources = dataSources.map(({ password, ...rest }) => rest);

    return res.status(200).json({
      success: true,
      data: sanitizedDataSources,
    });
  } catch (error) {
    logger.error('[getDataSourcesHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '获取数据源列表失败',
    });
  }
}

/**
 * 获取单个数据源
 * @route GET /api/config/data-sources/:id
 */
async function getDataSourceHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const dataSource = await getDataSourceById(id);
    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    // 检查权限（只有创建者或管理员可以查看）
    if (dataSource.createdBy.toString() !== userId && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: '无权访问此数据源',
      });
    }

    // 移除密码字段
    const { password, ...sanitizedDataSource } = dataSource;

    return res.status(200).json({
      success: true,
      data: sanitizedDataSource,
    });
  } catch (error) {
    logger.error('[getDataSourceHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '获取数据源失败',
    });
  }
}

/**
 * 创建数据源
 * @route POST /api/config/data-sources
 */
async function createDataSourceHandler(req, res) {
  try {
    const { id: userId } = req.user;
    const {
      name,
      type,
      host,
      port,
      database,
      username,
      password,
      connectionPool,
      status = 'active',
    } = req.body;

    // 验证必填字段
    if (!name || !type || !host || !port || !database || !username || !password) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
      });
    }

    // 验证类型
    if (!['mysql', 'postgresql'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: '不支持的数据库类型，仅支持 mysql 和 postgresql',
      });
    }

    // 加密密码
    const encryptedPassword = encryptPassword(password);

    // 创建数据源 - 确保userId是ObjectId类型
    // 如果connectionPool存在，确保所有字段都有值
    const poolConfig = connectionPool
      ? {
          min: connectionPool.min ?? 0,
          max: connectionPool.max ?? 10,
          idleTimeoutMillis: connectionPool.idleTimeoutMillis ?? 30000,
          connectionTimeoutMillis: connectionPool.connectionTimeoutMillis ?? 10000,
        }
      : {
          min: 0,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        };

    const dataSource = await createDataSource({
      name,
      type,
      host,
      port: parseInt(port),
      database,
      username,
      password: encryptedPassword,
      connectionPool: poolConfig,
      status,
      createdBy: mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId,
    });

    // 移除密码字段 - dataSource已经是普通对象
    const { password: _, ...sanitizedDataSource } = dataSource;

    return res.status(201).json({
      success: true,
      data: sanitizedDataSource,
      message: '数据源创建成功',
    });
  } catch (error) {
    logger.error('[createDataSourceHandler] Error:', error);
    logger.error('[createDataSourceHandler] Error stack:', error.stack);
    logger.error('[createDataSourceHandler] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
      errors: error.errors,
    });

    // 处理唯一索引冲突错误 (E11000)
    if (error.code === 11000 || error.name === 'MongoServerError') {
      const duplicateKey = error.keyPattern ? Object.keys(error.keyPattern)[0] : 'name';
      const duplicateValue = error.keyValue ? Object.values(error.keyValue)[0] : 'unknown';
      return res.status(409).json({
        success: false,
        error: `数据源名称 "${duplicateValue}" 已存在，请使用不同的名称`,
      });
    }

    // 处理验证错误
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors || {}).map((err) => err.message).join(', ');
      return res.status(400).json({
        success: false,
        error: `数据验证失败: ${validationErrors}`,
      });
    }

    // 处理类型转换错误
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: `数据类型错误: ${error.message}`,
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || '创建数据源失败',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

/**
 * 更新数据源
 * @route PUT /api/config/data-sources/:id
 */
async function updateDataSourceHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    const updateData = req.body;

    const existingDataSource = await getDataSourceById(id);
    if (!existingDataSource) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    // 检查权限
    if (existingDataSource.createdBy.toString() !== userId && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: '无权修改此数据源',
      });
    }

    // 如果更新密码，需要加密
    if (updateData.password && updateData.password.trim() !== '') {
      updateData.password = encryptPassword(updateData.password);
    } else {
      // 如果密码为空，删除该字段，不更新密码
      delete updateData.password;
    }

    // 如果更新端口，转换为数字
    if (updateData.port !== undefined) {
      updateData.port = parseInt(updateData.port);
    }

    const updatedDataSource = await updateDataSource(id, updateData);
    if (!updatedDataSource) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    // 移除密码字段
    const { password: _, ...sanitizedDataSource } = updatedDataSource;

    return res.status(200).json({
      success: true,
      data: sanitizedDataSource,
      message: '数据源更新成功',
    });
  } catch (error) {
    logger.error('[updateDataSourceHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '更新数据源失败',
    });
  }
}

/**
 * 删除数据源
 * @route DELETE /api/config/data-sources/:id
 */
async function deleteDataSourceHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const existingDataSource = await getDataSourceById(id);
    if (!existingDataSource) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    // 检查权限
    if (existingDataSource.createdBy.toString() !== userId && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: '无权删除此数据源',
      });
    }

    const deleted = await deleteDataSource(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    return res.status(200).json({
      success: true,
      message: '数据源删除成功',
    });
  } catch (error) {
    logger.error('[deleteDataSourceHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '删除数据源失败',
    });
  }
}

/**
 * 测试数据源连接
 * @route POST /api/config/data-sources/:id/test
 */
async function testDataSourceConnectionHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;

    const dataSource = await getDataSourceById(id);
    if (!dataSource) {
      return res.status(404).json({
        success: false,
        error: '数据源不存在',
      });
    }

    // 检查权限
    if (dataSource.createdBy.toString() !== userId && req.user.role !== SystemRoles.ADMIN) {
      return res.status(403).json({
        success: false,
        error: '无权测试此数据源',
      });
    }

    // 解密密码
    let password;
    try {
      password = decryptPassword(dataSource.password);
    } catch (error) {
      logger.error('[testDataSourceConnectionHandler] Decrypt password error:', error);
      return res.status(500).json({
        success: false,
        error: '密码解密失败',
      });
    }

    // 测试连接
    const testResult = await testDatabaseConnection({
      type: dataSource.type,
      host: dataSource.host,
      port: dataSource.port,
      database: dataSource.database,
      username: dataSource.username,
      password,
    });

    // 更新测试结果
    await updateDataSource(id, {
      lastTestedAt: new Date(),
      lastTestResult: testResult.success ? 'success' : 'failed',
      lastTestError: testResult.error || undefined,
    });

    return res.status(200).json({
      success: testResult.success,
      message: testResult.success ? '连接测试成功' : '连接测试失败',
      error: testResult.error,
    });
  } catch (error) {
    logger.error('[testDataSourceConnectionHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '连接测试失败',
    });
  }
}

/**
 * 使用提供的配置测试数据库连接（不保存到数据库）
 * @route POST /api/config/data-sources/test
 */
async function testConnectionHandler(req, res) {
  try {
    const { type, host, port, database, username, password } = req.body;

    // 验证必填字段
    if (!type || !host || !port || !database || !username || !password) {
      return res.status(400).json({
        success: false,
        error: '缺少必填字段',
      });
    }

    // 测试连接
    const testResult = await testDatabaseConnection({
      type,
      host,
      port: parseInt(port),
      database,
      username,
      password,
    });

    return res.status(200).json({
      success: testResult.success,
      message: testResult.success ? '连接测试成功' : '连接测试失败',
      error: testResult.error,
    });
  } catch (error) {
    logger.error('[testConnectionHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '连接测试失败',
    });
  }
}

module.exports = {
  getDataSourcesHandler,
  getDataSourceHandler,
  createDataSourceHandler,
  updateDataSourceHandler,
  deleteDataSourceHandler,
  testDataSourceConnectionHandler,
  testConnectionHandler,
  // 导出加密/解密函数供其他地方使用
  encryptPassword,
  decryptPassword,
};

