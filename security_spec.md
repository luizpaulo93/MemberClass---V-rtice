# Security Specification (Phase 0: Payload-First Security TDD)

## 1. Data Invariants

1. **Authentication & Verification Invariant**: Every read and write operation requires a signed-in Google user (`request.auth != null && request.auth.token.email_verified == true`).
2. **Admin Privilege Invariant**: Content management (`lessons`, `playlists`, `courses`, `students`, `platformConfig` writes) is strictly restricted to verified admins (`isAdmin()`), where the bootstrapped owner email (`luizpaulofisica@gmail.com` with `email_verified == true`) or a document in `/admins/$(request.auth.uid)` grants admin rights.
3. **Decoupled Lifecycle Invariant**: `lessons`, `playlists`, and `courses` are stored in independent top-level collections so deleting a `course` or `playlist` never deletes `lessons`.
4. **PII Isolation Invariant**: The `/students/{studentId}` collection contains student email addresses (PII). Reads are restricted strictly to `isAdmin()` or the student whose verified email matches `resource.data.email` (or whose document ID matches their email slug). Blanket `list` by regular students is forbidden.
5. **UserProgress Ownership Invariant**: `/userProgress/{userId}` can only be read, created, or updated by `request.auth.uid == userId`, with `incoming().userId == request.auth.uid`.
6. **Strict Schema & Temporal Invariant**: All writes enforce `hasAll` and `hasOnly` key allowlists, explicit string/list `.size()` boundaries, `isValidId()` regex validation on document IDs, and `request.time` equality on `createdAt` / `updatedAt`.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Admin Email Spoof**: `{ auth: { uid: 'attacker', token: { email: 'luizpaulofisica@gmail.com', email_verified: false } } }` attempting `create` on `/courses/course_1` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Lesson**: Admin or user sending `{ ...validLesson, isSuperFeatured: true }` -> `PERMISSION_DENIED` via `hasOnly()`.
3. **Non-Admin Course Creation**: Regular verified user creating `/courses/course_1` -> `PERMISSION_DENIED`.
4. **Student PII Scraping**: Regular user calling `list` on `/students` without matching `resource.data.email == request.auth.token.email` -> `PERMISSION_DENIED`.
5. **Cross-User Progress Tampering**: User `uid_A` updating `/userProgress/uid_B` -> `PERMISSION_DENIED`.
6. **Identity Spoofing in UserProgress**: User `uid_A` creating `/userProgress/uid_A` with `userId: 'uid_B'` -> `PERMISSION_DENIED`.
7. **Denial-of-Wallet Oversized String**: Sending a 10,000-char `description` to `/lessons/lesson_1` -> `PERMISSION_DENIED` (`maxLength: 4000`).
8. **ID Poisoning Attack**: Creating `/lessons/invalid$id!with*spaces` -> `PERMISSION_DENIED` (`isValidId` regex failure).
9. **Unbounded Array Exhaustion**: User sending 500 items in `favoriteLessonIds` on `/userProgress/uid_A` -> `PERMISSION_DENIED` (`size() <= 100`).
10. **Forged Client Timestamp**: Creating `/lessons/lesson_1` with `createdAt` set to a past timestamp (`createdAt != request.time`) -> `PERMISSION_DENIED`.
11. **Immutable Field Mutation**: Updating `authorId` or `createdAt` on `/lessons/lesson_1` -> `PERMISSION_DENIED`.
12. **Invalid Enum State on Student**: Creating `/students/student_1` with `status: 'superadmin'` (not in `['active', 'blocked']`) -> `PERMISSION_DENIED`.
