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
    // 只保留 linux/x64 的 ONNX 运行时二进制(Vercel 目标平台),其余平台约 52MB 不进函数包。
    // 注意:onnxruntime-node 嵌套安装在 @huggingface/transformers/node_modules 下,napi 版本目录用 ** 通配。
    // 该配置只影响部署打包追踪,本地运行仍直接用 node_modules,不受影响。
    outputFileTracingExcludes: {
      "*": [
        "node_modules/@huggingface/transformers/node_modules/onnxruntime-node/bin/**/darwin/**",
        "node_modules/@huggingface/transformers/node_modules/onnxruntime-node/bin/**/win32/**",
        "node_modules/@huggingface/transformers/node_modules/onnxruntime-node/bin/**/linux/arm64/**",
      ],
    },
  },
};

export default nextConfig;
