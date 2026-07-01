# CLAUDE.md

本项目是基于 KaiwuDB 中文文档的本地 RAG 文档问答系统（Next.js 14 + 本地 bge-small-zh embedding + 智谱 glm-4-flash 生成）。

## 进度记录约定
- 本项目用 PROGRESS.md 记录开发进度，供跨会话恢复。
- 每当完成一个有意义的阶段（如修复一个问题、完成一个功能、重建索引等），主动更新 PROGRESS.md：更新"已完成"、"待解决问题"、"下一步"三部分。
- 每次会话开始时，先读取 PROGRESS.md 了解当前进度。
- 当我提到"额度快用完""要休息了"时，立即把最新进度写入 PROGRESS.md。
