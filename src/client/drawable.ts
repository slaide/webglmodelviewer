import { vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';

export interface Material {
    color: vec3;
    ambient: number;
    diffuse: number;
    specular: number;
    shininess: number;
}

export interface BoundingBox {
    min: vec3;
    max: vec3;
}

export interface Geometry {
    render(): void;
    renderWireframe?(): void;
    getStats?(): { vertices: number; faces: number };
}

export class Drawable {
    public visible: boolean = true;
    public wireframe: boolean = false;
    public material: Material;
    public geometry: Geometry;
    public boundingBox: BoundingBox;
    
    constructor(geometry: Geometry, material?: Partial<Material>) {
        this.geometry = geometry;
        this.material = {
            color: vec3.fromValues(0.8, 0.6, 0.4),
            ambient: 0.1,
            diffuse: 0.8,
            specular: 0.5,
            shininess: 32.0,
            ...material
        };
        
        // Default bounding box - can be updated by specific geometry types
        this.boundingBox = {
            min: vec3.fromValues(-1.0, -1.0, -1.0),
            max: vec3.fromValues(1.0, 1.0, 1.0)
        };
    }

    public setMaterial(material: Partial<Material>): void {
        Object.assign(this.material, material);
    }

    public setColor(r: number, g: number, b: number): void {
        vec3.set(this.material.color, r, g, b);
    }

    public setBoundingBox(min: vec3, max: vec3): void {
        vec3.copy(this.boundingBox.min, min);
        vec3.copy(this.boundingBox.max, max);
    }

    public render(): void {
        if (this.visible) {
            if (this.wireframe && this.geometry.renderWireframe) {
                this.geometry.renderWireframe();
            } else {
                this.geometry.render();
            }
        }
    }

    public clone(): Drawable {
        const cloned = new Drawable(this.geometry, {
            color: vec3.clone(this.material.color),
            ambient: this.material.ambient,
            diffuse: this.material.diffuse,
            specular: this.material.specular,
            shininess: this.material.shininess
        });
        
        cloned.visible = this.visible;
        cloned.setBoundingBox(this.boundingBox.min, this.boundingBox.max);
        
        return cloned;
    }
}
