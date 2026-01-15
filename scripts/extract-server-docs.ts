/**
 * Extract Server Documentation for TableScanner Prompts
 * 
 * Reads server/docs/*.md files and formats them for use in TableScanner prompts
 */

import { readFile, readdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_DOCS_DIR = join(__dirname, '../server/docs');

async function extractDocs(): Promise<string> {
    try {
        const files = await readdir(SERVER_DOCS_DIR);
        const mdFiles = files.filter(f => f.endsWith('.md')).sort();
        
        let combined = '# DataTables Viewer Server API Documentation\n\n';
        combined += 'This documentation describes the integrated SQLite query service.\n\n';
        combined += '---\n\n';
        
        for (const file of mdFiles) {
            const content = await readFile(join(SERVER_DOCS_DIR, file), 'utf-8');
            combined += content + '\n\n---\n\n';
        }
        
        return combined;
    } catch (error: any) {
        console.error('Error extracting docs:', error);
        return '';
    }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    extractDocs().then(docs => {
        console.log(docs);
    });
}

export { extractDocs };
