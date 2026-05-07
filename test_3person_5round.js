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
    console.log('=== 3人5轮深度讨论测试 ===\n');

    const personas = [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective'
    ];

    const group = await createGroup('3人深度讨论群', personas);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);
    console.log(`参与者: ${group.personaNames.join(', ')}\n`);

    const initialPrompt = '讨论主题：AGI的发展路径与技术挑战。每人先介绍自己，然后深入讨论AGI实现的关键障碍和突破方向。';
    
    let allMessages = [];
    
    // 第1轮
    console.log(`=== 第 1 轮 ===`);
    const result1 = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
    for (const msg of result1.messages) {
        console.log(`${msg.personaName}: ${msg.content.slice(0, 180)}${msg.content.length > 180 ? '...' : ''}`);
        allMessages.push(msg);
    }
    await new Promise(r => setTimeout(r, 2000));

    // 第2-5轮
    for (let round = 2; round <= 5; round++) {
        console.log(`\n=== 第 ${round} 轮 ===`);
        const result = await sendMessage(group.id, '继续深入讨论，推进话题深度', '指定轮次', 1);
        for (const msg of result.messages) {
            console.log(`${msg.personaName}: ${msg.content.slice(0, 180)}${msg.content.length > 180 ? '...' : ''}`);
            allMessages.push(msg);
        }
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('\n=== 测试完成 ===');
    console.log(`总计发言: ${allMessages.length} 条`);
    console.log(`✅ 3人5轮对话测试完成！`);
}

main().catch(console.error);