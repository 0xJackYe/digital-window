# 景观素材来源与许可

Digital Window **1.6.0**；核对日期：**2026-11-13**。默认使用有授权的香港同机位昼夜实拍序列。原有八张照片保留为单张实拍，不再通过调暗冒充夜景。

## 默认昼夜实拍

**《中文大學的一天 CUHK in a day》**，摄影 See-ming Lee 李思明 / SML Photography / SML Universe Limited，Copyright 2013 See-ming Lee。[作者原始发布与授权说明](https://www.flickr.com/photos/seeminglee/8555883879/)，许可 [CC BY 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)。

作者记录 2013-03-12 18:14:01 至次日 18:00:01（UTC+8）每分钟拍摄，共 1427 张原始 RAW。公开可下载视频实际为 **1280×720**，不是作者文字所述的 1080p 母版，更不是原生 4K。当前包保留 1424 个干净摄影帧，删除结尾字幕与配乐，重新编码以方便定位帧；海报来自摄影帧 1000。未使用 AI 扩图或生成夜景。

播放采用每帧名义 60 秒的源间隔；公开视频没有各张 RAW 的精确时间戳。周期接缝约 17 分钟，由末帧与首帧连续插值。天气、夜灯、太阳路径和月相来自拍摄当天；日出日落同步改变播放时序，不能重建其他地点或季节的真实光线方向。详细来源、修改与 SHA-256 见 [source.json](assets/cycles/cuhk/source.json)。

## 当前运行照片

下表尺寸为实际下载文件的像素尺寸，没有通过 AI 生成、超分、扩图或补画增加像素。除丹佛由 Unsplash CDN 提供高质量 JPEG 外，其余七张为 Wikimedia Commons 原文件的下载字节。

| 文件（位于 assets/landscapes/photos/） | 摄影师 | 作品与来源 | 尺寸 | 图片许可 |
| --- | --- | --- | --- | --- |
| manhattan.jpg | Davidwbarratt | [New York City 2](https://commons.wikimedia.org/wiki/File:New_York_City_2.jpg) | 4048 × 3036 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| denver.jpg | Shade | [a city skyline with tall buildings — Denver, CO](https://unsplash.com/photos/a-city-skyline-with-tall-buildings-GPjse2kaUKA) | 4272 × 2848 | [Unsplash License](https://unsplash.com/license) |
| medieval.jpg | Tiia Monto | [Old Town Square - panorama](https://commons.wikimedia.org/wiki/File:Old_Town_Square_-_panorama.jpg) | 10919 × 3659 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| kyoto.jpg | Basile Morin | [Yasaka-dori early morning with street lanterns and the Tower of Yasaka (Hokan-ji Temple), Kyoto, Japan](https://commons.wikimedia.org/wiki/File:Yasaka-dori_early_morning_with_street_lanterns_and_the_Tower_of_Yasaka_(Hokan-ji_Temple),_Kyoto,_Japan.jpg) | 5550 × 3700 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| fuji.jpg | Алексей Чикишев | [Hirano, Yamanakako, Minamitsuru District, Yamanashi Prefecture 401-0502, Japan - panoramio (78)](https://commons.wikimedia.org/wiki/File:Hirano,_Yamanakako,_Minamitsuru_District,_Yamanashi_Prefecture_401-0502,_Japan_-_panoramio_(78).jpg) | 6660 × 2055 | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| lake.jpg | Adam Bishop | [Moraine Lake panorama](https://commons.wikimedia.org/wiki/File:Moraine_Lake_panorama.jpg) | 7759 × 3512 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| coast.jpg | Ввласенко | [Palm tree and pier. Eriyadu, Maldives](https://commons.wikimedia.org/wiki/File:Palm_tree_and_pier._Eriyadu,_Maldives.jpg) | 5887 × 3929 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| forest.jpg | Peter Heeling | [Forest sunrise](https://commons.wikimedia.org/wiki/File:Forest_sunrise.jpg)，最初发布于 [Skitterphoto / Foggy forest](https://skitterphoto.com/photos/250/foggy-forest) | 4550 × 2879 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

原图直链、拍摄日期、来源提供的 GPS、字节数及七张 Commons 文件的 **SHA-256** 见 [sources.json](assets/landscapes/photos/sources.json)。丹佛来源、许可、下载地址及限制见 [denver-source.json](assets/landscapes/photos/denver-source.json)；本次下载文件的 SHA-256 为 9d69829305f49e793834f42d69b2817aa218e88b1b97bdea3d88dd81e521695e。七张 Commons 原图可通过 [下载脚本](scripts/fetch-photo-upgrades.py) 重新取得与验证。

## 许可与呈现改动

项目 [MIT 许可](LICENSE) 适用于项目代码，不把上述第三方图片重新许可为 MIT。再次分发图片时，应保留各自作者、作品来源和许可链接，不暗示摄影师为本项目背书。

七张 Commons JPEG 在项目中未进行离线像素改写。显示时按屏幕比例裁切、应用用户亮度，并可选择连续日光模拟；原始实拍模式保留摄影光影。图片及其衍生图像继续遵从对应 CC 许可；其中 **CC BY-SA** 图片的衍生部分适用相同或兼容许可。独立应用代码保留 MIT。

丹佛照片保留 **Unsplash License**，不重新许可为 MIT 或 CC。它作为数字窗户软件中的景观背景提供，不作为独立图库商品出售，也不用于复制 Unsplash 的图片服务。当前使用的是免费照片，不是 Unsplash+ 素材；完整使用条件以 [官方许可](https://unsplash.com/license) 为准。

## 视角与真实程度

- **曼哈顿：**照片通过美洲大道 32 号第 21 层的真实窗户拍摄，窗框本身属于摄影画面。该楼为办公楼；本版本不将它标为经过核实的居民楼内部。来源位置为 40.720406, -74.004900。
- **丹佛：**背景是摄影师标注为 Denver, CO 的真实城市照片，可见丹尼尔斯与费舍尔塔、富国银行中心和共和广场等楼群。前景写字楼窗框由软件单独绘制，最终是「实拍丹佛背景 + 软件窗框」的复合景观。来源没有证明原照片拍自办公室，不能把完整场景描述为未经合成的办公室实拍。2022-09-21 是来源公布日期，不是已核实的快门时间。软件相机位置与朝向是估计值，不是测绘结果。
- **布拉格：**真实老城广场全景，不再使用虚构的中世纪街景。来源位置为 50.087131, 14.420708。
- **京都：**真实八坂通清晨与八坂塔；灯笼、屋顶和街道细节保留摄影原貌。来源位置为 34.998180, 135.780092。
- **富士山：**保留山中湖东侧平野一带的真实视角，来源位置为 35.426739, 138.872791。照片没有生成扩展天空或湖面。
- **梦莲湖：**真实加拿大班夫国家公园湖景，来源位置为 51.327178, -116.182486。
- **马尔代夫：**真实艾瑞雅度（Eriyadu）岛海岸，来源位置为 4.589674, 73.414458；不是原版标注的拉穆环礁。
- **森林：**摄影来源没有足以核实的具体地址。默认北京时间仅为日光模拟参考，不表示照片在北京拍摄。

来源 GPS 不等于完整相机标定。日光设置中的朝向与视野可调整；未取得摄影测量资料的朝向属于估计。

富士山原图只有 **2055** 个垂直像素，按 16:9 填满时有效裁切约 **3653 × 2055**，因此不能声称所有景观均为原生 4K。其余七张照片的 16:9 有效裁切达到或超过 3840 × 2160；实际细节还取决于拍摄器材、对焦、压缩和显示比例，像素数量不保证每个细节同等锐利。

所有照片均只有一个拍摄时刻。连续日月方向、曝光和色温变化不等同于真实固定机位的全天摄影，也不能从单张照片恢复全部建筑投影、遮挡和夜间窗灯。

## 程序景观与历史素材

当前版本已移除三维城市渲染器和 Three.js。丹佛前景使用独立 CSS 窗框；曼哈顿的真实窗框来自原照片。可选「云山镜湖」是独立的二维程序景观，不标作实拍。

1.2.0 使用的四组、共二十张 AI 时段 PNG，以及原三张 Pexels 运行照片，已移出运行资源并在本机 .test-results/legacy-landscapes/ 备份。该目录被 Git 忽略，不随当前软件发布；旧提交及生成提示词可通过 Git 历史追溯。它们不再用于当前运行景观，旧版本中的生成、扩图或参考衍生说明不适用于本表列出的实拍文件。assets/references/ 中的调研文件也不作为当前运行背景。

更详细的技术取舍见 [ASSET_RESEARCH.md](ASSET_RESEARCH.md)。Electron 及依赖的第三方许可随打包运行时提供。

