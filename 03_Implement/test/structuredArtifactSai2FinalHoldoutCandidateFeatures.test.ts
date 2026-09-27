import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveMmiSai2CandidateLocalFeatures } from '../src/experimental/structuredArtifactSai2CandidateFeatures.js';
const R=new URL('./fixtures/',import.meta.url), M='structured-artifact-sai2-final-holdout-mmi-v0.json', C='structured-artifact-sai2-final-holdout-mmi-candidate-sets-v0.json', F='structured-artifact-sai2-final-holdout-mmi-candidate-local-features-v0.json';
function j(n:string):any{return JSON.parse(readFileSync(new URL(n,R),'utf8'));}
test('final holdout portable features reproduce target-blind',()=>{const m=j(M),c=j(C),f=j(F),src=new Map(m.cases.map((x:any)=>[x.source_family_id,j(x.source_ref.split('/').at(-1))])),by=new Map(f.cases.map((x:any)=>[x.source_family_id,x]));let n=0;for(const fam of c.cases){const s:any=src.get(fam.source_family_id),fr:any=by.get(fam.source_family_id);for(const cand of fam.candidates){const e=fr.candidates.find((x:any)=>x.ordinal===cand.ordinal);assert.deepEqual(deriveMmiSai2CandidateLocalFeatures(s,cand.range),e.portable_values);n++;}}assert.equal(n,7);});
test('feature capture remains pre-score',()=>{const f=j(F);assert.equal(f.boundary.labels_attached,false);assert.equal(f.boundary.winner_scores_used,false);assert.equal(f.boundary.final_holdout_scoring_performed,false);});