export const currentPrivacyVersion = "2026-08-04";
export const currentTermsVersion = "2026-08-04";

export const legalDocumentUrls = {
  privacy: "https://sekai-tools.cn/privacy",
  terms: "https://sekai-tools.cn/terms",
  security: "https://sekai-tools.cn/security"
} as const;

export function isCurrentLegalAcceptance(input: {
  privacyVersion?: string;
  termsVersion?: string;
  ageConfirmed?: boolean;
} | null | undefined) {
  return Boolean(
    input?.ageConfirmed
    && input.privacyVersion === currentPrivacyVersion
    && input.termsVersion === currentTermsVersion
  );
}
