/**
 * First hotel on a fresh install (or a new client): `npm run create-hotel -- --hotel "Hotel Sunrise" --owner "Asha Mehta" --email asha@sunrise.in`
 * In Docker: `docker compose run --rm tools npm run create-hotel -- …` (see deploy/README.md).
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { pool } from './index';
import { appUrl } from '../server/app-url';
import { createHotel, OnboardingError } from '../server/services/onboarding';

const HELP = `Create a hotel with its owner login.

  npm run create-hotel -- --hotel "Hotel Sunrise" --owner "Asha Mehta" --email asha@sunrise.in

  --hotel           Hotel name (required)
  --owner           Owner's full name (required)
  --email           Owner's email to sign in with      } at least one
  --mobile          Owner's 10-digit mobile number     }
  --password        First password (8+ characters). Left out: one is made up and shown once
  --city            City
  --org             Organisation name (default: the hotel name)
  --org-id          Add the hotel to an existing organisation instead
  --plan            trial | starter | pro | enterprise (default: trial)
  --platform-admin  This login can also open the platform console (/admin)

An owner who already has a login keeps their password and sees the new hotel in the hotel switcher.`;

async function main() {
  const { values } = parseArgs({
    options: {
      hotel: { type: 'string' },
      owner: { type: 'string' },
      email: { type: 'string' },
      mobile: { type: 'string' },
      password: { type: 'string' },
      city: { type: 'string' },
      org: { type: 'string' },
      'org-id': { type: 'string' },
      plan: { type: 'string' },
      'platform-admin': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  if (values.help || !values.hotel) {
    console.log(HELP);
    process.exitCode = values.help ? 0 : 1;
    return;
  }
  if (!values.owner) {
    console.error('✖ Add --owner with the owner\'s full name.\n\nRun with --help for the options.');
    process.exitCode = 1;
    return;
  }

  const result = await createHotel({
    hotelName: values.hotel,
    city: values.city,
    organizationName: values.org,
    organizationId: values['org-id'],
    plan: values.plan as 'trial' | undefined,
    ownerName: values.owner,
    ownerEmail: values.email,
    ownerMobile: values.mobile,
    ownerPassword: values.password,
    platformAdmin: values['platform-admin'],
  });

  console.log(`\n✔ ${values.hotel} created (short code ${result.shortCode})\n`);
  console.log(`  Sign in at   ${appUrl('/login')}`);
  console.log(`  Login        ${result.login}`);
  if (result.generatedPassword) console.log(`  Password     ${result.generatedPassword}   (shown only now: note it down, they can change it after signing in)`);
  else if (result.existingUser) console.log('  Password     unchanged: this person already had a login, and the new hotel is in their hotel switcher');
  console.log(`  Booking page ${appUrl(`/book/${result.slug}`)}`);
  console.log('\n  The owner finishes hotel details, rooms, rates and OTAs in Settings → Setup Wizard, then goes live.\n');
}

main()
  .catch((error) => {
    if (error instanceof ZodError) console.error(`✖ ${error.issues.map((i) => i.message).join('\n✖ ')}\n\nRun with --help for the options.`);
    else if (error instanceof OnboardingError) console.error(`✖ ${error.message}`);
    else console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
