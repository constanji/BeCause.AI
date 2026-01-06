const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const { logger } = require('@because/data-schemas');

/**
 * Result Analysis Tool - 结果分析工具
 * 
 * 分析SQL查询结果，提供归因分析和后续建议
 */
class ResultAnalysisTool extends Tool {
  name = 'result_analysis';

  description =
    'SQL查询结果分析工具，解释结果含义、指出关键维度、生成后续查询建议。' +
    '提供清晰的数据来源说明和业务洞察。';

  schema = z.object({
    sql: z
      .string()
      .min(1)
      .describe('执行的SQL查询语句'),
    results: z
      .array(z.any())
      .describe('SQL查询结果数组'),
    row_count: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('结果行数（如果results为空，使用此值）'),
    attribution: z
      .object({
        tables: z.array(z.string()).optional(),
        columns: z.array(z.string()).optional(),
        has_where: z.boolean().optional(),
        has_group_by: z.boolean().optional(),
        has_order_by: z.boolean().optional(),
        has_limit: z.boolean().optional(),
      })
      .optional()
      .describe('归因信息（来自sql_executor）'),
  });

  /**
   * 从SQL中提取结构信息
   */
  extractSQLStructure(sql) {
    const upper = sql.toUpperCase();
    const structure = {
      tables: [],
      columns: [],
      hasWhere: false,
      hasGroupBy: false,
      hasOrderBy: false,
      hasLimit: false,
    };

    try {
      // 提取表名
      const fromMatch = upper.match(/\bFROM\b([\s\S]+?)(\bWHERE\b|\bGROUP BY\b|\bORDER BY\b|\bLIMIT\b|$)/);
      if (fromMatch && fromMatch[1]) {
        const rawTables = fromMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        structure.tables = rawTables.map((t) => {
          const withoutAlias = t.replace(/\s+AS\s+.+$/i, '');
          return withoutAlias.split(/\s+/)[0];
        });
      }

      // 提取字段（简化处理）
      const selectMatch = upper.match(/\bSELECT\b([\s\S]+?)\bFROM\b/i);
      if (selectMatch && selectMatch[1]) {
        const columns = selectMatch[1]
          .split(',')
          .map((c) => {
            const col = c.trim();
            // 提取字段名（去除AS别名和函数）
            const match = col.match(/(\w+)(?:\s+AS\s+\w+)?$/i);
            return match ? match[1] : col;
          })
          .filter(Boolean);
        structure.columns = columns;
      }

      structure.hasWhere = /\bWHERE\b/i.test(sql);
      structure.hasGroupBy = /\bGROUP BY\b/i.test(sql);
      structure.hasOrderBy = /\bORDER BY\b/i.test(sql);
      structure.hasLimit = /\bLIMIT\b/i.test(sql);
    } catch (error) {
      logger.warn('[ResultAnalysisTool] 提取SQL结构失败:', error.message);
    }

    return structure;
  }

  /**
   * 分析结果数据
   */
  analyzeResults(results, sqlStructure, attribution) {
    const rowCount = Array.isArray(results) ? results.length : 0;
    const sampleRow = rowCount > 0 ? results[0] : null;
    const columns = sampleRow ? Object.keys(sampleRow) : attribution?.columns || sqlStructure.columns || [];

    // 识别关键维度（简化处理，实际应使用更智能的分析）
    const keyInsights = [];
    if (rowCount > 0 && sampleRow) {
      // 查找数值字段
      const numericFields = columns.filter((col) => {
        const value = sampleRow[col];
        return typeof value === 'number' && !isNaN(value);
      });

      // 查找分类字段
      const categoricalFields = columns.filter((col) => {
        const value = sampleRow[col];
        return typeof value === 'string' || typeof value === 'boolean';
      });

      // 生成洞察
      numericFields.forEach((field) => {
        const values = results.map((r) => r[field]).filter((v) => typeof v === 'number');
        if (values.length > 0) {
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = sum / values.length;
          const max = Math.max(...values);
          const min = Math.min(...values);

          keyInsights.push({
            dimension: field,
            value: sqlStructure.hasGroupBy ? '分组统计' : `总计: ${sum}, 平均: ${avg.toFixed(2)}`,
            impact: `该维度范围从 ${min} 到 ${max}`,
          });
        }
      });

      categoricalFields.slice(0, 3).forEach((field) => {
        const uniqueValues = [...new Set(results.map((r) => r[field]))];
        if (uniqueValues.length > 0 && uniqueValues.length <= 10) {
          keyInsights.push({
            dimension: field,
            value: uniqueValues.join(', '),
            impact: `该维度包含 ${uniqueValues.length} 个不同值`,
          });
        }
      });
    }

    return {
      rowCount,
      columns,
      keyInsights,
    };
  }

  /**
   * 生成归因说明
   */
  buildAttribution(sql, sqlStructure, attribution, analysis) {
    const tables = attribution?.tables || sqlStructure.tables || [];
    const columns = attribution?.columns || analysis.columns || [];

    const tablePart =
      tables.length > 0
        ? `主要数据来源于以下表：${tables.join('，')}。`
        : '未能从SQL中可靠解析出表名。';

    const columnPart =
      columns.length > 0
        ? `结果中包含字段：${columns.join('，')}。`
        : '结果中未检测到字段列表。';

    const clauseHints = [];
    if (attribution?.has_where || sqlStructure.hasWhere) {
      clauseHints.push('WHERE过滤条件');
    }
    if (attribution?.has_group_by || sqlStructure.hasGroupBy) {
      clauseHints.push('GROUP BY分组逻辑');
    }
    if (attribution?.has_order_by || sqlStructure.hasOrderBy) {
      clauseHints.push('ORDER BY排序规则');
    }
    if (attribution?.has_limit || sqlStructure.hasLimit) {
      clauseHints.push('LIMIT行数限制');
    }

    const clausePart =
      clauseHints.length > 0
        ? `查询中包含 ${clauseHints.join('、')}，这些条件影响结果。`
        : '查询中未检测到WHERE/GROUP BY/ORDER BY/LIMIT等子句。';

    return {
      tables,
      columns,
      filters: clauseHints.includes('WHERE过滤条件') ? '查询包含WHERE过滤条件' : '无WHERE条件',
      grouping: clauseHints.includes('GROUP BY分组逻辑') ? '查询包含GROUP BY分组' : '无GROUP BY分组',
      data_source: `${tablePart} ${columnPart} ${clausePart}`,
    };
  }

  /**
   * 生成后续建议
   */
  generateFollowUpSuggestions(sql, analysis, attribution) {
    const suggestions = [];

    // 如果结果为空，建议检查查询条件
    if (analysis.rowCount === 0) {
      suggestions.push({
        question: '查询结果为空，是否需要调整查询条件？',
        reason: '当前查询未返回任何结果',
        sql_hint: '检查WHERE条件是否过于严格',
      });
      return suggestions;
    }

    // 如果有GROUP BY，建议查看明细
    if (attribution?.has_group_by) {
      suggestions.push({
        question: '是否需要查看详细的分组明细数据？',
        reason: '当前查询使用了GROUP BY分组',
        sql_hint: '可以移除GROUP BY查看原始明细',
      });
    }

    // 如果有数值字段，建议进行对比分析
    const numericFields = analysis.columns.filter((col) => {
      if (analysis.rowCount === 0) return false;
      const sampleValue = analysis.results?.[0]?.[col];
      return typeof sampleValue === 'number';
    });

    if (numericFields.length > 0) {
      suggestions.push({
        question: `是否需要对比分析 ${numericFields[0]} 字段的趋势？`,
        reason: '检测到数值字段，可以进行趋势分析',
        sql_hint: '可以添加时间维度进行趋势分析',
      });
    }

    // 如果有多个表，建议查看关联详情
    if (attribution?.tables && attribution.tables.length > 1) {
      suggestions.push({
        question: '是否需要查看表之间的关联详情？',
        reason: '查询涉及多个表',
        sql_hint: '可以查看JOIN的详细关联关系',
      });
    }

    return suggestions;
  }

  /**
   * @override
   */
  async _call(input) {
    const { sql, results = [], row_count, attribution } = input;

    try {
      logger.info('[ResultAnalysisTool] 开始结果分析:', {
        sql: sql.substring(0, 50),
        rowCount: results.length || row_count || 0,
      });

      const sqlStructure = this.extractSQLStructure(sql);
      const analysis = this.analyzeResults(results, sqlStructure, attribution);
      const attributionInfo = this.buildAttribution(sql, sqlStructure, attribution, analysis);
      const followUpSuggestions = this.generateFollowUpSuggestions(sql, analysis, attribution);

      // 生成摘要
      const summary = `查询返回了 ${analysis.rowCount} 行数据，包含 ${analysis.columns.length} 个字段。${attributionInfo.data_source}`;

      const result = {
        summary,
        key_insights: analysis.keyInsights.length > 0 ? analysis.keyInsights : undefined,
        attribution: attributionInfo,
        follow_up_suggestions:
          followUpSuggestions.length > 0 ? followUpSuggestions : undefined,
        metadata: {
          row_count: analysis.rowCount,
          column_count: analysis.columns.length,
          analysis_confidence: 0.8, // 简化处理
        },
      };

      logger.info('[ResultAnalysisTool] 分析完成:', {
        rowCount: analysis.rowCount,
        insightsCount: analysis.keyInsights.length,
        suggestionsCount: followUpSuggestions.length,
      });

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error('[ResultAnalysisTool] 分析失败:', error);
      return JSON.stringify(
        {
          summary: '结果分析失败',
          error: error.message,
          metadata: {
            row_count: results.length || row_count || 0,
            column_count: 0,
            analysis_confidence: 0.0,
          },
        },
        null,
        2,
      );
    }
  }
}

module.exports = ResultAnalysisTool;

