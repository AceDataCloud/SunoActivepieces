import { createPiece } from '@activepieces/pieces-framework';

import { generateAudio } from './lib/actions/generate-audio';
import { getTask } from './lib/actions/get-task';
import { sunoAuth } from './lib/auth';

export const suno = createPiece({
  displayName: 'Suno by Ace Data Cloud',
  description: 'Create Suno music and retrieve the same task through Ace Data Cloud.',
  logoUrl: 'https://cdn.acedata.cloud/assets/logo.png',
  authors: ['Ace Data Cloud'],
  minimumSupportedRelease: '0.92.2',
  auth: sunoAuth,
  actions: [generateAudio, getTask],
  triggers: [],
});
