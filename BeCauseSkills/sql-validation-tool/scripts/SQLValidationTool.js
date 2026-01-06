const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');

/**
 * SQL Validation Tool - SQL校验工具
 * 
 * 检查SQL的合法性、安全性和正确性
 */
class SQLValidationTool extends Tool {
  name = 'sql_validation';

  description =
    'SQL合法性/安全性检测工具，检查SQL语法、安全性、表字段存在性等。' +
    '禁止DROP、DELETE、UPDATE等危险操作，只允许SELECT查询。';

  schema = z.object({
    sql: z
      .string()
      .min(1)
      .describe('要校验的SQL查询语句'),
    check_schema: z
      .boolean()
      .optional()
      .default(false)
      .describe('是否检查表和字段是否存在，默认false'),
    schema_info: z
      .object({
        tables: z.array(z.string()).optional(),
        fields: z.record(z.array(z.string())).optional(),
      })
      .optional()
      .describe('数据库schema信息（如果check_schema为true）'),
  });

  /**
   * 提取SQL中使用的表名
   */
  extractTables(sql) {
    const upper = sql.toUpperCase();
    const tables = [];
    
    try {
      // 提取FROM之后到WHERE/GROUP BY/ORDER BY/LIMIT之前的部分
      const fromMatch = upper.match(/\bFROM\b([\s\S]+?)(\bWHERE\b|\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/);
      if (fromMatch && fromMatch[1]) {
        const rawTables = fromMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        
        tables.push(...rawTables.map((t) => {
          // 移除AS别名
          const withoutAlias = t.replace(/\s+AS\s+.+$/i, '');
          // 提取表名（去除可能的JOIN关键字）
          const tableName = withoutAlias.split(/\s+/).pop();
          return tableName;
        }));
      }
      
      // 提取JOIN中的表名
      const joinMatches = upper.matchAll(/\bJOIN\s+(\w+)/gi);
      for (const match of joinMatches) {
        if (match[1]) {
          tables.push(match[1]);
        }
      }
    } catch (error) {
      logger.warn('[SQLValidationTool] 提取表名失败:', error.message);
    }
    
    return [...new Set(tables)]; // 去重
  }

  /**
   * 检查SQL安全性
   */
  checkSecurity(sql) {
    const upper = sql.toUpperCase().trim();
    const errors = [];
    const warnings = [];

    // 必须是以SELECT开头
    if (!upper.startsWith('SELECT')) {
      errors.push({
        type: 'security',
        message: '只允许执行SELECT查询，请不要包含INSERT/UPDATE/DELETE/DDL等写操作。',
        severity: 'error',
      });
      return { errors, warnings };
    }

    // 禁止危险关键词
    const dangerousKeywords = [
      'DROP',
      'DELETE',
      'UPDATE',
      'INSERT',
      'ALTER',
      'TRUNCATE',
      'CREATE',
      'GRANT',
      'REVOKE',
      'EXEC',
      'EXECUTE',
    ];

    for (const keyword of dangerousKeywords) {
      if (upper.includes(keyword)) {
        errors.push({
          type: 'security',
          message: `检测到危险关键词 "${keyword}"，出于安全考虑拒绝执行该查询。`,
          severity: 'error',
        });
      }
    }

    // 检查是否有子查询中的危险操作
    const subqueryPattern = /\([^)]*\)/g;
    const subqueries = sql.match(subqueryPattern) || [];
    for (const subquery of subqueries) {
      const subUpper = subquery.toUpperCase();
      for (const keyword of dangerousKeywords) {
        if (subUpper.includes(keyword)) {
          errors.push({
            type: 'security',
            message: `子查询中包含危险关键词 "${keyword}"。`,
            severity: 'error',
          });
        }
      }
    }

    // 性能警告
    if (upper.includes('SELECT *')) {
      warnings.push({
        type: 'best_practice',
        message: '建议避免使用 SELECT *，明确指定需要的字段可以提高性能。',
      });
    }

    return { errors, warnings };
  }

  /**
   * 基本语法检查
   */
  checkSyntax(sql) {
    const errors = [];
    
    // 检查括号匹配
    const openParens = (sql.match(/\(/g) || []).length;
    const closeParens = (sql.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      errors.push({
        type: 'syntax',
        message: '括号不匹配',
        severity: 'error',
      });
    }

    // 检查引号匹配
    const singleQuotes = (sql.match(/'/g) || []).length;
    const doubleQuotes = (sql.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: '单引号不匹配',
        severity: 'error',
      });
    }
    if (doubleQuotes % 2 !== 0) {
      errors.push({
        type: 'syntax',
        message: '双引号不匹配',
        severity: 'error',
      });
    }

    return errors;
  }

  /**
   * Schema检查
   */
  checkSchema(sql, schemaInfo) {
    const errors = [];
    const warnings = [];
    
    if (!schemaInfo) {
      return { errors, warnings };
    }

    const tables = this.extractTables(sql);
    const schemaTables = schemaInfo.tables || [];
    const schemaFields = schemaInfo.fields || {};

    // 检查表是否存在
    for (const table of tables) {
      if (schemaTables.length > 0 && !schemaTables.includes(table)) {
        errors.push({
          type: 'schema',
          message: `表 "${table}" 不存在于数据库中`,
          severity: 'error',
        });
      }
    }

    // 检查字段是否存在（简化处理，实际应解析SELECT字段）
    // 这里只做基本检查，完整实现需要SQL解析器

    return { errors, warnings };
  }

  /**
   * 评估风险等级
   */
  assessRisk(errors, warnings) {
    const hasSecurityError = errors.some(e => e.type === 'security');
    const hasSyntaxError = errors.some(e => e.type === 'syntax');
    const hasSchemaError = errors.some(e => e.type === 'schema');

    if (hasSecurityError) {
      return 'high';
    }
    if (hasSyntaxError || hasSchemaError) {
      return 'medium';
    }
    if (warnings.length > 0) {
      return 'low';
    }
    return 'low';
  }

  /**
   * 提取SQL元数据
   */
  extractMetadata(sql) {
    const upper = sql.toUpperCase();
    const tables = this.extractTables(sql);

    return {
      tables_used: tables,
      operations: ['SELECT'],
      has_join: /\bJOIN\b/i.test(sql),
      has_subquery: /\([^)]*\bSELECT\b[^)]*\)/i.test(sql),
      has_group_by: /\bGROUP BY\b/i.test(sql),
      has_order_by: /\bORDER BY\b/i.test(sql),
      has_limit: /\bLIMIT\b/i.test(sql),
    };
  }

  /**
   * @override
   */
  async _call(input) {
    const { sql, check_schema = false, schema_info } = input;
    const trimmedSql = sql.trim();

    try {
      logger.info('[SQLValidationTool] 开始SQL校验:', {
        sql: trimmedSql.substring(0, 50),
        checkSchema: check_schema,
      });

      // 安全性检查
      const securityCheck = this.checkSecurity(trimmedSql);
      const errors = [...securityCheck.errors];
      const warnings = [...securityCheck.warnings];

      // 语法检查
      const syntaxErrors = this.checkSyntax(trimmedSql);
      errors.push(...syntaxErrors);

      // Schema检查（如果启用）
      if (check_schema && schema_info) {
        const schemaCheck = this.checkSchema(trimmedSql, schema_info);
        errors.push(...schemaCheck.errors);
        warnings.push(...schemaCheck.warnings);
      }

      // 评估风险等级
      const riskLevel = this.assessRisk(errors, warnings);

      // 提取元数据
      const metadata = this.extractMetadata(trimmedSql);

      const result = {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        risk_level: riskLevel,
        metadata,
      };

      logger.info('[SQLValidationTool] 校验完成:', {
        valid: result.valid,
        riskLevel,
        errorsCount: errors.length,
        warningsCount: warnings.length,
      });

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error('[SQLValidationTool] 校验失败:', error);
      return JSON.stringify(
        {
          valid: false,
          errors: [
            {
              type: 'syntax',
              message: `校验过程出错: ${error.message}`,
              severity: 'error',
            },
          ],
          risk_level: 'high',
          metadata: {},
        },
        null,
        2,
      );
    }
  }
}

module.exports = SQLValidationTool;

