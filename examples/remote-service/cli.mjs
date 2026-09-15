#!/usr/bin/env node
import { main } from 'cli-for-agents/runtime';
import { createRemoteCli } from './commands.mjs';
await main(createRemoteCli({ directory: process.env.REMOTE_ARTIFACTS ?? '.' }));
