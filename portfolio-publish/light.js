// Ribbon Glow — Originkit. Original GLSL, adapted to this portfolio.
// https://www.originkit.dev/components/ribbon-glow?preset=base

const LAYERS = 84
const TWIST = 1.25 // radians of swirl at full Hover under the pointer
const DRAG = 0.18 // how far pointer motion drags the plane

const VERT_SRC = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`

// No backticks anywhere in the shader strings: one inside a GLSL comment would
// end the template literal.
const FIELD_SRC = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uSize;
uniform float uAngle;
uniform vec2 uMouse;
uniform float uOn;
uniform float uReach;
uniform vec2 uVel;
out vec4 o;

const float TAU = 6.28318530718;
const float LAYERS = ${LAYERS.toFixed(1)};
const float TWIST = ${TWIST.toFixed(3)};
const float DRAG = ${DRAG.toFixed(3)};
const float GAIN = 0.62;
const vec2 CENTRE = vec2(-0.62, 0.24);
const float TILT = 0.6;
const float ZOOM = 1.05;
const float THETA = 2.13;
const float SHEAR = 0.963;
const float SHRINK = 0.953;
const vec2 WARP_FREQ = vec2(0.42, 2.4);
const vec2 WARP_AMP = vec2(0.13, 0.027);
const vec2 ASPECT = vec2(2.1, 0.17);
const float OFFSET = 0.36;
const float GLOW = 0.0021;
const float SOFT = 0.0019;
const float FALLOFF = 0.37;
const float PHASE = 12.0;
const float CYCLE = 0.16;
const float HUE_TRAVEL = 2.0;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

void main() {
  vec2 R = uRes;
  vec2 pos = (gl_FragCoord.xy - 0.5 * R) / R.y;

  // The plane swirls around the pointer and is dragged by its motion. Skipped
  // outright at zero weight: mouse + (pos - mouse) does not round-trip, so
  // Hover 0 would still nudge the frame by a float ulp.
  vec2 d = pos - uMouse;
  float w = uOn * exp(-dot(d, d) / (uReach * uReach));
  if (w > 1e-4) pos = uMouse + rot(w * TWIST) * d * (1.0 - 0.3 * min(w, 1.0)) - uVel * min(w, 1.0) * DRAG;

  pos = rot(uAngle) * pos / uSize;
  float t = uTime * 0.49 + PHASE;
  float breath = (-sin(uTime * 0.735) + sin(uTime * 0.49 + 1.0)) * 0.25 + 0.5;
  vec2 u = rot(TILT) * ((pos - CENTRE) * (ZOOM - breath * 0.085));
  mat2 fold = mat2(cos(THETA), sin(THETA), -SHEAR, cos(THETA));

  vec3 col = vec3(0.0);
  for (float i = 1.0; i <= LAYERS; i += 1.0) {
    u.x -= sin(u.y * WARP_FREQ.x + t + i * 0.007) * WARP_AMP.x;
    u.y -= sin(u.x * WARP_FREQ.y - t + i * 0.02) * WARP_AMP.y;
    u = fold * u * SHRINK;
    vec2 q = (u - vec2(OFFSET + breath * 0.1, 0.0)) * ASPECT;
    float g = GLOW / (dot(q, q) + SOFT) * (0.25 + breath * 0.4);
    float r = length(u);
    float k = sin(i * CYCLE + t * 1.2 + r * HUE_TRAVEL) * 0.5 + 0.5;
    col += g * mix(uC1, uC2, k) * (0.62 + 0.5 * k) * exp2(-r * FALLOFF);
  }
  vec3 x = max(col * GAIN, 0.0);
  col = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.85, 0.92, 0.98));
  col *= 1.0 - smoothstep(0.5, 1.6, length(pos)) * 0.07;
  o = vec4(col, 1.0);
}
`

const FINISH_SRC = `#version 300 es
precision highp float;
uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;
uniform float uPaper;
out vec4 o;

float ign(vec2 p, float f) { p += 5.588238 * mod(f, 64.0); return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y)); }

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 L = max(texture(uField, frag / uRes).rgb, 0.0);
  // Dark ground: the ribbons are light, screened over it. Light ground: the
  // same hues laid on as pigment, the paper showing where the light is dim.
  vec3 dark = uBg + L * (1.0 - uBg);
  float strength = clamp(max(L.r, max(L.g, L.b)), 0.0, 1.0);
  vec3 paper = uBg * (1.0 - strength) + L * 0.96;
  vec3 col = mix(dark, paper, uPaper);
  col += (ign(frag, floor(uTime * 24.0)) - 0.5) / 255.0;
  o = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

function ribbonProgram(gl, fragment) {
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
    gl.deleteShader(shader);
    return null;
  }

  const vert = compile(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compile(gl.FRAGMENT_SHADER, fragment);
  const program = vert && frag ? gl.createProgram() : null;
  if (program) {
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
  }
  if (vert) gl.deleteShader(vert);
  if (frag) gl.deleteShader(frag);
  if (!program || gl.getProgramParameter(program, gl.LINK_STATUS)) return program;
  gl.deleteProgram(program);
  return null;
}

function ribbonTarget(gl) {
  const fbo = gl.createFramebuffer();
  const texture = gl.createTexture();
  let width = 0;
  let height = 0;
  let half = Boolean(gl.getExtension('EXT_color_buffer_float'));
  let ready = false;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  for (const param of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) {
    gl.texParameteri(gl.TEXTURE_2D, param, gl.LINEAR);
  }
  for (const param of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) {
    gl.texParameteri(gl.TEXTURE_2D, param, gl.CLAMP_TO_EDGE);
  }

  function resize(nextWidth, nextHeight) {
    if (width === nextWidth && height === nextHeight) return ready;
    width = nextWidth;
    height = nextHeight;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (let attempt = 0; attempt < 2; attempt++) {
      gl.texImage2D(gl.TEXTURE_2D, 0, half ? gl.RGBA16F : gl.RGBA8, width, height,
        0, gl.RGBA, half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      ready = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      if (ready || !half) break;
      half = false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return ready;
  }

  return {
    fbo, texture, resize,
    dispose() {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(texture);
    }
  };
}

window.createLight = function createLight(canvas, capture = false) {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: capture, powerPreference: 'low-power'
  });
  if (!gl) return null;

  const field = ribbonProgram(gl, FIELD_SRC);
  const finish = ribbonProgram(gl, FINISH_SRC);
  if (!field || !finish) {
    if (field) gl.deleteProgram(field);
    if (finish) gl.deleteProgram(finish);
    return null;
  }
  const uniforms = (program, keys) => Object.fromEntries(
    keys.split(' ').map(key => [key, gl.getUniformLocation(program, key)])
  );
  const uf = uniforms(field, 'uRes uTime uC1 uC2 uSize uAngle uMouse uOn uReach uVel');
  const un = uniforms(finish, 'uField uRes uTime uBg uPaper');
  const vao = gl.createVertexArray();
  const target = ribbonTarget(gl);
  let clock = 0;
  let mx = 0;
  let my = 0;
  let vx = 0;
  let vy = 0;
  let presence = 0;

  function draw(dt, progress, pointer, paused) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height || gl.isContextLost()) return false;

    // Keep the original two-pass effect. Limit the shaded pixels on large screens.
    const density = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(650000 / (width * height)));
    const bw = Math.max(1, Math.round(width * density));
    const bh = Math.max(1, Math.round(height * density));
    const fw = Math.max(1, Math.round(bw / 2));
    const fh = Math.max(1, Math.round(bh / 2));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    if (!target.resize(fw, fh)) return false;

    if (!paused && !capture) {
      clock = (clock + dt * .9) % 3600;
      if (pointer && presence < .02) {
        mx = pointer.x;
        my = pointer.y;
      }
      presence += (Number(Boolean(pointer)) - presence) * (1 - Math.exp(-dt * 5));
      const k = 1 - Math.exp(-dt * 16);
      const nx = mx + ((pointer?.x ?? mx) - mx) * k;
      const ny = my + ((pointer?.y ?? my) - my) * k;
      if (dt > 0) {
        const kv = 1 - Math.exp(-dt * 8);
        vx += ((nx - mx) / dt - vx) * kv;
        vy += ((ny - my) / dt - vy) * kv;
      }
      mx = nx;
      my = ny;
    }
    const speed = Math.hypot(vx, vy) / height;
    const cap = speed > 3 ? 3 / speed : 1;

    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, fw, fh);
    gl.useProgram(field);
    gl.uniform2f(uf.uRes, fw, fh);
    gl.uniform1f(uf.uTime, clock);
    gl.uniform3f(uf.uC1, 47 / 255, 211 / 255, 242 / 255);
    gl.uniform3f(uf.uC2, 123 / 255, 97 / 255, 1);
    gl.uniform1f(uf.uSize, 1 + progress * .07);
    gl.uniform1f(uf.uAngle, -Math.PI + progress * .11);
    gl.uniform2f(uf.uMouse, (mx - width / 2) / height, (height / 2 - my) / height);
    gl.uniform1f(uf.uOn, presence * .82);
    gl.uniform1f(uf.uReach, 240 / height);
    gl.uniform2f(uf.uVel, vx / height * cap, -vy / height * cap);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(finish);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.uniform1i(un.uField, 0);
    gl.uniform2f(un.uRes, bw, bh);
    gl.uniform1f(un.uTime, clock);
    gl.uniform3f(un.uBg, 11 / 255, 10 / 255, 16 / 255);
    gl.uniform1f(un.uPaper, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }

  return {
    draw,
    dispose() {
      target.dispose();
      gl.deleteVertexArray(vao);
      gl.deleteProgram(field);
      gl.deleteProgram(finish);
    }
  };
};
