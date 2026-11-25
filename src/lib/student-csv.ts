export interface ParsedCsvStudentInput {
  rowNumber: number;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'Male' | 'Female' | 'Other' | '';
  rawGender: string;
  admissionNumber: string;
  admissionDate: string;
  studentEmail: string;
  studentPhone: string;
  residentialAddress: string;
  nationality: string;
  stateOfOrigin: string;
  previousSchool: string;
  className: string;
  armName: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
  createPortalLogin: boolean | null;
  portalPassword: string;
  localIssues: string[];
}

export interface CsvParseResult {
  delimiter: ',' | ';' | '\t';
  headers: string[];
  recognizedColumns: string[];
  unknownHeaders: string[];
  missingRequiredColumns: string[];
  rows: ParsedCsvStudentInput[];
  fileErrors: string[];
}

type CanonicalField =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'dateOfBirth'
  | 'gender'
  | 'admissionNumber'
  | 'admissionDate'
  | 'studentEmail'
  | 'studentPhone'
  | 'residentialAddress'
  | 'nationality'
  | 'stateOfOrigin'
  | 'previousSchool'
  | 'className'
  | 'armName'
  | 'emergencyContactName'
  | 'emergencyContactPhone'
  | 'emergencyContactRelationship'
  | 'createPortalLogin'
  | 'portalPassword';

const HEADER_ALIASES: Record<string, CanonicalField> = {
  firstname: 'firstName',
  givenname: 'firstName',
  fname: 'firstName',
  middlename: 'middleName',
  othername: 'middleName',
  othernames: 'middleName',
  lastname: 'lastName',
  surname: 'lastName',
  familyname: 'lastName',
  lname: 'lastName',
  dateofbirth: 'dateOfBirth',
  dob: 'dateOfBirth',
  birthdate: 'dateOfBirth',
  birthday: 'dateOfBirth',
  gender: 'gender',
  sex: 'gender',
  admissionnumber: 'admissionNumber',
  admissionno: 'admissionNumber',
  admno: 'admissionNumber',
  studentid: 'admissionNumber',
  regno: 'admissionNumber',
  registrationnumber: 'admissionNumber',
  admissiondate: 'admissionDate',
  dateadmitted: 'admissionDate',
  enrolleddate: 'admissionDate',
  studentemail: 'studentEmail',
  email: 'studentEmail',
  emailaddress: 'studentEmail',
  studentphone: 'studentPhone',
  phone: 'studentPhone',
  phonenumber: 'studentPhone',
  mobile: 'studentPhone',
  residentialaddress: 'residentialAddress',
  address: 'residentialAddress',
  homeaddress: 'residentialAddress',
  nationality: 'nationality',
  country: 'nationality',
  stateoforigin: 'stateOfOrigin',
  state: 'stateOfOrigin',
  previousschool: 'previousSchool',
  lastschool: 'previousSchool',
  class: 'className',
  classname: 'className',
  classcode: 'className',
  grade: 'className',
  level: 'className',
  arm: 'armName',
  armname: 'armName',
  classarm: 'armName',
  section: 'armName',
  stream: 'armName',
  emergencycontactname: 'emergencyContactName',
  emergencyname: 'emergencyContactName',
  guardianname: 'emergencyContactName',
  emergencycontactphone: 'emergencyContactPhone',
  emergencyphone: 'emergencyContactPhone',
  guardianphone: 'emergencyContactPhone',
  emergencycontactrelationship: 'emergencyContactRelationship',
  emergencyrelationship: 'emergencyContactRelationship',
  relationship: 'emergencyContactRelationship',
  createportallogin: 'createPortalLogin',
  portallogin: 'createPortalLogin',
  createlogin: 'createPortalLogin',
  enablelogin: 'createPortalLogin',
  portalpassword: 'portalPassword',
  password: 'portalPassword',
};

const REQUIRED_FIELDS: Array<{ field: CanonicalField; label: string }> = [
  { field: 'firstName', label: 'first_name' },
  { field: 'lastName', label: 'last_name' },
  { field: 'dateOfBirth', label: 'date_of_birth' },
  { field: 'gender', label: 'gender' },
];

export const MAX_BULK_IMPORT_ROWS = 500;

export function normalizeCsvHeader(header: string): string {
  return header
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function detectCsvDelimiter(firstNonEmptyLine: string): ',' | ';' | '\t' {
  let commas = 0;
  let semis = 0;
  let tabs = 0;
  let inQuotes = false;

  for (let i = 0; i < firstNonEmptyLine.length; i++) {
    const ch = firstNonEmptyLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',') commas += 1;
      else if (ch === ';') semis += 1;
      else if (ch === '\t') tabs += 1;
    }
  }

  if (commas === 0 && tabs > 0 && tabs >= semis) return '\t';
  if (commas === 0 && semis > 0) return ';';
  return ',';
}

export function parseCsvMatrix(rawCsv: string): { delimiter: ',' | ';' | '\t'; matrix: string[][] } {
  const clean = rawCsv.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  const delimiter = detectCsvDelimiter(firstLine);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) {
      rows.push(row);
    }
  }

  return { delimiter, matrix: rows };
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function normalizeCsvDate(raw: string): string | null {
  const val = raw.trim();
  if (!val) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(val);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(val);
  if (m) {
    const first = Number(m[1]);
    const second = Number(m[2]);
    const year = Number(m[3]);
    // Support DD/MM/YYYY primarily; if second > 12 and first <= 12, accept MM/DD/YYYY
    let day = first;
    let month = second;
    if (second > 12 && first <= 12) {
      month = first;
      day = second;
    }
    if (!isValidCalendarDate(year, month, day)) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return null;
}

export function normalizeCsvGender(raw: string): 'Male' | 'Female' | 'Other' | '' {
  const v = raw.trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === 'boy') return 'Male';
  if (v === 'f' || v === 'female' || v === 'girl') return 'Female';
  if (v === 'other' || v === 'non-binary' || v === 'nonbinary') return 'Other';
  return '';
}

export function parseCsvBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (['true', 'yes', 'y', '1'].includes(v)) return true;
  if (['false', 'no', 'n', '0'].includes(v)) return false;
  return null;
}

export function parseStudentsCsv(
  rawCsv: string,
  options?: { defaultAdmissionDate?: string; defaultNationality?: string },
): CsvParseResult {
  const { delimiter, matrix } = parseCsvMatrix(rawCsv);
  if (matrix.length === 0) {
    return {
      delimiter,
      headers: [],
      recognizedColumns: [],
      unknownHeaders: [],
      missingRequiredColumns: REQUIRED_FIELDS.map((r) => r.label),
      rows: [],
      fileErrors: ['CSV file is empty. Include a header row and at least one student record.'],
    };
  }

  const headers = matrix[0];
  const columnMap = new Map<number, CanonicalField>();
  const seenFields = new Set<CanonicalField>();
  const unknownHeaders: string[] = [];

  headers.forEach((rawHeader, idx) => {
    const key = normalizeCsvHeader(rawHeader);
    const mapped = HEADER_ALIASES[key];
    if (mapped && !seenFields.has(mapped)) {
      columnMap.set(idx, mapped);
      seenFields.add(mapped);
    } else if (rawHeader.trim()) {
      unknownHeaders.push(rawHeader.trim());
    }
  });

  const missingRequiredColumns = REQUIRED_FIELDS.filter((req) => !seenFields.has(req.field)).map(
    (req) => req.label,
  );
  const recognizedColumns = Array.from(seenFields);

  const fileErrors: string[] = [];
  if (missingRequiredColumns.length > 0) {
    fileErrors.push(`Missing required CSV column(s): ${missingRequiredColumns.join(', ')}.`);
  }

  const dataRows = matrix.slice(1);
  if (dataRows.length === 0) {
    fileErrors.push('No student rows found below the CSV header row.');
  } else if (dataRows.length > MAX_BULK_IMPORT_ROWS) {
    fileErrors.push(
      `CSV contains ${dataRows.length} rows, exceeding the maximum batch size of ${MAX_BULK_IMPORT_ROWS} students per import.`,
    );
  }

  const fallbackAdmDate =
    normalizeCsvDate(options?.defaultAdmissionDate ?? '') ?? new Date().toISOString().slice(0, 10);
  const fallbackNat = (options?.defaultNationality ?? '').trim();

  const rows: ParsedCsvStudentInput[] = dataRows.slice(0, MAX_BULK_IMPORT_ROWS).map((cells, idx) => {
    const rowNumber = idx + 2; // 1-based accounting for header row
    const record: Record<CanonicalField, string> = {
      firstName: '',
      middleName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      admissionNumber: '',
      admissionDate: '',
      studentEmail: '',
      studentPhone: '',
      residentialAddress: '',
      nationality: '',
      stateOfOrigin: '',
      previousSchool: '',
      className: '',
      armName: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
      createPortalLogin: '',
      portalPassword: '',
    };

    columnMap.forEach((field, colIdx) => {
      record[field] = (cells[colIdx] ?? '').trim();
    });

    const localIssues: string[] = [];
    if (record.firstName.length < 2) {
      localIssues.push('First name must be at least 2 characters');
    }
    if (record.lastName.length < 2) {
      localIssues.push('Last name must be at least 2 characters');
    }

    const dobNormalized = normalizeCsvDate(record.dateOfBirth);
    if (!dobNormalized) {
      localIssues.push('Date of birth must be a valid YYYY-MM-DD or DD/MM/YYYY date');
    }

    const genderNormalized = normalizeCsvGender(record.gender);
    if (!genderNormalized) {
      localIssues.push('Gender must be Male, Female, or Other');
    }

    let admDateNormalized = fallbackAdmDate;
    if (record.admissionDate) {
      const parsedAdmDate = normalizeCsvDate(record.admissionDate);
      if (!parsedAdmDate) {
        localIssues.push('Admission date must be a valid YYYY-MM-DD or DD/MM/YYYY date');
      } else {
        admDateNormalized = parsedAdmDate;
      }
    }

    const emailTrimmed = record.studentEmail.trim().toLowerCase();
    if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      localIssues.push('Student email format is invalid');
    }

    const createPortalLogin = parseCsvBoolean(record.createPortalLogin);
    if (record.createPortalLogin && createPortalLogin === null) {
      localIssues.push('create_portal_login must be true/false or yes/no');
    }

    if (record.portalPassword && record.portalPassword.length < 8) {
      localIssues.push('portal_password must be at least 8 characters');
    }

    return {
      rowNumber,
      firstName: record.firstName.slice(0, 80),
      middleName: record.middleName.slice(0, 80),
      lastName: record.lastName.slice(0, 80),
      dateOfBirth: dobNormalized ?? record.dateOfBirth,
      gender: genderNormalized,
      rawGender: record.gender,
      admissionNumber: record.admissionNumber.slice(0, 48),
      admissionDate: admDateNormalized,
      studentEmail: emailTrimmed.slice(0, 160),
      studentPhone: record.studentPhone.slice(0, 40),
      residentialAddress: record.residentialAddress.slice(0, 240),
      nationality: (record.nationality || fallbackNat).slice(0, 80),
      stateOfOrigin: record.stateOfOrigin.slice(0, 80),
      previousSchool: record.previousSchool.slice(0, 140),
      className: record.className.slice(0, 80),
      armName: record.armName.slice(0, 80),
      emergencyContactName: record.emergencyContactName.slice(0, 120),
      emergencyContactPhone: record.emergencyContactPhone.slice(0, 40),
      emergencyContactRelationship: record.emergencyContactRelationship.slice(0, 60),
      createPortalLogin,
      portalPassword: record.portalPassword.slice(0, 128),
      localIssues,
    };
  });

  return {
    delimiter,
    headers,
    recognizedColumns,
    unknownHeaders,
    missingRequiredColumns,
    rows,
    fileErrors,
  };
}

export function escapeCsvCell(rawValue: unknown): string {
  const str = String(rawValue ?? '');
  // Guard against spreadsheet formula injection when opened in Excel / Sheets
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function buildStudentsCsvTemplate(
  classes?: Array<{ name: string; arms?: Array<{ name: string; status?: string }> }>,
): string {
  const firstClass = classes?.[0]?.name || 'JSS 1';
  const secondClass = classes?.[1]?.name || firstClass;
  const firstArm = classes?.[0]?.arms?.find((a) => a.status !== 'archived')?.name || '';
  const secondArm = classes?.[1]?.arms?.find((a) => a.status !== 'archived')?.name || '';
  const today = new Date().toISOString().slice(0, 10);

  const header = [
    'first_name',
    'middle_name',
    'last_name',
    'date_of_birth',
    'gender',
    'class',
    'arm',
    'admission_number',
    'admission_date',
    'student_email',
    'student_phone',
    'residential_address',
    'nationality',
    'state_of_origin',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
    'create_portal_login',
  ];

  const sampleRows = [
    [
      'Amaka',
      'Chioma',
      'Okonkwo',
      '2012-05-14',
      'Female',
      firstClass,
      firstArm,
      '',
      today,
      'amaka.okonkwo@student.school.edu',
      '+2348012345678',
      '14 Broad Street, Victoria Island',
      'Nigerian',
      'Anambra',
      'Mrs. Ngozi Okonkwo',
      '+2348098765432',
      'Mother',
      'yes',
    ],
    [
      'Ibrahim',
      '',
      'Bello',
      '2011-11-02',
      'Male',
      secondClass,
      secondArm,
      '',
      today,
      '',
      '',
      '22 Ahmadu Bello Way',
      'Nigerian',
      'Kaduna',
      'Alh. Musa Bello',
      '+2348023456789',
      'Father',
      'no',
    ],
  ];

  return [header, ...sampleRows]
    .map((cols) => cols.map((c) => escapeCsvCell(c)).join(','))
    .join('\n');
}
