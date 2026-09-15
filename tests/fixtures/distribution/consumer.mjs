#!/usr/bin/env node
import { main } from 'cli-for-agents/runtime';
import { cli } from './registry.mjs';

await main(cli);
