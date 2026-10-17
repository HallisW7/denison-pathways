const test = require('node:test');
const assert = require('node:assert/strict');
const data = require('../data/denison-2026-2027.json');
const app = require('../app.js');
const empty = { majors: [], minors: [], courses: [] };
const course = (code, status = 'planned', term = 'y1-fall') => ({ code, status, term });
const set = plan => app.setTestState(data, { ...empty, ...plan });
const versions = data.programs.flatMap(program => ['major', 'minor'].flatMap(kind => program[`${kind}Tracks`].map(track => ({ program, kind, track }))));

test('every catalog major/minor has readable wording, valid course options and unique track IDs', () => {
  assert.equal(data.programs.filter(p => p.kinds.length).length, 52);
  assert.equal(data.programs.filter(p => p.kinds.includes('major')).length, data.stats.majors);
  assert.equal(data.programs.filter(p => p.kinds.includes('minor')).length, data.stats.minors);
  assert.equal(new Set(versions.map(v => v.track.id)).size, versions.length);
  const codes = new Set(data.courses.map(c => c.code));
  for (const { program, kind, track } of versions) {
    assert.ok(track.text.length > 80, `${track.id} missing wording`);
    assert.ok(track.courses.length, `${track.id} empty options`);
    assert.ok(!track.text.includes('<div'), track.id);
    assert.ok(track.courses.every(code => codes.has(code)), track.id);
    assert.ok(program.kinds.includes(kind));
  }
});

test('reverse program index matches every program pool', () => {
  for (const p of data.programs) {
    const expected = new Set([...p.majorTracks, ...p.minorTracks].flatMap(t => t.courses));
    const actual = data.courses.filter(c => c.programReferences.some(r => r.slug === p.slug)).map(c => c.code);
    assert.deepEqual(new Set(actual), expected, p.slug);
  }
});

test('broad elective pools and program totals correct documented omissions', () => {
  const p = slug => data.programs.find(p => p.slug === slug);
  for (const slug of ['anthropology', 'communication', 'history', 'art-studio', 'biology', 'womens-gender-studies']) {
    assert.ok(p(slug).minorCourses.length > 10, slug);
  }
  assert.equal(p('data-analytics').majorTracks[0].requiredCourseCount, null);
  assert.equal(p('global-commerce').majorTracks[0].requiredCourseCount, 16);
  assert.equal(p('sustainability-environmental-studies').majorTracks[0].requiredCourseCount, 13);
  assert.ok(p('biology').minorCourses.includes('BIOL 308'));
  assert.ok(!p('biology').minorCourses.includes('BIOL 361'));
  assert.ok(p('theatre').minorCourses.includes('THTR 302'));
  assert.ok(p('art-studio').minorCourses.includes('AHVC 111'));
  assert.equal(p('mathematics').majorTracks.length, 3);
  assert.equal(p('mathematics').minorTracks.length, 2);
  assert.equal(p('physics').majorTracks.length, 2);
  assert.equal(p('music').majorTracks.length, 5);
});

test('all individual program versions contribute program-specific recommendations', () => {
  for (const { kind, track } of versions) {
    set({ [kind === 'major' ? 'majors' : 'minors']: [track.id] });
    const results = app.recommendationData();
    assert.ok(results.some(r => r.reasons.some(reason => reason.type === kind)), track.id);
    assert.equal(new Set(results.map(r => r.course.code)).size, results.length);
  }
});

test('every pair of programs preserves both selections and recommendation contributions', () => {
  // Check all major-major, minor-minor, and major-minor version pairs across areas.
  let checked = 0;
  for (let i = 0; i < versions.length; i += 1) for (let j = i + 1; j < versions.length; j += 1) {
    const pair = [versions[i], versions[j]];
    if (pair[0].program.slug === pair[1].program.slug || pair.some(v => v.program.slug === 'music-theatre')) continue;
    set({ majors: pair.filter(v => v.kind === 'major').map(v => v.track.id), minors: pair.filter(v => v.kind === 'minor').map(v => v.track.id) });
    assert.equal(app.selectedMajors().length + app.selectedMinors().length, 2);
    const results = app.recommendationData();
    for (const version of pair) {
      const sample = results.find(r => version.track.courses.includes(r.course.code));
      assert.ok(sample, version.track.id);
      assert.ok(sample.reasons.some(r => r.type === version.kind && r.label.includes(version.program.name)), version.track.id);
    }
    checked += 1;
  }
  console.log(`Verified ${checked} pairs of program versions`);
});

test('shared courses support multiple programs and are excluded once already planned', () => {
  const math = data.programs.find(p => p.slug === 'mathematics').majorTracks[0].id;
  set({ majors: [math], minors: ['machine-learning::minor'] });
  const shared = app.recommendationData().find(r => r.course.code === 'MATH 145');
  assert.equal(shared.reasons.filter(r => ['major', 'minor'].includes(r.type)).length, 2);
  set({ majors: [math], minors: ['machine-learning::minor'], courses: [course('MATH 145')] });
  assert.ok(!app.recommendationData().some(r => r.course.code === 'MATH 145'));
});

test('true crosslistings earn credit once; prerequisites are not aliases', () => {
  set({ courses: [course('DA 220'), course('MATH 220', 'completed')] });
  assert.equal(app.courseIdentity('DA 220'), app.courseIdentity('MATH 220'));
  assert.notEqual(app.courseIdentity('DA 220'), app.courseIdentity('MATH 145'));
  assert.equal(app.selectedCourseRecords().length, 1);
  assert.equal(app.selectedCourseRecords()[0].status, 'completed');
  assert.equal(app.selectedCourseRecords().reduce((sum, r) => sum + app.courseCredits(r.course), 0), 4);
  assert.ok(!app.recommendationData().some(r => ['DA 220', 'MATH 220'].includes(r.course.code)));
});

test('checklists require every course and keep distinct classes across groups', () => {
  const groups = [{ label: 'Core', count: 2, courses: ['BIOL 210', 'BIOL 220'] }, { label: 'Elective', count: 1, courses: ['BIOL 210', 'BIOL 230'] }];
  set({ courses: [course('BIOL 210', 'completed')] });
  assert.ok(app.auditGroups(groups).every(g => g.state !== 'met'));
  set({ courses: [course('BIOL 210', 'completed'), course('BIOL 220', 'completed'), course('BIOL 230')] });
  const result = app.auditGroups(groups);
  assert.equal(result[0].state, 'met');
  assert.equal(result[1].state, 'scheduled');
  assert.equal(new Set(result.flatMap(r => r.matched)).size, 3);
  assert.equal(app.programAuditRule('No more than two courses from BIOL 210 or BIOL 220').state, 'review');
});

test('mixed prerequisite logic does not let one course bypass an AND requirement', () => {
  const da = data.courses.find(c => c.code === 'DA 220');
  set({ courses: [course('MATH 135', 'completed')] });
  assert.equal(app.prerequisiteStatus(da, 'y2-fall').state, 'missing');
  set({ courses: [course('MATH 135', 'completed'), course('DA 101', 'completed')] });
  assert.equal(app.prerequisiteStatus(da, 'y2-fall').state, 'met');
  set({ courses: [course('MATH 145', 'completed')] });
  assert.equal(app.prerequisiteStatus(da, 'y2-fall').state, 'met');
  set({ courses: [course('MATH 145', 'planned', 'y3-fall')] });
  assert.equal(app.prerequisiteStatus(da, 'y2-fall').state, 'missing');
  assert.equal(app.prerequisiteStatus({ prerequisites: 'Junior standing and MATH 145.', corequisites: '' }).state, 'review');
  assert.equal(app.prerequisiteStatus({ prerequisites: '', corequisites: 'PSYC 350' }).state, 'review');
});

test('Music Theatre selects the track implied by all selected programs', () => {
  const music = data.programs.find(p => p.slug === 'music').majorTracks[0].id;
  const theatre = data.programs.find(p => p.slug === 'theatre').majorTracks[0].id;
  for (const [majors, expected] of [[[], 'Neither Music nor Theatre'], [[music], 'With Music'], [[theatre], 'With Theatre'], [[music, theatre], 'With Music and Theatre']]) {
    set({ majors, minors: ['music-theatre::minor'] });
    assert.equal(app.selectedMinors()[0].minorTrack.label, expected);
  }
});

test('known restrictions are surfaced for combinations', () => {
  set({ majors: ['mathematics::ba-in-mathematics'], minors: ['mathematics::mathematics-minor', 'data-analytics::minor'] });
  assert.ok(app.programCombinationWarnings().some(w => w.includes('only one major or minor')));
  assert.ok(app.programCombinationWarnings().some(w => w.includes('Data Analytics')));
});

test('inferred GE and writing taken before W101 do not become certified completion', () => {
  set({ courses: [course('BIOL 210', 'completed')] });
  assert.equal(app.geProgress().find(g => g.id === 'SCI').complete, false);
  const writing = data.courses.find(c => c.ge.some(t => t.id === 'W' && t.confidence === 'explicit'));
  assert.ok(writing);
  set({ courses: [course('W 101', 'completed', 'y2-fall'), course(writing.code, 'completed', 'y1-spring')] });
  assert.equal(app.geProgress().find(g => g.id === 'W').countMet, 0);
});

test('fractional and variable credit amounts use the registered amount within catalog limits', () => {
  assert.equal(app.courseCredits({ credits: '.5 Credit Hours' }), 0.5);
  assert.equal(app.courseCredits({ credits: '0.5-2 Credit Hours' }), 0.5);
  assert.equal(app.courseCredits({ credits: '1,2 Credit Hours' }, 2), 2);
  assert.equal(app.courseCredits({ credits: '1-4 Credit Hours' }, 20), 4);
  assert.equal(app.courseCredits({ credits: '4 Credit Hours' }, -1), 4);
});
