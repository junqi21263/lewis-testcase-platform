#!/bin/bash

# EdgeOne 匹配类型修复脚本
# 用于快速修复匹配类型错误

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}    EdgeOne 匹配类型修复脚本             ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# 显示当前问题
echo -e "${YELLOW}🔍 当前问题：${NC}"
echo "  • 匹配类型选择错误：使用了 '客户端 IP' 而不是 'URL 路径'"
echo "  • 错误提示：'请输入正确的IP或IP段'"
echo "  • 需要修复：选择正确的匹配类型来匹配 URL 路径"
echo ""

# 修复步骤
echo -e "${GREEN}🛠️ 修复步骤：${NC}"
echo "  1. 取消当前错误的配置"
echo "  2. 重新添加规则"
echo "  3. 选择 'URL 路径' 匹配类型"
echo "  4. 配置正确的路径匹配"
echo "  5. 保存并验证配置"
echo ""

# 提供详细指导
echo -e "${YELLOW}📋 详细操作指南：${NC}"
echo "  1. 在 EdgeOne 控制台，点击 '取消' 按钮取消当前配置"
echo "  2. 点击 '添加规则' 重新开始配置"
echo "  3. 在 '匹配类型' 下拉菜单中选择 'URL 路径'"
echo "  4. 在 '匹配内容' 中输入 '/auth/*'"
echo "  5. 选择 '拦截' 作为执行动作"
echo "  6. 点击 '保存' 保存配置"
echo ""

# 验证配置
echo -e "${YELLOW}🧪 验证配置：${NC}"
echo "  配置完成后，运行以下命令验证："
echo ""
echo "  curl -X GET \"https://<your-frontend-domain>/api/auth/login\" -v"
echo "  curl -X POST \"https://<your-frontend-domain>/api/auth/login\" \\"
echo "    -H \"Content-Type: application/json\" \\"
echo "    -d '{\"username\":\"test\",\"password\":\"<占位>\"}' \\"
echo "    -v"
echo ""

# 关键要点
echo -e "${YELLOW}⚠️ 关键要点：${NC}"
echo "  • 不要使用 '客户端 IP' 匹配类型来匹配 URL 路径"
echo "  • 必须使用 'URL 路径' 匹配类型"
echo "  • 确保路径以 '/' 开头，如 '/auth/*'"
echo "  • 等待 5-10 分钟让配置生效"
echo ""

# 完成提示
echo -e "${GREEN}✅ 修复完成！${NC}"
echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}    修复指导结束                       ${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""