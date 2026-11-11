import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('actual RGBA silhouettes retain baseline, source scale and distinct walk phases', () => {
  execFileSync('python3', ['-c', 'import sys; sys.path.insert(0,"office-art"); from validate_ai_atlas import validate; validate()'], { cwd: process.cwd(), stdio: 'pipe' });
});

test('source silhouettes are complete before fitting or padding their atlas cells', () => {
  execFileSync('python3', ['-c', 'import sys; sys.path.insert(0,"office-art"); from audit_source_closure import audit; audit()'], { cwd: process.cwd(), stdio: 'pipe' });
});


test('every legacy and HD atlas frame has clear pixel boundaries except bottom feet', () => {
  execFileSync('python3', ['-c', 'import sys; sys.path.insert(0,"office-art"); from validate_ai_atlas import validate_all_boundaries; validate_all_boundaries()'], { cwd: process.cwd(), stdio: 'pipe' });
});

test('owner whoami retains detached mug steam and has no magenta fringe at team scale', () => {
  execFileSync('python3', ['-c', 'import sys; sys.path.insert(0,"office-art"); from validate_whoami import validate; validate()'], { cwd: process.cwd(), stdio: 'pipe' });
});
