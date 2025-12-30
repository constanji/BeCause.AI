const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');
const DatAdapterService = require('./DatAdapterService');

/**
 * DatAdapter Tool - DAT 数据库适配器发现和配置工具
 *
 * 用于发现和配置 DAT 系统中的数据库适配器（如 MySQL、PostgreSQL、Oracle、DuckDB 等）。
 * 提供适配器列表、配置选项查询等功能。
 */
class DatAdapter extends Tool {
  name = 'dat-adapter';

  description =
    'DAT 数据库适配器发现和配置工具。' +
    'Commands: list (列出所有可用适配器), info (获取适配器详细信息), ' +
    'config (获取适配器配置选项)。';

  schema = z.object({
    command: z.enum(['list', 'info', 'config']),
    adapter: z
      .string()
      .optional()
      .describe('适配器名称，例如: mysql, postgresql, oracle, duckdb'),
  });

  constructor(fields = {}) {
    super();
    this.projectRoot = fields.projectRoot || process.cwd();
    this.service = new DatAdapterService(this.projectRoot);
  }

  /**
   * 处理 list 命令 - 列出所有可用适配器
   */
  async handleList() {
    try {
      const isAvailable = await this.service.isAvailable();
      if (!isAvailable) {
        return JSON.stringify(
          {
            success: false,
            error:
              'dat-main/dat-adapters 目录未找到。请确保在项目根目录中存在 dat-main/dat-adapters 目录。',
          },
          null,
          2,
        );
      }

      const adapters = await this.service.listAdapters();

      return JSON.stringify(
        {
          success: true,
          message: `找到 ${adapters.length} 个数据库适配器`,
          adapters: adapters.map((adapter) => ({
            name: adapter.name,
            identifier: adapter.identifier,
            displayName: adapter.displayName,
            factoryClass: adapter.factoryClass,
          })),
          instructions: [
            '使用 info 命令获取特定适配器的详细信息',
            '使用 config 命令查看适配器的配置选项',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `列出适配器失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 info 命令 - 获取适配器详细信息
   */
  async handleInfo(adapterName) {
    if (!adapterName || !adapterName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'info 命令需要提供适配器名称（adapter 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const adapterInfo = await this.service.getAdapterInfo(adapterName);

      if (!adapterInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到适配器: ${adapterName}`,
            suggestion: '使用 list 命令查看所有可用适配器',
          },
          null,
          2,
        );
      }

      return JSON.stringify(
        {
          success: true,
          message: `适配器 '${adapterName}' 的详细信息`,
          adapter: {
            name: adapterInfo.name,
            identifier: adapterInfo.identifier,
            displayName: adapterInfo.displayName,
            factoryClass: adapterInfo.factoryClass,
            modulePath: adapterInfo.modulePath,
          },
          configuration: {
            requiredOptions: adapterInfo.requiredOptions,
            optionalOptions: adapterInfo.optionalOptions,
            configOptions: adapterInfo.configOptions,
          },
          instructions: [
            '使用 config 命令查看详细的配置选项说明',
            '配置选项用于在创建适配器实例时提供必要的连接信息',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `获取适配器信息失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 config 命令 - 获取适配器配置选项
   */
  async handleConfig(adapterName) {
    if (!adapterName || !adapterName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'config 命令需要提供适配器名称（adapter 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const adapterInfo = await this.service.getAdapterInfo(adapterName);

      if (!adapterInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到适配器: ${adapterName}`,
            suggestion: '使用 list 命令查看所有可用适配器',
          },
          null,
          2,
        );
      }

      // 构建配置选项详情
      const configDetails = {
        required: {},
        optional: {},
      };

      // 处理必需选项
      for (const optionVar of adapterInfo.requiredOptions) {
        const optionInfo = adapterInfo.configOptions[optionVar];
        if (optionInfo) {
          configDetails.required[optionInfo.key] = {
            variable: optionVar,
            description: optionInfo.description,
            required: true,
          };
        }
      }

      // 处理可选选项
      for (const optionVar of adapterInfo.optionalOptions) {
        const optionInfo = adapterInfo.configOptions[optionVar];
        if (optionInfo) {
          configDetails.optional[optionInfo.key] = {
            variable: optionVar,
            description: optionInfo.description,
            required: false,
          };
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: `适配器 '${adapterName}' 的配置选项`,
          adapter: {
            name: adapterInfo.name,
            identifier: adapterInfo.identifier,
          },
          configuration: configDetails,
          example: {
            description: '配置示例（YAML 格式）',
            yaml: this.generateConfigExample(adapterName, configDetails),
          },
          instructions: [
            '必需配置项必须在创建适配器时提供',
            '可选配置项有默认值，可根据需要覆盖',
            '配置项使用 kebab-case 格式（如 base-url, api-key）',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `获取配置选项失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 生成配置示例
   */
  generateConfigExample(adapterName, configDetails) {
    const lines = [`adapter: ${adapterName}`, 'config:'];
    
    // 添加必需配置
    for (const [key, info] of Object.entries(configDetails.required)) {
      lines.push(`  ${key}: "<${info.description || key}>"`);
    }
    
    // 添加可选配置（注释形式）
    if (Object.keys(configDetails.optional).length > 0) {
      lines.push('  # 可选配置:');
      for (const [key, info] of Object.entries(configDetails.optional)) {
        lines.push(`  # ${key}: "<${info.description || key}>"`);
      }
    }
    
    return lines.join('\n');
  }

  async _call(args) {
    const startTime = Date.now();
    try {
      const { command, adapter } = args;

      logger.info('[DatAdapter工具调用] ========== 开始调用 ==========');
      const inputParams = {
        command,
        adapter,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[DatAdapter工具调用] 输入参数: ${JSON.stringify(inputParams, null, 2)}`);

      let result;
      switch (command) {
        case 'list':
          result = await this.handleList();
          break;
        case 'info':
          result = await this.handleInfo(adapter);
          break;
        case 'config':
          result = await this.handleConfig(adapter);
          break;
        default:
          result = JSON.stringify(
            {
              success: false,
              error: `未知命令: ${command}`,
            },
            null,
            2,
          );
      }

      const duration = Date.now() - startTime;
      const resultPreview =
        typeof result === 'string'
          ? result.length > 1000
            ? result.substring(0, 1000) + '...'
            : result
          : JSON.stringify(result).substring(0, 1000);
      const resultInfo = {
        command,
        resultPreview,
        resultLength: typeof result === 'string' ? result.length : JSON.stringify(result).length,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[DatAdapter工具调用] 执行结果: ${JSON.stringify(resultInfo, null, 2)}`);
      logger.info('[DatAdapter工具调用] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        error: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.error(`[DatAdapter工具调用] 执行错误: ${JSON.stringify(errorInfo, null, 2)}`);
      logger.error('DatAdapter tool error:', err);
      return JSON.stringify(
        {
          success: false,
          error: err.message,
        },
        null,
        2,
      );
    }
  }
}

module.exports = DatAdapter;

