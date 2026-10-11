import {execFileSync} from 'node:child_process';
import {cpSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const story=path.join(root,'story-player');

execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit'});
execFileSync('npm',['run','build'],{
  cwd:story,
  stdio:'inherit',
  env:{...process.env,STORY_BASE_PATH:'/story/'},
});

const target=path.join(root,'dist/story');
rmSync(target,{recursive:true,force:true});
cpSync(path.join(story,'dist'),target,{recursive:true});
