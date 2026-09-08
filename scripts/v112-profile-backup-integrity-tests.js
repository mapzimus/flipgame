#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const SaveBackup = require('../js/v111-save-backup.js');
const Profile = require('../js/v112-profile.js');
const Backup = require('../js/v112-profile-backup.js');

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function testV2PayloadUsesAnExactSchema() {
  const store = Profile.createTestStore({ storage: Profile.createMemoryStorage() });
  const payload = clone(Backup.createPayload(store, {}, {}));
  payload.unexpected = 'must-not-be-discarded';
  const document = SaveBackup.createDocument(payload, {
    releaseVersion: 'v1.12', createdAt: '2026-09-08T00:00:00.000Z',
  });
  const validation = Backup.validate(JSON.stringify(document));
  assert.equal(validation.valid, false);
  assert.match(validation.message, /Unsupported FlipgameLocalSaveV2 field/);

  const missingProfile = clone(payload);
  delete missingProfile.unexpected;
  delete missingProfile.profileV4;
  const missingDocument = SaveBackup.createDocument(missingProfile, {
    releaseVersion: 'v1.12', createdAt: '2026-09-08T00:00:00.000Z',
  });
  assert.equal(Backup.validate(JSON.stringify(missingDocument)).valid, false);
}

function testHostileSetupCannotCommitProfileFirst() {
  const source = Profile.createTestStore({ storage: Profile.createMemoryStorage() });
  assert.equal(source.claimAchievement('backup-preflight-source', 'legendary').applied, true);
  const document = Backup.serialize(source, {}, { sections: {}, createdAt: 112 });

  const target = Profile.createTestStore({ storage: Profile.createMemoryStorage() });
  const before = target.snapshot();
  const hostile = Object.create(null);
  let cursor = hostile;
  for (let index = 0; index < 100; index++) {
    cursor.next = Object.create(null);
    cursor = cursor.next;
  }
  assert.throws(() => Backup.importInto(document, target, hostile), /nesting limit/);
  assert.deepEqual(target.snapshot(), before,
    'all setup validation finishes before a monotonic profile import can commit');
}

const tests = [testV2PayloadUsesAnExactSchema, testHostileSetupCannotCommitProfileFirst];
for (const test of tests) {
  test();
  console.log(`✓ ${test.name}`);
}
console.log(`v1.12 profile backup integrity tests passed (${tests.length} groups).`);
