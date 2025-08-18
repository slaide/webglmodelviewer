import { Camera } from './camera';
import { debugLog } from './debug-logger';
import { WebGLRenderer } from './renderer';

export class InputController {
    private keys: Set<string> = new Set();
    private lastMouseX = 0;
    private lastMouseY = 0;
    private firstMouse = true;
    private mouseDown = false;
    
    private mouseInvertX = true;
    private mouseInvertY = true;
    private touchInvertX = false;
    private touchInvertY = false;

    constructor(private canvas: HTMLCanvasElement, private camera: Camera, private renderer?: WebGLRenderer) {
        this.setupKeyboardEvents();
        this.setupMouseEvents();
        this.setupTouchEvents();
        debugLog.info('Input controller initialized');
    }

    private setupKeyboardEvents() {
        document.addEventListener('keydown', (event) => {
            this.keys.add(event.code.toLowerCase());
        });

        document.addEventListener('keyup', (event) => {
            this.keys.delete(event.code.toLowerCase());
        });
    }

    private setupMouseEvents() {
        this.canvas.addEventListener('mousedown', (event) => {
            if (event.button === 0) { // Left mouse button
                this.mouseDown = true;
                this.firstMouse = true;
                
                // Handle object selection on click
                if (this.renderer) {
                    const rect = this.canvas.getBoundingClientRect();
                    const cssX = event.clientX - rect.left;
                    const cssY = event.clientY - rect.top;
                    
                    // Scale from CSS coordinates to internal canvas coordinates
                    const scaleX = this.canvas.width / rect.width;
                    const scaleY = this.canvas.height / rect.height;
                    const x = cssX * scaleX;
                    const y = cssY * scaleY;
                    
                    debugLog.info(`Click CSS: (${cssX.toFixed(1)}, ${cssY.toFixed(1)}) → Internal: (${x.toFixed(1)}, ${y.toFixed(1)})`);
                    debugLog.info(`Scale factors: ${scaleX.toFixed(3)}, ${scaleY.toFixed(3)}`);
                    
                    const selected = this.renderer.selectObjectAt(x, y);
                    if (selected) {
                        debugLog.info(`Selected object: ${selected.name}`);
                    } else {
                        debugLog.info('No object selected');
                    }
                }
            }
        });

        document.addEventListener('mouseup', (event) => {
            if (event.button === 0) {
                this.mouseDown = false;
            }
        });

        // Mouse movement handling
        this.canvas.addEventListener('mousemove', (event) => {
            if (this.mouseDown) {
                if (this.firstMouse) {
                    this.lastMouseX = event.clientX;
                    this.lastMouseY = event.clientY;
                    this.firstMouse = false;
                    return;
                }

                const xOffset = (this.mouseInvertX ? -1 : 1) * (event.clientX - this.lastMouseX);
                const yOffset = (this.mouseInvertY ? -1 : 1) * (event.clientY - this.lastMouseY);

                this.lastMouseX = event.clientX;
                this.lastMouseY = event.clientY;

                this.handleMouseMovement(xOffset, yOffset);
            }
        });
    }

    private setupTouchEvents() {
        let lastTouchX = 0;
        let lastTouchY = 0;
        let touchStarted = false;
        let touchMoved = false;
        let touchStartTime = 0;

        this.canvas.addEventListener('touchstart', (event) => {
            event.preventDefault();
            if (event.touches.length === 1) {
                touchStarted = true;
                touchMoved = false;
                touchStartTime = Date.now();
                lastTouchX = event.touches[0].clientX;
                lastTouchY = event.touches[0].clientY;
                debugLog.info('Touch started');
            }
        });

        this.canvas.addEventListener('touchmove', (event) => {
            event.preventDefault();
            if (touchStarted && event.touches.length === 1) {
                const touch = event.touches[0];
                const xOffset = (this.touchInvertX ? -1 : 1) * (touch.clientX - lastTouchX);
                const yOffset = (this.touchInvertY ? -1 : 1) * (lastTouchY - touch.clientY);

                // Check if this is significant movement (more than 10 pixels)
                const moveDistance = Math.sqrt(xOffset * xOffset + yOffset * yOffset);
                if (moveDistance > 10) {
                    touchMoved = true;
                }

                lastTouchX = touch.clientX;
                lastTouchY = touch.clientY;

                this.handleMouseMovement(xOffset, yOffset);
            }
        });

        this.canvas.addEventListener('touchend', (event) => {
            event.preventDefault();
            
            // Check if this was a tap (short duration, minimal movement)
            const touchDuration = Date.now() - touchStartTime;
            const wasTap = !touchMoved && touchDuration < 300; // Less than 300ms and no significant movement
            
            if (wasTap && this.renderer) {
                // Handle object selection on tap
                const rect = this.canvas.getBoundingClientRect();
                const cssX = lastTouchX - rect.left;
                const cssY = lastTouchY - rect.top;
                
                // Scale from CSS coordinates to internal canvas coordinates
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const x = cssX * scaleX;
                const y = cssY * scaleY;
                
                debugLog.info(`Touch CSS: (${cssX.toFixed(1)}, ${cssY.toFixed(1)}) → Internal: (${x.toFixed(1)}, ${y.toFixed(1)})`);
                
                const selected = this.renderer.selectObjectAt(x, y);
                if (selected) {
                    debugLog.info(`Touch selected object: ${selected.name}`);
                } else {
                    debugLog.info('No object selected by touch');
                }
            }
            
            touchStarted = false;
            touchMoved = false;
            debugLog.info(`Touch ended (was tap: ${wasTap})`);
        });
    }

    private handleMouseMovement(xOffset: number, yOffset: number) {
        this.camera.processMouseMovement(xOffset, yOffset);
    }

    setMouseInversion(invertX: boolean, invertY: boolean) {
        this.mouseInvertX = invertX;
        this.mouseInvertY = invertY;
    }

    setTouchInversion(invertX: boolean, invertY: boolean) {
        this.touchInvertX = invertX;
        this.touchInvertY = invertY;
    }

    update(deltaTime: number) {
        // Handle keyboard input
        if (this.keys.has('keyw') || this.keys.has('arrowup')) {
            this.camera.processKeyboard('FORWARD', deltaTime);
        }
        if (this.keys.has('keys') || this.keys.has('arrowdown')) {
            this.camera.processKeyboard('BACKWARD', deltaTime);
        }
        if (this.keys.has('keya') || this.keys.has('arrowleft')) {
            this.camera.processKeyboard('LEFT', deltaTime);
        }
        if (this.keys.has('keyd') || this.keys.has('arrowright')) {
            this.camera.processKeyboard('RIGHT', deltaTime);
        }
    }
}