import { prepareTemplates } from './upstream/motion/templates.js';

export function performanceInput(bundle,invitation){
  if(!bundle)throw new Error('请先录入并保存你的三个动作，再来完成演出。');
  if(bundle.config.spellRef.spellId!==invitation.spellRef?.spellId || bundle.config.spellRef.revision!==invitation.spellRef.revision)throw new Error('这轮绘本和动作版本不一致，请重新进入绘本。');
  const config={...structuredClone(bundle.config),runId:invitation.runId,storyId:invitation.storyId,cueId:invitation.cueId};
  prepareTemplates(config,bundle.samples);
  return {config,sampleStore:{async get(sampleId){return structuredClone(bundle.samples.find(s=>s.sampleId===sampleId));}}};
}
