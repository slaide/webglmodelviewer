import { mat4, vec3 } from 'gl-matrix';
import { Cube } from './geometry/cube';
import { SceneNode } from './scene-node';
import { Drawable, Material, BoundingBox, Geometry } from './drawable';

// Re-export types for backward compatibility
export { Material, BoundingBox };

export class SceneObject extends SceneNode {
    public selected = false;
    private _geometry: Cube;

    constructor(id: string, name: string, geometry: Cube) {
        super(id, name);
        this._geometry = geometry;
        
        // Create drawable component
        const drawable = new Drawable(geometry);
        this.setDrawable(drawable);
        
        this.updateModelMatrix();
    }

    // Backward compatibility properties - delegate to transform and drawable
    public get position(): vec3 { return this.transform.position; }
    public set position(value: vec3) { 
        vec3.copy(this.transform.position, value); 
        this.transform.markDirty();
        this.markWorldMatrixDirty();
    }

    public get rotation(): vec3 { return this.transform.rotation; }
    public set rotation(value: vec3) { 
        vec3.copy(this.transform.rotation, value); 
        this.transform.markDirty();
        this.markWorldMatrixDirty();
    }

    public get scale(): vec3 { return this.transform.scale; }
    public set scale(value: vec3) { 
        vec3.copy(this.transform.scale, value); 
        this.transform.markDirty();
        this.markWorldMatrixDirty();
    }

    public get modelMatrix(): mat4 { return this.getWorldMatrix(); }

    public get material(): Material { 
        return this.drawable?.material || {
            color: vec3.fromValues(0.8, 0.6, 0.4),
            ambient: 0.1,
            diffuse: 0.8,
            specular: 0.5,
            shininess: 32.0
        };
    }
    public set material(value: Material) { 
        if (this.drawable) {
            this.drawable.material = value;
        }
    }

    public get boundingBox(): BoundingBox { 
        return this.drawable?.boundingBox || {
            min: vec3.fromValues(-1.0, -1.0, -1.0),
            max: vec3.fromValues(1.0, 1.0, 1.0)
        };
    }
    public set boundingBox(value: BoundingBox) { 
        if (this.drawable) {
            this.drawable.setBoundingBox(value.min, value.max);
        }
    }

    public get geometry(): Cube { return this._geometry; }

    updateModelMatrix() {
        // No longer needed as we use the transform system
        // Keep for backward compatibility but it's now a no-op
    }

    getWorldBoundingBox(): BoundingBox {
        const worldMin = vec3.create();
        const worldMax = vec3.create();
        
        // Transform local bounding box to world space
        const corners = [
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.min[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.min[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.min[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.min[0], this.boundingBox.max[1], this.boundingBox.max[2]),
            vec3.fromValues(this.boundingBox.max[0], this.boundingBox.max[1], this.boundingBox.max[2])
        ];

        vec3.copy(worldMin, corners[0]);
        vec3.copy(worldMax, corners[0]);

        for (const corner of corners) {
            vec3.transformMat4(corner, corner, this.modelMatrix);
            vec3.min(worldMin, worldMin, corner);
            vec3.max(worldMax, worldMax, corner);
        }

        return { min: worldMin, max: worldMax };
    }

    render() {
        if (this.drawable) {
            this.drawable.render();
        }
    }
}