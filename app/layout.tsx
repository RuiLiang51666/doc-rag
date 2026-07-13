import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "开发者文档",
  description: "开发者文档站 · 内置 AI 智能助手，基于本地文档检索即时问答",
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
