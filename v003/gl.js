// GL helper (v3.0): one WebGL2 context, full screen passes between render targets. Every Image in the graph is a texture of the working size.
// Convention: uv (0,0) is the bottom left of the picture and the picture is upright in every texture; the video is flipped once when it is uploaded.
export const W = 540, H = 960;                              // working size of every image (moderate: runs on the iPad)
const VS = `#version 300 es
in vec2 p; out vec2 uv; void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2D;\nin vec2 uv; out vec4 o;\n';

export function makeGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true, alpha: false });
  if (!gl) return null;
  const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const progs = new Map();
  let lastErr = '';
  function prog(frag) {
    let p = progs.get(frag); if (p) return p;
    const pg = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, HEAD + frag]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { lastErr = gl.getShaderInfoLog(s); console.error('Shader:', lastErr); }
      gl.attachShader(pg, s);
    }
    gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg);
    p = { pg, loc: new Map() }; progs.set(frag, p); return p;
  }
  const loc = (p, n) => { let l = p.loc.get(n); if (l === undefined) { l = gl.getUniformLocation(p.pg, n); p.loc.set(n, l); } return l; };
  function texture(w = W, h = H) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  function target(w = W, h = H) {                             // a texture you can draw into
    const tex = texture(w, h), fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }
  // draw one full screen pass: inputs { samplerName: texture }, uniforms { name: number | [2..4 numbers] }, into a target (or the canvas when tgt is null)
  function pass(frag, inputs, uniforms, tgt) {
    const p = prog(frag); gl.useProgram(p.pg); gl.bindVertexArray(vao);
    let u = 0; for (const [n, t] of Object.entries(inputs || {})) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(loc(p, n), u++); }
    for (const [n, v] of Object.entries(uniforms || {})) {
      const l = loc(p, n); if (l === null) continue;
      if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 2) gl.uniform2fv(l, v); else if (v.length === 3) gl.uniform3fv(l, v); else gl.uniform4fv(l, v);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, tgt ? tgt.fbo : null); gl.viewport(0, 0, tgt ? tgt.w : canvas.width, tgt ? tgt.h : canvas.height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function upload(tex, source) {                              // a video frame into a texture, flipped so it is upright
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  const present = (tex) => pass('uniform sampler2D src; void main() { o = vec4(texture(src, uv).rgb, 1.0); }', { src: tex }, {}, null);
  return { gl, pass, target, texture, upload, present, error: () => lastErr };
}
