import {requireValue,record,identifier,boundedArray,canonical} from './validation.mjs';

export function validateGraph(steps) {
  boundedArray(steps,'steps',100);
  requireValue(steps.length>0,'at least one step required');
  const graph=new Map();
  for(const step of steps) {
    requireValue(record(step)&&identifier(step.id)&&!graph.has(step.id),'unique step identifiers required');
    requireValue(['task','approval'].includes(step.kind),'step kind must be task or approval');
    requireValue(Array.isArray(step.needs)&&new Set(step.needs).size===step.needs.length,'unique dependency list required');
    if(step.kind==='approval') requireValue(identifier(step.reviewer),'approval step needs a reviewer identifier');
    graph.set(step.id,step);
  }
  const visiting=new Set(),done=new Set();
  function visit(id) {
    requireValue(graph.has(id),'unknown dependency');requireValue(!visiting.has(id),'dependency cycle');
    if(done.has(id)) return;
    visiting.add(id);
    graph.get(id).needs.forEach(visit);
    visiting.delete(id);done.add(id);
  }
  graph.forEach((_,id)=>visit(id));
  return graph;
}
export function replay(steps,events) {
  const graph=validateGraph(steps); boundedArray(events,'events');
  const state=new Map(steps.map(s=>[s.id,'pending'])),seen=new Map(),audit=[];
  function derived(id,trail=new Set(),memo=new Map()) {
    const value=state.get(id);
    if(value!=='pending') return value;
    if(memo.has(id)) return memo.get(id);
    if(trail.has(id)) throw new Error('cycle');trail.add(id);
    const deps=graph.get(id).needs.map(dep=>derived(dep,new Set(trail),memo));
    const result=deps.some(s=>s==='rejected'||s==='blocked')?'blocked':
      deps.every(s=>s==='completed'||s==='approved')?'ready':'waiting';
    memo.set(id,result);return result;
  }
  for(const event of events) {
    requireValue(record(event)&&identifier(event.id)&&identifier(event.actor)&&graph.has(event.step),'invalid event identity');
    requireValue(['complete','approve','reject'].includes(event.action),'unknown event action');
    const signature=canonical(event);
    if(seen.has(event.id)) {requireValue(seen.get(event.id)===signature,'event id payload mismatch');continue;}
    seen.set(event.id,signature);
    const step=graph.get(event.step),before=derived(step.id);
    let reason=null;
    if(before!=='ready') reason='STEP_NOT_READY';
    else if(step.kind==='task'&&event.action!=='complete') reason='TASK_ACTION_REQUIRED';
    else if(step.kind==='approval'&&event.action==='complete') reason='APPROVAL_ACTION_REQUIRED';
    else if(step.kind==='approval'&&event.actor!==step.reviewer) reason='REVIEWER_MISMATCH';
    if(reason) audit.push({...event,accepted:false,reason,before,after:before});
    else {
      const after={complete:'completed',approve:'approved',reject:'rejected'}[event.action];
      state.set(step.id,after);audit.push({...event,accepted:true,reason:'ACCEPTED',before,after});
    }
  }
  return {states:Object.fromEntries(steps.map(s=>[s.id,derived(s.id)])),audit};
}
export function analyze(input) {
  requireValue(record(input),'object input required');
  const report=replay(input.steps,input.events);
  const rows=input.steps.map(s=>({step:s.id,kind:s.kind,depends_on:s.needs.join(', ')||'—',state:report.states[s.id],reviewer:s.reviewer||'—'}));
  return {summary:[{label:'Steps',value:rows.length},{label:'Accepted events',value:report.audit.filter(a=>a.accepted).length},{label:'Rejected events',value:report.audit.filter(a=>!a.accepted).length}],
    note:'Replay validates transitions and configured reviewer IDs. Identity authentication and executing tasks belong to the host service; this demo does neither.',
    columns:['step','kind','depends_on','state','reviewer'],rows,...report};
}
