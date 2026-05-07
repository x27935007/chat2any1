const axios = require('axios');

const BASE_URL = 'http://localhost:3098';

async function testSingleChat() {
    console.log('=== 单人对话API测试 ===\n');
    
    try {
        const response = await axios.post(`${BASE_URL}/api/chat`, {
            personaId: 'andrej-karpathy-perspective',
            question: '你认为大语言模型的未来发展方向是什么？',
            history: []
        });
        
        console.log('✅ API调用成功！');
        console.log('响应内容:');
        console.log(response.data.response);
        console.log('\n=== 测试完成 ===');
        
    } catch (error) {
        console.log('❌ API调用失败！');
        console.log('错误信息:', error.response?.data || error.message);
        console.log('\n=== 测试完成 ===');
    }
}

testSingleChat();