# doc-rag 上线部署说明(常驻容器)

智能问答是一个**常驻服务**(每次提问要用 bge 模型给问题算向量 + 33MB 索引在内存里检索),
不适合 Serverless。用容器主机(Render / Railway / Fly)`next start` 跑起来即可,代码几乎不用改。

---

## 一、部署前:把索引提交到仓库(必须)

`data/embeddings.json`(33MB)是运行时必需品,之前没提交过。部署从 git 拉代码,所以要先带上:

```bash
cd ~/doc-rag
git add data/embeddings.json Dockerfile .dockerignore render.yaml DEPLOY.md
git commit -m "chore: 容器部署配置 + 提交向量索引"
git push
```

> embedding 模型(~50MB)**不用**提交:容器首次启动会自动从 HuggingFace 下载到 `.model-cache`。
> 想彻底免下载(更稳、更快冷启动),也可以把 `.model-cache/Xenova/bge-small-zh-v1.5` 一并 `git add` 提交。

## 二、部署到 Render(推荐)

1. 代码推到 GitHub。
2. [render.com](https://render.com) 注册/登录 → **New +** → **Blueprint** → 选这个仓库(会读 `render.yaml`)。
   - 或 **New + → Web Service → Docker**,手动创建。
3. 配置环境变量(仅 `LLM_API_KEY` 需手填):
   | 变量 | 值 |
   |---|---|
   | `LLM_API_KEY` | 你的智谱 GLM Key |
   | `LLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4/`(默认) |
   | `LLM_MODEL` | `glm-4-flash`(默认) |
4. Deploy。首次构建约几分钟;首个请求要加载模型,会慢十几秒,之后正常。

## 三、其它平台

- **Railway**:New Project → Deploy from GitHub,自动识别 Dockerfile;在 Variables 里加上面三个变量。
- **Fly.io**:`fly launch`(检测到 Dockerfile)→ `fly secrets set LLM_API_KEY=...` → `fly deploy`。

## 四、注意事项

- **内存**:模型 + 索引在内存里,建议实例 **≥ 512MB**。free 档 512MB 基本够用但偏紧;若启动 OOM,升到 1GB(Render standard / Railway 增配)。
- **休眠**:免费档闲置会休眠,休眠后首次访问要重新加载(几十秒)。作品集里给这个入口标注一下、或用常亮档,体验更好。
- **密钥安全**:`.env.local` 已被 gitignore,不会进仓库或镜像;线上 key 只存平台环境变量。
- **文档语料**:索引内容目前是 KWDB 中文文档,UI 文案已中性化。想换成别的文档库,替换 `/Users/shuaidong/docs` 后 `npm run build-index:force` 重建索引再提交即可。
