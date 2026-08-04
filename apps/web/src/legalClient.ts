export const CURRENT_PRIVACY_VERSION = "2026-08-04";
export const CURRENT_TERMS_VERSION = "2026-08-04";

export const currentLegalAcceptance = {
  privacyVersion: CURRENT_PRIVACY_VERSION,
  termsVersion: CURRENT_TERMS_VERSION,
  ageConfirmed: true as const,
  source: "web" as const
};
