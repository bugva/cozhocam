import type { Course, DocumentRecord } from './db';

export function docDisplayName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

/** Ders → klasör yolu (serbest belgelerde boş). */
export function buildDocBreadcrumb(doc: DocumentRecord, courses: Course[]): string[] {
  if (!doc.courseId) return [];
  const course = courses.find(c => c.id === doc.courseId);
  if (!course) return [];
  if (!doc.folderId) return [course.name];
  const folder = course.folders.find(f => f.id === doc.folderId);
  return folder ? [course.name, folder.name] : [course.name];
}
