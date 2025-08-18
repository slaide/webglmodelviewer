import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { SceneLight } from './lighting';
import { WebGLRenderer } from './renderer';
import { ObjectEditor } from './object-editor';
import { AssetManager } from './asset-manager';
import { debugLog } from './debug-logger';

interface TreeNodeElement {
    node: SceneNode;
    element: HTMLElement;
    expanded: boolean;
}

export class ObjectTreePanel {
    private renderer: WebGLRenderer;
    private objectEditor: ObjectEditor;
    private assetManager: AssetManager;
    private treeContainer: HTMLElement;
    private nodeElements: Map<string, TreeNodeElement> = new Map();
    private selectedNodeId: string | null = null;
    private collapsedNodes: Set<string> = new Set();
    private hoverExpandTimers: Map<string, number> = new Map();
    private lastDragOverNodeId: string | null = null;

    constructor(renderer: WebGLRenderer, objectEditor: ObjectEditor, assetManager: AssetManager) {
        this.renderer = renderer;
        this.objectEditor = objectEditor;
        this.assetManager = assetManager;
        
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
        // Global cleanup for any lingering drop indicators
        this.treeContainer.addEventListener('dragend', () => this.clearAllDropIndicators());
        this.treeContainer.addEventListener('drop', () => this.clearAllDropIndicators());
        // Update tree labels when names change via object editor
        document.addEventListener('scene-node-renamed', (ev: Event) => {
            const e = ev as CustomEvent<{ id: string, name: string }>;
            const det = (e && e.detail) ? e.detail : ({} as any);
            if (!det || !det.id) return;
            const entry = this.nodeElements.get(det.id);
            if (entry) {
                const label = entry.element.querySelector('.tree-node-label') as HTMLElement;
                if (label) label.textContent = det.name;
            }
        });
    }
    
    // Removed test button setup

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
        // Enable dragging of nodes (except the scene root)
        const isRoot = this.renderer.getSceneRoot() === node;
        nodeElement.draggable = !isRoot;
        // Accept drops is handled by unified DnD handlers below

        const nodeContent = document.createElement('div');
        nodeContent.className = 'tree-node-content';

        // Expand/collapse button
        const expandButton = document.createElement('button');
        expandButton.className = 'tree-expand-button';
        
        const hasChildren = node.getChildCount() > 0;
        if (hasChildren) {
            // Default expanded unless explicitly collapsed
            expandButton.textContent = this.collapsedNodes.has(node.id) ? '▶' : '▼';
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
        } else if (node instanceof SceneLight) {
            icon.textContent = '💡';
        } else {
            icon.textContent = hasChildren ? '📁' : '📄';
        }

        // Node label
        const label = document.createElement('span');
        label.className = 'tree-node-label';
        label.textContent = node.name;
        
        // Double-click to rename
        label.ondblclick = (e) => {
            e.stopPropagation();
            this.startRenaming(node, label);
        };

        // Node info
        const info = document.createElement('span');
        info.className = 'tree-node-info';
        
        const infoText = [];
        if (!node.enabled) infoText.push('disabled');
        if (node.hasDrawable() && !node.drawable!.visible) infoText.push('hidden');
        if (node instanceof SceneObject && node.selected) infoText.push('selected');
        // No additional info for lights per request
        
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

        // Drag start for moving nodes in the tree
        nodeElement.addEventListener('dragstart', (e) => {
            if (isRoot) return; // don't drag root
            e.stopPropagation();
            e.dataTransfer?.setData('text/plain', `node:${node.id}`);
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });

        // Common drag over/drop handlers (assets or nodes)
        const handleDragOver = (e: DragEvent) => {
            const dt = e.dataTransfer;
            if (!dt) return;
            const data = dt.getData('text/plain');
            if (data && (data.startsWith('asset:') || data.startsWith('node:'))) {
                e.preventDefault();
                e.stopPropagation();
                // Determine drop zone: before, into, after
                this.clearAllDropIndicators();
                const rect = (nodeElement as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const ratio = y / rect.height;
                const el = nodeElement as HTMLElement;
                if (ratio < 0.25) {
                    el.classList.add('drop-before');
                } else if (ratio > 0.75) {
                    el.classList.add('drop-after');
                } else {
                    el.classList.add('drop-into');
                }

                // Auto-expand collapsed nodes after a short hover
                this.lastDragOverNodeId = node.id;
                if (hasChildren && this.collapsedNodes.has(node.id) && !this.hoverExpandTimers.has(node.id)) {
                    const timerId = window.setTimeout(() => {
                        this.hoverExpandTimers.delete(node.id);
                        if (this.lastDragOverNodeId === node.id && this.collapsedNodes.has(node.id)) {
                            this.toggleNode(node.id);
                        }
                    }, 500);
                    this.hoverExpandTimers.set(node.id, timerId as unknown as number);
                }
            }
        };
        const handleDragLeave = (e: DragEvent) => {
            e.stopPropagation();
            (nodeElement as HTMLElement).classList.remove('drop-before','drop-after','drop-into','drop-target');
            // Cancel pending expand timer for this node
            const t = this.hoverExpandTimers.get(node.id);
            if (t) {
                clearTimeout(t);
                this.hoverExpandTimers.delete(node.id);
            }
        };
        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.clearAllDropIndicators();
            // Cancel pending expand timer for this node
            const t = this.hoverExpandTimers.get(node.id);
            if (t) {
                clearTimeout(t);
                this.hoverExpandTimers.delete(node.id);
            }
            const dt = e.dataTransfer;
            if (!dt) return;
            const payload = dt.getData('text/plain');
            if (!payload) return;
            // Asset instantiation
            if (payload.startsWith('asset:')) {
                const assetId = payload.slice('asset:'.length);
                // For assets, treat before/after as into node's parent; middle as into node
                const rect = (nodeElement as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const ratio = y / rect.height;
                let parent = node;
                if (ratio < 0.25 || ratio > 0.75) {
                    const p = node.getParent();
                    if (p) parent = p;
                }
                const newNode = this.assetManager.instantiateAsset(assetId, parent);
                if (newNode) {
                    this.refresh();
                    this.expandPath(parent.id);
                    this.selectNode(newNode);
                }
                return;
            }
            // Node move (reparent)
            if (payload.startsWith('node:')) {
                const draggedId = payload.slice('node:'.length);
                if (draggedId === node.id) return; // ignore drop on itself
                const draggedNode = this.renderer.findNodeById(draggedId);
                if (!draggedNode) return;
                const rect = (nodeElement as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const ratio = y / rect.height;
                if (ratio < 0.25 || ratio > 0.75) {
                    // Insert before/after as sibling
                    const parent = node.getParent();
                    if (!parent) return; // root has no parent
                    if (draggedNode === parent) return; // can't move parent beside its child
                    if (parent.isDescendantOf(draggedNode)) return; // avoid cycles
                    const siblings = parent.getChildren();
                    const targetIndex = siblings.findIndex(c => c.id === node.id);
                    let insertIndex = targetIndex + (ratio > 0.75 ? 1 : 0);
                    const currentParent = draggedNode.getParent();
                    if (currentParent === parent) {
                        const currentIndex = draggedNode.getIndexInParent();
                        if (currentIndex >= 0 && currentIndex < insertIndex) insertIndex--;
                    }
                    parent.addChildAt(draggedNode, insertIndex);
                    draggedNode.transform.markDirty();
                    draggedNode.markWorldMatrixDirty();
                    this.refresh();
                    this.expandPath(parent.id);
                    this.selectNode(draggedNode);
                } else {
                    // Drop into as child
                    if (draggedNode === node || draggedNode.isAncestorOf(node)) return;
                    node.addChild(draggedNode);
                    draggedNode.transform.markDirty();
                    draggedNode.markWorldMatrixDirty();
                    this.refresh();
                    this.expandPath(node.id);
                    this.selectNode(draggedNode);
                }
                return;
            }
        };

        // Asset DnD handlers already exist; unify with node DnD
        nodeElement.addEventListener('dragenter', handleDragOver);
        nodeElement.addEventListener('dragover', handleDragOver);
        nodeElement.addEventListener('dragleave', handleDragLeave);
        nodeElement.addEventListener('drop', handleDrop);

        // Hover handlers for bounding box preview
        nodeElement.onmouseenter = (e) => {
            e.stopPropagation();
            if (node instanceof SceneObject) {
                this.renderer.setHoveredObject(node);
            }
            // TODO: Add light visualization on hover
        };

        nodeElement.onmouseleave = (e) => {
            e.stopPropagation();
            this.renderer.setHoveredObject(null);
        };

        // Drag-and-drop asset instantiation visual indicator
        nodeWrapper.appendChild(nodeElement);

        // Children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'tree-children';
        // Show children by default unless this node is collapsed
        childrenContainer.style.display = hasChildren && !this.collapsedNodes.has(node.id) ? 'block' : 'none';
        // Allow dropping into the gap below to parent under this node
        childrenContainer.addEventListener('dragover', handleDragOver);
        childrenContainer.addEventListener('dragleave', handleDragLeave);
        childrenContainer.addEventListener('drop', handleDrop);

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
            expanded: hasChildren ? !this.collapsedNodes.has(node.id) : false
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
            this.collapsedNodes.add(nodeId);
        } else {
            // Expand
            childrenContainer.style.display = 'block';
            expandButton.textContent = '▼';
            nodeElement.expanded = true;
            this.collapsedNodes.delete(nodeId);
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

        // Handle selection for any node type
        if (node instanceof SceneObject) {
            // For SceneObjects, sync renderer object's selection and clear light selection
            this.renderer.setSelectedObject(node);
            this.renderer.setSelectedLight(null);
        } else if (node instanceof SceneLight) {
            // For SceneLights, clear object selection and set light selection for gizmo
            this.renderer.setSelectedObject(null);
            this.renderer.setSelectedLight(node);
        } else {
            // For other node types, clear both selections
            this.renderer.setSelectedObject(null);
            this.renderer.setSelectedLight(null);
        }
        
        // Always update object editor with the selected node
        this.objectEditor.setSelectedObject(node);
        
        debugLog.info(`Tree selected: ${node.name} (${node.constructor.name})`);

        // Switch to objects tab to show the properties
        this.switchToObjectsTab();
    }

    private switchToObjectsTab(): void {
        // Trigger the tab switch
        const editorTab = document.getElementById('editor-tab');
        const editorButton = document.querySelector('[onclick="switchTab(\'editor\')"]') as HTMLElement;
        
        if (editorTab && editorButton) {
            // Hide all tabs
            const tabs = document.querySelectorAll('.tab-content');
            tabs.forEach(tab => tab.classList.remove('active'));
            
            // Hide all buttons
            const buttons = document.querySelectorAll('.tab-button');
            buttons.forEach(button => button.classList.remove('active'));
            
            // Show objects tab
            editorTab.classList.add('active');
            editorButton.classList.add('active');
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

    private clearAllDropIndicators(): void {
        const active = this.treeContainer.querySelectorAll('.drop-before, .drop-after, .drop-into, .drop-target');
        active.forEach(el => el.classList.remove('drop-before','drop-after','drop-into','drop-target'));
    }

    private startRenaming(node: SceneNode, labelElement: HTMLSpanElement): void {
        const originalName = node.name;
        
        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.className = 'tree-rename-input';
        input.style.cssText = `
            background: white;
            border: 1px solid #007acc;
            border-radius: 2px;
            padding: 1px 3px;
            font-family: inherit;
            font-size: inherit;
            width: 100%;
            box-sizing: border-box;
        `;

        // Replace label with input
        const parent = labelElement.parentElement!;
        parent.replaceChild(input, labelElement);
        input.focus();
        input.select();

        const finishRenaming = (save: boolean) => {
            if (save && input.value.trim() && input.value.trim() !== originalName) {
                node.name = input.value.trim();
                labelElement.textContent = node.name;
                debugLog.info(`Renamed object to: ${node.name}`);
            } else {
                labelElement.textContent = originalName;
            }
            
            // Restore label
            parent.replaceChild(labelElement, input);
        };

        // Handle keyboard events
        input.onkeydown = (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                finishRenaming(true);
            } else if (e.key === 'Escape') {
                finishRenaming(false);
            }
        };

        // Handle losing focus
        input.onblur = () => {
            finishRenaming(true);
        };
    }

    // Called when scene objects are selected elsewhere (e.g., mouse click in 3D view)
    public syncWithRenderer(): void {
        const selectedObject = this.renderer.getSelectedObject();
        
        if (selectedObject && this.selectedNodeId !== selectedObject.id) {
            // Renderer has a selected object that's different from tree selection
            this.expandPath(selectedObject.id);
            this.selectNodeById(selectedObject.id);
        } else if (!selectedObject && this.selectedNodeId) {
            // Check if we have a currently selected node in the tree
            const currentTreeNode = this.selectedNodeId ? this.nodeElements.get(this.selectedNodeId)?.node : null;
            
            // Only clear tree selection if the current selection is a SceneObject
            // (meaning it should be synced with renderer)
            // Keep tree selection for lights and plain scene nodes
            if (currentTreeNode instanceof SceneObject) {
                // Clear tree selection if no object is selected in renderer
                const prevElement = this.nodeElements.get(this.selectedNodeId);
                if (prevElement) {
                    const prevNodeDiv = prevElement.element.querySelector('.tree-node') as HTMLElement;
                    prevNodeDiv.classList.remove('selected');
                }
                this.selectedNodeId = null;
                this.objectEditor.setSelectedObject(null);
            }
            // For lights and plain scene nodes, we keep the tree selection active
        }
    }
}
