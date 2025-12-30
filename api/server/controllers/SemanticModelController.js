const { logger } = require('@because/data-schemas');
const { SystemRoles } = require('@because/data-provider');
const { getDataSourceById } = require('~/models/DataSource');
const { decryptPassword } = require('~/server/controllers/DataSourceController');
const yaml = require('js-yaml');

// 导入 getDatabaseSchema 函数
const { getDatabaseSchema } = require('~/server/controllers/DataSourceController');

/**
 * 将数据库结构转换为语义模型YAML格式
 * @param {Object} schemaData - 数据库结构数据
 * @param {Object} options - 选项
 * @returns {Promise<string>} YAML格式的语义模型
 */
async function convertSchemaToSemanticModelYAML(schemaData, options = {}) {
  const { database, userInput = {} } = options;
  const semanticModels = [];

  if (!schemaData.schema) {
    return yaml.dump({ version: 1, semantic_models: [] });
  }

  for (const [tableName, tableInfo] of Object.entries(schemaData.schema)) {
    const semanticModel = {
      name: tableName,
      description: tableInfo.columns.some(col => col.column_comment) 
        ? `数据库表: ${tableName} - ${tableInfo.columns.find(col => col.column_comment)?.column_comment || ''}`
        : `数据库表: ${tableName}`,
      model: tableName,
    };

    // 添加实体（主键、外键、唯一键）
    const entities = [];
    const primaryKeys = tableInfo.columns.filter(col => col.column_key === 'PRI');
    const foreignKeys = tableInfo.columns.filter(col => col.column_key === 'MUL');
    const uniqueKeys = tableInfo.columns.filter(col => col.column_key === 'UNI');

    primaryKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'primary',
        description: col.column_comment || `${col.column_name} 主键`,
        expr: col.column_name,
        data_type: col.data_type,
      });
    });

    foreignKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'foreign',
        description: col.column_comment || `${col.column_name} 外键`,
        expr: col.column_name,
        data_type: col.data_type,
      });
    });

    uniqueKeys.forEach(col => {
      entities.push({
        name: col.column_name,
        type: 'unique',
        description: col.column_comment || `${col.column_name} 唯一键`,
        expr: col.column_name,
        data_type: col.data_type,
      });
    });

    if (entities.length > 0) {
      semanticModel.entities = entities;
    }

    // 添加维度
    const dimensions = [];
    const timePattern = /(date|time|timestamp|created|updated|modified)/i;
    
    tableInfo.columns.forEach(col => {
      if (col.column_key && col.column_key !== '') {
        // 跳过已经在实体中的列
        return;
      }

      // 判断是否为时间维度
      if (timePattern.test(col.column_name) || timePattern.test(col.data_type)) {
        dimensions.push({
          name: col.column_name,
          type: 'time',
          description: col.column_comment || `${col.column_name} 时间维度`,
          expr: col.column_name,
          type_params: {
            time_granularity: 'day',
          },
          data_type: col.data_type,
        });
      } else {
        // 分类维度
        dimensions.push({
          name: col.column_name,
          type: 'categorical',
          description: col.column_comment || `${col.column_name} 分类维度`,
          expr: col.column_name,
          data_type: col.data_type,
        });
      }
    });

    if (dimensions.length > 0) {
      semanticModel.dimensions = dimensions;
    }

    // 添加度量（数值类型字段）
    const numericPattern = /(int|decimal|numeric|float|double|money|amount|price|quantity|count|total|sum)/i;
    const measures = [];
    
    tableInfo.columns.forEach(col => {
      if (numericPattern.test(col.data_type) && !col.column_key) {
        measures.push({
          name: col.column_name,
          description: col.column_comment || `${col.column_name} 度量`,
          expr: col.column_name,
          data_type: col.data_type,
          agg: 'sum',
        });
      }
    });

    if (measures.length > 0) {
      semanticModel.measures = measures;
    }

    semanticModels.push(semanticModel);
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
    const { userInput = {} } = req.body;

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
    const yamlContent = await convertSchemaToSemanticModelYAML(schemaResult, {
      database: dataSource.database,
      userInput,
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
};
