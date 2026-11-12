# 数字窗户 · Digital Window 1.5.0

Windows 全屏数字窗户，以高清实拍照片铺满屏幕。原生无边框窗口覆盖当前显示器和任务栏，只保留右上角三个点。景观、日月计算和偏好离线运行。

默认画面已经恢复为实拍。日光模拟直接作用在照片上，持续改变光照方向、局部冷暖和明暗；不再用三维城市模型替代照片，也不靠几张早、中、晚图片轮换。

## 使用

双击 `启动数字窗户.cmd`，或运行 `release/数字窗户-win32-x64/数字窗户.exe`。便携版需保留整个文件夹。

- **··· → 窗外景观**：曼哈顿、丹佛、布拉格、京都、富士山、梦莲湖、马尔代夫和森林均使用有许可的实拍。丹佛保留从写字楼窗框向外望的构图。
- **光影模式**：默认连续日光；也可选择「原始实拍」查看照片原有光影。八张原片没有 AI 生成、扩图或超分，作者与尺寸见 [ASSET_CREDITS.md](ASSET_CREDITS.md)。
- **时区与日光**：跟随景观所在地，或改成另一城市、自定义时区与经纬度。计算考虑季节、夏令时、极昼和极夜。
- 实时模式逐帧读取当前时刻并更新日月方向与照明，关闭景观动效仍继续更新日光。预览滑块支持小数分钟，显示到秒；五个快捷按钮只是跳转入口，不是光线变化节点。
- 「窗外朝向」影响太阳和月亮相对画面的入射方向，每处单独保存。方向是可调整的估计值；森林的北京时间仅作日光参考。
- 支持导入本地 JPG/PNG/WebP/AVIF 或 MP4/WebM（最大 250MB）。视频静音循环，最小化暂停，恢复继续；媒体与偏好保存在本机。

| 快捷键 | 操作 |
| --- | --- |
| F11 / Esc | 切换 / 退出全屏 |
| L / T | 景观 / 日光设置 |
| Alt + F4 | 退出 |

原生全屏采用完整 `display.bounds`，不修改任务栏设置。覆盖当前显示器，不跨屏拉伸；窗口模式可拖动顶部。显示期间阻止显示器自动休眠，退出后恢复。

## 连续照片光照

太阳、月亮各自的方位、高度与月相来自连续星历计算。照明根据这些数值平滑变化：低太阳形成偏暖的定向光，天空散射带来较冷的环境光，暮光与夜间月光连续过渡。渲染器对照片不同区域施加不同的光色响应，保留原片纹理与细节。实时更新不依赖早晨、中午、傍晚等阶段标签，也不切换不同机位的照片。

手动拖动时间时，光照在相邻目标时间间平滑过渡。硬件支持时使用 WebGL；否则使用 Canvas 照片合成。输出按屏幕物理像素适配，支持 3840×2160；富士原片垂直像素为 2055，未将它宣称为原生 UHD。

这是基于摄影的日光模拟。原片中的既有投影和灯光仍属于拍摄时刻，软件没有逐栋重建城市来重新生成真实遮挡。来源、呈现方式与技术说明见 [ASSET_RESEARCH.md](ASSET_RESEARCH.md)。

## 开发与验证

Windows 10+，Node.js 22.12+。安装依赖需联网，应用不加载远程图片或 API。

```powershell
npm ci
npm start
npm run dev
npm test
npm run package
node scripts/verify-software.cjs --target all --report reports/software-tests.json
# 单独运行照片连续光照与 Canvas 回退集成检查
node scripts/verify-software.cjs --target source --suites natural,natural-fallback
```

测试覆盖日月星历、时区与夏令时、每秒照明连续性、原片来源、照片渲染、物理像素输出、GPU/Canvas、导入媒体、偏好与原生全屏退出。[完整软件测试结果](reports/software-tests.json)以最新报告为准；[丹佛同一照片的光照对照](reports/natural-comparison.html)由真实应用窗口截取。源码和照片资源参与打包一致性验证。GitHub Actions 在 Windows 执行依赖安装、单元测试和构建。

## 数据与许可

代码 MIT；SunCalc/Meeus 改编部分 BSD-2-Clause。摄影保留独立的 CC 或 Unsplash 许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [ASSET_CREDITS.md](ASSET_CREDITS.md)。本版本移除 Three.js 和三维城市渲染器。
