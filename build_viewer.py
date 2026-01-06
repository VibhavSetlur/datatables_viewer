
import os
import re
import json
import base64

# Configuration
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(ROOT_DIR, 'configs', 'genome-data.config.json')
CSS_PATH = os.path.join(ROOT_DIR, 'css', 'table-renderer.css')
JS_DIR = os.path.join(ROOT_DIR, 'js')
OUTPUT_FILE = os.path.join(ROOT_DIR, 'viewer.html')

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def get_base64_image(image_path):
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')

def build():
    print("Building viewer.html...")

    # 1. Read Components
    print(f"Reading CSS from {CSS_PATH}...")
    css_content = read_file(CSS_PATH)

    print(f"Reading Config from {CONFIG_PATH}...")
    try:
        config_content = read_file(CONFIG_PATH)
        # Validate JSON
        json.loads(config_content) 
    except Exception as e:
        print(f"Error reading config: {e}")
        # Fallback to empty config if needed, but better to fail
        return

    # 2. Read JS files in correct dependency order
    js_files = [
        'config-schema.js',
        'transformers.js',
        'kbase-client.js', 
        'category-manager.js',
        'table-renderer.js'
    ]
    
    js_content = ""
    for js_file in js_files:
        path = os.path.join(JS_DIR, js_file)
        print(f"Bundling {js_file}...")
        js_content += f"\n/* --- {js_file} --- */\n"
        js_content += read_file(path) + "\n"

    # 3. Construct HTML
    html_template = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GenomeData Table Viewer</title>
    <meta name="description" content="Research-grade viewer for GenomeData tables.">
    
    <!-- Bootstrap Icons (CDN) -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    
    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">

    <style>
        {css_content}
        
        /* Setup Screen Styles (Inline for immediate rendering) */
        #setup-screen {{
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: var(--ts-bg-page);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }}
        
        .setup-card {{
            background: var(--ts-bg-card);
            padding: 2rem;
            border-radius: var(--ts-radius-lg);
            box-shadow: var(--ts-shadow-xl);
            max-width: 500px;
            width: 90%;
            text-align: center;
            border: 1px solid var(--ts-border);
        }}
        
        .drop-zone {{
            border: 2px dashed var(--ts-border);
            border-radius: var(--ts-radius-md);
            padding: 2rem;
            margin: 1rem 0;
            transition: all 0.2s;
            background: var(--ts-bg-input);
            cursor: pointer;
        }}
        
        .drop-zone:hover {{
            border-color: var(--ts-primary);
            background: var(--ts-bg-hover);
        }}
        
        .drop-zone.dragover {{
            border-color: var(--ts-primary);
            background: var(--ts-primary-muted);
        }}
    </style>
</head>
<body>
    
    <!-- Setup / Loading Screen -->
    <div id="setup-screen">
        <div class="setup-card">
            <h2 style="margin-top:0; color:var(--ts-primary)">Genome Data Viewer</h2>
            <p style="color:var(--ts-text-muted)">Research Edition</p>
            
            <div id="setup-drop-zone" class="drop-zone">
                <i class="bi bi-file-earmark-code" style="font-size: 2rem; color: var(--ts-text-dim)"></i>
                <p style="margin:0.5rem 0 0">Drag & Drop Config File</p>
            </div>
            
            <div style="margin: 1rem 0; position: relative;">
                <hr style="border: 0; border-top: 1px solid var(--ts-border);">
                <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--ts-bg-card); padding: 0 10px; color: var(--ts-text-dim); font-size: 0.75rem;">OR</span>
            </div>
            
            <button class="ts-btn ts-btn-primary" onclick="document.getElementById('config-input').click()">
                Load Local Config
            </button>
            <input type="file" id="config-input" accept=".json" style="display:none">
            
            <div style="margin-top: 1rem">
                <textarea id="config-paste" class="ts-input" rows="3" placeholder="Paste JSON config here..." style="width:100%; resize: vertical;"></textarea>
            </div>
            <button class="ts-btn" style="margin-top: 0.5rem; width: 100%" onclick="loadPastedConfig()">Load JSON</button>
             <p id="setup-error" style="color: var(--ts-danger); font-size: 0.8rem; margin-top: 1rem; display: none;"></p>
        </div>
    </div>

    <!-- Main App Container -->
    <div id="app" class="ts-app"></div>

    <script>
        // 1. Embedded Default Config
        const DEFAULT_CONFIG = {config_content};
        
        // 2. Bundled Application Logic
        {js_content}

        // 3. Initialization Logic
        document.addEventListener('DOMContentLoaded', async () => {{
            const setupScreen = document.getElementById('setup-screen');
            const fileInput = document.getElementById('config-input');
            const dropZone = document.getElementById('setup-drop-zone');
            const pasteArea = document.getElementById('config-paste');
            const errorMsg = document.getElementById('setup-error');
            
            function showError(msg) {{
                errorMsg.textContent = msg;
                errorMsg.style.display = 'block';
            }}

            async function initApp(config) {{
                try {{
                    const appContainer = document.getElementById('app');
                    // Initialize renderer
                    window.renderer = new TableRenderer(config);
                    await window.renderer.render(appContainer);
                    
                    // Hide setup screen with fade
                    setupScreen.style.opacity = '0';
                    setTimeout(() => setupScreen.style.display = 'none', 300);
                }} catch (e) {{
                    console.error("Initialization Failed:", e);
                    showError("Failed to initialize viewer: " + e.message);
                }}
            }}

            // File Loading Logic
            function handleFile(file) {{
                const reader = new FileReader();
                reader.onload = (e) => {{
                    try {{
                        const config = JSON.parse(e.target.result);
                        initApp(config);
                    }} catch (err) {{
                        showError("Invalid JSON file");
                    }}
                }};
                reader.readAsText(file);
            }}

            // Drag & Drop
            dropZone.addEventListener('dragover', (e) => {{
                e.preventDefault();
                dropZone.classList.add('dragover');
            }});
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
            dropZone.addEventListener('drop', (e) => {{
                e.preventDefault();
                dropZone.classList.remove('dragover');
                if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
            }});

            // Input Change
            fileInput.addEventListener('change', (e) => {{
                if (e.target.files.length) handleFile(e.target.files[0]);
            }});

            // Global Pasted Config Handler
            window.loadPastedConfig = () => {{
                try {{
                    const val = pasteArea.value.trim();
                    if (!val) return;
                    const config = JSON.parse(val);
                    initApp(config);
                }} catch (e) {{
                    showError("Invalid JSON text");
                }}
            }};
            
            // --- AUTO-LOAD LOGIC ---
            // 1. Check URL param ?config=...
            const urlParams = new URLSearchParams(window.location.search);
            const configUrl = urlParams.get('config');
            
            if (configUrl) {{
                try {{
                    const resp = await fetch(configUrl);
                    if (!resp.ok) throw new Error('Failed to fetch config');
                    const config = await resp.json();
                    initApp(config);
                    return;
                }} catch (e) {{
                    console.warn("URL config failed, trying local...", e);
                }}
            }}
            
            // 2. Try fetching local relative config (if served)
            /*
            try {{
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 500); // 500ms timeout
                const resp = await fetch('configs/genome-data.config.json', {{ signal: controller.signal }});
                clearTimeout(id);
                if (resp.ok) {{
                    const config = await resp.json();
                    initApp(config);
                    return;
                }}
            }} catch (e) {{
                // Ignore fetch errors (likely file:// protocol)
            }}
            */

            // 3. Use Embedded Default (Fastest, most robust for this replica)
            if (DEFAULT_CONFIG) {{
                console.log("Using embedded default config");
                initApp(DEFAULT_CONFIG);
            }} else {{
                // Stay on setup screen
            }}

        }});
    </script>
</body>
</html>
"""
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html_template)
    
    print(f"Successfully generated {OUTPUT_FILE}")

if __name__ == "__main__":
    build()
