#!/usr/bin/env node

/**
 * 诊断文件上传 500 错误
 * 检查可能导致文件上传失败的各种问题
 */

const path = require('path');
const fs = require('fs');

// 设置环境变量路径
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function diagnose() {
  console.log('🔍 诊断文件上传问题...\n');
  const issues = [];
  const warnings = [];

  // 1. 检查环境变量
  console.log('1️⃣ 检查环境变量...');
  // VectorDBService 支持多种环境变量名称，且有默认值，所以不强制要求
  const envVarNames = [
    'VECTOR_DB_HOST', 'DB_HOST', 'POSTGRES_HOST',
    'VECTOR_DB_PORT', 'DB_PORT', 'POSTGRES_PORT',
    'VECTOR_DB_NAME', 'POSTGRES_DB',
    'VECTOR_DB_USER', 'POSTGRES_USER',
    'VECTOR_DB_PASSWORD', 'POSTGRES_PASSWORD',
  ];
  
  const hasDbConfig = envVarNames.some(v => process.env[v]);
  if (hasDbConfig) {
    console.log('   ✅ 数据库环境变量已配置（使用自定义配置）');
  } else {
    console.log('   ℹ️  使用默认数据库配置（localhost:5434/mydatabase）');
  }

  const embeddingDim = parseInt(process.env.EMBEDDING_DIMENSION || '512', 10);
  console.log(`   📊 EMBEDDING_DIMENSION: ${embeddingDim}`);

  // 2. 检查 ONNX 模型文件
  console.log('\n2️⃣ 检查 ONNX 模型文件...');
  const modelPath = path.join(__dirname, '../api/server/services/RAG/onnx/embedding/resources');
  if (!fs.existsSync(modelPath)) {
    issues.push(`ONNX 模型目录不存在: ${modelPath}`);
    console.log(`   ❌ 模型目录不存在: ${modelPath}`);
  } else {
    const files = fs.readdirSync(modelPath);
    const hasModel = files.some(f => f.includes('.onnx') || f.includes('model'));
    const hasTokenizer = files.some(f => f.includes('tokenizer'));
    
    if (!hasModel) {
      issues.push('ONNX 模型文件不存在');
      console.log('   ❌ ONNX 模型文件不存在');
    } else {
      console.log('   ✅ ONNX 模型文件存在');
    }
    
    if (!hasTokenizer) {
      warnings.push('Tokenizer 文件可能不存在');
      console.log('   ⚠️  Tokenizer 文件可能不存在');
    } else {
      console.log('   ✅ Tokenizer 文件存在');
    }
  }

  // 3. 检查依赖
  console.log('\n3️⃣ 检查依赖...');
  const apiPackageJson = path.join(__dirname, '../api/package.json');
  if (fs.existsSync(apiPackageJson)) {
    const pkg = JSON.parse(fs.readFileSync(apiPackageJson, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    
    if (!deps['@xenova/transformers']) {
      issues.push('缺少依赖: @xenova/transformers');
      console.log('   ❌ 缺少依赖: @xenova/transformers');
      console.log('   💡 运行: cd api && npm install @xenova/transformers');
    } else {
      console.log('   ✅ @xenova/transformers 已安装');
    }
  } else {
    warnings.push('无法检查依赖：package.json 不存在');
    console.log('   ⚠️  无法检查依赖');
  }

  // 4. 检查数据库连接
  console.log('\n4️⃣ 检查数据库连接...');
  try {
    const VectorDBService = require('../api/server/services/RAG/VectorDBService');
    const vectorDB = new VectorDBService();
    await vectorDB.initialize();
    const pool = vectorDB.getPool();
    
    // 检查 pgvector 扩展
    const extResult = await pool.query(
      "SELECT * FROM pg_extension WHERE extname = 'vector'"
    );
    if (extResult.rows.length === 0) {
      issues.push('pgvector 扩展未启用');
      console.log('   ❌ pgvector 扩展未启用');
    } else {
      console.log('   ✅ pgvector 扩展已启用');
    }

    // 检查 file_vectors 表
    const tableResult = await pool.query(`
      SELECT column_name, data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'file_vectors' AND column_name = 'embedding'
    `);
    if (tableResult.rows.length === 0) {
      issues.push('file_vectors 表不存在或 embedding 列不存在');
      console.log('   ❌ file_vectors 表不存在或 embedding 列不存在');
    } else {
      const col = tableResult.rows[0];
      console.log(`   ✅ file_vectors 表存在，embedding 类型: ${col.udt_name}`);
      
      // 尝试从表定义中获取维度
      let dimension = 'unknown';
      try {
        // 方法1: 从 pg_attribute 和 pg_type 获取
        const dimResult = await pool.query(`
          SELECT 
            pg_catalog.format_type(a.atttypid, a.atttypmod) as formatted_type
          FROM pg_catalog.pg_attribute a
          JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
          JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = 'public'
            AND c.relname = 'file_vectors'
            AND a.attname = 'embedding'
        `);
        
        if (dimResult.rows.length > 0) {
          const formattedType = dimResult.rows[0].formatted_type;
          const match = formattedType.match(/vector\((\d+)\)/);
          if (match) {
            dimension = match[1];
          }
        }
        
        // 方法2: 如果还是 unknown，尝试直接查询表定义
        if (dimension === 'unknown') {
          const createTableResult = await pool.query(`
            SELECT pg_get_expr(d.adbin, d.adrelid) as default_expr
            FROM pg_catalog.pg_attrdef d
            JOIN pg_catalog.pg_attribute a ON d.adrelid = a.attrelid AND d.adnum = a.attnum
            JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
            WHERE c.relname = 'file_vectors' AND a.attname = 'embedding'
          `);
          
          // 如果还是 unknown，检查表结构
          if (dimension === 'unknown') {
            const tableDefResult = await pool.query(`
              SELECT column_name, data_type, udt_name, 
                     CASE 
                       WHEN data_type = 'USER-DEFINED' THEN 
                         (SELECT typname FROM pg_type WHERE oid = (
                           SELECT atttypid FROM pg_attribute 
                           WHERE attrelid = 'file_vectors'::regclass 
                           AND attname = 'embedding'
                         ))
                       ELSE data_type
                     END as actual_type
              FROM information_schema.columns 
              WHERE table_name = 'file_vectors' AND column_name = 'embedding'
            `);
            
            if (tableDefResult.rows.length > 0) {
              const actualType = tableDefResult.rows[0].actual_type;
              console.log(`   📊 实际类型: ${actualType}`);
            }
          }
        }
      } catch (err) {
        console.log(`   ⚠️  无法获取维度信息: ${err.message}`);
      }
      
      if (dimension === 'unknown') {
        warnings.push('无法确定 embedding 列的实际维度，可能需要检查表结构');
        console.log(`   ⚠️  无法确定维度（可能是 vector 类型但未指定维度）`);
        console.log(`   💡 建议运行: ALTER TABLE file_vectors ALTER COLUMN embedding TYPE vector(512);`);
      } else {
        console.log(`   ✅ embedding 维度: ${dimension}`);
        if (parseInt(dimension) !== embeddingDim) {
          issues.push(`维度不匹配: 数据库配置 ${dimension}，环境变量 ${embeddingDim}`);
          console.log(`   ❌ 维度不匹配: 数据库 ${dimension} vs 环境变量 ${embeddingDim}`);
          console.log(`   💡 修复方法: ALTER TABLE file_vectors ALTER COLUMN embedding TYPE vector(${embeddingDim});`);
        } else {
          console.log(`   ✅ 维度匹配 (${embeddingDim})`);
        }
      }
    }
    
    await pool.end();
  } catch (error) {
    issues.push(`数据库连接失败: ${error.message}`);
    console.log(`   ❌ 数据库连接失败: ${error.message}`);
  }

  // 5. 检查 ONNX 模型初始化
  console.log('\n5️⃣ 检查 ONNX 模型初始化...');
  try {
    const ONNXEmbeddingService = require('../api/server/services/RAG/ONNXEmbeddingService');
    const embeddingService = new ONNXEmbeddingService();
    await embeddingService.initialize();
    const embedding = await embeddingService.embedText('测试文本');
    const actualDim = embedding.length;
    
    console.log(`   ✅ ONNX 模型初始化成功，输出维度: ${actualDim}`);
    
    if (actualDim !== embeddingDim) {
      issues.push(`维度不匹配: 模型输出 ${actualDim}，环境变量 ${embeddingDim}`);
      console.log(`   ❌ 维度不匹配: 模型 ${actualDim} vs 环境变量 ${embeddingDim}`);
      console.log(`   💡 设置 EMBEDDING_DIMENSION=${actualDim}`);
    } else {
      console.log(`   ✅ 维度匹配 (${embeddingDim})`);
    }
  } catch (error) {
    issues.push(`ONNX 模型初始化失败: ${error.message}`);
    console.log(`   ❌ ONNX 模型初始化失败: ${error.message}`);
    
    if (error.message.includes('not found')) {
      console.log('   💡 请确保模型文件存在于 api/server/services/RAG/onnx/embedding/resources/');
    } else if (error.message.includes('@xenova/transformers')) {
      console.log('   💡 运行: cd api && npm install @xenova/transformers');
    }
  }

  // 6. 检查文件上传目录
  console.log('\n6️⃣ 检查文件上传配置...');
  const uploadDirs = [
    path.join(__dirname, '../api/uploads'),
    path.join(__dirname, '../uploads'),
    '/tmp',
  ];
  
  let uploadDirExists = false;
  for (const dir of uploadDirs) {
    if (fs.existsSync(dir)) {
      const stats = fs.statSync(dir);
      if (stats.isDirectory()) {
        const writable = fs.accessSync ? (() => {
          try {
            fs.accessSync(dir, fs.constants.W_OK);
            return true;
          } catch {
            return false;
          }
        })() : true;
        
        if (writable) {
          console.log(`   ✅ 上传目录可写: ${dir}`);
          uploadDirExists = true;
          break;
        }
      }
    }
  }
  
  if (!uploadDirExists) {
    warnings.push('未找到可写的上传目录');
    console.log('   ⚠️  未找到可写的上传目录');
  }

  // 总结
  console.log('\n' + '='.repeat(50));
  if (issues.length === 0 && warnings.length === 0) {
    console.log('✅ 所有检查通过！文件上传应该可以正常工作。');
    console.log('\n如果仍然出现 500 错误，请：');
    console.log('1. 查看后端控制台的详细错误日志');
    console.log('2. 检查浏览器 Network 标签中的响应内容');
    console.log('3. 确保上传的文件是 UTF-8 编码的文本文件');
    process.exit(0);
  } else {
    if (issues.length > 0) {
      console.log('❌ 发现以下问题:');
      issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
    }
    if (warnings.length > 0) {
      console.log('\n⚠️  警告:');
      warnings.forEach((warn, i) => console.log(`   ${i + 1}. ${warn}`));
    }
    console.log('\n💡 请根据上述信息修复问题后重试。');
    process.exit(1);
  }
}

diagnose().catch(error => {
  console.error('❌ 诊断过程出错:', error);
  console.error(error.stack);
  process.exit(1);
});

