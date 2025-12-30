const path = require('path');
const fs = require('fs').promises;
const { logger } = require('@because/data-schemas');

/**
 * DatEmbedderService - 扫描和发现 DAT 嵌入模型
 *
 * 用于扫描 dat-main/dat-embedders 目录下的所有嵌入模型，
 * 解析 Factory 类的配置选项和标识符信息。
 */
class DatEmbedderService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.embeddersDir = path.join(projectRoot, 'dat-main', 'dat-embedders');
  }

  /**
   * 检查嵌入器目录是否存在
   */
  async isAvailable() {
    try {
      await fs.access(this.embeddersDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出所有可用的嵌入模型
   */
  async listEmbedders() {
    try {
      const entries = await fs.readdir(this.embeddersDir, { withFileTypes: true });
      const embedders = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('dat-embedder-')) {
          const embedderName = entry.name.replace('dat-embedder-', '');
          const embedderInfo = await this.getEmbedderInfo(embedderName);
          if (embedderInfo) {
            embedders.push(embedderInfo);
          }
        }
      }

      return embedders.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      logger.error(`Failed to list embedders: ${err.message}`);
      return [];
    }
  }

  /**
   * 获取特定嵌入模型的信息
   */
  async getEmbedderInfo(embedderName) {
    try {
      const embedderDir = path.join(this.embeddersDir, `dat-embedder-${embedderName}`);
      const factoryFile = await this.findFactoryFile(embedderDir);

      if (!factoryFile) {
        return null;
      }

      const factoryContent = await fs.readFile(factoryFile, 'utf-8');
      const info = this.parseFactoryFile(factoryContent, embedderName);

      return {
        name: embedderName,
        identifier: info.identifier,
        displayName: this.formatDisplayName(embedderName),
        factoryClass: info.factoryClass,
        requiredOptions: info.requiredOptions,
        optionalOptions: info.optionalOptions,
        fingerprintOptions: info.fingerprintOptions,
        description: info.description,
        modulePath: embedderDir,
      };
    } catch (err) {
      logger.warn(`Failed to get embedder info for ${embedderName}: ${err.message}`);
      return null;
    }
  }

  /**
   * 查找 Factory 文件
   */
  async findFactoryFile(embedderDir) {
    const javaDir = path.join(embedderDir, 'src', 'main', 'java');
    try {
      const files = await this.findJavaFiles(javaDir);
      return files.find((file) => file.includes('EmbeddingModelFactory.java'));
    } catch {
      return null;
    }
  }

  /**
   * 递归查找 Java 文件
   */
  async findJavaFiles(dir) {
    const files = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const subFiles = await this.findJavaFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.java')) {
          files.push(fullPath);
        }
      }
    } catch {
      // 忽略错误
    }
    return files;
  }

  /**
   * 解析 Factory 文件内容
   */
  parseFactoryFile(content, embedderName) {
    const info = {
      identifier: embedderName,
      factoryClass: null,
      requiredOptions: [],
      optionalOptions: [],
      fingerprintOptions: [],
      description: null,
    };

    // 提取 IDENTIFIER
    const identifierMatch = content.match(/IDENTIFIER\s*=\s*["']([^"']+)["']/);
    if (identifierMatch) {
      info.identifier = identifierMatch[1];
    }

    // 提取类名
    const classMatch = content.match(/public\s+class\s+(\w+EmbeddingModelFactory)/);
    if (classMatch) {
      info.factoryClass = classMatch[1];
    }

    // 提取必需配置选项
    const requiredOptionsMatch = content.match(
      /requiredOptions\(\)\s*\{[^}]*return[^}]*List\.of\(([^)]+)\)/s,
    );
    if (requiredOptionsMatch) {
      const options = requiredOptionsMatch[1]
        .split(',')
        .map((opt) => opt.trim())
        .filter(Boolean);
      info.requiredOptions = options;
    }

    // 提取可选配置选项
    const optionalOptionsMatch = content.match(
      /optionalOptions\(\)\s*\{[^}]*return[^}]*List\.of\(([^)]+)\)/s,
    );
    if (optionalOptionsMatch) {
      const options = optionalOptionsMatch[1]
        .split(',')
        .map((opt) => opt.trim())
        .filter(Boolean);
      info.optionalOptions = options;
    }

    // 提取指纹配置选项
    const fingerprintOptionsMatch = content.match(
      /fingerprintOptions\(\)\s*\{[^}]*return[^}]*Set\.of\(([^)]+)\)/s,
    );
    if (fingerprintOptionsMatch) {
      const options = fingerprintOptionsMatch[1]
        .split(',')
        .map((opt) => opt.trim())
        .filter(Boolean);
      info.fingerprintOptions = options;
    }

    // 提取配置选项定义
    const configOptions = this.extractConfigOptions(content);
    info.configOptions = configOptions;

    return info;
  }

  /**
   * 提取配置选项定义
   */
  extractConfigOptions(content) {
    const options = {};
    const optionRegex =
      /public\s+static\s+final\s+ConfigOption<[^>]+>\s+(\w+)\s*=\s*ConfigOptions\.key\(["']([^"']+)["']\)[^;]+withDescription\(["']([^"']*)["']\)/gs;

    let match;
    while ((match = optionRegex.exec(content)) !== null) {
      const [, varName, key, description] = match;
      options[varName] = {
        key,
        description,
      };
    }

    return options;
  }

  /**
   * 格式化显示名称
   */
  formatDisplayName(name) {
    return name
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

module.exports = DatEmbedderService;

