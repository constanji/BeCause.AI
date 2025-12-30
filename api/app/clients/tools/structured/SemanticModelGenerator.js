const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('@because/data-schemas');
const SemanticModelTemplateService = require('~/server/services/SemanticModelTemplateService');
const SqlExecutor = require('./SqlExecutor');
const DatabaseSchema = require('./DatabaseSchema');

/**
 * Semantic Model Generator Tool - 语义模型生成工具
 *
 * 这是一个用于生成语义模型文档的工具系统，基于模板系统生成高质量的语义模型规范。
 * 该工具集成了数据库查询能力（通过 SqlExecutor 和 DatabaseSchema），可以在生成语义模型时
 * 自动查询和分析数据库结构，从而生成准确的语义模型文档。
 */
class SemanticModelGenerator extends Tool {
  name = 'semantic_model_generator';

  description =
    '语义模型生成工具，基于模板系统生成高质量的语义模型文档。' +
    'Commands: generate-spec (生成语义模型规范), generate-implementation-plan (生成实施计划), ' +
    'generate-task-checklist (生成任务清单), generate-consistency-analysis (生成一致性分析), ' +
    'generate-quality-checklist (生成质量检查清单), ' +
    'list-templates (列出所有可用模板), readme (查看模板系统说明)。' +
    '该工具集成了数据库查询能力，可以在生成语义模型时自动查询数据库结构。';

  schema = z.object({
    command: z.enum([
      'generate-spec',
      'generate-implementation-plan',
      'generate-task-checklist',
      'generate-consistency-analysis',
      'generate-quality-checklist',
      'list-templates',
      'readme',
    ]),
    arguments: z
      .string()
      .optional()
      .describe('命令参数，JSON 字符串，包含生成语义模型所需的信息（如领域、需求描述等）'),
    query_database: z
      .boolean()
      .optional()
      .describe('是否查询数据库结构（默认 true），用于生成基于实际数据库结构的语义模型'),
    database_table: z
      .string()
      .optional()
      .describe('可选：指定要查询的数据库表名，如果不提供则查询所有表'),
  });

  constructor(fields = {}) {
    super();
    this.projectRoot = fields.projectRoot || process.cwd();
    this.service = new SemanticModelTemplateService(this.projectRoot);
    
    // 初始化数据库相关工具
    this.sqlExecutor = new SqlExecutor({ apiUrl: fields.sqlApiUrl });
    this.databaseSchema = new DatabaseSchema({ apiUrl: fields.sqlApiUrl });
    
    // sqlSemantic 目录路径
    this.sqlSemanticDir = path.join(this.projectRoot, 'sqlSemantic');
  }

  /**
   * 确保 sqlSemantic 目录存在
   */
  async ensureSqlSemanticDir() {
    try {
      await fs.access(this.sqlSemanticDir);
    } catch {
      await fs.mkdir(this.sqlSemanticDir, { recursive: true });
      logger.info(`[SemanticModelGenerator] 创建 sqlSemantic 目录: ${this.sqlSemanticDir}`);
    }
  }

  /**
   * 将数据库 schema 转换为语义模型格式
   */
  convertToSemanticModel(schemaData) {
    if (!schemaData.schema && !schemaData.columns) {
      return [];
    }

    // 单个表的情况
    if (schemaData.columns) {
      return [
        {
          name: schemaData.table,
          description: `数据库表: ${schemaData.table}`,
          model: schemaData.table,
          columns: schemaData.columns.map((col) => ({
            name: col.column_name,
            type: col.data_type,
            nullable: col.is_nullable === 'YES',
            key: col.column_key,
            comment: col.column_comment || '',
            default: col.column_default,
          })),
          indexes: schemaData.indexes || [],
        },
      ];
    }

    // 多个表的情况
    const semanticModels = [];
    for (const [tableName, tableInfo] of Object.entries(schemaData.schema)) {
      semanticModels.push({
        name: tableName,
        description: `数据库表: ${tableName}`,
        model: tableName,
        columns: tableInfo.columns.map((col) => ({
          name: col.column_name,
          type: col.data_type,
          nullable: col.is_nullable === 'YES',
          key: col.column_key,
          comment: col.column_comment || '',
          default: col.column_default,
        })),
        indexes: tableInfo.indexes || [],
      });
    }

    return semanticModels;
  }

  /**
   * 保存语义模型 JSON 文件到 sqlSemantic 文件夹
   */
  async saveSemanticModelJson(semanticModels, databaseName, options = {}) {
    try {
      await this.ensureSqlSemanticDir();

      const { fileName, metadata } = options;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const defaultFileName = fileName || `semantic_model_${databaseName || 'unknown'}_${timestamp}.json`;
      const filePath = path.join(this.sqlSemanticDir, defaultFileName);

      const outputData = {
        database: databaseName,
        generated_at: new Date().toISOString(),
        semantic_models: semanticModels,
        ...(metadata && { metadata }),
      };

      await fs.writeFile(filePath, JSON.stringify(outputData, null, 2), 'utf-8');
      
      logger.info(`[SemanticModelGenerator] 语义模型 JSON 文件已保存: ${filePath}`);
      
      return {
        success: true,
        filePath,
        fileName: defaultFileName,
        modelCount: semanticModels.length,
      };
    } catch (err) {
      logger.error('[SemanticModelGenerator] 保存语义模型 JSON 文件失败', {
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * 处理 generate-spec 命令
   */
  async handleGenerateSpec(args) {
    const { arguments: argsStr, query_database = true, database_table } = args;

    try {
      const template = await this.service.readTemplate('semantic-model-spec-template.md');
      
      // 先解析参数，以便在保存文件时使用
      const templateInfo = this.service.getTemplateInfo('semantic-model-spec-template.md');
      let argsData = {};
      if (argsStr) {
        try {
          argsData = JSON.parse(argsStr);
        } catch {
          argsData = { description: argsStr };
        }
      }
      
      let databaseInfo = null;
      let savedFileInfo = null;
      if (query_database) {
        try {
          const schemaResult = await this.databaseSchema._call({
            table: database_table,
            format: 'detailed',
          });
          const schemaData = JSON.parse(schemaResult);
          if (schemaData.success) {
            // 处理单个表或所有表的 schema 格式
            const schema = schemaData.schema || (database_table ? {
              [database_table]: {
                columns: schemaData.columns,
                indexes: schemaData.indexes,
              },
            } : {});
            
            databaseInfo = {
              database: schemaData.database,
              table: schemaData.table || database_table || 'all',
              schema: schema,
              text_format: schemaData.text_format,
            };

            // 转换为语义模型格式并保存为 JSON 文件
            try {
              const semanticModels = this.convertToSemanticModel({
                database: schemaData.database,
                table: schemaData.table || database_table,
                schema: schema,
                columns: schemaData.columns,
                indexes: schemaData.indexes,
              });

              if (semanticModels.length > 0) {
                savedFileInfo = await this.saveSemanticModelJson(
                  semanticModels,
                  schemaData.database,
                  {
                    fileName: argsData.fileName,
                    metadata: {
                      table: schemaData.table || database_table || 'all',
                      user_input: argsData,
                    },
                  }
                );
              }
            } catch (saveErr) {
              logger.warn('[SemanticModelGenerator] 保存语义模型 JSON 文件失败，但继续执行', {
                error: saveErr.message,
              });
            }
          }
        } catch (err) {
          logger.warn('[SemanticModelGenerator] 查询数据库结构失败，将在没有数据库信息的情况下生成模板', {
            error: err.message,
          });
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: '语义模型规范模板已加载。请根据模板和数据库结构信息生成完整的语义模型规范文档。',
          template_name: templateInfo.name,
          template: template,
          user_input: argsData,
          database_info: databaseInfo,
          saved_file: savedFileInfo,
          instructions: [
            '1. 阅读模板内容，理解语义模型规范的结构',
            '2. 如果有数据库信息，分析数据库结构（表、列、索引等）',
            '3. 根据用户输入（领域、需求描述等）和数据库结构，填充模板中的占位符',
            '4. 生成完整的语义模型规范文档',
            '5. 确保生成的文档包含：模型概述、核心概念定义、关系建模、约束规范等',
            savedFileInfo ? `6. 语义模型 JSON 文件已保存到: ${savedFileInfo.filePath}` : null,
          ].filter(Boolean),
          available_tools: [
            '可以使用 database_schema 工具查询数据库结构',
            '可以使用 sql_executor 工具查询数据样本以更好地理解业务含义',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载语义模型规范模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 generate-implementation-plan 命令
   */
  async handleGenerateImplementationPlan(args) {
    const { arguments: argsStr } = args;

    try {
      const template = await this.service.readTemplate('implementation-plan-template.md');
      const templateInfo = this.service.getTemplateInfo('implementation-plan-template.md');
      
      let argsData = {};
      if (argsStr) {
        try {
          argsData = JSON.parse(argsStr);
        } catch {
          argsData = { description: argsStr };
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: '实施计划模板已加载。请根据模板生成详细的实施计划。',
          template_name: templateInfo.name,
          template: template,
          user_input: argsData,
          instructions: [
            '1. 阅读模板内容，理解实施计划的结构',
            '2. 根据用户输入（项目概述、目标等）填充模板',
            '3. 生成包含阶段划分、时间线、资源计划、风险管理的完整实施计划',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载实施计划模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 generate-task-checklist 命令
   */
  async handleGenerateTaskChecklist(args) {
    const { arguments: argsStr } = args;

    try {
      const template = await this.service.readTemplate('task-checklist-template.md');
      const templateInfo = this.service.getTemplateInfo('task-checklist-template.md');
      
      let argsData = {};
      if (argsStr) {
        try {
          argsData = JSON.parse(argsStr);
        } catch {
          argsData = { description: argsStr };
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: '任务清单模板已加载。请根据模板生成详细的任务清单。',
          template_name: templateInfo.name,
          template: template,
          user_input: argsData,
          instructions: [
            '1. 阅读模板内容，理解任务清单的结构',
            '2. 根据用户输入（实施计划等）将实施过程分解为具体任务',
            '3. 为每个任务定义描述、负责人、预计时间、依赖关系、完成标准',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载任务清单模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 generate-consistency-analysis 命令
   */
  async handleGenerateConsistencyAnalysis(args) {
    const { arguments: argsStr } = args;

    try {
      const template = await this.service.readTemplate('consistency-analysis-template.md');
      const templateInfo = this.service.getTemplateInfo('consistency-analysis-template.md');
      
      let argsData = {};
      if (argsStr) {
        try {
          argsData = JSON.parse(argsStr);
        } catch {
          argsData = { description: argsStr };
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: '一致性分析模板已加载。请根据模板对语义模型进行一致性分析。',
          template_name: templateInfo.name,
          template: template,
          user_input: argsData,
          instructions: [
            '1. 阅读模板内容，理解一致性分析的结构',
            '2. 分析语义模型文档中的概念一致性、关系一致性、约束一致性等',
            '3. 生成完整的一致性分析报告，包含发现的问题和改进建议',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载一致性分析模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 generate-quality-checklist 命令
   */
  async handleGenerateQualityChecklist(args) {
    const { arguments: argsStr } = args;

    try {
      const template = await this.service.readTemplate('quality-checklist-template.md');
      const templateInfo = this.service.getTemplateInfo('quality-checklist-template.md');
      
      let argsData = {};
      if (argsStr) {
        try {
          argsData = JSON.parse(argsStr);
        } catch {
          argsData = { description: argsStr };
        }
      }

      return JSON.stringify(
        {
          success: true,
          message: '质量检查清单模板已加载。请根据模板生成质量检查清单。',
          template_name: templateInfo.name,
          template: template,
          user_input: argsData,
          instructions: [
            '1. 阅读模板内容，理解质量检查清单的结构',
            '2. 根据语义模型文档进行完整性、正确性、一致性、清晰性、可用性检查',
            '3. 生成完整的质量检查清单，标记各项检查结果',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `加载质量检查清单模板失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 list-templates 命令
   */
  async handleListTemplates() {
    try {
      const templates = await this.service.listTemplates();
      const templatesInfo = templates.map((template) => {
        const info = this.service.getTemplateInfo(template);
        return {
          filename: template,
          name: info.name,
          command: info.command,
          description: info.description,
        };
      });

      return JSON.stringify(
        {
          success: true,
          message: '可用模板列表',
          templates: templatesInfo,
          instructions: [
            '使用相应的命令（如 generate-spec）来使用这些模板生成语义模型文档',
          ],
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `获取模板列表失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * 处理 readme 命令
   */
  async handleReadme() {
    try {
      const readme = await this.service.readREADME();
      return JSON.stringify(
        {
          success: true,
          message: '模板系统说明',
          readme: readme,
        },
        null,
        2,
      );
    } catch (err) {
      return JSON.stringify(
        {
          success: false,
          error: `读取 README 失败: ${err.message}`,
        },
        null,
        2,
      );
    }
  }

  /**
   * @override
   */
  async _call(args) {
    const startTime = Date.now();
    try {
      const { command, arguments: commandArgs, query_database, database_table } = args;

      logger.info('[SemanticModelGenerator工具调用] ========== 开始调用 ==========');
      const inputParams = {
        command,
        arguments: commandArgs,
        query_database,
        database_table,
        timestamp: new Date().toISOString(),
      };
      logger.info(`[SemanticModelGenerator工具调用] 输入参数: ${JSON.stringify(inputParams, null, 2)}`);

      // 检查模板目录是否存在
      const isAvailable = await this.service.isAvailable();
      if (!isAvailable) {
        return JSON.stringify(
          {
            success: false,
            error:
              '语义模型模板目录未找到。请确保在项目根目录或上级目录中存在 specs/001-semantic-model-templates/templates 目录。',
          },
          null,
          2,
        );
      }

      let result;
      switch (command) {
        case 'generate-spec':
          result = await this.handleGenerateSpec(args);
          break;
        case 'generate-implementation-plan':
          result = await this.handleGenerateImplementationPlan(args);
          break;
        case 'generate-task-checklist':
          result = await this.handleGenerateTaskChecklist(args);
          break;
        case 'generate-consistency-analysis':
          result = await this.handleGenerateConsistencyAnalysis(args);
          break;
        case 'generate-quality-checklist':
          result = await this.handleGenerateQualityChecklist(args);
          break;
        case 'list-templates':
          result = await this.handleListTemplates();
          break;
        case 'readme':
          result = await this.handleReadme();
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
      logger.info(`[SemanticModelGenerator工具调用] 执行结果: ${JSON.stringify(resultInfo, null, 2)}`);
      logger.info('[SemanticModelGenerator工具调用] ========== 调用完成 ==========');

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errorInfo = {
        error: err.message,
        stack: err.stack,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
      logger.error(`[SemanticModelGenerator工具调用] 执行错误: ${JSON.stringify(errorInfo, null, 2)}`);
      logger.error('SemanticModelGenerator tool error:', err);
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

module.exports = SemanticModelGenerator;

