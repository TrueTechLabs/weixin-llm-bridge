# weixin-llm-bridge

一个基于 Node.js 22 和 TypeScript 的轻量微信 iLink 到 OpenAI 兼容接口桥接器。

项目参考腾讯 [`Tencent/openclaw-weixin`](https://github.com/Tencent/openclaw-weixin) 的微信协议实现，仅保留扫码登录、Token 保存、`getupdates` 长轮询、私聊文本解析、输入状态和 `sendmessage` 回复能力，不依赖 OpenClaw、Agent、Skill 或 Plugin SDK。

## 功能

- 单微信账号
- 仅处理私聊文本
- 微信扫码登录，Token 本地持久化
- OpenAI Chat Completions 兼容接口
- 自定义 Base URL、API Key、模型、温度和上下文轮次
- `/new` 清空当前用户会话
- 用户白名单
- 消息持久化去重
- 同一用户串行处理，不同用户可并行
- 模型处理期间显示“正在输入”，每 5 秒续期
- 请求超时、指数退避重试
- Token、API Key、上下文 Token、Typing Ticket 日志脱敏
- Docker 部署，支持 `linux/amd64` 和 `linux/arm64`

## 工作流程

```text
微信私聊
  -> getupdates 长轮询
  -> 白名单与消息去重
  -> 加载用户上下文
  -> 调用 OpenAI 兼容接口
  -> sendmessage 回复微信
```

## 环境要求

- Node.js 22 或更高版本
- npm
- 使用 Docker 部署时需要 Docker 20.10 或更高版本

## 快速开始

安装依赖并创建配置：

```bash
git clone <repository-url>
cd weixin-llm-bridge
npm install
cp .env.example .env
```

编辑 `.env`，至少填写以下配置：

```dotenv
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-your-key
OPENAI_MODEL=gpt-4.1-mini

# 初次调试可以暂时使用 *，生产环境应改成明确的用户 ID
WEIXIN_ALLOW_FROM=*
```

启动：

```bash
npm run dev
```

首次运行会在终端显示二维码。使用微信扫码并在手机上确认后，登录凭据会保存到：

```text
data/credentials.json
```

后续启动不需要再次扫码。

## 白名单配置

收到消息时，日志会显示发送者的 iLink 用户 ID：

```json
{
  "message": "收到私聊文本",
  "userId": "example@im.wechat"
}
```

将 `.env` 中的白名单改为该 ID：

```dotenv
WEIXIN_ALLOW_FROM=example@im.wechat
```

允许多个用户时使用英文逗号分隔：

```dotenv
WEIXIN_ALLOW_FROM=user-a@im.wechat,user-b@im.wechat
```

修改 `.env` 后需要重启程序。

## 配置说明

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI 兼容接口根地址 |
| `OPENAI_API_KEY` | 无 | API Key，必填 |
| `OPENAI_MODEL` | 无 | 模型名称，必填 |
| `OPENAI_TEMPERATURE` | `0.7` | 模型温度，范围 `0` 到 `2` |
| `OPENAI_CONTEXT_TURNS` | `10` | 每用户保留的问答轮数，`0` 表示禁用上下文 |
| `OPENAI_SYSTEM_PROMPT` | `You are a helpful assistant.` | 系统提示词 |
| `WEIXIN_ALLOW_FROM` | 无 | iLink 用户白名单，逗号分隔，`*` 表示允许全部 |
| `WEIXIN_API_BASE_URL` | `https://ilinkai.weixin.qq.com` | 微信扫码登录接口 |
| `WEIXIN_BOT_TYPE` | `3` | 微信 iLink Bot 类型 |
| `DATA_DIR` | `./data` | 凭据和运行状态目录 |
| `LOG_LEVEL` | `info` | `debug`、`info`、`warn` 或 `error` |
| `REQUEST_TIMEOUT_MS` | `60000` | 普通 HTTP 请求超时 |
| `LONG_POLL_TIMEOUT_MS` | `35000` | 微信长轮询超时 |
| `RETRY_ATTEMPTS` | `3` | 模型请求和微信回复最大尝试次数 |
| `RETRY_BASE_DELAY_MS` | `1000` | 指数退避基础延迟 |
| `DEDUPE_MAX_SIZE` | `2000` | 消息去重窗口大小 |
| `SEND_ERROR_MESSAGE` | `true` | 模型调用失败时是否回复通用错误消息 |

`OPENAI_BASE_URL` 应填写接口根路径，程序会在其后拼接 `/chat/completions`。例如代理接口实际地址为：

```text
https://example.com/openai/v1/chat/completions
```

则配置应为：

```dotenv
OPENAI_BASE_URL=https://example.com/openai/v1
```

## 会话管理

每个微信用户拥有独立上下文。同一用户的消息按收到顺序串行处理，避免并发请求打乱上下文。

在微信中发送：

```text
/new
```

即可清空当前用户的上下文。上下文仅保存在内存中，程序重启后也会清空。

## 生产构建

```bash
npm run typecheck
npm test
npm run build
npm start
```

编译结果位于 `dist/`。

## Docker 运行

构建当前机器架构的镜像：

```bash
docker build -t weixin-llm-bridge:latest .
```

首次运行需要交互式终端扫码：

```bash
mkdir -p data

docker run --rm -it \
  --name weixin-llm-bridge \
  --env-file .env \
  -v "$PWD/data:/app/data" \
  weixin-llm-bridge:latest
```

扫码成功并生成 `data/credentials.json` 后，可以改为后台运行：

```bash
docker run -d \
  --name weixin-llm-bridge \
  --restart unless-stopped \
  --env-file .env \
  -v "$PWD/data:/app/data" \
  weixin-llm-bridge:latest
```

查看日志：

```bash
docker logs -f weixin-llm-bridge
```

停止和删除容器：

```bash
docker stop weixin-llm-bridge
docker rm weixin-llm-bridge
```

## 多架构镜像

创建并初始化 Buildx 构建器：

```bash
docker buildx create \
  --name weixin-llm-bridge-builder \
  --driver docker-container \
  --use

docker buildx inspect --bootstrap
```

分别导出 `amd64` 和 `arm64` 离线镜像：

```bash
mkdir -p release

docker buildx build \
  --platform linux/amd64 \
  -t weixin-llm-bridge:0.1.0-amd64 \
  --output type=docker,dest=release/weixin-llm-bridge-0.1.0-linux-amd64.tar \
  .

docker buildx build \
  --platform linux/arm64 \
  -t weixin-llm-bridge:0.1.0-arm64 \
  --output type=docker,dest=release/weixin-llm-bridge-0.1.0-linux-arm64.tar \
  .
```

在目标服务器导入：

```bash
docker load -i weixin-llm-bridge-0.1.0-linux-amd64.tar
```

ARM64 服务器使用：

```bash
docker load -i weixin-llm-bridge-0.1.0-linux-arm64.tar
```

导入后按前面的 Docker 运行命令启动，只需将镜像名称替换为对应架构标签。

如需发布到镜像仓库，可直接创建多架构清单：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t your-registry/weixin-llm-bridge:0.1.0 \
  -t your-registry/weixin-llm-bridge:latest \
  --push \
  .
```

## 数据文件

`DATA_DIR` 中包含：

```text
data/
├── credentials.json  # 微信 Token、账号 ID 和接口地址
└── state.json        # getupdates 游标和消息去重窗口
```

请持久化整个 `data/` 目录。删除 `credentials.json` 后，下次启动会要求重新扫码。

## 常见问题

### 模型请求返回 HTTP 404

通常是 `OPENAI_BASE_URL` 缺少 `/v1` 或包含了多余的 `/chat/completions`。

正确示例：

```dotenv
OPENAI_BASE_URL=https://example.com/v1
```

### 模型请求返回 HTTP 502

请求已经到达代理，但代理上游模型调用失败。检查：

- 模型名称是否被代理支持
- API Key 是否有该模型权限
- 代理上游是否可用
- 换用代理模型列表中的其他模型测试

### 收到消息但没有回复

检查日志以及以下配置：

- 用户是否在 `WEIXIN_ALLOW_FROM` 中
- `OPENAI_BASE_URL` 是否正确
- 模型名称是否存在
- API Key 是否有效

### 没有显示“正在输入”

确认使用的是最新构建，并重启程序或容器：

```bash
npm run build
npm start
```

Docker 环境需要重新构建镜像。

### 需要重新扫码

停止程序并删除凭据：

```bash
rm data/credentials.json
```

再次启动即可重新扫码。

## 安全说明

- 不要提交 `.env`、`data/` 或离线镜像中的私有配置。
- 不要把 API Key 写入 Dockerfile 或镜像构建参数。
- `credentials.json` 以 `0600` 权限写入，仍需保护宿主机和容器卷权限。
- 生产环境应使用明确的 `WEIXIN_ALLOW_FROM`，不建议长期配置为 `*`。
- 日志会脱敏常见敏感字段，但仍不应公开完整运行日志。

## 协议说明

微信 iLink 接口不是本项目维护的公开标准，未来可能发生变化。本项目当前协议字段参考：

- `Tencent/openclaw-weixin`
- `@tencent-weixin/openclaw-weixin` 2.4.3

本项目与腾讯、微信及 OpenAI 无隶属关系。
