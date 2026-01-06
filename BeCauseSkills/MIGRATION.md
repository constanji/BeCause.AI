# SQL Executor Tool 迁移指南

## 概述

`sql-executor-tool` 已重构为 v2.0，主要变化是**不再依赖独立的 `sql-api` 服务**，改为**直接从Agent配置中获取数据源信息并动态连接数据库**。

## 主要变化

### 旧版本（v1.0）

- 通过环境变量配置数据库连接（DB_HOST, DB_PORT等）
- 调用独立的 `sql-api` 服务执行SQL
- 无法动态切换数据源
- 所有Agent共享同一个数据库连接

### 新版本（v2.0）

- ✅ 从Agent配置中获取 `data_source_id`
- ✅ 根据数据源ID动态连接数据库
- ✅ 支持前端数据源管理功能
- ✅ 每个Agent可以使用不同的数据源
- ✅ 支持MySQL和PostgreSQL
- ✅ 使用连接池管理连接

## 迁移步骤

### 1. 创建数据源

在系统管理 → 数据源管理中创建数据源：

1. 点击"添加数据源"
2. 填写数据库连接信息：
   - 名称：数据源名称
   - 类型：MySQL 或 PostgreSQL
   - 主机：数据库主机地址
   - 端口：数据库端口
   - 数据库：数据库名称
   - 用户名：数据库用户名
   - 密码：数据库密码
3. 测试连接
4. 保存数据源

### 2. 配置Agent

在Agent配置中选择数据源：

1. 打开Agent配置页面
2. 在"数据源"下拉框中选择创建的数据源
3. 保存Agent配置

### 3. 更新工具注册

在 `api/app/clients/tools/util/handleTools.js` 中：

```javascript
const {
  SqlExecutorTool,
  // ... 其他工具
} = require('~/BeCauseSkills');

const toolConstructors = {
  // ... 其他工具
  sql_executor: SqlExecutorTool, // 使用新的工具类
};
```

### 4. 工具实例化

在 `loadTools` 函数中，确保传递 `agent` 对象：

```javascript
const toolInstance = new ToolClass({
  agent, // 传递Agent配置对象
  req: options.req,
  // 其他配置
});
```

## 兼容性说明

### 向后兼容

如果Agent未配置 `data_source_id`，工具会返回错误：

```json
{
  "success": false,
  "error": "未配置数据源。请在Agent配置中选择数据源，或在调用工具时提供data_source_id参数。"
}
```

### 环境变量回退（可选）

如果需要保持向后兼容，可以在工具中添加环境变量回退逻辑：

```javascript
// 如果没有配置数据源，尝试使用环境变量（向后兼容）
if (!dataSourceId && process.env.DB_HOST) {
  // 使用环境变量创建连接
}
```

## 常见问题

### Q: 如何切换数据源？

A: 在Agent配置中选择不同的数据源即可。每个Agent可以配置不同的数据源。

### Q: 密码安全吗？

A: 数据源密码使用加密存储（encryptV2），工具执行时会自动解密。密码不会在日志中暴露。

### Q: 连接池如何管理？

A: 工具使用连接池缓存，按数据源ID缓存连接池。连接池配置来自数据源的 `connectionPool` 设置。

### Q: 支持哪些数据库？

A: 目前支持 MySQL 和 PostgreSQL。其他数据库类型可以通过扩展工具代码支持。

### Q: 旧的 sql-api 服务还需要吗？

A: 如果所有Agent都已迁移到新工具，可以停止 `sql-api` 服务。但建议保留一段时间以确保稳定性。

## 性能优化

1. **连接池缓存**：连接池按数据源ID缓存，避免频繁创建连接
2. **连接复用**：同一数据源的多个查询共享连接池
3. **超时控制**：连接和查询都有超时控制，避免长时间等待

## 故障排查

### 问题：工具返回"数据源不存在"

**原因**：Agent未配置 `data_source_id` 或数据源ID无效

**解决**：
1. 检查Agent配置中是否选择了数据源
2. 确认数据源ID是否正确
3. 检查数据源是否已删除

### 问题：密码解密失败

**原因**：数据源密码使用了旧格式的加密

**解决**：
1. 编辑数据源
2. 重新输入密码
3. 保存配置

### 问题：连接超时

**原因**：数据库连接配置错误或网络问题

**解决**：
1. 检查数据库连接信息是否正确
2. 检查网络连接
3. 检查数据库是否允许远程连接
4. 检查防火墙设置

## 回滚方案

如果需要回滚到旧版本：

1. 恢复 `sql-executor` 工具为旧版本（使用sql-api）
2. 启动 `sql-api` 服务
3. 配置环境变量（DB_HOST, DB_PORT等）

但建议逐步迁移，而不是完全回滚。

