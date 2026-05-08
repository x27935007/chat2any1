# Nuwa Chat - AI 人格对话系统

一个基于阿里云 DashScope 的多人格对话系统，支持模拟不同人物视角进行深度讨论。

## 功能特性

- 🤖 **多人格对话**：支持多种著名人物视角的角色扮演对话
- 👥 **群组讨论**：支持多个人格同时参与讨论，模拟圆桌会议
- 📊 **对话状态机**：内置对话深度追踪，推动讨论逐步深入
- 🔒 **身份守卫**：确保各个人格保持身份一致性，防止冒充
- 🧠 **对话记忆**：自动去重，避免重复提问和重复内容
- 🔄 **链式发言**：支持接力式发言模式，增强互动性

## 支持的模型

- 通义千问 Plus (qwen-plus)
- 通义千问 Turbo (qwen-turbo)
- 通义千问 Max (qwen-max)
- GLM-4 (glm-4)
- GLM-4 Plus (glm-4-plus)
- MiniMax M2.5 (MiniMax-M2.5)
- ABAB 6.5S (abab6.5s)
- DeepSeek V4 Pro (deepseek-v4-pro)

## 快速开始

### 环境要求

- Node.js >= 18.0.0
- 阿里云 DashScope API Key

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd nuwa-chat
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您的 DashScope API Key：
```env
DASHSCOPE_API_KEY=your_api_key_here
PORT=3098
NODE_ENV=production
```

4. **启动服务**
```bash
node server.js
```

### Docker 部署

```bash
# 构建并启动
bash deploy.sh

# 或者使用 docker-compose
docker-compose up -d
```

## API 接口

### 获取支持的模型列表
```
GET /api/models
```

### 获取所有人格列表
```
GET /api/personas
```

### 获取指定人格详情
```
GET /api/persona/:id
```

### 单人人格对话
```
POST /api/chat
Content-Type: application/json

{
  "personaId": "elon-musk-perspective",
  "question": "你的观点是什么？",
  "history": [],
  "model": "deepseek-v4-pro"
}
```

### 创建群组
```
POST /api/groups
Content-Type: application/json

{
  "name": "AI 未来讨论组",
  "personas": ["elon-musk-perspective", "paul-graham-perspective"]
}
```

### 获取所有群组
```
GET /api/groups
```

### 获取指定群组详情
```
GET /api/groups/:id
```

### 设置全局配置
```
POST /api/settings
Content-Type: application/json

{
  "model": "qwen-plus",
  "apiKey": "your_api_key"
}
```

## 项目结构

```
nuwa-chat/
├── nuwa-skill/           # 人格技能定义目录
│   ├── examples/         # 各个人格的 SKILL.md 文件
│   └── references/       # 参考文档
├── data/
│   └── groups/           # 群组聊天记录存储
├── public/               # 静态资源
├── server.js             # 主服务器文件
├── config.json           # 配置文件
├── package.json          # 项目依赖
├── Dockerfile            # Docker 构建配置
├── docker-compose.yml    # Docker Compose 配置
└── .env.example          # 环境变量示例
```

## 支持的人格

- Elon Musk (elon-musk-perspective)
- Steve Jobs (steve-jobs-perspective)
- Paul Graham (paul-graham-perspective)
- Feynman (feynman-perspective)
- Charlie Munger (munger-perspective)
- Naval Ravikant (naval-perspective)
- Andrej Karpathy (andrej-karpathy-perspective)
- Ilya Sutskever (ilya-sutskever-perspective)
- Taleb (taleb-perspective)
- Trump (trump-perspective)
- 雷军 (leijun-perspective)
- 张一鸣 (zhang-yiming-perspective)
- 张小龙 (zhangxiaolong-perspective)
- 罗永浩 (luoyonghao-perspective)
- 周杰伦 (zhoujielun-perspective)

## 开发

### 运行测试

```bash
# 运行简单测试
node test-simple.js

# 运行完整测试
node test-full.js
```

### 添加新人格

1. 在 `nuwa-skill/examples/` 目录下创建新文件夹，命名格式为 `{name}-perspective`
2. 创建 `SKILL.md` 文件，定义人格特征
3. 参考现有 SKILL.md 文件格式

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

## 联系方式

如有问题或建议，请通过 Issue 反馈。