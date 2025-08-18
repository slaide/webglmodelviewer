import { vec3, mat4 } from 'gl-matrix';
import { Camera } from './camera';
import { SceneObject, BoundingBox } from './scene-object';
import { debugLog } from './debug-logger';

export interface Ray {
    origin: vec3;
    direction: vec3;
}

export class RayCaster {
    static createRayFromScreenPoint(x: number, y: number, width: number, height: number, camera: Camera): Ray {
        // Convert screen coordinates to normalized device coordinates (-1 to 1)
        const ndcX = (2.0 * x) / width - 1.0;
        const ndcY = 1.0 - (2.0 * y) / height; // Flip Y coordinate

        debugLog.info(`Screen: (${x.toFixed(1)}, ${y.toFixed(1)}) → NDC: (${ndcX.toFixed(3)}, ${ndcY.toFixed(3)})`);

        // Get current camera FOV and aspect ratio
        const fov = camera.getFov();
        const aspectRatio = camera.getAspectRatio();
        
        debugLog.info(`Camera FOV: ${(fov * 180 / Math.PI).toFixed(1)}°, Aspect: ${aspectRatio.toFixed(3)}`);
        
        // Calculate the half-angles
        const halfFovY = fov * 0.5;
        const halfFovX = Math.atan(Math.tan(halfFovY) * aspectRatio);
        
        // Convert NDC to angles
        const angleX = ndcX * halfFovX;
        const angleY = ndcY * halfFovY;
        
        // Create direction in camera space
        const directionCameraSpace = vec3.fromValues(
            Math.sin(angleX),
            Math.sin(angleY),
            -Math.cos(angleX) * Math.cos(angleY)
        );
        vec3.normalize(directionCameraSpace, directionCameraSpace);
        
        // Transform direction to world space using camera orientation
        const direction = vec3.create();
        
        // Use the camera's right, up, and front vectors to transform from camera space to world space
        const right = vec3.clone(camera.right);
        const up = vec3.clone(camera.up);
        const front = vec3.clone(camera.front);
        
        // direction = right * x + up * y + front * z (where front is -z in camera space)
        vec3.scale(right, right, directionCameraSpace[0]);
        vec3.scale(up, up, directionCameraSpace[1]);
        vec3.scale(front, front, -directionCameraSpace[2]); // Note: negative because camera looks down -Z
        
        vec3.add(direction, right, up);
        vec3.add(direction, direction, front);
        vec3.normalize(direction, direction);

        debugLog.info(`Ray direction: (${Array.from(direction).map(v => v.toFixed(3)).join(', ')})`);

        return { 
            origin: vec3.clone(camera.position), 
            direction 
        };
    }

    static rayBoxIntersection(ray: Ray, boundingBox: BoundingBox): number | null {
        const tMin = vec3.create();
        const tMax = vec3.create();

        // Calculate t values for each axis
        for (let i = 0; i < 3; i++) {
            if (Math.abs(ray.direction[i]) < 1e-6) {
                // Ray is parallel to this axis
                if (ray.origin[i] < boundingBox.min[i] || ray.origin[i] > boundingBox.max[i]) {
                    return null; // No intersection
                }
                tMin[i] = -Infinity;
                tMax[i] = Infinity;
            } else {
                const t1 = (boundingBox.min[i] - ray.origin[i]) / ray.direction[i];
                const t2 = (boundingBox.max[i] - ray.origin[i]) / ray.direction[i];
                
                tMin[i] = Math.min(t1, t2);
                tMax[i] = Math.max(t1, t2);
            }
        }

        const tNear = Math.max(tMin[0], tMin[1], tMin[2]);
        const tFar = Math.min(tMax[0], tMax[1], tMax[2]);

        if (tNear > tFar || tFar < 0) {
            return null; // No intersection
        }

        return tNear > 0 ? tNear : tFar;
    }

    static selectObject(x: number, y: number, width: number, height: number, camera: Camera, objects: SceneObject[]): SceneObject | null {
        const ray = this.createRayFromScreenPoint(x, y, width, height, camera);
        
        let closestObject: SceneObject | null = null;
        let closestDistance = Infinity;
        let intersectionResults: string[] = [];

        for (const obj of objects) {
            const worldBB = obj.getWorldBoundingBox();
            const distance = this.rayBoxIntersection(ray, worldBB);
            
            intersectionResults.push(`${obj.name}: ${distance !== null ? distance.toFixed(3) : 'miss'}`);
            
            if (distance !== null && distance < closestDistance) {
                closestDistance = distance;
                closestObject = obj;
            }
        }

        // Additional debug info for the first object to help diagnose issues
        if (objects.length > 0) {
            const obj = objects[0];
            debugLog.info(`${obj.name} center: ${Array.from(obj.position).map(v => v.toFixed(2)).join(',')}`);
            debugLog.info(`Camera pos: ${Array.from(camera.position).map(v => v.toFixed(2)).join(',')}`);
            debugLog.info(`Camera front: ${Array.from(camera.front).map(v => v.toFixed(2)).join(',')}`);
        }

        if (closestObject) {
            debugLog.info(`Selected: ${closestObject.name} (${intersectionResults.join(', ')})`);
        } else {
            debugLog.info(`No selection (${intersectionResults.join(', ')})`);
        }

        return closestObject;
    }
}