const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { logger } = require('@aipyq/data-schemas');
const { interfaceSchema } = require('@aipyq/data-provider');
const getConfigPath = require('~/server/utils/getConfigPath');

async function updateInterfaceConfig(req, res) {
  try {
    const { interface: interfaceConfig } = req.body;

    if (!interfaceConfig) {
      return res.status(400).json({ error: 'Interface configuration is required' });
    }

    // 验证配置
    const validationResult = interfaceSchema.safeParse(interfaceConfig);
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Invalid interface configuration',
        details: validationResult.error.errors,
      });
    }

    // 读取现有的 YAML 文件
    const configPath = getConfigPath();
    logger.info(`[updateInterfaceConfig] Using config file path: ${configPath}`);
    let config = {};

    if (fs.existsSync(configPath)) {
      try {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents) || {};
      } catch (error) {
        logger.error('Error reading config file:', error);
        return res.status(500).json({ error: 'Failed to read config file' });
      }
    }

    // 合并 interface 配置，保留现有配置中的其他字段
    // 如果现有配置中没有 interface，直接设置
    // 如果有，则深度合并
    if (config.interface) {
      config.interface = {
        ...config.interface,
        ...interfaceConfig,
      };
    } else {
      config.interface = interfaceConfig;
    }

    // 保存回 YAML 文件
    try {
      const yamlString = yaml.dump(config, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false,
        quotingType: '"',
        forceQuotes: false,
        styles: {
          '!!null': 'canonical', // 使用 ~ 表示 null
        },
      });
      
      // 检查文件是否存在，如果不存在则创建目录
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 写入文件
      fs.writeFileSync(configPath, yamlString, 'utf8');
      
      // 验证文件是否写入成功：读取文件并验证内容
      try {
        const verifyContents = fs.readFileSync(configPath, 'utf8');
        const verifyConfig = yaml.load(verifyContents);
        
        // 验证 interface 配置是否真的被保存
        if (!verifyConfig.interface) {
          throw new Error('Configuration was written but verification failed: interface not found in saved file');
        }
        
        // 验证关键字段是否匹配
        const savedFileSearch = verifyConfig.interface.fileSearch;
        const expectedFileSearch = interfaceConfig.fileSearch;
        if (savedFileSearch !== expectedFileSearch) {
          logger.warn(`fileSearch mismatch. Expected: ${expectedFileSearch}, Got: ${savedFileSearch}`);
        }
        
        logger.info(`Interface configuration saved and verified to ${configPath}`);
      } catch (verifyError) {
        logger.error('Error verifying config file after write:', verifyError);
        throw new Error(`File written but verification failed: ${verifyError.message}`);
      }
    } catch (error) {
      logger.error('Error writing config file:', {
        error: error.message,
        code: error.code,
        path: configPath,
        stack: error.stack,
      });
      const errorMessage = error.code === 'EACCES' 
        ? 'Permission denied: Cannot write to config file. Please check file permissions.'
        : error.code === 'ENOENT'
        ? 'Config file path does not exist.'
        : error.message || 'Failed to write config file';
      return res.status(500).json({ error: errorMessage });
    }

    // 清除缓存，强制重新加载配置
    const { getLogStores } = require('~/cache');
    const { CacheKeys } = require('@aipyq/data-provider');
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    await cache.delete(CacheKeys.STARTUP_CONFIG);
    await cache.delete(CacheKeys.APP_CONFIG);

    res.json({ success: true, message: 'Interface configuration updated successfully' });
  } catch (error) {
    logger.error('Error updating interface configuration:', error);
    res.status(500).json({ error: error.message || 'Failed to update interface configuration' });
  }
}

module.exports = updateInterfaceConfig;

