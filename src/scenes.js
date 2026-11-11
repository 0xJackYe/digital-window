const variants = (name) => Object.fromEntries(['dawn', 'morning', 'noon', 'evening', 'night'].map((phase) => [phase, `../assets/landscapes/${name}-${phase}.png`]));
// Photographic views have an assumed camera bearing, adjustable in Daylight.
// Fuji uses the Hirano-to-summit bearing; invented views are artistic defaults.
const CAMERAS = {
  manhattan: { azimuth: 65, fieldOfView: 80, horizon: .49 },
  medieval: { azimuth: 90, fieldOfView: 76, horizon: .46 },
  kyoto: { azimuth: 330, fieldOfView: 74, horizon: .62 },
  fuji: { azimuth: 241, fieldOfView: 78, horizon: .676 },
  lake: { azimuth: 235, fieldOfView: 80, horizon: .60 },
  coast: { azimuth: 135, fieldOfView: 80, horizon: .49 },
  forest: { azimuth: 180, fieldOfView: 75, horizon: .52 },
  procedural: { azimuth: 180, fieldOfView: 85, horizon: .53 },
};
export const CITIES = [
  { id: 'new-york', name: '纽约 · 美国', zone: 'America/New_York', latitude: 40.7484, longitude: -73.9857 },
  { id: 'prague', name: '布拉格 · 捷克', zone: 'Europe/Prague', latitude: 50.0875, longitude: 14.4045 },
  { id: 'kyoto', name: '京都 · 日本', zone: 'Asia/Tokyo', latitude: 35.0031, longitude: 135.7781 },
  { id: 'hirano', name: '平野之滨 · 日本', zone: 'Asia/Tokyo', latitude: 35.426739, longitude: 138.872791 },
  { id: 'beijing', name: '北京 · 中国', zone: 'Asia/Shanghai', latitude: 39.9042, longitude: 116.4074 },
  { id: 'london', name: '伦敦 · 英国', zone: 'Europe/London', latitude: 51.5074, longitude: -.1278 },
  { id: 'paris', name: '巴黎 · 法国', zone: 'Europe/Paris', latitude: 48.8566, longitude: 2.3522 },
  { id: 'tokyo', name: '东京 · 日本', zone: 'Asia/Tokyo', latitude: 35.6762, longitude: 139.6503 },
  { id: 'banff', name: '班夫 · 加拿大', zone: 'America/Edmonton', latitude: 51.3217, longitude: -116.186 },
  { id: 'maldives', name: '拉穆环礁 · 马尔代夫', zone: 'Indian/Maldives', latitude: 1.95, longitude: 73.4 },
  { id: 'los-angeles', name: '洛杉矶 · 美国', zone: 'America/Los_Angeles', latitude: 34.0522, longitude: -118.2437 },
  { id: 'reykjavik', name: '雷克雅未克 · 冰岛', zone: 'Atlantic/Reykjavik', latitude: 64.1466, longitude: -21.9426 },
  { id: 'sydney', name: '悉尼 · 澳大利亚', zone: 'Australia/Sydney', latitude: -33.8688, longitude: 151.2093 },
  { id: 'singapore', name: '新加坡', zone: 'Asia/Singapore', latitude: 1.3521, longitude: 103.8198 },
  { id: 'honolulu', name: '檀香山 · 美国', zone: 'Pacific/Honolulu', latitude: 21.3099, longitude: -157.8581 },
  { id: 'tromso', name: '特罗姆瑟 · 挪威', zone: 'Europe/Oslo', latitude: 69.6492, longitude: 18.9553 },
];
export const SCENES = [
  { id: 'manhattan', title: '曼哈顿，窗外', subtitle: '纽约 · 居民楼视角', location: 'new-york', kind: '动态', variants: variants('manhattan'), image: '../assets/landscapes/manhattan-night.png', alt: '从曼哈顿居民楼望向帝国大厦、砖石公寓与城市灯火', atmosphere: 'city' },
  { id: 'medieval', title: '旧城，慢时光', subtitle: '布拉格 · 中世纪老城', location: 'prague', kind: '动态', variants: variants('medieval'), image: '../assets/landscapes/medieval-evening.png', alt: '欧洲中世纪老城区的石墙、红瓦屋顶、鹅卵石街道与古老塔楼', atmosphere: 'city' },
  { id: 'kyoto', title: '京都，巷深处', subtitle: '东山 · 老街与町屋', location: 'kyoto', kind: '动态', variants: variants('kyoto'), image: '../assets/landscapes/kyoto-evening.png', alt: '京都东山古街的石板路、木造町屋与八坂塔', atmosphere: 'street' },
  { id: 'fuji', title: '富士，映湖间', subtitle: '山中湖 · 平野之滨', location: 'hirano', kind: '动态', variants: variants('fuji'), image: '../assets/landscapes/fuji-morning.png', alt: '从山中湖平野之滨望向富士山，湖水倒映山体', atmosphere: 'lake' },
  { id: 'lake', title: '山湖之间', subtitle: '加拿大 · 梦莲湖', location: 'banff', kind: '动态', image: '../assets/landscapes/alpine-lake.jpg', alt: '雪山与针叶林环抱碧绿色的梦莲湖', atmosphere: 'lake' },
  { id: 'coast', title: '海风来信', subtitle: '马尔代夫 · 印度洋', location: 'maldives', kind: '动态', image: '../assets/landscapes/ocean-coast.jpg', alt: '椰树下的白色沙滩与碧蓝海岸', atmosphere: 'coast' },
  { id: 'forest', title: '林间有光', subtitle: '静谧森林 · 光的间隙', location: 'beijing', kind: '静态', image: '../assets/landscapes/forest.jpg', alt: '阳光穿过森林树冠，照亮林间小径', atmosphere: 'forest' },
  { id: 'procedural', title: '云山镜湖', subtitle: '实时绘制 · 昼夜流转', location: 'beijing', kind: '动态', image: null, alt: '随真实太阳位置变化的云山、湖水与星空', atmosphere: 'procedural' },
].map((scene) => ({ ...scene, camera: CAMERAS[scene.id] }));
