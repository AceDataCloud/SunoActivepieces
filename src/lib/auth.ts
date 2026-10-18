import { PieceAuth } from '@activepieces/pieces-framework';

export const sunoAuth = PieceAuth.SecretText({
  displayName: 'Ace Data Cloud API key',
  description: 'Register or sign in at [Applications](https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=suno_activepieces_connection_api_key). If needed choose Initialize General Application, then copy the key or use Manage Keys → Create for a dedicated Activepieces key. Check service permissions, balance, current pricing and Allowed APIs in the guide. Paste only the API key without Bearer; a platform management token is not a generation key.',
  required: true,
});
