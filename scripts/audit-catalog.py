"""Rebuild program course pools from the saved 2026–27 catalog wording.

Explicit subject/level rules below were checked against each program's sourceUrl.
Pools contain options, not a claim that every option is required or approved.
Run after updating the source catalog: python3 scripts/audit-catalog.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'data/denison-2026-2027.json'
data = json.loads(PATH.read_text())
courses = {c['code']: c for c in data['courses']}

def clean(text):
    return re.sub(r'<div id="coursestextcontainer".*', '', text, flags=re.S).strip()

def refs(text):
    # Catalog tables use both CS/MATH 415 and JOUR 100/COMM 108 forms.
    # Tables may join the number directly to its title (BIOL 210Molecular).
    result = set(re.findall(r'\b[A-Z]{1,6}\s+\d{3}(?!\d)', text))
    for subjects, number in re.findall(r'\b([A-Z]{2,6}(?:/[A-Z]{2,6})+)\s+(\d{3})', text):
        result.update(f'{s} {number}' for s in subjects.split('/'))
    return result

def pool(subjects, low=100, high=499, credits=None):
    return {c['code'] for c in courses.values() if c['subject'] in subjects.split()
            and low <= int(c['number'][:3]) <= high
            and (credits is None or c['credits'] == f'{credits} Credit Hours')}

def group(label, count, codes):
    return {'label': label, 'count': count, 'courses': sorted(set(codes) & courses.keys())}

def core(*codes):
    return [group(code, 1, [code]) for code in codes]

def split_tracks(program, kind, entries, prefix='', suffix=''):
    text = program['requirementsText'] if kind == 'major' else program['minorText']
    tracks = []
    for index, (heading, end, label) in enumerate(entries):
        start = text.index(heading)
        finish = text.index(end, start + len(heading)) if end else len(text)
        track_text = '\n\n'.join(filter(None, [prefix, text[start:finish].strip(), suffix]))
        track_id = re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
        if kind == 'minor' and 'minor' not in track_id: track_id += '-minor'
        tracks.append({'id': f"{program['slug']}::{track_id}", 'label': label,
                       'text': track_text, 'courses': [], 'requiredCourseCount': None})
    program[f'{kind}Tracks'] = tracks

programs = {p['slug']: p for p in data['programs']}
for p in programs.values():
    p['requirementsText'] = clean(p['requirementsText'])
    p['minorText'] = clean(p['minorText'])
    for t in p['majorTracks']:
        t['text'] = clean(t['text'])
    p['minorTracks'] = ([{'id': f"{p['slug']}::minor", 'label': 'Minor', 'text': p['minorText'],
                         'courses': [], 'requiredCourseCount': p['minorRequiredCourseCount']}]
                        if 'minor' in p['kinds'] else [])

p = programs['mathematics']
common = p['requirementsText'].split('Mathematics Majors')[0]
split_tracks(p, 'major', [
    ('Bachelor of Arts Degree in Mathematics', 'Bachelor of Science Degree in Mathematics', 'BA in Mathematics'),
    ('Bachelor of Science Degree in Mathematics', 'Bachelor of Science in Applied Mathematics', 'BS in Mathematics'),
    ('Bachelor of Science in Applied Mathematics', 'Mathematics Minors', 'BS in Applied Mathematics')], prefix=common)
split_tracks(p, 'minor', [
    ('Minor in Mathematics', 'Minor in Applied Mathematics', 'Mathematics Minor'),
    ('Minor in Applied Mathematics', 'Students may pursue only', 'Applied Mathematics Minor')])

p = programs['physics']
text = p['requirementsText']
intro = text[:text.index('• Physics courses')]
ba_start = text.index('The B.A. degree requires:')
bs_start = text.index('The B.S. degree requires:')
math_start = text.index('• Math courses')
p['majorTracks'] = [
    {'id': 'physics::ba', 'label': 'BA in Physics', 'text': intro + text[ba_start:bs_start] + '\nMATH 135 and MATH 145 are required.', 'courses': [], 'requiredCourseCount': None},
    {'id': 'physics::bs', 'label': 'BS in Physics', 'text': intro + text[bs_start:math_start] + text[math_start:], 'courses': [], 'requiredCourseCount': None}]

# Both English emphases have distinct required workshops and literature rules.
p = programs['english']
for kind in ['major', 'minor']:
    base = p['requirementsText'].split('English Minor')[0] if kind == 'major' else p['minorText']
    intro = base[:base.index('Literature Emphasis')]
    source = {**p, 'requirementsText': base, 'minorText': base}
    split_tracks(source, kind, [('Literature Emphasis', 'Creative Writing Emphasis', 'Literature Emphasis'),
                               ('Creative Writing Emphasis', None, 'Creative Writing Emphasis')], prefix=intro)
    p[f'{kind}Tracks'] = source[f'{kind}Tracks']

p = programs['music']
major_text = p['requirementsText'].split('Music Minor\n')[0]
common = major_text[:major_text.index('Composition\nCourse List')]
source = {**p, 'requirementsText': major_text}
split_tracks(source, 'major', [
    ('Composition\nCourse List', 'Music (General)\n', 'Composition'),
    ('Music (General)\n', 'Music History\n', 'General Music'),
    ('Music History\n', 'Performance\n', 'Music History'),
    ('Performance\n', 'American Roots Music\n', 'Performance'),
    ('American Roots Music\n', None, 'American Roots Music')], prefix=common)
p['majorTracks'] = source['majorTracks']
split_tracks(p, 'minor', [
    ('Performance Minor\n', 'Music (General) Minor\n', 'Performance Minor'),
    ('Music (General) Minor\n', 'Composition Minor\n', 'General Music Minor'),
    ('Composition Minor\n', 'American Roots Music Minor\n', 'Composition Minor'),
    ('American Roots Music Minor\n', None, 'American Roots Music Minor')])

p = programs['music-theatre']
split_tracks(p, 'minor', [
    ('STUDENTS WHO ARE NEITHER MUSIC NOR THEATRE MAJORS OR MINORS', 'STUDENTS WHO ARE THEATRE MAJORS OR MINORS', 'Neither Music nor Theatre'),
    ('STUDENTS WHO ARE THEATRE MAJORS OR MINORS', 'STUDENTS WHO ARE MUSIC MAJORS OR MINORS', 'With Theatre'),
    ('STUDENTS WHO ARE MUSIC MAJORS OR MINORS', 'STUDENTS WHO ARE DOUBLE MAJORS', 'With Music'),
    ('STUDENTS WHO ARE DOUBLE MAJORS', 'MUSIC THEATRE MINOR ELECTIVES', 'With Music and Theatre')],
    prefix=p['minorText'].split('STUDENTS WHO ARE NEITHER')[0], suffix=p['minorText'].split('MUSIC THEATRE MINOR ELECTIVES')[1])

# Course minima are explicit program totals, never the first numeral in prose.
totals = {
    'anthropology': (10, 6), 'biology': ([10, 14], 7), 'black-studies': (9, 6),
    'chemistry-biochemistry': ([11, 16, 16], 6), 'cinema': (9, 6),
    'communication': (9, 6), 'data-analytics': (None, None),
    'economics': (None, 7), 'global-commerce': (16, None), 'global-health': (10, 6),
    'history': (9, 6), 'journalism': (10, 6), 'mathematics': ([10, 12, 12], 6),
    'german': (9, 5), 'french': (9, 6), 'orgs': (None, 7),
    'queer-studies': (None, 6), 'sustainability-environmental-studies': (13, 6),
    'womens-gender-studies': (8, 6), 'english': (10, 6),
    # Placement/credit-based requirements cannot be reduced to a course minimum.
    'spanish': (None, None), 'art-studio': (None, 6), 'neuroscience': (None, 10),
}

# Broad electives described in the catalog, including exclusions and credit limits.
def extra(slug, kind, track):
    subject_rules = {
        'anthropology': 'ANTH', 'art-history-visual-culture': 'AHVC', 'black-studies': 'BLST',
        'cinema': 'CINE' if kind == 'major' else '', 'communication': 'COMM',
        'educational-studies': 'EDUC', 'german': 'GERM', 'history': 'HIST',
        'philosophy': 'PHIL', 'religion': 'REL', 'theatre': 'THTR',
        'womens-gender-studies': 'WGST', 'journalism': 'JOUR' if kind == 'major' else '',
    }
    result = pool(subject_rules.get(slug, ''), 113 if slug == 'german' else 100)
    if slug == 'ancient-greek-roman-studies': result |= pool('AGRS', 100, 399) | pool('GRK LAT')
    elif slug == 'biology':
        result |= pool('BIOL', 302, 399, 4) - {f'BIOL {n}' for n in range(361, 365)}
        result |= {'BIOL 452'}
        if 'science' in track['id']:
            result |= pool('ASTR CHEM CS EESC MATH PHYS', 100, 499, 4) | {'HESS 202'}
    elif slug == 'astronomy': result |= pool('ASTR', 200)
    elif slug == 'chemistry-biochemistry':
        result |= pool('CHEM', 300, 499, 4)
        if kind == 'major' and 'biochemistry' in track['label'].lower(): result |= pool('BIOL', 300, 399, 4)
    elif slug == 'computer-science': result |= pool('CS', 200, 299 if kind == 'minor' else 499, 4)
    elif slug == 'dance': result |= pool('DANC', 200 if kind == 'major' else 100)
    elif slug == 'data-analytics':
        result |= pool('DA', 230, 249, 4)
        if kind == 'minor': result |= pool('DA', 200, 499, 4)
        else:
            # Concentration options are shared by BOTH degrees.
            shared = programs[slug]['requirementsText'].split('Concentrations in Data Analytics\n', 1)[1].split('Minor in Data Analytics')[0]
            result |= refs(shared)
    elif slug == 'earthandenvironmentalsciences': result |= pool('EESC', 100, 499, 4)
    elif slug == 'east-asian-studies':
        result |= pool('CHIN JAPN', 211, 212)
        if kind == 'minor': result |= refs(programs[slug]['requirementsText'].split('East Asian Studies Minor')[0]) - {'EAST 451', 'EAST 452'}
    elif slug == 'economics': result |= pool('ECON', 201, 440, 4) | pool('ECON', 460, 470, 4)
    elif slug == 'english':
        result |= pool('ENGL', 100, 499, 4)
        if track['label'] == 'Literature Emphasis' and kind == 'minor': result -= {'ENGL 237', 'ENGL 383', 'ENGL 384', 'ENGL 385'}
    elif slug == 'finance': result |= pool('FIN ECON', 100, 499, 4) | pool('MATH', 200, 299, 4)
    elif slug == 'french': result |= (pool('FREN', 220, 279) | pool('FREN', 320, 379)) - pool('FREN', 361, 364)
    elif slug == 'global-health':
        shared = programs[slug]['requirementsText'].split('Global Health Minor')[0]
        result |= refs(shared) - {'GH 400', 'GH 451', 'GH 452', 'GH 050'}
        result |= pool('GH', 200, 399, 4) | pool('ARAB CHIN FREN GERM JAPN PORT SPAN', 100, 499, 4)
    elif slug == 'global-commerce': result |= pool('ARAB CHIN FREN GERM GRK JAPN LAT PORT SPAN', 211, 214, 4)
    elif slug == 'greek': result |= pool('GRK')
    elif slug == 'latin': result |= pool('LAT')
    elif slug == 'health-exercise-sport-studies': result |= pool('HESS', 300, 399)
    elif slug == 'international-studies': result |= pool('INTL', 250, 270) | pool('ARAB CHIN FREN GERM GRK JAPN LAT PORT SPAN', 212, 214, 4)
    elif slug == 'latin-american-caribbean-studies': result |= pool('FREN PORT SPAN', 100, 499, 4)
    elif slug == 'journalism' and kind == 'minor': result |= refs(programs[slug]['requirementsText'].split('Journalism Minor')[0]) - {'JOUR 451', 'JOUR 452'}
    elif slug == 'mathematics': result |= pool('MATH', 400, 499, 4)
    elif slug == 'music':
        result |= refs(programs[slug]['requirementsText'].split('Music Electives\n')[-1]) | pool('MUSP')
    elif slug == 'philosophy-politics-economics': result |= pool('PPA', 300, 399, 4)
    elif slug == 'physics': result |= pool('PHYS', 200, 499, 4) | (pool('ASTR', 200, 499, 4) if kind == 'major' else set())
    elif slug == 'politics-publicaffairs': result |= pool('PPA', 300, 399, 4)
    elif slug == 'psychology':
        result |= pool('PSYC', 206, 399, 4) - {f'PSYC {n}' for n in range(361, 365)}
        if kind == 'major' and 'b-s' in track['id']:
            for subject, source in [('BIOL', 'biology'), ('CHEM', 'chemistry-biochemistry'), ('CS', 'computer-science'), ('EESC', 'earthandenvironmentalsciences'), ('MATH', 'mathematics'), ('PHYS', 'physics')]:
                source_options = set().union(*(set(t['courses']) for t in programs[source]['majorTracks']))
                result |= source_options & pool(subject, 100, 499, 4)
    elif slug == 'spanish': result |= pool('SPAN', 300, 399, 4)
    elif slug == 'sustainability-environmental-studies' and kind == 'minor': result |= refs(programs[slug]['requirementsText'].split('3. Experiential Component')[0])
    elif slug == 'art-studio':
        result |= pool('ARTS', 100, 399, 4)
        if kind == 'minor' or 'b-f-a' in track['id']: result |= pool('AHVC', 100, 499, 4)
    return result

for c in courses.values():
    # The original scrape accidentally included prerequisite codes as crosslistings.
    cross = re.search(r'Crosslisting:\s*([^\n]+)', c['details'])
    c['crosslistings'] = sorted(refs(cross[1]) & courses.keys()) if cross else []
    c['repeatable'] = bool(re.search(r'repeatable|(?:may|can) be repeated', c['description'] + c['details'], re.I)
                           or c['code'] in {'HESS 450', 'DH 200', 'MUSP 126'}
                           or (c['subject'] == 'MUSP' and re.search(r'Private Lesson|Ensemble', c['title'], re.I))
                           or c['code'] in {f'DANC {n}' for n in [122, 132, 222, 232, 332, 422, 432, 434]})

for _ in range(3):
    for c in courses.values():
        if c.get('repeatable'):
            for alias in c['crosslistings']: courses[alias]['repeatable'] = True

for p in programs.values():
    for kind in ['major', 'minor']:
        for i, track in enumerate(p[f'{kind}Tracks']):
            # Ignore guidance-only and prerequisite tables when making options.
            direct_text = track['text'].split('Additional Points of Interest')[0]
            if kind == 'major' and re.search(r'\bMinor\b', p['minorText'].split('\n')[0]):
                direct_text = direct_text.split(p['minorText'].split('\n')[0])[0]
            if p['slug'] == 'educational-studies': direct_text = direct_text.split('Please note these prerequisites')[0]
            explicit = refs(direct_text)
            options = (explicit | extra(p['slug'], kind, track)) & courses.keys()
            # Include true crosslisted identities, never prerequisite references.
            for code in list(options): options.update(courses[code]['crosslistings'])
            if p['slug'] == 'biology':
                options -= {f'BIOL {n}' for n in range(361, 365)} | {'BIOL 451'}
            if p['slug'] == 'psychology':
                options -= {'PSYC 096', 'PSYC 199', 'PSYC 361', 'PSYC 362', 'PSYC 363', 'PSYC 364', 'PSYC 451', 'PSYC 452'}
                if kind == 'minor': options -= {'PSYC 401', 'PSYC 410'}
            if p['slug'] == 'global-health' and kind == 'minor': options -= {'GH 050', 'GH 400', 'GH 451', 'GH 452'}
            if p['slug'] == 'english' and kind == 'minor' and track['label'] == 'Literature Emphasis':
                options -= {'ENGL 237', 'ENGL 383', 'ENGL 384', 'ENGL 385'}
            track['courses'] = sorted(options)
            track['auditGroups'] = []
            track['reviewNotes'] = ['Category choices, approvals, grades, placement, residency, and shared-course limits still need review against the full catalog wording.']
            if p['slug'] in totals:
                target = totals[p['slug']][kind == 'minor']
                track['requiredCourseCount'] = target[i] if isinstance(target, list) else target
    p['minorCourses'] = p['minorTracks'][0]['courses'] if p['minorTracks'] else []
    p['minorRequiredCourseCount'] = p['minorTracks'][0]['requiredCourseCount'] if p['minorTracks'] else None

# Checkable requirements use explicit groups, with distinct courses allocated
# across groups. Qualitative or advisor-dependent rules stay in reviewNotes.
def set_groups(slug, kind, groups, index=None):
    tracks = programs[slug][f'{kind}Tracks']
    for i, track in enumerate(tracks):
        if index is None or index == i: track['auditGroups'] = groups

bio_electives = (pool('BIOL', 302, 399, 4) - {f'BIOL {n}' for n in range(361, 365)}) | {'BIOL 452'}
for kind in ['major', 'minor']:
    for i, t in enumerate(programs['biology'][f'{kind}Tracks']):
        groups = core('BIOL 210', 'BIOL 220', 'BIOL 230')
        groups += [group('Introductory chemistry', 1 if kind == 'minor' else 2, ['CHEM 131', 'CHEM 132'])]
        groups += [group('Advanced Biology electives', 3 if kind == 'minor' else 5, bio_electives)]
        if kind == 'major': groups += core('BIOL 300', 'BIOL 301')
        t['auditGroups'] = groups
        t['reviewNotes'] += ['An advanced elective must meet the biological diversity requirement. BS cognates require four qualifying science courses with no more than two per department.']

for kind in ['major', 'minor']:
    set_groups('anthropology', kind, core('ANTH 101', 'ANTH 201') +
        ([group('Human origins or archaeology', 1, ['ANTH 202', 'ANTH 203'])] + core('ANTH 301', 'ANTH 401') if kind == 'major' else
         [group('Anthropology core option', 1, ['ANTH 202', 'ANTH 203', 'ANTH 301'])]) +
        [group('Anthropology electives', 5 if kind == 'major' else 3, pool('ANTH', 100, 499, 4))])
    set_groups('communication', kind, core('COMM 280', 'COMM 290') +
        [group('Introductory course', 1, pool('COMM', 100, 199 if kind == 'major' else 299, 4)),
         *([group('200-level elective', 1, pool('COMM', 200, 299, 4))] if kind == 'major' else []),
         group('300-level electives', 3 if kind == 'major' else 2, pool('COMM', 300, 399, 4)),
         group('400-level elective', 1, pool('COMM', 400, 499, 4)),
         *([group('Additional elective', 1, pool('COMM', 100, 499, 4))] if kind == 'major' else [])])
    set_groups('art-studio', kind, core('ARTS 101') + ([group('Visual Arts electives', 4, pool('ARTS', 100, 499, 4)), group('Art History course', 1, pool('AHVC', 100, 499, 4))] if kind == 'minor' else []))
    set_groups('womens-gender-studies', kind, core('WGST 101', 'WGST 310', 'WGST 311') +
               ([group('Senior Research', 1, ['WGST 451', 'WGST 452'])] if kind == 'major' else []))
    set_groups('religion', kind, core('REL 200') + (core('REL 450') if kind == 'major' else []) +
               [group('300-level Religion', 2 if kind == 'major' else 1, pool('REL', 300, 399, 4))])
    set_groups('philosophy', kind, (core('PHIL 231', 'PHIL 232', 'PHIL 431', 'PHIL 440') if kind == 'major' else
               [group('History of Philosophy', 1, ['PHIL 231', 'PHIL 232']), group('Advanced Philosophy', 1, pool('PHIL', 300, 499, 4))]))
    set_groups('sustainability-environmental-studies', kind, core('SES 100', 'SES 200', 'SES 123') + (core('SES 301') if kind == 'major' else []))

for slug in ['greek', 'latin']:
    subject, history, literature = ('GRK', 'AGRS 201', 'AGRS 111') if slug == 'greek' else ('LAT', 'AGRS 202', 'AGRS 112')
    set_groups(slug, 'minor', core(history) + [group('Language courses', 4, pool(subject)), group('Literature or additional language', 1, pool(subject) | {literature})])
set_groups('computer-science', 'minor', core('CS 105', 'CS 145', 'CS 231', 'CS 234', 'CS 237') +
           [group('Calculus', 1, ['MATH 130', 'MATH 135', 'MATH 145']), group('Additional CS elective', 1, pool('CS', 200, 299, 4))])
set_groups('theatre', 'minor', core('THTR 100', 'THTR 200') +
           [group('Advanced Theatre-making', 1, ['THTR 301', 'THTR 302']), group('History and theory', 1, [f'THTR {n}' for n in range(371, 375)]), group('Theatre elective', 1, pool('THTR', 100, 499, 4))])
set_groups('politics-publicaffairs', 'minor', core('PPA 102', 'PPA 122', 'PPA 132') + [group('Upper-division PPA electives', 3, pool('PPA', 300, 399, 4))])
set_groups('global-health', 'minor', core('GH 100', 'GH 202', 'GH 210') + [group('Global Health electives', 2, pool('GH', 200, 399, 4))])
set_groups('queer-studies', 'minor', core('QS 101', 'QS 227', 'QS 400'))
set_groups('legal-studies', 'minor', core('LS 101'))
set_groups('data-for-political-research', 'minor', core('DPR 101', 'DPR 201', 'DPR 250') +
           [group('Upper-level options', 3, set(programs['data-for-political-research']['minorCourses']) - {'DPR 101', 'DPR 201', 'DPR 250'})])
set_groups('educational-studies', 'minor', core('PSYC 100', 'EDUC 213', 'EDUC 390') + [group('Education electives', 3, pool('EDUC', 100, 499, 4))])
set_groups('orgs', 'minor', core('PSYC 100', 'PSYC 230', 'GC 260', 'ORGS 330', 'ORGS 400', 'ORGS 030', 'ORGS 050'))
set_groups('machine-learning', 'minor', core('MATH 145', 'MATH 213', 'CS 145', 'ML 222', 'ML 400') +
           [group('Applied Probability', 1, ['ML 221', 'MATH 221']), group('Introductory ML', 1, ['ML 240', 'CS 240']), group('Intermediate ML', 1, ['ML 310', 'MATH 428'])])

foundation = {f'MATH {n}' for n in [400, 410, 413, 440, 445, 447]}
modeling = {f'MATH {n}' for n in [415, 420, 422, 425, 430, 434, 435]}
math_core = core('MATH 145', 'MATH 213', 'MATH 300', 'MATH 395', 'CS 145') + [group('Statistics or probability', 1, ['MATH 220', 'MATH 221'])]
set_groups('mathematics', 'major', math_core + [group('Foundation courses', 2, foundation), group('Modeling courses', 2, modeling)], 0)
set_groups('mathematics', 'major', math_core + core('MATH 440') + [group('Other foundation courses', 3, foundation), group('Additional 400-level MATH courses', 2, pool('MATH', 400, 499, 4))], 1)
set_groups('mathematics', 'major', math_core + core('MATH 440') + [group('Modeling courses', 4, modeling), group('Additional 400-level MATH course', 1, pool('MATH', 400, 499, 4))], 2)
set_groups('mathematics', 'minor', core('MATH 145', 'MATH 213', 'MATH 300', 'CS 145') + [group('Statistics or probability', 1, ['MATH 220', 'MATH 221']), group('400-level MATH course', 1, pool('MATH', 400, 499, 4))], 0)
set_groups('mathematics', 'minor', core('MATH 145', 'MATH 213', 'CS 145') + [group('Statistics or probability', 1, ['MATH 220', 'MATH 221']), group('Modeling courses', 2, modeling)], 1)
programs['mathematics']['minorTracks'][1]['courses'] = sorted(set().union(*(set(g['courses']) for g in programs['mathematics']['minorTracks'][1]['auditGroups'])))

workshops = {'ENGL 237', 'ENGL 383', 'ENGL 384', 'ENGL 385'}
literature_intro = pool('ENGL', 100, 299, 4) - workshops
literature_upper = pool('ENGL', 300, 499, 4) - workshops - {'ENGL 337', 'ENGL 338', 'ENGL 453', 'ENGL 454'}
for kind in ['major', 'minor']:
    intro_count = 4 if kind == 'major' else 3
    groups = [group('100-level literature', 2 if kind == 'major' else 1, pool('ENGL', 100, 199, 4)),
              group('Other introductory literature', intro_count - (2 if kind == 'major' else 1), literature_intro)]
    if kind == 'major': groups += [group('400-level literature', 1, literature_upper & pool('ENGL', 400, 499, 4)), group('Other upper-level literature', 4, literature_upper | (workshops - {'ENGL 237'})), group('Additional English elective', 1, pool('ENGL', 100, 499, 4))]
    else: groups += [group('Upper-level literature', 3, literature_upper)]
    set_groups('english', kind, groups, 0)
    creative = [group('100-level literature', 1, pool('ENGL', 100, 199, 4)), group('Other introductory literature', 2 if kind == 'major' else 1, literature_intro), group('Upper-level literature', 2, literature_upper)] + core('ENGL 237')
    if kind == 'major': creative += [group('Form and theory', 1, ['ENGL 337', 'ENGL 338']), group('Different writing workshops', 2, ['ENGL 383', 'ENGL 384', 'ENGL 385'])] + core('ENGL 453')
    else: creative += [group('Writing workshop', 1, ['ENGL 383', 'ENGL 384', 'ENGL 385'])]
    set_groups('english', kind, creative, 1)

for p in programs.values():
    for kind in ['major', 'minor']:
        for t in p[f'{kind}Tracks']:
            for g in t['auditGroups']:
                # A group accepts the alternate registration code of the same class.
                g['courses'] = sorted(set(g['courses']).union(*(courses[c]['crosslistings'] for c in g['courses'])))
                t['courses'] = sorted(set(t['courses']) | set(g['courses']))
    p['minorCourses'] = p['minorTracks'][0]['courses'] if p['minorTracks'] else []
    p['referencedCourses'] = sorted(set().union(*(set(t['courses']) for k in ['major', 'minor'] for t in p[f'{k}Tracks'])))

# Rebuild the reverse index so search, recommendations and program filters agree.
for c in courses.values(): c['programReferences'] = []
for p in programs.values():
    for code in p['referencedCourses']:
        courses[code]['programReferences'].append({'slug': p['slug'], 'program': p['name'], 'section': 'Catalog course option; check the selected degree, category, and approval rules.'})
data['meta']['programAuditDate'] = '2026-10-16'
PATH.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
