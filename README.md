<div align="center">

<img src="public/pwa-icon.svg" alt="Meliora" width="100" height="100" />

# Meliora

**沉浸式 · 视听一体的网页音乐播放器**

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg?style=flat-square)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5a0fc8?style=flat-square&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](CONTRIBUTING.md)

[在线预览](https://music.abloom.site) · [反馈问题](https://github.com/abloom25/Meliora/issues) · [贡献指南](CONTRIBUTING.md)

</div>

---

## ✨ 特性

- 🎨 **视听一体**:实时节拍分析驱动背景呼吸,封面取色驱动主题色
- 🎵 **零延迟切歌**:三 Audio 池 + 预加载槽 + 650ms 交叉淡化
- 📜 **歌词跟随**:LRC 解析 + FLIP 牵引滚动 + Document Picture-in-Picture 小窗
- 📱 **类原生体验**:PWA 安装、MediaSession 锁屏控制、移动端触感反馈
- 🌐 **匿名曲库**:远程歌单(网易云 / QQ 音乐) + 本地音乐自动合并去重
- ♿ **无障碍**:`prefers-reduced-motion`、focus trap、键盘可达

## 🚀 快速开始

```powershell
pnpm install
pnpm dev
```

需要 Node 20+ 与 pnpm 8+。

## ⚙️ 配置

编辑 [src/config/music.ts](src/config/music.ts):

```ts
export const musicConfig: MusicConfig = {
  siteName: 'Meliora',
  apiEndpoint: 'https://api.music.abloom.site/api',
  playlists: [
    { server: 'netease', playlistId: '17390341309', enabled: true },
    { server: 'tencent', playlistId: '...', enabled: true },
  ],
  localTracks: [
    {
      id: 'example',
      title: 'Example Song',
      artist: 'Example Artist',
      audio: '/music/example.mp3',
      cover: '/covers/example.jpg', // 可选
      lyrics: '/lyrics/example.lrc', // 可选
    },
  ],
}
```

本地资源直接放进 `public/`。歌词支持标准 LRC 与 `[00:00.00-1]` 扩展标签。

## ⌨️ 快捷键

| 快捷键        | 操作             |
| ------------- | ---------------- |
| `Space`       | 播放 / 暂停      |
| `←` / `→`     | 后退 / 快进 5 秒 |
| `Shift + ←/→` | 上一曲 / 下一曲  |
| `L`           | 切换歌词         |
| `Esc`         | 关闭抽屉 / 弹层  |

输入框中自动让出快捷键。

## 🌍 部署

| 平台                 | 配置文件                                               | 一键部署                                                                                                                                        |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vercel**           | [vercel.json](vercel.json)                             | [![Deploy](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fabloom25%2FMeliora)               |
| **Netlify**          | [netlify.toml](netlify.toml)                           | [![Deploy](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/abloom25/Meliora) |
| **Cloudflare Pages** | [wrangler.toml](wrangler.toml)                         | 控制台导入或 `wrangler pages deploy dist`                                                                                                       |
| **GitHub Pages**     | [deploy-pages.yml](.github/workflows/deploy-pages.yml) | 推送到 `main` 自动部署                                                                                                                          |

所有平台都已配置好安全头、Service Worker 缓存策略和 SPA fallback。构建命令统一为 `pnpm build`,输出 `dist`。

## 🛠️ 开发

```powershell
pnpm dev          # 开发服务器
pnpm test         # 单元测试
pnpm type-check   # 类型检查
pnpm lint         # ESLint
pnpm format       # Prettier
pnpm build        # 生产构建
```

提交时 Husky 会自动跑 `lint-staged` 与 `commitlint`。提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

## 🤝 贡献

欢迎一切形式的贡献。详情请看 [CONTRIBUTING.md](CONTRIBUTING.md);代码风格与设计规范请看 [agent.md](agent.md)。

## 📄 开源许可

[GNU Affero General Public License v3.0 or later](LICENSE) © abloom25

> AGPL-3.0 要求任何**修改后部署到公网**的衍生版本必须向用户提供完整源代码。如需闭源商业使用,请联系作者协商授权。

---

<div align="center">

如果这个项目对你有帮助,欢迎点亮 ⭐ Star

Made with ❤️ by [abloom25](https://github.com/abloom25)

</div>
