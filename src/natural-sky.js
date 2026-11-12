import * as THREE from '../vendor/three.module.js';

/**
 * Linear-HDR analytic atmosphere for the independent three-dimensional mode.
 * This is an efficient, single-scattering approximation, not a weather sensor
 * or a multiple-scattering path tracer. Optical depth, Rayleigh scattering and
 * Henyey-Greenstein Mie lobes determine the directional sky appearance; the
 * daylight model supplies the photometric irradiance of each source.
 *
 * References: https://www.pbr-book.org/4ed/Volume_Scattering/Phase_Functions
 * https://www.pbr-book.org/4ed/Volume_Scattering/Transmittance
 * Star positions and clouds are procedural, not an astronomical catalogue or
 * live weather. Sun and Moon directions are actual independent ephemerides.
 */
const VERTEX = `
varying vec3 vWorldPosition;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
  gl_Position.z = gl_Position.w;
}`;

const FRAGMENT = `
precision highp float;
varying vec3 vWorldPosition;
uniform vec3 uSunDirection, uMoonDirection, uSunColor, uMoonColor;
uniform float uSunLux, uMoonLux, uSolarSkyLux, uMoonSkyLux, uNightSkyLux;
uniform float uRayleigh, uTurbidity, uMie, uMieG, uSunRadius, uMoonRadius;
uniform float uMoonPhaseBrightness, uStars, uTime, uGroundAlbedo, uCloudCoverage;
const float PI = 3.141592653589793;
const vec3 Y = vec3(0.2126, 0.7152, 0.0722);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
}
float cloudNoise(vec2 p) {
  return noise(p)*0.57 + noise(p*2.07+9.2)*0.28 + noise(p*4.13-7.6)*0.15;
}
float airMass(float altitudeSine) {
  float a = asin(clamp(altitudeSine, 0.0, 1.0))*180.0/PI;
  return min(38.0,1.0/(max(0.0,altitudeSine)+0.50572*pow(a+6.07995,-1.6364)));
}
vec3 opticalDepthR() { return vec3(0.0464, 0.1085, 0.2421)*uRayleigh; }
vec3 opticalDepthM() { return vec3(0.012*uTurbidity*uMie/0.005); }
float phaseR(float mu) { return 3.0*(1.0+mu*mu)/(16.0*PI); }
float phaseM(float mu) {
  float g=uMieG;
  return (1.0-g*g)/(4.0*PI*pow(max(0.002,1.0+g*g-2.0*g*mu),1.5));
}
vec3 scatterShape(vec3 d,vec3 light) {
  // Broad three-band Chappuis absorption avoids a green/yellow twilight cast.
  // This is a representative ozone column, not measured local ozone data.
  vec3 ozone=vec3(0.008,0.020,0.002);
  vec3 r=opticalDepthR(), m=opticalDepthM(), total=max(r+m+ozone,vec3(0.000001));
  float viewMass=airMass(d.y), solarMass=airMass(light.y);
  float mu=clamp(dot(d,light),-1.0,1.0);
  vec3 extinction=exp(-total*viewMass);
  // The effective incident path becomes longer near the horizon. This
  // analytic path approximation produces wavelength-dependent warm horizons
  // while high-altitude, backlit scattering retains the blue sky component.
  float incidentMass=mix(1.0,solarMass,pow(1.0-max(0.0,d.y),1.6))*0.32;
  // Lower aerosol layers enter the Earth's shadow before the high molecular
  // atmosphere. The smooth elevation-dependent effective paths approximate
  // that transition, avoiding an orange daytime lobe persisting all night.
  float depression=max(0.0,-light.y);
  float highAtmosphere=1.0-exp(-depression*18.0);
  float molecularPath=mix(incidentMass,0.65,highAtmosphere);
  vec3 molecular=exp(-total*molecularPath)*exp(-depression*4.0);
  vec3 aerosol=exp(-total*incidentMass)*exp(-depression*38.0);
  return (r*phaseR(mu)*molecular+m*phaseM(mu)*aerosol)*(1.0-extinction)/total;
}
vec3 skyScattering(vec3 d,vec3 source,float irradiance,vec3 tint) {
  vec3 reference=scatterShape(vec3(0.0,1.0,0.0),source);
  float normalization=max(0.00001,dot(reference,Y));
  vec3 angular=scatterShape(d,source)/normalization;
  // The model supplies a hemispherical mean rather than zenith radiance.
  // Bound the analytic horizon enhancement; otherwise a near-horizontal path
  // normalized by the zenith can over-count the same scattering column.
  angular/=1.0+dot(angular,Y)/4.0;
  return angular*(irradiance/PI)*tint;
}
vec3 starField(vec3 d) {
  float angle=uTime*0.00007292115;
  vec3 rotated=vec3(cos(angle)*d.x-sin(angle)*d.z,d.y,sin(angle)*d.x+cos(angle)*d.z);
  vec2 uv=vec2(atan(rotated.z,rotated.x)/(2.0*PI)+0.5,asin(clamp(rotated.y,-1.0,1.0))/PI+0.5);
  vec2 cell=floor(uv*vec2(1500.0,750.0)), local=fract(uv*vec2(1500.0,750.0));
  float seed=hash(cell), occupied=step(0.9984,seed);
  vec2 center=vec2(hash(cell+8.7),hash(cell-19.3))*0.6+0.2;
  float profile=exp(-dot(local-center,local-center)*130.0);
  float magnitude=0.5+pow(hash(cell+31.4),5.0)*22.0;
  float twinkle=1.0+0.12*(1.0-max(0.0,d.y))*sin(uTime*1.7+seed*831.0);
  vec3 color=mix(vec3(0.66,0.78,1.0),vec3(1.0,0.79,0.58),hash(cell+51.0));
  return color*occupied*profile*magnitude*twinkle*uStars;
}
vec3 moonSurface(vec3 d) {
  float mu=dot(d,uMoonDirection);
  float edge=cos(uMoonRadius+0.00015), inner=cos(max(0.0001,uMoonRadius-0.00015));
  float disc=smoothstep(edge,inner,mu);
  if(disc<=0.0 || uMoonLux<=0.0) return vec3(0.0);
  vec3 right=cross(vec3(0.0,1.0,0.0),uMoonDirection);
  if(dot(right,right)<0.00001) right=cross(vec3(1.0,0.0,0.0),uMoonDirection);
  right=normalize(right);
  vec3 up=normalize(cross(uMoonDirection,right));
  vec2 p=vec2(dot(d,right),dot(d,up))/sin(uMoonRadius);
  float z=sqrt(max(0.0,1.0-dot(p,p)));
  // The visible sphere's outward normal faces the observer. Illumination
  // comes from the independent solar direction, not an opposing fake orbit.
  vec3 normal=right*p.x+up*p.y-uMoonDirection*z;
  float lit=max(0.0,dot(normal,uSunDirection));
  float maria=0.82+0.18*noise(p*7.0+11.0)+0.05*noise(p*23.0);
  float solidAngle=PI*uMoonRadius*uMoonRadius;
  float luminance=uMoonLux/(solidAngle*max(0.00001,uMoonPhaseBrightness)*(2.0/3.0));
  return uMoonColor*luminance*lit*maria*disc;
}
void main() {
  vec3 d=normalize(vWorldPosition-cameraPosition);
  float horizon=smoothstep(-0.002,0.002,d.y);
  vec3 above=vec3(d.x,max(0.0,d.y),d.z);
  above=normalize(above);
  vec3 sky=skyScattering(above,uSunDirection,uSolarSkyLux,vec3(1.0));
  sky+=skyScattering(above,uMoonDirection,uMoonSkyLux,uMoonColor);
  sky+=vec3(0.60,0.74,1.0)*(uNightSkyLux/PI);
  sky+=starField(above);
  float solarDisc=smoothstep(cos(uSunRadius+0.00015),cos(max(0.0001,uSunRadius-0.00015)),dot(d,uSunDirection));
  sky+=uSunColor*(uSunLux/(PI*uSunRadius*uSunRadius))*solarDisc;
  sky+=moonSurface(d);
  if(d.y>0.0 && uCloudCoverage>0.0) {
    vec2 cloudUV=above.xz/max(0.045,above.y)*1.9+vec2(uTime*0.0025,uTime*0.0008);
    float density=cloudNoise(cloudUV);
    float threshold=mix(0.72,0.28,uCloudCoverage);
    float alpha=smoothstep(threshold,threshold+0.17,density)*smoothstep(0.015,0.09,d.y)*0.88*smoothstep(0.0,0.12,uCloudCoverage);
    float toward=max(0.0,dot(above,uSunDirection));
    float depth=max(0.0,density-threshold), transmission=exp(-depth*6.0);
    vec3 cloudLight=vec3(0.8,0.88,1.0)*(uSolarSkyLux+uMoonSkyLux+uNightSkyLux)/PI*0.85;
    cloudLight+=uSunColor*uSunLux*0.06*(0.35+transmission*0.65)*(0.6+pow(toward,8.0)*0.4);
    cloudLight+=uMoonColor*uMoonLux*0.06*(0.35+transmission*0.65);
    sky=mix(sky,cloudLight,alpha);
  }
  float totalSky=uSolarSkyLux+uMoonSkyLux+uNightSkyLux;
  vec3 ground=vec3(uGroundAlbedo/PI)*(vec3(totalSky)+uSunColor*uSunLux*max(0.0,uSunDirection.y)+uMoonColor*uMoonLux*max(0.0,uMoonDirection.y));
  gl_FragColor=vec4(max(vec3(0.0),mix(ground,sky,horizon)),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const bounded = (value, low, high, fallback) => Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;
const luminance = (rgb) => rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
const components = (value, fallback) => Array.isArray(value) ? value : value?.isVector3 ? value.toArray() : fallback;

export function createNaturalSky() {
  const uniforms = {
    uSunDirection: { value: new THREE.Vector3(0, 1, 0) }, uMoonDirection: { value: new THREE.Vector3(0, -1, 0) },
    uSunColor: { value: new THREE.Vector3(1, 1, 1) }, uMoonColor: { value: new THREE.Vector3(.8, .9, 1.1) },
    uSunLux: { value: 0 }, uMoonLux: { value: 0 }, uSolarSkyLux: { value: 0 }, uMoonSkyLux: { value: 0 }, uNightSkyLux: { value: .00055 },
    uRayleigh: { value: 1 }, uTurbidity: { value: 2 }, uMie: { value: .005 }, uMieG: { value: .76 },
    uSunRadius: { value: .00465 }, uMoonRadius: { value: .00436 }, uMoonPhaseBrightness: { value: 1 },
    uStars: { value: 0 }, uTime: { value: 0 }, uGroundAlbedo: { value: .18 }, uCloudCoverage: { value: .25 },
  };
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false, toneMapped: true });
  material.name = 'NaturalAtmosphereLinearHDR';
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'NaturalAtmosphere'; mesh.scale.setScalar(9000); mesh.renderOrder = -1000; mesh.frustumCulled = false;
  let latest;
  return {
    mesh,
    update(model = {}, time = 0) {
      const sun = components(model.sunDirection, [0, 1, 0]), moon = components(model.moonDirection, [0, -1, 0]);
      uniforms.uSunDirection.value.fromArray(sun).normalize(); uniforms.uMoonDirection.value.fromArray(moon).normalize();
      uniforms.uSunColor.value.fromArray(components(model.sunColorLinear, [1, 1, 1])); uniforms.uMoonColor.value.fromArray(components(model.moonColorLinear, [.8, .9, 1.1]));
      const total = bounded(model.skyIrradianceLux, 0, 200000, Number.isFinite(model.skyLuminanceCdM2) ? model.skyLuminanceCdM2 * Math.PI : 12000);
      const night = bounded(model.nightSkyIlluminanceLux, 0, total, Math.min(total, .00055));
      const moonSky = bounded(model.moonSkyIlluminanceLux, 0, total - night, Math.min(total - night, Math.max(0, model.moonIlluminanceLux || 0) * .25));
      const solar = bounded(model.solarSkyIlluminanceLux, 0, total, Math.max(0, total - night - moonSky));
      uniforms.uSunLux.value = sun[1] > -.005 ? bounded(model.sunIlluminanceLux, 0, 200000, 0) : 0;
      uniforms.uMoonLux.value = moon[1] > -.005 ? bounded(model.moonIlluminanceLux, 0, 2, 0) : 0;
      uniforms.uSolarSkyLux.value = solar; uniforms.uMoonSkyLux.value = moonSky; uniforms.uNightSkyLux.value = night;
      uniforms.uRayleigh.value = bounded(model.rayleigh, .05, 6, 1); uniforms.uTurbidity.value = bounded(model.turbidity, 1, 20, 2);
      uniforms.uMie.value = bounded(model.mieCoefficient, .00005, .1, .005); uniforms.uMieG.value = bounded(model.mieDirectionalG, 0, .95, .76);
      uniforms.uSunRadius.value = bounded(model.sunAngularRadius, .001, .02, .00465); uniforms.uMoonRadius.value = bounded(model.moonAngularRadius, .001, .02, .00436);
      const dot = sun.reduce((value, channel, index) => value + channel * moon[index], 0);
      const illuminated = bounded(model.moonIllumination, 0, 1, (1 - Math.max(-1, Math.min(1, dot))) / 2);
      const phaseAngle = Math.acos(Math.max(-1, Math.min(1, 2 * illuminated - 1)));
      uniforms.uMoonPhaseBrightness.value = Math.max(0, (Math.sin(phaseAngle) + (Math.PI - phaseAngle) * Math.cos(phaseAngle)) / Math.PI);
      uniforms.uStars.value = bounded(model.starsVisibility, 0, 1, Math.exp(-solar / .01));
      uniforms.uCloudCoverage.value = bounded(model.cloudCoverage, 0, .85, .25);
      uniforms.uGroundAlbedo.value = bounded(model.groundAlbedo, 0, 1, .18);
      uniforms.uTime.value = Number.isFinite(time) ? time : 0;
      latest = { model: 'analytic-single-scattering', linearHDR: true, solarSkyIlluminanceLux: solar, moonSkyIlluminanceLux: moonSky, nightSkyIlluminanceLux: night, sunDiscLuminanceCdM2: uniforms.uSunLux.value / (Math.PI * uniforms.uSunRadius.value ** 2), moonIllumination: illuminated, starsVisibility: uniforms.uStars.value, proceduralClouds: true, measuredWeather: false, ambientColorLuminance: luminance(components(model.ambientSkyLinear, [1, 1, 1])) };
    },
    diagnostics() { return latest; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
