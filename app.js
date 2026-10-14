let data;
let visibleLimit = 30;
const STORAGE_KEY = 'denisonPathwaysPlanV1';
let plan = { major: '', minor: '', courses: [] };
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
    if (saved && Array.isArray(saved.courses)) plan = {
      major: saved.major || '',
      minor: saved.minor || '',
      courses: saved.courses.map(item => ({ ...item, term: normalizeTerm(item.term) }))
    };
  } catch (_) { /* Ignore damaged browser-local state. */ }
}

function savePlan() { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); }

function normalizeTerm(term) {
  return SEMESTERS.some(semester => semester.id === term) ? term : SEMESTERS[0].id;
}

function semesterOptions(selected) {
  return SEMESTERS.map(semester => `<option value="${semester.id}" ${semester.id === selected ? 'selected' : ''}>${semester.year} · ${semester.season}</option>`).join('');
}

async function init() {
  const response = await fetch('data/denison-2026-2027.json');
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
  renderCourses();
  renderGe();
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

function fillFilters() {
  const ge = [...data.generalEducation.summary, ...data.generalEducation.overlays, { id: 'LAB', label: 'Science laboratory' }];
  $('#geFilter').innerHTML += ge.map(requirement => `<option value="${requirement.id}">${requirement.label}</option>`).join('');
  const allPrograms = data.programs.filter(program => program.kinds.length).map(program => `<option value="${program.slug}">${escapeHtml(program.name)}</option>`).join('');
  $('#programFilter').innerHTML += allPrograms;
  $('#programSelect').innerHTML = allPrograms;
  $('#plannerMajor').innerHTML = '<option value="">Choose a major and degree</option>' + majorOptions();
  $('#plannerMinorOptions').innerHTML = data.programs.filter(program => program.kinds.includes('minor')).map(program => `<option value="${escapeHtml(program.name)}"></option>`).join('');
  $('#plannerCourseTerm').innerHTML = semesterOptions(SEMESTERS[0].id);
  if (plan.major && !plan.major.includes('::')) {
    const savedProgram = data.programs.find(program => program.slug === plan.major);
    plan.major = savedProgram?.majorTracks?.[0]?.id || '';
    savePlan();
  }
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

function geProgress() {
  const courses = selectedCourseRecords().map(item => item.course);
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

function selectedProgram(kind) {
  const slug = kind === 'major' ? plan.major.split('::')[0] : plan.minor;
  return slug ? data.programs.find(program => program.slug === slug) : null;
}

function selectedMajorTrack() {
  const program = selectedProgram('major');
  if (!program) return null;
  return program.majorTracks?.find(track => track.id === plan.major) || program.majorTracks?.[0] || null;
}

function programCourses(kind, program) {
  if (!program) return [];
  if (kind === 'major') return selectedMajorTrack()?.courses || program.referencedCourses;
  return program.minorCourses?.length ? program.minorCourses : program.referencedCourses;
}

function directProgramMatches(kind, program) {
  if (!program) return [];
  const selectedCodes = new Set(plan.courses.map(item => item.code));
  return programCourses(kind, program).filter(code => selectedCodes.has(code));
}

function requirementHighlights(text = '') {
  const lines = text.split(/\n+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const courseLine = /^(?:[A-Z]{2,6}\s+\d{3}[A-Z-]*\b|Course List\b|Code\s+Title\b|Credits?\b)/i;
  const ruleWords = /\b(?:must|required|requires|requirement|complete|minimum|electives?|at least|no more than|one course|two courses|three courses|four courses|five courses|six courses|credit hours?)\b/i;
  const seen = new Set();
  return lines.filter(line => !courseLine.test(line) && ruleWords.test(line)).map(line => line.length > 180 ? `${line.slice(0, 177)}…` : line).filter(line => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function recommendationData() {
  const selectedCodes = new Set(plan.courses.map(item => item.code));
  const progress = geProgress();
  const unmet = new Set(progress.filter(requirement => !requirement.complete).map(requirement => requirement.id));
  if (progress.some(requirement => requirement.needsLab)) unmet.add('LAB');
  const major = selectedProgram('major');
  const majorTrack = selectedMajorTrack();
  const minor = selectedProgram('minor');
  return data.courses.filter(course => !selectedCodes.has(course.code)).map(course => {
    const reasons = [];
    let score = 0;
    const majorMatch = major && programCourses('major', major).includes(course.code);
    const minorMatch = minor && programCourses('minor', minor).includes(course.code);
    const majorReference = majorMatch ? course.programReferences.find(reference => reference.slug === major.slug) : null;
    const minorReference = minorMatch ? course.programReferences.find(reference => reference.slug === minor.slug) : null;
    if (majorMatch) { score += 8; reasons.push({ label: majorTrack?.label === 'Major' ? major.name : `${major.name} — ${majorTrack?.label}`, type: 'major', detail: majorReference?.section || majorTrack?.label || 'Major requirements' }); }
    if (minorMatch) { score += 7; reasons.push({ label: minor.name, type: 'minor', detail: minorReference?.section || 'Minor requirements' }); }
    for (const tag of course.ge.filter(item => unmet.has(item.id))) {
      score += ['explicit', 'rule'].includes(tag.confidence) ? 5 : tag.confidence === 'conditional' ? 3 : 1;
      reasons.push({ label: tag.label, type: tag.confidence, detail: tag.evidence });
    }
    if (/\b4\b/.test(course.credits)) score += 0.25;
    if (course.prerequisites) score -= 0.25;
    return { course, reasons, score };
  }).filter(item => item.score > 2.5).sort((a, b) => b.score - a.score || b.reasons.length - a.reasons.length || a.course.code.localeCompare(b.course.code, undefined, { numeric: true }));
}

function renderPlanner() {
  $('#plannerMajor').value = plan.major;
  $('#plannerMinor').value = selectedProgram('minor')?.name || '';
  const selected = selectedCourseRecords();
  const statusLabel = status => status === 'current' ? 'In progress' : status === 'completed' ? 'Completed' : 'Planned';
  $('#selectedCourses').innerHTML = SEMESTERS.map(semester => {
    const termCourses = selected.filter(item => normalizeTerm(item.term) === semester.id);
    const credits = termCourses.reduce((total, item) => total + (Number.parseFloat(item.course.credits) || 0), 0);
    return `<article class="semester-column">
      <header><div><span>${semester.year}</span><h4>${semester.season}</h4></div><b>${termCourses.length} ${termCourses.length === 1 ? 'class' : 'classes'}${credits ? ` · ${credits} credits` : ''}</b></header>
      <div class="semester-dropzone ${termCourses.length ? '' : 'empty'}" data-term="${semester.id}">${termCourses.length ? termCourses.map(item => `<div class="semester-course" draggable="true" data-code="${item.code}">
        <div class="semester-course-top"><div><strong>${item.course.code}</strong><span>${escapeHtml(item.course.title)}</span></div><button class="remove-course" data-action="remove-course" data-code="${item.code}" aria-label="Remove ${item.code}">×</button></div>
        <div class="semester-course-controls"><button class="status-toggle ${item.status}" data-action="toggle-status" data-code="${item.code}">${statusLabel(item.status)}</button><label><span>Move to</span><select data-action="move-term" data-code="${item.code}" aria-label="Move ${item.code} to another semester">${semesterOptions(semester.id)}</select></label></div>
      </div>`).join('') : '<p>Drop or add classes here</p>'}</div>
    </article>`;
  }).join('');

  const progress = geProgress();
  const met = progress.reduce((sum, requirement) => sum + requirement.countMet, 0);
  const total = progress.reduce((sum, requirement) => sum + requirement.count, 0);
  $('#coverageSummary').textContent = `${met} of ${total} GE slots covered`;
  $('#progressCards').innerHTML = progress.map(requirement => `<button type="button" class="progress-card ${requirement.complete ? 'complete' : ''}" data-ge-id="${requirement.needsLab ? 'LAB' : requirement.id}" aria-label="Show classes that fulfill ${escapeHtml(requirement.label)}">
    <div class="progress-icon">${requirement.complete ? '✓' : `${requirement.countMet}/${requirement.count}`}</div>
    <div><strong>${escapeHtml(requirement.label)}</strong><small>${requirement.complete ? 'Covered' : requirement.needsLab ? 'Lab science still needed' : `${requirement.count - requirement.countMet} remaining`}${requirement.matched.length ? ` · ${requirement.matched.map(course => course.code).join(', ')}` : ''}</small><span class="progress-action">See matching classes →</span></div>
  </button>`).join('');

  const majorProgram = selectedProgram('major');
  const majorTrack = selectedMajorTrack();
  const programs = [
    majorProgram ? { kind: 'major', program: majorProgram, label: majorTrack?.label === 'Major' ? majorProgram.name : `${majorProgram.name} — ${majorTrack?.label}`, courses: programCourses('major', majorProgram) } : null,
    selectedProgram('minor') ? { kind: 'minor', program: selectedProgram('minor'), label: selectedProgram('minor').name, courses: programCourses('minor', selectedProgram('minor')) } : null
  ].filter(Boolean);
  $('#programProgress').innerHTML = programs.length ? programs.map(({ kind, program, label, courses }) => {
    const matches = directProgramMatches(kind, program);
    const selectedCodes = new Set(plan.courses.map(item => item.code));
    const requirementText = kind === 'major' ? selectedMajorTrack()?.text : program.minorText;
    const highlights = requirementHighlights(requirementText || program.requirementsText);
    const courseItems = courses.map(code => {
      const course = data.courses.find(item => item.code === code);
      const covered = selectedCodes.has(code);
      return `<li class="${covered ? 'covered' : ''}"><span>${covered ? '✓' : '○'}</span><b>${code}</b>${course ? `<small>${escapeHtml(course.title)}</small>` : ''}</li>`;
    }).join('');
    return `<article><div><span class="program-chip">${kind}</span><strong>${escapeHtml(label)}</strong></div><p><b>${matches.length}</b> of ${courses.length} named course options are in your plan.</p>
      <div class="compact-requirements"><h4>Requirement summary</h4>${highlights.length ? `<ul class="rule-summary">${highlights.map(rule => `<li>${escapeHtml(rule)}</li>`).join('')}</ul>` : '<p class="no-rules">See the complete catalog wording for category and elective rules.</p>'}
      <details><summary>All named courses and options (${courses.length})</summary><ul class="named-course-list">${courseItems || '<li>No specific course codes are named.</li>'}</ul></details></div>
      <small>Named courses can include alternatives; use the catalog wording above and confirm your plan with your advisor.</small><button class="view-program-button" data-program="${program.slug}">View full requirements</button></article>`;
  }).join('') : '<div class="program-empty">Choose a preferred major or minor to add program-specific recommendations.</div>';

  const recommendations = recommendationData();
  $('#recommendationCount').textContent = `${recommendations.length} options found`;
  $('#recommendations').innerHTML = recommendations.slice(0, 18).map(({ course, reasons }) => `<article class="recommendation-card" data-code="${course.code}">
    <div class="recommendation-top"><div><span>${course.code}</span><h4>${escapeHtml(course.title)}</h4></div><button class="quick-add" data-add-code="${course.code}">+ Add</button></div>
    <div class="tag-row">${reasons.slice(0, 5).map(reason => `<span class="tag ${reason.type}" title="${escapeHtml(reason.detail)}">${escapeHtml(reason.label)}</span>`).join('')}</div>
    ${course.prerequisites ? `<p class="prereq-note"><strong>Prerequisites:</strong> ${escapeHtml(course.prerequisites.slice(0, 150))}${course.prerequisites.length > 150 ? '…' : ''}</p>` : ''}
  </article>`).join('') || '<div class="empty-plan"><strong>Add a program or more completed classes.</strong><span>Recommendations appear when the planner can identify unmet requirements.</span></div>';
  bindPlannerResultEvents();
}

function addCourseFromInput(codeOverride) {
  const input = $('#plannerCourseInput');
  const raw = codeOverride || input.value.trim();
  const normalized = raw.toUpperCase().match(/^[A-Z]{1,6}\s*\d{3}[A-Z-]*$/)?.[0].replace(/([A-Z])(?=\d)/, '$1 ').replace(/\s+/, ' ');
  const course = data.courses.find(item => item.code === normalized) || data.courses.find(item => `${item.code} — ${item.title}`.toLowerCase() === raw.toLowerCase());
  if (!course) { $('#plannerEntryMessage').textContent = 'Choose a course code from the catalog list.'; return; }
  if (plan.courses.some(item => item.code === course.code)) { $('#plannerEntryMessage').textContent = `${course.code} is already in your plan.`; return; }
  plan.courses.push({ code: course.code, status: codeOverride ? 'planned' : $('#plannerCourseStatus').value, term: normalizeTerm($('#plannerCourseTerm').value) });
  input.value = '';
  $('#plannerEntryMessage').textContent = `${course.code} added.`;
  savePlan();
  renderPlanner();
}

function bindPlannerResultEvents() {
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
  $$('.recommendation-card').forEach(card => card.addEventListener('click', () => openCourse(card.dataset.code)));
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
  $$('.view-program-button').forEach(button => button.addEventListener('click', () => { switchView('programs'); renderProgram(button.dataset.program); }));
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
  $('#courseResults').innerHTML = courses.slice(0, visibleLimit).map(course => `<article class="course-card" data-code="${course.code}">
    <div class="course-code">${course.code}</div><div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description.slice(0, 180))}${course.description.length > 180 ? '…' : ''}</p>
    <div class="tag-row">${course.ge.slice(0, 5).map(tag => `<span class="tag ${tag.confidence}">${escapeHtml(tag.label)}</span>`).join('')}${course.programReferences.length ? `<span class="tag">${course.programReferences.length} program ${course.programReferences.length === 1 ? 'match' : 'matches'}</span>` : ''}</div></div>
    <span class="credits">${escapeHtml(course.credits)}</span></article>`).join('') || '<p>No courses match those filters.</p>';
  $('#showMore').hidden = courses.length <= visibleLimit;
  $$('.course-card').forEach(card => card.addEventListener('click', () => openCourse(card.dataset.code)));
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

function renderProgram(slug) {
  const program = data.programs.find(item => item.slug === slug); if (!program) return;
  $('#programSelect').value = slug;
  $('#programSummary').innerHTML = `<div>${program.kinds.map(kind => `<span class="program-chip">${kind}</span>`).join('')}</div><p class="program-meta">${program.referencedCourses.length} specific course codes appear in this requirements page. Category rules such as “three 300-level electives” remain in the official text.</p>`;
  $('#programDetail').innerHTML = `<h2>${escapeHtml(program.name)}</h2><pre>${escapeHtml(program.requirementsText || 'No dedicated requirements text was published on this catalog page.')}</pre><a href="${program.sourceUrl}" target="_blank" rel="noreferrer">Open official requirements ↗</a>`;
}

function renderGe() {
  const cards = items => items.map(requirement => `<article class="requirement"><strong>${requirement.count}</strong><div><span>${escapeHtml(requirement.label)}</span>${requirement.note ? `<small>${escapeHtml(requirement.note)}</small>` : ''}</div></article>`).join('');
  $('#geSummary').innerHTML = cards(data.generalEducation.summary); $('#geOverlays').innerHTML = cards(data.generalEducation.overlays);
  $('#geRules').innerHTML = data.generalEducation.rules.map(rule => `<li>${escapeHtml(rule)}</li>`).join(''); $('#geSource').href = data.generalEducation.sourceUrl;
}

function switchView(view) {
  $$('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.view === view));
  $$('.view').forEach(section => section.classList.toggle('active', section.id === `${view}View`));
}

function bindEvents() {
  $$('.tab').forEach(tab => tab.addEventListener('click', () => switchView(tab.dataset.view)));
  ['globalSearch', 'geFilter', 'programFilter', 'explicitOnly'].forEach(id => $('#' + id).addEventListener(id === 'globalSearch' ? 'input' : 'change', () => { visibleLimit = 30; renderCourses(); }));
  $('#programSelect').addEventListener('change', event => renderProgram(event.target.value));
  $('#clearFilters').addEventListener('click', () => { $('#globalSearch').value = ''; $('#geFilter').value = ''; $('#programFilter').value = ''; $('#explicitOnly').checked = false; visibleLimit = 30; renderCourses(); });
  $('#showMore').addEventListener('click', () => { visibleLimit += 30; renderCourses(); });
  $('#plannerMajor').addEventListener('change', event => { plan.major = event.target.value; savePlan(); renderPlanner(); });
  $('#plannerMinor').addEventListener('input', event => {
    const value = event.target.value.trim();
    const match = data.programs.find(program => program.kinds.includes('minor') && program.name.toLowerCase() === value.toLowerCase());
    event.target.setCustomValidity(value && !match ? 'Choose a minor from the catalog suggestions.' : '');
    if (match || !value) { plan.minor = match?.slug || ''; savePlan(); renderPlanner(); }
  });
  $('#addPlannerCourse').addEventListener('click', () => addCourseFromInput());
  $('#plannerCourseInput').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addCourseFromInput(); } });
  $('#resetPlan').addEventListener('click', () => { plan = { major: '', minor: '', courses: [] }; savePlan(); $('#plannerEntryMessage').textContent = 'Plan cleared.'; renderPlanner(); });
  $('.dialog-close').addEventListener('click', () => $('#courseDialog').close());
  $('#courseDialog').addEventListener('click', event => { if (event.target === $('#courseDialog')) $('#courseDialog').close(); });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  init().catch(error => { $('#searchHint').textContent = 'Could not load catalog data.'; console.error(error); });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    setTestState(nextData, nextPlan) { data = nextData; plan = nextPlan; },
    geProgress,
    recommendationData,
    divisionAssignment,
    requirementHighlights,
    normalizeTerm,
    SEMESTERS
  };
}
