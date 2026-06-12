# Prompt 评测工作台技术设计

## 当前问题

现有 `POST /api/templates/:id/evaluate` 是同步接口。完整评测会串行执行多次模型调用，容易超过普通 HTTP 请求和反向代理超时。前端只能等待最终响应，无法展示真实进度。

## 方案

新增内存后台任务服务 `TemplateEvaluationJobsService`：

- 创建任务时读取模板并保存任务快照。
- 后台异步执行 `AiService.evaluatePromptTemplateWithProgress`。
- 任务服务维护状态、阶段、日志、结果、错误和订阅者。
- 前端通过 `GET /api/templates/evaluations/:jobId/events` 使用 fetch stream 接收 SSE。

## API

### 创建任务

`POST /api/templates/:id/evaluations`

请求体沿用 `EvaluateTemplateDto`。

响应：

```json
{
  "jobId": "uuid",
  "status": "queued",
  "stage": "queued",
  "progress": 0
}
```

### 查询任务

`GET /api/templates/evaluations/:jobId`

返回当前任务快照；任务完成后包含 `report`。

### 订阅进度

`GET /api/templates/evaluations/:jobId/events`

SSE payload：

```json
{
  "jobId": "uuid",
  "status": "running",
  "stage": "original_evaluation",
  "progress": 35,
  "message": "原版 Prompt 样例评测中",
  "logs": []
}
```

### 取消任务

`POST /api/templates/evaluations/:jobId/cancel`

任务会在阶段切换点或下一次进度检查时停止。

## 后端改动

- `TemplatesController`
  - 新增 `POST :id/evaluations`
  - 新增 `GET evaluations/:jobId`
  - 新增 `GET evaluations/:jobId/events`
  - 新增 `POST evaluations/:jobId/cancel`
- `TemplatesService`
  - 新增创建/查询/取消/订阅任务代理方法。
- `TemplateEvaluationJobsService`
  - 管理任务 Map。
  - 广播任务快照。
  - 后台执行评测。
- `AiService`
  - 保留原 `evaluatePromptTemplate`。
  - 新增进度回调参数，用于阶段更新。

## 前端改动

- `templatesApi`
  - 新增 `startEvaluation`
  - 新增 `getEvaluationJob`
  - 新增 `cancelEvaluationJob`
  - 新增 `subscribeEvaluationJobEvents`
- `TemplateEvaluationModal`
  - 支持 `job` 运行态。
  - 运行中显示阶段时间线和日志。
  - 完成后复用现有报告展示。
- `TemplatesPage`
  - 点击评测后创建任务，不再直接等待同步接口。

## Nginx

新增 SSE 专用 location：

```nginx
location ~ ^/api/templates/evaluations/[^/]+/events$ {
    proxy_pass http://$backend_host:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    send_timeout 3600s;
    gzip off;
}
```

## 测试

- 后端单测：
  - 创建任务返回 queued。
  - 任务执行完成后产生 report。
  - 取消任务后状态为 cancelled。
- 前端单测：
  - API 创建任务路径正确。
  - SSE 订阅能解析 data 行。
- 构建验证：
  - `pnpm -C backend test -- prompt-template-evaluation`
  - `pnpm -C backend build`
  - `pnpm -C frontend exec vitest run src/api/templates.unit.test.ts`
  - `pnpm -C frontend build`
