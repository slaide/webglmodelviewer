import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { WebGLRenderer } from './renderer';
import { ObjectEditor } from './object-editor';
import { debugLog } from './debug-logger';

interface TreeNodeElement {
    node: SceneNode;
    element: HTMLElement;
    expanded: boolean;
}

export class ObjectTreePanel {
    private renderer: WebGLRenderer;
    private objectEditor: ObjectEditor;
    private treeContainer: HTMLElement;
    private nodeElements: Map<string, TreeNodeElement> = new Map();
    private selectedNodeId: string | null = null;

    constructor(renderer: WebGLRenderer, objectEditor: ObjectEditor) {
        this.renderer = renderer;
        this.objectEditor = objectEditor;
        
        const container = document.getElementById('tree-content');
        if (!container) {
            throw new Error('Tree container not found');
        }
        this.treeContainer = container;
        
        this.initialize();
        debugLog.info('Object tree panel initialized');
    }

    private initialize(): void {
        this.refresh();
    }

    public refresh(): void {
        // Clear existing tree
        this.treeContainer.innerHTML = '';
        this.nodeElements.clear();

        // Build tree from scene root
        const sceneRoot = this.renderer.getSceneRoot();
        this.buildTreeNode(sceneRoot, this.treeContainer, 0);
    }

    private buildTreeNode(node: SceneNode, parentElement: HTMLElement, depth: number): HTMLElement {
        const nodeWrapper = document.createElement('div');
        
        const nodeElement = document.createElement('div');
        nodeElement.className = 'tree-node';
        nodeElement.dataset.nodeId = node.id;

        const nodeContent = document.createElement('div');
        nodeContent.className = 'tree-node-content';

        // Expand/collapse button
        const expandButton = document.createElement('button');
        expandButton.className = 'tree-expand-button';
        
        const hasChildren = node.getChildCount() > 0;
        if (hasChildren) {
            expandButton.textContent = '▶';
            expandButton.onclick = (e) => {
                e.stopPropagation();
                this.toggleNode(node.id);
            };
        } else {
            expandButton.textContent = ' ';
            expandButton.style.cursor = 'default';
        }

        // Node icon
        const icon = document.createElement('span');
        icon.className = 'tree-node-icon';
        if (node instanceof SceneObject) {
            icon.textContent = node.hasDrawable() ? '🧊' : '📦';
        } else {
            icon.textContent = hasChildren ? '📁' : '📄';
        }

        // Node label
        const label = document.createElement('span');
        label.className = 'tree-node-label';
        label.textContent = node.name;

        // Node info
        const info = document.createElement('span');
        info.className = 'tree-node-info';
        
        const infoText = [];
        if (!node.enabled) infoText.push('disabled');
        if (node.hasDrawable() && !node.drawable!.visible) infoText.push('hidden');
        if (node instanceof SceneObject && node.selected) infoText.push('selected');
        
        if (infoText.length > 0) {
            info.textContent = `(${infoText.join(', ')})`;
        }

        nodeContent.appendChild(expandButton);
        nodeContent.appendChild(icon);
        nodeContent.appendChild(label);
        nodeContent.appendChild(info);

        nodeElement.appendChild(nodeContent);

        // Click handler for selection
        nodeElement.onclick = (e) => {
            e.stopPropagation();
            this.selectNode(node);
        };

        // Hover handlers for bounding box preview
        nodeElement.onmouseenter = (e) => {
            e.stopPropagation();
            if (node instanceof SceneObject) {
                this.renderer.setHoveredObject(node);
            }
        };

        nodeElement.onmouseleave = (e) => {
            e.stopPropagation();
            this.renderer.setHoveredObject(null);
        };

        nodeWrapper.appendChild(nodeElement);

        // Children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        childrenContainer.style.display = 'none';

        // Add children
        if (hasChildren) {
            for (const child of node.getChildren()) {
                this.buildTreeNode(child, childrenContainer, depth + 1);
            }
        }

        nodeWrapper.appendChild(childrenContainer);
        parentElement.appendChild(nodeWrapper);

        // Store element reference
        this.nodeElements.set(node.id, {
            node: node,
            element: nodeWrapper,
            expanded: false
        });

        return nodeWrapper;
    }

    private toggleNode(nodeId: string): void {
        const nodeElement = this.nodeElements.get(nodeId);
        if (!nodeElement) return;

        const childrenContainer = nodeElement.element.querySelector('.tree-children') as HTMLElement;
        const expandButton = nodeElement.element.querySelector('.tree-expand-button') as HTMLElement;

        if (nodeElement.expanded) {
            // Collapse
            childrenContainer.style.display = 'none';
            expandButton.textContent = '▶';
            nodeElement.expanded = false;
        } else {
            // Expand
            childrenContainer.style.display = 'block';
            expandButton.textContent = '▼';
            nodeElement.expanded = true;
        }
    }

    private selectNode(node: SceneNode): void {
        // Clear previous selection visually
        if (this.selectedNodeId) {
            const prevElement = this.nodeElements.get(this.selectedNodeId);
            if (prevElement) {
                const prevNodeDiv = prevElement.element.querySelector('.tree-node') as HTMLElement;
                prevNodeDiv.classList.remove('selected');
            }
        }

        // Set new selection
        this.selectedNodeId = node.id;
        const nodeElement = this.nodeElements.get(node.id);
        if (nodeElement) {
            const nodeDiv = nodeElement.element.querySelector('.tree-node') as HTMLElement;
            nodeDiv.classList.add('selected');
        }

        // If this is a SceneObject, select it in the renderer and object editor
        if (node instanceof SceneObject) {
            // Use the new renderer method to properly clear all selections
            this.renderer.setSelectedObject(node);
            this.objectEditor.setSelectedObject(node);
            
            debugLog.info(`Tree selected: ${node.name}`);
        } else {
            // Clear selections if not a scene object
            this.renderer.setSelectedObject(null);
            this.objectEditor.setSelectedObject(null);
        }

        // Switch to objects tab to show the properties
        if (node instanceof SceneObject) {
            this.switchToObjectsTab();
        }
    }

    private switchToObjectsTab(): void {
        // Trigger the tab switch
        const objectsTab = document.getElementById('objects-tab');
        const objectsButton = document.querySelector('[onclick="switchTab(\'objects\')"]') as HTMLElement;
        
        if (objectsTab && objectsButton) {
            // Hide all tabs
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Hide all buttons
            const buttons = document.querySelectorAll('.tab-button');
            buttons.forEach(button => button.classList.remove('active'));
            
            // Show objects tab
            objectsTab.classList.add('active');
            objectsButton.classList.add('active');
        }
    }

    public selectNodeById(nodeId: string): void {
        const nodeElement = this.nodeElements.get(nodeId);
        if (nodeElement) {
            this.selectNode(nodeElement.node);
        }
    }

    public expandPath(nodeId: string): void {
        const nodeElement = this.nodeElements.get(nodeId);
        if (!nodeElement) return;

        // Expand all parents
        let current = nodeElement.node.getParent();
        while (current) {
            const currentElement = this.nodeElements.get(current.id);
            if (currentElement && !currentElement.expanded) {
                this.toggleNode(current.id);
            }
            current = current.getParent();
        }
    }

    public getSelectedNodeId(): string | null {
        return this.selectedNodeId;
    }

    // Called when scene objects are selected elsewhere (e.g., mouse click in 3D view)
    public syncWithRenderer(): void {
        const selectedObject = this.renderer.getSelectedObject();
        
        if (selectedObject && this.selectedNodeId !== selectedObject.id) {
            this.expandPath(selectedObject.id);
            this.selectNodeById(selectedObject.id);
        } else if (!selectedObject && this.selectedNodeId) {
            // Clear tree selection if no object is selected
            if (this.selectedNodeId) {
                const prevElement = this.nodeElements.get(this.selectedNodeId);
                if (prevElement) {
                    const prevNodeDiv = prevElement.element.querySelector('.tree-node') as HTMLElement;
                    prevNodeDiv.classList.remove('selected');
                }
            }
            this.selectedNodeId = null;
        }
    }
}