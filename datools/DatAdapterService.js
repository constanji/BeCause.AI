const path = require('path');
const fs = require('fs').promises;
const { logger } = require('@because/data-schemas');

/**
 * DatAdapterService - 扫描和发现 DAT 数据库适配器
 *
 * 用于扫描 dat-main/dat-adapters 目录下的所有数据库适配器，
 * 解析 Factory 类的配置选项和标识符信息。
 */
class DatAdapterService {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.adaptersDir = path.join(projectRoot, 'dat-main', 'dat-adapters');
  }

  /**
   * 检查适配器目录是否存在
   */
  async isAvailable() {
    try {
      await fs.access(this.adaptersDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 列出所有可用的适配器
   */
  async listAdapters() {
    try {
      const entries = await fs.readdir(this.adaptersDir, { withFileTypes: true });
      const adapters = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('dat-adapter-')) {
          const adapterName = entry.name.replace('dat-adapter-', '');
          const adapterInfo = await this.getAdapterInfo(adapterName);
          if (adapterInfo) {
            adapters.push(adapterInfo);
          }
        }
      }

      return adapters.sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      logger.error(`Failed to list adapters: ${err.message}`);
      return [];
    }
  }

  /**
   * 获取特定适配器的信息
   */
  async getAdapterInfo(adapterName) {
    try {
      const adapterDir = path.join(this.adaptersDir, `dat-adapter-${adapterName}`);
      const factoryFile = await this.findFactoryFile(adapterDir);

      if (!factoryFile) {
        return null;
      }

      const factoryContent = await fs.readFile(factoryFile, 'utf-8');
      const info = this.parseFactoryFile(factoryContent, adapterName);

      return {
        name: adapterName,
        identifier: info.identifier,
        displayName: this.formatDisplayName(adapterName),
        factoryClass: info.factoryClass,
        requiredOptions: info.requiredOptions,
        optionalOptions: info.optionalOptions,
        description: info.description,
        modulePath: adapterDir,
      };
    } catch (err) {
      logger.warn(`Failed to get adapter info for ${adapterName}: ${err.message}`);
      return null;
    }
  }

  /**
   * 查找 Factory 文件
   */
  async findFactoryFile(adapterDir) {
    const javaDir = path.join(adapterDir, 'src', 'main', 'java');
    try {
      const files = await this.findJavaFiles(javaDir);
      return files.find((file) => file.includes('AdapterFactory.java'));
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
  parseFactoryFile(content, adapterName) {
    const info = {
      identifier: adapterName,
      factoryClass: null,
      requiredOptions: [],
      optionalOptions: [],
      description: null,
    };

    // 提取 IDENTIFIER
    const identifierMatch = content.match(/IDENTIFIER\s*=\s*["']([^"']+)["']/);
    if (identifierMatch) {
      info.identifier = identifierMatch[1];
    }

    // 提取类名
    const classMatch = content.match(/public\s+class\s+(\w+AdapterFactory)/);
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

    // 提取配置选项定义（查找 ConfigOption 定义）
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

module.exports = DatAdapterService;

