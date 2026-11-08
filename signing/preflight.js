/**
 * Signing preflight is metadata validation, NOT cryptographic signing.
 * Never treat "ready" as proof an IPA installs or runs.
 */
export const METHODS = Object.freeze(['development','ad_hoc','app_store','custom_app','enterprise_internal']);
const bundlePattern = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
export function checkSigningPreflight(input, now = new Date()) {
  const failures = [];
  const cautions = [];
  if (!input || typeof input !== 'object') return { status: 'blocked', failures: ['Missing signing metadata'], cautions };
  const { method, bundleId, profile, certificate, deviceUdid, distributionAuthorized, ownsApp } = input;
  if (!METHODS.includes(method)) failures.push('Unsupported distribution method');
  if (typeof bundleId !== 'string' || !bundlePattern.test(bundleId)) failures.push('Invalid app bundle ID');
  if (ownsApp !== true) failures.push('App ownership or distribution permission not confirmed');
  if (distributionAuthorized !== true) failures.push('Apple distribution eligibility not confirmed');
  if (!profile || typeof profile !== 'object') failures.push('Provisioning profile metadata missing');
  if (!certificate || typeof certificate !== 'object') failures.push('Certificate metadata missing');
  const dateOk = (value, label) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      failures.push(label + ' expiration unknown');
      return;
    }
    if (date.getTime() <= now.getTime()) failures.push(label + ' expired');
  };
  if (profile && typeof profile === 'object') {
    dateOk(profile.expiration, 'Provisioning profile');
    if (typeof profile.teamId !== 'string' || !profile.teamId) failures.push('Profile team ID missing');
    if (!Array.isArray(profile.allowedBundleIds) || !profile.allowedBundleIds.includes(bundleId)) failures.push('Bundle ID not explicitly allowed by profile');
    if (method === 'ad_hoc' || method === 'development') {
      if (!deviceUdid || typeof deviceUdid !== 'string') failures.push('Test device UDID missing');
      if (!Array.isArray(profile.deviceUdids) || !profile.deviceUdids.includes(deviceUdid)) failures.push('Test device is not registered in profile');
    }
    if (method === 'enterprise_internal' && profile.enterpriseInternal !== true) failures.push('Enterprise internal-only authorization not confirmed');
    if (method === 'app_store' && profile.kind !== 'app_store') failures.push('App Store distribution profile required');
    if (method === 'ad_hoc' && profile.kind !== 'ad_hoc') failures.push('Ad Hoc provisioning profile required');
  }
  if (certificate && typeof certificate === 'object') {
    dateOk(certificate.expiration, 'Signing certificate');
    if (!certificate.teamId || !profile || certificate.teamId !== profile.teamId) failures.push('Certificate and profile teams differ');
    if (!certificate.fingerprint || !profile || !Array.isArray(profile.certificateFingerprints) || !profile.certificateFingerprints.includes(certificate.fingerprint)) {
      failures.push('Signing certificate is not included in profile');
    }
    if (certificate.hasPrivateKey !== true) failures.push('Private key is not confirmed available on signing Mac');
  }
  if (!input.ipaInspected) failures.push('IPA structure and embedded app metadata have not been inspected');
  if (!input.appleProfileSignatureVerified) failures.push('Apple provisioning profile signature not verified');
  if (!input.localCodesignIdentityAvailable) failures.push('Signing identity has not been verified on a Mac');
  cautions.push('Preflight alone does not sign an IPA, verify the resulting signature, or prove installation on an iPhone.');
  return { status: failures.length ? 'blocked' : 'preflight_passed_not_signed', failures, cautions };
}
