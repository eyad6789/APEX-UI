export const particleVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uFormation;
  uniform float uTurbulence;
  uniform float uFocus;
  uniform float uMouth;
  uniform float uTemple;
  uniform float uDissolve;
  uniform float uReduced;
  uniform float uPixelRatio;
  uniform vec2 uPointer;
  uniform vec4 uAudio;
  uniform float uVoice;

  attribute vec3 aScatter;
  attribute float aRegion;
  attribute float aSize;
  attribute float aPhase;
  attribute float aDepth;

  varying float vAlpha;
  varying float vHeat;
  varying float vSpark;
  varying float vDepth;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + .1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                       mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                       mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }

  float regionMask(float id) { return 1.0 - step(0.45, abs(aRegion - id)); }

  void main() {
    float formation = smoothstep(0.03, 0.98, uFormation);
    vec3 target = position;
    float n1 = noise3(position * 1.25 + vec3(uTime * .12, aPhase, -uTime * .08));
    float n2 = noise3(position.yzx * 1.7 + vec3(-uTime * .09, aPhase * .3, uTime * .1));
    vec3 curlish = vec3(n1 - .5, n2 - .5, noise3(position.zxy * 1.3 + uTime * .07) - .5);
    vec3 p = mix(aScatter + curlish * 1.5, target, formation);

    float motion = mix(1.0, .16, uReduced);
    float breath = sin(uTime * 1.05 + aPhase) * .022 * motion;
    p += normalize(vec3(target.xy, target.z + .5)) * breath;
    p += curlish * uTurbulence * (.10 + (1.0 - formation) * .8) * motion;

    float leftEye = regionMask(1.0);
    float rightEye = regionMask(2.0);
    float eye = leftEye + rightEye;
    p.xy += eye * uPointer * .055 * uFocus * motion;
    p.z += eye * uFocus * .055;

    float mouth = regionMask(4.0);
    float jaw = regionMask(5.0);
    float speechWave = sin(uTime * 15.0 + aPhase * 2.0) * uVoice + uAudio.z * sin(uTime * 28.0 + aPhase);
    p.y += mouth * speechWave * .115 * uMouth * motion;
    p.y -= jaw * uAudio.y * uMouth * .09 * motion;
    p.z += (mouth + jaw * .4) * uAudio.x * uMouth * .13;

    float templeZone = step(.58, abs(target.x)) * step(.48, target.y) * (1.0 - step(1.55, target.y));
    p.y += templeZone * uTemple * sin(uTime * 2.4 + aPhase * 3.0) * .10 * motion;
    p.x += templeZone * uTemple * sign(target.x) * (n1 - .5) * .13 * motion;

    vec2 pointerAtFace = uPointer * vec2(1.45, 1.8) + vec2(0.0, .18);
    vec2 delta = p.xy - pointerAtFace;
    float pointerFalloff = exp(-dot(delta, delta) * 3.0) * motion;
    p.xy += normalize(delta + .0001) * pointerFalloff * .10;
    p.z += pointerFalloff * .08;

    float dissolveSeed = hash(vec3(aPhase, aSize, aRegion));
    float dissolved = smoothstep(dissolveSeed - .18, dissolveSeed + .08, uDissolve);
    p += normalize(aScatter + .001) * dissolved * (.2 + n2 * .65) * motion;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = min(8.0, (1.6 + aSize * 2.15 + uAudio.w * 2.2) * uPixelRatio * (7.0 / -mvPosition.z));

    vHeat = mouth * (.18 + uVoice * .5);
    vSpark = step(.91, dissolveSeed) * uAudio.z;
    vDepth = clamp((aDepth + 1.2) / 2.4, 0.0, 1.0);
    vAlpha = (0.38 + vDepth * .58) * (1.0 - dissolved * .64) * (0.72 + formation * .28);
  }
`;

export const particleFragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vHeat;
  varying float vSpark;
  varying float vDepth;

  void main() {
    vec2 centered = gl_PointCoord - .5;
    float d = length(centered);
    float core = smoothstep(.48, .02, d);
    float halo = smoothstep(.5, .18, d) * .42;
    vec3 cyan = mix(vec3(.02, .38, .66), vec3(.32, .94, 1.0), vDepth);
    vec3 warm = vec3(1.0, .57, .12);
    vec3 color = mix(cyan, warm, clamp(vHeat, 0.0, .45));
    color += vec3(.42, .92, 1.0) * vSpark;
    gl_FragColor = vec4(color, (core + halo) * vAlpha);
  }
`;

export const energyVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uEnergy;
  uniform float uMouth;
  uniform float uVoice;
  uniform float uThinking;
  uniform float uPixelRatio;
  attribute float aPhase;
  attribute float aScale;
  varying float vLife;

  void main() {
    vec3 p = position;
    float wave = sin(uTime * (2.0 + uVoice * 5.0) + aPhase);
    p *= 1.0 + wave * (.05 + uVoice * .12);
    p.y += uThinking * .62 + sin(uTime * 1.7 + aPhase) * .045;
    p.z += sin(uTime * 2.2 + aPhase * 2.0) * .06;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min(16.0, (2.4 + aScale * 6.5 + uMouth * uVoice * 4.0) * uPixelRatio * (6.0 / -mv.z));
    vLife = (.45 + .55 * sin(aPhase + uTime * 2.0)) * uEnergy;
  }
`;

export const energyFragmentShader = /* glsl */ `
  varying float vLife;
  void main() {
    float d = length(gl_PointCoord - .5);
    float glow = smoothstep(.5, .0, d);
    float hot = smoothstep(.32, .0, d);
    vec3 color = mix(vec3(1.0, .16, .015), vec3(1.0, .78, .24), glow);
    color = mix(color, vec3(1.0, .98, .78), hot * .78);
    gl_FragColor = vec4(color, glow * (.16 + vLife * .74));
  }
`;
