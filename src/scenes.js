export const GENERATED_PHASES = Object.freeze(['dawn', 'morning', 'noon', 'afternoon', 'evening', 'night']);
// Native dimensions come from the decoded assets, never from a requested size.
const generatedScene = (id, title, subtitle, location, atmosphere) => ({ id, title, subtitle, location, atmosphere, generated: true, kind: 'AI 景观', image: `../assets/landscapes/generated/${id}/noon.png`, variants: Object.fromEntries(GENERATED_PHASES.map(phase => [phase, `../assets/landscapes/generated/${id}/${phase}.png`])), alt: `${title}，AI 生成的六时段高细节窗外景观，无窗框及室内边缘` });
// Bearings are adjustable camera estimates, not surveyed calibration. Fuji is
// based on the Hirano camera coordinates; NYC looks north from 32 Avenue of the Americas.
const CAMERAS = {
  cuhk: { azimuth: 310, fieldOfView: 65, horizon: .35 },
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
  { id: 'hong-kong', name: '香港 · 中国', zone: 'Asia/Hong_Kong', latitude: 22.414, longitude: 114.214 },
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
  generatedScene('denver', '丹佛，云端视野', '高层办公视角 · 无窗框', 'denver', 'city'),
  generatedScene('manhattan', '曼哈顿，窗外', '纽约高层视角 · 无窗框', 'new-york', 'city'),
  generatedScene('medieval', '旧城，慢时光', '布拉格老城 · 六时段', 'prague', 'city'),
  generatedScene('kyoto', '京都，巷深处', '东山街巷 · 六时段', 'kyoto', 'street'),
  generatedScene('fuji', '富士，映湖间', '富士山与山中湖 · 六时段', 'hirano', 'lake'),
  generatedScene('lake', '山湖之间', '落基山湖 · 六时段', 'banff', 'lake'),
  generatedScene('coast', '海风来信', '马尔代夫海岸 · 六时段', 'maldives', 'coast'),
  generatedScene('forest', '林间有光', '林间小径 · 六时段', 'beijing', 'forest'),
].map((scene) => ({ ...scene, camera: CAMERAS[scene.id] }));
