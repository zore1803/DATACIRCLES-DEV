/*
 * Multi-organization identity: one person can have a User record in several
 * organizations, so email / auth0Id / profileEmail can no longer be globally unique.
 *
 * Drops the old global unique indexes on the users collection (email_1, auth0Id_1,
 * profileEmail_1, phone_1) and creates the per-organization ones declared in models/User.js,
 * plus the personId lookup index.
 *
 * Safe to re-run. Touches only indexes, never documents.
 *
 *   node scripts/migrateUserIdentityIndexes.js            # dry run: prints the plan
 *   node scripts/migrateUserIdentityIndexes.js --apply
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

const APPLY = process.argv.includes('--apply');
// phone is included: models/User.js documents it as NOT unique (shared family/office numbers, and now
// one person's several organization records), but some databases still carry the old unique index.
const OLD_GLOBAL_UNIQUE = ['email', 'auth0Id', 'profileEmail', 'phone'];

const isOldGlobalUnique = (index) => {
  const keys = Object.keys(index.key || {});
  return index.unique && keys.length === 1 && OLD_GLOBAL_UNIQUE.includes(keys[0]);
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const dbName = mongoose.connection.name;
  const collection = User.collection;

  const before = await collection.indexes();
  const toDrop = before.filter(isOldGlobalUnique);

  console.log(`Database: ${dbName}`);
  console.log('\nCurrent indexes on users:');
  before.forEach((i) => console.log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? '  unique' : ''}${i.sparse ? '  sparse' : ''}`));

  console.log('\nWill DROP (old global unique):');
  if (toDrop.length === 0) console.log('  (none, already migrated)');
  toDrop.forEach((i) => console.log(`  ${i.name}  ${JSON.stringify(i.key)}`));

  console.log('\nWill ENSURE (declared in models/User.js):');
  console.log('  auth0Id_1_organization_1, email_1_organization_1, profileEmail_1_organization_1 (unique, partial)');
  console.log('  personId_1, phone_1 (plain lookup index, not unique)');

  if (!APPLY) {
    console.log('\nDRY RUN: re-run with --apply to make these changes.');
    await mongoose.disconnect();
    return;
  }

  for (const index of toDrop) {
    await collection.dropIndex(index.name);
    console.log(`Dropped ${index.name}`);
  }
  await User.createIndexes();

  const after = await collection.indexes();
  console.log('\nIndexes on users now:');
  after.forEach((i) => console.log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? '  unique' : ''}`));

  await mongoose.disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
