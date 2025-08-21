export interface ParsedOBJMaterial {
  name?: string;
  color?: [number, number, number];
  ambient?: number;
  diffuse?: number;
  specular?: number;
  shininess?: number;
  texture?: string; // map_Kd
}

export interface ParsedOBJMeta {
  hasUVs: boolean;
  hasNormals: boolean;
  smoothing: boolean;
  groups: string[];
  objects: string[];
  materialsUsed: { name: string; texture?: string }[];
}

export interface ParsedOBJ {
  positions: Float32Array;
  normals?: Float32Array; // optional; if missing, compute flat normals downstream
  uvs?: Float32Array;
  material?: ParsedOBJMaterial;
  meta: ParsedOBJMeta;
  submeshes?: {
    name: string;
    positions: Float32Array;
    normals?: Float32Array;
    uvs?: Float32Array;
    material?: ParsedOBJMaterial;
  }[];
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
      case 'map_kd':
        current.map_Kd = rest.join(' ');
        break;
    }
  }
  return materials;
}

export function parseOBJ(text: string, mtl: Record<string, any>): ParsedOBJ {
  const v: number[][] = [];
  const vn: number[][] = [];
  const vt: number[][] = [];
  const outPos: number[] = [];
  const outNor: number[] = [];
  const outUV: number[] = [];
  // Per-group accumulation
  const groupsData = new Map<string, { pos:number[]; nor:number[]; uv:number[]; mtl:any }>();
  const ensureGroup = (name: string) => {
    if (!groupsData.has(name)) groupsData.set(name, { pos: [], nor: [], uv: [], mtl: null });
    return groupsData.get(name)!;
  };
  let currentGroup = 'default';
  const lines = text.split(/\r?\n/);
  let currentMtl: any = null;
  let anyMissingNormals = false;
  let hasUVs = false;
  let smoothing = false;
  const groups: string[] = [];
  const objects: string[] = [];
  const materialsUsed: { name: string; texture?: string }[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const key = parts[0];
    if (key === 'v') {
      v.push(parts.slice(1).map(parseFloat));
    } else if (key === 'vn') {
      vn.push(parts.slice(1).map(parseFloat));
    } else if (key === 'vt') {
      vt.push(parts.slice(1).map(parseFloat));
    } else if (key.toLowerCase() === 'o') {
      const name = parts.slice(1).join(' ');
      if (name) objects.push(name);
      if (name) currentGroup = name;
    } else if (key.toLowerCase() === 'g') {
      const name = parts.slice(1).join(' ');
      if (name) groups.push(name);
      if (name) currentGroup = name;
    } else if (key.toLowerCase() === 's') {
      const val = (parts[1] || '').toLowerCase();
      smoothing = val !== 'off' && val !== '0';
    } else if (key === 'usemtl') {
      currentMtl = mtl[parts[1]] || null;
      if (parts[1]) {
        const entry = { name: parts[1], texture: currentMtl?.map_Kd as string | undefined };
        if (!materialsUsed.find(m => m.name === entry.name)) materialsUsed.push(entry);
      }
    } else if (key === 'f') {
      const verts = parts.slice(1).map(token => token.split('/'));
      for (let i = 1; i + 1 < verts.length; i++) {
        const tri = [verts[0], verts[i], verts[i + 1]];
        for (const comp of tri) {
          const vi = parseInt(comp[0], 10) - 1;
          const vti = comp[1] ? (parseInt(comp[1], 10) - 1) : -1;
          const vni = comp[2] ? (parseInt(comp[2], 10) - 1) : -1;
          outPos.push(v[vi][0], v[vi][1], v[vi][2]);
          if (vti >= 0 && vt[vti]) {
            hasUVs = true;
            outUV.push(vt[vti][0], vt[vti][1]);
          } else {
            outUV.push(0, 0);
          }
          if (vni >= 0 && vn[vni]) {
            outNor.push(vn[vni][0], vn[vni][1], vn[vni][2]);
          } else {
            anyMissingNormals = true;
            // placeholder
            outNor.push(0, 0, 0);
          }
          // Also add to current group buffers
          const g = ensureGroup(currentGroup);
          g.pos.push(v[vi][0], v[vi][1], v[vi][2]);
          if (vti >= 0 && vt[vti]) {
            g.uv.push(vt[vti][0], vt[vti][1]);
          } else {
            g.uv.push(0, 0);
          }
          if (vni >= 0 && vn[vni]) {
            g.nor.push(vn[vni][0], vn[vni][1], vn[vni][2]);
          } else {
            g.nor.push(0, 0, 0);
          }
          if (currentMtl) g.mtl = currentMtl;
        }
      }
    }
  }

  const material = currentMtl
    ? {
        name: currentMtl.name,
        color: (currentMtl.Kd as [number, number, number]) || undefined,
        ambient: currentMtl.Ka ? currentMtl.Ka[0] : undefined,
        diffuse: currentMtl.Kd ? currentMtl.Kd[0] : undefined,
        specular: currentMtl.Ks ? currentMtl.Ks[0] : undefined,
        shininess: currentMtl.Ns,
        texture: currentMtl.map_Kd,
      }
    : undefined;

  return {
    positions: new Float32Array(outPos),
    normals: (!smoothing || anyMissingNormals) ? undefined : new Float32Array(outNor),
    uvs: hasUVs ? new Float32Array(outUV) : undefined,
    material,
    meta: {
      hasUVs,
      hasNormals: !anyMissingNormals,
      smoothing,
      groups,
      objects,
      materialsUsed
    },
    submeshes: Array.from(groupsData.entries()).map(([name, data]) => ({
      name,
      positions: new Float32Array(data.pos),
      normals: (!smoothing || anyMissingNormals) ? undefined : new Float32Array(data.nor),
      uvs: hasUVs ? new Float32Array(data.uv) : undefined,
      material: data.mtl ? {
        name: data.mtl.name,
        color: (data.mtl.Kd as [number, number, number]) || undefined,
        ambient: data.mtl.Ka ? data.mtl.Ka[0] : undefined,
        diffuse: data.mtl.Kd ? data.mtl.Kd[0] : undefined,
        specular: data.mtl.Ks ? data.mtl.Ks[0] : undefined,
        shininess: data.mtl.Ns,
        texture: data.mtl.map_Kd,
      } : undefined
    }))
  };
}
