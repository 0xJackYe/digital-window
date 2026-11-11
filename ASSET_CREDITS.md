# 素材来源与生成记录

数字窗户 1.2.0；素材与生成日期：2026-11-11。所有运行景观均随应用保存在本机，无需图片 API、远程媒体或网络请求。代码许可与以下摄影素材许可分别适用。

## 四组新景观

每组包含 `dawn`、`morning`、`noon`、`evening`、`night` 五个 PNG，使用内置 **`image_gen`** 工具生成。先生成正午主图，再以同一主图分别编辑其余四个时段的光照。未使用 CLI/API 后备模式，没有通过脚本裁剪、拼接或重绘图像。

| 文件前缀 | 场景与性质 | 提示词和生成记录 |
| --- | --- | --- |
| `assets/landscapes/manhattan-*.png` | 曼哈顿居民楼向外望的艺术重建；未使用第三方照片作为生成输入 | [主记录](assets/landscapes/manhattan-PROMPTS.md)、[补充提示词](assets/landscapes/manhattan-ROOT-PROMPTS.md) |
| `assets/landscapes/medieval-*.png` | 布拉格小城风格启发的中世纪欧洲老城；未使用第三方照片作为生成输入 | [生成记录](assets/landscapes/medieval-PROMPTS.md) |
| `assets/landscapes/kyoto-*.png` | 京都东山、町屋与八坂塔的艺术重建；未使用第三方照片作为生成输入 | [生成记录](assets/landscapes/kyoto-PROMPTS.md) |
| `assets/landscapes/fuji-*.png` | 以山中湖平野之滨东岸实景为参考的富士山艺术重建；参考照片许可见下文 | [生成记录](assets/landscapes/fuji-PROMPTS.md) |

这些是 AI 生成的景观解释，并非实时摄像头、当地摄影记录或地理测绘。图像约为 16:9、1672 × 941；京都傍晚为 1671 × 941。各时段尽量保留相同构图，生成编辑不保证逐像素完全一致。运行时连续混合时段图像，额外氛围由程序绘制。

### 富士山参考照片与衍生改动

**参考照片：**[Hirano, Yamanakako, Minamitsuru District, Yamanashi Prefecture 401-0502, Japan – panoramio (78)](https://commons.wikimedia.org/wiki/File:Hirano,_Yamanakako,_Minamitsuru_District,_Yamanashi_Prefecture_401-0502,_Japan_-_panoramio_(78).jpg)。

- **作者：Алексей Чикишев**；[作者原页面存档](https://web.archive.org/web/20161102190811/http://www.panoramio.com/user/9099956?with_photo_id=129923644)。
- **许可：[Creative Commons Attribution 3.0 Unported（CC BY 3.0）](https://creativecommons.org/licenses/by/3.0/)**。保留作者、来源和许可链接，并标明修改；不表示作者为本应用背书。
- [原始 JPEG](https://upload.wikimedia.org/wikipedia/commons/3/35/Hirano%2C_Yamanakako%2C_Minamitsuru_District%2C_Yamanashi_Prefecture_401-0502%2C_Japan_-_panoramio_%2878%29.jpg)，6660 × 2055，拍摄于 2016-04-26。本机参考文件：`assets/references/fuji-hirano-day-panorama.jpg`。
- Wikimedia 相机位置为 **35.426739 N，138.872791 E**，即山中湖东侧平野一带，隔湖朝富士山方向拍摄。
- **改动：**根据照片的地理与构图生成约 16:9 的正午主图，扩展天空与湖面、移除前景桩杆和船只、重建细节，再分别生成黎明、早晨、傍晚和夜间光照。星点、窗灯、倒影及各时段光影由生成工具创作。最终 `fuji-*.png` 是经过这些改变的参考衍生图像，不应标为原摄影师拍摄的成片。

## 原有景观摄影

三张摄影图片继续保留为独立景观。应用叠加氛围动态，或随太阳状态调整亮度与色温；源图片均为静态照片。

| 本机文件 | 摄影师 | 原照片与来源 | 原始尺寸 |
| --- | --- | --- | --- |
| `assets/landscapes/alpine-lake.jpg` | Jaime Reimer | [Beautiful View of Moraine Lake, Banff National Park, Canada](https://www.pexels.com/photo/beautiful-view-of-moraine-lake-2662116/) | 5407 × 3605 |
| `assets/landscapes/ocean-coast.jpg` | Asad Photo Maldives | [Landscape Photography of Trees on Shoreline, Laamu Atoll, Maldives](https://www.pexels.com/photo/landscape-photography-of-trees-on-shoreline-457882/) | 3936 × 2624 |
| `assets/landscapes/forest.jpg` | Lukas Hartmann | [Green Leaf Trees / sunlight in a misty forest](https://www.pexels.com/photo/green-leaf-trees-879753/) | 详见来源页面 |

以上来源页面均标示按 [Pexels License](https://www.pexels.com/license/) 免费使用。Pexels 允许免费使用和修改，鼓励署名；限制出售未修改的照片，以及通过其他图库或壁纸平台单独再分发。完整条款以链接许可为准，摄影许可独立于项目代码的 MIT 许可。

下载地址：

- 湖景：`https://images.pexels.com/photos/2662116/pexels-photo-2662116.jpeg?auto=compress&cs=tinysrgb&w=2560`
- 海岸：`https://images.pexels.com/photos/457882/pexels-photo-457882.jpeg?auto=compress&cs=tinysrgb&w=2560`
- 森林：`https://images.pexels.com/photos/879753/pexels-photo-879753.jpeg?auto=compress&cs=tinysrgb&w=2560`

本机 JPEG 为 Pexels CDN 提供的压缩缩放副本，宽 2560 像素，没有运行时远程加载。

## 研究参考文件

以下照片保留在 `assets/references/` 用于调研，不作为运行时五时段图层；除上文的富士山日间参考外，未作为新景观生成输入。完整研究见 [ASSET_RESEARCH.md](ASSET_RESEARCH.md)。

| 本机文件 | 作者、来源与许可 |
| --- | --- |
| `manhattan-apartment-day.jpg` | Andrea Davis，[Pexels 10812975](https://www.pexels.com/photo/white-and-brown-high-rise-buildings-10812975/)，[Pexels License](https://www.pexels.com/license/)；CDN 压缩缩放副本 |
| `rothenburg-day.jpg` | Florian Süß，[Pexels 30035565](https://www.pexels.com/photo/quaint-alleyway-in-rothenburg-ob-der-tauber-30035565/)，[Pexels License](https://www.pexels.com/license/)；CDN 压缩缩放副本 |
| `kyoto-yasaka-evening.jpg` | Rizk Nas，[Pexels 31713582](https://www.pexels.com/photo/scenic-view-of-kyoto-pagoda-at-sunset-31713582/)，[Pexels License](https://www.pexels.com/license/)；CDN 压缩缩放副本 |
| `fuji-hirano-day-panorama.jpg` | Алексей Чикишев；来源与 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 见富士山章节；下载参考文件本身未经修改 |
| `fuji-hirano-night.jpg` | Jun（Kanagawa, Japan），[Night view of Mt. Fuji](https://commons.wikimedia.org/wiki/File:Night_view_of_Mt._Fuji.jpg)、[作者](https://www.flickr.com/people/77585122@N00)、[CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)；[原 JPEG](https://upload.wikimedia.org/wikipedia/commons/8/83/Night_view_of_Mt._Fuji.jpg) 未修改，仅研究附近东岸夜间照明，未输入生成工具 |

程序绘制的「云山镜湖」、氛围粒子及界面图标为本项目实现。Electron 和其依赖的第三方许可随打包运行时提供。

