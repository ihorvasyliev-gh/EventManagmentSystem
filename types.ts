export enum UserRole {
  STAFF = 'staff',
  ADMIN = 'admin'
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  /** Set after an admin created the account or reset the password: the app asks for a new one */
  mustChangePassword?: boolean;
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
  /**
   * Per-date end times, one per `customDates` entry. When set, every picked date keeps its
   * own start (the time stored in `customDates`) and end time instead of the series time.
   */
  customEndDates?: Date[];
  /**
   * Address of each `customDates` entry, for a series held in different places. An empty
   * entry means the event's own `location`.
   */
  customLocations?: string[];
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'pdf' | 'document' | 'other';
  size: number;
  uploadedAt: Date;
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
  endDate?: Date;
  location: string;
  posterUrl?: string; // Keep for backward compatibility
  attachments?: Attachment[];
  category?: EventCategory;
  tags?: string[];
  status: EventStatus;
  submitterName?: string;
  submitterEmail?: string;
  recurrence?: RecurrenceRule;
  history?: EventHistoryEntry[];
  creatorId?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export type ViewMode = 'grid' | 'week' | 'agenda';

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
  submitterEmail?: string;
  tags?: string[];
}
