#!/usr/bin/env bash
# 在 VPS 上对比「env 文件」与「容器内实际 COS 变量」（只打印长度与后四位，不泄露完整密钥）
# 用法：cd /opt/lewis_testcase_platform_dev && bash scripts/diagnose-cos-vps.sh
set -euo pipefail

ENV_FILE="${1:-.env.development}"
CONTAINER="${2:-testcase_dev_backend}"

mask_var() {
  local name="$1"
  local val="$2"
  local len=${#val}
  local suffix=""
  if [ "$len" -ge 4 ]; then suffix="${val: -4}"; elif [ "$len" -gt 0 ]; then suffix="***"; fi
  printf '%s\tlen=%s\tsuffix=%s\n' "$name" "$len" "$suffix"
}

echo "━━ env file: $ENV_FILE ━━"
if [ ! -f "$ENV_FILE" ]; then
  echo "文件不存在: $ENV_FILE"
  exit 1
fi
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|'#'*) continue ;;
    COS_*=*)
      k="${line%%=*}"
      v="${line#*=}"
      v="${v%%#*}"
      v="$(printf '%s' "$v" | sed -e 's/^[[:space:]"'"'"']*//' -e 's/[[:space:]"'"'"']*$//')"
      mask_var "$k(file)" "$v"
      ;;
  esac
done <"$ENV_FILE"

echo ""
echo "━━ container: $CONTAINER ━━"
if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "容器不存在，请 docker ps 确认名称（生产多为 testcase_backend）"
  exit 1
fi

docker exec "$CONTAINER" node -e "
const keys = ['COS_SECRET_ID','COS_SECRET_KEY','COS_BUCKET','COS_REGION','COS_PREFIX'];
for (const k of keys) {
  const v = process.env[k] || '';
  const suffix = v.length >= 4 ? v.slice(-4) : (v ? '***' : '');
  console.log(k + '\\tlen=' + v.length + '\\tsuffix=' + suffix + (k.includes('BUCKET')||k.includes('REGION')||k.includes('PREFIX') ? '\\tvalue=' + v : ''));
}
"

echo ""
echo "━━ COS API probe (容器内 putObject 1 字节) ━━"
docker exec "$CONTAINER" node -e "
const COS = require('cos-nodejs-sdk-v5');
const sid = (process.env.COS_SECRET_ID||'').trim();
const sk = (process.env.COS_SECRET_KEY||'').trim();
const bucket = (process.env.COS_BUCKET||'').trim();
const region = (process.env.COS_REGION||'').trim();
if (!sid||!sk||!bucket||!region) { console.log('SKIP: COS 四项不齐'); process.exit(0); }
const cos = new COS({ SecretId: sid, SecretKey: sk });
const key = (process.env.COS_PREFIX||'').replace(/\\s+#.*/,'').trim() + '_probe.txt';
cos.putObject({ Bucket: bucket, Region: region, Key: key, Body: '1' }, (err) => {
  if (err) { console.log('FAIL:', err.message); process.exit(1); }
  cos.deleteObject({ Bucket: bucket, Region: region, Key: key }, () => console.log('OK: putObject succeeded'));
});
" || true

echo ""
echo "提示：若 file 与 container 的 len/suffix 不一致，说明 compose 未用 env_file 注入或改 env 后未 recreate 容器。"
echo "HTTP 探针（需新镜像）: curl -s http://127.0.0.1:3000/api/health/cos | jq"
