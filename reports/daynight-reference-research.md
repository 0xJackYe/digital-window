# 实拍昼夜变化：参考项目与验收依据

核对日期：2026-11-13。本文区分连续的计算参数、连续的画面播放，以及真实记录的光照变化；三者不能互相替代。

## 1.5 版本为什么仍像一张白天照片

1.5 的 `src/photo-light.js` 根据日月角度计算色彩增益，照片合成器将这些增益作用于同一张源照片。它确实有连续参数和局部冷暖变化，但照片里原有的阳光、树间光束、建筑投影和天空仍属于拍摄时刻。

将白天像素压暗不能生成夜间天空、真实窗灯或另一时刻的建筑阴影。此前的逐秒数值测试、帧计数和不同像素哈希只能证明程序在更新，不能证明画面已呈现可信的昼夜。用户指出的问题成立。

## 开源项目实际采用的办法

| 项目 | 官方文档与源码中的行为 | 本项目可参考的部分 |
| --- | --- | --- |
| [KDE Dynamic Wallpaper Engine](https://github.com/zzag/plasma5-wallpapers-dynamic) | 照片元数据包含太阳方位、高度、拍摄时间和 `CrossFade`。引擎按太阳进度选取相邻照片并计算混合比例。 | 使用真实昼夜素材，按连续时间混合画面；必须有足够密集且对齐的原始拍摄素材。 |
| [WinDynamicDesktop](https://github.com/t1m0thyj/WinDynamicDesktop/wiki/Creating-custom-themes) | 将不同照片放入日出、白昼、日落和夜间列表，再按当地日照安排显示时段。 | 夜景来自独立夜间照片。其默认图片调度仍是分段切换，不能直接称为逐帧物理仿真。 |
| [Lively](https://github.com/lively-community/lively) | 支持视频、网页与着色器壁纸；视频支持定位播放进度。 | 可以显示固定机位延时摄影，并将当地时间映射到素材进度。播放器本身不会为单张照片生成新照明。 |

KDE 的直接代码依据：

- [`dynamicwallpaperengine_solar.cpp`](https://github.com/zzag/plasma5-wallpapers-dynamic/blob/main/src/declarative/dynamicwallpaperengine_solar.cpp)：`update()` 寻找当前与下一张照片；`computeBlendFactor()` 处理连续比例和跨午夜区间。
- [`WallpaperImage.qml`](https://github.com/zzag/plasma5-wallpapers-dynamic/blob/main/src/package/contents/ui/WallpaperImage.qml)：上层照片透明度绑定 `blendFactor`。
- [`README` 的 Solar Dynamic Wallpaper 说明](https://github.com/zzag/plasma5-wallpapers-dynamic#how-to-create-a-solar-dynamic-wallpaper)：`SolarAzimuth`、`SolarElevation` 表示拍摄时太阳位置，`CrossFade` 控制相邻照片混合。

WinDynamicDesktop 的 [`SolarScheduler.cs`](https://github.com/t1m0thyj/WinDynamicDesktop/blob/main/src/SolarScheduler.cs) 分配照片显示时间，[`EventScheduler.cs`](https://github.com/t1m0thyj/WinDynamicDesktop/blob/main/src/EventScheduler.cs) 使用图片编号解析文件名；这不是从一张照片重建全天光线。Lively 的[命令行文档](https://github.com/lively-community/lively/wiki/Command-Line-Controls#seek-wallpaper)说明视频进度定位接口。

## 单图重光照研究能提供什么

- [HELIOS 官方项目页](https://hala-djeghim.github.io/HELIOS/)及[论文](https://arxiv.org/abs/2609.00901)：使用反照率约束与扩散模型，由太阳高度控制城市昼夜变化。核对时官方页只有论文链接，未找到公开模型或运行代码，不能当作已可部署的依赖。
- [OutCast 官方项目页](https://www.dgriffiths.uk/outcast)：以估计深度和学习式光线行进预测新光向的投影。它说明改变建筑阴影需要额外推断；不是给原图加一层颜色。核对时未找到立即可用的官方代码下载。
- [IC-Light](https://github.com/lllyasviel/IC-Light)：公开的扩散式图像重光照模型，主要输入是前景主体；不能据此保证城市结构、全天时间一致性或实测光照规律。
- [Intrinsic](https://github.com/compphoto/Intrinsic)提供反照率与照明分离研究，但其[许可](https://github.com/compphoto/Intrinsic/blob/main/LICENSE)限定学术使用，不作为本项目的普通发行依赖。

## 当前选择与素材边界

本轮实现方向是密集的拍摄序列或延时摄影，用真实不同时刻的天空、阴影、反射和灯光替换白天画面。相邻采样之间可逐帧插值；不能只把几张差异很大的照片轮换，也不能把整日调色包装成真实夜景。

每份素材必须独立记录来源、作者、许可、分辨率、固定机位情况及可核实的拍摄时间范围。代码开源不等于照片可再分发：KDE 相关引擎文件标注 GPL-3.0-or-later，WinDynamicDesktop 为 MPL-2.0，Lively 为 GPL-3.0；它们引用的 Apple 或社区照片仍须另查素材许可。本项目参考其架构独立实现，不能仅因照片出现在开源仓库就直接打包。

截至本文核对时，尚未确认可公开再分发、覆盖完整昼夜、同机位的丹佛写字楼窗外素材。未核实的地点和时间范围不得写成已实现。新素材的具体许可、采样覆盖与画质结论以最终素材清单和实际画面为准。

拍摄序列记录的是拍摄当天的天气与太阳路径。将它按当前日出、正午、日落重排，可以改善当地昼夜同步，但不能据此声称已精确重现任意日期、经纬度、季节或实时天气的全部物理照明。

## 视觉验收必须验证画面

1. 从真实应用导出 00:00—23:00 的 24 小时联系表，并检查日出、正午、日落、暮光和深夜的内容；不能仅看亮度曲线或浮点参数。
2. 深夜必须使用实际夜间内容。白天天空、太阳、林间日光等不能作为压暗的白昼残留；城市素材应检查拍摄到的窗灯、道路灯光与夜间反射。
3. 检查同机位建筑边缘和构图稳定，防止用不对齐照片混合产生重影。光照变化应来自素材中的真实变化。
4. 检查连续预览视频、相邻帧和跨午夜过渡，避免只有少数时刻换图、跳帧、黑屏或重复整个白天片段。
5. 同时验证真实时间推进、手动预览、所在地与时区映射、GPU 和 Canvas 输出，以及全屏、导入和设置恢复。数值连续性测试保留，但不能代替上述视觉检查。

只有最终素材和画面通过相应检查，才报告具体达到的效果；不足完整 24 小时或缺少当地夜景时明确列出，不再用测试数量代替效果验收。
