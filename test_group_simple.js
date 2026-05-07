const axios = require('axios');

const BASE_URL = 'http://localhost:3098';

async function createGroup(name, personas) {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups`, { name, personas });
        return response.data;
    } catch (error) {
        console.error('Error creating group:', error.response?.data || error.message);
        throw error;
    }
}

async function sendMessage(groupId, content, mode = '指定轮次', rounds = 1) {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups/${groupId}/messages`, { content, mode, rounds });
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        throw error;
    }
}

async function main() {
    console.log('=== 群聊功能测试 (3人 x 2轮) ===\n');

    const personas = [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective'
    ];

    const group = await createGroup('测试群', personas);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);
    console.log(`参与者: ${group.personaNames.join(', ')}\n`);

    const initialPrompt = '每个人先介绍自己，然后给下一位提出一个问题';
    
    // 第1轮
    console.log(`=== 第 1 轮 ===`);
    const result1 = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
    for (const msg of result1.messages) {
        console.log(`${msg.personaName}: ${msg.content.slice(0, 150)}${msg.content.length > 150 ? '...' : ''}`);
    }

    await new Promise(r => setTimeout(r, 2000));

    // 第2轮
    console.log(`\n=== 第 2 轮 ===`);
    const result2 = await sendMessage(group.id, '继续讨论', '指定轮次', 1);
    for (const msg of result2.messages) {
        console.log(`${msg.personaName}: ${msg.content.slice(0, 150)}${msg.content.length > 150 ? '...' : ''}`);
    }

    console.log('\n=== 测试完成 ===');
    console.log(`总计发言: ${result1.messages.length + result2.messages.length} 条`);
    console.log(`✅ 群聊功能测试通过！`);
}

main().catch(console.error);