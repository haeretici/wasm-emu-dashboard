import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(root, 'build'), { recursive: true });

console.log('Compiling Emulator stylesheets...');
try {
  execSync(`sass "${path.join(root, 'scss', 'new', 'main.scss')}" "${path.join(root, 'build', 'new.css')}" --style=compressed`, { stdio: 'inherit' });
  console.log('Done compiling via system Sass compiler!');
} catch (e) {
  console.log('System sass execution failed. Attempting compile via npx sass...');
  try {
    execSync(`npx sass "${path.join(root, 'scss', 'new', 'main.scss')}" "${path.join(root, 'build', 'new.css')}" --style=compressed`, { stdio: 'inherit' });
    console.log('Done compiling via npx sass!');
  } catch (npxError) {
    console.error('Sass compilation failed:', npxError.message);
    process.exit(1);
  }
}
