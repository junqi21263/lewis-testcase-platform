#!/bin/bash

# EdgeOne 配置验证脚本
# 用于验证路由规则和安全配置是否正确应用

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
DOMAIN="lewis-testcase-platform-xyqvs7bh.edgeone.cool"
API_BASE="https://$DOMAIN/api"
LOGIN_URL="$API_BASE/auth/login"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="test123"

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}    EdgeOne 配置验证脚本                 ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# 函数：显示测试结果
show_result() {
    local test_name="$1"
    local expected="$2"
    local actual="$3"
    local status="$4"
    
    if [ "$status" = "pass" ]; then
        echo -e "✅ ${test_name}: ${GREEN}通过${NC} (预期: $expected, 实际: $actual)"
    else
        echo -e "❌ ${test_name}: ${RED}失败${NC} (预期: $expected, 实际: $actual)"
    fi
}

# 函数：测试 HTTP 状态码
test_status_code() {
    local url="$1"
    local expected_status="$2"
    local test_name="$3"
    
    echo -e "${YELLOW}🧪 测试 $test_name...${NC}"
    
    # 获取状态码
    local status_code=$(curl -s -o /dev/null -w "%{http_code}" -X "$4" "$url" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)
    
    # 检查结果
    if [ "$status_code" = "$expected_status" ]; then
        show_result "$test_name" "$expected_status" "$status_code" "pass"
        return 0
    else
        show_result "$test_name" "$expected_status" "$status_code" "fail"
        return 1
    fi
}

# 函数：测试响应内容
test_response_content() {
    local url="$1"
    local expected_content="$2"
    test_name="$3"
    
    echo -e "${YELLOW}🧪 测试 $test_name...${NC}"
    
    # 获取响应内容
    local response=$(curl -s -X GET "$url" 2>/dev/null)
    
    # 检查结果
    if echo "$response" | grep -q "$expected_content"; then
        show_result "$test_name" "包含: $expected_content" "找到" "pass"
        return 0
    else
        show_result "$test_name" "包含: $expected_content" "未找到" "fail"
        return 1
    fi
}

# 函数：测试登录功能
test_login_functionality() {
    echo -e "${YELLOW}🧪 测试登录功能...${NC}"
    
    # 测试正常登录（应该返回正常响应，可能是错误但不是 405）
    local response=$(curl -s -X POST "$LOGIN_URL" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)
    
    # 检查响应是否是 JSON 格式（正常响应）
    if echo "$response" | grep -q '"code"' || echo "$response" | grep -q '"message"'; then
        show_result "登录功能" "正常响应" "JSON 格式响应" "pass"
        return 0
    else
        show_result "登录功能" "正常响应" "异常响应" "fail"
        return 1
    fi
}

# 主测试函数
run_tests() {
    echo -e "${YELLOW}🚀 开始测试 EdgeOne 配置...${NC}"
    echo ""
    
    local tests_passed=0
    local tests_failed=0
    
    # 测试 1: GET 请求到登录接口应该返回 405
    if test_status_code "$LOGIN_URL" "405" "GET 请求拦截" "GET"; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    # 测试 2: GET 请求响应应该包含 Method Not Allowed
    if test_response_content "$LOGIN_URL" "Method Not Allowed" "GET 请求内容验证"; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    # 测试 3: POST 请求到登录接口应该返回 200 或其他状态码（不是 405）
    if test_status_code "$LOGIN_URL" "200" "POST 请求允许" "POST"; then
        ((tests_passed++))
    else
        # 如果不是 200，检查是否是其他正常状态码（如 400 用户名密码错误）
        local status_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$LOGIN_URL" \
            -H "Content-Type: application/json" \
            -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" 2>/dev/null)
        
        if [ "$status_code" != "405" ]; then
            show_result "POST 请求允许" "非 405 状态码" "$status_code" "pass"
            ((tests_passed++))
        else
            ((tests_failed++))
        fi
    fi
    
    # 测试 4: 登录功能测试
    if test_login_functionality; then
        ((tests_passed++))
    else
        ((tests_failed++))
    fi
    
    # 测试 5: 检查页面是否正常加载
    echo -e "${YELLOW}🧪 测试页面加载...${NC}"
    local page_response=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/login" 2>/dev/null)
    
    if [ "$page_response" = "200" ]; then
        show_result "页面加载" "200" "$page_response" "pass"
        ((tests_passed++))
    else
        show_result "页面加载" "200" "$page_response" "fail"
        ((tests_failed++))
    fi
    
    return $tests_failed
}

# 显示测试结果
show_results() {
    echo ""
    echo -e "${BLUE}===========================================${NC}"
    echo -e "${BLUE}           测试结果汇总                   ${NC}"
    echo -e "${BLUE}===========================================${NC}"
    echo ""
    
    if [ $tests_failed -eq 0 ]; then
        echo -e "${GREEN}🎉 所有测试通过！EdgeOne 配置正确应用。${NC}"
        echo ""
        echo -e "${YELLOW}📋 配置验证完成：${NC}"
        echo "  ✅ GET 请求到登录接口被正确拦截"
        echo "  ✅ POST 请求到登录接口被正确允许"
        echo "  ✅ 登录功能正常工作"
        echo "  ✅ 页面正常加载"
        echo ""
        echo -e "${GREEN}🔒 安全配置已生效，登录接口现在只允许 POST 方法。${NC}"
    else
        echo -e "${RED}⚠️  有 $tests_failed 个测试失败，请检查配置。${NC}"
        echo ""
        echo -e "${YELLOW}🔧 故障排除建议：${NC}"
        echo "  1. 检查 EdgeOne 控制台的路由规则配置"
        echo "  2. 确认规则优先级正确设置"
        echo "  3. 等待 5-10 分钟让配置生效"
        echo "  4. 检查后端服务是否正常运行"
        echo ""
        echo -e "${RED}📞 如需帮助，请查看 EDGEONE_CONSOLE_GUIDE.md${NC}"
    fi
}

# 显示配置信息
show_config_info() {
    echo ""
    echo -e "${BLUE}📋 当前配置信息：${NC}"
    echo "  • 域名: $DOMAIN"
    echo "  • API 端点: $API_BASE"
    echo "  • 登录接口: $LOGIN_URL"
    echo "  • 测试邮箱: $TEST_EMAIL"
    echo ""
}

# 主执行流程
main() {
    show_config_info
    run_tests
    show_results
    
    # 退出状态码
    if [ $tests_failed -eq 0 ]; then
        exit 0
    else
        exit 1
    fi
}

# 执行主函数
main "$@"