#!/usr/bin/env node

/**
 * 获取JWT Token的辅助脚本
 * 使用方法：
 *   node scripts/get-jwt-token.js <email> <password>
 * 或者设置环境变量：
 *   EMAIL=your_email PASSWORD=your_password node scripts/get-jwt-token.js
 */

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:1145';
const EMAIL = process.argv[2] || process.env.EMAIL;
const PASSWORD = process.argv[3] || process.env.PASSWORD;

async function getJWTToken() {
  if (!EMAIL || !PASSWORD) {
    console.error('❌ 错误: 需要提供邮箱和密码');
    console.log('\n使用方法:');
    console.log('  方法1: node scripts/get-jwt-token.js <email> <password>');
    console.log('  方法2: EMAIL=your_email PASSWORD=your_password node scripts/get-jwt-token.js');
    console.log('\n示例:');
    console.log('  node scripts/get-jwt-token.js user@example.com password123');
    process.exit(1);
  }

  try {
    console.log(`正在登录 ${BASE_URL}...`);
    console.log(`邮箱: ${EMAIL}`);
    
    const response = await axios.post(
      `${BASE_URL}/api/auth/login`,
      {
        email: EMAIL,
        password: PASSWORD,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.token) {
      console.log('\n✅ 登录成功！');
      console.log('\n你的JWT Token:');
      console.log('─'.repeat(80));
      console.log(response.data.token);
      console.log('─'.repeat(80));
      
      console.log('\n📋 使用方法:');
      console.log('1. 复制上面的token');
      console.log('2. 运行验证脚本:');
      console.log(`   export JWT_TOKEN="${response.data.token}"`);
      console.log('   node scripts/validate-rag-service.js');
      console.log('\n或者一次性运行:');
      console.log(`   JWT_TOKEN="${response.data.token}" node scripts/validate-rag-service.js`);
      
      // 保存到环境变量文件（可选）
      console.log('\n💡 提示: 你也可以将token保存到.env文件:');
      console.log(`   echo 'JWT_TOKEN=${response.data.token}' >> .env`);
      
      return response.data.token;
    } else {
      console.error('❌ 登录响应中没有token');
      if (response.data.twoFAPending) {
        console.log('⚠️  该账户启用了双因素认证，需要额外的验证步骤');
      }
      process.exit(1);
    }
  } catch (error) {
    if (error.response) {
      console.error('❌ 登录失败:');
      console.error(`   状态码: ${error.response.status}`);
      console.error(`   错误信息: ${error.response.data?.message || JSON.stringify(error.response.data)}`);
      
      if (error.response.status === 401) {
        console.error('\n💡 可能的原因:');
        console.error('   - 邮箱或密码错误');
        console.error('   - 账户被禁用');
      }
    } else {
      console.error('❌ 网络错误:', error.message);
      console.error('\n💡 请检查:');
      console.error('   - API服务是否正在运行');
      console.error('   - API_URL是否正确（当前:', BASE_URL, ')');
    }
    process.exit(1);
  }
}

if (require.main === module) {
  getJWTToken();
}

module.exports = { getJWTToken };

