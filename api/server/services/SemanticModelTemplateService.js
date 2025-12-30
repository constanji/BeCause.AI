const path = require('path');
const fs = require('fs').promises;
const { logger } = require('@because/data-schemas');

/**
 * Semantic Model Template Service - Handles semantic model templates
 *
 * 用于读取语义模型模板文件，配合 SemanticModelGenerator 工具实现语义模型生成系统。
 * 模板文件位于 specs/001-semantic-model-templates/templates/ 目录下。
 */
class SemanticModelTemplateService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.templatesDir = path.join(projectRoot, 'specs', '001-semantic-model-templates', 'templates');
  }

  /**
   * 向上查找模板目录
   */
  async findTemplatesDir(startPath = this.projectRoot) {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const templatesPath = path.join(
        currentPath,
        'specs',
        '001-semantic-model-templates',
        'templates',
      );

      try {
        await fs.access(templatesPath);
        return templatesPath;
      } catch (err) {
        // 继续向上查找
      }

      currentPath = path.dirname(currentPath);
    }

    // 回退到构造函数预设路径
    return this.templatesDir;
  }

  /**
   * 检查模板目录是否可用
   */
  async isAvailable() {
    try {
      const templatesDir = await this.findTemplatesDir();
      await fs.access(templatesDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 读取模板文件
   */
  async readTemplate(templateName) {
    const templatesDir = await this.findTemplatesDir();
    const templatePath = path.join(templatesDir, templateName);

    try {
      await fs.access(templatePath);
      return await fs.readFile(templatePath, 'utf-8');
    } catch (err) {
      throw new Error(`Template not found: ${templateName} (path: ${templatePath})`);
    }
  }

  /**
   * 列出所有可用模板
   */
  async listTemplates() {
    const templatesDir = await this.findTemplatesDir();

    try {
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });
      const templates = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          templates.push(entry.name);
        }
      }

      return templates.sort();
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }

  /**
   * 获取模板信息（从文件名推断）
   */
  getTemplateInfo(templateName) {
    const templateMap = {
      'semantic-model-spec-template.md': {
        name: '语义模型规范模板',
        command: 'generate-spec',
        description: '生成语义模型规范文档，定义模型的结构、概念、关系和约束',
      },
      'implementation-plan-template.md': {
        name: '实施计划模板',
        command: 'generate-implementation-plan',
        description: '生成语义模型实施计划，包含阶段划分、任务分配、时间线等',
      },
      'task-checklist-template.md': {
        name: '任务清单模板',
        command: 'generate-task-checklist',
        description: '生成任务清单，将实施过程分解为具体可执行任务',
      },
      'consistency-analysis-template.md': {
        name: '一致性分析模板',
        command: 'generate-consistency-analysis',
        description: '生成一致性分析文档，验证语义模型内部的一致性',
      },
      'quality-checklist-template.md': {
        name: '质量检查清单模板',
        command: 'generate-quality-checklist',
        description: '生成质量检查清单，验证语义模型的完整性和质量',
      },
      'project-principles-template.md': {
        name: '项目原则模板',
        command: 'generate-project-principles',
        description: '生成项目原则文档，定义语义模型开发的核心原则',
      },
      'README.md': {
        name: '模板系统说明',
        command: 'readme',
        description: '查看模板系统使用说明',
      },
      'TEMPLATE_USAGE_GUIDE.md': {
        name: '模板使用指南',
        command: 'usage-guide',
        description: '查看模板详细使用指南',
      },
    };

    return templateMap[templateName] || {
      name: templateName,
      command: templateName.replace('.md', '').replace(/-/g, '-'),
      description: '语义模型模板',
    };
  }

  /**
   * 读取 README
   */
  async readREADME() {
    const templatesDir = await this.findTemplatesDir();
    const readmePath = path.join(templatesDir, 'README.md');

    try {
      return await fs.readFile(readmePath, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read README: ${readmePath} - ${err.message}`);
    }
  }
}

module.exports = SemanticModelTemplateService;

