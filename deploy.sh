#!/bin/bash

set -e

echo "========== Nuwa Chat 部署脚本 =========="

if [ ! -f ".env" ]; then
    echo "错误: .env 文件不存在"
    echo "请先复制 .env.example 为 .env 并填入您的 API Key"
    exit 1
fi

echo "1. 构建 Docker 镜像..."
docker build -t nuwa-chat:latest .

echo "2. 停止并删除旧容器..."
docker stop nuwa-chat 2>/dev/null || true
docker rm nuwa-chat 2>/dev/null || true

echo "3. 启动新容器..."
docker-compose up -d

echo "4. 查看容器状态..."
docker ps | grep nuwa-chat

echo ""
echo "========== 部署完成 =========="
echo "服务地址: http://your_server_ip:3098"
echo "查看日志: docker-compose logs -f"