import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('OFFICE-24 keeps complete overlapping diagonal mattress silhouettes and detached flying cap',()=>{
  execFileSync('python3',['office-art/validate_office24.py'],{stdio:'pipe'});
});
