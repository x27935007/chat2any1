# 贡献指南

欢迎您为 Nuwa Chat 项目贡献代码！

## 贡献方式

### 报告问题

在提交 Issue 之前，请先搜索是否已有相关问题。提交 Issue 时，请提供：

- 清晰的问题描述
- 复现步骤
- 预期行为和实际行为
- 相关截图（如果适用）
- 环境信息（Node.js 版本、操作系统等）

### 提交代码

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/your-feature`)
3. 提交更改 (`git commit -m 'Add some feature'`)
4. 推送到分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

## 开发流程

### 代码风格

- 使用 4 空格缩进
- 使用单引号（除非是模板字符串）
- 变量命名使用 camelCase
- 函数命名使用 camelCase
- 类命名使用 PascalCase
- 文件命名使用 kebab-case

### 提交规范

提交信息格式：

```
<type>: <description>

<optional body>
```

类型说明：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `test`: 测试相关
- `chore`: 构建过程或辅助工具的变动

### 测试

提交代码前，请确保所有测试通过：

```bash
node test-simple.js
```

## 添加新人格

1. 在 `nuwa-skill/examples/` 目录下创建新文件夹，命名格式为 `{name}-perspective`
2. 创建 `SKILL.md` 文件，定义人格特征
3. 创建 `references/` 目录，存放参考文档

### SKILL.md 格式

```markdown
name: 人物名称
description: |
  人物的简要描述

---

## 身份定位
- 身份描述

## 表达风格
- 语言特点
- 常用词汇

## 心智模型
- 核心观点
- 思考方式

## 价值取向
- 价值观描述
```

## Pull Request 流程

1. PR 应该有清晰的标题和描述
2. 确保所有测试通过
3. 代码审查通过后才能合并
4. 保持 PR 简洁，一个 PR 只解决一个问题

## 行为准则

请参考 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## 许可证

所有贡献代码将遵循 MIT 许可证。
