import {mkdirSync,copyFileSync,cpSync} from 'node:fs';
mkdirSync('dist',{recursive:true});
for(const file of ['index.html','styles.css','theme.js','app.js','manifest.webmanifest','sw.js','_headers'])copyFileSync(file,'dist/'+file);
cpSync('assets','dist/assets',{recursive:true});
console.log('Mobile app ready in dist/');
