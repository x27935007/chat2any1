const axios = require('axios');

const BASE_URL = 'http://localhost:3099';

async function createGroup(name, personas) {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups`, {
            name,
            personas
        });
        return response.data;
    } catch (error) {
        console.error('Error creating group:', error.response?.data || error.message);
        throw error;
    }
}

async function sendMessage(groupId, content, mode = '指定轮次', rounds = 5) {
    try {
        const response = await axios.post(`${BASE_URL}/api/groups/${groupId}/messages`, {
            content,
            mode,
            rounds
        });
        return response.data;
    } catch (error) {
        console.error('Error sending message:', error.response?.data || error.message);
        throw error;
    }
}

async function getGroupMessages(groupId) {
    try {
        const response = await axios.get(`${BASE_URL}/api/groups/${groupId}/messages`);
        return response.data;
    } catch (error) {
        console.error('Error getting messages:', error.response?.data || error.message);
        throw error;
    }
}

function analyzeDialogue(messages) {
    const questions = [];
    const responses = [];
    const duplicateCount = {};
    let depthChanges = 0;
    let previousDepth = 0;

    for (const msg of messages) {
        if (msg.role === 'assistant') {
            const qMatch = msg.content.match(/([^。！？]*\?[^。！？]*)$/);
            if (qMatch) {
                const question = qMatch[1].trim();
                questions.push({ persona: msg.personaName, question });
                
                const qKey = question.toLowerCase().replace(/\s+/g, '');
                duplicateCount[qKey] = (duplicateCount[qKey] || 0) + 1;
            }
            
            responses.push({ 
                persona: msg.personaName, 
                content: msg.content,
                hasReasoning: msg.content.includes('因为') || msg.content.includes('所以') || 
                            msg.content.includes('导致') || msg.content.includes('需要')
            });

            if (msg.content.includes('因为') || msg.content.includes('所以')) {
                depthChanges++;
            }
        }
    }

    const duplicateQuestions = Object.values(duplicateCount).filter(v => v > 1).length;
    
    return {
        totalQuestions: questions.length,
        duplicateQuestions,
        uniqueQuestions: questions.length - duplicateQuestions,
        responsesWithReasoning: responses.filter(r => r.hasReasoning).length,
        totalResponses: responses.length,
        depthChanges,
        questions,
        responses
    };
}

async function main() {
    console.log('=== 测试对话深度和去重效果 ===\n');
    
    const group = await createGroup('测试群', [
        'andrej-karpathy-perspective',
        'ilya-sutskever-perspective',
        'elon-musk-perspective'
    ]);
    console.log(`创建群组: ${group.name} (ID: ${group.id})`);
    
    const initialPrompt = '说出自己的名字，并给下一位出一个问题，下一位应该回答上一位的问题，并追问下一位，以此类推';
    
    console.log('\n=== 开始5轮对话 ===');
    for (let round = 1; round <= 5; round++) {
        console.log(`\n--- 第 ${round} 轮 ---`);
        try {
            const result = await sendMessage(group.id, initialPrompt, '指定轮次', 1);
            
            for (const msg of result.messages) {
                console.log(`${msg.personaName}: ${msg.content.slice(0, 100)}...`);
            }
            
            if (result.errors && result.errors.length > 0) {
                console.log('错误:', result.errors);
            }
        } catch (error) {
            console.error(`第 ${round} 轮失败:`, error.message);
        }
        
        await new Promise(r => setTimeout(r, 3000));
    }
    
    console.log('\n=== 分析结果 ===');
    const allMessages = await getGroupMessages(group.id);
    const analysis = analyzeDialogue(allMessages.messages);
    
    console.log(`总问题数: ${analysis.totalQuestions}`);
    console.log(`重复问题数: ${analysis.duplicateQuestions}`);
    console.log(`唯一问题数: ${analysis.uniqueQuestions}`);
    console.log(`含推理的回应: ${analysis.responsesWithReasoning}/${analysis.totalResponses}`);
    console.log(`深度变化次数: ${analysis.depthChanges}`);
    
    console.log('\n=== 所有问题列表 ===');
    for (const q of analysis.questions) {
        console.log(`${q.persona}: ${q.question}`);
    }
}

main().catch(console.error);
