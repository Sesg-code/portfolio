import * as THREE from 'three';
import { GLTFLoader } from './extras/loaders/GLTFLoader.js';
import { Reflector } from './Reflector.js';
import { engineLightAt, setTunedSound } from './sound.js';

const surface = document.querySelector('.surface');
const stage = document.querySelector('.stage');
const sequence = document.querySelector('.sequence');
const help = document.querySelector('.help');
const controls = document.querySelector('.controls');
const carName = document.querySelector('#car-name');
const revealButton = stage.querySelector('[data-reveal]');
const chapterNav = stage.querySelector('.chapter-nav');
const chapterButtons = [...chapterNav.querySelectorAll('button')];
const coarsePointer = matchMedia('(hover: none)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const clamp = THREE.MathUtils.clamp;

const valueNoise = `
  float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p) {
    vec2 i=floor(p), f=fract(p);
    f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
      mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
  }
`;

function makeTitleTexture() {
  const title = document.createElement('canvas');
  title.width = 1120;
  title.height = 300;
  const lettering = title.getContext('2d');
  lettering.fillStyle = '#fff';
  lettering.font = '650 31px "Segoe UI",Arial,sans-serif';
  lettering.textAlign = 'left';
  lettering.globalAlpha = .82;
  let brandX = 89;
  for (const letter of 'NISSAN') {
    lettering.fillText(letter, brandX, 38);
    brandX += lettering.measureText(letter).width + 7;
  }

  // Custom 350Z badge: wide proportions, bevelled corners and a shared forward slant.
  lettering.globalAlpha = 1;
  lettering.transform(1, 0, -.235, 1, 58, 65);
  const glyphs = [
    'M31 0H218L247 26V85L222 106L247 130V190L216 222H29L0 193V164H59L72 176H175L187 164V145L175 133H76V89H174L186 78V60L174 48H0V32Z',
    'M22 0H247L234 48H72L66 84H218L247 112V191L216 222H28L0 192V164H59L72 176H174L186 164V143L174 131H0Z',
    'M36 0H211L247 34V188L211 222H36L0 188V34ZM77 48L60 65V157L77 174H170L187 157V65L170 48Z',
    'M17 0H248V44L83 174H246L229 222H0V178L161 48H0Z',
  ];
  for (const glyph of glyphs) {
    lettering.fill(new Path2D(glyph), 'evenodd');
    lettering.translate(264, 0);
  }
  return new THREE.CanvasTexture(title);
}

function matrixWall() {
  const material = new THREE.ShaderMaterial({
    name: 'Graphite dot matrix',
    uniforms: {
      time: { value: 0 },
      density: { value: 29 },
      graphite: { value: new THREE.Color('#0e0e11') },
      wash: { value: new THREE.Color('#29292d') },
      perforation: { value: new THREE.Color('#0b0b0e') },
      shimmer: { value: new THREE.Color('#242428') },
      title: { value: makeTitleTexture() },
      titleOpacity: { value: 0 },
      titleRect: { value: new THREE.Vector4(.075, .50, .85, .30) },
    },
    toneMapped: false,
    vertexShader: `
      varying vec2 wallPoint;
      varying vec4 wallClip;
      void main() {
        wallPoint = position.xy + vec2(0.0, 6.24);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        wallClip = gl_Position;
      }
    `,
    fragmentShader: `
      uniform float time, density, titleOpacity;
      uniform sampler2D title;
      uniform vec4 titleRect;
      uniform vec3 graphite, wash, perforation, shimmer;
      varying vec2 wallPoint;
      varying vec4 wallClip;
      ${valueNoise}
      void main() {
        vec2 grid = wallPoint * density;
        vec2 row = vec2(mod(floor(grid.y), 2.0) * 0.5, 0.0);
        vec2 cell = floor(grid + row) + 0.5;
        vec2 p = (cell - row) / density;
        float flow = noise(p * vec2(0.53, 1.04) + vec2(-time * 0.22, time * 0.15));
        flow = flow * 0.78 + noise(p * 1.25 + vec2(time * 0.12, 9.0)) * 0.22;
        float radius = mix(0.16, 0.24, flow);
        float smoothing = clamp(max(fwidth(grid.x), fwidth(grid.y)) * 0.65, 0.04, 0.47);
        float dotMask = 1.0 - smoothstep(radius - smoothing, radius + smoothing, length(grid + row - cell));
        dotMask = mix(dotMask, 0.15, smoothstep(0.3, 0.47, smoothing));
        float height = (wallPoint.y - 0.58) * 1.37;
        float spread = (wallPoint.x + 0.65) * 0.22;
        float halo = exp(-height * height - spread * spread);
        vec3 base = mix(graphite, wash, halo * 0.94);
        vec3 dotColor = mix(perforation, shimmer, smoothstep(0.50, 0.86, flow) * 0.52);
        base = mix(base, dotColor, dotMask * (0.46 + 0.20 * halo));
        vec2 screen = (wallClip.xy / wallClip.w) * .5 + .5;
        vec2 titleUv = (screen - titleRect.xy) / titleRect.zw;
        float letters = texture2D(title, titleUv).a *
          step(0., titleUv.x) * step(0., titleUv.y) * step(titleUv.x, 1.) * step(titleUv.y, 1.);
        gl_FragColor = vec4(mix(base, vec3(.88,.84,.77), titleOpacity * letters), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  // The side camera sees farther along the wall than the opening shot does.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(96, 12.5), material);
  const normal = new THREE.Vector3(-.77, 0, -.64).normalize();
  wall.position.copy(normal).multiplyScalar(-5.55);
  wall.position.y = 6.24;
  wall.lookAt(0, wall.position.y, 0);
  return wall;
}

function makeEnvironment(renderer) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#0d151c');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  const edge = (x, y) => {
    const gradient = context.createLinearGradient(0, 0, x, y);
    gradient.addColorStop(0, '#fff0');
    gradient.addColorStop(.10, '#fff');
    gradient.addColorStop(.90, '#fff');
    gradient.addColorStop(1, '#fff0');
    return gradient;
  };
  context.fillStyle = edge(96, 0);
  context.fillRect(0, 0, 96, 96);
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = edge(0, 96);
  context.fillRect(0, 0, 96, 96);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const [dimensions, position, color, power] of [
    [[7.0, 1.36], [-.85, 4.25, -1.63], '#e0f0ff', 7.1],
    [[5.9, .72], [2.8, 2.8, 3.6], '#cadfff', 5.5],
    [[3.05, .44], [-2.8, 2.25, -4.8], '#d8eaff', 3.6],
    [[5.4, 1.38], [-3.45, 4.65, 3.8], '#deedff', 3.7],
  ]) {
    const softbox = new THREE.Mesh(new THREE.PlaneGeometry(...dimensions), new THREE.MeshBasicMaterial({
      map, color: new THREE.Color(color).multiplyScalar(power), transparent: true,
      depthWrite: false, toneMapped: false,
    }));
    softbox.position.set(...position);
    softbox.lookAt(0, .64, 0);
    studio.add(softbox);
  }
  const generator = new THREE.PMREMGenerator(renderer);
  const environment = generator.fromScene(studio, .011);
  for (const mesh of studio.children) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  generator.dispose();
  map.dispose();
  return environment;
}

function lights(scene) {
  const ambient = new THREE.HemisphereLight('#e3e7ee', '#14151a', .26);
  const key = new THREE.SpotLight('#fff1de', 66, 13, .58, .88, 2);
  key.position.set(-.60, 4.65, -.78);
  key.target.position.set(.04, 0, .06);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = .45;
  key.shadow.camera.far = 13;
  key.shadow.normalBias = .014;
  key.shadow.bias = -.00024;
  key.shadow.radius = 4;
  key.shadow.intensity = .72;
  const front = new THREE.DirectionalLight('#d7e0ed', .39);
  front.position.set(-4.6, 2.7, -3.8);
  const rim = new THREE.DirectionalLight('#d8e2f0', .20);
  rim.position.set(3.2, 2.8, 4.1);
  scene.add(ambient, key, key.target, front, rim);
  return {
    key,
    reveal(amount) {
      front.intensity = .39 + .33 * amount;
      rim.intensity = .20 + .36 * amount;
      ambient.intensity = .26 - .09 * amount;
      scene.environmentIntensity = .45 + .34 * amount;
    },
  };
}

function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 260;
  const context = canvas.getContext('2d');
  const shade = (x, y, rx, ry, alpha) => {
    context.save();
    context.translate(x, y);
    context.scale(rx, ry);
    const gradient = context.createRadialGradient(0, 0, .12, 0, 0, 1);
    gradient.addColorStop(0, `rgba(0,0,0,${alpha})`);
    gradient.addColorStop(1, 'transparent');
    context.fillStyle = gradient;
    context.fillRect(-1, -1, 2, 2);
    context.restore();
  };
  shade(80, 130, 68, 121, .62);
  for (const x of [40, 120]) {
    for (const y of [63, 197]) shade(x, y, 18, 21, .78);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 5.1), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = .017;
  mesh.renderOrder = 4;
  return mesh;
}

const puddleShader = {
  name: 'Garage wet concrete',
  uniforms: {
    ...Reflector.ReflectorShader.uniforms,
    grain: { value: null },
  },
  vertexShader: `
    uniform mat4 textureMatrix;
    varying vec4 reflected;
    varying vec3 world;
    void main() {
      world = (modelMatrix * vec4(position, 1.0)).xyz;
      reflected = textureMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D grain;
    varying vec4 reflected;
    varying vec3 world;
    ${valueNoise}
    void main() {
      vec2 detail=texture2D(grain, world.xz*.34).rg-.5;
      float textureMask=noise(world.xz*.51+3.2)*.73+noise(world.xz*1.7)*.27;
      float wet=smoothstep(.42,.74,textureMask+detail.x*.18);
      vec2 uv=reflected.xy/reflected.w+detail*.0038;
      vec3 mirror=texture2D(tDiffuse,uv).rgb*.54;
      mirror+=texture2D(tDiffuse,uv+vec2(.0018,0)).rgb*.23;
      mirror+=texture2D(tDiffuse,uv-vec2(.0018,0)).rgb*.23;
      float distanceFade=1.0-smoothstep(2.5,7.8,length(world.xz));
      float grazing=1.0-abs(normalize(cameraPosition-world).y);
      gl_FragColor=vec4(mirror,wet*distanceFade*mix(.055,.18,grazing));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
};

async function floor(scene, renderer) {
  const loader = new THREE.TextureLoader();
  const [map, normalMap, roughnessMap] = await Promise.all(
    ['color','normal','roughness'].map((file) => loader.loadAsync(`./concrete/${file}.jpg`)),
  );
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(20, 20);
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  map.colorSpace = THREE.SRGBColorSpace;
  const concrete = new THREE.Mesh(new THREE.PlaneGeometry(58, 58), new THREE.MeshPhysicalMaterial({
    map, normalMap, roughnessMap, color: '#2b3032', roughness: .97, specularIntensity: .12,
    normalScale: new THREE.Vector2(.88,.88),
  }));
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = .003;
  concrete.receiveShadow = true;
  scene.add(concrete);
  const puddle = new Reflector(new THREE.PlaneGeometry(42, 42), {
    textureWidth: 1024, textureHeight: 768, multisample: 0, clipBias: .0004, shader: puddleShader,
  });
  puddle.material.uniforms.grain.value = normalMap;
  puddle.material.transparent = true;
  puddle.material.depthWrite = false;
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.y = .009;
  puddle.renderOrder = 3;
  scene.add(puddle);
  return puddle;
}

function makeGlazing(name, color, roughness, faceOpacity, edgeOpacity) {
  const glass = new THREE.MeshStandardMaterial({
    name, color, roughness,
    metalness: 1,
    transparent: true,
    depthWrite: false,
  });
  // Reflect light on the surface without resampling the view through the glass.
  glass.onBeforeCompile = (shader) => {
    shader.uniforms.glassOpacity = { value: new THREE.Vector2(faceOpacity, edgeOpacity) };
    shader.fragmentShader = 'uniform vec2 glassOpacity;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      #include <opaque_fragment>
      float facing = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
      gl_FragColor.a = mix(glassOpacity.x, glassOpacity.y, pow(1.0 - facing, 5.0));
    `);
  };
  return glass;
}

const screenVertex = `
  varying vec2 uvScreen;
  void main() {
    uvScreen = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fluidFragment = `
  varying vec2 uvScreen;
  uniform sampler2D state, derivatives, pressure;
  uniform vec2 texel, size, brushStart, brushEnd, impulse;
  uniform float radius, inject, tick, time;
  uniform int pass;
  vec4 field(vec2 uv) { return texture2D(state, uv); }
  vec2 neighbours(vec2 uv, vec2 offset) { return field(uv + offset).xy; }
  void main() {
    vec2 uv = uvScreen, dx = vec2(texel.x, 0.), dy = vec2(0., texel.y);
    if (pass == 0) {
      // Backtrace through the velocity field; the dye moves and decays with it.
      vec2 midpoint = uv - field(uv).xy / size * tick * .5;
      vec2 origin = uv - field(midpoint).xy / size * tick;
      vec4 prior = field(origin);
      vec2 velocity = prior.xy * pow(.93, tick);
      float dye = prior.z * pow(.923, tick);
      if (inject > 0.) {
        vec2 point = uv * size, path = brushEnd - brushStart;
        float along = clamp(dot(point - brushStart, path) / max(dot(path, path), .01), 0., 1.);
        vec2 rel = point - mix(brushStart, brushEnd, along);
        // A small diagonal stretch keeps the resting brush from reading as a round stamp.
        float turn = .28 * sin(time * 3.7);
        vec2 shape = vec2(rel.x + rel.y * turn, rel.y - rel.x * turn) / radius;
        shape *= vec2(.86, 1.27);
        float core = exp(-2.4 * dot(shape, shape));
        vec2 swirl = vec2(-shape.y, shape.x) * sin(time * 3.2 + along * 2.);
        velocity += (impulse * .62 + swirl * 3.9) * core * tick;
        dye = min(1.25, max(dye, core * .81) + core * .19 * tick);
      }
      gl_FragColor = vec4(velocity, dye, 1.);
    } else if (pass == 1) {
      vec2 x = neighbours(uv, dx) - neighbours(uv, -dx);
      vec2 y = neighbours(uv, dy) - neighbours(uv, -dy);
      gl_FragColor = vec4((x.x + y.y) * .5, (x.y - y.x) * .5, 0., 1.);
    } else if (pass == 2) {
      float div = texture2D(derivatives, uv).r;
      float p = texture2D(pressure, uv + dx).r + texture2D(pressure, uv - dx).r
              + texture2D(pressure, uv + dy).r + texture2D(pressure, uv - dy).r;
      gl_FragColor = vec4((p - div) * .25, 0., 0., 1.);
    } else {
      vec2 grad = vec2(texture2D(pressure, uv + dx).r - texture2D(pressure, uv - dx).r,
                       texture2D(pressure, uv + dy).r - texture2D(pressure, uv - dy).r);
      float curl = texture2D(derivatives, uv).g;
      vec2 twist = vec2(abs(texture2D(derivatives, uv + dy).g) - abs(texture2D(derivatives, uv - dy).g),
                       abs(texture2D(derivatives, uv - dx).g) - abs(texture2D(derivatives, uv + dx).g));
      vec4 prior = field(uv);
      vec2 velocity = prior.xy - grad * .5 + twist / (length(twist) + .015) * curl * .12 * tick;
      gl_FragColor = vec4(clamp(velocity, -53., 53.), prior.z, 1.);
    }
  }
`;

const compositeFragment = `
  varying vec2 uvScreen;
  uniform sampler2D base, tuned, ink;
  uniform vec2 size, center;
  uniform float brush, flow, time;
  void main() {
    vec2 uv = uvScreen, pixel = uv * size;
    float alpha = 0.;
    vec2 bend = vec2(0.);
    if (flow > 0.) {
      vec4 f = texture2D(ink, uv);
      float antialias = max(fwidth(f.z) * .86, .024);
      alpha = smoothstep(.46 - antialias, .46 + antialias, f.z);
      bend = f.xy / size * .10 * (1. - smoothstep(.0, .42, abs(f.z - .46)));
    } else if (brush > 0.) {
      vec2 p = pixel - center;
      float phase = atan(p.y, p.x);
      float outline = brush * (1. + .095 * sin(phase * 3. + time * 2.) + .047 * cos(phase * 5. - time * 2.6));
      alpha = smoothstep(-2.0, 2.0, outline - length(p));
    }
    vec3 color = texture2D(base, uv).rgb;
    if (alpha > 0.) color = mix(color, texture2D(tuned, uv - bend).rgb, alpha);
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeLiquid(renderer) {
  const floating = renderer.extensions.has('EXT_color_buffer_float');
  const worldTarget = () => new THREE.WebGLRenderTarget(1, 1, {
    type: floating ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: Math.min(4, renderer.capabilities.maxSamples),
  });
  const base = worldTarget(), tuned = worldTarget();
  const screen = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  screen.add(quad);
  const camera = new THREE.Camera();
  const screenSize = new THREE.Vector2();
  const post = new THREE.ShaderMaterial({
    vertexShader: screenVertex, fragmentShader: compositeFragment, depthTest: false, depthWrite: false,
    uniforms: {
      base: { value: base.texture }, tuned: { value: tuned.texture }, ink: { value: null },
      size: { value: screenSize }, center: { value: new THREE.Vector2() }, brush: { value: 0 },
      time: { value: 0 }, flow: { value: 0 },
    },
  });
  const target = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
  const fields = floating ? [target(), target()] : [];
  const pressure = floating ? [target(), target()] : [];
  const derivatives = floating ? target() : null;
  const buffers = [...fields, ...pressure, ...(derivatives ? [derivatives] : [])];
  const blank = new THREE.Color(0);
  const previous = new THREE.Color();
  const uniforms = {
    state: { value: null }, pressure: { value: null }, derivatives: { value: derivatives?.texture },
    texel: { value: new THREE.Vector2() }, size: { value: screenSize }, pass: { value: 0 },
    brushStart: { value: new THREE.Vector2() }, brushEnd: { value: new THREE.Vector2() },
    impulse: { value: new THREE.Vector2() }, radius: { value: 0 }, inject: { value: 0 },
    tick: { value: 1 }, time: { value: 0 },
  };
  const sim = floating ? new THREE.ShaderMaterial({
    uniforms, vertexShader: screenVertex, fragmentShader: fluidFragment,
    depthTest: false, depthWrite: false, toneMapped: false,
  }) : null;
  function clearFlow() {
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(previous);
    renderer.setClearColor(blank, 0);
    for (const buffer of buffers) {
      renderer.setRenderTarget(buffer);
      renderer.clear();
    }
    renderer.setRenderTarget(null);
    renderer.setClearColor(previous, alpha);
  }
  function resize(width, height) {
    screenSize.set(width, height);
    const ratio = renderer.getPixelRatio();
    base.setSize(Math.floor(width * ratio), Math.floor(height * ratio));
    tuned.setSize(base.width, base.height);
    const scale = Math.min(.19, 240 / Math.max(width, height));
    const w = Math.max(16, Math.round(width * scale)), h = Math.max(16, Math.round(height * scale));
    uniforms.texel.value.set(1 / w, 1 / h);
    for (const buffer of buffers) buffer.setSize(w, h);
    clearFlow();
  }
  function advance(from, to, radius, delta, time) {
    if (!sim) return;
    const tick = clamp(delta * 60, .32, 2.1);
    uniforms.tick.value = tick;
    uniforms.time.value = time;
    uniforms.radius.value = radius;
    uniforms.inject.value = to ? 1 : 0;
    if (to) {
      uniforms.brushStart.value.copy(from ?? to);
      uniforms.brushEnd.value.copy(to);
      uniforms.impulse.value.copy(to).sub(from ?? to).divideScalar(tick).clampLength(0, 45);
    }
    quad.material = sim;
    function pass(index, output) {
      uniforms.pass.value = index;
      renderer.setRenderTarget(output);
      renderer.render(screen, camera);
    }
    uniforms.state.value = fields[0].texture;
    pass(0, fields[1]);
    uniforms.state.value = fields[1].texture;
    pass(1, derivatives);
    for (let i = 0; i < 6; i++) {
      uniforms.pressure.value = pressure[0].texture;
      pass(2, pressure[1]);
      pressure.reverse();
    }
    uniforms.pressure.value = pressure[0].texture;
    pass(3, fields[0]);
    renderer.setRenderTarget(null);
  }
  function draw(visible, center, brush, time) {
    const u = post.uniforms;
    u.flow.value = visible && floating ? 1 : 0;
    u.ink.value = fields[0]?.texture ?? base.texture;
    u.center.value.copy(center);
    u.brush.value = brush;
    u.time.value = time;
    quad.material = post;
    renderer.setRenderTarget(null);
    renderer.render(screen, camera);
  }
  function dispose() {
    for (const buffer of [...buffers, base, tuned]) buffer.dispose();
    quad.geometry.dispose();
    post.dispose();
    sim?.dispose();
  }
  return { base, tuned, resize, advance, draw, clearFlow, dispose, floating };
}

function prepareCar(asset) {
  const glazing = new Map([
    ['04  Clear headlamp lens', makeGlazing('Optics / thin cover reflection', '#f2f7ff', .026, .028, .43)],
    ['03  Light smoke / cabin glass', makeGlazing('Cabin / light smoke', '#8b989f', .13, .13, .49)],
  ]);
  const casters = [];
  asset.scene.traverse((part) => {
    if (!part.isMesh) return;
    const original = [part.material].flat();
    const materials = original.map((mat) => glazing.get(mat.name) ?? mat);
    part.material = Array.isArray(part.material) ? materials : materials[0];
    part.receiveShadow = materials.some((material) => !material.transparent);
    if (materials.some((material) => !material.transmission && !material.transparent)) casters.push(part);
  });
  return { scene: asset.scene, casters };
}

function headlamps(car, rig) {
  const optics = new Set();
  car.traverse((part) => {
    if (!part.isMesh) return;
    for (const material of [part.material].flat()) {
      if (material.name.startsWith('Optics / projector dome')) {
        material.emissive.set('#d7e9ff');
        material.emissiveIntensity = 0;
        optics.add(material);
      }
    }
  });
  const beams = [-1, 1].map((side) => {
    const beam = new THREE.SpotLight('#d6e8ff', 0, 5.5, .22, .89, 2);
    beam.position.set(side * .6456, .65, -1.76);
    beam.target.position.set(side * .69, .015, -4.35);
    rig.add(beam, beam.target);
    return beam;
  });
  function update(amount) {
    for (const material of optics) material.emissiveIntensity = 1.24 * amount;
    for (const beam of beams) beam.intensity = 12 * amount;
  }
  function dispose() {
    for (const beam of beams) {
      rig.remove(beam, beam.target);
      beam.dispose();
    }
  }
  return { update, dispose };
}

function settleCoverHem(geometry) {
  const position = geometry.attributes.position;
  const triangles = geometry.index.array;
  const neighbors = Array.from({ length: position.count }, () => new Set());
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    neighbors[a].add(b).add(c);
    neighbors[b].add(c).add(a);
    neighbors[c].add(a).add(b);
  }

  // Relax the folds nearest the floor before easing them down to the contact plane.
  const original = position.array;
  let points = original.slice();
  let relaxed = original.slice();
  for (let pass = 0; pass < 12; pass++) {
    for (let i = 0; i < position.count; i++) {
      const offset = i * 3;
      const amount = .64 * (1 - THREE.MathUtils.smoothstep(original[offset + 1], .12, .32));
      if (amount === 0) continue;
      let x = 0, y = 0, z = 0;
      const ring = neighbors[i];
      for (const adjacent of ring) {
        x += points[adjacent * 3];
        y += points[adjacent * 3 + 1];
        z += points[adjacent * 3 + 2];
      }
      relaxed[offset] = THREE.MathUtils.lerp(points[offset], x / ring.size, amount);
      relaxed[offset + 1] = THREE.MathUtils.lerp(points[offset + 1], y / ring.size, amount);
      relaxed[offset + 2] = THREE.MathUtils.lerp(points[offset + 2], z / ring.size, amount);
    }
    [points, relaxed] = [relaxed, points];
  }
  const contactHeight = .012;
  for (let i = 0; i < position.count; i++) {
    const offset = i * 3;
    const y = points[offset + 1];
    const drop = .027 * (1 - THREE.MathUtils.smoothstep(y, .12, .28));
    const clearance = Math.max(0, y - drop - contactHeight);
    const height = contactHeight + clearance * THREE.MathUtils.smoothstep(clearance, 0, .038);
    position.setXYZ(i, points[offset], height, points[offset + 2]);
  }
  geometry.computeVertexNormals();
}

function prepareCover(asset) {
  let mesh;
  asset.scene.traverse((part) => { if (part.isMesh) mesh = part; });
  if (!mesh) throw new Error('Полотно не загрузилось');
  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  settleCoverHem(mesh.geometry);
  const rest = position.array.slice();
  const fabric = document.createElement('canvas');
  fabric.width = fabric.height = 64;
  const painter = fabric.getContext('2d');
  painter.fillStyle = '#808080';
  painter.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) {
    for (let x = 0; x < 64; x += 2) {
      const value = 124 + 19 * Math.cos((x + y * .5) * Math.PI / 4);
      painter.fillStyle = `rgb(${value}, ${value}, ${value})`;
      painter.fillRect(x, y, 2, 2);
    }
  }
  const weave = new THREE.CanvasTexture(fabric);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(9, 12);
  weave.anisotropy = 4;
  mesh.material.dispose();
  mesh.material = new THREE.MeshPhysicalMaterial({
    color: '#8c8a85', roughness: .67, metalness: .025,
    sheen: .32, sheenColor: new THREE.Color('#d7d1c4'), sheenRoughness: .72,
    bumpMap: weave, bumpScale: .0025, side: THREE.DoubleSide,
  });
  mesh.material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 clothNormal = inverseTransformDirection(normal, viewMatrix);
      float topLight = smoothstep(-0.4, 0.94, clothNormal.y);
      float sideLight = 0.5 + 0.5 * dot(clothNormal, normalize(vec3(-0.72, 0.25, -0.65)));
      vec3 softLight = diffuseColor.rgb * (0.27 + 0.55 * topLight + 0.11 * sideLight);
      outgoingLight = mix(softLight, outgoingLight, 0.27);
      #include <opaque_fragment>
    `);
  };
  // A soft ground contact reads better than a hard silhouette from the hem.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  position.setUsage(THREE.DynamicDrawUsage);
  const duration = 1.16;
  const ramp = THREE.MathUtils.smoothstep;

  function pull(elapsed) {
    for (let i = 0; i < position.count; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      // The rear corner takes the load first. The front hem trails and ripples.
      const cross = uv.getX(i), length = uv.getY(i);
      const delay = .03 + .19 * length + .07 * cross;
      const t = Math.max(0, elapsed - delay);
      const lift = ramp(t, 0, .32);
      const flight = ramp(t, .10, .90);
      const loose = ramp(t, .06, .41) * (1 - .48 * flight);
      const flap = Math.sin(length * 14 + cross * 13 - t * 34) * loose;
      const curl = Math.cos(cross * 14 - length * 6 - t * 22) * loose;
      const angle = flight * .67;
      const width = x * (1 - .44 * flight);
      const span = (z - 1.10) * (1 - .15 * flight);
      position.setXYZ(i,
        Math.cos(angle) * width - Math.sin(angle) * span - 7.1 * flight + .19 * curl,
        y + 1.13 * lift + .88 * flight + flap * (.12 + .22 * length),
        1.10 + Math.sin(angle) * width + Math.cos(angle) * span + 4.8 * flight + .17 * curl,
      );
    }
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  function reset() {
    position.array.set(rest);
    position.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  return { scene: asset.scene, mesh, duration, pull, reset };
}

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = .86;
  renderer.transmissionResolutionScale = .85;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#111113');
  scene.fog = new THREE.Fog('#18181a', 15, 39);
  const camera = new THREE.PerspectiveCamera(23, 1, .075, 70);
  const rig = new THREE.Group();
  const environment = makeEnvironment(renderer);
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.0;
  const wall = matrixWall();
  scene.add(wall, rig);
  const groundContact = contactShadow();
  rig.add(groundContact);
  const studioLights = lights(scene);
  studioLights.reveal(0);
  const loader = new GLTFLoader();
  const [rachel, coverAsset, reflector] = await Promise.all([
    loader.loadAsync('./model.glb'),
    loader.loadAsync('./cover.glb'),
    floor(scene, renderer),
  ]);
  const liquid = makeLiquid(renderer);
  const car = prepareCar(rachel);
  const cover = prepareCover(coverAsset);
  rig.add(car.scene, cover.scene);
  for (const part of car.casters) part.castShadow = true;
  const lamps = headlamps(car.scene, rig);
  let ignitionAt = null;
  let lampReflection = 0;
  let covered = true;
  let tearing = false;
  let hover;
  let flowPoint;
  let flowUntil = 0;
  let fallbackBrush = 0;
  const flowCenter = new THREE.Vector2();
  const drip = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  const hits = [];

  // Keep the garage reflection and floor shadow stable while the cursor previews the livery.
  const reflect = reflector.onBeforeRender;
  let reflectionDirty = true;
  reflector.onBeforeRender = function (...args) {
    if (!reflectionDirty) return;
    reflectionDirty = false;
    const visible = cover.mesh.visible;
    const titleOpacity = wall.material.uniforms.titleOpacity;
    const opacity = titleOpacity.value;
    cover.mesh.visible = covered || tearing;
    titleOpacity.value = 0;
    try {
      reflect.apply(this, args);
    } finally {
      cover.mesh.visible = visible;
      titleOpacity.value = opacity;
    }
  };
  surface.append(renderer.domElement);
  stage.dataset.live = '';
  sequence.dataset.ready = '';
  revealButton.hidden = chapterNav.hidden = false;

  let angle = 0;
  let shadowAngle;
  let drag;
  let move;
  let frame = 0;
  let width = 0;
  let height = 0;
  let lastDraw = -Infinity;
  let stageInView = true;
  let scrollPosition = -1;
  let titlePosition = -1;
  let chapter = -1;

  function scrollExtent() {
    return Math.max(1, sequence.offsetHeight - stage.offsetHeight);
  }

  const shots = [
    { eye: new THREE.Vector3(-9.64, 1.22, -7.54), target: new THREE.Vector3(.12, 1.08, -.07), fov: 31.9 },
    { eye: new THREE.Vector3(-9.55, 2.27, .81), target: new THREE.Vector3(.11, .76, .06), fov: 33.5 },
    { eye: new THREE.Vector3(-4.65, 9.03, 5.26), target: new THREE.Vector3(0, .48, 0), fov: 34.2 },
  ];
  const cameraTarget = new THREE.Vector3();

  function frameCamera(progress, reveal) {
    const second = progress >= .49;
    const from = shots[second ? 1 : 0], to = shots[second ? 2 : 1];
    const step = second ? (progress - .49) / .51 : progress / .49;
    const eased = THREE.MathUtils.smoothstep(step, 0, 1);
    const aspect = width / height;
    const portrait = aspect < 1;
    const openingShot = 1 - THREE.MathUtils.smoothstep(progress, 0, .26);
    camera.position.lerpVectors(from.eye, to.eye, eased);
    cameraTarget.lerpVectors(from.target, to.target, eased);
    cameraTarget.y -= .33 * (1 - reveal) * (1 - THREE.MathUtils.smoothstep(progress, 0, .25));
    if (portrait) {
      cameraTarget.y -= .27 * (1 - progress);
      camera.position.multiplyScalar(1.045);
    }
    camera.position.lerp(cameraTarget, (portrait ? .19 : .10) * reveal * openingShot);
    camera.lookAt(cameraTarget);
    camera.aspect = aspect;
    const horizontalFov = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(from.fov, to.fov, eased));
    camera.fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(horizontalFov / 2) / aspect)), 17, 93);
    camera.updateProjectionMatrix();
    const title = wall.material.uniforms;
    const { width: textureWidth, height: textureHeight } = title.title.value.image;
    const titleAspect = textureWidth / textureHeight;
    const titleWidth = Math.min(portrait ? .77 : .65, .36 * titleAspect / aspect);
    const titleHeight = titleWidth * aspect / titleAspect;
    title.titleOpacity.value = reveal * (1 - THREE.MathUtils.smoothstep(progress, .075, .26));
    title.titleRect.value.set((1 - titleWidth) / 2, (portrait ? .525 : .506) - .04 * (1 - reveal),
      titleWidth, titleHeight);
  }

  function updateControls() {
    const current = Math.max(0, chapter);
    carName.hidden = current === 0 && !covered;
    carName.textContent = ['Премьера', 'Линии кузова', 'Вид сверху'][current];
    help.textContent = covered
      ? (coarsePointer.matches ? 'Коснись ткани, чтобы открыть машину.' : 'Наведи на ткань, чтобы увидеть кузов.')
      : ['Прокрути, чтобы сменить ракурс.', 'Потяни машину, чтобы повернуть её.', 'Модель Z33 · Underground 2'][current];
    revealButton.textContent = covered ? 'Снять полотно ↗' : 'Вернуть полотно ↺';
    controls.hidden = covered;
    stage.toggleAttribute('data-open', !covered);
    surface.setAttribute('role', covered ? 'button' : 'group');
    surface.setAttribute('aria-label', covered ? 'Снять полотно с Nissan 350Z'
      : 'Автомобиль Nissan 350Z. Стрелки поворачивают машину, Enter возвращает полотно.');
    stage.dataset.chapter = String(current);
    chapterButtons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });
  }

  function commitCover() {
    tearing = false;
    cover.mesh.visible = covered;
    renderer.shadowMap.needsUpdate = true;
    reflectionDirty = true;
  }

  function pickCar(x, y) {
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
    const point = new THREE.Vector2(x - rect.left, rect.bottom - y);
    cursor.set(point.x / rect.width * 2 - 1, point.y / rect.height * 2 - 1);
    raycaster.setFromCamera(cursor, camera);
    hits.length = 0;
    raycaster.intersectObject(cover.mesh, false, hits);
    return hits.length ? point : null;
  }

  function preview(point) {
    hover = covered && !reducedMotion.matches ? point : null;
    surface.toggleAttribute('data-preview', Boolean(hover));
    requestFrame();
  }

  function resetInk() {
    if (flowUntil) liquid.clearFlow();
    flowPoint = null;
    flowUntil = 0;
    fallbackBrush = 0;
  }

  function toggleCover() {
    covered = !covered;
    ignitionAt = covered ? null : performance.now();
    setTunedSound(!covered);
    if (covered) {
      sequence.removeAttribute('data-started');
      stage.removeAttribute('data-title');
      scrollTo({ top: 0, behavior: 'instant' });
      surface.focus({ preventScroll: true });
    } else {
      sequence.setAttribute('data-started', '');
    }
    preview(null);
    resetInk();
    cover.reset();
    updateControls();
    if (ignitionAt === null) {
      lamps.update(0);
      lampReflection = 0;
    }
    if (!covered && !reducedMotion.matches) tearing = true;
    else commitCover();
    requestFrame();
  }

  function requestFrame() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render(now) {
    frame = 0;
    if (document.hidden || !stageInView) return;
    if (move) {
      const step = reducedMotion.matches ? 1 : THREE.MathUtils.smoothstep(now - move.start, 0, 325);
      angle = THREE.MathUtils.lerp(move.from, move.to, step);
      if (step === 1) move = null;
    }
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const resized = rect.width !== width || rect.height !== height;
    const turned = shadowAngle !== angle;
    const animateWall = !reducedMotion.matches;
    const progress = covered ? 0 : clamp(-sequence.getBoundingClientRect().top / scrollExtent(), 0, 1);
    const nextChapter = progress < .27 ? 0 : progress < .76 ? 1 : 2;
    const cameraProgress = animateWall ? progress : Number(chapterButtons[nextChapter].dataset.progress);
    if (chapter !== nextChapter) {
      chapter = nextChapter;
      updateControls();
    }
    const delta = Math.min((now - lastDraw) / 1000, .10);
    const sinceIgnition = ignitionAt === null ? -1 : (now - ignitionAt) / 1000;
    const reveal = covered ? 0 : animateWall ? THREE.MathUtils.smoothstep(sinceIgnition, .36, 1.13) : 1;
    const cameraMoved = cameraProgress !== scrollPosition || reveal !== titlePosition;
    stage.toggleAttribute('data-title', !covered && (!animateWall || sinceIgnition >= .62));
    const starting = ignitionAt !== null && sinceIgnition < engineLightAt + .5;
    if (animateWall && !resized && !turned && !cameraMoved && !tearing && !hover && !starting && now > flowUntil && now - lastDraw < 1000 / 24) {
      requestFrame();
      return;
    }
    if (resized) {
      width = rect.width;
      height = rect.height;
      wall.material.uniforms.density.value = clamp(width * .034, 14, 29);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4, Math.sqrt(3_200_000 / (width * height))));
      renderer.setSize(width, height, false);
      liquid.resize(width, height);
      flowPoint = null;
    }
    if (resized || cameraMoved) {
      frameCamera(cameraProgress, reveal);
      if (titlePosition !== reveal) {
        studioLights.reveal(reveal);
        groundContact.scale.set(1 + .38 * (1 - reveal), 1 + .25 * (1 - reveal), 1);
      }
      scrollPosition = cameraProgress;
      titlePosition = reveal;
      reflectionDirty = true;
    }
    const time = now / 1000;
    const radius = clamp(width * .060, 38, 88);
    if (ignitionAt !== null) {
      const ramp = THREE.MathUtils.smoothstep(sinceIgnition, engineLightAt - .055, engineLightAt + .12);
      const flare = animateWall ? 1 + .19 * (1 - THREE.MathUtils.smoothstep(sinceIgnition, engineLightAt + .1, engineLightAt + .45)) : 1;
      const power = ramp * flare;
      lamps.update(power);
      if (Math.abs(power - lampReflection) > .25 || (power === 1 && lampReflection !== 1)) {
        lampReflection = power;
        reflectionDirty = true;
      }
    }
    if (tearing) {
      if (sinceIgnition >= cover.duration || !animateWall) commitCover();
      else {
        cover.pull(sinceIgnition);
        renderer.shadowMap.needsUpdate = true;
        reflectionDirty = true;
      }
    }
    if (animateWall && covered) {
      if (hover) {
        flowCenter.copy(hover);
        drip.set(hover.x + Math.sin(time * 4.6) * 12, hover.y + Math.sin(time * 7.1) * 7);
        flowUntil = now + 900;
      }
      if (now <= flowUntil) {
        liquid.advance(flowPoint, hover ? drip : null, radius, delta, time);
        if (hover) (flowPoint ??= new THREE.Vector2()).copy(drip);
        else flowPoint = null;
      } else if (flowUntil) {
        flowUntil = 0;
        liquid.clearFlow();
      }
      if (!liquid.floating) fallbackBrush = THREE.MathUtils.damp(fallbackBrush, hover ? radius : 0, 17, delta);
    }
    rig.rotation.y = angle;
    if (turned) {
      renderer.shadowMap.needsUpdate = true;
      shadowAngle = angle;
    }
    if (resized || turned) reflectionDirty = true;
    if (animateWall && Number.isFinite(lastDraw)) {
      wall.material.uniforms.time.value += Math.min((now - lastDraw) / 1000, .12);
    }
    const previewing = animateWall && covered && now <= flowUntil;
    cover.mesh.visible = covered || tearing;
    car.scene.visible = !covered;
    renderer.setRenderTarget(liquid.base);
    renderer.render(scene, camera);
    if (previewing) {
      cover.mesh.visible = false;
      car.scene.visible = true;
      renderer.setRenderTarget(liquid.tuned);
      renderer.render(scene, camera);
      cover.mesh.visible = true;
      car.scene.visible = false;
    }
    liquid.draw(previewing, flowCenter, previewing ? fallbackBrush : 0, time);
    lastDraw = now;
    if (move || animateWall || starting || tearing) requestFrame();
  }

  function turn(offset) {
    preview(null);
    resetInk();
    move = { from: angle, to: (move?.to ?? angle) + offset, start: performance.now() };
    requestFrame();
  }

  revealButton.addEventListener('click', toggleCover);
  for (const button of chapterButtons) {
    button.addEventListener('click', () => {
      const top = scrollY + sequence.getBoundingClientRect().top + Number(button.dataset.progress) * scrollExtent();
      scrollTo({ top, behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    });
  }
  for (const button of controls.querySelectorAll('[data-turn]')) {
    button.addEventListener('click', () => turn(Number(button.dataset.turn) * Math.PI / 6));
  }
  controls.querySelector('[data-home]').addEventListener('click', () => {
    preview(null);
    resetInk();
    move = { from: angle, to: Math.round(angle / (Math.PI * 2)) * Math.PI * 2, start: performance.now() };
    requestFrame();
  });
  surface.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCover();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    turn((event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 6);
  });
  surface.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    move = null;
    drag = { id: event.pointerId, x: event.clientX, startX: event.clientX, startY: event.clientY, moved: false };
    surface.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', (event) => {
    if (!event.isPrimary) return;
    if (!drag) {
      if (event.pointerType !== 'touch' && covered && !reducedMotion.matches) {
        preview(pickCar(event.clientX, event.clientY));
      }
      return;
    }
    if (drag.id !== event.pointerId) return;
    if (!drag.moved) {
      drag.moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 5;
      if (!drag.moved) return;
      preview(null);
      resetInk();
      surface.dataset.dragging = '';
    }
    angle += (event.clientX - drag.x) * .0105;
    drag.x = event.clientX;
    requestFrame();
  });
  surface.addEventListener('pointerleave', () => preview(null));
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    surface.addEventListener(type, (event) => {
      if (event.pointerId !== drag?.id) return;
      const { moved } = drag;
      drag = null;
      delete surface.dataset.dragging;
      if (type !== 'pointerup' || !covered) return;
      const point = pickCar(event.clientX, event.clientY);
      if (point && !moved) toggleCover();
      else if (event.pointerType !== 'touch') preview(point);
    });
  }
  const resize = new ResizeObserver(requestFrame);
  resize.observe(surface);
  const viewport = new IntersectionObserver(([entry]) => {
    stageInView = entry.isIntersecting;
    if (stageInView) requestFrame();
    else preview(null);
  });
  viewport.observe(stage);
  function onVisibility() {
    if (document.hidden) preview(null);
    requestFrame();
  }
  function onScroll() {
    if (covered) preview(null);
    else requestFrame();
  }
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('scroll', onScroll, { passive: true });
  reducedMotion.addEventListener('change', requestFrame);
  requestFrame();
  addEventListener('pagehide', (event) => {
    if (event.persisted) return;
    resize.disconnect();
    viewport.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    removeEventListener('scroll', onScroll);
    reducedMotion.removeEventListener('change', requestFrame);
    cancelAnimationFrame(frame);
    reflector.dispose();
    liquid.dispose();
    lamps.dispose();
    studioLights.key.shadow.dispose();
    environment.dispose();
    wall.material.uniforms.title.value.dispose();
    const resources = new Set();
    scene.traverse((part) => {
      if (!part.isMesh) return;
      resources.add(part.geometry);
      for (const material of [part.material].flat()) {
        if (part !== reflector) resources.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
      }
    });
    for (const resource of resources) resource.dispose();
    renderer.dispose();
  });
}

start().catch((error) => {
  help.textContent = 'Статичный предпросмотр';
  console.error('350Z Studio:', error.message);
});
