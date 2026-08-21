# weird-web-lab

一个专门收集奇怪、有趣、实验性 HTML 网页的公开实验室。

在线入口：<https://haiyanyoudiangui-creator.github.io/weird-web-lab/>

## 目录结构

```text
weird-web-lab/
├── index.html                  # 总首页，只负责展示和跳转
├── assets/                     # 全局样式与公共资源
├── experiments/                # 每个独立网页一个文件夹
│   └── <experiment-slug>/
│       ├── index.html
│       └── assets/              # 该网页专属资源
└── templates/experiment/       # 新网页的起始模板
```

## 新增网页规则

1. 文件夹使用小写英文和连字符，例如 `dream-clock`。
2. 每个实验必须有自己的 `experiments/<slug>/index.html`。
3. 专属图片、脚本和样式放在该实验自己的 `assets/` 中。
4. 新增网页后，同时在根目录 `index.html` 增加一个目录卡片。
5. 不上传 API Key、密码、私人数据、应用配置或大型构建产物。

这个仓库适合放小型交互实验、视觉玩具、模拟器、小游戏、奇怪的工具和任何值得做出来看看的网页。
