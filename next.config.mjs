/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @huggingface/transformers 含原生/二进制依赖（ONNX 运行时），
    // 不能被 webpack 打包，需作为服务端外部包，由 Node 直接 require。
    serverComponentsExternalPackages: ["@huggingface/transformers"],
    // Vercel serverless 打包:把模型与向量索引显式带进函数(动态 fs 读取不会被自动追踪)
    outputFileTracingIncludes: {
      "/api/ask": ["./models/**/*", "./data/embeddings.json"],
      "/api/search": ["./models/**/*", "./data/embeddings.json"],
    },
    // 只保留 Linux 的 ONNX 运行时二进制,darwin/win32(约 60MB)不进函数包
    outputFileTracingExcludes: {
      "*": [
        "node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
        "node_modules/onnxruntime-node/bin/napi-v3/win32/**",
      ],
    },
  },
};

export default nextConfig;
