export type ProFeature = 'csv_export' | 'analytics' | 'gmail_parsing' | 'salary_detection';

export interface SubscriptionState {
  isPro: boolean;
  paidAt: string | null;
  email: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  lastChecked: string | null;
}

export const DEFAULT_SUBSCRIPTION: SubscriptionState = {
  isPro: false,
  paidAt: null,
  email: null,
  plan: null,
  subscriptionStatus: null,
  lastChecked: null,
};

export function isFeatureUnlocked(sub: SubscriptionState, _feature: ProFeature): boolean {
  return sub.isPro;
}
