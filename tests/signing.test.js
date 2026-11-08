import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSigningPreflight } from '../signing/preflight.js';

const sample = () => ({
  method: 'ad_hoc', bundleId: 'ae.plusstore.testapp', ownsApp: true, distributionAuthorized: true,
  deviceUdid: 'DEVICE-001',
  ipaInspected: true, appleProfileSignatureVerified: true, localCodesignIdentityAvailable: true,
  profile: { teamId: 'TEAM01', kind: 'ad_hoc', expiration: '2027-11-08T00:00:00Z',
    allowedBundleIds: ['ae.plusstore.testapp'], deviceUdids: ['DEVICE-001'],
    certificateFingerprints: ['ABCD1234'] },
  certificate: { teamId: 'TEAM01', fingerprint: 'ABCD1234', expiration: '2027-11-08T00:00:00Z', hasPrivateKey: true }
});
const now = new Date('2026-11-08T07:29:00Z');
test('complete metadata returns preflight-pass but never signed', () => {
  const r = checkSigningPreflight(sample(), now);
  assert.equal(r.status, 'preflight_passed_not_signed');
  assert.equal(r.failures.length, 0);
});
test('expired certificate blocks signing', () => {
  const s = sample(); s.certificate.expiration = '2026-01-01T00:00:00Z';
  assert.equal(checkSigningPreflight(s, now).status, 'blocked');
});
test('unknown device blocks Ad Hoc', () => {
  const s = sample(); s.deviceUdid = 'ANOTHER';
  assert.ok(checkSigningPreflight(s, now).failures.some(x => x.includes('not registered')));
});
test('certificate team mismatch blocks signing', () => {
  const s = sample(); s.certificate.teamId = 'WRONG';
  assert.ok(checkSigningPreflight(s, now).failures.some(x => x.includes('teams differ')));
});
test('unapproved distribution blocks signing', () => {
  const s = sample(); s.distributionAuthorized = false;
  assert.equal(checkSigningPreflight(s, now).status, 'blocked');
});
test('missing private key and IPA inspection block signing', () => {
  const s = sample(); s.certificate.hasPrivateKey = false; s.ipaInspected = false;
  assert.ok(checkSigningPreflight(s, now).failures.length >= 2);
});
