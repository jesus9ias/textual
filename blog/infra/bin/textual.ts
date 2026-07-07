#!/usr/bin/env node
/**
 * CDK application entrypoint. Loads `.env` (the only source of
 * environment-specific configuration), validates it, and instantiates the
 * single stack pinned to us-east-1.
 */
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { App, Tags } from 'aws-cdk-lib';
import { PROJECT_TAG_KEY, STACK_REGION } from '../lib/constants';
import { loadEnv } from '../lib/env';
import { TextualStack } from '../lib/textual-stack';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const config = loadEnv();

const app = new App();

// The stack name comes from the environment, so the same project can be deployed
// as multiple independent stacks (one per `.env` — e.g. per subdomain / fork).
// It drives both the CloudFormation stack name and the prefix of every
// auto-generated physical resource name.
const stack = new TextualStack(app, config.stackName, {
  stackName: config.stackName,
  config,
  env: {
    account: config.awsAccountId,
    region: STACK_REGION,
  },
});

Tags.of(stack).add(PROJECT_TAG_KEY, config.stackName);

app.synth();
