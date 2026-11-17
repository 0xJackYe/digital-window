# 数字窗户 · Digital Window

Windows 全屏数字窗户。景观铺满屏幕，原生无边框全屏覆盖当前显示器和任务栏，主画面只保留右上角三个点。内置景观可离线使用。

内置八处 AI 景观，每处六张图片，共 48 张。各图片的原生尺寸、生成来源与 SHA-256 校验值见 [素材清单](assets/landscapes/generated/manifest.json)。从 [GitHub Releases](https://github.com/0xJackYe/digital-window/releases) 下载 Windows 便携版。

## 新景观方案

- 丹佛、曼哈顿、布拉格老城、京都、富士山、落基山湖、马尔代夫海岸、森林，共八处景观。
- 每处单独生成黎明、早晨、中午、下午、傍晚、晚上六张图片。先生成中午构图基准，再参照同一基准制作其他时段，检查建筑、山形和机位是否一致。
- 丹佛、曼哈顿采用高层办公视角。全部景观只呈现室外景色，没有窗框、窗台、室内边缘或软件叠加的窗户。
- 夜景素材需要真实感的夜空、局部灯光与反射；早晚素材需要不同的受光面和阴影，不能只把中午图调暗。
- 原来的实拍序列和单张照片已退出新版本的内置景观目录，并从新打包资源中排除。仍可导入自己的图片与 MP4/WebM，导入媒体保留原画面。

景观采用 AI 生成的摄影风格图像。地标与街区以视觉效果为主。生成使用 ChatGPT 网页和 Codex 内置图片生成，软件启动后直接读取随包提供的 PNG。[生成提示词](assets/landscapes/generated/prompts.json)

## 时间与连续过渡

软件按所选时区、经纬度及日期计算太阳状态，并在渲染循环中重新计算六张图片的混合权重。黎明、早晨等按钮只是预览跳转入口，图片过渡使用连续权重，没有按整点硬切换。可跟随景观所在地，也可选择英国等其他时区与位置。

这个方案是**六张不同光照图片之间的连续混合**。图片自身包含各时段的天空、阴影与夜灯；软件不从照片重建城市，也不重新计算每面墙的逐秒投影。太阳与月亮的天文计算不等于图中光线已经完成精确物理重光照，夜间月相、天气与阴影细节仍由生成素材决定。

## 使用与开发

解压便携版后运行 `数字窗户.exe`，保留完整文件夹。

F11 切换全屏；Esc 退出全屏；L / T 打开景观 / 日光设置；Alt+F4 退出。设置和导入媒体保存在本机；最小化时暂停渲染，恢复后同步当前时刻。

```powershell
npm ci
npm test
node scripts/verify-generated-assets.cjs
npm start
npm run dev
npm run package
node scripts/verify-software.cjs --target all
```

素材校验要求有效 PNG、原生至少 1600×900、接近 16:9。同一景观的六张图在每个轴上允许最多一像素的尺寸差。

输出画布按显示器物理像素适配，支持 3840×2160 帧缓冲，**这不表示素材为原生 4K**。请求分辨率只代表生成目标；实际下载尺寸记录在素材清单中，不通过放大伪装原生细节。

Windows 10+；Node.js 22.12+。项目代码采用 MIT 许可；素材与依赖的来源说明分别见 [ASSET_CREDITS.md](ASSET_CREDITS.md) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 验证状态与参考

软件验证覆盖 48 个画面、连续过渡、时区与夏令时、全屏任务栏覆盖、媒体导入、WebGL 与 Canvas 以及窗口生命周期。v1.6.0 实拍版的[测试报告](reports/software-tests.json)和[全天截图](reports/24-hours/24-hours.html)保留在历史记录中。

太阳时序与多图混合架构参考 [KDE Dynamic Wallpaper Engine](https://github.com/zzag/plasma5-wallpapers-dynamic)，独立实现，没有复制其 GPL 源码。此前对 WinDynamicDesktop、Lively 等项目的调查见 [开源项目调研](reports/daynight-reference-research.md)；其中实拍方案的结论保留为历史技术记录。
