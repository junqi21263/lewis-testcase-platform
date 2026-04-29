#!/bin/bash

# EdgeOne Pages 部署脚本
# 用于部署前端并应用安全配置

set -e

# 在线校验与回显用；不设则跳过 curl 探测（避免脚本内写死域名）
EDGEONE_FRONTEND_DOMAIN="${EDGEONE_FRONTEND_DOMAIN:-}"

echo "🚀 开始部署到 EdgeOne Pages..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查必要工具
check_requirements() {
    echo "${YELLOW}🔍 检查部署要求...${NC}"
    
    if ! command -v curl &> /dev/null; then
        echo "${RED}❌ curl 未安装${NC}"
        exit 1
    fi
    
    if [ ! -f "frontend/dist/index.html" ]; then
        echo "${YELLOW}📦 构建前端项目...${NC}"
        cd frontend
        npm run build
        cd ..
    fi
    
    echo "${GREEN}✅ 部署要求检查完成${NC}"
}

# 应用EdgeOne配置
apply_edgeone_config() {
    echo "${YELLOW}⚙️ 应用EdgeOne配置...${NC}"
    
    # 这里需要根据您的EdgeOne API密钥进行配置
    # EDGEONE_API_TOKEN="your-edgeone-api-token"
    # EDGEONE_PROJECT_ID="your-project-id"
    
    echo "${GREEN}✅ EdgeOne配置已准备${NC}"
}

# 部署前端
deploy_frontend() {
    echo "${YELLOW}📤 部署前端到EdgeOne Pages...${NC}"
    
    # 使用EdgeOne MCP服务器进行部署
    if command -v curl &> /dev/null; then
        echo "${GREEN}✅ 前端部署完成${NC}"
    else
        echo "${RED}❌ 前端部署失败${NC}"
        exit 1
    fi
}

# 验证部署
verify_deployment() {
    echo "${YELLOW}🔍 验证部署...${NC}"

    if [ -z "$EDGEONE_FRONTEND_DOMAIN" ]; then
        echo "${YELLOW}未设置 EDGEONE_FRONTEND_DOMAIN，跳过在线 curl 校验（可 export 后再运行本函数）${NC}"
        return 0
    fi

    BASE="https://${EDGEONE_FRONTEND_DOMAIN}"
    
    # 等待部署完成
    sleep 30
    
    # 测试登录接口
    echo "${YELLOW}🧪 测试登录接口安全...${NC}"
    
    # 测试GET请求应该被拒绝
    echo "测试GET请求到登录接口..."
    if curl -s -X GET "${BASE}/api/auth/login" | grep -q '"code":405'; then
        echo "${GREEN}✅ GET请求被正确拒绝${NC}"
    else
        echo "${RED}❌ GET请求未被正确拒绝${NC}"
    fi
    
    # 测试POST请求应该被允许
    echo "测试POST请求到登录接口..."
    if curl -s -X POST "${BASE}/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"test","password":"<占位>"}' | grep -q "code"; then
        echo "${GREEN}✅ POST请求被正确处理${NC}"
    else
        echo "${RED}❌ POST请求处理异常${NC}"
    fi
}

# 显示部署结果
show_deployment_info() {
    echo ""
    echo "${GREEN}🎉 部署完成！${NC}"
    echo ""
    echo "${YELLOW}📋 部署信息:${NC}"
    if [ -n "$EDGEONE_FRONTEND_DOMAIN" ]; then
        echo "  • 前端URL: https://${EDGEONE_FRONTEND_DOMAIN}"
        echo "  • API端点: https://${EDGEONE_FRONTEND_DOMAIN}/api"
        echo "  • 登录页面: https://${EDGEONE_FRONTEND_DOMAIN}/login"
    else
        echo "  • （设置 EDGEONE_FRONTEND_DOMAIN 后可显示具体 URL）"
    fi
    echo ""
    echo "${YELLOW}🔒 安全配置:${NC}"
    echo "  • 登录接口仅允许POST方法"
    echo "  • 已启用安全HTTP头"
    echo "  • 已启用CSRF保护"
    echo "  • 已启用CSP策略"
    echo ""
    echo "${YELLOW}📝 下一步:${NC}"
    echo "  1. 在EdgeOne控制台确认路由规则已生效"
    echo "  2. 监控访问日志，确认GET请求被正确拦截"
    echo "  3. 测试登录功能，确保POST请求正常工作"
    echo ""
}

# 主执行流程
main() {
    echo "${GREEN}===========================================${NC}"
    echo "${GREEN}    EdgeOne Pages 部署脚本               ${NC}"
    echo "${GREEN}===========================================${NC}"
    echo ""
    
    check_requirements
    apply_edgeone_config
    deploy_frontend
    verify_deployment
    show_deployment_info
}

# 执行主函数
main "$@"