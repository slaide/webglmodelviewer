import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { SceneLight, LightType } from './lighting';
import { vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';

export type Vec3Array = [number, number, number];

export interface SceneASTNode {
  id: string;
  name: string;
  kind: 'node' | 'object' | 'light';
  enabled: boolean;
  transform: {
    position: Vec3Array;
    rotation: Vec3Array;
    scale: Vec3Array;
  };
  material?: {
    color: Vec3Array;
    ambient: number;
    diffuse: number;
    specular: number;
    shininess: number;
    wireframe?: boolean;
    geometry?: 'cube';
  };
  light?: {
    type: LightType;
    color: Vec3Array;
    intensity: number;
    range?: number;
    direction?: Vec3Array;
    innerConeAngle?: number;
    outerConeAngle?: number;
  };
  children: SceneASTNode[];
}

export interface SceneAST {
  version: 1;
  root: SceneASTNode;
}

export function serializeScene(root: SceneNode): SceneAST {
  const toArray = (v: any): Vec3Array => [v[0], v[1], v[2]] as Vec3Array;

  const serializeNode = (node: SceneNode): SceneASTNode => {
    const base: SceneASTNode = {
      id: node.id,
      name: node.name,
      kind: 'node',
      enabled: node.enabled,
      transform: {
        position: toArray(node.transform.position),
        rotation: toArray(node.transform.rotation),
        scale: toArray(node.transform.scale)
      },
      children: []
    };

    if (node instanceof SceneObject) {
      base.kind = 'object';
      base.material = {
        color: toArray(node.material.color),
        ambient: node.material.ambient,
        diffuse: node.material.diffuse,
        specular: node.material.specular,
        shininess: node.material.shininess,
        wireframe: !!node.drawable?.wireframe,
        geometry: 'cube'
      };
    } else if (node instanceof SceneLight) {
      base.kind = 'light';
      base.light = {
        type: node.lightData.type,
        color: toArray(node.lightData.color),
        intensity: node.lightData.intensity,
        range: node.lightData.range,
        direction: node.lightData.direction ? toArray(node.lightData.direction) : undefined,
        innerConeAngle: node.lightData.innerConeAngle,
        outerConeAngle: node.lightData.outerConeAngle
      };
    }

    base.children = node.getChildren().map(serializeNode);
    return base;
  };

  return {
    version: 1,
    root: serializeNode(root)
  };
}

export function deserializeScene(gl: WebGL2RenderingContext, ast: SceneAST): SceneNode {
  const makeNode = (n: SceneASTNode): SceneNode => {
    let node: SceneNode;
    if (n.kind === 'object') {
      // Currently only cube geometry
      node = new SceneObject(n.id, n.name, new Cube(gl));
      if (n.material) {
        const obj = node as SceneObject;
        const c = n.material.color || [0.8, 0.6, 0.4];
        obj.material.color[0] = c[0];
        obj.material.color[1] = c[1];
        obj.material.color[2] = c[2];
        obj.material.ambient = n.material.ambient ?? obj.material.ambient;
        obj.material.diffuse = n.material.diffuse ?? obj.material.diffuse;
        obj.material.specular = n.material.specular ?? obj.material.specular;
        obj.material.shininess = n.material.shininess ?? obj.material.shininess;
        if (obj.drawable) obj.drawable.wireframe = !!n.material.wireframe;
      }
    } else if (n.kind === 'light') {
      const type = n.light?.type ?? LightType.POINT;
      const light = new SceneLight(n.id, n.name, type);
      if (n.light) {
        const c = n.light.color || [1, 1, 1];
        light.setColor(c[0], c[1], c[2]);
        light.setIntensity(n.light.intensity ?? 1);
        if (typeof n.light.range === 'number') light.setRange(n.light.range);
        if (n.light.direction) light.setDirection(n.light.direction[0], n.light.direction[1], n.light.direction[2]);
        if (typeof n.light.innerConeAngle === 'number' && typeof n.light.outerConeAngle === 'number') {
          // Angles expected in radians in current representation
          // If your saved values are degrees, convert here.
          light.lightData.innerConeAngle = n.light.innerConeAngle;
          light.lightData.outerConeAngle = n.light.outerConeAngle;
        }
      }
      node = light;
    } else {
      node = new SceneNode(n.id, n.name);
    }

    node.enabled = n.enabled;
    vec3.set(node.transform.position, n.transform.position[0], n.transform.position[1], n.transform.position[2]);
    vec3.set(node.transform.rotation, n.transform.rotation[0], n.transform.rotation[1], n.transform.rotation[2]);
    vec3.set(node.transform.scale, n.transform.scale[0], n.transform.scale[1], n.transform.scale[2]);
    node.transform.markDirty();
    node.markWorldMatrixDirty();

    for (const child of n.children || []) {
      node.addChild(makeNode(child));
    }
    return node;
  };

  return makeNode(ast.root);
}
