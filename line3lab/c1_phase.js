// CANDIDATE c1_phase: the phase-field serpentine (the Line_v03 prototype in line3.js, kept here as the reference). WebGL2.
// The line is where a "phase" number crosses the middle of a step. Phase grows faster where the tone says "dense", so the runs crowd together there.
// The picture is cut into pieces along the runs; inside a piece every run is dead straight, between two pieces it jogs sideways.
// Difference to line3.js: square U-turns (squareness 1 = the rectangular U-turns of the reference image) and sized for this lab (540 x 960).
import { toneAt, clamp } from './shared.js';

export default {
  id: 'c1_phase',
  name: 'Phase-field serpentine (reference)',
  principle: 'One scalar "phase" number grows across the picture, faster where the tone is dense; the line is every place where the phase is a half step, so neighbouring runs are joined top and bottom into one string.',
  control: 'Run length = the straight stretch before a sideways jog (sharp 90 degrees at softness 0). Squareness turns the round U-turns into rectangular ones. Density = tone contrast and the two gaps.',
  motion: 'The phase is rebuilt from the eased tone every frame, so runs slide; nothing is created or removed inside the picture.',
  sliders: [
    { id: 'run', label: 'Run length px (straight stretch before the jog)', min: 20, max: 960, step: 1, val: 150 },
    { id: 'soft', label: 'Jog softness (0 sharp, 1 long S)', min: 0, max: 1, step: 0.005, val: 0.02 },
    { id: 'sq', label: 'U-turn squareness (0 round, 1 rectangular)', min: 0, max: 1, step: 0.01, val: 1 },
    { id: 'gmin', label: 'Closest gap px (dense)', min: 1.5, max: 15, step: 0.1, val: 2.8 },
    { id: 'gmax', label: 'Widest gap px (sparse)', min: 4, max: 45, step: 0.1, val: 13 },
    { id: 'con', label: 'Density contrast', min: 0.3, max: 5, step: 0.01, val: 1.6 },
    { id: 'w', label: 'Line width px', min: 0.5, max: 8, step: 0.05, val: 1.5 },
    { id: 'mar', label: 'Turn room px', min: 4, max: 60, step: 1, val: 14 },
  ],
  create(env) {
    const { W, H } = env, NU = 192;
    const gl = env.canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 is not available');
    const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
    const FS = `#version 300 es
precision highp float; precision highp int; precision highp sampler2D;
uniform sampler2D fld; uniform vec2 canv; uniform float nseg, nu, mar, soft, hw, sq;
uniform vec3 paper, ink;
out vec4 o;
float ph(int seg, float uu, float U) {
  float c = clamp(uu / U, 0.0, 1.0) * nu; int c0 = int(floor(c)); int c1 = min(c0 + 1, int(nu)); float f = c - float(c0);
  return mix(texelFetch(fld, ivec2(c0, seg), 0).r, texelFetch(fld, ivec2(c1, seg), 0).r, f);
}
void main() {
  vec2 q = vec2(gl_FragCoord.x, canv.y - gl_FragCoord.y);
  float U = canv.x, V = canv.y, u = q.x, v = q.y;
  float run = V - 2.0 * mar, Ls = run / nseg;
  float vr = clamp(v, mar, V - mar) - mar;
  float pos = vr / Ls - 0.5; int i0 = int(clamp(floor(pos), 0.0, nseg - 1.0)); int i1 = int(min(float(i0) + 1.0, nseg - 1.0));
  float tt = clamp(pos - float(i0), 0.0, 1.0);
  float ww = smoothstep(0.5 - soft * 0.5, 0.5 + soft * 0.5, tt);
  float phi = mix(ph(i0, u, U), ph(i1, u, U), ww);
  float g = max(length(vec2(dFdx(phi), dFdy(phi))), 1e-5);
  float a = 0.0;
  if (v >= mar && v <= V - mar) {
    float f = abs(fract(phi) - 0.5) / g;
    a = clamp(hw - f + 0.5, 0.0, 1.0);
  } else {
    bool top = v < mar; float t2 = top ? mar - v : v - (V - mar);
    float c = top ? 2.0 * floor(phi * 0.5) + 1.0 : 2.0 * floor((phi + 1.0) * 0.5);
    float gu = max(abs(dFdx(phi)), 1e-5);
    vec2 d = vec2(phi - c, t2 * gu);
    float pw = mix(2.0, 14.0, sq);
    float r = pow(pow(abs(d.x), pw) + pow(abs(d.y), pw), 1.0 / pw);
    float f = abs(r - 0.5) / gu;
    a = clamp(hw - f + 0.5, 0.0, 1.0);
    if (!top && c < 1.0) a = 0.0;
  }
  o = vec4(mix(paper, ink, a), 1.0);
}`;
    const pg = gl.createProgram();
    for (const [t, s_] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) {
      const s = gl.createShader(t); gl.shaderSource(s, s_); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(pg, s);
    }
    gl.bindAttribLocation(pg, 0, 'p'); gl.linkProgram(pg);
    const UL = {}; for (const n of ['fld', 'canv', 'nseg', 'nu', 'mar', 'soft', 'hw', 'sq', 'paper', 'ink']) UL[n] = gl.getUniformLocation(pg, n);
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    let fld = new Float32Array(1);

    return {
      draw(f) {
        const P = f.P, mar = P.mar, nseg = Math.max(1, Math.round((H - 2 * mar) / Math.max(10, P.run)));
        const gmax = P.gmax, gmin = Math.min(P.gmin, gmax - 0.5), con = P.con;
        if (fld.length !== (NU + 1) * nseg) fld = new Float32Array((NU + 1) * nseg);
        const Ls = (H - 2 * mar) / nseg;
        for (let s = 0; s < nseg; s++) {
          const v0 = (mar + s * Ls) / H, v1 = (mar + (s + 1) * Ls) / H, nr = Math.max(2, Math.ceil((v1 - v0) * 80));
          let ph = 0; fld[s * (NU + 1)] = 0;
          for (let k = 0; k < NU; k++) {
            let tsum = 0; const uc = (k + 0.5) / NU;
            for (let r = 0; r < nr; r++) tsum += toneAt(uc, v0 + (v1 - v0) * (r + 0.5) / nr);
            const t = clamp((tsum / nr - 0.5) * con + 0.5), gap = gmax + (gmin - gmax) * t;
            ph += (W / NU) / gap; fld[s * (NU + 1) + k + 1] = ph;
          }
        }
        let ref = 0; for (let s = 0; s < nseg; s++) ref += fld[s * (NU + 1) + NU]; ref /= nseg;   // every piece ends with the same total (same number of runs), kept continuous (never rounded)
        for (let s = 0; s < nseg; s++) { const sc = ref / Math.max(1e-6, fld[s * (NU + 1) + NU]); for (let k = 0; k <= NU; k++) fld[s * (NU + 1) + k] *= sc; }   // scaled (not shifted), so the phase never runs backwards
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, NU + 1, nseg, 0, gl.RED, gl.FLOAT, fld);
        gl.useProgram(pg); gl.bindVertexArray(vao); gl.uniform1i(UL.fld, 0);
        gl.uniform2f(UL.canv, W, H); gl.uniform1f(UL.nseg, nseg); gl.uniform1f(UL.nu, NU); gl.uniform1f(UL.mar, mar);
        gl.uniform1f(UL.soft, Math.max(0.0005, P.soft)); gl.uniform1f(UL.hw, P.w / 2); gl.uniform1f(UL.sq, P.sq);
        gl.uniform3fv(UL.paper, f.paper.map((x) => x / 255)); gl.uniform3fv(UL.ink, f.ink.map((x) => x / 255));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
    };
  },
};
