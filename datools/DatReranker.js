const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');
const DatRerankerService = require('./DatRerankerService');

/**
 * DatReranker Tool - DAT 重排序模型发现和配置工具
 *
 * 用于发现和配置 DAT 系统中的重排序模型（如 MS-MARCO、Jina、ONNX 等）。
 * 提供模型列表、配置选项查询等功能。
 */
class DatReranker extends Tool {
  name = 'dat-reranker';

  description =
    'DAT 重排序模型发现和配置工具。' +
    'Commands: list (列出所有可用重排序模型), info (获取模型详细信息), ' +
    'config (获取模型配置选项)。';

  schema = z.object({
    command: z.enum(['list', 'info', 'config']),
    reranker: z
      .string()
      .optional()
      .describe('重排序模型名称，例如: ms-marco-minilm-l6-v2, jina, onnx-local'),
  });

  constructor(fields = {}) {
    super();
    this.projectRoot = fields.projectRoot || process.cwd();
    this.service = new DatRerankerService(this.projectRoot);
  }

  /**
   * 处理 list 命令 - 列出所有可用重排序模型
   */
  async handleList() {
    try {
      const isAvailable = await this.service.isAvailable();
      if (!isAvailable) {
        return JSON.stringify(
          {
            success: false,
            error:
              'dat-main/dat-rerankers 目录未找到。请确保在项目根目录中存在 dat-main/dat-rerankers 目录。',
          },
          null,
          2,
        );
      }

      const rerankers = await this.service.listRerankers();

      return JSON.stringify(
        {
          success: true,
          message: `找到 ${rerankers.length} 个重排序模型`,
          rerankers: rerankers.map((reranker) => ({
            name: reranker.name,
            identifier: reranker.identifier,
            displayName: reranker.displayName,
            factoryClass: reranker.factoryClass,
          })),
          instructions: [
            '使用 info 命令获取特定模型的详细信息',
            '使用 config 命令查看模型的配置选项',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `列出重排序模型失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 info 命令 - 获取重排序模型详细信息
   */
  async handleInfo(rerankerName) {
    if (!rerankerName || !rerankerName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'info 命令需要提供重排序模型名称（reranker 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const rerankerInfo = await this.service.getRerankerInfo(rerankerName);

      if (!rerankerInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到重排序模型: ${rerankerName}`,
            suggestion: '使用 list 命令查看所有可用模型',
          },
          null,
          2,
        );
      }

      return JSON.stringify(
        {
          success: true,
          message: `重排序模型 '${rerankerName}' 的详细信息`,
          reranker: {
            name: rerankerInfo.name,
            identifier: rerankerInfo.identifier,
            displayName: rerankerInfo.displayName,
            factoryClass: rerankerInfo.factoryClass,
            modulePath: rerankerInfo.modulePath,
          },
          configuration: {
            requiredOptions: rerankerInfo.requiredOptions,
            optionalOptions: rerankerInfo.optionalOptions,
            configOptions: rerankerInfo.configOptions,
          },
          instructions: [
            '使用 config 命令查看详细的配置选项说明',
            '配置选项用于在创建重排序模型实例时提供必要的参数',
            '某些模型（如 ONNX 本地模型）可能不需要配置',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `获取重排序模型信息失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 config 命令 - 获取重排序模型配置选项
   */
  async handleConfig(rerankerName) {
    if (!rerankerName || !rerankerName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'config 命令需要提供重排序模型名称（reranker 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const rerankerInfo = await this.service.getRerankerInfo(rerankerName);

      if (!rerankerInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到重排序模型: ${rerankerName}`,
            suggestion: '使用 list 命令查看所有可用模型',
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
      for (const optionVar of rerankerInfo.requiredOptions) {
        const optionInfo = rerankerInfo.configOptions[optionVar];
        if (optionInfo) {
          configDetails.required[optionInfo.key] = {
            variable: optionVar,
            description: optionInfo.description,
            required: true,
          };
        }
      }

      // 处理可选选项
      for (const optionVar of rerankerInfo.optionalOptions) {
        const optionInfo = rerankerInfo.configOptions[optionVar];
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
          message: `重排序模型 '${rerankerName}' 的配置选项`,
          reranker: {
            name: rerankerInfo.name,
            identifier: rerankerInfo.identifier,
          },
          configuration: configDetails,
          example: {
            description: '配置示例（YAML 格式）',
            yaml: this.generateConfigExample(rerankerName, configDetails),
          },
          instructions: [
            '必需配置项必须在创建模型实例时提供',
            '可选配置项有默认值，可根据需要覆盖',
            '某些本地模型（如 ONNX）可能不需要任何配置',
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
  generateConfigExample(rerankerName, configDetails) {
    const lines = [`reranker: ${rerankerName}`, 'config:'];
    
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
    
    // 如果没有配置项，说明是本地模型
    if (Object.keys(configDetails.required).length === 0 && 
        Object.keys(configDetails.optional).length === 0) {
      lines.push('  # 本地模型，无需配置');
    }
    
    return lines.join('\n');
  }

  async _call(args) {
    const startTime = Date.now();
    try {
      const { command, reranker } = args;

      logger.info('[DatReranker工具调用] ========== 开始调用 ==========');
      const inputParams = {
        command,
        reranker,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[DatReranker工具调用] 输入参数: ${JSON.stringify(inputParams, null, 2)}`);

      let result;
      switch (command) {
        case 'list':
          result = await this.handleList();
          break;
        case 'info':
          result = await this.handleInfo(reranker);
          break;
        case 'config':
          result = await this.handleConfig(reranker);
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
      logger.info(`[DatReranker工具调用] 执行结果: ${JSON.stringify(resultInfo, null, 2)}`);
      logger.info('[DatReranker工具调用] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        error: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.error(`[DatReranker工具调用] 执行错误: ${JSON.stringify(errorInfo, null, 2)}`);
      logger.error('DatReranker tool error:', err);
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

module.exports = DatReranker;

