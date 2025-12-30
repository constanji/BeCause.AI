const { DataSource } = require('~/db/models');
const { logger } = require('@because/data-schemas');

/**
 * 创建数据源
 * @param {Object} dataSourceData - 数据源数据
 * @returns {Promise<IDataSource>}
 */
async function createDataSource(dataSourceData) {
  try {
    const dataSource = new DataSource(dataSourceData);
    const savedDataSource = await dataSource.save();
    // 返回普通对象而不是Mongoose文档
    return savedDataSource.toObject ? savedDataSource.toObject() : savedDataSource;
  } catch (error) {
    logger.error('[createDataSource] Error:', error);
    logger.error('[createDataSource] Error stack:', error.stack);
    logger.error('[createDataSource] Error details:', {
      message: error.message,
      name: error.name,
      code: error.code,
      keyPattern: error.keyPattern,
      keyValue: error.keyValue,
      errors: error.errors,
    });
    // 直接抛出原始错误，让控制器处理
    throw error;
  }
}

/**
 * 获取所有数据源
 * @param {Object} filter - 过滤条件
 * @returns {Promise<IDataSource[]>}
 */
async function getDataSources(filter = {}) {
  try {
    return await DataSource.find(filter).sort({ createdAt: -1 }).lean();
  } catch (error) {
    logger.error('[getDataSources] Error:', error);
    throw error;
  }
}

/**
 * 根据ID获取数据源
 * @param {string} dataSourceId - 数据源ID
 * @returns {Promise<IDataSource | null>}
 */
async function getDataSourceById(dataSourceId) {
  try {
    return await DataSource.findById(dataSourceId).lean();
  } catch (error) {
    logger.error('[getDataSourceById] Error:', error);
    throw error;
  }
}

/**
 * 更新数据源
 * @param {string} dataSourceId - 数据源ID
 * @param {Object} updateData - 更新数据
 * @returns {Promise<IDataSource | null>}
 */
async function updateDataSource(dataSourceId, updateData) {
  try {
    return await DataSource.findByIdAndUpdate(
      dataSourceId,
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean();
  } catch (error) {
    logger.error('[updateDataSource] Error:', error);
    throw error;
  }
}

/**
 * 删除数据源
 * @param {string} dataSourceId - 数据源ID
 * @returns {Promise<boolean>}
 */
async function deleteDataSource(dataSourceId) {
  try {
    const result = await DataSource.findByIdAndDelete(dataSourceId);
    return !!result;
  } catch (error) {
    logger.error('[deleteDataSource] Error:', error);
    throw error;
  }
}

module.exports = {
  createDataSource,
  getDataSources,
  getDataSourceById,
  updateDataSource,
  deleteDataSource,
};

