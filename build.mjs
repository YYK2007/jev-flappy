import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
const assets={};
for(const [url,file,type] of [['/','public/index.html','text/html'],['/app.js','public/app.js','text/javascript'],['/style.css','public/style.css','text/css'],['/game.js','game.mjs','text/javascript']])assets[url]={body:await readFile(new URL(file,import.meta.url),'utf8'),type};
const game=await readFile(new URL('./game.mjs',import.meta.url),'utf8'),worker=await readFile(new URL('./worker.mjs',import.meta.url),'utf8');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await writeFile('dist/server/index.js',`const ASSETS=${JSON.stringify(assets)};\n${game}\n${worker}`);
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built the flight Worker and embedded public assets. No credentials are bundled.');
