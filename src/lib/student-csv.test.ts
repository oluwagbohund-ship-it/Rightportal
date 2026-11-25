import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentsCsvTemplate,
  escapeCsvCell,
  normalizeCsvDate,
  normalizeCsvGender,
  parseCsvMatrix,
  parseStudentsCsv,
} from './student-csv';

test('parseCsvMatrix handles UTF-8 BOM, quoted commas, escaped quotes, and semicolons', () => {
  const csvWithQuotes =
    '\uFEFFfirst_name,last_name,residential_address,gender\r\n"Ada, Marie","O""Connor","14 Broad Street, Lagos",Female\r\n';
  const parsed = parseCsvMatrix(csvWithQuotes);
  assert.equal(parsed.delimiter, ',');
  assert.equal(parsed.matrix.length, 2);
  assert.deepEqual(parsed.matrix[1], ['Ada, Marie', 'O"Connor', '14 Broad Street, Lagos', 'Female']);

  const semiCsv = 'first_name;last_name;date_of_birth;gender\nTunde;Bakare;2012-03-10;Male\n';
  const parsedSemi = parseCsvMatrix(semiCsv);
  assert.equal(parsedSemi.delimiter, ';');
  assert.equal(parsedSemi.matrix[1][0], 'Tunde');
});

test('normalizeCsvDate and normalizeCsvGender normalize flexible Excel inputs safely', () => {
  assert.equal(normalizeCsvDate('2012-05-14'), '2012-05-14');
  assert.equal(normalizeCsvDate('14/05/2012'), '2012-05-14');
  assert.equal(normalizeCsvDate('05/21/2012'), '2012-05-21');
  assert.equal(normalizeCsvDate('2012-02-30'), null);
  assert.equal(normalizeCsvDate('not-a-date'), null);

  assert.equal(normalizeCsvGender('F'), 'Female');
  assert.equal(normalizeCsvGender('male'), 'Male');
  assert.equal(normalizeCsvGender('Non-Binary'), 'Other');
  assert.equal(normalizeCsvGender('unknown'), '');
});

test('parseStudentsCsv maps header aliases and flags row-level validation errors cleanly', () => {
  const csv = [
    'First Name,Surname,DOB,Sex,Class,Arm,Email,Create Login',
    'Chinedu,Okafor,14/05/2012,M,JSS 1,Gold,chinedu@school.edu,yes',
    'X,Doe,2012-99-99,InvalidSex,JSS 1,,bad-email,maybe',
  ].join('\n');

  const result = parseStudentsCsv(csv, { defaultAdmissionDate: '2026-09-01' });
  assert.equal(result.fileErrors.length, 0);
  assert.equal(result.missingRequiredColumns.length, 0);
  assert.equal(result.rows.length, 2);

  assert.equal(result.rows[0].firstName, 'Chinedu');
  assert.equal(result.rows[0].lastName, 'Okafor');
  assert.equal(result.rows[0].dateOfBirth, '2012-05-14');
  assert.equal(result.rows[0].gender, 'Male');
  assert.equal(result.rows[0].className, 'JSS 1');
  assert.equal(result.rows[0].armName, 'Gold');
  assert.equal(result.rows[0].createPortalLogin, true);
  assert.equal(result.rows[0].admissionDate, '2026-09-01');
  assert.equal(result.rows[0].localIssues.length, 0);

  assert.equal(result.rows[1].localIssues.length, 5);
});

test('parseStudentsCsv flags missing required columns cleanly', () => {
  const result = parseStudentsCsv('first_name,email\nAmaka,amaka@test.edu');
  assert.deepEqual(result.missingRequiredColumns, ['last_name', 'date_of_birth', 'gender']);
  assert.ok(result.fileErrors[0].includes('Missing required CSV column'));
});

test('buildStudentsCsvTemplate generates valid re-parseable CSV and escapeCsvCell blocks formula injection', () => {
  const tpl = buildStudentsCsvTemplate([{ name: 'JSS 2', arms: [{ name: 'Blue', status: 'active' }] }]);
  const reparsed = parseStudentsCsv(tpl);
  assert.equal(reparsed.fileErrors.length, 0);
  assert.equal(reparsed.rows.length, 2);
  assert.equal(reparsed.rows[0].className, 'JSS 2');
  assert.equal(reparsed.rows[0].armName, 'Blue');

  assert.equal(escapeCsvCell('=CMD()'), "'=CMD()");
  assert.equal(escapeCsvCell('+1234'), "'+1234");
  assert.equal(escapeCsvCell('Ada, Lagos'), '"Ada, Lagos"');
});
