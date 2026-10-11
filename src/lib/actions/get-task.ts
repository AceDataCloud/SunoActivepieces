import { createAction, Property } from '@activepieces/pieces-framework';

import { sunoAuth } from '../auth';
import { sunoClient } from '../common/client';

export const getTask = createAction({
  name: 'get_task',
  displayName: 'Get Suno task',
  description: 'Retrieve one existing task ID. Pending previews are not final audio.',
  auth: sunoAuth,
  props: {
    taskId: Property.ShortText({
      displayName: 'Task ID',
      description: 'Map the task_id output from Create Suno audio task. Query this same ID until it succeeds or fails.',
      required: true,
    }),
  },
  async run(context) {
    const taskId = context.propsValue.taskId.trim();
    if (!taskId) {
      throw new Error('A task ID is required.');
    }
    const response = await sunoClient.postSuno({
      token: context.auth.secret_text,
      path: '/suno/tasks',
      body: { action: 'retrieve', id: taskId },
    });
    return sunoClient.normalizeTask({ body: response, taskId });
  },
});
