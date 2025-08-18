export interface ParsedOBJ {
  positions: Float32Array;
  normals?: Float32Array; // optional; if missing, compute flat normals downstream
  material?: {
    color?: [number, number, number];
    ambient?: number;
    diffuse?: number;
    specular?: number;
    shininess?: number;
  };
}

export function parseMTL(text: string): Record<string, any> {
  const lines = text.split(/\r?\n/);
  const materials: Record<string, any> = {};
  let current: any = null;
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line || line.startsWith('#')) continue;
    const [key, ...rest] = line.split(/\s+/);
    switch (key.toLowerCase()) {
      case 'newmtl':
        current = { name: rest.join(' ') };
        materials[current.name] = current;
        break;
      case 'kd': {
        const [r, g, b] = rest.map(parseFloat);
        current.Kd = [r, g, b];
        break;
      }
      case 'ka': {
        const [r, g, b] = rest.map(parseFloat);
        current.Ka = [r, g, b];
        break;
      }
      case 'ks': {
        const [r, g, b] = rest.map(parseFloat);
        current.Ks = [r, g, b];
        break;
      }
      case 'ns':
        current.Ns = parseFloat(rest[0]);
        break;
    }
  }
  return materials;
}

export function parseOBJ(text: string, mtl: Record<string, any>): ParsedOBJ {
  const v: number[][] = [];
  const vn: number[][] = [];
  const outPos: number[] = [];
  const outNor: number[] = [];
  const lines = text.split(/\r?\n/);
  let currentMtl: any = null;
  let anyMissingNormals = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0];
    if (key === 'v') {
      v.push(parts.slice(1).map(parseFloat));
    } else if (key === 'vn') {
      vn.push(parts.slice(1).map(parseFloat));
    } else if (key === 'usemtl') {
      currentMtl = mtl[parts[1]] || null;
    } else if (key === 'f') {
      const verts = parts.slice(1).map(token => token.split('/'));
      for (let i = 1; i + 1 < verts.length; i++) {
        const tri = [verts[0], verts[i], verts[i + 1]];
        for (const comp of tri) {
          const vi = parseInt(comp[0], 10) - 1;
          const vni = comp[2] ? (parseInt(comp[2], 10) - 1) : -1;
          outPos.push(v[vi][0], v[vi][1], v[vi][2]);
          if (vni >= 0 && vn[vni]) {
            outNor.push(vn[vni][0], vn[vni][1], vn[vni][2]);
          } else {
            anyMissingNormals = true;
            // placeholder
            outNor.push(0, 0, 0);
          }
        }
      }
    }
  }

  const material = currentMtl
    ? {
        color: (currentMtl.Kd as [number, number, number]) || undefined,
        ambient: currentMtl.Ka ? currentMtl.Ka[0] : undefined,
        diffuse: currentMtl.Kd ? currentMtl.Kd[0] : undefined,
        specular: currentMtl.Ks ? currentMtl.Ks[0] : undefined,
        shininess: currentMtl.Ns,
      }
    : undefined;

  return {
    positions: new Float32Array(outPos),
    normals: anyMissingNormals ? undefined : new Float32Array(outNor),
    material,
  };
}

