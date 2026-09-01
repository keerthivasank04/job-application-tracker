import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };
import { UserCollection } from '../collections/user-collection';
import { ApplicationCollection } from '../collections/application-collection';

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
  collections: {
    users: UserCollection,
    applications: ApplicationCollection,
  },
});
