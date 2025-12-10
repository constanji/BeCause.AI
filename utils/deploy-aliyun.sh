#!/bin/bash

# Aipyq 阿里云部署脚本
# 使用方法: ./deploy-aliyun.sh

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 全局变量
COMPOSE_FILE=""

# 打印带颜色的消息
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查是否为 root 用户
check_root() {
    if [ "$EUID" -eq 0 ]; then 
        print_warn "检测到 root 用户，建议使用普通用户 + sudo"
    fi
}

# 检查操作系统
check_os() {
    print_info "检查操作系统..."
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VER=$VERSION_ID
        print_info "操作系统: $OS $VER"
    else
        print_error "无法检测操作系统"
        exit 1
    fi
}

# 检查 Docker 是否安装
check_docker() {
    print_info "检查 Docker 安装..."
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version)
        print_info "Docker 已安装: $DOCKER_VERSION"
    else
        print_warn "Docker 未安装，开始安装..."
        install_docker
    fi
    
    if command -v docker compose &> /dev/null || command -v docker-compose &> /dev/null; then
        print_info "Docker Compose 已安装"
    else
        print_warn "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi
}

# 安装 Docker
install_docker() {
    print_info "开始安装 Docker..."
    
    if [ "$OS" == "ubuntu" ] || [ "$OS" == "debian" ]; then
        sudo apt-get update
        sudo apt-get install -y \
            ca-certificates \
            curl \
            gnupg \
            lsb-release
        
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
    elif [ "$OS" == "centos" ] || [ "$OS" == "rhel" ]; then
        sudo yum install -y yum-utils
        sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        sudo yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    else
        print_error "不支持的操作系统: $OS"
        exit 1
    fi
    
    sudo systemctl start docker
    sudo systemctl enable docker
    
    # 将当前用户添加到 docker 组
    if [ "$EUID" -ne 0 ]; then
        sudo usermod -aG docker $USER
        print_warn "已将用户 $USER 添加到 docker 组，需要重新登录才能生效"
    fi
    
    print_info "Docker 安装完成"
}

# 检查项目文件
check_project_files() {
    print_info "检查项目文件..."
    
    if [ ! -f "deploy-compose.yml" ] && [ ! -f "docker-compose.yml" ]; then
        print_error "未找到 docker-compose.yml 或 deploy-compose.yml 文件"
        exit 1
    fi
    
    # 优先使用 deploy-compose.yml
    if [ -f "deploy-compose.yml" ]; then
        COMPOSE_FILE="deploy-compose.yml"
        print_info "使用 deploy-compose.yml"
    else
        COMPOSE_FILE="docker-compose.yml"
        print_info "使用 docker-compose.yml"
    fi
    
    if [ ! -f "Aipyq.yaml" ]; then
        print_warn "未找到 Aipyq.yaml 文件，请确保配置文件存在"
    fi
    
    if [ ! -f ".env" ]; then
        print_warn "未找到 .env 文件，将创建示例文件"
        create_env_file
    fi
    
    print_info "项目文件检查完成"
}

# 创建 .env 文件
create_env_file() {
    print_info "创建 .env 文件..."
    
    # 获取服务器 IP
    SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print $1}')
    
    cat > .env << EOF
# ==========================================
# Aipyq 环境配置文件
# ==========================================
NODE_ENV=production

# ==========================================
# 域名配置
# ==========================================
# 请将下面的 IP 地址替换为您的域名或服务器 IP
DOMAIN_CLIENT=http://${SERVER_IP}:3080
DOMAIN_SERVER=http://${SERVER_IP}:3080

# ==========================================
# MongoDB 配置
# ==========================================
MONGO_URI=mongodb://mongodb:27017/Aipyq
MONGO_PORT=27017

# ==========================================
# Meilisearch 配置
# ==========================================
# 请更改此密钥为随机字符串
MEILI_MASTER_KEY=$(openssl rand -hex 32)

# ==========================================
# 端口配置
# ==========================================
API_PORT=3080
RAG_PORT=8000
MEILI_PORT=7700

# ==========================================
# Docker 镜像配置
# ==========================================
DOCKER_REGISTRY=ghcr.io
DOCKER_REGISTRY_USER=constanjin
IMAGE_PREFIX=aipyq
IMAGE_TAG=latest

# ==========================================
# 用户权限配置
# ==========================================
UID=$(id -u)
GID=$(id -g)
EOF
    
    print_info ".env 文件已创建，请根据需要修改配置"
    print_warn "重要：请修改 MEILI_MASTER_KEY 和域名配置！"
}

# 检查端口占用
check_ports() {
    print_info "检查端口占用..."
    
    PORTS=(3080 27017 7700 8000)
    for PORT in "${PORTS[@]}"; do
        if command -v netstat &> /dev/null; then
            if netstat -tuln | grep -q ":$PORT "; then
                print_warn "端口 $PORT 已被占用"
            else
                print_info "端口 $PORT 可用"
            fi
        elif command -v ss &> /dev/null; then
            if ss -tuln | grep -q ":$PORT "; then
                print_warn "端口 $PORT 已被占用"
            else
                print_info "端口 $PORT 可用"
            fi
        fi
    done
}

# 拉取 Docker 镜像
pull_images() {
    print_info "拉取 Docker 镜像..."
    
    if docker compose -f "$COMPOSE_FILE" pull; then
        print_info "镜像拉取完成"
    else
        print_error "镜像拉取失败，请检查网络连接"
        exit 1
    fi
}

# 启动服务
start_services() {
    print_info "启动服务..."
    
    if docker compose -f "$COMPOSE_FILE" up -d; then
        print_info "服务启动成功"
    else
        print_error "服务启动失败"
        exit 1
    fi
    
    # 等待服务启动
    print_info "等待服务启动..."
    sleep 10
    
    # 检查服务状态
    check_services
}

# 检查服务状态
check_services() {
    print_info "检查服务状态..."
    
    docker compose -f "$COMPOSE_FILE" ps
    
    # 检查各个容器（根据 deploy-compose.yml 中的容器名称）
    SERVICES=("Aipyq-API" "pyqchat-mongodb" "chat-meilisearch" "vectordb" "rag_api")
    for SERVICE in "${SERVICES[@]}"; do
        if docker ps | grep -q "$SERVICE"; then
            print_info "$SERVICE 运行正常"
        else
            print_warn "$SERVICE 未运行，请检查日志: docker logs $SERVICE"
        fi
    done
}

# 显示访问信息
show_access_info() {
    SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || hostname -I | awk '{print $1}')
    
    print_info "=========================================="
    print_info "部署完成！"
    print_info "=========================================="
    print_info "访问地址: http://${SERVER_IP}:3080"
    print_info ""
    print_info "常用命令:"
    print_info "  查看日志: docker compose -f $COMPOSE_FILE logs -f"
    print_info "  查看状态: docker compose -f $COMPOSE_FILE ps"
    print_info "  停止服务: docker compose -f $COMPOSE_FILE down"
    print_info "  重启服务: docker compose -f $COMPOSE_FILE restart"
    print_info "=========================================="
}

# 主函数
main() {
    print_info "开始 Aipyq 部署流程..."
    print_info "=========================================="
    
    check_root
    check_os
    check_docker
    check_project_files
    check_ports
    
    read -p "是否继续部署？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "部署已取消"
        exit 0
    fi
    
    pull_images
    start_services
    show_access_info
    
    print_info "部署完成！"
}

# 运行主函数
main

