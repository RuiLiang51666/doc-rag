import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能问答 · 梁瑞",
  description: "基于本地知识库的 RAG 智能问答 demo：流式响应、查询改写、来源标注。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
