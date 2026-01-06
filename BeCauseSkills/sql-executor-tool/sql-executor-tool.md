---
name: sql-executor-tool
description: 执行SQL查询并返回结果和归因分析，支持动态数据源切换
category: sql-execution
version: 2.0
---

# SQL Executor Tool

## 概述

SQL执行工具，直接连接数据库执行SQL查询，支持动态数据源切换。

**重要更新（v2.0）**：
- 不再依赖独立的 `sql-api` 服务
- 直接从Agent配置中获取数据源信息
- 支持MySQL和PostgreSQL数据库
- 动态创建数据库连接，支持多数据源切换

## 核心能力

1. **动态数据源切换**：根据Agent配置的 `data_source_id` 动态连接数据库
2. **多数据库支持**：支持MySQL和PostgreSQL
3. **安全性检查**：禁止危险操作，只允许SELECT查询
4. **归因分析**：提供详细的数据来源说明

## 输入参数

- `sql` (string, 必需): 要执行的SQL查询语句
- `max_rows` (number, 可选): 限制返回的最大行数，默认返回全部结果（最多1000行）
- `data_source_id` (string, 可选): 数据源ID，如果不提供则从Agent配置中获取

## 输出格式

```json
{
  "success": true,
  "sql": "执行的SQL语句",
  "rowCount": 10,
  "rows": [...],
  "attribution": {
    "summary": "数据来源说明",
    "details": {
      "tables": ["table1", "table2"],
      "rowCount": 10,
      "columns": ["col1", "col2"],
      "hasWhere": true,
      "hasGroupBy": false,
      "hasOrderBy": true,
      "hasLimit": false
    },
    "guidance": [...]
  },
  "dataSource": {
    "id": "数据源ID",
    "name": "数据源名称",
    "type": "mysql",
    "database": "数据库名"
  }
}
```

## 执行流程

1. **获取数据源信息**
   - 从输入参数或Agent配置中获取 `data_source_id`
   - 查询数据源信息（host, port, database, username, password）
   - 解密密码

2. **安全性检查**
   - 验证SQL只包含SELECT查询
   - 禁止危险关键词（DROP, DELETE, UPDATE等）

3. **创建数据库连接**
   - 根据数据源类型（MySQL/PostgreSQL）创建连接
   - 使用连接池管理连接

4. **执行SQL查询**
   - 执行SQL并获取结果
   - 限制返回行数（如果指定）

5. **归因分析**
   - 分析SQL结构（表、字段、子句）
   - 生成数据来源说明

## 数据源配置

数据源信息存储在MongoDB中，Agent配置中包含 `data_source_id` 字段：

```json
{
  "agent": {
    "id": "agent-123",
    "name": "智能问数Agent",
    "data_source_id": "datasource-456",
    "tools": ["sql_executor"]
  }
}
```

## 使用场景

- **智能问数**：根据用户自然语言查询生成SQL并执行
- **数据分析**：执行复杂的数据分析查询
- **报表生成**：生成数据报表

## 注意事项

- 只允许执行SELECT查询，禁止写操作
- 数据源密码是加密存储的，需要解密后才能使用
- 连接使用连接池管理，避免频繁创建连接
- 如果Agent未配置数据源，工具会返回错误

## 迁移说明

### 从旧版本迁移

**旧版本**（使用sql-api服务）：
- 通过环境变量配置数据库
- 调用独立的sql-api服务执行SQL
- 无法动态切换数据源

**新版本**（v2.0）：
- 从Agent配置中获取数据源信息
- 直接连接数据库执行SQL
- 支持动态切换数据源

### 兼容性

- 如果Agent未配置 `data_source_id`，工具会尝试使用环境变量（向后兼容）
- 如果环境变量也未配置，工具会返回错误

