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

function extractQuestions(content) {
    const patterns = [
        /([^。！？]*\?[^。！？]*)$/,
        /([^。！？]*[吗呢吧])[^。！？]*[？?]/,
        /你认为([^。！？]*)/,
        /什么是([^。！？]*)/,
        /如何([^。！？]*)/,
        /为什么([^。！？]*)/
    ];
    
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
    const responses = [];
    const duplicateCount = {};
    const personaTrack = {};
    let depthScore = 0;
    
    for (const msg of messages) {
        if (msg.role === 'assistant') {
            const question = extractQuestions(msg.content);
            if (question) {
                questions.push({ persona: msg.personaName, question, timestamp: msg.timestamp });
                
                const qKey = question.toLowerCase().replace(/\s+/g, '');
                duplicateCount[qKey] = (duplicateCount[qKey] || 0) + 1;
            }
            
            responses.push({ 
                persona: msg.personaName, 
                content: msg.content,
                hasReasoning: msg.content.includes('因为') || msg.content.includes('所以') || 
                            msg.content.includes('导致') || msg.content.includes('需要') ||
                            msg.content.includes('应该') || msg.content.includes('风险'),
                hasDepth: msg.content.includes('核心') || msg.content.includes('根本') ||
                          msg.content.includes('关键') || msg.content.includes('本质')
            });

            if (!personaTrack[msg.personaName]) {
                personaTrack[msg.personaName] = [];
            }
            personaTrack[msg.personaName].push(msg.content);
            
            if (responses[responses.length - 1].hasReasoning) depthScore++;
            if (responses[responses.length - 1].hasDepth) depthScore += 2;
        }
    }

    const duplicateQuestions = Object.values(duplicateCount).filter(v => v > 1).reduce((a, b) => a + (b - 1), 0);
    const uniqueQuestions = questions.length - duplicateQuestions;
    
    const personaConsistency = {};
    for (const [persona, contents] of Object.entries(personaTrack)) {
        const contentLengths = contents.map(c => c.length);
        const avgLength = contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length;
        personaConsistency[persona] = {
            messageCount: contents.length,
            avgLength: Math.round(avgLength)
        };
    }
    
    return {
        totalQuestions: questions.length,
        duplicateQuestions,
        uniqueQuestions,
        responsesWithReasoning: responses.filter(r => r.hasReasoning).length,
        responsesWithDepth: responses.filter(r => r.hasDepth).length,
        totalResponses: responses.length,
        depthScore,
        personaConsistency,
        questions,
        responses
    };
}

async function main() {
    console.log('=== 测试对话深度和去重效果（V2） ===\n');
    
    const group = await createGroup('测试群V2', [
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
                console.log(`${msg.personaName}: ${msg.content.slice(0, 150)}${msg.content.length > 150 ? '...' : ''}`);
            }
            
            if (result.errors && result.errors.length > 0) {
                console.log('错误:', result.errors);
            }
        } catch (error) {
            console.error(`第 ${round} 轮失败:`, error.message);
        }
        
        await new Promise(r => setTimeout(r, 4000));
    }
    
    console.log('\n=== 分析结果 ===');
    const allMessages = await getGroupMessages(group.id);
    const analysis = analyzeDialogue(allMessages.messages);
    
    console.log(`\n📊 核心指标:`);
    console.log(`   总问题数: ${analysis.totalQuestions}`);
    console.log(`   重复问题数: ${analysis.duplicateQuestions}`);
    console.log(`   唯一问题数: ${analysis.uniqueQuestions}`);
    console.log(`   问题重复率: ${((analysis.duplicateQuestions / Math.max(analysis.totalQuestions, 1)) * 100).toFixed(1)}%`);
    
    console.log(`\n📈 深度指标:`);
    console.log(`   含推理的回应: ${analysis.responsesWithReasoning}/${analysis.totalResponses}`);
    console.log(`   含深度分析的回应: ${analysis.responsesWithDepth}/${analysis.totalResponses}`);
    console.log(`   深度得分: ${analysis.depthScore}`);
    
    console.log(`\n👤 人物一致性:`);
    for (const [persona, stats] of Object.entries(analysis.personaConsistency)) {
        console.log(`   ${persona}: ${stats.messageCount} 条消息, 平均长度 ${stats.avgLength} 字`);
    }
    
    console.log(`\n❓ 所有问题列表:`);
    for (const q of analysis.questions) {
        console.log(`   ${q.persona}: ${q.question}`);
    }
    
    const hasDuplicates = analysis.duplicateQuestions > 0;
    const hasGoodDepth = analysis.depthScore > analysis.totalResponses;
    
    console.log(`\n✅ 评估结果:`);
    if (!hasDuplicates && hasGoodDepth) {
        console.log('   ✓ 去重效果优秀');
        console.log('   ✓ 讨论深度充足');
        console.log('   ✓ 测试通过！');
    } else {
        console.log('   ' + (hasDuplicates ? '✗ 存在重复问题' : '✓ 去重效果良好'));
        console.log('   ' + (hasGoodDepth ? '✓ 讨论深度充足' : '✗ 讨论深度不足'));
        console.log('   需要进一步优化');
    }
}

main().catch(console.error);
