class DebugLogger {
    private outputElement: HTMLElement | null = null;
    private maxLines = 100;

    constructor() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    private init() {
        this.outputElement = document.getElementById('debug-output');
    }

    log(message: string, type: 'info' | 'warn' | 'error' = 'info') {
        if (!this.outputElement) return;

        const timestamp = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const color = type === 'error' ? '#cc0000' : type === 'warn' ? '#ff6600' : '#006600';
        entry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> <span style="color: ${color}">${message}</span>`;
        
        this.outputElement.appendChild(entry);
        
        // Keep only the last maxLines entries
        while (this.outputElement.children.length > this.maxLines) {
            this.outputElement.removeChild(this.outputElement.firstChild!);
        }
        
        // Auto-scroll to bottom
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }

    info(message: string) {
        this.log(message, 'info');
    }

    warn(message: string) {
        this.log(message, 'warn');
    }

    error(message: string) {
        this.log(message, 'error');
    }
}

export const debugLog = new DebugLogger();