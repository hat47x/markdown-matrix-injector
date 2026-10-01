import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const ROOT=new URL('./fixtures/',import.meta.url);
const M='structured-artifact-sai2-final-holdout-mmi-v0.json';
function j(n:string):any{return JSON.parse(readFileSync(new URL(n,ROOT),'utf8'));}
function d(n:string){return 'sha256:'+createHash('sha256').update(readFileSync(new URL(n,ROOT))).digest('hex');}
test('final holdout opens once only after winner freeze',()=>{const m=j(M);assert.equal(m.cases.length,4);assert.equal(m.boundary.winner_candidate_id,'rules-v0');assert.equal(m.boundary.final_holdout_opened,true);assert.equal(m.boundary.open_count_used,1);assert.equal(m.boundary.candidate_generation_performed,false);assert.equal(m.boundary.final_holdout_scoring_performed,false);});
test('final holdout exact source bytes bind frozen targets',()=>{const m=j(M);for(const x of m.cases){const s=x.source_ref.split('/').at(-1);const t=x.target_ref.split('/').at(-1);assert.ok(s&&t);assert.equal(d(s),x.source_digest);const target=j(t);assert.equal(target.source.source_digest,x.source_digest);assert.equal(target.provenance.authored_from,'sai-2a-final-holdout-semantic-freeze-comment-5856596334');}});