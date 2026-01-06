---
name: sql-validation-tool
description: SQL合法性/安全性检测工具，检查SQL语法、安全性、表字段存在性等
category: sql-validation
version: 1.0
---

# SQL Validation Tool

## 概述

SQL校验工具，对SQL查询进行合法性、安全性和正确性检查：
- **安全性检查**：禁止DROP、DELETE、UPDATE等危险操作
- **语法检查**：验证SQL语法是否正确
- **表字段检查**：验证表和字段是否存在（如果提供schema）
- **权限检查**：检查是否越权访问

## 核心能力

1. **安全性验证**：禁止写操作和DDL操作
2. **语法验证**：基本SQL语法检查
3. **Schema验证**：验证表和字段是否存在（可选）
4. **风险评估**：评估SQL的风险等级

## 输入参数

- `sql` (string, 必需): 要校验的SQL查询语句
- `check_schema` (boolean, 可选): 是否检查表和字段是否存在，默认 false
- `schema_info` (object, 可选): 数据库schema信息（如果check_schema为true）
  - `tables` (array): 表名数组
  - `fields` (object): 字段映射，格式为 `{ tableName: [field1, field2] }`

## 输出格式

```json
{
  "valid": true | false,
  "errors": [
    {
      "type": "security" | "syntax" | "schema" | "permission",
      "message": "错误信息",
      "severity": "error" | "warning"
    }
  ],
  "warnings": [
    {
      "type": "performance" | "best_practice",
      "message": "警告信息"
    }
  ],
  "risk_level": "low" | "medium" | "high",
  "metadata": {
    "tables_used": ["table1", "table2"],
    "operations": ["SELECT"],
    "has_join": false,
    "has_subquery": false
  }
}
```

## 执行流程

1. **安全性检查**
   - 检查是否包含危险关键词（DROP、DELETE、UPDATE等）
   - 确保只允许SELECT查询

2. **语法检查**
   - 基本SQL语法验证
   - 检查括号匹配、引号匹配等

3. **Schema检查**（如果启用）
   - 验证表是否存在
   - 验证字段是否存在

4. **风险评估**
   - 根据检查结果评估风险等级
   - 生成警告和建议

## 安全检查规则

### 禁止的操作
- DROP TABLE / DATABASE
- DELETE FROM
- UPDATE SET
- INSERT INTO
- ALTER TABLE
- TRUNCATE TABLE
- CREATE TABLE / DATABASE
- GRANT / REVOKE

### 允许的操作
- SELECT（只读查询）
- JOIN（关联查询）
- 子查询
- 聚合函数（COUNT、SUM等）
- 窗口函数

## 使用场景

- **SQL生成后**：在SQL执行前进行校验
- **用户输入验证**：验证用户直接输入的SQL
- **安全审计**：检查SQL是否符合安全策略

## 注意事项

- 默认只进行安全性和基本语法检查
- Schema检查需要提供数据库schema信息
- 风险评估基于检查结果，仅供参考

