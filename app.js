let data;
let visibleLimit = 30;
let recommendedDraft = [];
const STORAGE_KEY = 'denisonPathwaysPlanV1';
let plan = { majors: [], minors: [], courses: [], otherCredits: 0, gpa: '' };
const SEMESTERS = [
  { id: 'y1-fall', year: 'First Year', season: 'Fall' },
  { id: 'y1-spring', year: 'First Year', season: 'Spring' },
  { id: 'y2-fall', year: 'Second Year', season: 'Fall' },
  { id: 'y2-spring', year: 'Second Year', season: 'Spring' },
  { id: 'y3-fall', year: 'Third Year', season: 'Fall' },
  { id: 'y3-spring', year: 'Third Year', season: 'Spring' },
  { id: 'y4-fall', year: 'Fourth Year', season: 'Fall' },
  { id: 'y4-spring', year: 'Fourth Year', season: 'Spring' }
];
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function loadPlan() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.courses)) plan = normalizePlanShape({
      ...saved,
      courses: saved.courses.map(item => ({ ...item, term: normalizeTerm(item.term), status: ['completed', 'current', 'planned'].includes(item.status) ? item.status : 'planned' })),
      otherCredits: Math.max(0, Number(saved.otherCredits) || 0),
      gpa: saved.gpa === '' || saved.gpa == null ? '' : Number(saved.gpa)
    });
  } catch (_) { /* Ignore damaged browser-local state. */ }
}

function normalizePlanShape(value = {}) {
  return {
    majors: [...new Set(Array.isArray(value.majors) ? value.majors.filter(Boolean) : value.major ? [value.major] : [])],
    minors: [...new Set(Array.isArray(value.minors) ? value.minors.filter(Boolean) : value.minor ? [value.minor] : [])],
    courses: Array.isArray(value.courses) ? value.courses : [],
    otherCredits: Math.max(0, Number(value.otherCredits) || 0),
    gpa: value.gpa === '' || value.gpa == null ? '' : Number(value.gpa)
  };
}

function savePlan() { recommendedDraft = []; localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); }

function normalizeTerm(term) {
  return SEMESTERS.some(semester => semester.id === term) ? term : SEMESTERS[0].id;
}

function semesterOptions(selected) {
  return SEMESTERS.map(semester => `<option value="${semester.id}" ${semester.id === selected ? 'selected' : ''}>${semester.year} · ${semester.season}</option>`).join('');
}

async function init() {
  const response = await fetch('data/denison-2026-2027.json?v=20261019-2');
  data = await response.json();
  loadPlan();
  $('#courseCount').textContent = data.stats.courses.toLocaleString();
  $('#majorCount').textContent = data.stats.majors;
  $('#minorCount').textContent = data.stats.minors;
  $('#programCount').textContent = data.stats.programs;
  $('#searchHint').textContent = `${data.stats.courses.toLocaleString()} courses and ${data.stats.programs} areas of study indexed.`;
  $('#retrievedDate').textContent = `Catalog retrieved ${new Date(data.meta.retrievedAt).toLocaleDateString()}.`;
  fillFilters();
  bindEvents();
  switchView('planner');
  renderCourses();
  renderGe();
  renderElectives();
  renderProgram(data.programs.find(program => program.kinds.includes('major'))?.slug || data.programs[0].slug);
  renderPlanner();
  renderMajorComparison();
}

function programOptions(kind) {
  return data.programs.filter(program => program.kinds.includes(kind)).map(program => `<option value="${program.slug}">${escapeHtml(program.name)}</option>`).join('');
}

function majorOptions() {
  return data.programs.filter(program => program.kinds.includes('major')).flatMap(program => {
    const tracks = program.majorTracks?.length ? program.majorTracks : [{ id: `${program.slug}::major`, label: 'Major', courses: program.referencedCourses }];
    return tracks.map(track => `<option value="${track.id}">${escapeHtml(track.label === 'Major' ? program.name : `${program.name} — ${track.label}`)}</option>`);
  }).join('');
}

function fillFilters() {
  const ge = [...data.generalEducation.summary, ...data.generalEducation.overlays, { id: 'LAB', label: 'Science laboratory' }];
  $('#geFilter').innerHTML += ge.map(requirement => `<option value="${requirement.id}">${requirement.label}</option>`).join('');
  const allPrograms = data.programs.filter(program => program.kinds.length).map(program => `<option value="${program.slug}">${escapeHtml(program.name)}</option>`).join('');
  $('#programFilter').innerHTML += allPrograms;
  $('#programSelect').innerHTML = allPrograms;
  $('#plannerMajor').innerHTML = '<option value="">Choose a major and degree</option>' + majorOptions();
  $('#compareMajorA').innerHTML = majorOptions();
  $('#compareMajorB').innerHTML = majorOptions();
  const comparisonOptions = $$('#compareMajorB option');
  if (comparisonOptions[1]) $('#compareMajorB').value = comparisonOptions[1].value;
  $('#plannerMinorOptions').innerHTML = data.programs.filter(program => program.kinds.includes('minor')).map(program => `<option value="${escapeHtml(program.name)}"></option>`).join('');
  $('#plannerCourseTerm').innerHTML = semesterOptions(SEMESTERS[0].id);
  $('#electiveTerm').innerHTML = semesterOptions(SEMESTERS[0].id);
  const subjects = [...new Map(data.courses.map(course => [course.subject, course.subjectName])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  $('#electiveSubject').innerHTML += subjects.map(([code, name]) => `<option value="${code}">${code} · ${escapeHtml(name)}</option>`).join('');
  plan.majors = plan.majors.map(value => value.includes('::') ? value : data.programs.find(program => program.slug === value)?.majorTracks?.[0]?.id).filter(Boolean);
  plan.minors = plan.minors.filter(slug => data.programs.some(program => program.slug === slug && program.kinds.includes('minor')));
  savePlan();
  $('#courseOptions').innerHTML = data.courses.map(course => `<option value="${course.code}">${escapeHtml(course.title)}</option>`).join('');
}

function selectedCourseRecords() {
  return plan.courses.map(item => ({ ...item, course: data.courses.find(course => course.code === item.code) })).filter(item => item.course);
}

function divisionAssignment(courses) {
  const divisionRequirements = data.generalEducation.summary.filter(requirement => ['FA', 'SCI', 'SS', 'HU', 'I'].includes(requirement.id));
  const slots = divisionRequirements.flatMap(requirement => Array.from({ length: requirement.count }, (_, index) => ({ id: `${requirement.id}-${index}`, type: requirement.id })));
  const candidates = courses.filter(course => course.ge.some(tag => tag.confidence !== 'conditional' && ['FA', 'SCI', 'SS', 'HU', 'I'].includes(tag.id)));
  const matchBySlot = new Map();
  const usedSubjects = new Set();
  function tryAssign(course, visited) {
    const eligible = course.ge.filter(tag => tag.confidence !== 'conditional' && ['FA', 'SCI', 'SS', 'HU', 'I'].includes(tag.id)).map(tag => tag.id);
    for (const slot of slots.filter(item => eligible.includes(item.type))) {
      if (visited.has(slot.id)) continue;
      visited.add(slot.id);
      const prior = matchBySlot.get(slot.id);
      if (!prior || tryAssign(prior, visited)) { matchBySlot.set(slot.id, course); return true; }
    }
    return false;
  }
  for (const course of candidates) {
    if (usedSubjects.has(course.subject)) continue;
    if (tryAssign(course, new Set())) usedSubjects.add(course.subject);
  }
  return matchBySlot;
}

function geProgressFor(records) {
  const courses = records.map(item => item.course);
  const assignment = divisionAssignment(courses);
  return [...data.generalEducation.summary, ...data.generalEducation.overlays].map(requirement => {
    let matched;
    if (['FA', 'SCI', 'SS', 'HU', 'I'].includes(requirement.id)) {
      matched = [...assignment.entries()].filter(([slot]) => slot.startsWith(requirement.id + '-')).map(([, course]) => course);
    } else if (requirement.id === 'FL') {
      const languageCourses = courses.filter(course => course.ge.some(tag => tag.id === 'FL'));
      const subjects = [...new Set(languageCourses.map(course => course.subject))];
      const sequenceComplete = subjects.some(subject => {
        const numbers = new Set(languageCourses.filter(course => course.subject === subject).map(course => course.number));
        return numbers.has('211') || (numbers.has('111') && numbers.has('112'));
      });
      matched = sequenceComplete ? languageCourses : [];
    } else {
      matched = courses.filter(course => course.ge.some(tag => tag.id === requirement.id && tag.confidence !== 'conditional'));
    }
    const countMet = Math.min(requirement.count, matched.length);
    const needsLab = requirement.id === 'SCI' && countMet >= requirement.count && !courses.some(course => course.ge.some(tag => tag.id === 'LAB'));
    return { ...requirement, countMet, complete: countMet >= requirement.count && !needsLab, matched, needsLab };
  });
}

function geProgress() {
  const selected = selectedCourseRecords();
  const planned = geProgressFor(selected);
  const completed = geProgressFor(selected.filter(item => item.status === 'completed'));
  return planned.map(requirement => {
    const done = completed.find(item => item.id === requirement.id);
    return {
      ...requirement,
      planComplete: requirement.complete,
      complete: done.complete,
      completedCount: done.countMet,
      completedMatched: done.matched,
      completedNeedsLab: done.needsLab
    };
  });
}

function selectedMajors() {
  return plan.majors.map(id => {
    const program = data.programs.find(item => item.slug === id.split('::')[0]);
    const track = program?.majorTracks?.find(item => item.id === id) || program?.majorTracks?.[0];
    return program && track ? { id: track.id, program, track } : null;
  }).filter(Boolean);
}

function selectedMinors() {
  return plan.minors.map(slug => data.programs.find(program => program.slug === slug && program.kinds.includes('minor'))).filter(Boolean);
}

function programCourses(kind, program, track) {
  if (!program) return [];
  if (kind === 'major') return track?.courses || program.majorTracks?.[0]?.courses || program.referencedCourses;
  return program.minorCourses?.length ? program.minorCourses : program.referencedCourses;
}

function directProgramMatches(kind, program, track) {
  if (!program) return [];
  const selectedCodes = new Set(plan.courses.map(item => item.code));
  return programCourses(kind, program, track).filter(code => selectedCodes.has(code));
}

function requirementHighlights(text = '') {
  const lines = text.split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const courseLine = /^(?:[A-Z]{2,6}\s+\d{3}[A-Z-]*\b|Course List\b|Code\s+Title\b|Credits?\b)/i;
  const ruleWords = /\b(?:must|required|requires|requirement|complete|minimum|electives?|at least|no more than|one course|two courses|three courses|four courses|five courses|six courses|credit hours?)\b/i;
  const seen = new Set();
  const rules = lines.filter(line => !courseLine.test(line) && ruleWords.test(line)).map(line => line.length > 180 ? `${line.slice(0, 177)}…` : line).filter(line => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (rules.length) return rules.slice(0, 6);
  return lines.filter(line => !courseLine.test(line) && line.length > 25).slice(0, 4).map(line => line.length > 180 ? `${line.slice(0, 177)}…` : line);
}

function prerequisiteStatus(course, targetTerm) {
  if (!course.prerequisites) return { state: 'none', missing: [], codes: [] };
  const codes = [...new Set([...course.prerequisites.matchAll(/\b[A-Z]{2,6}\s+\d{3}[A-Z]?\b/g)].map(match => match[0]))];
  if (!codes.length) return { state: 'review', missing: [], codes: [] };
  const chosenTerm = targetTerm || (typeof document !== 'undefined' ? $('#plannerCourseTerm')?.value : '') || SEMESTERS[0].id;
  const targetIndex = SEMESTERS.findIndex(semester => semester.id === normalizeTerm(chosenTerm));
  const available = new Set(plan.courses.filter(item => item.status === 'completed' || SEMESTERS.findIndex(semester => semester.id === normalizeTerm(item.term)) < targetIndex).map(item => item.code));
  const isAlternative = /\bor\b/i.test(course.prerequisites);
  const met = isAlternative ? codes.some(code => available.has(code)) : codes.every(code => available.has(code));
  return { state: met ? 'met' : 'missing', missing: codes.filter(code => !available.has(code)), codes };
}

function recommendationData() {
  const selectedCodes = new Set(plan.courses.map(item => item.code));
  const progress = geProgress();
  const unmet = new Set(progress.filter(requirement => !requirement.planComplete).map(requirement => requirement.id));
  if (progress.some(requirement => requirement.needsLab)) unmet.add('LAB');
  const majors = selectedMajors();
  const minors = selectedMinors();
  return data.courses.filter(course => !selectedCodes.has(course.code)).map(course => {
    const reasons = [];
    let score = 0;
    for (const { program, track } of majors) {
      if (!programCourses('major', program, track).includes(course.code)) continue;
      const reference = course.programReferences.find(item => item.slug === program.slug);
      score += 20;
      reasons.push({ label: track.label === 'Major' ? program.name : `${program.name} — ${track.label}`, type: 'major', detail: reference?.section || track.label || 'Major requirements' });
    }
    for (const minor of minors) {
      if (!programCourses('minor', minor).includes(course.code)) continue;
      const reference = course.programReferences.find(item => item.slug === minor.slug);
      score += 16;
      reasons.push({ label: minor.name, type: 'minor', detail: reference?.section || 'Minor requirements' });
    }
    for (const tag of course.ge.filter(item => unmet.has(item.id))) {
      score += ['explicit', 'rule'].includes(tag.confidence) ? 5 : tag.confidence === 'conditional' ? 3 : 1;
      reasons.push({ label: tag.label, type: tag.confidence, detail: tag.evidence });
    }
    if (/\b4\b/.test(course.credits)) score += 0.25;
    const prerequisite = prerequisiteStatus(course);
    if (prerequisite.state === 'missing') score -= 6;
    return { course, reasons, score, prerequisite };
  }).filter(item => item.score > 2.5).sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
}

function courseCredits(course) {
  return Number.parseFloat(String(course?.credits || '').match(/\d+(?:\.\d+)?/)?.[0]) || 0;
}

const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };

function inferredProgramCourseCount(text = '') {
  const pattern = /(?:total of|minimum of|consists of|requires?)\s+(?:a\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\s+(?:four-credit\s+)?courses?/gi;
  const values = [...text.matchAll(pattern)].map(match => Number(match[1]) || COUNT_WORDS[match[1].toLowerCase()]).filter(value => value > 0 && value <= 20);
  return values.length ? Math.max(...values) : null;
}

function programCourseGroups(kind, program, track) {
  const pool = [...new Set(programCourses(kind, program, track))];
  const text = kind === 'major' ? track?.text || program.requirementsText || '' : program.minorText || program.requirementsText || '';
  const lowerText = text.toLowerCase();
  const parent = pool.map((_, index) => index);
  const find = index => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (a, b) => { const rootA = find(a), rootB = find(b); if (rootA !== rootB) parent[rootB] = rootA; };
  const positioned = pool.map((code, index) => ({ code, index, position: lowerText.indexOf(code.toLowerCase()) })).filter(item => item.position >= 0).sort((a, b) => a.position - b.position);
  for (let index = 1; index < positioned.length; index += 1) {
    const previous = positioned[index - 1], current = positioned[index];
    const between = text.slice(previous.position + previous.code.length, current.position);
    if (between.length < 170 && /\bor\b/i.test(between)) join(previous.index, current.index);
  }
  const groups = [];
  for (let index = 0; index < pool.length; index += 1) {
    const root = find(index);
    let group = groups.find(item => item.root === root);
    if (!group) { group = { root, codes: [] }; groups.push(group); }
    group.codes.push(pool[index]);
  }
  return groups.map(group => group.codes);
}

function programTarget(kind, program, track, groupCount) {
  const explicit = kind === 'major' ? track?.requiredCourseCount : program.minorRequiredCourseCount;
  const text = kind === 'major' ? track?.text || program.requirementsText : program.minorText || program.requirementsText;
  const inferred = explicit || inferredProgramCourseCount(text || '');
  if (inferred) return inferred;
  return kind === 'minor' ? Math.min(6, groupCount) : Math.min(16, groupCount);
}

function courseLevel(course) {
  return Math.floor((Number.parseInt(course?.number, 10) || 100) / 100);
}

function progressCoverageScore(progress) {
  return progress.reduce((score, requirement) => score + requirement.countMet + (requirement.needsLab ? 0 : requirement.id === 'SCI' && requirement.countMet >= requirement.count ? 0.5 : 0), 0);
}

function listedPrerequisiteCodes(course) {
  return [...new Set([...(course?.prerequisites || '').matchAll(/\b[A-Z]{2,6}\s+\d{3}[A-Z]?\b/g)].map(match => match[0]))];
}

function buildRecommendedPlan(load = 4) {
  const termLoad = Math.max(3, Math.min(5, Number(load) || 4));
  const targetTotal = termLoad * SEMESTERS.length;
  const majors = selectedMajors();
  const minors = selectedMinors();
  if (!majors.length && !minors.length) return [];
  const entries = [];
  const scheduled = new Map();
  const termCounts = new Map(SEMESTERS.map(semester => [semester.id, 0]));
  const addEntry = entry => {
    entries.push(entry);
    if (entry.course) scheduled.set(entry.course.code, entry.term);
    termCounts.set(entry.term, (termCounts.get(entry.term) || 0) + 1);
  };
  for (const item of selectedCourseRecords()) addEntry({ id: `existing-${item.code}`, course: item.course, term: normalizeTerm(item.term), type: 'existing', flexible: false, reason: item.status === 'completed' ? 'Completed' : item.status === 'current' ? 'In progress' : 'Already in My plan', alternatives: [] });
  const chooseTerm = (course, preferredIndex) => {
    const prereqCodes = listedPrerequisiteCodes(course);
    const prereqIndexes = prereqCodes.map(code => scheduled.has(code) ? SEMESTERS.findIndex(semester => semester.id === scheduled.get(code)) + 1 : 0);
    let start = Math.max(0, preferredIndex, ...prereqIndexes);
    for (let index = start; index < SEMESTERS.length; index += 1) if ((termCounts.get(SEMESTERS[index].id) || 0) < termLoad) return SEMESTERS[index].id;
    const lightest = SEMESTERS.reduce((best, semester) => (termCounts.get(semester.id) || 0) < (termCounts.get(best.id) || 0) ? semester : best, SEMESTERS[0]);
    return lightest.id;
  };
  const candidateMap = new Map();
  const selections = [
    ...majors.map(({ program, track }) => ({ kind: 'major', program, track, label: track.label === 'Major' ? program.name : `${program.name} — ${track.label}` })),
    ...minors.map(program => ({ kind: 'minor', program, track: null, label: `${program.name} minor` }))
  ];
  for (const selection of selections) {
    const groups = programCourseGroups(selection.kind, selection.program, selection.track);
    const target = programTarget(selection.kind, selection.program, selection.track, groups.length);
    const chosenGroups = groups.slice(0, Math.min(target, groups.length));
    for (const alternatives of chosenGroups) {
      const representative = alternatives.find(code => scheduled.has(code)) || alternatives.find(code => data.courses.some(course => course.code === code));
      if (!representative) continue;
      const candidate = candidateMap.get(representative) || { code: representative, alternatives: [], labels: [], flexible: alternatives.length > 1 };
      candidate.alternatives = [...new Set([...candidate.alternatives, ...alternatives])];
      candidate.labels.push(selection.label);
      candidateMap.set(representative, candidate);
    }
    const missingSlots = Math.max(0, target - chosenGroups.length);
    if (missingSlots) {
      const poolSubjects = programCourses(selection.kind, selection.program, selection.track).map(code => code.split(' ')[0]);
      const primarySubject = [...new Set(poolSubjects)].sort((a, b) => poolSubjects.filter(item => item === b).length - poolSubjects.filter(item => item === a).length)[0];
      const supplements = data.courses.filter(course => course.subject === primarySubject && courseLevel(course) >= 3 && !candidateMap.has(course.code) && !scheduled.has(course.code)).slice(0, missingSlots);
      for (const course of supplements) candidateMap.set(course.code, { code: course.code, alternatives: supplements.map(item => item.code), labels: [`${selection.label} elective`], flexible: true });
    }
  }
  const rawProgramCandidates = [...candidateMap.values()].filter(candidate => !scheduled.has(candidate.code)).map(candidate => ({ ...candidate, course: data.courses.find(course => course.code === candidate.code) })).filter(candidate => candidate.course);
  // When a flexible pathway contains the listed prerequisite for another required
  // course, recommend that prerequisite instead of an easier alternative. This
  // keeps plans such as MATH 135 -> MATH 145 sequential while still allowing the
  // student to swap the flexible choice when placement makes that appropriate.
  const fixedProgramCandidates = rawProgramCandidates.filter(candidate => !candidate.flexible);
  const fixedProgramCodes = new Set(fixedProgramCandidates.map(candidate => candidate.code));
  const prerequisiteDemand = new Set(fixedProgramCandidates.flatMap(candidate => listedPrerequisiteCodes(candidate.course)));
  const allProgramCandidates = rawProgramCandidates.map(candidate => {
    if (!candidate.flexible) return candidate;
    const prerequisiteCode = candidate.alternatives.findLast(code => prerequisiteDemand.has(code) && !fixedProgramCodes.has(code));
    const prerequisiteCourse = prerequisiteCode && data.courses.find(course => course.code === prerequisiteCode);
    return prerequisiteCourse ? { ...candidate, code: prerequisiteCode, course: prerequisiteCourse } : candidate;
  });
  const programCapacity = Math.max(0, targetTotal - entries.length - 4);
  const programCandidates = allProgramCandidates.sort((a, b) => b.labels.length - a.labels.length || Number(/capstone|assessment|experiential/i.test(b.course.title)) - Number(/capstone|assessment|experiential/i.test(a.course.title)) || courseLevel(a.course) - courseLevel(b.course) || Number.parseInt(a.course.number, 10) - Number.parseInt(b.course.number, 10)).slice(0, programCapacity).sort((a, b) => courseLevel(a.course) - courseLevel(b.course) || Number.parseInt(a.course.number, 10) - Number.parseInt(b.course.number, 10));
  const omittedProgramCount = Math.max(0, allProgramCandidates.length - programCandidates.length);
  for (const candidate of programCandidates) {
    const capstone = /capstone|assessment|experiential/i.test(candidate.course.title);
    const preferred = capstone ? 6 : Math.max(0, Math.min(6, (Math.max(1, courseLevel(candidate.course)) - 1) * 2));
    addEntry({ id: `program-${candidate.course.code}`, course: candidate.course, term: chooseTerm(candidate.course, preferred), type: candidate.flexible ? 'program-flexible' : 'program', flexible: candidate.flexible, reason: candidate.labels.join(' + '), alternatives: candidate.alternatives.map(code => data.courses.find(course => course.code === code)).filter(Boolean) });
  }
  let plannedRecords = entries.filter(entry => entry.course).map(entry => ({ course: entry.course }));
  let guard = 0;
  while (entries.length < targetTotal && geProgressFor(plannedRecords).some(requirement => !requirement.complete) && guard < 18) {
    guard += 1;
    const baseProgress = geProgressFor(plannedRecords);
    const baseById = new Map(baseProgress.map(requirement => [requirement.id, requirement]));
    const before = progressCoverageScore(baseProgress);
    const used = new Set(entries.filter(entry => entry.course).map(entry => entry.course.code));
    const options = data.courses.filter(course => !used.has(course.code) && courseCredits(course) >= 3 && courseLevel(course) <= 3).map(course => {
      const trialProgress = geProgressFor([...plannedRecords, { course }]);
      const gained = trialProgress.filter(requirement => requirement.countMet > (baseById.get(requirement.id)?.countMet || 0) || (requirement.id === 'SCI' && !requirement.needsLab && baseById.get('SCI')?.needsLab)).map(requirement => requirement.label);
      return { course, improvement: progressCoverageScore(trialProgress) - before, gained };
    }).filter(option => option.improvement > 0).sort((a, b) => b.improvement - a.improvement || Boolean(a.course.prerequisites) - Boolean(b.course.prerequisites) || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
    if (!options.length) break;
    const selected = options[0];
    const tagIds = selected.course.ge.map(tag => tag.id);
    const alternatives = data.courses.filter(course => !used.has(course.code) && course.code !== selected.course.code && courseCredits(course) >= 3 && course.ge.some(tag => tagIds.includes(tag.id))).slice(0, 10);
    addEntry({ id: `ge-${guard}-${selected.course.code}`, course: selected.course, term: chooseTerm(selected.course, Math.min(5, guard - 1)), type: 'ge', flexible: true, reason: selected.gained.join(' + ') || 'General education', alternatives: [selected.course, ...alternatives] });
    plannedRecords = entries.filter(entry => entry.course).map(entry => ({ course: entry.course }));
  }
  const usedSubjects = new Set(entries.filter(entry => entry.course).map(entry => entry.course.subject));
  const electivePool = data.courses.filter(course => !scheduled.has(course.code) && !entries.some(entry => entry.course?.code === course.code) && courseCredits(course) >= 3 && courseLevel(course) <= 2 && !course.prerequisites).sort((a, b) => Number(usedSubjects.has(a.subject)) - Number(usedSubjects.has(b.subject)) || b.ge.length - a.ge.length || a.course?.code?.localeCompare?.(b.course?.code || '', undefined, { numeric: true }) || a.code.localeCompare(b.code, undefined, { numeric: true }));
  let electiveIndex = 0;
  while (entries.length < targetTotal && electiveIndex < electivePool.length) {
    const course = electivePool[electiveIndex++];
    if (entries.some(entry => entry.course?.code === course.code)) continue;
    const alternatives = electivePool.filter(option => option.code !== course.code && !entries.some(entry => entry.course?.code === option.code)).slice(0, 10);
    addEntry({ id: `elective-${entries.length}-${course.code}`, course, term: chooseTerm(course, entries.length < targetTotal / 2 ? 0 : 2), type: 'elective', flexible: true, reason: 'Open elective / graduation credit', alternatives: [course, ...alternatives] });
    usedSubjects.add(course.subject);
  }
  entries.omittedProgramCount = omittedProgramCount;
  return entries.sort((a, b) => SEMESTERS.findIndex(semester => semester.id === a.term) - SEMESTERS.findIndex(semester => semester.id === b.term));
}

function recommendedStatus(entry) {
  if (entry.type === 'existing') return 'existing';
  return entry.flexible ? 'flexible' : 'program';
}

function renderRecommendedPlan(force = false) {
  const programs = [...selectedMajors().map(({ program, track }) => track.label === 'Major' ? program.name : `${program.name} — ${track.label}`), ...selectedMinors().map(program => `${program.name} minor`)];
  $('#recommendedPrograms').textContent = programs.join(' · ') || 'Choose a major or minor in My plan first.';
  if (force || !recommendedDraft.length) recommendedDraft = buildRecommendedPlan($('#recommendedLoad').value);
  if (!recommendedDraft.length) {
    $('#recommendedPlan').innerHTML = '<div class="empty-plan"><strong>No program selected yet.</strong><span>Add at least one major or minor under My plan, then build a recommendation.</span></div>';
    $('#recommendedMessage').textContent = '';
    $('#applyRecommendedPlan').hidden = true;
    return;
  }
  const flexibleCount = recommendedDraft.filter(entry => entry.flexible).length;
  $('#recommendedMessage').textContent = `${recommendedDraft.length} courses across eight semesters · ${flexibleCount} flexible choices highlighted${recommendedDraft.omittedProgramCount ? ` · ${recommendedDraft.omittedProgramCount} additional program options do not fit this course load` : ''}`;
  $('#applyRecommendedPlan').hidden = false;
  $('#recommendedPlan').innerHTML = SEMESTERS.map(semester => {
    const semesterEntries = recommendedDraft.filter(entry => entry.term === semester.id);
    return `<article class="recommended-term"><header><div><span>${semester.year}</span><h3>${semester.season}</h3></div><b>${semesterEntries.length} classes</b></header><div>${semesterEntries.map(entry => `<div class="recommended-course ${recommendedStatus(entry)}"><div class="recommended-course-title"><span>${entry.flexible ? '↻' : entry.type === 'existing' ? '✓' : '◆'}</span><button data-recommended-course="${entry.course.code}"><b>${entry.course.code}</b><small>${escapeHtml(entry.course.title)}</small></button></div><p>${escapeHtml(entry.reason)}</p>${entry.flexible && entry.alternatives.length > 1 ? `<label>Swap choice<select data-swap-recommended="${escapeHtml(entry.id)}">${entry.alternatives.map(course => `<option value="${course.code}" ${course.code === entry.course.code ? 'selected' : ''}>${course.code} · ${escapeHtml(course.title)}</option>`).join('')}</select></label>` : ''}</div>`).join('')}</div></article>`;
  }).join('');
  $$('[data-recommended-course]').forEach(button => button.addEventListener('click', () => openCourse(button.dataset.recommendedCourse)));
  $$('[data-swap-recommended]').forEach(select => select.addEventListener('change', () => {
    const attemptedCode = select.value;
    const entry = recommendedDraft.find(item => item.id === select.dataset.swapRecommended);
    const replacement = data.courses.find(course => course.code === attemptedCode);
    if (entry && replacement && !recommendedDraft.some(item => item !== entry && item.course?.code === replacement.code)) { entry.course = replacement; renderRecommendedPlan(false); }
    else { select.value = entry?.course?.code || ''; $('#recommendedMessage').textContent = `${attemptedCode} is already elsewhere in this draft.`; }
  }));
}

function majorSelection(id) {
  const program = data.programs.find(item => item.slug === String(id).split('::')[0]);
  const track = program?.majorTracks?.find(item => item.id === id);
  return program && track ? { program, track, label: track.label === 'Major' ? program.name : `${program.name} — ${track.label}` } : null;
}

function compareMajorTracks(firstId, secondId) {
  const first = majorSelection(firstId), second = majorSelection(secondId);
  if (!first || !second) return null;
  const firstCodes = [...new Set(first.track.courses)], secondCodes = [...new Set(second.track.courses)];
  const sharedCodes = firstCodes.filter(code => secondCodes.includes(code));
  const toCourses = codes => codes.map(code => data.courses.find(course => course.code === code)).filter(Boolean);
  return { first: { ...first, target: programTarget('major', first.program, first.track, programCourseGroups('major', first.program, first.track).length) }, second: { ...second, target: programTarget('major', second.program, second.track, programCourseGroups('major', second.program, second.track).length) }, shared: toCourses(sharedCodes), firstOnly: toCourses(firstCodes.filter(code => !sharedCodes.includes(code))), secondOnly: toCourses(secondCodes.filter(code => !sharedCodes.includes(code))) };
}

function comparisonCourseList(courses, emptyText) {
  return courses.length ? `<ul>${courses.map(course => `<li><button data-compare-course="${course.code}"><b>${course.code}</b><span>${escapeHtml(course.title)}</span></button></li>`).join('')}</ul>` : `<p class="compare-empty">${emptyText}</p>`;
}

function renderMajorComparison() {
  const comparison = compareMajorTracks($('#compareMajorA').value, $('#compareMajorB').value);
  if (!comparison) { $('#majorComparison').innerHTML = '<div class="empty-plan"><strong>Choose two majors to compare.</strong></div>'; return; }
  $('#majorComparison').innerHTML = `<div class="compare-summary"><article><span>Shared catalog options</span><strong>${comparison.shared.length}</strong></article><article><span>${escapeHtml(comparison.first.label)}</span><strong>${comparison.first.track.courses.length}</strong><small>${comparison.first.target ? `Estimated ${comparison.first.target}-course path` : 'Review catalog rules'}</small></article><article><span>${escapeHtml(comparison.second.label)}</span><strong>${comparison.second.track.courses.length}</strong><small>${comparison.second.target ? `Estimated ${comparison.second.target}-course path` : 'Review catalog rules'}</small></article></div><p class="compare-note">Lists show courses named or included by catalog rules. “Or” choices and broad elective pools are options, not courses every student must take.</p><section class="shared-courses"><h3>Courses in both paths</h3>${comparisonCourseList(comparison.shared, 'No named courses overlap.')}</section><div class="compare-columns"><section><h3>Only in ${escapeHtml(comparison.first.label)}</h3>${comparisonCourseList(comparison.firstOnly, 'No unique named courses.')}</section><section><h3>Only in ${escapeHtml(comparison.second.label)}</h3>${comparisonCourseList(comparison.secondOnly, 'No unique named courses.')}</section></div>`;
  $$('[data-compare-course]').forEach(button => button.addEventListener('click', () => openCourse(button.dataset.compareCourse)));
}

function renderPlanner() {
  const majors = selectedMajors();
  const minors = selectedMinors();
  $('#plannerMajor').value = '';
  $('#plannerMinor').value = '';
  const printPrograms = [...majors.map(({ program, track }) => `${program.name}${track.label === 'Major' ? '' : ` — ${track.label}`}`), ...minors.map(program => `${program.name} minor`)];
  $('#printMeta').textContent = `${printPrograms.join(' · ') || 'No major or minor selected'} · Printed ${new Date().toLocaleDateString()}`;
  $('#selectedPrograms').innerHTML = printPrograms.length ? `${majors.map(({ program, track }) => `<span class="selected-program-chip"><b>Major</b>${escapeHtml(track.label === 'Major' ? program.name : `${program.name} — ${track.label}`)}<button data-remove-major="${escapeHtml(track.id)}" aria-label="Remove ${escapeHtml(program.name)} major">×</button></span>`).join('')}${minors.map(program => `<span class="selected-program-chip"><b>Minor</b>${escapeHtml(program.name)}<button data-remove-minor="${program.slug}" aria-label="Remove ${escapeHtml(program.name)} minor">×</button></span>`).join('')}` : '<p>Choose one or more majors and minors.</p>';
  const selected = selectedCourseRecords();
  const statusLabel = status => status === 'current' ? 'In progress' : status === 'completed' ? 'Completed' : 'Planned';
  const semesterCell = semester => {
    const termCourses = selected.filter(item => normalizeTerm(item.term) === semester.id);
    const credits = termCourses.reduce((total, item) => total + courseCredits(item.course), 0);
    const coursesHtml = termCourses.map(item => { const prerequisite = prerequisiteStatus(item.course, semester.id); return `<div class="semester-course" draggable="true" data-code="${item.code}">
        <div class="semester-course-top"><div><strong>${item.course.code}</strong><span>${escapeHtml(item.course.title)}</span></div><button class="remove-course" data-action="remove-course" data-code="${item.code}" aria-label="Remove ${item.code}">×</button></div>
        <div class="semester-course-controls"><button class="status-toggle ${item.status}" data-action="toggle-status" data-code="${item.code}">${statusLabel(item.status)}</button><label><span>Move to</span><select data-action="move-term" data-code="${item.code}" aria-label="Move ${item.code} to another semester">${semesterOptions(semester.id)}</select></label></div>
        ${prerequisite.state === 'missing' ? `<p class="schedule-warning">Check prerequisite timing: ${escapeHtml(prerequisite.missing.join(', '))}</p>` : prerequisite.state === 'review' ? '<p class="schedule-warning">Prerequisite needs manual review.</p>' : ''}
      </div>`; }).join('');
    const paperSlots = Array.from({ length: Math.max(0, 6 - termCourses.length) }, () => '<div class="paper-slot"><span></span></div>').join('');
    return `<article class="semester-column">
      <header><h4>${semester.season}</h4><b>${termCourses.length} ${termCourses.length === 1 ? 'class' : 'classes'}${credits ? ` · ${credits} credits` : ''}</b></header>
      <div class="semester-dropzone ${termCourses.length ? '' : 'empty'}" data-term="${semester.id}">${coursesHtml || '<p>Drop or add classes here</p>'}${paperSlots}</div>
    </article>`;
  };
  const years = [...new Set(SEMESTERS.map(semester => semester.year))];
  $('#selectedCourses').innerHTML = `<div class="semester-table-head"><span>Academic year</span><b>Fall</b><b>Spring</b></div>${years.map(year => {
    const terms = SEMESTERS.filter(semester => semester.year === year);
    return `<div class="semester-table-row"><div class="semester-year"><span>${year}</span><small>Plan up to six classes per term</small></div>${terms.map(semesterCell).join('')}</div>`;
  }).join('')}`;

  const progress = geProgress();
  const met = progress.reduce((sum, requirement) => sum + requirement.completedCount, 0);
  const plannedMet = progress.reduce((sum, requirement) => sum + requirement.countMet, 0);
  const total = progress.reduce((sum, requirement) => sum + requirement.count, 0);
  $('#coverageSummary').textContent = `${met} completed · ${plannedMet} in plan of ${total}`;
  $('#progressCards').innerHTML = progress.map(requirement => `<button type="button" class="progress-card ${requirement.complete ? 'complete' : requirement.planComplete ? 'planned-complete' : ''}" data-ge-id="${requirement.needsLab ? 'LAB' : requirement.id}" aria-label="Show classes that fulfill ${escapeHtml(requirement.label)}">
    <div class="progress-icon">${requirement.complete ? '✓' : `${requirement.completedCount}/${requirement.count}`}</div>
    <div><strong>${escapeHtml(requirement.label)}</strong><small>${requirement.complete ? 'Completed' : requirement.planComplete ? 'Covered by current/future plan' : requirement.needsLab ? 'Lab science still needed' : `${requirement.count - requirement.countMet} not yet planned`}${requirement.matched.length ? ` · ${requirement.matched.map(course => course.code).join(', ')}` : ''}</small><span class="progress-action">See matching classes →</span></div>
  </button>`).join('');

  const graduationRules = data.graduation.requirements;
  const completedCourseCredits = selected.filter(item => item.status === 'completed').reduce((totalCredits, item) => totalCredits + courseCredits(item.course), 0);
  const activeCourseCredits = selected.filter(item => item.status !== 'completed').reduce((totalCredits, item) => totalCredits + courseCredits(item.course), 0);
  const completedCredits = completedCourseCredits + (Number(plan.otherCredits) || 0);
  const planCredits = completedCredits + activeCourseCredits;
  const percent = Math.min(100, (planCredits / graduationRules.creditHours) * 100);
  $('#graduationSource').href = data.graduation.sourceUrl;
  $('#otherCredits').value = plan.otherCredits || '';
  $('#currentGpa').value = plan.gpa;
  $('#graduationProgress').innerHTML = `<div class="credit-meter"><div><strong>${completedCredits}</strong> completed + <strong>${activeCourseCredits}</strong> in progress/planned <span>of ${graduationRules.creditHours} credits</span></div><progress max="${graduationRules.creditHours}" value="${Math.min(graduationRules.creditHours, planCredits)}"></progress><small>${Math.round(percent)}% represented in this plan</small></div>
    <ul class="graduation-checks"><li class="${planCredits >= graduationRules.creditHours ? 'met' : ''}"><b>${graduationRules.creditHours} total credits</b><span>${planCredits >= graduationRules.creditHours ? 'Covered by plan' : `${graduationRules.creditHours - planCredits} credits still unplanned`}</span></li><li class="${plan.gpa !== '' && Number(plan.gpa) >= graduationRules.cumulativeGpa ? 'met' : plan.gpa !== '' ? 'warning' : ''}"><b>${graduationRules.cumulativeGpa.toFixed(1)} minimum cumulative GPA</b><span>${plan.gpa === '' ? 'Enter GPA to check' : `Current entry: ${Number(plan.gpa).toFixed(2)}`}</span></li><li><b>${graduationRules.majorGpa.toFixed(1)} minimum major GPA</b><span>Confirm with advisor/Registrar</span></li><li><b>${graduationRules.residenceCredits} credits in residence</b><span>Plus at least half of major and minor credits at Denison</span></li><li><b>Final ${graduationRules.seniorResidenceSemesters} semesters in residence</b><span>Exceptions require advance approval</span></li></ul>`;

  const programs = [
    ...majors.map(({ program, track }) => ({ kind: 'major', program, track, label: track.label === 'Major' ? program.name : `${program.name} — ${track.label}`, courses: programCourses('major', program, track) })),
    ...minors.map(program => ({ kind: 'minor', program, track: null, label: program.name, courses: programCourses('minor', program) }))
  ];
  $('#programProgress').innerHTML = programs.length ? programs.map(({ kind, program, track, label, courses }) => {
    const matches = directProgramMatches(kind, program, track);
    const selectedCodes = new Set(plan.courses.map(item => item.code));
    const requirementText = kind === 'major' ? track?.text : program.minorText;
    const requiredCount = kind === 'major' ? track?.requiredCourseCount : program.minorRequiredCourseCount;
    const statusCounts = { completed: 0, current: 0, planned: 0 };
    plan.courses.filter(item => courses.includes(item.code)).forEach(item => { statusCounts[item.status] += 1; });
    const highlights = requirementHighlights(requirementText || program.requirementsText);
    const checklist = highlights.map(rule => ({ rule, ...programAuditRule(rule, courses) }));
    const target = requiredCount || Math.max(1, courses.length);
    const coveredCount = statusCounts.completed + statusCounts.current + statusCounts.planned;
    const coveragePercent = Math.min(100, Math.round((coveredCount / target) * 100));
    const courseItems = courses.map(code => {
      const course = data.courses.find(item => item.code === code);
      const selectedItem = plan.courses.find(item => item.code === code);
      return `<li class="${selectedItem ? `covered ${selectedItem.status}` : ''}"><span>${selectedItem?.status === 'completed' ? '✓' : selectedItem ? '◐' : '○'}</span><b>${code}</b>${course ? `<small>${escapeHtml(course.title)}</small>` : ''}</li>`;
    }).join('');
    return `<article class="program-progress-card" role="button" tabindex="0" data-program="${program.slug}" data-kind="${kind}" data-track="${escapeHtml(kind === 'major' ? track?.id || '' : '')}" aria-label="Open personalized requirements for ${escapeHtml(label)}"><div><span class="program-chip">${kind}</span><strong>${escapeHtml(label)}</strong><span class="open-audit">Open audit →</span></div><p><b>${statusCounts.completed} completed</b> · ${statusCounts.current} in progress · ${statusCounts.planned} planned${requiredCount ? ` toward a catalog minimum of ${requiredCount} courses` : ` across ${courses.length} catalog course options`}.</p><div class="mini-progress" aria-label="${coveragePercent}% of course target represented in plan"><span style="width:${coveragePercent}%"></span></div>
      <div class="compact-requirements"><h4>Quick checklist</h4>${checklist.length ? `<ul class="mini-checklist">${checklist.map(item => `<li class="${item.state}"><span>${item.state === 'met' ? '✓' : item.state === 'scheduled' ? '◐' : item.state === 'needed' ? '○' : '?'}</span><b>${escapeHtml(item.rule)}</b></li>`).join('')}</ul>` : '<p class="no-rules">See the complete catalog wording for category and elective rules.</p>'}
      <details><summary>All named courses and options (${courses.length})</summary><ul class="named-course-list">${courseItems || '<li>No specific course codes are named.</li>'}</ul></details></div>
      ${program.catalogOnlyReferences?.length ? `<p class="catalog-only"><b>Catalog-only or legacy references:</b> ${escapeHtml(program.catalogOnlyReferences.join(', '))}. These are not recommended as current courses.</p>` : ''}<small>Course totals are planning coverage, not an official completion decision. Alternatives, grades, residency, and approvals still require advisor review.</small><button class="view-program-button" data-program="${program.slug}">View full requirements</button></article>`;
  }).join('') : '<div class="program-empty">Choose a preferred major or minor to add program-specific recommendations.</div>';

  const recommendations = recommendationData();
  $('#recommendationCount').textContent = `${recommendations.length} options found`;
  $('#recommendations').innerHTML = recommendations.slice(0, 18).map(({ course, reasons, prerequisite }) => `<article class="recommendation-card" data-code="${course.code}" role="button" tabindex="0" aria-label="View ${course.code} ${escapeHtml(course.title)}">
    <div class="recommendation-top"><div><span>${course.code}</span><h4>${escapeHtml(course.title)}</h4></div><button class="quick-add" data-add-code="${course.code}">+ Add</button></div>
    <div class="tag-row">${reasons.slice(0, 5).map(reason => `<span class="tag ${reason.type}" title="${escapeHtml(reason.detail)}">${escapeHtml(reason.label)}</span>`).join('')}</div>
    ${course.prerequisites ? `<p class="prereq-note ${prerequisite.state}"><strong>${prerequisite.state === 'missing' ? 'Prerequisites not yet scheduled:' : 'Prerequisites:'}</strong> ${escapeHtml(course.prerequisites.slice(0, 150))}${course.prerequisites.length > 150 ? '…' : ''}</p>` : ''}
    <p class="offering-note">Verify the course is offered in your intended term.</p>
  </article>`).join('') || '<div class="empty-plan"><strong>Add a program or more completed classes.</strong><span>Recommendations appear when the planner can identify unmet requirements.</span></div>';
  bindPlannerResultEvents();
  if ($('#electiveResults')) renderElectives();
}

function addCourseFromInput(codeOverride, termOverride) {
  const input = $('#plannerCourseInput');
  const raw = codeOverride || input.value.trim();
  const normalized = raw.toUpperCase().match(/^[A-Z]{1,6}\s*\d{3}[A-Z-]*$/)?.[0].replace(/([A-Z])(?=\d)/, '$1 ').replace(/\s+/, ' ');
  const course = data.courses.find(item => item.code === normalized) || data.courses.find(item => `${item.code} — ${item.title}`.toLowerCase() === raw.toLowerCase());
  if (!course) { $('#plannerEntryMessage').textContent = 'Choose a course code from the catalog list.'; return; }
  if (plan.courses.some(item => item.code === course.code)) { $('#plannerEntryMessage').textContent = `${course.code} is already in your plan.`; return; }
  plan.courses.push({ code: course.code, status: codeOverride ? 'planned' : $('#plannerCourseStatus').value, term: normalizeTerm(termOverride || $('#plannerCourseTerm').value) });
  input.value = '';
  $('#plannerEntryMessage').textContent = `${course.code} added.`;
  savePlan();
  renderPlanner();
}

function bindPlannerResultEvents() {
  $$('[data-remove-major]').forEach(button => button.addEventListener('click', () => { plan.majors = plan.majors.filter(id => id !== button.dataset.removeMajor); savePlan(); renderPlanner(); }));
  $$('[data-remove-minor]').forEach(button => button.addEventListener('click', () => { plan.minors = plan.minors.filter(slug => slug !== button.dataset.removeMinor); savePlan(); renderPlanner(); }));
  $$('[data-action="remove-course"]').forEach(button => button.addEventListener('click', () => {
    plan.courses = plan.courses.filter(item => item.code !== button.dataset.code); savePlan(); renderPlanner();
  }));
  $$('[data-action="toggle-status"]').forEach(button => button.addEventListener('click', () => {
    const item = plan.courses.find(course => course.code === button.dataset.code);
    item.status = item.status === 'completed' ? 'current' : item.status === 'current' ? 'planned' : 'completed'; savePlan(); renderPlanner();
  }));
  $$('[data-action="move-term"]').forEach(select => select.addEventListener('change', () => {
    const item = plan.courses.find(course => course.code === select.dataset.code);
    if (item) { item.term = normalizeTerm(select.value); savePlan(); renderPlanner(); }
  }));
  $$('.semester-course').forEach(card => card.addEventListener('dragstart', event => {
    event.dataTransfer.setData('text/plain', card.dataset.code);
    event.dataTransfer.effectAllowed = 'move';
  }));
  $$('.semester-dropzone').forEach(zone => {
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      const item = plan.courses.find(course => course.code === event.dataTransfer.getData('text/plain'));
      if (item) { item.term = normalizeTerm(zone.dataset.term); savePlan(); renderPlanner(); }
    });
  });
  $$('.quick-add').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); addCourseFromInput(button.dataset.addCode); }));
  $$('.recommendation-card').forEach(card => {
    card.addEventListener('click', () => openCourse(card.dataset.code));
    card.addEventListener('keydown', event => { if (event.target === card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openCourse(card.dataset.code); } });
  });
  $$('.progress-card').forEach(card => card.addEventListener('click', () => {
    $('#globalSearch').value = '';
    $('#geFilter').value = card.dataset.geId;
    $('#programFilter').value = '';
    $('#explicitOnly').checked = false;
    visibleLimit = 30;
    renderCourses();
    switchView('courses');
    document.querySelector('#coursesView .results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const openProgramAudit = card => { switchView('programs'); renderProgram(card.dataset.program, card.dataset.kind, card.dataset.track); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  $$('.program-progress-card').forEach(card => {
    card.addEventListener('click', event => { if (!event.target.closest('button, summary, a')) openProgramAudit(card); });
    card.addEventListener('keydown', event => { if (event.target === card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openProgramAudit(card); } });
  });
  $$('.view-program-button').forEach(button => button.addEventListener('click', () => openProgramAudit(button.closest('.program-progress-card'))));
}

function filteredCourses() {
  const query = $('#globalSearch').value.trim().toLowerCase(), ge = $('#geFilter').value, program = $('#programFilter').value, explicit = $('#explicitOnly').checked;
  return data.courses.filter(course => {
    const haystack = `${course.code} ${course.title} ${course.description} ${course.subjectName}`.toLowerCase();
    const queryMatch = !query || haystack.includes(query) || course.programReferences.some(reference => `${reference.program} ${reference.section}`.toLowerCase().includes(query));
    const geMatch = !ge || course.ge.some(tag => tag.id === ge && (!explicit || ['explicit', 'conditional'].includes(tag.confidence)));
    const programMatch = !program || course.programReferences.some(reference => reference.slug === program);
    const evidenceMatch = !explicit || (!ge && course.ge.some(tag => ['explicit', 'conditional'].includes(tag.confidence))) || Boolean(program);
    return queryMatch && geMatch && programMatch && evidenceMatch;
  });
}

function renderCourses() {
  const courses = filteredCourses();
  $('#resultCount').textContent = `${courses.length.toLocaleString()} matches`;
  $('#courseResults').innerHTML = courses.slice(0, visibleLimit).map(course => `<article class="course-card" data-code="${course.code}" role="button" tabindex="0" aria-label="View ${course.code} ${escapeHtml(course.title)}">
    <div class="course-code">${course.code}</div><div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description.slice(0, 180))}${course.description.length > 180 ? '…' : ''}</p>
    <div class="tag-row">${course.ge.slice(0, 5).map(tag => `<span class="tag ${tag.confidence}">${escapeHtml(tag.label)}</span>`).join('')}${course.programReferences.length ? `<span class="tag">${course.programReferences.length} program ${course.programReferences.length === 1 ? 'match' : 'matches'}</span>` : ''}</div></div>
    <span class="credits">${escapeHtml(course.credits)}</span></article>`).join('') || '<p>No courses match those filters.</p>';
  $('#showMore').hidden = courses.length <= visibleLimit;
  $$('.course-card').forEach(card => {
    card.addEventListener('click', () => openCourse(card.dataset.code));
    card.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); openCourse(card.dataset.code); } });
  });
}

function openCourse(code) {
  const course = data.courses.find(item => item.code === code); if (!course) return;
  const alreadyAdded = plan.courses.some(item => item.code === course.code);
  $('#courseDialogBody').innerHTML = `<span class="dialog-code">${course.code} · ${escapeHtml(course.credits)}</span><h2 class="dialog-title">${escapeHtml(course.title)}</h2><p class="dialog-copy">${escapeHtml(course.description)}</p>
  ${course.details ? `<p class="dialog-copy"><strong>Catalog details</strong><br>${escapeHtml(course.details).replace(/\n/g, '<br>')}</p>` : ''}
  <h3>What it may fulfill</h3><div class="fulfillment-list">${course.ge.length ? course.ge.map(tag => `<div class="fulfillment"><strong>${escapeHtml(tag.label)}</strong><small>${escapeHtml(tag.evidence)} · ${tag.confidence}</small></div>`).join('') : '<p>No GE mapping was found in the catalog text.</p>'}</div>
  <h3>Referenced by program requirements</h3>${course.programReferences.length ? `<ul class="program-links">${course.programReferences.map(reference => `<li><strong>${escapeHtml(reference.program)}</strong><br>${escapeHtml(reference.section)}</li>`).join('')}</ul>` : '<p>No direct program reference was found. Broad elective rules may still apply.</p>'}
  <div class="dialog-actions"><button id="dialogAddCourse" class="primary-button" ${alreadyAdded ? 'disabled' : ''}>${alreadyAdded ? 'Already in plan' : 'Add to my plan'}</button><a href="${course.sourceUrl}" target="_blank" rel="noreferrer">Open official catalog page ↗</a></div>`;
  $('#courseDialog').showModal();
  $('#dialogAddCourse').addEventListener('click', () => { addCourseFromInput(course.code); $('#courseDialog').close(); });
}

function programAuditRule(rule, pool) {
  const selected = new Map(plan.courses.map(item => [item.code, item]));
  const statusFor = codes => {
    const items = codes.map(code => selected.get(code)).filter(Boolean);
    if (!items.length) return 'needed';
    if (items.every(item => item.status === 'completed')) return 'met';
    return 'scheduled';
  };
  const codes = [...new Set([...rule.matchAll(/\b[A-Z]{2,6}\s+\d{3}[A-Z]?\b/g)].map(match => match[0]).filter(code => pool.includes(code)))];
  if (codes.length) {
    const alternatives = /\b(?:or|either|one of|selected from)\b/i.test(rule);
    const chosen = codes.filter(code => selected.has(code));
    const satisfied = alternatives ? chosen.length > 0 : chosen.length === codes.length;
    return { state: satisfied ? statusFor(chosen) : chosen.length ? 'scheduled' : 'needed', detail: `${chosen.length} of ${alternatives ? 1 : codes.length} named ${alternatives ? 'option' : 'course(s)'} in plan` };
  }
  const numberLookup = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const levelMatch = rule.match(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.]{0,55}?\b([1-4])00[- ]level/i);
  if (levelMatch) {
    const needed = Number(levelMatch[1]) || numberLookup[levelMatch[1].toLowerCase()];
    const eligible = pool.filter(code => code.split(' ')[1]?.startsWith(levelMatch[2]));
    const chosen = eligible.filter(code => selected.has(code));
    const completed = chosen.filter(code => selected.get(code).status === 'completed').length;
    const state = completed >= needed ? 'met' : chosen.length >= needed ? 'scheduled' : 'needed';
    return { state, detail: `${completed} completed · ${chosen.length - completed} scheduled · ${Math.max(0, needed - chosen.length)} still needed` };
  }
  return { state: 'review', detail: 'Requires catalog/advisor review' };
}

function programAuditContext(program, preferredKind, trackId) {
  const selectedMajor = selectedMajors().find(item => item.program.slug === program.slug);
  const selectedMinor = selectedMinors().find(item => item.slug === program.slug);
  let kind = preferredKind;
  if (!kind) kind = selectedMajor ? 'major' : selectedMinor ? 'minor' : program.kinds.includes('major') ? 'major' : 'minor';
  let track = null;
  if (kind === 'major') track = program.majorTracks.find(item => item.id === trackId) || selectedMajor?.track || program.majorTracks[0];
  const pool = kind === 'major' ? track?.courses || [] : program.minorCourses || [];
  const text = kind === 'major' ? track?.text || program.requirementsText : program.minorText || program.requirementsText;
  const requiredCount = kind === 'major' ? track?.requiredCourseCount : program.minorRequiredCourseCount;
  return { kind, track, pool, text, requiredCount };
}

function renderProgram(slug, preferredKind, trackId) {
  const program = data.programs.find(item => item.slug === slug); if (!program) return;
  const context = programAuditContext(program, preferredKind, trackId);
  $('#programSelect').value = slug;
  const modes = [
    ...program.majorTracks.map(track => ({ kind: 'major', id: track.id, label: track.label === 'Major' ? 'Major' : track.label })),
    ...(program.kinds.includes('minor') ? [{ kind: 'minor', id: '', label: 'Minor' }] : [])
  ];
  $('#programSummary').innerHTML = `<div>${program.kinds.map(kind => `<span class="program-chip">${kind}</span>`).join('')}</div><p class="program-meta">Choose a program version to see how your saved plan maps to its current catalog rules.</p><div class="program-mode-list">${modes.map(mode => `<button class="program-mode ${context.kind === mode.kind && (mode.kind === 'minor' || context.track?.id === mode.id) ? 'active' : ''}" data-program-mode="${mode.kind}" data-track-id="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</button>`).join('')}</div>${program.catalogOnlyReferences?.length ? `<p class="program-meta"><b>Not in the current course index:</b> ${escapeHtml(program.catalogOnlyReferences.join(', '))}</p>` : ''}`;

  const selectedItems = plan.courses.filter(item => context.pool.includes(item.code)).map(item => ({ ...item, course: data.courses.find(course => course.code === item.code) })).filter(item => item.course);
  const counts = { completed: 0, current: 0, planned: 0 };
  selectedItems.forEach(item => { counts[item.status] += 1; });
  const remainingCount = context.requiredCount == null ? null : Math.max(0, context.requiredCount - selectedItems.length);
  const rules = requirementHighlights(context.text).map(rule => ({ rule, ...programAuditRule(rule, context.pool) }));
  const ruleList = rules.length ? rules.map(item => `<li class="audit-rule ${item.state}"><span>${item.state === 'met' ? '✓' : item.state === 'scheduled' ? '◐' : item.state === 'needed' ? '○' : '?'}</span><div><b>${escapeHtml(item.rule)}</b><small>${escapeHtml(item.detail)}</small></div></li>`).join('') : '<li class="audit-rule review"><span>?</span><div><b>No machine-readable rule summary was available.</b><small>Use the official wording below and confirm with your advisor.</small></div></li>';
  const checklistOrder = { completed: 0, current: 1, planned: 2, unplanned: 3 };
  const courseChecklist = context.pool.map(code => {
    const course = data.courses.find(item => item.code === code);
    if (!course) return null;
    const selectedItem = plan.courses.find(item => item.code === code);
    const state = selectedItem?.status || 'unplanned';
    const icon = state === 'completed' ? '✓' : state === 'current' ? '◐' : state === 'planned' ? '◆' : '□';
    const label = state === 'completed' ? 'Completed' : state === 'current' ? 'In progress' : state === 'planned' ? 'Planned' : 'Not scheduled';
    return { course, state, icon, label };
  }).filter(Boolean).sort((a, b) => checklistOrder[a.state] - checklistOrder[b.state] || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
  const checklistHtml = courseChecklist.map(item => `<li class="program-course-item ${item.state}"><span class="course-check-icon">${item.icon}</span><button data-audit-course="${item.course.code}"><b>${item.course.code}</b><span>${escapeHtml(item.course.title)}</span></button><small>${item.label}</small>${item.state === 'unplanned' ? `<button class="audit-add" data-add-code="${item.course.code}">+ Add</button>` : ''}</li>`).join('');
  const checklistTarget = context.requiredCount || context.pool.length || 1;
  const checklistPercent = Math.min(100, Math.round((selectedItems.length / checklistTarget) * 100));
  const title = context.kind === 'major' && context.track?.label !== 'Major' ? `${program.name} — ${context.track.label}` : `${program.name} ${context.kind}`;
  $('#programDetail').innerHTML = `<div class="audit-heading"><p class="eyebrow">Personalized program audit</p><h2>${escapeHtml(title)}</h2><p><b>${counts.completed} completed</b> · ${counts.current} in progress · ${counts.planned} planned${remainingCount == null ? '' : ` · ${remainingCount} course slot${remainingCount === 1 ? '' : 's'} not yet planned`}</p></div>
    <section class="audit-section"><h3>Requirement checklist</h3><ul class="audit-rules">${ruleList}</ul></section>
    <section class="audit-section program-course-checklist"><div class="course-checklist-heading"><div><h3>Course checklist</h3><p>Every current course named or included by a catalog rule is shown here. Some entries are alternatives, electives, or prerequisite pathways—not classes every student must take.</p></div><b>${checklistPercent}% planned</b></div><div class="mini-progress"><span style="width:${checklistPercent}%"></span></div><div class="checklist-legend"><span class="completed">✓ Completed</span><span class="current">◐ In progress</span><span class="planned">◆ Planned</span><span class="unplanned">□ Not scheduled</span></div><ul>${checklistHtml || '<li class="empty-audit">No current course codes were identified for this program.</li>'}</ul></section>
    <details class="official-requirements"><summary>Read complete catalog wording</summary><pre>${escapeHtml(context.text || 'No dedicated requirements text was published on this catalog page.')}</pre></details><a href="${program.sourceUrl}" target="_blank" rel="noreferrer">Open official requirements ↗</a>`;
  $$('.program-mode').forEach(button => button.addEventListener('click', () => renderProgram(program.slug, button.dataset.programMode, button.dataset.trackId)));
  $$('[data-audit-course]').forEach(button => button.addEventListener('click', () => openCourse(button.dataset.auditCourse)));
  $$('.audit-add').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); addCourseFromInput(button.dataset.addCode); renderProgram(program.slug, context.kind, context.track?.id); }));
}

function renderGe() {
  const cards = items => items.map(requirement => `<article class="requirement"><strong>${requirement.count}</strong><div><span>${escapeHtml(requirement.label)}</span>${requirement.note ? `<small>${escapeHtml(requirement.note)}</small>` : ''}</div></article>`).join('');
  $('#geSummary').innerHTML = cards(data.generalEducation.summary); $('#geOverlays').innerHTML = cards(data.generalEducation.overlays);
  $('#geRules').innerHTML = data.generalEducation.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join(''); $('#geSource').href = data.generalEducation.sourceUrl;
}

function electiveData(filters = {}) {
  const term = filters.term || (typeof document !== 'undefined' ? $('#electiveTerm')?.value : '') || SEMESTERS[0].id;
  const subject = filters.subject ?? (typeof document !== 'undefined' ? $('#electiveSubject')?.value : '');
  const level = filters.level ?? (typeof document !== 'undefined' ? $('#electiveLevel')?.value : '');
  const readyOnly = filters.readyOnly ?? (typeof document !== 'undefined' ? Boolean($('#electiveReady')?.checked) : true);
  const selectedCodes = new Set(plan.courses.map(item => item.code));
  const majors = selectedMajors();
  const minors = selectedMinors();
  const unmetGe = new Set(geProgress().filter(requirement => !requirement.planComplete).map(requirement => requirement.id));
  return data.courses.filter(course => !selectedCodes.has(course.code) && (!subject || course.subject === subject) && (!level || course.number.startsWith(level))).map(course => {
    const prerequisite = prerequisiteStatus(course, term);
    if (readyOnly && !['none', 'met'].includes(prerequisite.state)) return null;
    const benefits = [];
    for (const { program, track } of majors) if (programCourses('major', program, track).includes(course.code)) benefits.push({ label: track.label === 'Major' ? program.name : `${program.name} — ${track.label}`, type: 'major' });
    for (const minor of minors) if (programCourses('minor', minor).includes(course.code)) benefits.push({ label: minor.name, type: 'minor' });
    for (const tag of course.ge.filter(item => unmetGe.has(item.id))) benefits.push({ label: tag.label, type: tag.confidence });
    const readinessScore = prerequisite.state === 'none' ? 2 : prerequisite.state === 'met' ? 1 : 0;
    return { course, prerequisite, benefits, score: benefits.filter(item => ['major', 'minor'].includes(item.type)).length * 20 + benefits.length * 4 + readinessScore };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
}

function renderElectives() {
  if (!data || !$('#electiveResults')) return;
  const electives = electiveData();
  const term = $('#electiveTerm').value || SEMESTERS[0].id;
  $('#electiveCount').textContent = `${electives.length.toLocaleString()} options`;
  $('#electiveResults').innerHTML = electives.slice(0, 120).map(({ course, prerequisite, benefits }) => `<article class="elective-card" data-code="${course.code}" role="button" tabindex="0" aria-label="View ${course.code} ${escapeHtml(course.title)}">
    <div class="elective-card-top"><div><span>${course.code}</span><h3>${escapeHtml(course.title)}</h3></div><button class="elective-add" data-add-code="${course.code}">+ Add</button></div>
    <p>${escapeHtml(course.description.slice(0, 155))}${course.description.length > 155 ? '…' : ''}</p>
    <div class="tag-row">${benefits.slice(0, 5).map(item => `<span class="tag ${item.type}">${escapeHtml(item.label)}</span>`).join('') || '<span class="tag inferred">Open elective</span>'}</div>
    <small class="elective-readiness ${prerequisite.state}">${prerequisite.state === 'none' ? 'No prerequisite listed' : prerequisite.state === 'met' ? 'Listed prerequisite appears planned beforehand' : prerequisite.state === 'missing' ? `Potential prerequisite gap: ${escapeHtml(prerequisite.missing.join(', '))}` : 'Permission, placement, or prerequisite needs review'}</small>
  </article>`).join('') || '<div class="empty-plan"><strong>No electives match these filters.</strong><span>Try another subject, level, or turn off the prerequisite-ready filter.</span></div>';
  $$('.elective-card').forEach(card => {
    card.addEventListener('click', event => { if (!event.target.closest('button')) openCourse(card.dataset.code); });
    card.addEventListener('keydown', event => { if (event.target === card && ['Enter', ' '].includes(event.key)) { event.preventDefault(); openCourse(card.dataset.code); } });
  });
  $$('.elective-add').forEach(button => button.addEventListener('click', event => { event.stopPropagation(); addCourseFromInput(button.dataset.addCode, term); }));
}

function switchView(view) {
  $$('.tab').forEach(tab => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  $$('.view').forEach(section => {
    const active = section.id === `${view}View`;
    section.classList.toggle('active', active);
    section.setAttribute('aria-hidden', String(!active));
  });
}

function feedbackIssueUrl(type, message) {
  const cleanType = String(type || 'Other feedback').trim();
  const cleanMessage = String(message || '').trim();
  const shortMessage = cleanMessage.length > 72 ? `${cleanMessage.slice(0, 69)}…` : cleanMessage;
  const params = new URLSearchParams({
    title: `[Feedback] ${cleanType}${shortMessage ? `: ${shortMessage}` : ''}`,
    body: `### Feedback type\n${cleanType}\n\n### Message\n${cleanMessage}\n\n### Catalog\n2026–2027\n\n---\nSubmitted from Denison Pathways.`
  });
  return `https://github.com/HallisW7/denison-pathways/issues/new?${params.toString()}`;
}

function bindEvents() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    switchView(tab.dataset.view);
    if (tab.dataset.view === 'electives') renderElectives();
    if (tab.dataset.view === 'recommended') renderRecommendedPlan(false);
    if (tab.dataset.view === 'compare') renderMajorComparison();
  }));
  $$('.tabs').forEach(tablist => tablist.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = $$('.tab');
    const current = tabs.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  }));
  ['globalSearch', 'geFilter', 'programFilter', 'explicitOnly'].forEach(id => $('#' + id).addEventListener(id === 'globalSearch' ? 'input' : 'change', () => { visibleLimit = 30; renderCourses(); if (id === 'globalSearch' && $('#globalSearch').value.trim()) switchView('courses'); }));
  $('#programSelect').addEventListener('change', event => renderProgram(event.target.value));
  $('#clearFilters').addEventListener('click', () => { $('#globalSearch').value = ''; $('#geFilter').value = ''; $('#programFilter').value = ''; $('#explicitOnly').checked = false; visibleLimit = 30; renderCourses(); });
  $('#showMore').addEventListener('click', () => { visibleLimit += 30; renderCourses(); });
  ['electiveTerm', 'electiveSubject', 'electiveLevel', 'electiveReady'].forEach(id => $('#' + id).addEventListener('change', renderElectives));
  $('#generateRecommendedPlan').addEventListener('click', () => renderRecommendedPlan(true));
  $('#recommendedLoad').addEventListener('change', () => renderRecommendedPlan(true));
  $('#applyRecommendedPlan').addEventListener('click', () => {
    const additions = recommendedDraft.filter(entry => entry.course && !plan.courses.some(item => item.code === entry.course.code)).map(entry => ({ code: entry.course.code, status: 'planned', term: entry.term }));
    plan.courses.push(...additions);
    savePlan();
    $('#plannerEntryMessage').textContent = `${additions.length} recommended course${additions.length === 1 ? '' : 's'} added to your plan.`;
    renderPlanner();
    switchView('planner');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  ['compareMajorA', 'compareMajorB'].forEach(id => $('#' + id).addEventListener('change', renderMajorComparison));
  const addMajor = () => {
    const id = $('#plannerMajor').value;
    if (!id) return;
    const slug = id.split('::')[0];
    plan.majors = [...plan.majors.filter(existing => existing.split('::')[0] !== slug), id];
    savePlan(); renderPlanner();
  };
  const addMinor = () => {
    const input = $('#plannerMinor');
    const value = input.value.trim();
    const match = data.programs.find(program => program.kinds.includes('minor') && program.name.toLowerCase() === value.toLowerCase());
    input.setCustomValidity(value && !match ? 'Choose a minor from the catalog suggestions.' : '');
    if (!match) { input.reportValidity(); return; }
    if (!plan.minors.includes(match.slug)) plan.minors.push(match.slug);
    savePlan(); renderPlanner();
  };
  $('#addMajor').addEventListener('click', addMajor);
  $('#plannerMajor').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addMajor(); } });
  $('#plannerMinor').addEventListener('input', event => {
    const value = event.target.value.trim();
    const match = data.programs.find(program => program.kinds.includes('minor') && program.name.toLowerCase() === value.toLowerCase());
    event.target.setCustomValidity(value && !match ? 'Choose a minor from the catalog suggestions.' : '');
  });
  $('#addMinor').addEventListener('click', addMinor);
  $('#plannerMinor').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addMinor(); } });
  $('#otherCredits').addEventListener('change', event => { plan.otherCredits = Math.max(0, Math.min(126, Number(event.target.value) || 0)); savePlan(); renderPlanner(); });
  $('#currentGpa').addEventListener('change', event => { const value = event.target.value; plan.gpa = value === '' ? '' : Math.max(0, Math.min(4, Number(value) || 0)); savePlan(); renderPlanner(); });
  $('#addPlannerCourse').addEventListener('click', () => addCourseFromInput());
  $('#printPlan').addEventListener('click', () => window.print());
  $('#plannerCourseInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addCourseFromInput(); } });
  $('#resetPlan').addEventListener('click', () => { plan = { majors: [], minors: [], courses: [], otherCredits: 0, gpa: '' }; savePlan(); $('#plannerEntryMessage').textContent = 'Plan cleared.'; renderPlanner(); });
  $('#feedbackForm').addEventListener('submit', event => {
    event.preventDefault();
    const message = $('#feedbackMessage').value.trim();
    if (!message) {
      $('#feedbackStatus').textContent = 'Please enter a message before continuing.';
      $('#feedbackMessage').focus();
      return;
    }
    window.open(feedbackIssueUrl($('#feedbackType').value, message), '_blank', 'noopener,noreferrer');
    $('#feedbackStatus').textContent = 'Your GitHub feedback draft opened in a new tab. Review it, then choose “Submit new issue” to send it.';
  });
  $('.dialog-close').addEventListener('click', () => $('#courseDialog').close());
  $('#courseDialog').addEventListener('click', event => { if (event.target === $('#courseDialog')) $('#courseDialog').close(); });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  init().catch(error => { $('#searchHint').textContent = 'Could not load catalog data.'; console.error(error); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setTestState(nextData, nextPlan) { data = nextData; plan = normalizePlanShape(nextPlan); },
    geProgress,
    recommendationData,
    prerequisiteStatus,
    courseCredits,
    programAuditRule,
    electiveData,
    inferredProgramCourseCount,
    programCourseGroups,
    buildRecommendedPlan,
    compareMajorTracks,
    divisionAssignment,
    requirementHighlights,
    feedbackIssueUrl,
    normalizeTerm,
    SEMESTERS
  };
}
