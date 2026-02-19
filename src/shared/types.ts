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
export type Message =
  | { type: 'ADD_APPLICATION'; payload: Omit<Application, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_APPLICATION'; payload: { id: string } & Partial<Application> }
  | { type: 'DELETE_APPLICATION'; payload: { id: string } }
  | { type: 'GET_APPLICATIONS'; payload?: undefined }
  | { type: 'APPLICATION_DETECTED'; payload: Omit<Application, 'id' | 'createdAt' | 'updatedAt' | 'status'> };
