const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { EventEmitter } = require('events');
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3098;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY || 'sk-523abe216d5840438177d9a355570639';
const DASHSCOPE_BASE = 'dashscope.aliyuncs.com';
const EXAMPLES_DIR = './nuwa-skill/examples';
const REFERENCES_DIR = './nuwa-skill/references';
const DATA_DIR = path.join(__dirname, 'data/groups');

// 确保数据目录存在
fs.mkdirSync(DATA_DIR, { recursive: true });

// ============ 对话状态机引擎 ============
class DialogueStateMachine {
    constructor() {
        this.states = {
            INITIAL: 'initial',
            DEFINING: 'defining',
            ANALYZING: 'analyzing',
            SOLVING: 'solving',
            EXECUTING: 'executing',
            REFLECTING: 'reflecting'
        };

        this.transitions = {
            [this.states.INITIAL]: [this.states.DEFINING],
            [this.states.DEFINING]: [this.states.DEFINING, this.states.ANALYZING],
            [this.states.ANALYZING]: [this.states.ANALYZING, this.states.SOLVING],
            [this.states.SOLVING]: [this.states.SOLVING, this.states.EXECUTING],
            [this.states.EXECUTING]: [this.states.EXECUTING, this.states.REFLECTING],
            [this.states.REFLECTING]: [this.states.REFLECTING, this.states.DEFINING]
        };

        this.currentState = this.states.INITIAL;
        this.stateHistory = [];
    }

    transitionTo(nextState) {
        if (this.transitions[this.currentState].includes(nextState)) {
            this.stateHistory.push({
                from: this.currentState,
                to: nextState,
                timestamp: Date.now()
            });
            this.currentState = nextState;
            return true;
        }
        return false;
    }

    getStatePrompt() {
        const prompts = {
            [this.states.INITIAL]: '请先明确讨论的核心问题',
            [this.states.DEFINING]: '请深入定义问题边界和关键要素',
            [this.states.ANALYZING]: '请分析问题的根本原因和影响因素',
            [this.states.SOLVING]: '请提出具体的解决方案并权衡利弊',
            [this.states.EXECUTING]: '请讨论执行路径、资源需求和风险评估',
            [this.states.REFLECTING]: '请总结讨论成果并反思潜在局限'
        };
        return prompts[this.currentState];
    }

    getStateDescription() {
        const descriptions = {
            [this.states.INITIAL]: '初始状态',
            [this.states.DEFINING]: '定义问题',
            [this.states.ANALYZING]: '分析原因',
            [this.states.SOLVING]: '提出方案',
            [this.states.EXECUTING]: '执行路径',
            [this.states.REFLECTING]: '反思总结'
        };
        return descriptions[this.currentState];
    }

    updateStateBasedOnContent(content) {
        const depthIndicators = {
            defining: ['定义', '什么是', '问题是', '核心是', '主题是', '讨论什么'],
            analyzing: ['因为', '导致', '原因', '影响', '分析', '为什么'],
            solving: ['应该', '需要', '建议', '方案', '解决', '对策'],
            executing: ['执行', '步骤', '资源', '风险', '计划', '实施'],
            reflecting: ['总结', '反思', '回顾', '结论', '总而言之', '综上所述']
        };

        const scores = {};
        for (const [state, indicators] of Object.entries(depthIndicators)) {
            scores[state] = indicators.filter(ind => content.includes(ind)).length;
        }

        const maxState = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);
        if (scores[maxState] > 0) {
            this.transitionTo(maxState.toUpperCase());
        }
    }

    getProgress() {
        const stateOrder = ['initial', 'defining', 'analyzing', 'solving', 'executing', 'reflecting'];
        const currentIndex = stateOrder.indexOf(this.currentState);
        return {
            currentState: this.currentState,
            currentStep: currentIndex + 1,
            totalSteps: stateOrder.length,
            progress: ((currentIndex + 1) / stateOrder.length) * 100
        };
    }
}

// ============ 话题分类器 ============
class TopicClassifier {
    constructor() {
        this.topics = {
            'ai_tech': {
                name: 'AI技术',
                keywords: ['AI', '机器学习', '深度学习', '模型', '神经网络', 'Transformer', 'GPT', '大语言模型', '算法', '架构']
            },
            'ai_safety': {
                name: 'AI安全',
                keywords: ['安全', '风险', '伦理', '对齐', '控制', 'AGI', '超级智能', '失控', '道德']
            },
            'ai_education': {
                name: 'AI教育',
                keywords: ['教育', '学习', '培训', '课程', '能力', '编程', '开发者', '学习方法']
            },
            'industry': {
                name: '产业应用',
                keywords: ['应用', '产业', '商业', '产品', '市场', '企业', '转型', '落地']
            },
            'research': {
                name: '研究方向',
                keywords: ['研究', '方向', '突破', '创新', '未来', '趋势', '挑战']
            }
        };
    }

    classify(content) {
        const scores = {};

        for (const [topicId, topic] of Object.entries(this.topics)) {
            let score = 0;
            for (const keyword of topic.keywords) {
                if (content.includes(keyword)) {
                    score += 2;
                } else if (content.toLowerCase().includes(keyword.toLowerCase())) {
                    score += 1;
                }
            }
            scores[topicId] = score;
        }

        const maxTopic = Object.keys(scores).reduce((a, b) => scores[a] > scores[b] ? a : b);

        return {
            topicId: maxTopic,
            topicName: this.topics[maxTopic].name,
            confidence: scores[maxTopic] / (this.topics[maxTopic].keywords.length * 2)
        };
    }

    getTopicPrompt(topicId) {
        const prompts = {
            'ai_tech': '请从技术角度深入讨论，包括具体算法、架构和实现细节',
            'ai_safety': '请从安全和伦理角度分析，关注风险评估和应对策略',
            'ai_education': '请从教育角度讨论，包括学习方法、课程设计和能力培养',
            'industry': '请从产业应用角度讨论，包括商业模式、市场前景和落地挑战',
            'research': '请从研究角度展望，包括未来方向、潜在突破和开放问题'
        };
        return prompts[topicId] || '';
    }

    getAllTopics() {
        return Object.values(this.topics).map(t => t.name);
    }
}

// ============ 参数调优器 ============
class ParamTuner {
    constructor() {
        this.params = {
            similarityThreshold: 0.5,
            maxRetries: 3,
            minDepthScore: 2,
            responseLengthMin: 50,
            responseLengthMax: 300
        };

        this.feedbackHistory = [];
        this.feedbackThreshold = 10;
    }

    recordFeedback(feedback) {
        this.feedbackHistory.push(feedback);

        if (this.feedbackHistory.length >= this.feedbackThreshold) {
            this.tuneParameters();
            this.feedbackHistory = [];
        }
    }

    tuneParameters() {
        const recentFeedbacks = this.feedbackHistory;
        const avgRating = recentFeedbacks.reduce((sum, f) => sum + f.rating, 0) / recentFeedbacks.length;

        if (avgRating < 3) {
            this.params.similarityThreshold = Math.max(0.3, this.params.similarityThreshold - 0.1);
            this.params.minDepthScore = Math.min(5, this.params.minDepthScore + 1);
            this.params.maxRetries = Math.min(5, this.params.maxRetries + 1);
        } else if (avgRating > 4) {
            this.params.similarityThreshold = Math.min(0.7, this.params.similarityThreshold + 0.05);
            this.params.minDepthScore = Math.max(1, this.params.minDepthScore - 0.5);
        }

        console.log('参数调整完成:', this.params);
    }

    getParams() {
        return { ...this.params };
    }

    resetParams() {
        this.params = {
            similarityThreshold: 0.5,
            maxRetries: 3,
            minDepthScore: 2,
            responseLengthMin: 50,
            responseLengthMax: 300
        };
        this.feedbackHistory = [];
    }
}

// ============ 身份守卫 ============
class IdentityGuard {
    constructor() {
        this.personaNames = new Map();
        this.famousNames = ['Yann LeCun', 'Geoffrey Hinton', 'Sam Altman', 'Marcus', 'Jeff Dean', 'Demis Hassabis', 'Jensen Huang', 'Satya Nadella', 'Bill Gates', 'Mark Zuckerberg', 'Tim Cook', 'Larry Page', 'Sergey Brin', 'Sundar Pichai', 'Jack Ma', 'Ma Huateng'];
    }

    registerPersona(personaId, names) {
        this.personaNames.set(personaId, names);
    }

    detectImpersonation(personaId, content) {
        const allowedNames = this.personaNames.get(personaId) || [personaId];
        const allDisallowedNames = [];

        for (const [pid, names] of this.personaNames.entries()) {
            if (pid !== personaId) {
                allDisallowedNames.push(...names);
            }
        }

        allDisallowedNames.push(...this.famousNames);

        const violations = [];
        for (const name of allDisallowedNames) {
            if (!allowedNames.includes(name) && content.includes(name)) {
                violations.push(name);
            }
        }

        return violations.length > 0 ? violations : null;
    }

    correctIdentity(personaId, content) {
        const violations = this.detectImpersonation(personaId, content);
        if (!violations) return content;

        const allowedNames = this.personaNames.get(personaId) || [];
        const correctName = allowedNames[0] || personaId;
        let corrected = content;

        for (const name of violations) {
            const regex1 = new RegExp(`我是${name}`, 'g');
            const regex2 = new RegExp(`我是 ${name}`, 'g');
            const regex3 = new RegExp(`我是'${name}'`, 'g');
            corrected = corrected.replace(regex1, `我是${correctName}`);
            corrected = corrected.replace(regex2, `我是 ${correctName}`);
            corrected = corrected.replace(regex3, `我是 '${correctName}'`);
        }

        return corrected;
    }

    hasIdentityDeclaration(content, personaName) {
        const patterns = [
            new RegExp(`^我是${personaName}`),
            new RegExp(`^${personaName}[认为是说：:]`),
            new RegExp(`作为${personaName}`),
            new RegExp(`${personaName}的观点是`)
        ];
        return patterns.some(p => p.test(content));
    }
}

const globalIdentityGuard = new IdentityGuard();

function buildIdentitySignature(personaName, personaId) {
    const allowedNames = globalIdentityGuard.personaNames.get(personaId) || [personaName];
    const disallowedNames = [];
    for (const [pid, names] of globalIdentityGuard.personaNames.entries()) {
        if (pid !== personaId) {
            disallowedNames.push(...names);
        }
    }

    return `
【身份签名 - 绝对强制】
你的唯一合法身份：${personaName}
允许使用的自称：我 / ${allowedNames.join(' / ')}
禁止使用的自称：${disallowedNames.join(' / ')}（任何人名都禁止作为你的自称）

强制规则：
1. 必须使用第一人称"我"发言，禁止使用其他人名自称
2. 禁止冒充其他人物（如"我是Sam Altman"、"作为马斯克"等）
3. 保持身份一致性，始终以${personaName}的身份发言
4. 发现身份错误时必须立即纠正

错误示例（绝对禁止）：
- "我是Sam Altman" / "我是Yann LeCun" / "我是Geoffrey Hinton"
- "作为马斯克，我认为"

正确示例：
- "我认为..."
- "${personaName}认为..."
- "从${personaName}的角度来看..."
    `.trim();
}

// ============ 对话记忆与去重系统 ============
class DialogueMemory {
    constructor() {
        this.questions = [];
        this.opinions = [];
        this.currentDepth = 0;
    }

    calculateJaccardSimilarity(str1, str2) {
        const clean = s => s.toLowerCase().replace(/[?？。！，,、\s]+/g, ' ').trim().split(/\s+/);
        const set1 = new Set(clean(str1));
        const set2 = new Set(clean(str2));
        const intersection = [...set1].filter(x => set2.has(x)).length;
        const union = set1.size + set2.size - intersection;
        return union > 0 ? intersection / union : 0;
    }

    hasSimilarQuestion(newQuestion, threshold = 0.65) {
        for (const q of this.questions) {
            if (this.calculateJaccardSimilarity(q, newQuestion) > threshold) {
                return true;
            }
        }
        return false;
    }

    addQuestion(question) {
        this.questions.push(question);
    }

    addOpinion(persona, content, depth) {
        this.opinions.push({ persona, content, depth });
        if (depth > this.currentDepth) {
            this.currentDepth = depth;
        }
    }

    getTopQuestions(count = 5) {
        return this.questions.slice(-count);
    }

    // 增强的重复检测
    hasSimilarContent(newContent, threshold = 0.5) {
        for (const opinion of this.opinions) {
            const similarity = this.calculateJaccardSimilarity(opinion.content, newContent);
            if (similarity > threshold) {
                return { similar: true, similarity, existingContent: opinion.content };
            }
        }
        return { similar: false };
    }

    // 检测与历史消息的重复（包括自己和他人的发言）
    checkHistoryDuplicate(newContent, historyMessages, personaId, threshold = 0.5) {
        // 检查当前人物自己的历史发言
        const personaMessages = historyMessages.filter(m => m.persona === personaId);
        for (const msg of personaMessages) {
            const similarity = this.calculateJaccardSimilarity(msg.content, newContent);
            if (similarity > threshold) {
                return { similar: true, similarity, existingContent: msg.content, type: 'self' };
            }
        }
        
        // 检查其他人的发言（防止抄袭）
        const otherMessages = historyMessages.filter(m => m.persona !== personaId && m.role === 'assistant');
        for (const msg of otherMessages) {
            const similarity = this.calculateJaccardSimilarity(msg.content, newContent);
            if (similarity > threshold) {
                return { similar: true, similarity, existingContent: msg.content, type: 'other' };
            }
        }
        
        return { similar: false };
    }

    // 身份追踪
    personaIdentity = null;
    identityHistory = [];

    setIdentity(personaId, personaName) {
        this.personaIdentity = { personaId, personaName };
        this.identityHistory.push({
            personaId,
            personaName,
            timestamp: Date.now()
        });
    }

    getIdentityPrompt() {
        if (!this.personaIdentity) return '';
        return `
【对话身份记忆】
当前对话身份：${this.personaIdentity.personaName}
身份历史：${this.identityHistory.map(i => i.personaName).join(' → ')}
本次发言必须保持身份一致性，禁止切换或混淆身份。
        `.trim();
    }

    verifyConsistency(content) {
        if (!this.personaIdentity) return true;
        const expectedName = this.personaIdentity.personaName;
        return content.includes(`我是${expectedName}`) ||
               content.includes(expectedName + '认为') ||
               content.startsWith(expectedName);
    }
}

function extractQuestionFromContent(content) {
    const patterns = [
        /([^。！？]*\?[^。！？]*)$/,
        /([^。！？]*[吗呢吧])[^。！？]*[？?]/,
        /你认为([^。！？]*)/
    ];
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1].length > 5) {
            return match[1].trim() + '？';
        }
    }
    return null;
}

function extractKeyPoints(content, maxPoints = 3) {
    const sentences = content.split(/[。！？]/).filter(s => s.trim().length > 10);
    const points = [];
    for (const sentence of sentences) {
        if (sentence.includes('认为') || sentence.includes('关键') || 
            sentence.includes('需要') || sentence.includes('应该') ||
            sentence.includes('核心') || sentence.includes('根本')) {
            points.push(sentence.trim());
        }
        if (points.length >= maxPoints) break;
    }
    return points.length > 0 ? points : sentences.slice(0, maxPoints).map(s => s.trim());
}

// ============ LLM 调用 (阿里云百炼 OpenAI兼容接口) ============
function callLLMOnce(messages, model = 'MiniMax-M2.5') {
    return new Promise((resolve, reject) => {
        const requestBody = {
            model,
            messages,
            stream: false
        };
        
        if (model.startsWith('qwen3')) {
            requestBody.enable_thinking = false;
        }
        
        const data = JSON.stringify(requestBody);
        const options = {
            hostname: DASHSCOPE_BASE,
            port: 443,
            path: '/compatible-mode/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.choices && parsed.choices[0]) {
                        resolve(parsed.choices[0].message.content);
                    } else if (parsed.error) {
                        console.log('API Error Response:', JSON.stringify(parsed.error, null, 2));
                        const errorCode = parsed.error.code;
                        const errorMessage = parsed.error.message || '未知错误';
                        let detailedMsg = `API错误 [${errorCode}]: ${errorMessage}`;
                        reject(new Error(detailedMsg));
                    } else {
                        console.log('Unknown Response:', body);
                        reject(new Error(body));
                    }
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function callLLM(messages, model = 'MiniMax-M2.5') {
    let lastErr;
    for (let i = 0; i < 3; i++) {
        try {
            return await callLLMOnce(messages, model);
        } catch (e) {
            lastErr = e;
            const msg = String(e.message || e);
            if (
                i < 2 &&
                /EAI_AGAIN|ENOTFOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED/i.test(msg)
            ) {
                await new Promise(r => setTimeout(r, 400 * (i + 1)));
                continue;
            }
            throw e;
        }
    }
    throw lastErr;
}

// ============ 通用函数 ============
function slugify(name) {
    const hasChinese = /[\u4e00-\u9fa5]/.test(name);
    let base;
    if (hasChinese) {
        try {
            const { execSync } = require('child_process');
            const py = execSync(
                `python3 -c "from pypinyin import lazy_pinyin; print(''.join(lazy_pinyin('${name.replace(/'/g, "'")}')))"`,
                { encoding: 'utf-8' }
            ).trim();
            base = py.replace(/\s+/g, '-').toLowerCase();
        } catch (e) {
            base = name.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').toLowerCase();
        }
    } else {
        base = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    if (!base) base = 'unnamed';
    return base + '-perspective';
}

function idToName(id) {
    const nameMatch = id.replace(/-perspective$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return nameMatch;
}

function copyReferences(destDir) {
    try {
        const refsDir = path.join(destDir, 'references');
        fs.mkdirSync(refsDir, { recursive: true });
        for (const file of fs.readdirSync(REFERENCES_DIR)) {
            if (file.endsWith('.md')) {
                fs.copyFileSync(path.join(REFERENCES_DIR, file), path.join(refsDir, file));
            }
        }
        return true;
    } catch (e) { return false; }
}

function loadSkillContent(personaId) {
    const skillPath = path.join(EXAMPLES_DIR, personaId, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return null;
    return fs.readFileSync(skillPath, 'utf-8');
}

function getPersonaNameFromSkill(personaId) {
    const content = loadSkillContent(personaId);
    if (!content) {
        const fallback = idToName(personaId);
        console.log(`SKILL.md not found for ${personaId}, using fallback: ${fallback}`);
        return fallback;
    }
    const m = content.match(/^name:\s*(.+)$/m);
    if (m) {
        console.log(`Found name for ${personaId}: ${m[1]}`);
        return m[1];
    } else {
        const fallback = idToName(personaId);
        console.log(`Name not found in SKILL.md for ${personaId}, using fallback: ${fallback}`);
        return fallback;
    }
}

/** 群聊 transcript → LLM messages（带说话人前缀，便于人设区分与接力） */
function formatGroupMessagesForLLM(messages) {
    return messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: `${m.personaName || (m.role === 'user' ? '你' : '某人')}：${m.content}`
    }));
}

/** 主持人是否要求链式/接力式发言（自我介绍、答上一位、问下一位等） */
function hostRequestsChainFormat(hostText) {
    if (!hostText || typeof hostText !== 'string') return false;
    return /接力|下一个|下一位|下一个人|依次|轮流|答.*上|上.*(问|答)|问.*下|递话|点名|顺序发言|说出.*名字|介绍自己/i.test(
        hostText
    );
}

/** 去掉模型冒充他人话筒时的「姓名：」前缀；不误删「注意：」「总之：」等短中文标签 */
function stripMisleadingColonSpeaker(text, myPersonaName, peerNamesIterable) {
    const norm = s => String(s).trim().replace(/\s+/g, ' ');
    const peers = new Set();
    for (const n of peerNamesIterable) {
        peers.add(norm(n).toLowerCase());
    }
    const myKey = norm(myPersonaName).toLowerCase();

    let t = text.trim();
    for (let i = 0; i < 8; i++) {
        const m = t.match(/^([^\n：:]{2,55})[：:]\s*/);
        if (!m) break;
        const label = norm(m[1]);
        const labKey = label.toLowerCase();
        if (labKey === myKey) break;
        if (/^(你|主持人|用户|大家|这边|朋友们)$/.test(label)) break;
        if (
            /^(注意|提示|结论|总之|所以|但是|不过|另外|首先|其次|第一|第二|第三|补充|说明|总结)$/.test(
                label
            )
        )
            break;

        const hasLatin = /[A-Za-z]/.test(label);
        const englishMultiWord = hasLatin && /\s/.test(label);
        const isPeerName = peers.has(labKey);
        const longLatinToken = hasLatin && !/\s/.test(label) && label.length >= 10;

        if (englishMultiWord || isPeerName || longLatinToken) {
            t = t.slice(m[0].length).trim();
            continue;
        }
        break;
    }
    return t;
}

function buildGroupChatSystemPrompt(personaName, personaId, skillContent, meta = {}, dialogueMemory = null) {
    const {
        orderIndex = 0,
        totalInBatch = 1,
        discussionRound = 1,
        totalDiscussionRounds = 1,
        slotInRound = 0,
        personasPerRound = 1,
        latestHostContent = '',
        chainMode = false,
        prevSpeakerName = null,
        firstChainSlot = false,
        askedQuestions = [],
        prevContent = '',
        currentDepth = 0
    } = meta;

    // 添加身份追踪提示词
    const identityTrackingPrompt = dialogueMemory ? dialogueMemory.getIdentityPrompt() : '';

    const hostBlock =
        latestHostContent && String(latestHostContent).trim()
            ? `
【主持人本条 · 须优先遵守】
${String(latestHostContent).trim()}
说明：若其中规定了发言顺序、自我介绍、接力问答、向下一人提问等，你必须**先满足这些格式**，不得擅自把整场改成与主持人无关的单一技术辩论或固定梗题。
`
            : '';

    const chainBlock = chainMode
        ? `
【链式发言】主持人要求接力/顺序回应时：
${
    firstChainSlot
        ? `- 你是**本轮首位**：上一条是主持人规则。须先按主持人要求**说自己的名字**（口语一两句即可），再向「下一位」提问或递话；**不要**只抛问题而不自我介绍。\n`
        : `- 上一条是另一位人格的发言：你必须**先直接回应**对方话里的问题或递话（用一两段即可），再按主持人要求向「下一位」提问或递话；**禁止**跳过「答复上一位」。\n${
              prevSpeakerName
                  ? `- 当前你应优先接住的对象：**${prevSpeakerName}**（上一条发言者）。\n`
                  : ''
          }`
}
- 若主持人要求「说出自己的名字」：用口语一两句即可，不要长篇履历。
- **禁止**全员在无主持人点名的情况下，把话题锁死到某一个子议题（例如反复辩论同一组百分比口号）而忽略主持人的链式任务。
`.trim()
        : '';

    let roundHints = '';

    if (totalDiscussionRounds > 1 && discussionRound > 1) {
        if (chainMode) {
            roundHints += `
【多轮 · 第 ${discussionRound}/${totalDiscussionRounds} 轮】仍须遵守主持人本条中的**链式/顺序**规则；在回应上一位之后，可简短延续话题，但**禁止**整段复述你在前几轮已经说过的论证。
`;
            if (slotInRound === 0) {
                roundHints += `
【本轮首位】先接住**上一条发言者**刚留下的话（通常是上一轮最后一位），再按主持人规则继续链式任务；不要从头无视前文。
`;
            }
        } else {
            roundHints += `
【多轮讨论 · 第 ${discussionRound}/${totalDiscussionRounds} 轮】下方记录里已经包含：主持人的话，以及前几轮所有人格的发言。你必须把场景理解为「讨论已进入下一轮」，在既有交锋上推进（反驳、修正、限定条件、收敛共识等），**禁止**像第一次见到主持人问题那样，从零重新回答同一命题。
- **禁止**复述你在上一轮（若你已发言）或他人已经用过的核心结论句、标志性开头；若观点相近，必须补充新论据、反例或边界条件。
- 若记录里已有对立立场，须明确点名回应其中一条具体表述（或承认被说服并说明理由）。
`;
            if (slotInRound === 0) {
                roundHints += `
【本轮首位发言】先用一句话点明：你要承接上一轮哪条**尚未解决的分歧**或**临时共识**，再展开；不要重新介绍话题背景或重复主持人原话。
`;
            }
        }
    }

    if (totalInBatch > 1 && orderIndex > 0 && !chainMode) {
        roundHints += `
【同批接力】你是本条请求中的第 ${orderIndex + 1}/${totalInBatch} 条发言。上文（含多轮时前几轮的全部内容）里已有其他人：必须针对至少一处**具体观点**展开，禁止无视前文自说自话。
`;
    }

    const sameRoundPeers =
        !chainMode &&
        personasPerRound > 1 &&
        slotInRound > 0
            ? `\n【本轮场内】同一讨论轮内已有 ${slotInRound} 位先发言，你必须回应本轮已出现的观点，避免再答成「对主持人的首次表态」。\n`
            : '';

    const introRoundHint =
        !chainMode &&
        totalDiscussionRounds > 1 &&
        discussionRound > 1
            ? `\n【自我介绍】从第 2 讨论轮起，禁止简历式长篇自我介绍（除非主持人本条明确要求）；若需提及背景，限一两句并立刻转入对前文观点的回应。\n`
            : '';

    const depthPrompt = `【讨论深度要求】当前讨论深度：${currentDepth}级。请尝试将讨论推进到更深层次：
- 深度0：定义问题，建立基本共识
- 深度1：分析原因，提供论据支持
- 深度2：提出解决方案，权衡利弊
- 深度3：讨论执行路径，风险评估
- 深度4：预测长期影响，系统性思考
当前应尝试将讨论推进到 ${currentDepth + 1} 级。`;

    const stateMachinePrompt = `【对话状态】当前讨论阶段：${currentDepth === 0 ? '定义问题' : currentDepth === 1 ? '分析原因' : currentDepth === 2 ? '提出方案' : currentDepth === 3 ? '执行路径' : '反思总结'}。请根据当前阶段调整发言方向，推动讨论向「反思总结」阶段前进。`;

    const identityPromptBlock = identityTrackingPrompt ? `\n${identityTrackingPrompt}\n` : '';

    const prevOpinionPrompt = prevContent && prevContent.length > 20
        ? `【强制回应 - 必须执行】上一位发言的核心观点：${prevContent.slice(0, 200)}...

你必须：
1. 明确引用上一位的具体观点或问题
2. 给出你的回应或答案
3. 提出新的问题或观点推进讨论

禁止：
1. 无视前文，自说自话
2. 重复上一位的观点
3. 重复你自己之前说过的内容

示例：
- 正确："Andrej提到的压缩能力很有意思。我认为..."
- 正确："关于你提到的部署可靠性问题，我的看法是..."
- 错误：直接开始说自己的观点而不回应前文`
        : '';

    const antiRepetitionPrompt = `【强制反重复 - 严格执行】
1. **禁止重复提问**：以下问题已被问过，请勿重复或高度相似：
${askedQuestions.length > 0 ? '- ' + askedQuestions.slice(-5).join('\n- ') : '- 暂无'}

2. **禁止重复内容**：禁止使用与你前几轮发言相同或相似的段落、比喻、例证和论证结构

3. **必须引入新内容**：每轮发言必须包含至少一个新观点、新例证、新数据或新角度

4. **递进要求**：讨论应逐步深入，从定义问题→分析原因→提出方案→执行路径→反思总结，禁止在同一层次反复循环

5. **违反后果**：如果检测到重复，系统将强制重新生成发言`;

    const identitySignature = buildIdentitySignature(personaName, personaId);

    return `你是「${personaName}」。你必须严格沿用下方 SKILL.md 中的身份、表达习惯、心智模型与价值取向；禁止写成与该人设无关的「万能评论员」腔调。

${identitySignature}

【反抄写】禁止复制或轻度改写对话记录里**任意他人发言**中长段落（连续两三句以上雷同即不可）；禁止沿用他人一串比喻/专有措辞；若承接结论，必须用自己人设下的推理与例证**重写**，并写出至少一处与前文不同的切入点。

【禁自我复读】若记录中已有你本人「${personaName}」的先前发言：**禁止**用相同或极相近的段落、同一组比喻与论证顺序再次输出；若须延续同一立场，必须换例证、换角度或补充新事实，让读者能感到「这是新的一轮」，而不是粘贴上一轮。

${hostBlock}${chainBlock ? '\n' + chainBlock + '\n' : ''}
${identityPromptBlock}
${stateMachinePrompt}
${depthPrompt}
${prevOpinionPrompt}
${antiRepetitionPrompt}
${introRoundHint}${roundHints}${sameRoundPeers}

下面是群聊记录（每条前缀为说话人）。你只追加一条自己的发言。

硬性要求：
1. 人设优先：用词节奏、论证习惯要与 SKILL 一致，与他人有明显辨识度。
2. 避免同质化：不要复用前文已经出现过的结论句式或空洞表态；若话题重叠，请从新维度切入（风险、长期后果、执行细节、反面案例等）。
3. 深度：至少包含一层因果、权衡或具体判断，不能只停留在「要/不要」式表态；篇幅可到约 220 字以内。
4. 只输出本条发言正文：不要写名字前缀，不要使用「某某：」格式。
5. 用中文。
6. 禁止重复提问：提问必须新颖，不得与以下已问问题重复或高度相似：
${askedQuestions.length > 0 ? '- ' + askedQuestions.join('\n- ') : '- 暂无'}
   若本轮没有新问题可问，可以不提问，专注于深入讨论。
7. 强制回应：必须直接回应上一位发言的具体观点，禁止无视前文。
8. 话题推进：每轮发言必须在前文基础上推进讨论，要么深化现有观点，要么引入新的相关话题，禁止原地打转。

== SKILL.md ==
${skillContent}
== SKILL.md 结束 ==`;
}

// ============ 进度推送 ============
const progressEmitter = new EventEmitter();

// ============ 路由 ============

// 获取所有人格（用于建群选择）
app.get('/api/personas', (req, res) => {
    const personas = [];
    try {
        const dirs = fs.readdirSync(EXAMPLES_DIR);
        for (const dir of dirs) {
            const skillPath = path.join(EXAMPLES_DIR, dir, 'SKILL.md');
            if (fs.existsSync(skillPath)) {
                const content = fs.readFileSync(skillPath, 'utf-8');
                const nameMatch = content.match(/^name:\s*(.+)$/m);
                const descMatch = content.match(/^description:\s*\|\s*\n(.+?)(?=^---)/ms);
                personas.push({
                    id: dir,
                    name: nameMatch ? nameMatch[1] : idToName(dir),
                    description: descMatch ? descMatch[1].trim().split('\n')[0] : '',
                });
            }
        }
    } catch (e) { console.error('Error:', e); }
    res.json(personas);
});

// SSE进度流
app.get('/api/personas/distill-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sessionId = Date.now().toString();
    res.write(`event: init\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const onProgress = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
    const onComplete = (data) => {
        res.write(`event: complete\ndata: ${JSON.stringify(data)}\n\n`);
        cleanup();
        res.end();
    };
    const onError = (data) => {
        res.write(`event: error\ndata: ${JSON.stringify(data)}\n\n`);
        cleanup();
        res.end();
    };

    const cleanup = () => {
        progressEmitter.off('progress:' + sessionId, onProgress);
        progressEmitter.off('complete:' + sessionId, onComplete);
        progressEmitter.off('error:' + sessionId, onError);
        clearInterval(heartbeat);
    };

    progressEmitter.on('progress:' + sessionId, onProgress);
    progressEmitter.on('complete:' + sessionId, onComplete);
    progressEmitter.on('error:' + sessionId, onError);

    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 15000);
    req.on('close', cleanup);
});

// 获取指定人格的SKILL.md
app.get('/api/persona/:id', (req, res) => {
    const skillPath = path.join(EXAMPLES_DIR, req.params.id, 'SKILL.md');
    if (!fs.existsSync(skillPath)) return res.status(404).json({ error: 'Not found' });
    res.json({ content: fs.readFileSync(skillPath, 'utf-8') });
});

// DM对话
app.post('/api/chat', async (req, res) => {
    const { personaId, question, history = [] } = req.body;
    if (!personaId || !question) return res.status(400).json({ error: 'Missing params' });

    const skillContent = loadSkillContent(personaId);
    if (!skillContent) return res.status(404).json({ error: 'Persona not found' });

    const personaName = getPersonaNameFromSkill(personaId);

    const systemPrompt = `你是${personaName}的视角。严格遵循SKILL.md中的角色扮演规则。

== SKILL.md 内容 ==
${skillContent}
== SKILL.md 结束 ==

重要规则：
- 直接以该人物的身份回答，用"我"而不是"这个人物会认为"
- 用该人物的语气、节奏、词汇直接回答
- 如果问题需要最新信息，先说明你基于什么回答
- 不要跳出角色做meta分析
- 回答要简洁有力，不像AI写的
- 用中文回答`;

    try {
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history.flatMap(h => [
                { role: 'user', content: h.user },
                { role: 'assistant', content: h.assistant }
            ]),
            { role: 'user', content: question }
        ];
        const response = await callLLM(messages);
        res.json({ response });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============ 群组 CRUD ============

// 获取所有群组
app.get('/api/groups', (req, res) => {
    const groups = [];
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        for (const file of files) {
            const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
            groups.push({
                id: data.id,
                name: data.name,
                personas: data.personas,
                personaNames: data.personaNames,
                messageCount: data.messages.length,
                updatedAt: data.updatedAt
            });
        }
    } catch (e) { console.error('Error:', e); }
    res.json(groups.sort((a, b) => b.updatedAt - a.updatedAt));
});

// 获取指定群组详情
app.get('/api/groups/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, req.params.id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
});

// 创建群组
app.post('/api/groups', (req, res) => {
    const { name, personas } = req.body;
    if (!name || !personas || personas.length < 2) {
        return res.status(400).json({ error: '需要群名和至少2个人物' });
    }

    const id = randomUUID();
    const personaNames = personas.map(p => getPersonaNameFromSkill(p));

    const group = {
        id,
        name,
        personas,
        personaNames,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    fs.writeFileSync(path.join(DATA_DIR, id + '.json'), JSON.stringify(group, null, 2), 'utf-8');
    res.json({ id, name, personas, personaNames });
});

// 更新群组成员
app.put('/api/groups/:id/members', (req, res) => {
    const groupId = req.params.id;
    const { personas } = req.body;
    
    const filePath = path.join(DATA_DIR, groupId + '.json');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '群聊不存在' });
    }
    
    if (!Array.isArray(personas) || personas.length < 2) {
        return res.status(400).json({ error: '群聊至少需要2名成员' });
    }
    
    // Read group from file
    const group = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Update members - use getPersonaNameFromSkill to resolve names
    group.personas = personas;
    group.personaNames = personas.map(p => getPersonaNameFromSkill(p));
    group.updatedAt = Date.now();
    
    // Save back to file
    fs.writeFileSync(filePath, JSON.stringify(group, null, 2), 'utf-8');
    
    res.json({ 
        id: group.id, 
        personas: group.personas, 
        personaNames: group.personaNames 
    });
});

app.delete('/api/groups/:id', (req, res) => {
    const filePath = path.join(DATA_DIR, req.params.id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });
    fs.unlinkSync(filePath);
    res.json({ success: true });
});

// ============ 群聊发言 ============

// 发言：依次让选定人物发言
app.post('/api/groups/:id/messages', async (req, res) => {
    const { content, mode, rounds, personas } = req.body;
    const groupId = req.params.id;

    const filePath = path.join(DATA_DIR, groupId + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });

    const group = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // 确定发言顺序（personasPerRound：每一「讨论轮」的人格数，用于多轮 prompt）
    let speakOrder = personas || group.personas;
    const personasPerRound = speakOrder.length;
    let roundInfo = [];
    if (mode === '指定轮次') {
        // 每轮所有选定人物都发言
        const allRounds = [];
        const numRounds = rounds || 1;
        for (let r = 0; r < numRounds; r++) {
            for (const p of speakOrder) {
                allRounds.push(p);
                roundInfo.push({ round: r + 1, totalRounds: numRounds, position: roundInfo.length });
            }
        }
        speakOrder = allRounds;
    } else {
        // mode=sequential 或其他：按顺序每个人各发一轮
        for (let i = 0; i < speakOrder.length; i++) {
            roundInfo.push({ round: 1, totalRounds: 1, position: i + 1 });
        }
    }

    // 获取所有可能的人物名字，用于清理前缀
    const allPersonaNames = new Set();
    for (const pid of group.personas) {
        const name = getPersonaNameFromSkill(pid);
        allPersonaNames.add(name);
        globalIdentityGuard.registerPersona(pid, [name]);
    }

    // 添加用户消息
    group.messages.push({
        id: randomUUID(),
        role: 'user',
        persona: null,
        personaName: '你',
        content,
        timestamp: Date.now(),
        round: null
    });

    const newMessages = [];
    const llmErrors = [];
    let position = 0;
    const dialogueMemory = new DialogueMemory();
    let currentDepth = 0;
    const previousResponses = new Map();

    // 从历史消息中提取已问问题和发言内容
    for (const msg of group.messages) {
        if (msg.role === 'assistant') {
            const q = extractQuestionFromContent(msg.content);
            if (q) {
                dialogueMemory.addQuestion(q);
            }
            if (!previousResponses.has(msg.persona)) {
                previousResponses.set(msg.persona, []);
            }
            previousResponses.get(msg.persona).push(msg.content);
        }
    }

    const isContentRepeated = (personaId, newContent, threshold = 0.5) => {
        // 检查当前人物自己的历史发言
        const prevResponses = previousResponses.get(personaId) || [];
        for (const prev of prevResponses) {
            const similarity = dialogueMemory.calculateJaccardSimilarity(prev, newContent);
            if (similarity > threshold) {
                console.log(`重复检测命中（自我重复）：${personaId} 的发言相似度 ${similarity.toFixed(2)} > ${threshold}`);
                return true;
            }
        }
        
        // 检查其他人的发言（防止抄袭）
        for (const [otherPersonaId, otherResponses] of previousResponses) {
            if (otherPersonaId !== personaId) {
                for (const prev of otherResponses) {
                    const similarity = dialogueMemory.calculateJaccardSimilarity(prev, newContent);
                    if (similarity > threshold) {
                        console.log(`重复检测命中（抄袭他人）：${personaId} 复制了 ${otherPersonaId} 的发言，相似度 ${similarity.toFixed(2)} > ${threshold}`);
                        return true;
                    }
                }
            }
        }
        
        return false;
    };

    // 让每个人物依次发言
    for (const personaId of speakOrder) {
        const skillContent = loadSkillContent(personaId);
        if (!skillContent) {
            console.warn(`Skip persona ${personaId}: SKILL.md missing`);
            llmErrors.push({
                personaId,
                personaName: idToName(personaId),
                error: '未找到该人格的 SKILL.md'
            });
            position++;
            continue;
        }
        const personaName = getPersonaNameFromSkill(personaId);
        if (!personaName) {
            position++;
            continue;
        }

        const currentRoundInfo = roundInfo[position] || { round: 1, totalRounds: 1, position: position + 1 };
        const slotInRound = position % personasPerRound;
        console.log(`Processing persona: ${personaId} -> ${personaName} (Round ${currentRoundInfo.round}/${currentRoundInfo.totalRounds})`);

        const chainMode = hostRequestsChainFormat(content);
        let prevSpeakerName = null;
        let firstChainSlot = false;
        if (chainMode) {
            if (position === 0 && currentRoundInfo.round === 1) {
                firstChainSlot = true;
            } else if (position > 0) {
                prevSpeakerName = getPersonaNameFromSkill(speakOrder[position - 1]);
            } else {
                const asstMsgs = group.messages.filter(m => m.role === 'assistant');
                if (asstMsgs.length) {
                    prevSpeakerName = asstMsgs[asstMsgs.length - 1].personaName;
                }
            }
        }

        // 在每次发言前设置身份追踪
        dialogueMemory.setIdentity(personaId, personaName);

        const prevContent = position > 0 && newMessages.length > 0
            ? newMessages[newMessages.length - 1].content
            : (group.messages.length > 1 ? group.messages[group.messages.length - 2]?.content || '' : '');

        const systemPrompt = buildGroupChatSystemPrompt(personaName, personaId, skillContent, {
            orderIndex: position,
            totalInBatch: speakOrder.length,
            discussionRound: currentRoundInfo.round,
            totalDiscussionRounds: currentRoundInfo.totalRounds,
            slotInRound,
            personasPerRound,
            latestHostContent: content,
            chainMode,
            prevSpeakerName,
            firstChainSlot,
            askedQuestions: dialogueMemory.getTopQuestions(10),
            prevContent,
            currentDepth
        }, dialogueMemory);
        const transcriptMessages = formatGroupMessagesForLLM(group.messages);

        try {
            let finalContent = '';
            let attempts = 0;
            const maxAttempts = 3;
            
            while (attempts < maxAttempts) {
                const messages = [{ role: 'system', content: systemPrompt }, ...transcriptMessages];
                const response = await callLLM(messages);

                // 解析JSON格式的响应
                let cleanContent = response.trim();
                try {
                    const jsonResponse = JSON.parse(cleanContent);
                    cleanContent = jsonResponse.response || cleanContent;
                } catch (e) {
                    // 如果不是JSON格式，保持原样
                }
                
                // 移除开头的 $1 等格式标记
                cleanContent = cleanContent.replace(/^\$1+/, '').trim();
                
                cleanContent = stripMisleadingColonSpeaker(cleanContent, personaName, allPersonaNames);
                
                // 清理所有可能的名字前缀
                const allNames = new Set();
                for (const name of allPersonaNames) {
                    allNames.add(name);
                    if (/[a-zA-Z]/.test(name)) {
                        allNames.add(name.trim());
                    }
                    if (name.includes(' ')) {
                        const parts = name.split(' ');
                        allNames.add(parts[0]);
                        allNames.add(parts[parts.length - 1]);
                    }
                }
                
                const cleanNamePrefix = (text, name) => {
                    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const patterns = [
                        new RegExp(`^${escaped}\\s*[：:]\s*`),
                        new RegExp(`(\\n)${escaped}\\s*[：:]\s*`),
                    ];
                    let result = text;
                    for (const pat of patterns) {
                        result = result.replace(pat, '$1');
                    }
                    return result;
                };
                
                let tempContent = cleanContent;
                let changed = true;
                let iterations = 0;
                while (changed && iterations < 50) {
                    changed = false;
                    iterations++;
                    for (const name of allNames) {
                        const before = tempContent;
                        tempContent = cleanNamePrefix(tempContent, name);
                        if (tempContent !== before) changed = true;
                    }
                }
                tempContent = tempContent.replace(/^[\s，,、。.]+/, '').trim();
                
                // 检测重复（每次尝试都检测）
                const historyCheck = dialogueMemory.checkHistoryDuplicate(tempContent, group.messages, personaId, 0.4);
                const contentCheck = dialogueMemory.hasSimilarContent(tempContent, 0.4);
                
                if (historyCheck.similar || contentCheck.similar) {
                    attempts++;
                    const source = historyCheck.similar ? '历史消息' : '当前对话';
                    const similarity = historyCheck.similar ? historyCheck.similarity : contentCheck.similarity;
                    console.log(`重复检测：${personaName} 的发言与${source}重复（相似度：${(similarity*100).toFixed(0)}%），第 ${attempts} 次尝试重新生成`);
                    continue;
                }
                
                finalContent = tempContent;
                break;
            }
            
            if (!finalContent) {
                throw new Error('多次尝试后仍未能生成不重复的发言');
            }

            // 身份验证和纠正
            const identityViolations = globalIdentityGuard.detectImpersonation(personaId, finalContent);
            if (identityViolations) {
                console.log(`身份验证失败：${personaName} 发言中检测到冒充 ${identityViolations.join(', ')}`);
                finalContent = globalIdentityGuard.correctIdentity(personaId, finalContent);
                console.log(`身份已纠正为：${finalContent.slice(0, 50)}...`);
            }

            // 最终清理：移除任何残留的格式标记
            finalContent = finalContent.replace(/^\$1+/, '').trim();
            finalContent = finalContent.replace(/^\$\d+(\s+)?/, '').trim();

            const msgObj = {
                id: randomUUID(),
                role: 'assistant',
                persona: personaId,
                personaName,
                content: finalContent,
                timestamp: Date.now(),
                round: currentRoundInfo.round,
                totalRounds: currentRoundInfo.totalRounds,
                position: currentRoundInfo.position
            };
            group.messages.push(msgObj);
            newMessages.push(msgObj);
            
            // 将新内容添加到重复检测缓存
            if (!previousResponses.has(personaId)) {
                previousResponses.set(personaId, []);
            }
            previousResponses.get(personaId).push(finalContent);
            
            const question = extractQuestionFromContent(finalContent);
            if (question) {
                if (!dialogueMemory.hasSimilarQuestion(question)) {
                    dialogueMemory.addQuestion(question);
                }
            }
            
            const keyPoints = extractKeyPoints(finalContent);
            if (keyPoints.length > 0) {
                const hasDepthIndicator = finalContent.includes('因为') || 
                                        finalContent.includes('所以') ||
                                        finalContent.includes('导致') ||
                                        finalContent.includes('需要') ||
                                        finalContent.includes('应该') ||
                                        finalContent.includes('风险') ||
                                        finalContent.includes('影响');
                if (hasDepthIndicator && currentDepth < 4) {
                    currentDepth++;
                }
            }
        } catch (e) {
            console.error(`Error generating response for ${personaId}:`, e.message);
            llmErrors.push({
                personaId,
                personaName,
                error: e.message || String(e)
            });
        }
        position++;
    }

    group.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(group, null, 2), 'utf-8');

    res.json({ messages: newMessages, errors: llmErrors });
});

// 获取群组聊天记录
app.get('/api/groups/:id/messages', (req, res) => {
    const filePath = path.join(DATA_DIR, req.params.id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });
    const group = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ messages: group.messages });
});

// 生成群聊总结
app.post('/api/groups/:id/summary', async (req, res) => {
    const filePath = path.join(DATA_DIR, req.params.id + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });
    
    const group = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const messages = group.messages || [];
    
    if (messages.length === 0) {
        return res.json({ summary: '群聊还没有消息，无法生成总结。' });
    }
    
    // Build conversation history for summary
    const conversationText = messages.map(m => {
        const role = m.role === 'user' ? '用户' : (m.personaName || '未知');
        return `${role}: ${m.content || ''}`;
    }).join('\n\n');
    
    const prompt = `请对以下群聊内容进行分析总结：

【群聊成员】${group.personaNames.join('、')}

【讨论内容】
${conversationText}

【总结要求】
1. 讨论主题：总结本次讨论的核心话题
2. 主要观点：梳理每位参与者的核心观点
3. 达成共识：总结讨论中达成一致的内容
4. 争议点：列出存在分歧的问题
5. 后续建议：基于讨论内容给出建议

请用中文输出一份详细的分析报告。`;
    
    try {
        const summary = await callLLM([
            { role: 'system', content: '你是一位专业的会议记录和分析专家。请对群聊内容进行全面、深入的分析。' },
            { role: 'user', content: prompt }
        ]);
        
        res.json({ summary });
    } catch (e) {
        console.error('Summary generation error:', e);
        res.status(500).json({ error: '生成总结失败: ' + e.message });
    }
});

// 用户反馈API
const globalParamTuner = new ParamTuner();

app.post('/api/groups/:id/feedback', (req, res) => {
    const { messageId, rating, feedbackType, comment } = req.body;
    
    if (!messageId || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid feedback parameters' });
    }
    
    const feedback = {
        id: randomUUID(),
        groupId: req.params.id,
        messageId,
        rating,
        feedbackType: feedbackType || 'quality',
        comment: comment || '',
        timestamp: Date.now()
    };
    
    globalParamTuner.recordFeedback(feedback);
    
    res.json({ 
        success: true, 
        message: 'Feedback recorded',
        currentParams: globalParamTuner.getParams()
    });
});

// 获取当前参数
app.get('/api/params', (req, res) => {
    res.json(globalParamTuner.getParams());
});

// 重置参数
app.post('/api/params/reset', (req, res) => {
    globalParamTuner.resetParams();
    res.json({ success: true, message: 'Parameters reset to default' });
});

// ============ 群聊SSE发言流 ============
app.get('/api/groups/:id/stream', (req, res) => {
    const groupId = req.params.id;
    const filePath = path.join(DATA_DIR, groupId + '.json');
    if (!fs.existsSync(filePath)) {
        res.status(404).end();
        return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const sessionId = Date.now().toString();
    res.write(`event: init\ndata: ${JSON.stringify({ sessionId })}\n\n`);

    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 15000);

    req.on('close', () => {
        clearInterval(heartbeat);
    });

    // 将res暴露给POST handler（通过sessionId关联）
    groupSSEClients = groupSSEClients || {};
    groupSSEClients[sessionId] = res;
    progressEmitter.on('sse_close:' + sessionId, () => {
        delete groupSSEClients[sessionId];
    });
});

// ============ 群聊发言（带SSE流）============
app.post('/api/groups/:id/messages-stream', async (req, res) => {
    const { content, mode, rounds, personas, sessionId } = req.body;
    const groupId = req.params.id;

    const filePath = path.join(DATA_DIR, groupId + '.json');
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Group not found' });

    res.setHeader('Content-Type', 'application/json');

    const group = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    let speakOrder = personas || group.personas;
    const personasPerRound = speakOrder.length;
    const totalDiscussionRounds = mode === '指定轮次' ? (rounds || 1) : 1;
    if (mode === '指定轮次') {
        const allRounds = [];
        for (let r = 0; r < totalDiscussionRounds; r++) {
            allRounds.push(...speakOrder);
        }
        speakOrder = allRounds;
    }

    // 添加用户消息
    const userMsg = {
        id: randomUUID(),
        role: 'user',
        persona: null,
        personaName: '你',
        content,
        timestamp: Date.now()
    };
    group.messages.push(userMsg);

    const streamPeerNames = new Set();
    for (const pid of group.personas) {
        streamPeerNames.add(getPersonaNameFromSkill(pid));
    }

    const emit = (event, data) => {
        if (sessionId && groupSSEClients && groupSSEClients[sessionId]) {
            const r = groupSSEClients[sessionId];
            r.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
    };

    const newMessages = [];
    const streamChainMode = hostRequestsChainFormat(content);
    const askedQuestions = [];

    const extractQuestion = (text) => {
        const matches = text.match(/([^。！？]*\?[^。！？]*)/g);
        if (matches && matches.length > 0) {
            return matches[matches.length - 1].trim();
        }
        return null;
    };

    for (let i = 0; i < speakOrder.length; i++) {
        const personaId = speakOrder[i];
        const skillContent = loadSkillContent(personaId);
        if (!skillContent) continue;

        const personaName = getPersonaNameFromSkill(personaId);

        emit('speaking', { personaId, personaName, status: 'start' });

        const discussionRound = Math.floor(i / personasPerRound) + 1;
        const slotInRound = i % personasPerRound;

        let prevSpeakerName = null;
        let firstChainSlot = false;
        if (streamChainMode) {
            if (i === 0 && discussionRound === 1) {
                firstChainSlot = true;
            } else if (i > 0) {
                prevSpeakerName = getPersonaNameFromSkill(speakOrder[i - 1]);
            } else {
                const asstMsgs = group.messages.filter(m => m.role === 'assistant');
                if (asstMsgs.length) {
                    prevSpeakerName = asstMsgs[asstMsgs.length - 1].personaName;
                }
            }
        }

        const systemPrompt = buildGroupChatSystemPrompt(personaName, skillContent, {
            orderIndex: i,
            totalInBatch: speakOrder.length,
            discussionRound,
            totalDiscussionRounds,
            slotInRound,
            personasPerRound,
            latestHostContent: content,
            chainMode: streamChainMode,
            prevSpeakerName,
            firstChainSlot,
            askedQuestions
        });
        const transcriptMessages = formatGroupMessagesForLLM(group.messages);

        try {
            const response = await callLLM([
                { role: 'system', content: systemPrompt },
                ...transcriptMessages
            ]);

            let cleanContent = response.trim();
            cleanContent = stripMisleadingColonSpeaker(cleanContent, personaName, streamPeerNames);
            const namePattern = new RegExp(`^${personaName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:]\\s*`);
            while (cleanContent.match(namePattern)) {
                cleanContent = cleanContent.replace(namePattern, '');
            }

            const msgObj = {
                id: randomUUID(),
                role: 'assistant',
                persona: personaId,
                personaName,
                content: cleanContent,
                timestamp: Date.now()
            };
            group.messages.push(msgObj);
            newMessages.push(msgObj);
            emit('speaking', { personaId, personaName, status: 'done', content: cleanContent });
            
            const question = extractQuestion(cleanContent);
            if (question && question.length > 5) {
                askedQuestions.push(question);
            }
        } catch (e) {
            emit('speaking', { personaId, personaName, status: 'error', error: e.message });
        }
    }

    group.updatedAt = Date.now();
    fs.writeFileSync(filePath, JSON.stringify(group, null, 2), 'utf-8');

    emit('done', { messages: newMessages });
    res.json({ messages: newMessages, sessionId });
});

// ============ 新增人物蒸馏（完整Phase流程）============
app.post('/api/personas', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    const { name, description, background, perspectives, style, sessionId } = req.body;
    if (!name) return res.status(400).json({ error: '缺少人物名称' });
    if (!sessionId) return res.status(400).json({ error: '缺少sessionId，请先打开SSE连接' });

    const emit = (event, data) => {
        setImmediate(() => progressEmitter.emit(event + ':' + sessionId, data));
    };

    const emitProgress = (step, message) => {
        emit('progress', { step, message });
    };

    try {
        emitProgress(1, `开始蒸馏 "${name}"...`);

        let baseSlug = slugify(name).replace(/-perspective$/, '');
        let id = baseSlug + '-perspective';
        let counter = 1;
        while (fs.existsSync(path.join(EXAMPLES_DIR, id, 'SKILL.md'))) {
            counter++;
            id = `${baseSlug}-${counter}-perspective`;
        }

        const dirPath = path.join(EXAMPLES_DIR, id);
        const refsDir = path.join(dirPath, 'references');
        fs.mkdirSync(refsDir, { recursive: true });
        emitProgress(2, 'Phase 1 完成');

        // Agent1
        emitProgress(3, '[Agent1] 研究背景与著作...');
        const agent1 = await callLLM([{
            role: 'user',
            content: `你是人物背景研究员。请对"${name}"进行深度研究，生成一份详细的人物背景文档。

人物：${name}
简介：${description || '暂无'}
背景：${background || '暂无'}
核心视角：${perspectives || '暂无'}

请输出Markdown文档（不要加代码 fences）：

# ${name} · 背景与著作

## 生平经历

## 关键决策时间线
| 时间 | 事件 | 决策背景 |
|------|------|---------|

## 代表性著作/产品/言论

## 思想演变

## 主要影响`
        }], 'glm-4');
        fs.writeFileSync(path.join(refsDir, '01-background.md'), agent1.trim(), 'utf-8');
        emitProgress(3, '[Agent1] 背景研究完成');

        // Agent2
        emitProgress(4, '[Agent2] 分析对话与决策案例...');
        const agent2 = await callLLM([{
            role: 'user',
            content: `你是对话与决策分析员。请对"${name}"的公开言论和决策行为进行分析。

人物：${name}
背景：${background || '暂无'}
核心视角：${perspectives || '暂无'}

请输出Markdown文档（不要加代码 fences）：

# ${name} · 对话与决策分析

## 核心决策模式

## 代表性决策案例
### 案例1
- **背景**：
- **决策**：
- **依据**：
- **结果**：
- **分析**：

## 价值观底线

## 争议与批评

## 内在矛盾`
        }], 'glm-4');
        fs.writeFileSync(path.join(refsDir, '02-conversations.md'), agent2.trim(), 'utf-8');
        emitProgress(4, '[Agent2] 决策分析完成');

        // Agent3
        emitProgress(5, '[Agent3] 分析表达风格...');
        const agent3 = await callLLM([{
            role: 'user',
            content: `你是表达风格分析师。请对"${name}"的说话和表达方式进行分析。

人物：${name}
表达风格：${style || '暂无'}

请输出Markdown文档（不要加代码 fences）：

# ${name} · 表达DNA

## 说话风格总览

## 标志性用语与口头禅

## 常用句式与修辞

## 确定性表达

## 幽默与情感风格

## 价值观表达方式`
        }], 'glm-4');
        fs.writeFileSync(path.join(refsDir, '03-expression-dna.md'), agent3.trim(), 'utf-8');
        emitProgress(5, '[Agent3] 表达DNA分析完成');

        // Agent4
        emitProgress(6, '[Agent4] 质量验证...');
        const agent4 = await callLLM([{
            role: 'user',
            content: `你是质量审核员。请对"${name}"的研究文档进行质量检查。

请基于以下三份文档分析：
- 01-background.md（背景与著作）
- 02-conversations.md（对话与决策）
- 03-expression-dna.md（表达DNA）

请输出Markdown文档（不要加代码 fences）：

# ${name} · 质量验证报告

## 信息完整性

## 一致性检查

## 深度评估

## 提炼建议

## 蒸馏风险`
        }], 'glm-4');
        fs.writeFileSync(path.join(refsDir, '04 quality-check.md'), agent4.trim(), 'utf-8');
        emitProgress(6, '[Agent4] 质量验证完成');

        // Assembler
        emitProgress(7, '[Assembler] 读取研究文件，组装SKILL.md...');
        const skillContent = await callLLM([{
            role: 'user',
            content: `你是蒸馏专家。请根据以下Phase 2的研究文档，为"${name}"生成一个完整的SKILL.md文件。

== 01-background.md ==
${agent1.trim()}

== 02-conversations.md ==
${agent2.trim()}

== 03-expression-dna.md ==
${agent3.trim()}

== 04质量验证报告 ==
${agent4.trim()}

要求：
1. YAML frontmatter：name: ${name}，description: 一句话描述
2. 角色扮演规则
3. 身份卡
4. 擅长与局限
5. 核心心智模型（3-5个，每个含：四重验证/一句话描述/证据/应用/局限）
6. 决策启发式（4-6条，每条含场景+案例）
7. 表达DNA
8. 诚实边界
9. 模型名称必须泛化，不能绑定具体事件
10. 直接输出Markdown，不要代码 fences，用中文`
        }], 'glm-4');

        let finalContent = skillContent
            .replace(/^```markdown\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        if (finalContent.match(/^---\n([\s\S]*?)\n---/)) {
            finalContent = finalContent.replace(/^name:\s*.+$/m, `name: ${name}`);
        }

        emitProgress(8, '写入SKILL.md...');
        fs.writeFileSync(path.join(dirPath, 'SKILL.md'), finalContent, 'utf-8');
        copyReferences(dirPath);
        emitProgress(9, '完成！');

        emit('complete', {
            success: true,
            id,
            name,
            message: counter > 1
                ? `人物 "${name}" 创建成功（序号${counter}）！`
                : `人物 "${name}" 创建成功！`
        });

        res.json({ success: true, sessionId, id, name });

    } catch (e) {
        console.error('Distill error:', e.message);
        emit('error', { error: e.message });
        res.status(500).json({ error: `蒸馏失败: ${e.message}` });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Nuwa Chat running at http://localhost:${PORT}`);
});
