export type ApplicationStatus = 'applied' | 'interviewing' | 'offer' | 'closed';

export type DetectionMethod = 'manual' | 'auto';

export interface Application {
  id: string;
  company: string;
  role: string;
  status: ApplicationStatus;
  dateApplied: string;       // ISO date string (YYYY-MM-DD)
  sourceUrl: string;         // URL of the job listing, or empty for manual
  sourcePlatform: string;    // "linkedin", "indeed", "manual", etc.
  notes: string;
  detectedBy: DetectionMethod;
  salary?: string | null;    // Detected salary range, e.g. "$80,000 - $100,000/yr"
  createdAt: string;         // ISO datetime
  updatedAt: string;         // ISO datetime
}

export interface StorageData {
  applications: Application[];
  settings: UserSettings;
}

export interface UserSettings {
  followUpDays: number;      // Days before follow-up nudge (default 7)
  theme: 'system' | 'light' | 'dark';
}

/** Messages between popup/content scripts and background service worker */
/** Cached job data for cross-tab handoff via background service worker */
export interface CachedJobData {
  company: string;
  role: string;
  url: string;
  jk: string;
  timestamp: number;
}

export type Message =
  | { type: 'ADD_APPLICATION'; payload: Omit<Application, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_APPLICATION'; payload: { id: string } & Partial<Application> }
  | { type: 'DELETE_APPLICATION'; payload: { id: string } }
  | { type: 'GET_APPLICATIONS'; payload?: undefined }
  | { type: 'APPLICATION_DETECTED'; payload: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'status'> }
  | { type: 'CACHE_JOB_DATA'; payload: CachedJobData }
  | { type: 'GET_CACHED_JOB'; payload?: undefined }
  | { type: 'GET_SUBSCRIPTION'; payload?: undefined }
  | { type: 'OPEN_PAYMENT_PAGE'; payload?: undefined }
  | { type: 'REFRESH_SUBSCRIPTION'; payload?: undefined }
  | { type: 'CONNECT_GMAIL'; payload?: undefined }
  | { type: 'DISCONNECT_GMAIL'; payload?: undefined }
  | { type: 'GET_GMAIL_STATUS'; payload?: undefined }
  | { type: 'CHECK_GMAIL_NOW'; payload?: undefined }
  | { type: 'ENABLE_UNIVERSAL_DETECTOR'; payload?: undefined }
  | { type: 'DISABLE_UNIVERSAL_DETECTOR'; payload?: undefined }
  | { type: 'GET_UNIVERSAL_DETECTOR_STATUS'; payload?: undefined };
