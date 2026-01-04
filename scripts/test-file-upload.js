#!/usr/bin/env node

/**
 * 测试文件上传功能
 * 模拟文件上传流程，帮助定位问题
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function testFileUpload() {
  console.log('🧪 测试文件上传功能...\n');

  // 创建测试文件
  const testContent = '这是一个测试文件内容。\n用于测试文件上传和向量化功能。\n包含多行文本以便测试分块功能。';
  const testFilePath = path.join(__dirname, '../test-upload.txt');
  
  try {
    fs.writeFileSync(testFilePath, testContent, 'utf8');
    console.log(`✅ 创建测试文件: ${testFilePath}`);

    // 模拟文件对象
    const mockFile = {
      path: testFilePath,
      originalname: 'test-upload.txt',
      mimetype: 'text/plain',
      size: fs.statSync(testFilePath).size,
    };

    console.log(`📄 文件信息: ${mockFile.originalname} (${mockFile.size} 字节)`);

    // 测试文件读取（模拟 parseTextNative）
    console.log('\n1️⃣ 测试文件解析...');
    try {
      // 直接使用 Node.js fs 模块测试文件读取
      const fileContent = fs.readFileSync(mockFile.path, 'utf8');
      const bytes = Buffer.byteLength(fileContent, 'utf8');
      console.log(`   ✅ 文件读取成功: ${bytes} 字节`);
      console.log(`   📝 内容预览: ${fileContent.substring(0, 50)}...`);
      
      if (!fileContent || fileContent.trim().length === 0) {
        throw new Error('文件内容为空');
      }
    } catch (error) {
      console.log(`   ❌ 文件读取失败: ${error.message}`);
      if (error.code === 'ENOENT') {
        console.log(`   💡 文件不存在: ${mockFile.path}`);
      } else if (error.code === 'EACCES') {
        console.log(`   💡 文件无读取权限: ${mockFile.path}`);
      }
      throw error;
    }

    // 测试文本分块（直接测试逻辑）
    console.log('\n2️⃣ 测试文本分块逻辑...');
    try {
      const fileContent = fs.readFileSync(testFilePath, 'utf8');
      // 简单的分块测试
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < fileContent.length; i += chunkSize) {
        chunks.push(fileContent.slice(i, i + chunkSize));
      }
      console.log(`   ✅ 分块逻辑正常: ${chunks.length} 个块`);
      console.log(`   📊 块大小示例: ${chunks[0]?.length || 0} 字符`);
    } catch (error) {
      console.log(`   ❌ 分块测试失败: ${error.message}`);
    }

    // 测试 ONNX 模型
    console.log('\n3️⃣ 测试 ONNX 模型...');
    try {
      const ONNXEmbeddingService = require('../api/server/services/RAG/ONNXEmbeddingService');
      const embeddingService = new ONNXEmbeddingService();
      console.log('   ⏳ 初始化 ONNX 模型（首次运行可能需要下载模型）...');
      await embeddingService.initialize();
      console.log('   ⏳ 生成向量...');
      const embedding = await embeddingService.embedText('测试文本');
      console.log(`   ✅ ONNX 模型测试成功，输出维度: ${embedding.length}`);
      
      // 验证向量格式
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error('向量格式错误：应为非空数组');
      }
      if (!embedding.every(v => typeof v === 'number')) {
        throw new Error('向量格式错误：所有元素应为数字');
      }
      console.log(`   ✅ 向量格式验证通过`);
    } catch (error) {
      console.log(`   ❌ ONNX 模型测试失败: ${error.message}`);
      if (error.message.includes('not found') || error.message.includes('Cannot find')) {
        console.log('   💡 请确保 ONNX 模型文件存在于 api/server/services/RAG/onnx/embedding/resources/');
      } else if (error.message.includes('@xenova/transformers')) {
        console.log('   💡 运行: cd api && npm install @xenova/transformers');
      }
      throw error;
    }

    // 测试数据库连接
    console.log('\n4️⃣ 测试数据库连接...');
    try {
      const VectorDBService = require('../api/server/services/RAG/VectorDBService');
      const vectorDB = new VectorDBService();
      await vectorDB.initialize();
      const pool = vectorDB.getPool();
      
      // 测试查询
      const result = await pool.query('SELECT 1 as test');
      console.log(`   ✅ 数据库连接成功`);
      
      // 检查表
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'file_vectors'
        ) as exists
      `);
      console.log(`   📊 file_vectors 表存在: ${tableCheck.rows[0].exists}`);
      
      await pool.end();
    } catch (error) {
      console.log(`   ❌ 数据库连接失败: ${error.message}`);
      throw error;
    }

    console.log('\n✅ 所有测试通过！');
    console.log('\n💡 如果实际文件上传仍然失败，请：');
    console.log('   1. 查看后端控制台的详细日志');
    console.log('   2. 检查浏览器 Network 标签中的错误响应');
    console.log('   3. 确保文件上传时 req.user.id 存在');

  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    // 清理测试文件
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log(`\n🧹 已清理测试文件`);
    }
  }
}

testFileUpload();

