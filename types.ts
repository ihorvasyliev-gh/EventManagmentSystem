export enum UserRole {
  STAFF = 'staff',
  ADMIN = 'admin'
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export type EventStatus = 'draft' | 'published';

export type EventCategory = string;

export interface EventCategoryItem {
  id: string;
  name: string;
  createdAt: Date;
  createdBy?: string;
}

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface RecurrenceRule {
  type: RecurrenceType;
  interval?: number; // For custom: every N days/weeks/months
  endDate?: Date;
  occurrences?: number;
  daysOfWeek?: number[]; // 0-6, Sunday-Saturday
  customDates?: Date[]; // For 'custom' type: manually picked dates
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'document' | 'other';
  size: number;
  uploadedAt: Date;
}

export interface EventComment {
  id: string;
  eventId: string;
  /** Дата вхождения (для повторяющихся событий — конкретное вхождение) */
  occurrenceDate: Date;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
}

export interface EventHistoryEntry {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  changes?: Record<string, { old: any; new: any }>;
  timestamp: Date;
}

export interface Event {
  id: string;
  /** Unique key for recurring instances in UI (id_timestamp). Use for React keys; always use `id` for API. */
  instanceKey?: string;
  title: string;
  description: string;
  date: Date;
  location: string;
  posterUrl?: string; // Keep for backward compatibility
  attachments?: Attachment[];
  category?: EventCategory;
  tags?: string[];
  status: EventStatus;
  recurrence?: RecurrenceRule;
  rsvpEnabled?: boolean;
  maxAttendees?: number;
  attendees?: string[]; // User IDs
  attendeeNames?: { userId: string; userName: string }[]; // User Names (for admins)
  comments?: EventComment[];
  history?: EventHistoryEntry[];
  creatorId: string;
  createdAt: Date;
}

export type ViewMode = 'grid' | 'list' | 'agenda';

export interface EventFilters {
  search?: string;
  category?: EventCategory;
  status?: EventStatus;
  dateRange?: {
    start?: Date;
    end?: Date;
  };
  location?: string;
  creatorId?: string;
  tags?: string[];
}
