const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');
const DatEmbedderService = require('./DatEmbedderService');

/**
 * DatEmbedder Tool - DAT 嵌入模型发现和配置工具
 *
 * 用于发现和配置 DAT 系统中的嵌入模型（如 BGE、OpenAI、Jina、Ollama 等）。
 * 提供模型列表、配置选项查询等功能。
 */
class DatEmbedder extends Tool {
  name = 'dat-embedder';

  description =
    'DAT 嵌入模型发现和配置工具。' +
    'Commands: list (列出所有可用嵌入模型), info (获取模型详细信息), ' +
    'config (获取模型配置选项)。';

  schema = z.object({
    command: z.enum(['list', 'info', 'config']),
    embedder: z
      .string()
      .optional()
      .describe('嵌入模型名称，例如: bge-small-zh, openai, jina, ollama'),
  });

  constructor(fields = {}) {
    super();
    this.projectRoot = fields.projectRoot || process.cwd();
    this.service = new DatEmbedderService(this.projectRoot);
  }

  /**
   * 处理 list 命令 - 列出所有可用嵌入模型
   */
  async handleList() {
    try {
      const isAvailable = await this.service.isAvailable();
      if (!isAvailable) {
        return JSON.stringify(
          {
            success: false,
            error:
              'dat-main/dat-embedders 目录未找到。请确保在项目根目录中存在 dat-main/dat-embedders 目录。',
          },
          null,
          2,
        );
      }

      const embedders = await this.service.listEmbedders();

      return JSON.stringify(
        {
          success: true,
          message: `找到 ${embedders.length} 个嵌入模型`,
          embedders: embedders.map((embedder) => ({
            name: embedder.name,
            identifier: embedder.identifier,
            displayName: embedder.displayName,
            factoryClass: embedder.factoryClass,
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
          error: `列出嵌入模型失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 info 命令 - 获取嵌入模型详细信息
   */
  async handleInfo(embedderName) {
    if (!embedderName || !embedderName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'info 命令需要提供嵌入模型名称（embedder 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const embedderInfo = await this.service.getEmbedderInfo(embedderName);

      if (!embedderInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到嵌入模型: ${embedderName}`,
            suggestion: '使用 list 命令查看所有可用模型',
          },
          null,
          2,
        );
      }

      return JSON.stringify(
        {
          success: true,
          message: `嵌入模型 '${embedderName}' 的详细信息`,
          embedder: {
            name: embedderInfo.name,
            identifier: embedderInfo.identifier,
            displayName: embedderInfo.displayName,
            factoryClass: embedderInfo.factoryClass,
            modulePath: embedderInfo.modulePath,
          },
          configuration: {
            requiredOptions: embedderInfo.requiredOptions,
            optionalOptions: embedderInfo.optionalOptions,
            fingerprintOptions: embedderInfo.fingerprintOptions || [],
            configOptions: embedderInfo.configOptions,
          },
          instructions: [
            '使用 config 命令查看详细的配置选项说明',
            '配置选项用于在创建嵌入模型实例时提供必要的参数',
            'fingerprintOptions 用于模型实例的唯一标识',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `获取嵌入模型信息失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 config 命令 - 获取嵌入模型配置选项
   */
  async handleConfig(embedderName) {
    if (!embedderName || !embedderName.trim()) {
      return JSON.stringify(
        {
          success: false,
          error: 'config 命令需要提供嵌入模型名称（embedder 字段）。',
        },
        null,
        2,
      );
    }

    try {
      const embedderInfo = await this.service.getEmbedderInfo(embedderName);

      if (!embedderInfo) {
        return JSON.stringify(
          {
            success: false,
            error: `未找到嵌入模型: ${embedderName}`,
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
        fingerprint: {},
      };

      // 处理必需选项
      for (const optionVar of embedderInfo.requiredOptions) {
        const optionInfo = embedderInfo.configOptions[optionVar];
        if (optionInfo) {
          configDetails.required[optionInfo.key] = {
            variable: optionVar,
            description: optionInfo.description,
            required: true,
          };
        }
      }

      // 处理可选选项
      for (const optionVar of embedderInfo.optionalOptions) {
        const optionInfo = embedderInfo.configOptions[optionVar];
        if (optionInfo) {
          configDetails.optional[optionInfo.key] = {
            variable: optionVar,
            description: optionInfo.description,
            required: false,
          };
        }
      }

      // 处理指纹选项
      if (embedderInfo.fingerprintOptions) {
        for (const optionVar of embedderInfo.fingerprintOptions) {
          const optionInfo = embedderInfo.configOptions[optionVar];
          if (optionInfo) {
            configDetails.fingerprint[optionInfo.key] = {
              variable: optionVar,
              description: optionInfo.description,
              usedForFingerprint: true,
            };
          }
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: `嵌入模型 '${embedderName}' 的配置选项`,
          embedder: {
            name: embedderInfo.name,
            identifier: embedderInfo.identifier,
          },
          configuration: configDetails,
          example: {
            description: '配置示例（YAML 格式）',
            yaml: this.generateConfigExample(embedderName, configDetails),
          },
          instructions: [
            '必需配置项必须在创建模型实例时提供',
            '可选配置项有默认值，可根据需要覆盖',
            '指纹选项用于区分不同的模型实例配置',
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
  generateConfigExample(embedderName, configDetails) {
    const lines = [`embedder: ${embedderName}`, 'config:'];
    
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
      const { command, embedder } = args;

      logger.info('[DatEmbedder工具调用] ========== 开始调用 ==========');
      const inputParams = {
        command,
        embedder,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[DatEmbedder工具调用] 输入参数: ${JSON.stringify(inputParams, null, 2)}`);

      let result;
      switch (command) {
        case 'list':
          result = await this.handleList();
          break;
        case 'info':
          result = await this.handleInfo(embedder);
          break;
        case 'config':
          result = await this.handleConfig(embedder);
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
      logger.info(`[DatEmbedder工具调用] 执行结果: ${JSON.stringify(resultInfo, null, 2)}`);
      logger.info('[DatEmbedder工具调用] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        error: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.error(`[DatEmbedder工具调用] 执行错误: ${JSON.stringify(errorInfo, null, 2)}`);
      logger.error('DatEmbedder tool error:', err);
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

module.exports = DatEmbedder;

