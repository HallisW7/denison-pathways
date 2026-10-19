// Run with a static server at APP_URL (defaults to http://127.0.0.1:8000).
// Requires Playwright and Chromium in the test environment.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const data = require('../data/denison-2026-2027.json');
const storageKey = 'denisonPathwaysPlanV1';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:8000/', { waitUntil: 'networkidle' });
    await page.waitForSelector('.semester-column');
    assert.equal(await page.locator('#courseCount').innerText(), '1,792');

    // Exercise every selection control, with no direct calls to app functions.
    const majorOptions = await page.locator('#plannerMajor option').evaluateAll(options => options.filter(o => o.value).map(o => ({ id: o.value, label: o.textContent })));
    for (const option of majorOptions) {
      await page.selectOption('#plannerMajor', option.id);
      await page.click('#addMajor');
      assert.equal(await page.locator('[data-remove-major]').count(), 1, option.label);
      assert.equal(await page.locator('.program-progress-card').count(), 1, option.label);
      await page.locator('[data-remove-major]').click();
    }
    const minorOptions = await page.locator('#plannerMinorOptions option').evaluateAll(options => options.map(o => o.value));
    for (const label of minorOptions) {
      await page.fill('#plannerMinor', label);
      await page.click('#addMinor');
      assert.equal(await page.locator('[data-remove-minor]').count(), 1, label);
      assert.equal(await page.locator('.program-progress-card').count(), 1, label);
      await page.locator('[data-remove-minor]').click();
    }

    // Every program and every degree/emphasis has readable requirements and options.
    await page.click('[data-view="programs"]');
    let audited = 0;
    for (const program of data.programs.filter(p => p.kinds.length)) {
      await page.selectOption('#programSelect', program.slug);
      const modes = await page.locator('.program-mode').evaluateAll(buttons => buttons.map(b => ({ kind: b.dataset.programMode, id: b.dataset.trackId })));
      for (const mode of modes) {
        await page.locator(`.program-mode[data-program-mode="${mode.kind}"][data-track-id="${mode.id}"]`).click();
        assert.ok((await page.locator('.official-requirements pre').textContent()).length > 80, mode.id);
        assert.ok(await page.locator('.program-course-item').count(), mode.id);
        assert.equal(await page.locator('.program-mode.active').count(), 1, mode.id);
        audited += 1;
      }
    }

    await page.click('[data-view="planner"]');
    for (const slug of ['biology', 'economics']) {
      await page.selectOption('#plannerMajor', data.programs.find(p => p.slug === slug).majorTracks[0].id);
      await page.click('#addMajor');
    }
    for (const label of ['Computer Science', 'Philosophy']) {
      await page.fill('#plannerMinor', label);
      await page.click('#addMinor');
    }
    assert.equal(await page.locator('.selected-program-chip').count(), 4);
    assert.equal(await page.locator('.program-progress-card').count(), 4);
    assert.match(await page.locator('#programPlanNotes').innerText(), /credits count once/);

    const add = async (code, term = 'y1-fall') => {
      await page.fill('#plannerCourseInput', code);
      await page.selectOption('#plannerCourseTerm', term);
      await page.click('#addPlannerCourse');
    };
    await add('BIOL210');
    assert.equal(await page.locator('.semester-course').count(), 1);
    await add('BIOL 210');
    assert.equal(await page.locator('.semester-course').count(), 1);
    await page.locator('[data-action="toggle-status"]').click();
    assert.match(await page.locator('.status-toggle').innerText(), /completed/i);
    await page.selectOption('[data-action="move-term"]', 'y2-spring');
    assert.equal(await page.locator('[data-term="y2-spring"] .semester-course').count(), 1);

    await add('DA 220', 'y2-fall');
    await add('MATH 220', 'y3-fall');
    assert.equal(await page.locator('.semester-course').count(), 2);
    assert.match(await page.locator('#plannerEntryMessage').innerText(), /crosslisted equivalent/);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.selected-program-chip').count(), 4);
    assert.equal(await page.locator('.semester-course').count(), 2);
    assert.equal(await page.locator('[data-term="y2-spring"] .semester-course').count(), 1);

    await page.locator('.view-program-button').first().click();
    assert.ok(await page.locator('.program-course-item.completed').count());
    await page.locator('[data-audit-course="BIOL 210"]').click();
    assert.equal(await page.locator('#courseDialog').evaluate(d => d.open), true);
    await page.click('.dialog-close');
    await page.fill('#globalSearch', 'BIOL 210');
    assert.ok((await page.locator('.course-card').evaluateAll(cards => cards.map(c => c.dataset.code))).includes('BIOL 210'));
    await page.click('#clearFilters');
    assert.equal(await page.locator('.course-card').count(), 30);
    await page.click('#showMore');
    assert.equal(await page.locator('.course-card').count(), 60);
    await page.click('[data-view="ge"]');
    assert.equal(await page.locator('#geSummary .requirement').count(), 7);
    await page.click('[data-view="electives"]');
    await page.uncheck('#electiveReady');
    await page.selectOption('#electiveSubject', 'CS');
    await page.selectOption('#electiveLevel', '3');
    assert.ok(await page.locator('.elective-card').count());
    assert.ok((await page.locator('.elective-card').evaluateAll(cards => cards.map(c => c.dataset.code))).every(code => code.startsWith('CS 3')));
    await page.locator('.elective-add').first().click();
    await page.click('[data-view="planner"]');
    assert.equal(await page.locator('.semester-course').count(), 3);
    await page.screenshot({ path: '/workspace/denison-audit-desktop.png', fullPage: true });

    // Saved selection migration and damaged storage must not stop initialization.
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({ major: 'mathematics', minor: 'latin', courses: [] })), storageKey);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.selected-program-chip').count(), 2);
    await page.evaluate(key => localStorage.setItem(key, '{broken json'), storageKey);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.semester-column').count(), 8);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '/workspace/denison-audit-mobile.png', fullPage: true });
    assert.ok(await page.locator('#addMajor').isVisible());
    await page.click('#resetPlan');
    assert.equal(await page.locator('.selected-program-chip').count(), 0);
    await add('MUSP 129', 'y1-fall');
    await add('MUSP 129', 'y1-spring');
    assert.equal(await page.locator('.semester-course').count(), 2);
    await page.locator('[data-term="y1-spring"] [data-action="toggle-status"]').click();
    assert.match(await page.locator('[data-term="y1-spring"] .status-toggle').innerText(), /completed/i);
    assert.match(await page.locator('[data-term="y1-fall"] .status-toggle').innerText(), /planned/i);
    await page.selectOption('[data-term="y1-spring"] [data-action="move-term"]', 'y2-spring');
    assert.equal(await page.locator('[data-term="y2-spring"] .semester-course').count(), 1);
    await page.locator('[data-term="y1-fall"] [data-action="remove-course"]').click();
    assert.equal(await page.locator('.semester-course').count(), 1);
    await add('BIOL 361', 'y1-fall');
    const creditInput = page.locator('[data-code="BIOL 361"][data-action="course-credits"]');
    await creditInput.fill('2');
    await creditInput.dispatchEvent('change');
    assert.match(await page.locator('[data-term="y1-fall"]').locator('..').locator('header').innerText(), /2 credits/);
    assert.equal(await page.locator('#graduationProgress progress').evaluate(p => p.value), 3);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-code="BIOL 361"][data-action="course-credits"]').inputValue(), '2');
    await page.click('#resetPlan');
    await page.selectOption('#plannerMajor', data.programs.find(p => p.slug === 'theatre').majorTracks[0].id);
    await page.click('#addMajor');
    await page.fill('#plannerMinor', 'Music Theatre (Minor)');
    await page.click('#addMinor');
    assert.match(await page.locator('#selectedPrograms').innerText(), /With Theatre/i);
    await page.locator('[data-remove-minor]').click();
    assert.equal(await page.locator('[data-remove-minor]').count(), 0);
    await page.click('#resetPlan');
    assert.deepEqual(errors, []);
    console.log(`Passed browser audit: ${majorOptions.length} major choices, ${minorOptions.length} minor choices, ${audited} program versions; 2 majors + 2 minors, scheduling, status, aliases, persistence, migration, search, filters, dialogs, electives and mobile rendering.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
