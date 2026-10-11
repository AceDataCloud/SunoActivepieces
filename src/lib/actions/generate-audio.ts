import { createAction, Property } from '@activepieces/pieces-framework';

import { sunoAuth } from '../auth';
import { sunoClient } from '../common/client';

export const generateAudio = createAction({
  name: 'generate_audio',
  displayName: 'Create Suno audio task',
  description: 'Submit one music generation and return its task ID. This action does not wait for the final audio.',
  auth: sunoAuth,
  props: {
    prompt: Property.LongText({
      displayName: 'Music description',
      description: 'Describe the music to generate. Use Get Suno task with the returned task ID to check the result.',
      required: true,
    }),
    model: Property.StaticDropdown({
      displayName: 'Model',
      required: true,
      defaultValue: 'chirp-v6',
      options: {
        options: [
          { label: 'Suno v6', value: 'chirp-v6' },
          { label: 'Suno v6 Mini', value: 'chirp-v6-mini' },
          { label: 'Suno v6 Wild', value: 'chirp-v6-wild' },
        ],
      },
    }),
    instrumental: Property.Checkbox({
      displayName: 'Instrumental only',
      required: false,
      defaultValue: true,
    }),
    duration: Property.Number({
      displayName: 'Target duration in seconds',
      description: 'Optional target from 10 to 360 seconds; actual duration may differ.',
      required: false,
    }),
  },
  async run(context) {
    const { prompt, model, instrumental, duration } = context.propsValue;
    if (duration !== undefined && (!Number.isInteger(duration) || duration < 10 || duration > 360)) {
      throw new Error('Target duration must be a whole number from 10 to 360 seconds.');
    }
    const response = await sunoClient.postSuno({
      token: context.auth.secret_text,
      path: '/suno/audios',
      body: {
        action: 'generate',
        prompt,
        model,
        instrumental: instrumental ?? false,
        ...(duration === undefined ? {} : { duration }),
        callback_url: 'https://api.acedata.cloud/health',
      },
    });
    const taskId = sunoClient.taskIdFromSubmission(response);
    if (!taskId) {
      throw new Error('No task ID was returned. Inspect request history before submitting again.');
    }
    return { task_id: taskId, status: 'pending', success: false };
  },
});
