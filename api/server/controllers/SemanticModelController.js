const { logger } = require('@because/data-schemas');
const { SystemRoles } = require('@because/data-provider');
const { getDataSourceById } = require('~/models/DataSource');
const { decryptPassword } = require('~/server/controllers/DataSourceController');
const yaml = require('js-yaml');

// 导入 getDatabaseSchema 函数
const { getDatabaseSchema } = require('~/server/controllers/DataSourceController');

/**
 * 生成Light Schema（给LLM/Agent用的轻量、稳定、抗幻觉的Schema）
 * @param {Object} schemaData - 数据库结构数据
 * @param {Object} options - 选项
 * @returns {Array} Light Schema数组
 */
function generateLightSchema(schemaData, options = {}) {
  const { database } = options;
  const semanticModels = [];

  if (!schemaData.schema) {
    return [];
  }

  for (const [tableName, tableInfo] of Object.entries(schemaData.schema)) {
    const semanticModel = {
      model: tableName,
      description: tableInfo.columns.some(col => col.column_comment) 
        ? tableInfo.columns.find(col => col.column_comment)?.column_comment || `数据库表: ${tableName}`
        : `数据库表: ${tableName}`,
    };

    // 实体（只保留name、role、description，不包含expr、data_type）
    const entities = [];
    const primaryKeys = tableInfo.columns.filter(col => col.column_key === 'PRI');
    const foreignKeys = tableInfo.columns.filter(col => col.column_key === 'MUL');
    const uniqueKeys = tableInfo.columns.filter(col => col.column_key === 'UNI');

    primaryKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        role: 'primary',
        description: col.column_comment || `${col.column_name} 主键`,
      });
    });

    foreignKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        role: 'dimension',
        description: col.column_comment || `${col.column_name} 外键`,
      });
    });

    uniqueKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        role: 'unique',
        description: col.column_comment || `${col.column_name} 唯一键`,
      });
    });

    if (entities.length > 0) {
      semanticModel.entities = entities;
    }

    // 维度（只保留name、role、description，不包含type、expr、data_type、type_params）
    const dimensions = [];
    const timePattern = /(date|time|timestamp|created|updated|modified)/i;
    
    tableInfo.columns.forEach(col => {
      if (col.column_key && col.column_key !== '') {
        return; // 跳过已在实体中的列
      }

      if (timePattern.test(col.column_name) || timePattern.test(col.data_type)) {
        dimensions.push({
          name: col.column_name,
          role: 'time_dimension',
          description: col.column_comment || `${col.column_name} 时间维度`,
        });
      } else {
        dimensions.push({
          name: col.column_name,
          role: 'dimension',
          description: col.column_comment || `${col.column_name} 分类维度`,
        });
      }
    });

    if (dimensions.length > 0) {
      semanticModel.dimensions = dimensions;
    }

    // 度量（只保留name、role、description、aggregation枚举，不包含expr、data_type、agg）
    const numericPattern = /(int|decimal|numeric|float|double|money|amount|price|quantity|count|total|sum)/i;
    const metrics = [];
    
    tableInfo.columns.forEach(col => {
      if (numericPattern.test(col.data_type) && !col.column_key) {
        // 根据字段名推断聚合方式
        let aggregation = 'sum';
        const colName = col.column_name.toLowerCase();
        if (colName.includes('count') || colName.includes('num')) {
          aggregation = 'count';
        } else if (colName.includes('avg') || colName.includes('average')) {
          aggregation = 'avg';
        } else if (colName.includes('max')) {
          aggregation = 'max';
        } else if (colName.includes('min')) {
          aggregation = 'min';
        }

        metrics.push({
          name: col.column_name,
          role: 'metric',
          description: col.column_comment || `${col.column_name} 度量`,
          aggregation, // 使用aggregation而不是agg
        });
      }
    });

    if (metrics.length > 0) {
      semanticModel.metrics = metrics;
    }

    semanticModels.push(semanticModel);
  }

  return semanticModels;
}

/**
 * 生成MSchema（完整可执行的语义模型定义）
 * @param {Object} schemaData - 数据库结构数据
 * @param {Object} options - 选项
 * @returns {Array} MSchema数组
 */
function generateMSchema(schemaData, options = {}) {
  const { database } = options;
  const semanticModels = [];

  if (!schemaData.schema) {
    return [];
  }

  for (const [tableName, tableInfo] of Object.entries(schemaData.schema)) {
    const semanticModel = {
      name: tableName,
      table: tableName, // 物理表名
      description: tableInfo.columns.some(col => col.column_comment) 
        ? `数据库表: ${tableName} - ${tableInfo.columns.find(col => col.column_comment)?.column_comment || ''}`
        : `数据库表: ${tableName}`,
      model: tableName,
    };

    // 实体（包含完整信息：name、type、expr、data_type）
    const entities = [];
    const primaryKeys = tableInfo.columns.filter(col => col.column_key === 'PRI');
    const foreignKeys = tableInfo.columns.filter(col => col.column_key === 'MUL');
    const uniqueKeys = tableInfo.columns.filter(col => col.column_key === 'UNI');

    primaryKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'primary',
        expr: `${tableName}.${col.column_name}`, // 完整表达式
        data_type: col.data_type,
        description: col.column_comment || `${col.column_name} 主键`,
      });
    });

    foreignKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'foreign',
        expr: `${tableName}.${col.column_name}`, // 完整表达式
        data_type: col.data_type,
        description: col.column_comment || `${col.column_name} 外键`,
      });
    });

    uniqueKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'unique',
        expr: `${tableName}.${col.column_name}`, // 完整表达式
        data_type: col.data_type,
        description: col.column_comment || `${col.column_name} 唯一键`,
      });
    });

    if (entities.length > 0) {
      semanticModel.entities = entities;
    }

    // 维度（包含expr和data_type）
    const dimensions = [];
    const timePattern = /(date|time|timestamp|created|updated|modified)/i;
    
    tableInfo.columns.forEach(col => {
      if (col.column_key && col.column_key !== '') {
        return;
      }

      if (timePattern.test(col.column_name) || timePattern.test(col.data_type)) {
        dimensions.push({
          name: col.column_name,
          type: 'time',
          description: col.column_comment || `${col.column_name} 时间维度`,
          expr: `${tableName}.${col.column_name}`, // 完整表达式
          type_params: {
            time_granularity: 'day',
          },
          data_type: col.data_type,
        });
      } else {
        dimensions.push({
          name: col.column_name,
          type: 'categorical',
          description: col.column_comment || `${col.column_name} 分类维度`,
          expr: `${tableName}.${col.column_name}`, // 完整表达式
          data_type: col.data_type,
        });
      }
    });

    if (dimensions.length > 0) {
      semanticModel.dimensions = dimensions;
    }

    // 度量（包含expr、data_type、agg）
    const numericPattern = /(int|decimal|numeric|float|double|money|amount|price|quantity|count|total|sum)/i;
    const measures = [];
    
    tableInfo.columns.forEach(col => {
      if (numericPattern.test(col.data_type) && !col.column_key) {
        // 根据字段名推断聚合方式
        let agg = 'sum';
        const colName = col.column_name.toLowerCase();
        if (colName.includes('count') || colName.includes('num')) {
          agg = 'count';
        } else if (colName.includes('avg') || colName.includes('average')) {
          agg = 'avg';
        } else if (colName.includes('max')) {
          agg = 'max';
        } else if (colName.includes('min')) {
          agg = 'min';
        }

        measures.push({
          name: col.column_name,
          description: col.column_comment || `${col.column_name} 度量`,
          expr: `${tableName}.${col.column_name}`, // 完整表达式
          data_type: col.data_type,
          agg, // 聚合函数
        });
      }
    });

    if (measures.length > 0) {
      semanticModel.measures = measures;
    }

    // MSchema包含joins信息（如果有外键）
    const joins = [];
    foreignKeys.forEach(col => {
      // 尝试推断关联表名（简单规则：去掉_id后缀）
      const relatedTable = col.column_name.replace(/_id$/, '');
      if (relatedTable !== col.column_name && schemaData.schema[relatedTable]) {
        joins.push({
          target: relatedTable,
          type: 'left',
          on: `${tableName}.${col.column_name} = ${relatedTable}.id`, // SQL join条件
        });
      }
    });

    if (joins.length > 0) {
      semanticModel.joins = joins;
    }

    semanticModels.push(semanticModel);
  }

  return semanticModels;
}

/**
 * 将数据库结构转换为语义模型YAML格式
 * @param {Object} schemaData - 数据库结构数据
 * @param {Object} options - 选项
 * @param {string} options.schemaType - Schema类型：'light' | 'meta'，默认为'meta'
 * @returns {Promise<string>} YAML格式的语义模型
 */
async function convertSchemaToSemanticModelYAML(schemaData, options = {}) {
  const { database, userInput = {}, schemaType: rawSchemaType = 'meta' } = options;
  
  // 确保schemaType是字符串类型，处理可能的类型问题
  const schemaType = String(rawSchemaType || 'meta').trim().toLowerCase();

  console.log('[convertSchemaToSemanticModelYAML] 原始schemaType:', rawSchemaType);
  console.log('[convertSchemaToSemanticModelYAML] 处理后的schemaType:', schemaType);
  console.log('[convertSchemaToSemanticModelYAML] schemaType === "light":', schemaType === 'light');
  console.log('[convertSchemaToSemanticModelYAML] schemaType类型:', typeof schemaType);
  console.log('[convertSchemaToSemanticModelYAML] options完整内容:', JSON.stringify(options, null, 2));
  
  logger.info(`[convertSchemaToSemanticModelYAML] 原始schemaType: ${rawSchemaType}`);
  logger.info(`[convertSchemaToSemanticModelYAML] 处理后的schemaType: ${schemaType}`);
  logger.info(`[convertSchemaToSemanticModelYAML] schemaType === "light": ${schemaType === 'light'}`);
  logger.info(`[convertSchemaToSemanticModelYAML] schemaType类型: ${typeof schemaType}`);

  // 根据schemaType选择生成方式（严格比较）
  let semanticModels;
  if (schemaType === 'light' || schemaType === '"light"') {
    logger.info('[convertSchemaToSemanticModelYAML] ✅ 使用 generateLightSchema');
    semanticModels = generateLightSchema(schemaData, { database, userInput });
  } else {
    logger.info('[convertSchemaToSemanticModelYAML] ✅ 使用 generateMSchema (schemaType:', schemaType, ')');
    semanticModels = generateMSchema(schemaData, { database, userInput });
  }

  logger.info('[convertSchemaToSemanticModelYAML] 生成的模型数量:', semanticModels.length);
  if (semanticModels.length > 0) {
    const firstModel = semanticModels[0];
    logger.info('[convertSchemaToSemanticModelYAML] 第一个模型的keys:', Object.keys(firstModel));
    if (firstModel.metrics && firstModel.metrics.length > 0) {
      logger.info('[convertSchemaToSemanticModelYAML] ✅ Light Schema - 第一个metric示例:', JSON.stringify(firstModel.metrics[0], null, 2));
    }
    if (firstModel.measures && firstModel.measures.length > 0) {
      logger.info('[convertSchemaToSemanticModelYAML] ✅ MSchema - 第一个measure示例:', JSON.stringify(firstModel.measures[0], null, 2));
    }
  }

  return yaml.dump({ version: 1, semantic_models: semanticModels }, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
}

/**
 * 生成语义模型YAML配置
 * @route POST /api/config/data-sources/:id/generate-semantic-model
 */
async function generateSemanticModelHandler(req, res) {
  try {
    const { id } = req.params;
    const { id: userId } = req.user;
    
    // 详细日志：检查请求的各个方面
    logger.info('[generateSemanticModelHandler] ========== 请求调试信息 ==========');
    // 使用 console.log 确保输出可见
    console.log('[generateSemanticModelHandler] req.method:', req.method);
    console.log('[generateSemanticModelHandler] req.url:', req.url);
    console.log('[generateSemanticModelHandler] req.path:', req.path);
    console.log('[generateSemanticModelHandler] req.headers:', JSON.stringify(req.headers, null, 2));
    console.log('[generateSemanticModelHandler] req.body 是否存在:', !!req.body);
    console.log('[generateSemanticModelHandler] req.body 类型:', typeof req.body);
    console.log('[generateSemanticModelHandler] req.body 是否为对象:', req.body && typeof req.body === 'object');
    console.log('[generateSemanticModelHandler] req.body 的 keys:', req.body ? Object.keys(req.body) : 'N/A');
    console.log('[generateSemanticModelHandler] req.body 完整内容:', JSON.stringify(req.body || {}, null, 2));
    console.log('[generateSemanticModelHandler] req.headers.content-type:', req.headers['content-type']);
    console.log('[generateSemanticModelHandler] req.headers.accept:', req.headers['accept']);
    
    // 同时使用 logger（使用模板字符串）
    logger.info(`[generateSemanticModelHandler] req.method: ${req.method}`);
    logger.info(`[generateSemanticModelHandler] req.url: ${req.url}`);
    logger.info(`[generateSemanticModelHandler] req.path: ${req.path}`);
    logger.info(`[generateSemanticModelHandler] req.body 是否存在: ${!!req.body}`);
    logger.info(`[generateSemanticModelHandler] req.body 类型: ${typeof req.body}`);
    logger.info(`[generateSemanticModelHandler] req.body 的 keys: ${req.body ? Object.keys(req.body).join(', ') : 'N/A'}`);
    logger.info(`[generateSemanticModelHandler] req.headers.content-type: ${req.headers['content-type'] || 'N/A'}`);
    
    // 尝试从多个来源获取 schemaType
    let rawSchemaType = 'meta';
    if (req.body && req.body.schemaType) {
      rawSchemaType = req.body.schemaType;
      console.log('[generateSemanticModelHandler] 从 req.body.schemaType 获取:', rawSchemaType);
      logger.info(`[generateSemanticModelHandler] 从 req.body.schemaType 获取: ${rawSchemaType}`);
    } else if (req.query && req.query.schemaType) {
      rawSchemaType = req.query.schemaType;
      console.log('[generateSemanticModelHandler] 从 req.query.schemaType 获取:', rawSchemaType);
      logger.info(`[generateSemanticModelHandler] 从 req.query.schemaType 获取: ${rawSchemaType}`);
    } else {
      console.warn('[generateSemanticModelHandler] 未找到 schemaType，使用默认值 meta');
      logger.warn('[generateSemanticModelHandler] 未找到 schemaType，使用默认值 meta');
    }
    
    const userInput = req.body?.userInput || {}; // 支持schemaType参数：'light' | 'meta'
    
    // 规范化 schemaType
    const schemaType = rawSchemaType ? String(rawSchemaType).trim().toLowerCase() : 'meta';
    
    console.log('[generateSemanticModelHandler] 原始schemaType:', rawSchemaType);
    console.log('[generateSemanticModelHandler] 规范化后的schemaType:', schemaType);
    console.log('[generateSemanticModelHandler] schemaType === "light":', schemaType === 'light');
    console.log('[generateSemanticModelHandler] req.body完整内容:', JSON.stringify(req.body || {}, null, 2));
    
    logger.info(`[generateSemanticModelHandler] 原始schemaType: ${rawSchemaType}`);
    logger.info(`[generateSemanticModelHandler] 规范化后的schemaType: ${schemaType}`);
    logger.info(`[generateSemanticModelHandler] schemaType === "light": ${schemaType === 'light'}`);

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
        error: '无权访问此数据源',
      });
    }

    // 解密密码
    let password;
    try {
      password = await decryptPassword(dataSource.password);
    } catch (decryptError) {
      // 处理密码解密错误
      if (decryptError.code === 'LEGACY_ENCRYPTION_FORMAT') {
        return res.status(400).json({
          success: false,
          error: decryptError.message,
          code: 'LEGACY_ENCRYPTION_FORMAT',
        });
      }
      logger.error('[generateSemanticModelHandler] 密码解密失败', { error: decryptError.message });
      return res.status(500).json({
        success: false,
        error: decryptError.message || '密码解密失败',
        code: 'DECRYPTION_FAILED',
      });
    }

    // 获取数据库结构
    const schemaResult = await getDatabaseSchema({
      type: dataSource.type,
      host: dataSource.host,
      port: dataSource.port,
      database: dataSource.database,
      username: dataSource.username,
      password,
    });

    if (!schemaResult.success) {
      return res.status(500).json({
        success: false,
        error: schemaResult.error || '获取数据库结构失败',
      });
    }

    // 转换为语义模型YAML格式
    // 确保schemaType正确传递（处理可能的undefined情况）
    const effectiveSchemaType = schemaType || 'meta';
    logger.info('[generateSemanticModelHandler] 传递给convertSchemaToSemanticModelYAML的schemaType:', effectiveSchemaType);
    
    const yamlContent = await convertSchemaToSemanticModelYAML(schemaResult, {
      database: dataSource.database,
      userInput,
      schemaType: effectiveSchemaType, // 传递schemaType参数
    });

    return res.status(200).json({
      success: true,
      data: {
        yaml: yamlContent,
        database: dataSource.database,
        tableCount: Object.keys(schemaResult.schema || {}).length,
        generatedAt: new Date().toISOString(),
      },
      message: '语义模型生成成功',
    });
  } catch (error) {
    logger.error('[generateSemanticModelHandler] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '生成语义模型失败',
    });
  }
}

module.exports = {
  generateSemanticModelHandler,
  convertSchemaToSemanticModelYAML,
  generateLightSchema,
  generateMSchema,
};
