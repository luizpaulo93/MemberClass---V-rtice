/**
 * Phase 0 Security Test Specification for Firestore Rules
 * Verifies all 12 Dirty Dozen payloads result in PERMISSION_DENIED.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unverified Admin Email Spoof',
    collection: 'courses',
    docId: 'course_1',
    operation: 'create',
    auth: { uid: 'attacker_1', email: 'luizpaulofisica@gmail.com', email_verified: false },
    payload: { title: 'Spoofed Course' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow Field Injection on Lesson',
    collection: 'lessons',
    docId: 'lesson_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {
      title: 'Aula 1',
      description: 'Desc',
      youtubeId: 'wPddbzYsXuI',
      duration: '12:00',
      thumbnailUrl: '',
      pdfs: [],
      isFree: false,
      isPublished: true,
      authorId: 'admin_1',
      isSuperFeatured: true, // Shadow field
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Non-Admin Course Creation',
    collection: 'courses',
    docId: 'course_1',
    operation: 'create',
    auth: { uid: 'student_1', email: 'aluno@gmail.com', email_verified: true },
    payload: { title: 'Unauthorized Course' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Student PII Scraping on /students',
    collection: 'students',
    docId: 'other_student',
    operation: 'get',
    auth: { uid: 'student_1', email: 'aluno1@gmail.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Cross-User Progress Tampering',
    collection: 'userProgress',
    docId: 'uid_victim',
    operation: 'update',
    auth: { uid: 'uid_attacker', email: 'attacker@gmail.com', email_verified: true },
    payload: { favoriteLessonIds: ['lesson_1'] },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Identity Spoofing in UserProgress',
    collection: 'userProgress',
    docId: 'uid_attacker',
    operation: 'create',
    auth: { uid: 'uid_attacker', email: 'attacker@gmail.com', email_verified: true },
    payload: {
      userId: 'uid_victim',
      favoriteLessonIds: [],
      completedLessonIds: [],
      lastWatchedLessonId: '',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Denial-of-Wallet Oversized String',
    collection: 'lessons',
    docId: 'lesson_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {
      title: 'A'.repeat(500), // Exceeds 160 max
      description: 'Valid',
      youtubeId: 'wPddbzYsXuI',
      duration: '10:00',
      thumbnailUrl: '',
      pdfs: [],
      isFree: true,
      isPublished: true,
      authorId: 'admin_1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning Attack',
    collection: 'lessons',
    docId: 'invalid$id!with*spaces',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {},
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unbounded Array Exhaustion',
    collection: 'userProgress',
    docId: 'uid_1',
    operation: 'update',
    auth: { uid: 'uid_1', email: 'aluno@gmail.com', email_verified: true },
    payload: {
      favoriteLessonIds: Array.from({ length: 150 }, (_, i) => `lesson_${i}`),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Forged Client Timestamp',
    collection: 'lessons',
    docId: 'lesson_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {
      createdAt: '2020-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Immutable Field Mutation (authorId)',
    collection: 'lessons',
    docId: 'lesson_1',
    operation: 'update',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {
      authorId: 'different_uid',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Invalid Enum State on Student',
    collection: 'students',
    docId: 'student_1',
    operation: 'create',
    auth: { uid: 'admin_1', email: 'luizpaulofisica@gmail.com', email_verified: true },
    payload: {
      status: 'superadmin',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];
