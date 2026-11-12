const photo = (name) => `../assets/landscapes/photos/${name}.jpg`;
// Bearings are adjustable camera estimates, not surveyed calibration. Fuji is
// based on the Hirano camera coordinates; NYC looks north from 32 Avenue of the Americas.
const CAMERAS = {
  manhattan: { azimuth: 30, fieldOfView: 70, horizon: .47, skyLimit: .48 },
  denver: { azimuth: 120, fieldOfView: 62, horizon: .52, skyLimit: .58 },
  medieval: { azimuth: 15, fieldOfView: 115, horizon: .35, skyLimit: .39 },
  kyoto: { azimuth: 290, fieldOfView: 66, horizon: .65, skyLimit: .53 },
  fuji: { azimuth: 241, fieldOfView: 110, horizon: .77, skyLimit: .65 },
  lake: { azimuth: 235, fieldOfView: 80, horizon: .60 },
  coast: { azimuth: 135, fieldOfView: 80, horizon: .49 },
  forest: { azimuth: 180, fieldOfView: 75, horizon: .52 },
  procedural: { azimuth: 180, fieldOfView: 85, horizon: .53 },
};
export const CITIES = [
  { id: 'new-york', name: '纽约 · 美国', zone: 'America/New_York', latitude: 40.720406, longitude: -74.004900 },
  { id: 'denver', name: '丹佛 · 美国', zone: 'America/Denver', latitude: 39.748, longitude: -104.996 },
  { id: 'prague', name: '布拉格 · 捷克', zone: 'Europe/Prague', latitude: 50.087131, longitude: 14.420708 },
  { id: 'kyoto', name: '京都 · 日本', zone: 'Asia/Tokyo', latitude: 34.998180, longitude: 135.780092 },
  { id: 'hirano', name: '平野之滨 · 日本', zone: 'Asia/Tokyo', latitude: 35.426739, longitude: 138.872791 },
  { id: 'beijing', name: '北京 · 中国', zone: 'Asia/Shanghai', latitude: 39.9042, longitude: 116.4074 },
  { id: 'london', name: '伦敦 · 英国', zone: 'Europe/London', latitude: 51.5074, longitude: -.1278 },
  { id: 'paris', name: '巴黎 · 法国', zone: 'Europe/Paris', latitude: 48.8566, longitude: 2.3522 },
  { id: 'tokyo', name: '东京 · 日本', zone: 'Asia/Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { id: 'banff', name: '班夫 · 加拿大', zone: 'America/Edmonton', latitude: 51.327178, longitude: -116.182486 },
  { id: 'maldives', name: '艾瑞雅度 · 马尔代夫', zone: 'Indian/Maldives', latitude: 4.589674, longitude: 73.414458 },
  { id: 'los-angeles', name: '洛杉矶 · 美国', zone: 'America/Los_Angeles', latitude: 34.0522, longitude: -118.2437 },
  { id: 'reykjavik', name: '雷克雅未克 · 冰岛', zone: 'Atlantic/Reykjavik', latitude: 64.1466, longitude: -21.9426 },
  { id: 'sydney', name: '悉尼 · 澳大利亚', zone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 },
  { id: 'singapore', name: '新加坡', zone: 'Asia/Singapore', latitude: 1.3521, longitude: 103.8198 },
  { id: 'honolulu', name: '檀香山 · 美国', zone: 'Pacific/Honolulu', latitude: 21.3099, longitude: -157.8581 },
  { id: 'tromso', name: '特罗姆瑟 · 挪威', zone: 'Europe/Oslo', latitude: 69.6492, longitude: 18.9553 },
];
export const SCENES = [
  { id: 'manhattan', title: '曼哈顿，窗外', subtitle: '纽约 · 21 层实拍窗景', location: 'new-york', kind: '实拍', photoReal: true, image: photo('manhattan'), resolution: [4048, 3036], alt: '从纽约美洲大道32号21层真实窗内望向帝国大厦与曼哈顿楼群', atmosphere: 'city' },
  { id: 'denver', title: '丹佛，云端办公', subtitle: '科罗拉多 · 写字楼窗景', location: 'denver', kind: '实拍', photoReal: true, interior: 'office', image: photo('denver'), resolution: [4272, 2848], alt: '透过写字楼窗框望向实拍丹佛市中心楼群、富国银行中心与共和广场', atmosphere: 'city' },
  { id: 'medieval', title: '旧城，慢时光', subtitle: '布拉格 · 老城广场实拍', location: 'prague', kind: '实拍', photoReal: true, image: photo('medieval'), resolution: [10919, 3659], alt: '布拉格老城广场的真实全景，红瓦屋顶、圣尼古拉教堂与泰恩教堂', atmosphere: 'city' },
  { id: 'kyoto', title: '京都，巷深处', subtitle: '东山 · 八坂通实拍', location: 'kyoto', kind: '实拍', photoReal: true, image: photo('kyoto'), resolution: [5550, 3700], alt: '京都清晨真实八坂通、灯笼、木造町屋与八坂塔', atmosphere: 'street' },
  { id: 'fuji', title: '富士，映湖间', subtitle: '山中湖 · 平野之滨实拍', location: 'hirano', kind: '实拍', photoReal: true, image: photo('fuji'), resolution: [6660, 2055], alt: '从山中湖平野之滨拍摄的真实富士山、湖岸与湖水', atmosphere: 'lake' },
  { id: 'lake', title: '山湖之间', subtitle: '加拿大 · 梦莲湖实拍', location: 'banff', kind: '实拍', photoReal: true, image: photo('lake'), resolution: [7759, 3512], alt: '雪山与针叶林环抱碧绿色梦莲湖的摄影全景', atmosphere: 'lake' },
  { id: 'coast', title: '海风来信', subtitle: '马尔代夫 · 艾瑞雅度实拍', location: 'maldives', kind: '实拍', photoReal: true, image: photo('coast'), resolution: [5887, 3929], alt: '马尔代夫艾瑞雅度岛真实海岸的棕榈树、码头与碧蓝海水', atmosphere: 'coast' },
  { id: 'forest', title: '林间有光', subtitle: '晨雾森林 · 实拍', location: 'beijing', locationUnspecified: true, kind: '实拍', photoReal: true, image: photo('forest'), resolution: [4550, 2879], alt: 'Peter Heeling摄影的森林日出，晨雾与阳光穿过树冠照亮林间小径', atmosphere: 'forest' },
  { id: 'procedural', title: '云山镜湖', subtitle: '实时绘制 · 昼夜流转', location: 'beijing', kind: '动态', image: null, alt: '随真实太阳位置变化的云山、湖水与星空', atmosphere: 'procedural' },
].map((scene) => ({ ...scene, camera: CAMERAS[scene.id] }));
