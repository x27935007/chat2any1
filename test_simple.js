const axios = require('axios');

const BASE_URL = 'http://localhost:3099';

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

    for (const msg of messages) {
        if (msg.role === 'assistant') {
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
        questions
    };
}

async function main() {
    console.log('=== 简化功能测试 ===\n');

    const group = await createGroup('简化测试群', [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective'
    ]);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);

    const initialPrompt = '说出自己的名字，并给下一位出一个问题，下一位应该回答上一位的问题，并追问下一位，以此类推';
    
    let allMessages = [];
    for (let round = 1; round <= 5; round++) {
        console.log(`\n--- 第 ${round} 轮 ---`);
        const result = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
        
        for (const msg of result.messages) {
            console.log(`${msg.personaName}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
            allMessages.push(msg);
        }
        
        await new Promise(r => setTimeout(r, 3000));
    }

    console.log('\n=== 分析结果 ===');
    const analysis = analyzeDialogue(allMessages);
    
    console.log(`总问题数: ${analysis.totalQuestions}`);
    console.log(`重复问题数: ${analysis.duplicateQuestions}`);
    console.log(`深度得分: ${analysis.depthScore}`);

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
