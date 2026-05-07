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

async function sendFeedback(groupId, messageId, rating, feedbackType = 'quality', comment = '') {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups/${groupId}/feedback`, {
            messageId,
            rating,
            feedbackType,
            comment
        });
        return response.data;
    } catch (error) {
        console.error('Error sending feedback:', error.response?.data || error.message);
        throw error;
    }
}

async function getParams() {
    try {
        const response = await axios.get(`${BASE_URL}/api/params`);
        return response.data;
    } catch (error) {
        console.error('Error getting params:', error.response?.data || error.message);
        throw error;
    }
}

function extractQuestions(content) {
    const patterns = [/([^。！？]*\?[^。！？]*)$/, /([^。！？]*[吗呢吧])[^。！？]*[？?]/, /你认为([^。！？]*)/, /什么是([^。！？]*)/, /如何([^。！？]*)/, /为什么([^。！？]*)/];
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
    let stateProgress = 0;

    for (const msg of messages) {
        if (msg.role === 'assistant') {
            const question = extractQuestions(msg.content);
            if (question) {
                questions.push({ persona: msg.personaName, question });
                const qKey = question.toLowerCase().replace(/\s+/g, '');
                duplicateCount[qKey] = (duplicateCount[qKey] || 0) + 1;
            }

            const hasReasoning = msg.content.includes('因为') || msg.content.includes('所以') || 
                               msg.content.includes('导致') || msg.content.includes('需要') ||
                               msg.content.includes('应该') || msg.content.includes('风险');
            const hasDepth = msg.content.includes('核心') || msg.content.includes('根本') ||
                            msg.content.includes('关键') || msg.content.includes('本质');

            if (hasReasoning) depthScore++;
            if (hasDepth) depthScore += 2;

            if (msg.content.includes('分析') || msg.content.includes('原因')) stateProgress = Math.max(stateProgress, 1);
            if (msg.content.includes('方案') || msg.content.includes('解决')) stateProgress = Math.max(stateProgress, 2);
            if (msg.content.includes('执行') || msg.content.includes('步骤')) stateProgress = Math.max(stateProgress, 3);
            if (msg.content.includes('总结') || msg.content.includes('反思')) stateProgress = Math.max(stateProgress, 4);
        }
    }

    const duplicateQuestions = Object.values(duplicateCount).filter(v => v > 1).reduce((a, b) => a + (b - 1), 0);
    const uniqueQuestions = questions.length - duplicateQuestions;

    return {
        totalQuestions: questions.length,
        duplicateQuestions,
        uniqueQuestions,
        depthScore,
        stateProgress,
        questions
    };
}

async function main() {
    console.log('=== 完整功能测试 ===\n');

    // 1. 创建群组
    const group = await createGroup('完整测试群', [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective'
    ]);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);

    // 2. 获取初始参数
    const initialParams = await getParams();
    console.log(`\n初始参数:`, initialParams);

    // 3. 发送5轮对话
    const initialPrompt = '说出自己的名字，并给下一位出一个问题，下一位应该回答上一位的问题，并追问下一位，以此类推';
    
    let allMessages = [];
    for (let round = 1; round <= 5; round++) {
        console.log(`\n--- 第 ${round} 轮 ---`);
        const result = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
        
        for (const msg of result.messages) {
            console.log(`${msg.personaName}: ${msg.content.slice(0, 120)}${msg.content.length > 120 ? '...' : ''}`);
            allMessages.push(msg);
        }
        
        await new Promise(r => setTimeout(r, 3000));
    }

    // 4. 分析对话
    console.log('\n=== 对话分析 ===');
    const analysis = analyzeDialogue(allMessages);
    
    console.log(`总问题数: ${analysis.totalQuestions}`);
    console.log(`重复问题数: ${analysis.duplicateQuestions}`);
    console.log(`唯一问题数: ${analysis.uniqueQuestions}`);
    console.log(`深度得分: ${analysis.depthScore}`);
    console.log(`状态进度: ${analysis.stateProgress}/4`);

    // 5. 发送用户反馈
    console.log('\n=== 发送用户反馈 ===');
    const feedbackPromises = [];
    for (let i = 0; i < Math.min(5, allMessages.length); i++) {
        const msg = allMessages[i];
        const rating = Math.floor(Math.random() * 2) + 4; // 4或5分
        feedbackPromises.push(sendFeedback(group.id, msg.id, rating, 'quality', '很好的发言'));
    }
    
    await Promise.all(feedbackPromises);
    console.log('反馈已发送');

    // 6. 检查参数变化
    const finalParams = await getParams();
    console.log(`\n最终参数:`, finalParams);

    // 7. 评估结果
    console.log('\n=== 评估结果 ===');
    const hasDuplicates = analysis.duplicateQuestions > 0;
    const hasGoodDepth = analysis.depthScore > allMessages.length;
    const hasProgress = analysis.stateProgress >= 2;

    console.log(`去重效果: ${hasDuplicates ? '✗ 存在重复' : '✓ 无重复'}`);
    console.log(`讨论深度: ${hasGoodDepth ? '✓ 深度充足' : '✗ 深度不足'}`);
    console.log(`状态推进: ${hasProgress ? '✓ 有进展' : '✗ 无进展'}`);
    
    if (!hasDuplicates && hasGoodDepth && hasProgress) {
        console.log('\n✅ 所有测试通过！');
    } else {
        console.log('\n⚠️ 部分测试未通过，需要优化');
    }
}

main().catch(console.error);
