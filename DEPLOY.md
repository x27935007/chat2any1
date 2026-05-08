# 阿里云部署指南

## 快速开始

### 1. 准备环境

在阿里云服务器上确保已安装以下软件：

- Docker
- Docker Compose

### 2. 克隆代码

```bash
git clone https://github.com/x27935007/chat2any1.git
cd chat2any1
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 API Key
vim .env
```

配置内容示例：
```env
# 阿里云 DashScope API Key
DASHSCOPE_API_KEY=sk-your-actual-api-key

# 端口配置
PORT=3098

# 运行环境
NODE_ENV=production
```

### 4. 执行部署

#### 方式一：使用部署脚本（推荐）

```bash
chmod +x deploy.sh
./deploy.sh
```

#### 方式二：手动部署

```bash
# 构建镜像
docker build -t nuwa-chat:latest .

# 启动容器
docker-compose up -d

# 查看状态
docker ps
```

### 5. 验证部署

访问：`http://你的服务器IP:3098`

## 阿里云安全组配置

确保阿里云安全组开放了以下端口：

| 端口 | 协议 | 用途 |
|------|------|------|
| 3098 | TCP | 应用服务端口 |

## 常用命令

### 查看日志

```bash
# 实时查看日志
docker-compose logs -f

# 查看最近 100 行日志
docker-compose logs --tail=100
```

### 重启服务

```bash
# 重启容器
docker-compose restart

# 停止并重新启动
docker-compose down && docker-compose up -d
```

### 停止服务

```bash
docker-compose down
```

### 更新服务

```bash
# 拉取最新代码
git pull

# 重新部署
./deploy.sh
```

## 数据持久化

- 对话数据存储在 `./data` 目录
- 该目录通过 volume 挂载到 Docker 容器
- 数据会在容器重启后保留

## 故障排查

### 容器无法启动

```bash
# 查看容器日志
docker-compose logs nuwa-chat

# 检查端口是否被占用
netstat -tlnp | grep 3098
```

### API 调用失败

1. 检查 API Key 是否正确配置
2. 查看服务日志：`docker-compose logs -f`
3. 确认 API Key 有足够的配额

## 性能优化建议

### 使用阿里云 ECS

- 推荐配置：2核4GB 起
- 选择合适的地域，降低网络延迟

### 使用 CDN（可选）

对于静态资源，可以配置 CDN 加速：

1. 在阿里云 CDN 控制台添加域名
2. 配置源站为 ECS 服务器
3. 更新域名 DNS 解析

## 备份策略

### 定期备份数据目录

```bash
# 备份脚本示例
#!/bin/bash
BACKUP_DIR="/backup"
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf $BACKUP_DIR/nuwa-chat-data-$DATE.tar.gz ./data

# 保留最近 7 天备份
find $BACKUP_DIR -name "nuwa-chat-data-*.tar.gz" -mtime +7 -delete
```
