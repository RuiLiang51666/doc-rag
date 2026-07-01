# doc-rag —— 智能问答 RAG 服务 · 常驻容器部署
# 适用 Render / Railway / Fly / 任意容器主机。
# 运行时:本地 bge-small-zh 向量检索(@huggingface/transformers)+ GLM 流式生成。

FROM node:20-slim

WORKDIR /app

# 1) 安装依赖。含 onnxruntime-node 的原生二进制,务必让 install 脚本执行(勿加 --ignore-scripts)。
COPY package.json package-lock.json ./
RUN npm ci

# 2) 拷贝源码与索引。.dockerignore 已排除 node_modules / .next / 多余模型 / 密钥。
COPY . .

# 3) 生产构建。
RUN npm run build

ENV NODE_ENV=production
# Render / Railway 会注入 PORT;本地默认 3000。Next 需监听 0.0.0.0。
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000} -H 0.0.0.0"]
