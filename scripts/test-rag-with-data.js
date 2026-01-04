#!/usr/bin/env node

/**
 * RAG服务完整测试脚本
 * 功能：
 * 1. 添加测试数据（语义模型、QA对、同义词、业务知识）
 * 2. 运行验证测试
 * 3. 自动清理测试数据
 */

const axios = require('axios');
// 直接导入RAGValidator类，因为validate-rag-service.js导出的是类
const RAGValidator = require('./validate-rag-service');

const BASE_URL = process.env.API_URL || 'http://localhost:1145';
const TOKEN = process.env.JWT_TOKEN || 'your_jwt_token';

// 测试数据标记前缀，用于识别和清理
const TEST_DATA_PREFIX = '__TEST_RAG_';

class RAGTestWithData {
  constructor() {
    this.baseUrl = BASE_URL;
    this.token = TOKEN;
    this.createdEntryIds = []; // 记录创建的条目ID，用于清理
  }

  /**
   * 添加知识条目
   */
  async addKnowledge(type, data) {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/rag/knowledge`,
        { type, data },
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.success && response.data.data?._id) {
        this.createdEntryIds.push(response.data.data._id);
        return response.data.data;
      }
      return response.data;
    } catch (error) {
      console.error(`添加${type}失败:`, error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * 删除知识条目
   */
  async deleteKnowledge(entryId) {
    try {
      const response = await axios.delete(
        `${this.baseUrl}/api/rag/knowledge/${entryId}`,
        {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        }
      );
      return response.data.success;
    } catch (error) {
      console.error(`删除知识条目失败 (${entryId}):`, error.response?.data || error.message);
      return false;
    }
  }

  /**
   * 创建测试数据
   */
  async createTestData() {
    console.log('\n📝 开始创建测试数据...\n');

    const testData = [];

    // 1. 语义模型测试数据
    console.log('1. 添加语义模型测试数据...');
    try {
      const semanticModel = await this.addKnowledge('semantic_model', {
        semanticModelId: `${TEST_DATA_PREFIX}semantic_model_001`,
        databaseName: 'test_db',
        tableName: 'orders',
        content: JSON.stringify({
          database: 'test_db',
          table: 'orders',
          fields: [
            { name: 'order_id', type: 'int', description: '订单ID' },
            { name: 'customer_id', type: 'int', description: '客户ID' },
            { name: 'amount', type: 'decimal', description: '订单金额' },
            { name: 'order_date', type: 'date', description: '订单日期' },
          ],
          dimensions: ['order_id', 'customer_id'],
          measures: ['amount'],
        }),
        entityId: `${TEST_DATA_PREFIX}entity_001`,
        isDatabaseLevel: false,
      });
      testData.push({ type: 'semantic_model', id: semanticModel._id });
      console.log('   ✅ 语义模型添加成功');
    } catch (error) {
      console.log('   ❌ 语义模型添加失败:', error.message);
    }

    // 2. QA对测试数据
    console.log('2. 添加QA对测试数据...');
    try {
      const qaPairs = [
        {
          question: '如何查询订单数据？',
          answer: '可以使用SELECT语句从orders表中查询订单数据，例如：SELECT * FROM orders WHERE customer_id = ?',
          entityId: `${TEST_DATA_PREFIX}entity_001`,
        },
        {
          question: '订单查询方法有哪些？',
          answer: '订单查询可以通过以下方式：1. 按订单ID查询 2. 按客户ID查询 3. 按日期范围查询',
          entityId: `${TEST_DATA_PREFIX}entity_001`,
        },
        {
          question: '如何统计订单金额？',
          answer: '使用SUM函数统计订单金额：SELECT SUM(amount) FROM orders WHERE order_date >= ?',
          entityId: `${TEST_DATA_PREFIX}entity_001`,
        },
      ];

      for (const qa of qaPairs) {
        const qaEntry = await this.addKnowledge('qa_pair', qa);
        testData.push({ type: 'qa_pair', id: qaEntry._id });
      }
      console.log(`   ✅ ${qaPairs.length}个QA对添加成功`);
    } catch (error) {
      console.log('   ❌ QA对添加失败:', error.message);
    }

    // 3. 同义词测试数据（如果已存在，跳过）
    console.log('3. 检查同义词测试数据...');
    // 同义词可能已存在，不强制添加

    // 4. 业务知识测试数据
    console.log('4. 添加业务知识测试数据...');
    try {
      const businessKnowledge = [
        {
          title: '销售流程规范',
          content: '销售流程包括以下步骤：1. 客户咨询 2. 需求分析 3. 方案制定 4. 报价 5. 合同签署 6. 订单执行 7. 售后服务',
          category: '流程规范',
          tags: ['销售', '流程', '规范'],
          entityId: `${TEST_DATA_PREFIX}entity_001`,
        },
        {
          title: '订单处理流程',
          content: '订单处理流程：1. 接收订单 2. 验证库存 3. 确认支付 4. 安排发货 5. 物流跟踪 6. 订单完成',
          category: '流程规范',
          tags: ['订单', '流程', '处理'],
          entityId: `${TEST_DATA_PREFIX}entity_001`,
        },
      ];

      for (const bk of businessKnowledge) {
        const bkEntry = await this.addKnowledge('business_knowledge', bk);
        testData.push({ type: 'business_knowledge', id: bkEntry._id });
      }
      console.log(`   ✅ ${businessKnowledge.length}条业务知识添加成功`);
    } catch (error) {
      console.log('   ❌ 业务知识添加失败:', error.message);
    }

    console.log('\n✅ 测试数据创建完成！');
    console.log(`   共创建 ${testData.length} 条测试数据\n`);

    // 等待向量化完成（给系统一些时间处理）
    console.log('⏳ 等待向量化完成（3秒）...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    return testData;
  }

  /**
   * 清理测试数据
   */
  async cleanupTestData() {
    console.log('\n🧹 开始清理测试数据...\n');

    if (this.createdEntryIds.length === 0) {
      console.log('   没有需要清理的测试数据');
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const entryId of this.createdEntryIds) {
      const success = await this.deleteKnowledge(entryId);
      if (success) {
        successCount++;
        console.log(`   ✅ 已删除: ${entryId}`);
      } else {
        failCount++;
        console.log(`   ❌ 删除失败: ${entryId}`);
      }
    }

    console.log(`\n✅ 清理完成: 成功 ${successCount} 条, 失败 ${failCount} 条`);
    this.createdEntryIds = [];
  }

  /**
   * 运行完整测试流程
   */
  async runFullTest() {
    console.log('🚀 RAG服务完整测试（包含测试数据）\n');
    console.log('='.repeat(60));

    let testData = [];
    const validator = new RAGValidator();

    try {
      // 步骤1: 创建测试数据
      testData = await this.createTestData();

      // 步骤2: 运行验证测试
      console.log('\n' + '='.repeat(60));
      console.log('开始运行验证测试...');
      console.log('='.repeat(60));

      await validator.runAllTests();
      validator.printSummary();

      // 步骤3: 保存测试报告
      await validator.saveReport('rag-validation-report.json');

    } catch (error) {
      console.error('\n❌ 测试过程出错:', error);
      throw error;
    } finally {
      // 步骤4: 清理测试数据
      await this.cleanupTestData();
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 完整测试流程结束');
    console.log('='.repeat(60));
  }
}

// 运行测试
async function main() {
  if (TOKEN === 'your_jwt_token') {
    console.error('❌ 错误: 请设置JWT_TOKEN环境变量');
    console.log('\n使用方法:');
    console.log('  JWT_TOKEN=your_token node scripts/test-rag-with-data.js');
    console.log('\n或者先获取token:');
    console.log('  node scripts/get-jwt-token.js your_email your_password');
    process.exit(1);
  }

  const tester = new RAGTestWithData();
  
  try {
    await tester.runFullTest();
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    // 即使测试失败，也尝试清理数据
    try {
      await tester.cleanupTestData();
    } catch (cleanupError) {
      console.error('清理数据时出错:', cleanupError);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = RAGTestWithData;

