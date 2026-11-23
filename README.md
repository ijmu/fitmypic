# FitMyPic

在线图片工具站源码 —— 在浏览器本地运行的图片处理工具，处理在用户浏览器内完成，无需注册账号。与 pngtoolbox 是同模板姊妹站：本站偏综合图片编辑，pngtoolbox 专攻 PNG / WebP 格式转换。

## 主要工具页（根目录 *.html）

- 图片压缩：compress-image、批量压缩、压到 50KB / 100KB
- 图片缩放：image-resizer，以及 Instagram、YouTube、证件照、1024×1024 等场景尺寸页
- 去背景：remove-background-from-image
- 辅助工具：图片尺寸检查、图片元数据查看、证件照规格说明
- 另有图片文件大小、缩放算法、打印分辨率等指南页，及 about / privacy / terms 等站点页

## 目录结构

- 根目录 `*.html`：各工具页与内容页；`styles.css` 等为全局样式
- `src/`：TypeScript 源码（batch-tool.ts 批量处理、exif.ts 元数据、task-tool.ts、transparent-tool.ts 等）
- `scripts/`：构建脚本（copy-static.mjs 等）
- `assets/`：静态资源

## 本地运行与构建

```bash
npm install
npm run dev        # Vite 本地开发
npm run build      # 构建并输出到 dist/
npm run typecheck  # 类型检查
```

## 部署

Vercel 静态部署：`vercel.json` 指定构建命令与输出目录 `dist`。
