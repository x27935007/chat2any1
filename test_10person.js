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

async function sendMessage(groupId, content, mode = '指定轮次', rounds = 5) {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups/${groupId}/messages`, { content, mode, rounds });
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        throw error;
    }
}

function extractQuestions(content) {
    const patterns = [/([^。！？]*\?[^。！？]*)$/, /([^。！？]*[吗呢吧])[^。！？]*[？?]/];
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].length > 5) {
            return match[1].trim() + '？';
        }
    }
    return null;
}

function analyzeDialogue(messages) {
    const questions = [];
    const duplicateCount = {};
    let depthScore = 0;
    const personaMessages = {};

    for (const msg of messages) {
        if (msg.role === 'assistant') {
            if (!personaMessages[msg.personaName]) {
                personaMessages[msg.personaName] = [];
            }
            personaMessages[msg.personaName].push(msg.content);

            const question = extractQuestions(msg.content);
            if (question) {
                questions.push({ persona: msg.personaName, question });
                const qKey = question.toLowerCase().replace(/\s+/g, '');
                duplicateCount[qKey] = (duplicateCount[qKey] || 0) + 1;
            }

            const hasReasoning = msg.content.includes('因为') || msg.content.includes('所以') || 
                               msg.content.includes('导致') || msg.content.includes('需要');
            const hasDepth = msg.content.includes('核心') || msg.content.includes('根本') ||
                            msg.content.includes('关键');

            if (hasReasoning) depthScore++;
            if (hasDepth) depthScore += 2;
        }
    }

    const duplicateQuestions = Object.values(duplicateCount).filter(v => v > 1).reduce((a, b) => a + (b - 1), 0);
    
    return {
        totalQuestions: questions.length,
        duplicateQuestions,
        depthScore,
        questions,
        personaCount: Object.keys(personaMessages).length,
        personaMessageCounts: Object.fromEntries(
            Object.entries(personaMessages).map(([name, msgs]) => [name, msgs.length])
        )
    };
}

async function main() {
    console.log('=== 10人大型群聊测试 ===\n');

    const allPersonas = [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective',
        'cengming-perspective',
        'leijun-perspective',
        'paul-graham-perspective',
        'naval-perspective',
        'munger-perspective',
        'feynman-perspective',
        'steve-jobs-perspective'
    ];

    const group = await createGroup('10人大型群聊', allPersonas);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);
    console.log(`参与者: ${group.personaNames.join(', ')}\n`);

    // 只在第一轮发送初始prompt，后续轮次让系统自动继续
    const initialPrompt = '每个人先介绍自己，然后给下一位提出一个问题，下一位回答上一位的问题并继续追问，以此类推进行深入讨论';
    
    let allMessages = [];
    
    // 第一轮：发送初始prompt，10人各发一次言
    console.log(`\n=== 第 1 轮 ===`);
    const result1 = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
    for (const msg of result1.messages) {
        console.log(`${msg.personaName}: ${msg.content.slice(0, 120)}${msg.content.length > 120 ? '...' : ''}`);
        allMessages.push(msg);
    }
    await new Promise(r => setTimeout(r, 5000));

    // 后续轮次：不发送新消息，让系统继续链式讨论
    for (let round = 2; round <= 5; round++) {
        console.log(`\n=== 第 ${round} 轮 ===`);
        // 使用空消息或继续消息触发链式讨论
        const result = await sendMessage(group.id, '继续讨论', '指定轮次', 1);
        for (const msg of result.messages) {
            console.log(`${msg.personaName}: ${msg.content.slice(0, 120)}${msg.content.length > 120 ? '...' : ''}`);
            allMessages.push(msg);
        }
        await new Promise(r => setTimeout(r, 5000));
    }

    console.log('\n=== 分析结果 ===');
    const analysis = analyzeDialogue(allMessages);
    
    console.log(`总消息数: ${allMessages.filter(m => m.role === 'assistant').length}`);
    console.log(`参与人数: ${analysis.personaCount}`);
    console.log(`每人平均发言: ${(allMessages.filter(m => m.role === 'assistant').length / analysis.personaCount).toFixed(1)} 次`);
    console.log(`总问题数: ${analysis.totalQuestions}`);
    console.log(`重复问题数: ${analysis.duplicateQuestions}`);
    console.log(`深度得分: ${analysis.depthScore}`);
    
    console.log('\n每人发言次数:');
    for (const [name, count] of Object.entries(analysis.personaMessageCounts)) {
        console.log(`  - ${name}: ${count} 次`);
    }

    const hasDuplicates = analysis.duplicateQuestions > 0;
    const hasGoodDepth = analysis.depthScore > allMessages.length;

    console.log(`\n✅ 评估结果:`);
    console.log(`   ${hasDuplicates ? '✗ 存在重复' : '✓ 去重效果优秀'}`);
    console.log(`   ${hasGoodDepth ? '✓ 讨论深度充足' : '✗ 讨论深度不足'}`);
    
    if (!hasDuplicates && hasGoodDepth) {
        console.log(`\n🎉 所有测试通过！`);
    }
}

main().catch(console.error);
