import { SceneNode } from './scene-node';
import { SceneObject } from './scene-object';
import { SceneLight, LightType } from './lighting';
import { WebGLRenderer } from './renderer';
import { ObjectEditor } from './object-editor';
import { AssetManager } from './asset-manager';
import { debugLog } from './debug-logger';
import { vec3 } from 'gl-matrix';

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
    private contextMenu: HTMLElement | null = null;
    private contextTargetNode: SceneNode | null = null;
    private submenuExpandDirection: 'right' | 'left' = 'right';
    private submenuMeasured: { width: number; height: number } | null = null;
    private hideMenuTimeoutId: number | null = null;
    private confirmModal: HTMLElement | null = null;
    private confirmMessage: HTMLElement | null = null;
    private confirmAcceptBtn: HTMLButtonElement | null = null;
    private confirmCancelBtn: HTMLButtonElement | null = null;
    private pendingDeleteNode: SceneNode | null = null;

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
        // Context menu element
        this.contextMenu = document.getElementById('context-menu');
        if (this.contextMenu) {
            document.addEventListener('click', () => this.hideContextMenu());
            window.addEventListener('blur', () => this.hideContextMenu());
            // If pointer leaves the window entirely, schedule hide
            window.addEventListener('mouseout', (e: MouseEvent) => {
                const related = e.relatedTarget as Node | null;
                if (!related) this.scheduleContextMenuHide();
            });
            this.contextMenu.addEventListener('click', (e) => this.onContextMenuClick(e));

            // Setup submenu for "Add Child"
            const addChildItem = document.getElementById('ctx-add-child');
            const addChildSub = document.getElementById('context-submenu-add-child');

            if (addChildItem && addChildSub) {
                const hideSubmenu = () => { addChildSub.style.display = 'none'; addChildItem.classList.remove('active'); };
                const showSubmenu = () => {
                    // Position submenu according to chosen direction, within viewport
                    const itemRect = addChildItem.getBoundingClientRect();
                    // Ensure we have dimensions for submenu even while hidden
                    let subW = this.submenuMeasured?.width ?? 0;
                    let subH = this.submenuMeasured?.height ?? 0;
                    if (!subW || !subH) {
                        addChildSub.style.visibility = 'hidden';
                        addChildSub.style.display = 'block';
                        const r = addChildSub.getBoundingClientRect();
                        subW = r.width; subH = r.height;
                        addChildSub.style.display = 'none';
                        addChildSub.style.visibility = 'visible';
                        this.submenuMeasured = { width: subW, height: subH };
                    }
                    const vw = window.innerWidth, vh = window.innerHeight;
                    let left = this.submenuExpandDirection === 'right' ? (itemRect.right + 4) : (itemRect.left - subW - 4);
                    let top = itemRect.top;
                    // Clamp horizontal within viewport
                    if (left + subW + 4 > vw) left = vw - subW - 4;
                    if (left < 4) left = 4;
                    // Clamp vertical within viewport
                    if (top + subH + 4 > vh) {
                        top = Math.max(4, vh - subH - 4);
                    }
                    addChildSub.style.left = left + 'px';
                    addChildSub.style.top = top + 'px';
                    addChildSub.style.display = 'block';
                    addChildItem.classList.add('active');
                };

                // Hover interactions for submenu visibility
                addChildItem.addEventListener('mouseenter', () => { this.cancelContextMenuHide(); showSubmenu(); });
                this.contextMenu.addEventListener('mouseenter', () => this.cancelContextMenuHide());
                this.contextMenu.addEventListener('mouseleave', (ev) => {
                    // If moving into submenu, don't hide yet
                    const to = ev.relatedTarget as Node | null;
                    if (to && addChildSub.contains(to)) return;
                    this.scheduleContextMenuHide();
                });
                // When hovering another top-level item in the main menu, close the submenu
                this.contextMenu.addEventListener('mouseover', (ev) => {
                    const tgt = ev.target as HTMLElement | null;
                    if (!tgt) return;
                    const item = tgt.closest('.ctx-item');
                    if (item && item !== addChildItem) hideSubmenu();
                });
                addChildSub.addEventListener('mouseleave', (ev) => {
                    // If moving back to parent menu, keep open
                    const to = ev.relatedTarget as Node | null;
                    if (to && this.contextMenu!.contains(to)) return;
                    this.scheduleContextMenuHide();
                });
                addChildSub.addEventListener('mouseenter', () => {
                    // keep shown while hovering submenu
                    this.cancelContextMenuHide();
                    addChildSub.style.display = 'block';
                });
                // Submenu click delegates to main handler via data-action
                addChildSub.addEventListener('click', (e) => this.onContextMenuClick(e));
            }
        }
        // Confirm modal setup
        this.confirmModal = document.getElementById('confirm-modal');
        this.confirmMessage = document.getElementById('confirm-modal-message');
        this.confirmAcceptBtn = document.getElementById('confirm-accept') as HTMLButtonElement | null;
        this.confirmCancelBtn = document.getElementById('confirm-cancel') as HTMLButtonElement | null;
        if (this.confirmModal && this.confirmAcceptBtn && this.confirmCancelBtn) {
            // Backdrop click closes if clicking the overlay itself
            this.confirmModal.addEventListener('click', (e) => {
                if (e.target === this.confirmModal) this.hideConfirmModal();
            });
            this.confirmCancelBtn.addEventListener('click', () => this.hideConfirmModal());
            this.confirmAcceptBtn.addEventListener('click', () => {
                const node = this.pendingDeleteNode;
                this.hideConfirmModal();
                if (node) this.performDeleteNode(node);
            });
            // Escape closes
            window.addEventListener('keydown', (e: KeyboardEvent) => {
                if (this.confirmModal && this.confirmModal.style.display === 'flex' && e.key === 'Escape') {
                    this.hideConfirmModal();
                }
            });
        }
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
        // Keyboard delete handler
        document.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (!this.selectedNodeId) return;
                const entry = this.nodeElements.get(this.selectedNodeId);
                const node = entry?.node || null;
                if (!node || node === this.renderer.getSceneRoot()) return;
                this.requestDeleteNode(node);
                e.preventDefault();
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

        // Right-click context menu
        nodeElement.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.selectNode(node);
            this.showContextMenu(e.clientX, e.clientY, node);
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
            // Some browsers don't expose getData during dragover; allow drop regardless
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
                let insertedBeforeAfter = false;
                let desiredIndex = -1;
                if (ratio < 0.25 || ratio > 0.75) {
                    const p = node.getParent();
                    if (p) {
                        parent = p;
                        const siblings = parent.getChildren();
                        const targetIndex = siblings.findIndex(c => c.id === node.id);
                        desiredIndex = ratio < 0.25 ? targetIndex : targetIndex + 1;
                        insertedBeforeAfter = true;
                    }
                }
                const newNode = this.assetManager.instantiateAsset(assetId, parent);
                if (newNode) {
                    // If before/after, move new node to the desired index
                    if (insertedBeforeAfter) {
                        const currentParent = newNode.getParent();
                        if (currentParent === parent) {
                            const currentIndex = newNode.getIndexInParent();
                            if (currentIndex >= 0) {
                                // Adjust index if needed due to append-at-end behavior
                                parent.removeChild(newNode);
                                // Clamp desiredIndex to bounds
                                const clamped = Math.max(0, Math.min(desiredIndex, parent.getChildren().length));
                                parent.addChildAt(newNode, clamped);
                            }
                        }
                    }
                    this.refresh();
                    this.expandPath(parent.id);
                    this.selectNode(newNode);
                }
                return;
            }
            // Asset submesh instantiation
            if (payload.startsWith('asset-sub:')) {
                const parts = payload.split(':');
                const aId = parts[1];
                const idx = parseInt(parts[2], 10);
                const rect = (nodeElement as HTMLElement).getBoundingClientRect();
                const y = e.clientY - rect.top;
                const ratio = y / rect.height;
                let parent = node;
                let insertedBeforeAfter = false;
                let desiredIndex = -1;
                if (ratio < 0.25 || ratio > 0.75) {
                    const p = node.getParent();
                    if (p) {
                        parent = p;
                        const siblings = parent.getChildren();
                        const targetIndex = siblings.findIndex(c => c.id === node.id);
                        desiredIndex = ratio < 0.25 ? targetIndex : targetIndex + 1;
                        insertedBeforeAfter = true;
                    }
                }
                const newNode = this.assetManager.instantiateAssetSubmesh(aId, idx, parent);
                if (newNode) {
                    if (insertedBeforeAfter) {
                        const currentParent = newNode.getParent();
                        if (currentParent === parent) {
                            parent.removeChild(newNode);
                            const clamped = Math.max(0, Math.min(desiredIndex, parent.getChildren().length));
                            parent.addChildAt(newNode, clamped);
                        }
                    }
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

    private showContextMenu(x: number, y: number, node: SceneNode | null) {
        this.contextTargetNode = node;
        if (!this.contextMenu) return;
        this.contextMenu.style.display = 'block';
        const menu = this.contextMenu;
        // First position the menu at the click, within viewport
        let rect = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let posX = Math.min(x, vw - rect.width - 4);
        let posY = Math.min(y, vh - rect.height - 4);
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';
        // After positioning, re-read rect for accurate edges
        rect = menu.getBoundingClientRect();
        // Ensure any submenu is hidden initially and determine expansion direction using final menu rect
        const sub = document.getElementById('context-submenu-add-child') as HTMLElement | null;
        if (sub) {
            sub.style.display = 'none';
            // Temporarily show invisibly to measure size
            sub.style.visibility = 'hidden';
            sub.style.display = 'block';
            const subRect = sub.getBoundingClientRect();
            this.submenuMeasured = { width: subRect.width, height: subRect.height };
            sub.style.display = 'none';
            sub.style.visibility = 'visible';

            const spaceRight = vw - (rect.right + 4);
            const spaceLeft = rect.left - 4;
            if (spaceRight >= subRect.width) {
                this.submenuExpandDirection = 'right';
            } else if (spaceLeft >= subRect.width) {
                this.submenuExpandDirection = 'left';
            } else {
                // Neither side fits fully; pick the side with more space to avoid overlap as much as possible
                this.submenuExpandDirection = (spaceRight >= spaceLeft) ? 'right' : 'left';
            }
        }
        const del = menu.querySelector('[data-action="delete"]') as HTMLElement;
        if (del) del.style.display = (node && node !== this.renderer.getSceneRoot()) ? 'block' : 'none';
    }

    private hideContextMenu() {
        if (this.contextMenu) this.contextMenu.style.display = 'none';
        const sub = document.getElementById('context-submenu-add-child');
        if (sub) sub.style.display = 'none';
        this.contextTargetNode = null;
        this.cancelContextMenuHide();
    }

    private scheduleContextMenuHide() {
        this.cancelContextMenuHide();
        this.hideMenuTimeoutId = window.setTimeout(() => {
            this.hideContextMenu();
        }, 300);
    }

    private cancelContextMenuHide() {
        if (this.hideMenuTimeoutId !== null) {
            clearTimeout(this.hideMenuTimeoutId);
            this.hideMenuTimeoutId = null;
        }
    }

    private onContextMenuClick(e: Event) {
        const target = e.target as HTMLElement;
        const action = target?.getAttribute('data-action');
        if (!action) return;
        const parentNode = this.contextTargetNode || this.renderer.getSceneRoot();
        switch (action) {
            // Legacy aliases (flat menu)
            case 'add-empty':
            case 'add-child-empty':
                this.addEmpty(parentNode);
                break;
            case 'add-point':
            case 'add-child-point':
                this.addLight(parentNode, LightType.POINT, 'Point Light');
                break;
            case 'add-directional':
            case 'add-child-directional':
                this.addLight(parentNode, LightType.DIRECTIONAL, 'Directional Light');
                break;
            case 'add-spot':
            case 'add-child-spot':
                this.addLight(parentNode, LightType.SPOT, 'Spot Light');
                break;
            case 'duplicate':
                this.duplicateNode(parentNode);
                break;
            case 'delete':
                if (parentNode !== this.renderer.getSceneRoot()) this.requestDeleteNode(parentNode);
                break;
        }
        this.hideContextMenu();
    }

    private addEmpty(parent: SceneNode) {
        const node = new SceneNode('node-' + Math.random().toString(36).slice(2), 'Empty');
        this.renderer.addNodeTo(parent, node);
        this.refresh();
        this.expandPath(parent.id);
        this.selectNode(node);
    }

    private addLight(parent: SceneNode, type: LightType, name: string) {
        const id = 'light-' + Math.random().toString(36).slice(2);
        const light = new SceneLight(id, name, type);
        parent.addChild(light);
        this.refresh();
        this.expandPath(parent.id);
        this.selectNode(light);
    }

    private requestDeleteNode(node: SceneNode) {
        this.showConfirmModal(`Delete "${node.name}" and all children?`, node);
    }

    private performDeleteNode(node: SceneNode) {
        const toRemove: SceneNode[] = [];
        node.traverse(n => toRemove.push(n));
        toRemove.reverse();
        for (const n of toRemove) {
            if (n instanceof SceneObject) {
                this.renderer.removeFromScene(n);
            } else if (n !== this.renderer.getSceneRoot()) {
                n.removeFromParent();
            }
        }
        this.refresh();
        this.selectedNodeId = null;
    }

    private showConfirmModal(message: string, nodeToDelete: SceneNode) {
        if (!this.confirmModal || !this.confirmMessage || !this.confirmAcceptBtn) return;
        this.pendingDeleteNode = nodeToDelete;
        this.confirmMessage.textContent = message;
        this.confirmModal.style.display = 'flex';
        // Focus the Delete button for quick confirm via Enter
        this.confirmAcceptBtn.focus();
    }

    private hideConfirmModal() {
        if (!this.confirmModal) return;
        this.confirmModal.style.display = 'none';
        this.pendingDeleteNode = null;
    }

    private deleteNode(node: SceneNode, confirmFirst: boolean = false) {
        if (confirmFirst) {
            const ok = window.confirm(`Delete "${node.name}" and all children?`);
            if (!ok) return;
        }
        const toRemove: SceneNode[] = [];
        node.traverse(n => toRemove.push(n));
        toRemove.reverse();
        for (const n of toRemove) {
            if (n instanceof SceneObject) {
                this.renderer.removeFromScene(n);
            } else if (n !== this.renderer.getSceneRoot()) {
                n.removeFromParent();
            }
        }
        this.refresh();
        this.selectedNodeId = null;
    }

    private duplicateNode(node: SceneNode) {
        const parent = node.getParent() || this.renderer.getSceneRoot();
        const clone = this.cloneSubtree(node);
        const siblings = parent.getChildren();
        const idx = siblings.findIndex(c => c === node);
        parent.addChildAt(clone, Math.max(0, idx + 1));
        this.refresh();
        this.expandPath(parent.id);
        this.selectNode(clone);
    }

    private cloneSubtree(node: SceneNode): SceneNode {
        if (node instanceof SceneObject) {
            const orig: any = node as any;
            const mesh = orig.drawable ? orig.drawable.geometry : null;
            const newNode = new SceneObject('obj-' + Math.random().toString(36).slice(2), node.name + ' Copy', mesh || orig.geometry);
            const d: any = (newNode as any).drawable;
            const od: any = (orig as any).drawable;
            if (d && od) {
                d.material = { ...od.material };
                if (od.boundingBox) d.setBoundingBox(od.boundingBox.min, od.boundingBox.max);
                if (od.meshId) d.meshId = od.meshId;
                if (od.glTexture) d.glTexture = od.glTexture;
            }
            vec3.copy(newNode.transform.position, node.transform.position);
            vec3.copy(newNode.transform.rotation, node.transform.rotation);
            vec3.copy(newNode.transform.scale, node.transform.scale);
            newNode.transform.markDirty();
            newNode.markWorldMatrixDirty();
            for (const child of node.getChildren()) {
                newNode.addChild(this.cloneSubtree(child));
            }
            return newNode;
        } else if (node instanceof SceneLight) {
            const light = new SceneLight('light-' + Math.random().toString(36).slice(2), node.name + ' Copy', (node as SceneLight).lightData.type);
            vec3.copy(light.transform.position, node.transform.position);
            vec3.copy(light.transform.rotation, node.transform.rotation);
            vec3.copy(light.transform.scale, node.transform.scale);
            light.transform.markDirty();
            light.markWorldMatrixDirty();
            const l = node as SceneLight;
            light.setIntensity(l.lightData.intensity);
            if (l.lightData.range) light.setRange(l.lightData.range);
            if (l.lightData.direction) light.setDirection(l.lightData.direction[0], l.lightData.direction[1], l.lightData.direction[2]);
            if (typeof l.lightData.innerConeAngle === 'number' && typeof l.lightData.outerConeAngle === 'number') {
                light.lightData.innerConeAngle = l.lightData.innerConeAngle;
                light.lightData.outerConeAngle = l.lightData.outerConeAngle;
            }
            light.setColor(l.lightData.color[0], l.lightData.color[1], l.lightData.color[2]);
            for (const child of node.getChildren()) {
                light.addChild(this.cloneSubtree(child));
            }
            return light;
        } else {
            const empty = new SceneNode('node-' + Math.random().toString(36).slice(2), node.name + ' Copy');
            vec3.copy(empty.transform.position, node.transform.position);
            vec3.copy(empty.transform.rotation, node.transform.rotation);
            vec3.copy(empty.transform.scale, node.transform.scale);
            empty.transform.markDirty();
            empty.markWorldMatrixDirty();
            for (const child of node.getChildren()) {
                empty.addChild(this.cloneSubtree(child));
            }
            return empty;
        }
    }

}
