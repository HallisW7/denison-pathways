# Functional and catalog audit — October 16, 2026

Reviewed all 52 degree-bearing areas against their linked official 2026–2027 catalog pages. The catalog groups 38 major areas and 47 minor areas; individual degrees and emphases are separate choices within those areas.

## Findings corrected

- Expanded missing subject/level elective options, including Biology, Communication, Anthropology, History, Theatre, Visual Arts, and Women's and Gender Studies. Courses requiring topic-specific or departmental approval remain options, with the full catalog wording available.
- Separated Mathematics/Applied Mathematics degrees and minors, Physics BA/BS, English emphases, and Music emphases. Music Theatre automatically selects the applicable requirements when Music or Theatre programs are selected.
- Removed the false Data Analytics minimum of one course; corrected Global Commerce from eight core courses to sixteen total courses and SES from eight core/distribution courses to thirteen including its concentration.
- Rebuilt reverse program references so program filters and recommendations use the same course pools.
- Corrected 533 course crosslisting arrays that included prerequisite references. Genuine alternate registration codes count as one class for graduation credits and cannot be added twice.
- Replaced optimistic prose matching with 181 explicit course groups. Each class is allocated once across a program's checkable groups. Exclusions, examples, incomplete selections, and advisor approval text cannot automatically become completed requirements.
- All selected majors/minors contribute to recommendations. Known sharing restrictions are shown for Mathematics, Data Analytics, Physics/Astronomy, Journalism, Archaeology, and MENA.
- Mixed AND/OR prerequisites no longer pass after only one prerequisite. Standing, placement, permission, and corequisite conditions request review.
- Inferred GE subject tags do not automatically certify GE completion; writing-intensive classes taken before W101 do not count automatically.
- Repeatable courses can be scheduled in separate semesters and moved, removed, or marked complete independently.
- Fixed fractional credits such as `.5` and added a registered-credit selector for variable-credit courses.
- Fixed exact-title course entry and preserved saved plans when migrating program selections.

## Verification

- 13 passing Node regression tests, covering every program version and 5,461 pairs of versions from different areas (major-major, minor-minor, and major-minor). Music Theatre's four conditional combinations are tested separately.
- Chromium exercised all 55 major choices, all 52 planner minor choices, and all 110 program versions (including conditional Music Theatre versions).
- Browser flows passed for two majors plus two minors, saving/reloading, old saved-plan migration, malformed saved JSON, course add/remove/move/status, duplicate and crosslisting prevention, repeated courses, dialogs, search, pagination, GE cards, elective filters/add, and mobile rendering. No page runtime errors.
- JavaScript syntax, JSON parsing, clean diff whitespace, and deterministic catalog regeneration passed.

## Limits of the checks

Course pools are options, not a complete degree audit. Several programs maintain semester-specific approved lists or require a declared concentration, topic approval, placement, course pairing, minimum grades, residency, or an internship. Those rules retain the catalog wording and review status. Shared-course restrictions are flagged, but students do not yet assign exclusive uses to courses across programs. Repeated topics and actual registered credit amounts still require checking; variable-credit entries default to their catalog minimum until the user sets their registered amount. Language placement and writing deadlines require review. The app does not verify that a class is offered in a particular term.

## Reproduce

Serve the repository with `python3 -m http.server 8000 --bind 127.0.0.1`.

Run `node tests/planner.test.js` for the dependency-free regression suite. With Playwright and Chromium available, run `node tests/browser.test.js` (optional `APP_URL` and `CHROMIUM_PATH`). Run `python3 scripts/audit-catalog.py` to rebuild the curated catalog options from the stored wording and reviewed rules. GitHub Actions runs the Node suite and checks that regeneration leaves the dataset unchanged.

## Program coverage

All rows have readable major/minor requirements, nonempty current course options, and working browser views. Counts include alternate registration codes and electives; they are not required course counts.

| Official catalog area | Major versions | Minor versions | Current course options |
| --- | ---: | ---: | ---: |
| [Ancient Greek and Roman Studies](https://catalog.denison.edu/catalog/courses-of-study/ancient-greek-roman-studies/) | 1 | 1 | 49 |
| [Anthropology](https://catalog.denison.edu/catalog/courses-of-study/anthropology/) | 1 | 1 | 26 |
| [Archaeology and Cultural Heritage (Minor)](https://catalog.denison.edu/catalog/courses-of-study/archaeology/) | 0 | 1 | 4 |
| [Art History and Visual Culture](https://catalog.denison.edu/catalog/courses-of-study/art-history-visual-culture/) | 1 | 1 | 37 |
| [Astronomy (Minor)](https://catalog.denison.edu/catalog/courses-of-study/astronomy/) | 0 | 1 | 16 |
| [Biology](https://catalog.denison.edu/catalog/courses-of-study/biology/) | 2 | 1 | 183 |
| [Black Studies](https://catalog.denison.edu/catalog/courses-of-study/black-studies/) | 1 | 1 | 94 |
| [Chemistry and Biochemistry](https://catalog.denison.edu/catalog/courses-of-study/chemistry-biochemistry/) | 3 | 1 | 68 |
| [Cinema](https://catalog.denison.edu/catalog/courses-of-study/cinema/) | 1 | 1 | 22 |
| [Communication and Media Studies](https://catalog.denison.edu/catalog/courses-of-study/communication/) | 1 | 1 | 57 |
| [Computer Science](https://catalog.denison.edu/catalog/courses-of-study/computer-science/) | 2 | 1 | 41 |
| [Dance](https://catalog.denison.edu/catalog/courses-of-study/dance/) | 1 | 1 | 34 |
| [Data Analytics](https://catalog.denison.edu/catalog/courses-of-study/data-analytics/) | 2 | 1 | 110 |
| [Data for Political Research (Minor)](https://catalog.denison.edu/catalog/courses-of-study/data-for-political-research/) | 0 | 1 | 15 |
| [Digital Humanities (Minor)](https://catalog.denison.edu/catalog/courses-of-study/digital-humanities/) | 0 | 1 | 15 |
| [Earth and Environmental Sciences](https://catalog.denison.edu/catalog/courses-of-study/earthandenvironmentalsciences/) | 3 | 1 | 62 |
| [East Asian Studies](https://catalog.denison.edu/catalog/courses-of-study/east-asian-studies/) | 1 | 1 | 66 |
| [Economics](https://catalog.denison.edu/catalog/courses-of-study/economics/) | 1 | 1 | 54 |
| [Educational Studies](https://catalog.denison.edu/catalog/courses-of-study/educational-studies/) | 1 | 1 | 38 |
| [English](https://catalog.denison.edu/catalog/courses-of-study/english/) | 2 | 2 | 87 |
| [Finance](https://catalog.denison.edu/catalog/courses-of-study/finance/) | 1 | 0 | 79 |
| [French](https://catalog.denison.edu/catalog/courses-of-study/french/) | 1 | 1 | 9 |
| [German](https://catalog.denison.edu/catalog/courses-of-study/german/) | 1 | 1 | 19 |
| [Global Commerce](https://catalog.denison.edu/catalog/courses-of-study/global-commerce/) | 1 | 0 | 23 |
| [Global Health](https://catalog.denison.edu/catalog/courses-of-study/global-health/) | 1 | 1 | 182 |
| [Greek (Minor)](https://catalog.denison.edu/catalog/courses-of-study/greek/) | 0 | 1 | 10 |
| [Health, Exercise, and Sport Studies](https://catalog.denison.edu/catalog/courses-of-study/health-exercise-sport-studies/) | 1 | 0 | 36 |
| [History](https://catalog.denison.edu/catalog/courses-of-study/history/) | 1 | 1 | 104 |
| [International Studies](https://catalog.denison.edu/catalog/courses-of-study/international-studies/) | 1 | 0 | 38 |
| [Journalism](https://catalog.denison.edu/catalog/courses-of-study/journalism/) | 1 | 1 | 86 |
| [Latin (Minor)](https://catalog.denison.edu/catalog/courses-of-study/latin/) | 0 | 1 | 9 |
| [Latin American and Caribbean Studies (LACS)](https://catalog.denison.edu/catalog/courses-of-study/latin-american-caribbean-studies/) | 0 | 1 | 80 |
| [Legal Studies (LS)](https://catalog.denison.edu/catalog/courses-of-study/legal-studies/) | 0 | 1 | 39 |
| [Machine Learning & AI (ML)](https://catalog.denison.edu/catalog/courses-of-study/machine-learning/) | 0 | 1 | 14 |
| [Mathematics and Applied Mathematics](https://catalog.denison.edu/catalog/courses-of-study/mathematics/) | 3 | 2 | 34 |
| [Middle East and North African Studies (MENA)](https://catalog.denison.edu/catalog/courses-of-study/middle-east-north-african-studies/) | 0 | 1 | 25 |
| [Music](https://catalog.denison.edu/catalog/courses-of-study/music/) | 5 | 4 | 110 |
| [Music Theatre (Minor)](https://catalog.denison.edu/catalog/courses-of-study/music-theatre/) | 0 | 4 | 47 |
| [Neuroscience (NEUR)](https://catalog.denison.edu/catalog/courses-of-study/neuroscience/) | 0 | 1 | 22 |
| [Organizational Strategy and Leadership (ORGS)](https://catalog.denison.edu/catalog/courses-of-study/orgs/) | 0 | 1 | 49 |
| [Philosophy](https://catalog.denison.edu/catalog/courses-of-study/philosophy/) | 1 | 1 | 46 |
| [Philosophy, Politics and Economics](https://catalog.denison.edu/catalog/courses-of-study/philosophy-politics-economics/) | 1 | 0 | 48 |
| [Physics](https://catalog.denison.edu/catalog/courses-of-study/physics/) | 2 | 1 | 26 |
| [Politics and Public Affairs](https://catalog.denison.edu/catalog/courses-of-study/politics-publicaffairs/) | 1 | 1 | 34 |
| [Psychology](https://catalog.denison.edu/catalog/courses-of-study/psychology/) | 2 | 1 | 216 |
| [Queer Studies (QS)](https://catalog.denison.edu/catalog/courses-of-study/queer-studies/) | 0 | 1 | 29 |
| [Religion](https://catalog.denison.edu/catalog/courses-of-study/religion/) | 1 | 1 | 53 |
| [Spanish](https://catalog.denison.edu/catalog/courses-of-study/spanish/) | 1 | 1 | 41 |
| [Sustainability and Environmental Studies](https://catalog.denison.edu/catalog/courses-of-study/sustainability-environmental-studies/) | 1 | 1 | 61 |
| [Theatre](https://catalog.denison.edu/catalog/courses-of-study/theatre/) | 1 | 1 | 51 |
| [Visual Arts](https://catalog.denison.edu/catalog/courses-of-study/art-studio/) | 2 | 1 | 86 |
| [Women's and Gender Studies](https://catalog.denison.edu/catalog/courses-of-study/womens-gender-studies/) | 1 | 1 | 98 |
