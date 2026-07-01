/** @type {import('next').NextConfig} */
const nextConfig = {
  // @huggingface/transformers 含原生/二进制依赖（ONNX 运行时），
  // 不能被 webpack 打包，需作为服务端外部包，由 Node 直接 require。
  experimental: {
    serverComponentsExternalPackages: ["@huggingface/transformers"],
  },
};

export default nextConfig;
