import { vec3 } from 'gl-matrix';
import { SceneNode } from './scene-node';

export enum LightType {
    POINT = 'point',
    DIRECTIONAL = 'directional',
    SPOT = 'spot'
}

export interface LightData {
    type: LightType;
    color: vec3;
    intensity: number;
    // Point and Spot light properties
    position?: vec3;
    range?: number;
    // Directional and Spot light properties  
    direction?: vec3;
    // Spot light properties
    innerConeAngle?: number;
    outerConeAngle?: number;
}

export class Light {
    constructor(
        public position: vec3,
        public color: vec3
    ) {}
}

export class SceneLight extends SceneNode {
    public lightData: LightData;
    
    constructor(id: string, name: string, lightType: LightType = LightType.POINT) {
        super(id, name);
        
        this.lightData = {
            type: lightType,
            color: vec3.fromValues(1, 1, 1),
            intensity: 1.0,
            position: vec3.fromValues(0, 0, 0),
            range: 10.0,
            direction: vec3.fromValues(0, -1, 0),
            innerConeAngle: Math.PI / 6, // 30 degrees
            outerConeAngle: Math.PI / 4  // 45 degrees
        };
    }

    public setLightType(type: LightType): void {
        this.lightData.type = type;
    }

    public setColor(r: number, g: number, b: number): void {
        vec3.set(this.lightData.color, r, g, b);
    }

    public setIntensity(intensity: number): void {
        this.lightData.intensity = Math.max(0, intensity);
    }

    public setRange(range: number): void {
        this.lightData.range = Math.max(0.1, range);
    }

    public setDirection(x: number, y: number, z: number): void {
        if (!this.lightData.direction) {
            this.lightData.direction = vec3.create();
        }
        vec3.set(this.lightData.direction, x, y, z);
        vec3.normalize(this.lightData.direction, this.lightData.direction);
    }

    public setSpotAngles(innerDegrees: number, outerDegrees: number): void {
        this.lightData.innerConeAngle = (innerDegrees * Math.PI) / 180;
        this.lightData.outerConeAngle = (outerDegrees * Math.PI) / 180;
    }

    // Get world position (accounting for transform hierarchy)
    public getWorldPosition(): vec3 {
        if (this.lightData.type === LightType.DIRECTIONAL) {
            return vec3.fromValues(0, 0, 0); // Directional lights don't have position
        }
        
        const worldMatrix = this.getWorldMatrix();
        const worldPos = vec3.create();
        
        // Extract position from world matrix
        vec3.set(worldPos, worldMatrix[12], worldMatrix[13], worldMatrix[14]);
        return worldPos;
    }

    // Get world direction (accounting for transform hierarchy)
    public getWorldDirection(): vec3 {
        if (this.lightData.type === LightType.POINT) {
            return vec3.fromValues(0, -1, 0); // Point lights don't have direction
        }
        
        const worldMatrix = this.getWorldMatrix();
        const localDir = this.lightData.direction || vec3.fromValues(0, -1, 0);
        const worldDir = vec3.create();
        
        // Transform direction by world matrix (without translation)
        vec3.transformMat4(worldDir, localDir, worldMatrix);
        // Subtract translation to get pure direction
        vec3.subtract(worldDir, worldDir, vec3.fromValues(worldMatrix[12], worldMatrix[13], worldMatrix[14]));
        vec3.normalize(worldDir, worldDir);
        
        return worldDir;
    }
}