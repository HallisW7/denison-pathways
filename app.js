let data;
let visibleLimit = 30;
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
    majors: [...new Set((Array.isArray(value.majors) ? value.majors : value.major ? [value.major] : []).filter(item => typeof item === 'string' && item))],
    minors: [...new Set((Array.isArray(value.minors) ? value.minors : value.minor ? [value.minor] : []).filter(item => typeof item === 'string' && item))],
    courses: Array.isArray(value.courses) ? value.courses.filter(item => item && typeof item.code === 'string') : [],
    otherCredits: Math.max(0, Number(value.otherCredits) || 0),
    gpa: value.gpa === '' || value.gpa == null ? '' : Number(value.gpa)
  };
}

function savePlan() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); }
  catch (_) {
    const note = typeof document !== 'undefined' && $('.save-note');
    if (note) note.textContent = 'Browser storage is unavailable. Print your plan to keep a copy.';
  }
}

function normalizeTerm(term) {
  return SEMESTERS.some(semester => semester.id === term) ? term : SEMESTERS[0].id;
}

function semesterOptions(selected) {
  return SEMESTERS.map(semester => `<option value="${semester.id}" ${semester.id === selected ? 'selected' : ''}>${semester.year} · ${semester.season}</option>`).join('');
}

async function init() {
  const response = await fetch('data/denison-2026-2027.json?v=20261016-audit');
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
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

function minorChoices() {
  return data.programs.flatMap(program => (program.slug === 'music-theatre' ? program.minorTracks.slice(0, 1) : program.minorTracks || []).map(track => ({
    id: track.id, slug: program.slug,
    label: track.label === 'Minor' || program.slug === 'music-theatre' ? program.name : `${program.name} — ${track.label}`
  })));
}

function fillFilters() {
  const ge = [...data.generalEducation.summary, ...data.generalEducation.overlays, { id: 'LAB', label: 'Science laboratory' }];
  $('#geFilter').innerHTML += ge.map(requirement => `<option value="${requirement.id}">${requirement.label}</option>`).join('');
  const allPrograms = data.programs.filter(program => program.kinds.length).map(program => `<option value="${program.slug}">${escapeHtml(program.name)}</option>`).join('');
  $('#programFilter').innerHTML += allPrograms;
  $('#programSelect').innerHTML = allPrograms;
  $('#plannerMajor').innerHTML = '<option value="">Choose a major and degree</option>' + majorOptions();
  $('#plannerMinorOptions').innerHTML = minorChoices().map(choice => `<option value="${escapeHtml(choice.label)}"></option>`).join('');
  $('#plannerCourseTerm').innerHTML = semesterOptions(SEMESTERS[0].id);
  $('#electiveTerm').innerHTML = semesterOptions(SEMESTERS[0].id);
  const subjects = [...new Map(data.courses.map(course => [course.subject, course.subjectName])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  $('#electiveSubject').innerHTML += subjects.map(([code, name]) => `<option value="${code}">${code} · ${escapeHtml(name)}</option>`).join('');
  plan.majors = [...new Set(plan.majors.map(value => {
    const program = data.programs.find(program => program.slug === String(value).split('::')[0]);
    return program?.majorTracks?.find(track => track.id === value)?.id || program?.majorTracks?.[0]?.id;
  }).filter(Boolean))];
  plan.minors = [...new Set(plan.minors.map(value => {
    const program = data.programs.find(program => program.slug === String(value).split('::')[0]);
    return program?.minorTracks?.find(track => track.id === value)?.id || program?.minorTracks?.[0]?.id;
  }).filter(Boolean))];
  plan.courses = plan.courses.filter(item => item && data.courses.some(course => course.code === item.code));
  savePlan();
  $('#courseOptions').innerHTML = data.courses.map(course => `<option value="${course.code}">${escapeHtml(course.title)}</option>`).join('');
}

function selectedCourseRecords() {
  const seen = new Set();
  // A crosslisted class earns credit once, even in an older saved plan.
  return plan.courses.slice().sort((a, b) => (a.status === 'completed' ? -1 : 0) - (b.status === 'completed' ? -1 : 0))
    .map(item => ({ ...item, course: data.courses.find(course => course.code === item.code) })).filter(item => {
      const identity = `${courseIdentity(item.code)}${item.course?.repeatable ? `::${item.term}` : ''}`;
      if (!item.course || seen.has(identity)) return false;
      seen.add(identity); return true;
    });
}

let identitySource;
let identityIndex;
function courseIdentity(code) {
  if (identitySource !== data) {
    identitySource = data;
    identityIndex = new Map(data.courses.map(course => [course.code, course.code]));
    const root = value => {
      while (identityIndex.get(value) && identityIndex.get(value) !== value) value = identityIndex.get(value);
      return value;
    };
    for (const course of data.courses) for (const alias of course.crosslistings || []) {
      if (identityIndex.has(alias)) identityIndex.set(root(alias), root(course.code));
    }
    for (const key of identityIndex.keys()) identityIndex.set(key, root(key));
  }
  return identityIndex.get(code) || code;
}

function alreadyPlanned(code, term, course) {
  if (!plan.courses.length) return false;
  course ||= data.courses.find(item => item.code === code);
  return plan.courses.some(item => courseIdentity(item.code) === courseIdentity(code) && (!course?.repeatable || item.term === term));
}

function controlCourse(element) {
  return plan.courses.find(item => item.code === element.dataset.code && item.term === element.dataset.courseTerm);
}

function moveCourse(item, term) {
  if (!item || item.term === term) return;
  if (alreadyPlanned(item.code, term)) {
    // Non-repeatable classes can move because this is their existing entry.
    const course = data.courses.find(course => course.code === item.code);
    if (course?.repeatable) { $('#plannerEntryMessage').textContent = 'That repeatable class is already in the destination semester.'; return; }
  }
  item.term = normalizeTerm(term); savePlan(); renderPlanner();
}

function allocateRequirements(records, groups) {
  const slots = groups.flatMap((group, index) => Array.from({ length: group.count }, () => ({ index, courses: new Set(group.courses.map(courseIdentity)) })));
  const matches = new Map();
  function assign(record, visited) {
    for (let i = 0; i < slots.length; i += 1) {
      if (visited.has(i) || !slots[i].courses.has(courseIdentity(record.code))) continue;
      visited.add(i);
      if (!matches.has(i) || assign(matches.get(i), visited)) { matches.set(i, record); return true; }
    }
    return false;
  }
  records.forEach(record => assign(record, new Set()));
  return groups.map((_, index) => [...matches.entries()].filter(([slot]) => slots[slot].index === index).map(([, record]) => record));
}

function auditGroups(groups = []) {
  const records = selectedCourseRecords();
  const completed = allocateRequirements(records.filter(record => record.status === 'completed'), groups);
  const planned = allocateRequirements(records, groups);
  return groups.map((group, index) => ({ rule: group.label,
    state: completed[index].length >= group.count ? 'met' : planned[index].length >= group.count ? 'scheduled' : 'needed',
    detail: `${completed[index].length}/${group.count} completed · ${planned[index].length}/${group.count} in plan`,
    matched: planned[index].map(item => item.code)
  }));
}

function divisionAssignment(courses) {
  const divisionRequirements = data.generalEducation.summary.filter(requirement => ['FA', 'SCI', 'SS', 'HU', 'I'].includes(requirement.id));
  const slots = divisionRequirements.flatMap(requirement => Array.from({ length: requirement.count }, (_, index) => ({ id: `${requirement.id}-${index}`, type: requirement.id })));
  const candidates = courses.filter(course => courseCredits(course) >= 4 && course.ge.some(tag => ['explicit', 'rule'].includes(tag.confidence) && ['FA', 'SCI', 'SS', 'HU', 'I'].includes(tag.id)));
  const matchBySlot = new Map();
  const usedSubjects = new Set();
  function tryAssign(course, visited) {
    const eligible = course.ge.filter(tag => ['explicit', 'rule'].includes(tag.confidence) && ['FA', 'SCI', 'SS', 'HU', 'I'].includes(tag.id)).map(tag => tag.id);
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
      matched = courses.filter(course => course.ge.some(tag => tag.id === requirement.id && ['explicit', 'rule'].includes(tag.confidence)));
      if (requirement.id === 'W') {
        const writingWorkshop = records.find(item => item.course.code === 'W 101');
        matched = writingWorkshop ? matched.filter(course => {
          const item = records.find(item => item.course.code === course.code);
          return SEMESTERS.findIndex(term => term.id === item.term) > SEMESTERS.findIndex(term => term.id === writingWorkshop.term);
        }) : [];
      }
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

function programCombinationWarnings() {
  const majors = selectedMajors();
  const minors = selectedMinors();
  const slugs = [...majors.map(item => item.program.slug), ...minors.map(item => item.slug)];
  const messages = [];
  if (slugs.length > 1) messages.push('Each program has its own checklist. Shared course options appear for every relevant program, but graduation credits count once. Shared options still need approval under each program’s rules.');
  if (slugs.filter(slug => slug === 'mathematics').length > 1) messages.push('Mathematics permits only one major or minor among its Mathematics and Applied Mathematics programs. Choose one.');
  if (slugs.includes('mathematics') && slugs.length > 1) messages.push('Mathematics requires unshared upper-level MATH courses: two for a minor, three for a BA, or four for a BS. Confirm which courses will be exclusive to Mathematics.');
  if (slugs.includes('data-analytics') && slugs.length > 1) messages.push('Data Analytics foundations, BS methods, and minor electives have restrictions on sharing with another major or minor elective. Shared suggestions are options until you assign their use.');
  if (slugs.includes('astronomy') && slugs.includes('physics')) messages.push('Physics upper-level electives cannot also satisfy the Astronomy minor.');
  if (slugs.includes('journalism') && (slugs.includes('communication') || slugs.includes('english'))) messages.push('The Journalism minor allows at most one shared course with a Communication or English major or minor.');
  if (slugs.includes('archaeology') && slugs.some(slug => ['ancient-greek-roman-studies', 'art-history-visual-culture', 'anthropology', 'earthandenvironmentalsciences'].includes(slug))) messages.push('For majors in an Archaeology core program, no more than one of the five additional Archaeology courses may count for both major and minor.');
  if (slugs.includes('middle-east-north-african-studies') && majors.length) messages.push('MENA permits no more than two courses to count toward the major.');
  if (slugs.includes('music-theatre')) messages.push('Music Theatre requirements change with a Music or Theatre major/minor combination. Use the applicable track in the full catalog wording.');
  return messages;
}

function selectedMinors() {
  return plan.minors.map(id => {
    const program = data.programs.find(program => program.slug === String(id).split('::')[0] && program.kinds.includes('minor'));
    let track = program?.minorTracks?.find(track => track.id === id) || program?.minorTracks?.[0];
    if (program?.slug === 'music-theatre') {
      const slugs = [...plan.majors, ...plan.minors].map(id => id.split('::')[0]);
      const index = slugs.includes('music') ? (slugs.includes('theatre') ? 3 : 2) : slugs.includes('theatre') ? 1 : 0;
      track = program.minorTracks[index];
    }
    return track ? { ...program, selectionId: id, minorTrack: track,
      name: track.label === 'Minor' ? program.name : `${program.name} — ${track.label}`,
      minorCourses: track.courses, minorText: track.text, minorRequiredCourseCount: track.requiredCourseCount } : null;
  }).filter(Boolean);
}

function programCourses(kind, program, track) {
  if (!program) return [];
  if (kind === 'major') return track?.courses || program.majorTracks?.[0]?.courses || program.referencedCourses;
  return program.minorCourses?.length ? program.minorCourses : program.referencedCourses;
}

function directProgramMatches(kind, program, track) {
  if (!program) return [];
  const selectedCodes = new Set(plan.courses.map(item => courseIdentity(item.code)));
  return programCourses(kind, program, track).filter(code => selectedCodes.has(courseIdentity(code)));
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
  if (!course.prerequisites) return { state: course.corequisites ? 'review' : 'none', missing: [], codes: [] };
  const codes = [...new Set([...course.prerequisites.matchAll(/\b[A-Z]{2,6}\s+\d{3}[A-Z]?\b/g)].map(match => match[0]))];
  if (!codes.length) return { state: 'review', missing: [], codes: [] };
  const chosenTerm = targetTerm || (typeof document !== 'undefined' ? $('#plannerCourseTerm')?.value : '') || SEMESTERS[0].id;
  const targetIndex = SEMESTERS.findIndex(semester => semester.id === normalizeTerm(chosenTerm));
  const available = new Set(plan.courses.filter(item => item.code !== course.code && (item.status === 'completed' || SEMESTERS.findIndex(semester => semester.id === normalizeTerm(item.term)) < targetIndex)).map(item => courseIdentity(item.code)));
  const text = course.prerequisites.replace(/\.$/, '').trim();
  const residual = text.replace(/\b[A-Z]{2,6}\s+\d{3}[A-Z]?\b/g, '').replace(/\b(?:and|or|both|either)\b/gi, '').replace(/[\s(),.]/g, '');
  // Do not treat one successful branch as satisfying a mixed AND/OR expression.
  // Narrative prerequisites (standing, permission, grade, placement) need review.
  const mixed = /\band\b/i.test(text) && /\bor\b/i.test(text);
  const eitherBoth = /^either\s+([A-Z]{2,6}\s+\d{3})\s+or\s+both\s+([A-Z]{2,6}\s+\d{3})\s+and\s+([A-Z]{2,6}\s+\d{3})$/i.exec(text);
  if (residual || (mixed && !eitherBoth) || course.corequisites) return { state: 'review', missing: codes.filter(code => !available.has(courseIdentity(code))), codes };
  const has = code => available.has(courseIdentity(code));
  const met = eitherBoth ? has(eitherBoth[1]) || (has(eitherBoth[2]) && has(eitherBoth[3])) : /\bor\b/i.test(text) ? codes.some(has) : codes.every(has);
  return { state: met ? 'met' : 'missing', missing: codes.filter(code => !has(code)), codes };
}

function recommendationData() {
  const selectedCodes = new Set(plan.courses.map(item => courseIdentity(item.code)));
  const progress = geProgress();
  const unmet = new Set(progress.filter(requirement => !requirement.planComplete).map(requirement => requirement.id));
  if (progress.some(requirement => requirement.needsLab)) unmet.add('LAB');
  const majors = selectedMajors();
  const minors = selectedMinors();
  const term = (typeof document !== 'undefined' ? $('#plannerCourseTerm')?.value : '') || SEMESTERS[0].id;
  return data.courses.filter(course => !alreadyPlanned(course.code, term, course)).map(course => {
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

function courseCreditRange(course) {
  const amounts = (String(course?.credits || '').match(/(?:\d*\.)?\d+/g) || ['0']).map(Number);
  return { min: amounts[0], max: amounts[1] ?? amounts[0] };
}

function courseCredits(course, selectedCredits) {
  const { min, max } = courseCreditRange(course);
  return selectedCredits == null || !Number.isFinite(Number(selectedCredits)) ? min : Math.max(min, Math.min(max, Number(selectedCredits)));
}

function renderPlanner() {
  const majors = selectedMajors();
  const minors = selectedMinors();
  $('#plannerMajor').value = '';
  $('#plannerMinor').value = '';
  const printPrograms = [...majors.map(({ program, track }) => `${program.name}${track.label === 'Major' ? '' : ` — ${track.label}`}`), ...minors.map(program => `${program.name} minor`)];
  $('#printMeta').textContent = `${printPrograms.join(' · ') || 'No major or minor selected'} · Printed ${new Date().toLocaleDateString()}`;
  $('#selectedPrograms').innerHTML = printPrograms.length ? `${majors.map(({ program, track }) => `<span class="selected-program-chip"><b>Major</b>${escapeHtml(track.label === 'Major' ? program.name : `${program.name} — ${track.label}`)}<button data-remove-major="${escapeHtml(track.id)}" aria-label="Remove ${escapeHtml(program.name)} major">×</button></span>`).join('')}${minors.map(program => `<span class="selected-program-chip"><b>Minor</b>${escapeHtml(program.name)}<button data-remove-minor="${program.selectionId}" aria-label="Remove ${escapeHtml(program.name)} minor">×</button></span>`).join('')}` : '<p>Choose one or more majors and minors.</p>';
  $('#programPlanNotes').innerHTML = programCombinationWarnings().map(message => `<p>${escapeHtml(message)}</p>`).join('');
  const selected = selectedCourseRecords();
  const statusLabel = status => status === 'current' ? 'In progress' : status === 'completed' ? 'Completed' : 'Planned';
  const semesterCell = semester => {
    const termCourses = selected.filter(item => normalizeTerm(item.term) === semester.id);
    const credits = termCourses.reduce((total, item) => total + courseCredits(item.course, item.credits), 0);
    const coursesHtml = termCourses.map(item => { const prerequisite = prerequisiteStatus(item.course, semester.id); return `<div class="semester-course" draggable="true" data-code="${item.code}" data-course-term="${item.term}">
        <div class="semester-course-top"><div><strong>${item.course.code}</strong><span>${escapeHtml(item.course.title)}</span></div><button class="remove-course" data-action="remove-course" data-code="${item.code}" data-course-term="${item.term}" aria-label="Remove ${item.code}">×</button></div>
        <div class="semester-course-controls"><button class="status-toggle ${item.status}" data-action="toggle-status" data-code="${item.code}" data-course-term="${item.term}">${statusLabel(item.status)}</button><label><span>Move to</span><select data-action="move-term" data-code="${item.code}" data-course-term="${item.term}" aria-label="Move ${item.code} to another semester">${semesterOptions(semester.id)}</select></label>${courseCreditRange(item.course).min !== courseCreditRange(item.course).max ? `<label><span>Credits</span><input type="number" min="${courseCreditRange(item.course).min}" max="${courseCreditRange(item.course).max}" step="${courseCreditRange(item.course).min % 1 ? '.5' : '1'}" value="${courseCredits(item.course, item.credits)}" data-action="course-credits" data-code="${item.code}" data-course-term="${item.term}" aria-label="Credits for ${item.code}"></label>` : ''}</div>
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
  const completedCourseCredits = selected.filter(item => item.status === 'completed').reduce((totalCredits, item) => totalCredits + courseCredits(item.course, item.credits), 0);
  const activeCourseCredits = selected.filter(item => item.status !== 'completed').reduce((totalCredits, item) => totalCredits + courseCredits(item.course, item.credits), 0);
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
    ...minors.map(program => ({ kind: 'minor', program, track: program.minorTrack, label: program.name, courses: programCourses('minor', program) }))
  ];
  $('#programProgress').innerHTML = programs.length ? programs.map(({ kind, program, track, label, courses }) => {
    const matches = directProgramMatches(kind, program, track);
    const selectedCodes = new Set(plan.courses.map(item => courseIdentity(item.code)));
    const requirementText = kind === 'major' ? track?.text : program.minorText;
    const requiredCount = kind === 'major' ? track?.requiredCourseCount : program.minorRequiredCourseCount;
    const statusCounts = { completed: 0, current: 0, planned: 0 };
    selectedCourseRecords().filter(item => courseCredits(item.course) > 0 && new Set(courses.map(courseIdentity)).has(courseIdentity(item.code))).forEach(item => { statusCounts[item.status] += 1; });
    const highlights = requirementHighlights(requirementText || program.requirementsText);
    const checklist = [...auditGroups(track?.auditGroups), ...highlights.map(rule => ({ rule, ...programAuditRule(rule) }))];
    const target = requiredCount || Math.max(1, courses.length);
    const coveredCount = statusCounts.completed + statusCounts.current + statusCounts.planned;
    const coveragePercent = Math.min(100, Math.round((coveredCount / target) * 100));
    const courseItems = courses.map(code => {
      const course = data.courses.find(item => item.code === code);
      const selectedItem = plan.courses.find(item => courseIdentity(item.code) === courseIdentity(code));
      return `<li class="${selectedItem ? `covered ${selectedItem.status}` : ''}"><span>${selectedItem?.status === 'completed' ? '✓' : selectedItem ? '◐' : '○'}</span><b>${code}</b>${course ? `<small>${escapeHtml(course.title)}</small>` : ''}</li>`;
    }).join('');
    return `<article class="program-progress-card" role="button" tabindex="0" data-program="${program.slug}" data-kind="${kind}" data-track="${escapeHtml(track?.id || '')}" aria-label="Open personalized requirements for ${escapeHtml(label)}"><div><span class="program-chip">${kind}</span><strong>${escapeHtml(label)}</strong><span class="open-audit">Open audit →</span></div><p><b>${statusCounts.completed} completed</b> · ${statusCounts.current} in progress · ${statusCounts.planned} planned${requiredCount ? ` toward a catalog minimum of ${requiredCount} courses` : ` across ${courses.length} catalog course options`}.</p><div class="mini-progress" aria-label="${coveragePercent}% of course-option count represented in plan"><span style="width:${coveragePercent}%"></span></div>
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
  const titleMatches = data.courses.filter(item => item.title.toLowerCase() === raw.toLowerCase());
  const course = data.courses.find(item => item.code === normalized) || data.courses.find(item => `${item.code} — ${item.title}`.toLowerCase() === raw.toLowerCase()) || (titleMatches.length === 1 ? titleMatches[0] : null);
  if (!course && titleMatches.length > 1) { $('#plannerEntryMessage').textContent = 'More than one course has that title. Choose its course code.'; return; }
  if (!course) { $('#plannerEntryMessage').textContent = 'Choose a course code from the catalog list.'; return; }
  const term = normalizeTerm(termOverride || $('#plannerCourseTerm').value);
  if (alreadyPlanned(course.code, term)) { $('#plannerEntryMessage').textContent = `${course.code} or its crosslisted equivalent is already in your plan${course.repeatable ? ' in this semester' : ''}.`; return; }
  plan.courses.push({ code: course.code, status: codeOverride ? 'planned' : $('#plannerCourseStatus').value, term });
  input.value = '';
  $('#plannerEntryMessage').textContent = `${course.code} added.`;
  savePlan();
  renderPlanner();
}

function bindPlannerResultEvents() {
  $$('[data-remove-major]').forEach(button => button.addEventListener('click', () => { plan.majors = plan.majors.filter(id => id !== button.dataset.removeMajor); savePlan(); renderPlanner(); }));
  $$('[data-remove-minor]').forEach(button => button.addEventListener('click', () => { plan.minors = plan.minors.filter(id => id !== button.dataset.removeMinor); savePlan(); renderPlanner(); }));
  $$('[data-action="remove-course"]').forEach(button => button.addEventListener('click', () => {
    const item = controlCourse(button);
    plan.courses = plan.courses.filter(record => record !== item); savePlan(); renderPlanner();
  }));
  $$('[data-action="toggle-status"]').forEach(button => button.addEventListener('click', () => {
    const item = controlCourse(button);
    item.status = item.status === 'completed' ? 'current' : item.status === 'current' ? 'planned' : 'completed'; savePlan(); renderPlanner();
  }));
  $$('[data-action="move-term"]').forEach(select => select.addEventListener('change', () => {
    moveCourse(controlCourse(select), select.value);
  }));
  $$('[data-action="course-credits"]').forEach(input => input.addEventListener('change', () => {
    if (!input.reportValidity()) return;
    const item = controlCourse(input);
    item.credits = courseCredits(data.courses.find(course => course.code === item.code), input.value);
    savePlan(); renderPlanner();
  }));
  $$('.semester-course').forEach(card => card.addEventListener('dragstart', event => {
    event.dataTransfer.setData('text/plain', JSON.stringify({ code: card.dataset.code, term: card.dataset.courseTerm }));
    event.dataTransfer.effectAllowed = 'move';
  }));
  $$('.semester-dropzone').forEach(zone => {
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      try {
        const value = JSON.parse(event.dataTransfer.getData('text/plain'));
        moveCourse(plan.courses.find(item => item.code === value.code && item.term === value.term), zone.dataset.term);
      } catch (_) { /* Ignore unrelated drag content. */ }
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
  const alreadyAdded = alreadyPlanned(course.code, $('#plannerCourseTerm').value);
  $('#courseDialogBody').innerHTML = `<span class="dialog-code">${course.code} · ${escapeHtml(course.credits)}</span><h2 class="dialog-title">${escapeHtml(course.title)}</h2><p class="dialog-copy">${escapeHtml(course.description)}</p>
  ${course.details ? `<p class="dialog-copy"><strong>Catalog details</strong><br>${escapeHtml(course.details).replace(/\n/g, '<br>')}</p>` : ''}
  <h3>What it may fulfill</h3><div class="fulfillment-list">${course.ge.length ? course.ge.map(tag => `<div class="fulfillment"><strong>${escapeHtml(tag.label)}</strong><small>${escapeHtml(tag.evidence)} · ${tag.confidence}</small></div>`).join('') : '<p>No GE mapping was found in the catalog text.</p>'}</div>
  <h3>Referenced by program requirements</h3>${course.programReferences.length ? `<ul class="program-links">${course.programReferences.map(reference => `<li><strong>${escapeHtml(reference.program)}</strong><br>${escapeHtml(reference.section)}</li>`).join('')}</ul>` : '<p>No direct program reference was found. Broad elective rules may still apply.</p>'}
  <div class="dialog-actions"><button id="dialogAddCourse" class="primary-button" ${alreadyAdded ? 'disabled' : ''}>${alreadyAdded ? 'Already in plan' : 'Add to my plan'}</button><a href="${course.sourceUrl}" target="_blank" rel="noreferrer">Open official catalog page ↗</a></div>`;
  $('#courseDialog').showModal();
  $('#dialogAddCourse').addEventListener('click', () => { addCourseFromInput(course.code); $('#courseDialog').close(); });
}

function programAuditRule(rule) {
  // Prose may contain exclusions, examples, GPA thresholds or partial rules.
  // Only the curated auditGroups may produce an automatic completion result.
  return { state: 'review', detail: 'Review this catalog rule with your advisor' };
}

function programAuditContext(program, preferredKind, trackId) {
  const selectedMajor = selectedMajors().find(item => item.program.slug === program.slug);
  const selectedMinor = selectedMinors().find(item => item.slug === program.slug);
  let kind = preferredKind;
  if (!kind) kind = selectedMajor ? 'major' : selectedMinor ? 'minor' : program.kinds.includes('major') ? 'major' : 'minor';
  let track = null;
  if (kind === 'major') track = program.majorTracks.find(item => item.id === trackId) || selectedMajor?.track || program.majorTracks[0];
  if (kind === 'minor') track = program.minorTracks.find(item => item.id === trackId) || selectedMinor?.minorTrack || program.minorTracks[0];
  const pool = track?.courses || [];
  const text = track?.text || program.requirementsText;
  const requiredCount = track?.requiredCourseCount;
  return { kind, track, pool, text, requiredCount };
}

function renderProgram(slug, preferredKind, trackId) {
  const program = data.programs.find(item => item.slug === slug); if (!program) return;
  const context = programAuditContext(program, preferredKind, trackId);
  $('#programSelect').value = slug;
  const modes = [
    ...program.majorTracks.map(track => ({ kind: 'major', id: track.id, label: track.label === 'Major' ? 'Major' : track.label })),
    ...program.minorTracks.map(track => ({ kind: 'minor', id: track.id, label: track.label }))
  ];
  $('#programSummary').innerHTML = `<div>${program.kinds.map(kind => `<span class="program-chip">${kind}</span>`).join('')}</div><p class="program-meta">Choose a program version to see how your saved plan maps to its current catalog rules.</p><div class="program-mode-list">${modes.map(mode => `<button class="program-mode ${context.kind === mode.kind && context.track?.id === mode.id ? 'active' : ''}" data-program-mode="${mode.kind}" data-track-id="${escapeHtml(mode.id)}">${escapeHtml(mode.label)}</button>`).join('')}</div>${program.catalogOnlyReferences?.length ? `<p class="program-meta"><b>Not in the current course index:</b> ${escapeHtml(program.catalogOnlyReferences.join(', '))}</p>` : ''}`;

  const identities = new Set(context.pool.map(courseIdentity));
  const selectedItems = selectedCourseRecords().filter(item => identities.has(courseIdentity(item.code)));
  const counts = { completed: 0, current: 0, planned: 0 };
  const creditBearingItems = selectedItems.filter(item => courseCredits(item.course) > 0);
  creditBearingItems.forEach(item => { counts[item.status] += 1; });
  const remainingCount = context.requiredCount == null ? null : Math.max(0, context.requiredCount - creditBearingItems.length);
  const rules = [...auditGroups(context.track?.auditGroups), ...requirementHighlights(context.text).map(rule => ({ rule, ...programAuditRule(rule) }))];
  const ruleList = rules.length ? rules.map(item => `<li class="audit-rule ${item.state}"><span>${item.state === 'met' ? '✓' : item.state === 'scheduled' ? '◐' : item.state === 'needed' ? '○' : '?'}</span><div><b>${escapeHtml(item.rule)}</b><small>${escapeHtml(item.detail)}</small></div></li>`).join('') : '<li class="audit-rule review"><span>?</span><div><b>No machine-readable rule summary was available.</b><small>Use the official wording below and confirm with your advisor.</small></div></li>';
  const checklistOrder = { completed: 0, current: 1, planned: 2, unplanned: 3 };
  const courseChecklist = context.pool.map(code => {
    const course = data.courses.find(item => item.code === code);
    if (!course) return null;
    const selectedItem = plan.courses.find(item => courseIdentity(item.code) === courseIdentity(code));
    const state = selectedItem?.status || 'unplanned';
    const icon = state === 'completed' ? '✓' : state === 'current' ? '◐' : state === 'planned' ? '◆' : '□';
    const label = state === 'completed' ? 'Completed' : state === 'current' ? 'In progress' : state === 'planned' ? 'Planned' : 'Not scheduled';
    return { course, state, icon, label };
  }).filter(Boolean).sort((a, b) => checklistOrder[a.state] - checklistOrder[b.state] || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
  const checklistHtml = courseChecklist.map(item => `<li class="program-course-item ${item.state}"><span class="course-check-icon">${item.icon}</span><button data-audit-course="${item.course.code}"><b>${item.course.code}</b><span>${escapeHtml(item.course.title)}</span></button><small>${item.label}</small>${item.state === 'unplanned' ? `<button class="audit-add" data-add-code="${item.course.code}">+ Add</button>` : ''}</li>`).join('');
  const checklistTarget = context.requiredCount || context.pool.length || 1;
  const checklistPercent = Math.min(100, Math.round((creditBearingItems.length / checklistTarget) * 100));
  const title = context.track && !['Major', 'Minor'].includes(context.track.label) ? `${program.name} — ${context.track.label}` : `${program.name} ${context.kind}`;
  $('#programDetail').innerHTML = `<div class="audit-heading"><p class="eyebrow">Personalized program audit</p><h2>${escapeHtml(title)}</h2><p><b>${counts.completed} completed</b> · ${counts.current} in progress · ${counts.planned} planned${remainingCount == null ? '' : ` · ${remainingCount} more course option${remainingCount === 1 ? '' : 's'} to reach the catalog count`}</p></div>
    <section class="audit-section"><h3>Requirement checklist</h3><p>Checkable course groups use each class once. Course-option totals do not establish that all requirements are complete.</p><ul class="audit-rules">${ruleList}</ul><p>${escapeHtml((context.track?.reviewNotes || []).join(' '))}</p></section>
    <section class="audit-section program-course-checklist"><div class="course-checklist-heading"><div><h3>Course checklist</h3><p>Every current course named or included by a catalog rule is shown here. Some entries are alternatives, electives, or prerequisite pathways—not classes every student must take.</p></div><b>${checklistPercent}% of course-option count</b></div><div class="mini-progress"><span style="width:${checklistPercent}%"></span></div><div class="checklist-legend"><span class="completed">✓ Completed</span><span class="current">◐ In progress</span><span class="planned">◆ Planned</span><span class="unplanned">□ Not scheduled</span></div><ul>${checklistHtml || '<li class="empty-audit">No current course codes were identified for this program.</li>'}</ul></section>
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
  const selectedCodes = new Set(plan.courses.map(item => courseIdentity(item.code)));
  const majors = selectedMajors();
  const minors = selectedMinors();
  const unmetGe = new Set(geProgress().filter(requirement => !requirement.planComplete).map(requirement => requirement.id));
  return data.courses.filter(course => !alreadyPlanned(course.code, term, course) && (!subject || course.subject === subject) && (!level || course.number.startsWith(level))).map(course => {
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
  $$('.tab').forEach(tab => tab.addEventListener('click', () => { switchView(tab.dataset.view); if (tab.dataset.view === 'electives') renderElectives(); }));
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
    const match = minorChoices().find(choice => choice.label.toLowerCase() === value.toLowerCase());
    input.setCustomValidity(value && !match ? 'Choose a minor from the catalog suggestions.' : '');
    if (!match) { input.reportValidity(); return; }
    plan.minors = [...plan.minors.filter(id => id.split('::')[0] !== match.slug), match.id];
    savePlan(); renderPlanner();
  };
  $('#addMajor').addEventListener('click', addMajor);
  $('#plannerMajor').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addMajor(); } });
  $('#plannerMinor').addEventListener('input', event => {
    const value = event.target.value.trim();
    const match = minorChoices().find(choice => choice.label.toLowerCase() === value.toLowerCase());
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
    auditGroups,
    courseIdentity,
    selectedCourseRecords,
    selectedMajors,
    selectedMinors,
    programCourses,
    programCombinationWarnings,
    electiveData,
    divisionAssignment,
    requirementHighlights,
    feedbackIssueUrl,
    normalizeTerm,
    SEMESTERS
  };
}
