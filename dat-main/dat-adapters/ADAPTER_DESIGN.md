# DAT 数据库适配器设计说明

## 📋 目录

- [一、设计概述](#一设计概述)
- [二、结构相似性分析](#二结构相似性分析)
- [三、核心设计模式](#三核心设计模式)
- [四、职责分离](#四职责分离)
- [五、扩展机制](#五扩展机制)
- [六、实现指南](#六实现指南)

---

## 一、设计概述

### 为什么结构如此相似？

DAT 的数据库适配器采用**统一的架构模式**，所有适配器都遵循相同的结构设计。这种设计带来以下优势：

1. **一致性**: 所有适配器遵循相同的接口和模式，降低学习成本
2. **可维护性**: 统一的代码结构便于维护和调试
3. **可扩展性**: 新增数据库适配器只需遵循既定模式
4. **代码复用**: 通过抽象基类复用通用逻辑，减少重复代码

### 设计原则

- **模板方法模式**: 通用逻辑在基类中实现，特定逻辑由子类实现
- **单一职责**: 每个类只负责一个明确的职责
- **开闭原则**: 对扩展开放，对修改关闭
- **依赖倒置**: 依赖抽象接口而非具体实现

---

## 二、结构相似性分析

### 1. 目录结构

所有适配器模块都遵循相同的目录结构：

```
dat-adapter-{database}/
├── pom.xml                                    # Maven 配置
├── src/
│   └── main/
│       ├── java/
│       │   └── ai/dat/adapter/{database}/
│       │       ├── {Database}DatabaseAdapter.java          # 数据库适配器实现
│       │       ├── {Database}DatabaseAdapterFactory.java   # 工厂类
│       │       └── {Database}SemanticAdapter.java          # 语义适配器
│       └── resources/
│           └── META-INF/
│               └── services/
│                   └── ai.dat.core.factories.DatabaseAdapterFactory  # SPI 注册
└── target/
```

**示例对比**:

| 数据库 | 适配器类 | 工厂类 | 语义适配器类 |
|--------|----------|--------|--------------|
| MySQL | `MySqlDatabaseAdapter` | `MySqlDatabaseAdapterFactory` | `MySqlSemanticAdapter` |
| PostgreSQL | `PostgreSqlDatabaseAdapter` | `PostgreSqlDatabaseAdapterFactory` | `PostgreSqlSemanticAdapter` |
| Oracle | `OracleDatabaseAdapter` | `OracleDatabaseAdapterFactory` | `OracleSemanticAdapter` |
| DuckDB | `DuckDBDatabaseAdapter` | `DuckDBDatabaseAdapterFactory` | `DuckDBSemanticAdapter` |

### 2. 类结构相似性

#### 2.1 DatabaseAdapter 类

所有适配器都继承自 `GenericSqlDatabaseAdapter`：

```java
public class {Database}DatabaseAdapter extends GenericSqlDatabaseAdapter {
    
    public {Database}DatabaseAdapter(DataSource dataSource) {
        super(new {Database}SemanticAdapter(), dataSource);
    }
    
    // 实现特定方法
    @Override
    protected Object handleSpecificTypes(Object value, int columnType) {
        // 数据库特定的类型处理
    }
    
    @Override
    public AnsiSqlType toAnsiSqlType(int columnType, String columnTypeName, 
                                      int precision, int scale) {
        // 数据库特定的类型映射
    }
    
    @Override
    public String limitClause(int limit) {
        // 数据库特定的 LIMIT 语法
    }
}
```

**共同点**:
- 都继承 `GenericSqlDatabaseAdapter`
- 构造函数接收 `DataSource` 并创建对应的 `SemanticAdapter`
- 实现相同的抽象方法

**差异点**:
- 类型处理逻辑（`handleSpecificTypes`）
- 类型映射规则（`toAnsiSqlType`）
- SQL 语法差异（`limitClause`）

#### 2.2 DatabaseAdapterFactory 类

所有工厂类都实现 `DatabaseAdapterFactory` 接口：

```java
public class {Database}DatabaseAdapterFactory implements DatabaseAdapterFactory {
    
    public static final String IDENTIFIER = "{database}";
    
    // 配置选项定义
    public static final ConfigOption<String> URL = ...;
    public static final ConfigOption<String> USERNAME = ...;
    public static final ConfigOption<String> PASSWORD = ...;
    public static final ConfigOption<Duration> TIMEOUT = ...;
    
    @Override
    public String factoryIdentifier() {
        return IDENTIFIER;
    }
    
    @Override
    public Set<ConfigOption<?>> requiredOptions() {
        // 返回必需配置
    }
    
    @Override
    public Set<ConfigOption<?>> optionalOptions() {
        // 返回可选配置
    }
    
    @Override
    public DatabaseAdapter create(ReadableConfig config) {
        // 创建 DataSource 和 Adapter
    }
}
```

**共同点**:
- 都实现 `DatabaseAdapterFactory` 接口
- 都有 `IDENTIFIER` 常量
- 都定义配置选项（URL、USERNAME、PASSWORD、TIMEOUT）
- 都实现相同的接口方法

**差异点**:
- 配置选项可能不同（如 DuckDB 使用 `file-path` 而非 URL）
- DataSource 创建方式不同
- 特定配置项不同

#### 2.3 SemanticAdapter 类

所有语义适配器都实现 `SemanticAdapter` 接口：

```java
public class {Database}SemanticAdapter implements SemanticAdapter {
    
    public static final SqlDialect DEFAULT = ...;
    
    @Override
    public SqlDialect getSqlDialect() {
        return DEFAULT;
    }
    
    @Override
    public String applyTimeGranularity(String dateExpr, 
                                        Dimension.TypeParams.TimeGranularity granularity) {
        // 数据库特定的时间粒度函数
    }
    
    @Override
    public AnsiSqlType toAnsiSqlType(String columnTypeName) {
        // 数据库特定的类型映射
    }
}
```

**共同点**:
- 都实现 `SemanticAdapter` 接口
- 都定义 `SqlDialect`
- 都实现时间粒度处理
- 都实现类型映射

**差异点**:
- SQL 方言不同（使用不同的 `SqlDialect`）
- 时间粒度函数不同（如 MySQL 用 `DATE_FORMAT`，PostgreSQL 用 `DATE_TRUNC`）
- 类型名称不同（如 PostgreSQL 的 `int2`、`int4`、`int8`）

### 3. SPI 注册

所有适配器都在 `META-INF/services/` 中注册：

```
# META-INF/services/ai.dat.core.factories.DatabaseAdapterFactory
ai.dat.adapter.mysql.MySqlDatabaseAdapterFactory
ai.dat.adapter.postgresql.PostgreSqlDatabaseAdapterFactory
ai.dat.adapter.oracle.OracleDatabaseAdapterFactory
ai.dat.adapter.duckdb.DuckDBDatabaseAdapterFactory
```

---

## 三、核心设计模式

### 1. 模板方法模式 (Template Method Pattern)

**基类**: `GenericSqlDatabaseAdapter`

**设计**:
- 基类提供通用实现（查询执行、元数据获取、表初始化等）
- 子类只需实现特定方法（类型处理、类型映射、SQL 语法）

**优势**:
- 代码复用：通用逻辑只需实现一次
- 一致性：所有适配器行为一致
- 扩展性：新增适配器只需实现差异部分

**示例**:

```java
// 基类中的模板方法
public List<Map<String, Object>> executeQuery(String sql) throws SQLException {
    // 通用查询逻辑
    try (Connection conn = dataSource.getConnection();
         PreparedStatement stmt = conn.prepareStatement(sql);
         ResultSet rs = stmt.executeQuery()) {
        // ...
        value = handleSpecificTypes(value, md.getColumnType(i));  // 调用子类方法
        // ...
    }
}

// 子类实现特定逻辑
@Override
protected Object handleSpecificTypes(Object value, int columnType) {
    // MySQL 特定的类型处理
}
```

### 2. 工厂模式 (Factory Pattern)

**接口**: `DatabaseAdapterFactory`

**设计**:
- 统一创建接口
- 配置驱动的创建方式
- SPI 机制自动发现

**优势**:
- 解耦：客户端不直接依赖具体实现
- 统一管理：通过工厂统一创建和管理
- 配置化：通过配置选择不同的适配器

### 3. 策略模式 (Strategy Pattern)

**接口**: `SemanticAdapter`

**设计**:
- 不同的数据库使用不同的 SQL 方言策略
- 运行时选择策略

**优势**:
- 灵活：可以轻松切换不同的 SQL 方言
- 可扩展：新增数据库只需新增策略实现

### 4. SPI 机制 (Service Provider Interface)

**设计**:
- 通过 Java SPI 机制自动发现和加载适配器
- 运行时注册，无需修改核心代码

**优势**:
- 插件化：适配器可以作为插件独立开发和部署
- 解耦：核心代码不依赖具体适配器实现
- 动态加载：运行时发现和加载适配器

---

## 四、职责分离

### 1. DatabaseAdapter 职责

**核心职责**:
- 数据库连接管理
- SQL 查询执行
- 结果集处理
- 数据类型转换
- 元数据获取
- 表初始化（种子数据）

**实现方式**:
- 继承 `GenericSqlDatabaseAdapter` 获得通用实现
- 实现特定方法处理数据库差异

### 2. SemanticAdapter 职责

**核心职责**:
- SQL 方言定义
- 时间粒度函数实现
- 类型名称到 ANSI SQL 类型映射
- 标识符引用（表名、列名）

**实现方式**:
- 实现 `SemanticAdapter` 接口
- 使用 Apache Calcite 的 `SqlDialect`

### 3. DatabaseAdapterFactory 职责

**核心职责**:
- 定义配置选项
- 创建 DataSource
- 创建 DatabaseAdapter 实例
- 提供工厂标识符

**实现方式**:
- 实现 `DatabaseAdapterFactory` 接口
- 通过 SPI 机制注册

---

## 五、扩展机制

### 1. 如何添加新的数据库适配器

#### 步骤 1: 创建模块

在 `dat-adapters` 下创建新模块：

```xml
<module>dat-adapter-{database}</module>
```

#### 步骤 2: 实现 DatabaseAdapter

```java
public class {Database}DatabaseAdapter extends GenericSqlDatabaseAdapter {
    public {Database}DatabaseAdapter(DataSource dataSource) {
        super(new {Database}SemanticAdapter(), dataSource);
    }
    
    // 实现特定方法
}
```

#### 步骤 3: 实现 SemanticAdapter

```java
public class {Database}SemanticAdapter implements SemanticAdapter {
    // 实现接口方法
}
```

#### 步骤 4: 实现 Factory

```java
public class {Database}DatabaseAdapterFactory implements DatabaseAdapterFactory {
    // 实现接口方法
}
```

#### 步骤 5: 注册 SPI

在 `META-INF/services/ai.dat.core.factories.DatabaseAdapterFactory` 中注册：

```
ai.dat.adapter.{database}.{Database}DatabaseAdapterFactory
```

#### 步骤 6: 添加依赖

在 `pom.xml` 中添加数据库驱动依赖。

### 2. 需要实现的关键方法

#### DatabaseAdapter 需要实现的方法:

| 方法 | 说明 | 是否必须 |
|------|------|----------|
| `handleSpecificTypes` | 处理数据库特定的数据类型 | 是 |
| `toAnsiSqlType` | 类型映射到 ANSI SQL 类型 | 是 |
| `limitClause` | LIMIT 子句语法 | 是 |
| `toColumnType` | 数据类型到 JDBC 类型映射 | 是 |
| `stringDataType` | 字符串数据类型 | 否（有默认值） |
| `getDropTableSqlIfExists` | DROP TABLE IF EXISTS 语法 | 否（有默认值） |

#### SemanticAdapter 需要实现的方法:

| 方法 | 说明 | 是否必须 |
|------|------|----------|
| `getSqlDialect` | 返回 SQL 方言 | 是 |
| `applyTimeGranularity` | 时间粒度函数 | 是 |
| `toAnsiSqlType` | 类型名称映射 | 是 |

---

## 六、实现指南

### 1. 类型处理指南

#### 1.1 handleSpecificTypes 方法

处理数据库特定的数据类型转换：

```java
@Override
protected Object handleSpecificTypes(Object value, int columnType) {
    if (value == null) {
        return null;
    }
    
    switch (columnType) {
        case Types.BOOLEAN:
            // 处理布尔类型
            break;
        case Types.DECIMAL:
            // 处理小数类型
            break;
        // ... 其他类型
    }
    
    return value;
}
```

**注意事项**:
- 必须处理 `null` 值
- 保持类型一致性
- 处理数据库特定的类型（如 PostgreSQL 的 `PGobject`）

#### 1.2 toAnsiSqlType 方法

将数据库类型映射到 ANSI SQL 类型：

```java
@Override
public AnsiSqlType toAnsiSqlType(int columnType, String columnTypeName, 
                                  int precision, int scale) {
    return switch (columnTypeName.toUpperCase()) {
        case "INT" -> AnsiSqlType.INTEGER;
        case "VARCHAR" -> AnsiSqlType.VARCHAR;
        // ... 其他类型映射
        default -> super.toAnsiSqlType(columnType, columnTypeName, precision, scale);
    };
}
```

**注意事项**:
- 处理大小写不敏感
- 处理类型变体（如 `INT`、`INTEGER`）
- 提供默认映射

### 2. SQL 语法指南

#### 2.1 LIMIT 子句

不同数据库的 LIMIT 语法：

| 数据库 | 语法 |
|--------|------|
| MySQL | `LIMIT n` |
| PostgreSQL | `LIMIT n` |
| Oracle | `FETCH FIRST n ROWS ONLY` |
| SQL Server | `TOP n` |

#### 2.2 时间粒度函数

不同数据库的时间粒度函数：

**MySQL**:
```sql
DATE_FORMAT(date, '%Y-%m-01')  -- 月份
DATE_TRUNC('month', date)       -- PostgreSQL
```

**PostgreSQL**:
```sql
DATE_TRUNC('month', date)       -- 月份
DATE_TRUNC('year', date)        -- 年份
```

### 3. 配置选项指南

#### 3.1 标准配置选项

大多数数据库适配器需要：

- `url` - JDBC URL（必需）
- `username` - 用户名（必需）
- `password` - 密码（必需）
- `timeout` - 超时时间（可选，默认 60 秒）

#### 3.2 特殊配置选项

某些数据库可能需要特殊配置：

- **DuckDB**: `file-path` - 数据库文件路径
- **Oracle**: `service-name` - 服务名
- **PostgreSQL**: `schema` - 模式名

### 4. 最佳实践

#### 4.1 代码组织

- 将数据库特定的逻辑集中在适配器类中
- 使用常量定义数据库特定的值
- 添加详细的注释说明数据库特性

#### 4.2 错误处理

- 提供有意义的错误消息
- 处理数据库特定的异常
- 记录详细的日志

#### 4.3 测试

- 编写单元测试覆盖核心功能
- 测试类型转换逻辑
- 测试 SQL 语法生成

#### 4.4 文档

- 记录数据库特定的行为
- 说明配置选项
- 提供使用示例

---

## 七、设计优势总结

### 1. 一致性

所有适配器遵循相同的结构，开发者可以：
- 快速理解新适配器的代码
- 复用已有的实现经验
- 保持代码风格一致

### 2. 可维护性

统一的架构使得：
- 修改通用逻辑只需修改基类
- 问题定位更容易
- 代码审查更高效

### 3. 可扩展性

新增适配器只需：
- 遵循既定模式
- 实现特定方法
- 注册 SPI 服务

### 4. 代码复用

通过抽象基类：
- 减少重复代码
- 提高开发效率
- 降低维护成本

---

## 八、总结

DAT 数据库适配器的统一结构设计体现了以下设计理念：

1. **模板方法模式**: 通用逻辑在基类，特定逻辑在子类
2. **职责分离**: DatabaseAdapter、SemanticAdapter、Factory 各司其职
3. **SPI 机制**: 插件化架构，易于扩展
4. **配置驱动**: 通过配置选择适配器，无需修改代码

这种设计使得 DAT 能够：
- 轻松支持新的数据库
- 保持代码的一致性和可维护性
- 提供良好的扩展性

---

**文档版本**: 1.0  
**最后更新**: 2025-01-XX  
**维护者**: DAT 开发团队


