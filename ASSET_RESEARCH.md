# 自然光仿真、实景数据与真实感

Digital Window 1.4.0；核对日期：2026-11-13。

## 当前实现

默认三维模式使用实际几何、PBR 材质、独立太阳/月亮方向光、深度阴影图、解析大气散射和 HDR 天空环境反射。每个渲染帧使用真实 UTC 时刻计算星历；预览支持小数分钟，五个快捷按钮只是时间跳转。旧版照片滤镜不再作为自然光仿真的实现。

原始实拍保存在独立模式，保留源照片的天空、日照、阴影和灯光，仅进行屏幕适配与用户亮度调整。三维场景没有把这些照片变成精准测绘模型；同名场景的照片只作地点与构图参考。

## 已验证的能力

- 在相同光强、颜色和曝光下，仅翻转方向光，方块在地面上的真实几何阴影质心从约172像素移到83像素，偏移约89像素。阴影图开启/关闭的差分测量排除了全屏亮度变化冒充投影。
- 九处场景均包含实际可受光、投影的 Mesh。日光、月相和天空光度连续变化；关闭云/水动效仍继续更新时间。
- 真实 Chromium 高 DPI 帧缓冲输出3840×2160；WebGL2丢失后明确回退摄影，恢复后可重新启用三维模式。
- 实际材质的夜间发光值与近景街灯受光随夜幕变化。丹佛同一镜头的早晨、正午、傍晚和夜间分别由渲染器计算，不是四张日夜替换图。

完整测试及其假设见 [reports/software-tests.json](reports/software-tests.json)。

## 模型的实际边界

这不是「已经完全复现现实」。城市与地形是程序化建模近似，不是照片级实景重建，建筑位置、高度、材质和遮挡均没有完整测量。天空采用三波段透射和单次散射解析近似；星点、云、城市天空光污染与窗灯不来自实时测量。PBR/阴影图和天空IBL也不包含完整全局光照、多次散射及全部间接光弹射。

直接光、可见天空、几何阴影逐帧变化；天空环境反射的PMREM卷积按微小角度/色彩/能量变化缓存，期间能量每帧连续缩放。这是实时性能取舍，不是按早晨/中午/晚上几张图驱动。

照片级真实细节与任意照明下正确投影，需要真实几何、足够清晰的材质，以及原摄影照明与材质的分离。单张JPEG没有被遮住的表面或可靠的三维材质信息，不能据此承诺完整自然光复原。标准[3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)主要重现采集外观；[可重光照3D Gaussian](https://nju-3dv.github.io/projects/Relightable3DGaussian/)另做法线、BRDF、入射光和可见性分解。两种研究方法都没有集成进本应用。

## 真实城市数据核查

| 地点 | 官方数据及实际核实结果 | 限制 |
| --- | --- | --- |
| 丹佛 | [USGS 3DEP](https://data.usgs.gov/datacatalog/data/USGS%3Ab7e353d2-325f-4fc6-8d95-01254705638a)和[DRCOG采集项目](https://www.drcog.org/data-maps-modeling/data-acquisition-projects)有覆盖市中心的LAZ点云，TNM匿名查询得到12块相关数据 | 不是现成的带清晰立面纹理、去光照PBR材质的完整城市。没有据此宣称已经完成照片级丹佛 |
| 纽约 | [官方3D模型说明](https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_3DBuildingModel.md)与[下载目录](https://maps.nyc.gov/download/3dmodel/)提供2014年CityGML/Multipatch体量模型 | LOD1.5/2等几何信息，不等于照片级材质；不能虚称已经加入 |
| 布拉格 | [官方3D mesh](https://geoportalpraha.cz/data-a-sluzby/clanky-a-projekty/3D-model/3D-mesh)说明2023影像/LiDAR的高细节纹理OBJ；可查询到老城广场块ML-57-14.zip，约1.29GB | 本次实际下载地址跳转Microsoft登录，未匿名取得，也没有证明材质已去光照 |
| 京都 | [京都站周边高精细FBX](https://data.city.kyoto.lg.jp/resource/?id=21224)，CC BY4.0；匿名POST实际验证返回640,814,675字节ZIP；另有[LOD3资源](https://data.city.kyoto.lg.jp/resource/?id=20694) | 京都站不是当前八坂通。摄影纹理仍可能烘焙原始光照；未下载并加入当前应用 |

没有把需要登录、需付费或Editorial-only的商业模型当作可免费公开再分发素材。数据是否开放与是否可直接任意重光照是不同条件。

## 实现依据

- [PBRT平行光](https://www.pbr-book.org/4ed/Light_Sources/Distant_Lights)：太阳的近似平行入射与几何可见性。
- [Preetham等解析日光模型](https://doi.org/10.1145/311535.311545)、[Kasten–Young空气质量](https://doi.org/10.1364/AO.28.004735)：解析大气衰减的理论依据，当前是三波段近似。
- [How bright is moonlight?](https://doi.org/10.1093/astrogeo/atx025)：满月照度量级；没有把月亮增亮成第二个太阳。
- [Filament物理曝光与单位说明](https://google.github.io/filament/main/filament.html)：HDR、光度单位与摄影曝光。
- [Three.js DirectionalLight](https://threejs.org/docs/pages/DirectionalLight.html)及[MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)：离线实时PBR、阴影与线性色彩管理。

摄影、Three.js和项目代码分别保留对应许可，见 [ASSET_CREDITS.md](ASSET_CREDITS.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
