# doc-rag · 智能问答

**基于本地向量库的 RAG 文档问答 demo** —— 把一套静态的数据库产品文档(KWDB)变成可对话的知识库:流式回答、来源可溯、支持多轮追问,拒绝幻觉。

🟢 [在线体验](https://liangrui-qa.vercel.app) · 📄 [作者作品集](https://liangrui.vercel.app)

## 它能做什么

- **流式响应**:SSE 逐块输出,答案生成的瞬间即可开始阅读;
- **本地向量化**:查询用 `bge-small-zh-v1.5`(q8 量化,23MB,随仓库打包)在函数内向量化,零外部 embedding 调用;
- **查询改写**:本地规则把宽泛输入(「KWDB 是什么」)扩写成高召回查询,零网络开销;
- **来源标注,拒绝幻觉**:模型只答检索片段内的内容,答不了就明说;每条回答附实际引用的来源(文件路径 + 命中段落可展开);
- **多轮追问**:携带对话历史,「第二种方式的前置要求?」这类指代追问能正确解析(检索融合上一问 + 上一答);
- **回答内链接转追问**:知识库内部的相对链接在站外必然 404,自动转成「点击即追问」入口;
- **优雅降级**:超时/断连自动重试(指数退避),失败给一键重试卡片,不裸奔 network error。

## 架构

```
用户提问(+ 对话历史)
  → 本地规则查询改写(lib/llm.ts · 零网络)
  → bge-small-zh q8 向量化(lib/search.ts · onnxruntime,模型随仓库)
  → 内存向量索引点积检索 Top-8(data/embeddings.json,33MB)
  → GLM 流式生成(历史注入 messages;系统提示词约束「只答片段内的事实」)
  → 内部片段标记三层清洗(边界守卫 + 逐块正则 + 前端兜底)
  → SSE 推流 + 尾部 META(实际引用的来源)
  → 消息线程 UI(app/components/Assistant.tsx)
```

## 快速开始

```bash
npm install
cp .env.example .env.local   # 填 LLM_API_KEY(智谱,或任意 OpenAI 兼容接口)
npm run build-index          # 从文档语料构建向量索引(首次;仓库已带现成索引可跳过)
npm run dev                  # http://localhost:3000
```

环境变量:`LLM_API_KEY` / `LLM_BASE_URL`(默认智谱)/ `LLM_MODEL`(默认 glm-4-flash)。

## 工程记录(踩坑与决策)

- **Serverless 化**:从 Render 常驻容器迁至 Vercel,冷启动 ~60s → 秒级。模型改 q8 量化随仓库打包(与 fp32 索引实测 Top-3 检索完全一致),`outputFileTracingIncludes` 显式携带模型/索引/`sharp` 平台二进制(动态 require 不被追踪)、剔除非 linux-x64 的 ONNX 运行时,函数包 93MB。
- **mac lockfile 坑**:macOS 生成的 package-lock 不含 linux 平台包条目,`npm ci` 在构建机上装不出 `@img/sharp-linux-x64`——显式声明进 `optionalDependencies` 根治。
- **流式标记泄漏**:内部引用标记(「片段 N」)跨 chunk 被劈开后两侧都匹配不上清洗正则。三层防护:服务端推送窗口内的括号边界守卫、逐块正则清洗、前端在累积全文上兜底再清一遍。
- **多轮指代检索**:「第二种呢?」单独向量化召回为零——检索文本融合上一条问题与上一条回答的开头(指代对象通常在上一条回答的列表里),并在系统提示词中约定序数指代以助手上一条列举顺序为准。

## 目录结构

```
app/api/ask/      # 流式问答(检索 + 生成 + 片段标记清洗 + META 来源)
app/api/search/   # 纯检索接口(调试用)
app/components/   # 悬浮助手(消息线程/重试/来源展开/链接转追问)
lib/search.ts     # 本地向量化 + 内存索引检索
lib/llm.ts        # 查询改写 / 系统提示词 / 历史裁剪 / 标记清洗
models/           # bge-small-zh-v1.5 q8(随仓库,serverless 离线加载)
data/             # 向量索引 embeddings.json
scripts/          # build-index / chunk-docs / search-cli
```
