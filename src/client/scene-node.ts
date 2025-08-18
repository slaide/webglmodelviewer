import { mat4 } from 'gl-matrix';
import { Transform } from './transform';
import { Drawable } from './drawable';

export class SceneNode {
    public readonly id: string;
    public name: string;
    public enabled: boolean = true;
    public transform: Transform;
    public drawable: Drawable | null = null;
    
    private _parent: SceneNode | null = null;
    private _children: SceneNode[] = [];
    private _worldMatrix: mat4 = mat4.create();
    private _worldMatrixDirty: boolean = true;

    constructor(id: string, name: string = id) {
        this.id = id;
        this.name = name;
        this.transform = new Transform();
    }

    // Parent-child relationships
    public addChild(child: SceneNode): void {
        if (child._parent) {
            child._parent.removeChild(child);
        }
        
        child._parent = this;
        this._children.push(child);
        this.markWorldMatrixDirty();
    }

    public removeChild(child: SceneNode): boolean {
        const index = this._children.indexOf(child);
        if (index !== -1) {
            child._parent = null;
            this._children.splice(index, 1);
            this.markWorldMatrixDirty();
            return true;
        }
        return false;
    }

    public removeFromParent(): void {
        if (this._parent) {
            this._parent.removeChild(this);
        }
    }

    public getParent(): SceneNode | null {
        return this._parent;
    }

    public getChildren(): SceneNode[] {
        return [...this._children]; // Return copy to prevent external modification
    }

    public getChildCount(): number {
        return this._children.length;
    }

    public findChild(predicate: (node: SceneNode) => boolean): SceneNode | null {
        for (const child of this._children) {
            if (predicate(child)) {
                return child;
            }
        }
        return null;
    }

    public findChildById(id: string): SceneNode | null {
        return this.findChild(child => child.id === id);
    }

    public findChildByName(name: string): SceneNode | null {
        return this.findChild(child => child.name === name);
    }

    // Drawable component
    public setDrawable(drawable: Drawable | null): void {
        this.drawable = drawable;
    }

    public hasDrawable(): boolean {
        return this.drawable !== null;
    }

    public shouldDraw(): boolean {
        return this.enabled && this.drawable !== null && this.drawable.visible;
    }

    // Transform and matrix calculations
    public getWorldMatrix(): mat4 {
        if (this._worldMatrixDirty) {
            this.updateWorldMatrix();
        }
        return this._worldMatrix;
    }

    private updateWorldMatrix(): void {
        const parentWorldMatrix = this._parent ? this._parent.getWorldMatrix() : undefined;
        mat4.copy(this._worldMatrix, this.transform.getWorldMatrix(parentWorldMatrix));
        this._worldMatrixDirty = false;
    }

    public markWorldMatrixDirty(): void {
        this._worldMatrixDirty = true;
        
        // Mark all children as dirty too
        for (const child of this._children) {
            child.markWorldMatrixDirty();
        }
    }

    // Tree traversal
    public traverse(callback: (node: SceneNode) => void, enabledOnly: boolean = false): void {
        if (!enabledOnly || this.enabled) {
            callback(this);
            
            for (const child of this._children) {
                child.traverse(callback, enabledOnly);
            }
        }
    }

    public traverseDrawable(callback: (node: SceneNode, drawable: Drawable) => void): void {
        this.traverse(node => {
            if (node.shouldDraw() && node.drawable) {
                callback(node, node.drawable);
            }
        }, true);
    }

    // Utility methods
    public getDepth(): number {
        let depth = 0;
        let current = this._parent;
        while (current) {
            depth++;
            current = current._parent;
        }
        return depth;
    }

    public isAncestorOf(node: SceneNode): boolean {
        let current = node._parent;
        while (current) {
            if (current === this) {
                return true;
            }
            current = current._parent;
        }
        return false;
    }

    public isDescendantOf(node: SceneNode): boolean {
        return node.isAncestorOf(this);
    }

    public getRoot(): SceneNode {
        let current: SceneNode = this;
        while (current._parent) {
            current = current._parent;
        }
        return current;
    }

    // Debug
    public printTree(indent: string = ''): string {
        let result = `${indent}${this.name} (${this.id}) [enabled: ${this.enabled}, drawable: ${this.hasDrawable()}]\n`;
        
        for (const child of this._children) {
            result += child.printTree(indent + '  ');
        }
        
        return result;
    }
}