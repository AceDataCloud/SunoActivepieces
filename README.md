# Suno for Activepieces

Create Suno music and retrieve the **same task** through Ace Data Cloud. The Piece has two actions: **Create Suno audio task** and **Get Suno task**. A successful submission returns a task ID; it does not mean the audio is ready.

**Distribution:** [`@acedatacloud/piece-suno`](https://www.npmjs.com/package/@acedatacloud/piece-suno) is a public npm package with provenance. An administrator can install version `0.1.1` into their Activepieces instance. It is not listed in the shared Activepieces catalog. Activepieces currently permits external authors to publish Pieces as their own packages while unsolicited monorepo pull requests are paused. [中文指南](README.zh-CN.md)

## 1. Install the Piece

In Activepieces 0.92.2, open **Platform Admin → Catalogue → Pieces → Install Piece**. Select **NPM Registry**, enter `@acedatacloud/piece-suno` and version `0.1.1`, then choose **Install**. On the Community Edition instance tested for this guide, **Packed Archive (.tgz)** was disabled in the UI.

After installation, open a flow and search for **Suno by Ace Data Cloud** when adding an action. Check the Piece name, Ace Data Cloud logo and the two actions before configuring credentials. A package in a repository or on npm is not automatically listed for every Activepieces user; the administrator must install it in the target instance.

These screenshots come from an isolated Activepieces CE 0.92.2 instance where the build archive was installed through the official API. They show instance installation, not a shared catalog listing:

![Installed Suno Piece in the instance administrator catalog](https://raw.githubusercontent.com/AceDataCloud/SunoActivepieces/main/docs/screenshots/01-installed-catalog.jpg)
![Suno actions in the flow search](https://raw.githubusercontent.com/AceDataCloud/SunoActivepieces/main/docs/screenshots/02-action-search.jpg)

For developers, the package can be built without a key:

```bash
npm ci --legacy-peer-deps
npm test
npm pack
```

The `.tgz` contains compiled JavaScript and declarations. Do not put a key in the archive or a flow export.

## 2. Get an Ace Data Cloud API key

New account? Register and sign in first. If the Applications page has no General application, choose **Initialize General Application**. A General key can access the services your account is entitled to use; a service-specific key is limited to that service.

1. Sign in to [Ace Data Cloud Applications](https://platform.acedata.cloud/console/applications?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=suno_activepieces_readme_api_key).
2. Open an application with **Suno** access. Check the current [pricing](https://platform.acedata.cloud/models?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=suno_activepieces_readme_pricing) and balance before generating.
3. Use the application's copy button, or open **Manage Keys → Create** to create a separate key named `Activepieces Suno`. Set expiry, usage limits and API restrictions as needed, then copy the created key. If you restrict **Allowed APIs**, include both `/suno/audios` and `/suno/tasks`.

Use the API key itself in Activepieces, without a `Bearer ` prefix. A platform management token is not a generation API key. Keep the key in an Activepieces connection, never a prompt or flow export.

## 3. Configure a first flow

1. Choose **Start from scratch**, then select a trigger suitable for your project. For the tested on-demand example, install the official `@activepieces/piece-manual-trigger` version `0.0.8` if it is not already in your instance, and choose **Manual Trigger**.
2. Add **Suno by Ace Data Cloud → Create Suno audio task**. Create a connection with the Ace Data Cloud API key.
3. Use model `chirp-v6`, turn **Instrumental only** on, and enter this music description:

   ```text
   A short gentle instrumental piano melody for a sunrise, no vocals.
   ```

4. Optionally set **Target duration in seconds** to `10`. This is a target, not a guaranteed track length.
5. Run the creation action **once**. Save its `task_id`. Disable automatic retries on this action if your flow retries failed steps, because a repeated creation is a new billable task.
6. Add **Get Suno task** and map **Task ID** from the creation action's `task_id` output. It makes one read-only query. If it returns `pending`, wait and query that **same task ID** again. In a repeated flow, keep the creation action outside the repeat path.
7. When `status` is `succeeded` and `success` is `true`, open a URL in `media_urls`. An audio preview while the task is pending is not a final result. If status is `failed`, inspect the task or trace ID in Ace Data Cloud request history.

You can [download the credential-free quickstart flow](https://raw.githubusercontent.com/AceDataCloud/SunoActivepieces/main/examples/suno-quickstart.json) and import it with **Automations → Import → Import Flow**. The import was tested in Activepieces 0.92.2: both Suno actions and the `task_id` mapping survived. Both actions intentionally show **Select a connection** after import; configure your own key before running. The sample does not contain the test task ID, connection ID or API key.

![Imported creation action with its connection left empty](https://raw.githubusercontent.com/AceDataCloud/SunoActivepieces/main/docs/screenshots/03-imported-create-config.jpg)
![Imported lookup action mapping the previous task ID](https://raw.githubusercontent.com/AceDataCloud/SunoActivepieces/main/docs/screenshots/04-imported-flow.jpg)

The request shape below is a credential-free reference for the two actions. It is also copyable with a key stored in the `ACEDATACLOUD_API_TOKEN` environment variable:

```bash
curl -X POST https://api.acedata.cloud/suno/audios \
  -H "Authorization: Bearer $ACEDATACLOUD_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"generate","model":"chirp-v6","prompt":"A short gentle instrumental piano melody for a sunrise, no vocals.","instrumental":true,"duration":10,"callback_url":"https://api.acedata.cloud/health"}'
```

Copy the returned `task_id` and query it without submitting another generation:

```bash
curl -X POST https://api.acedata.cloud/suno/tasks \
  -H "Authorization: Bearer $ACEDATACLOUD_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"action":"retrieve","id":"<the same task_id>"}'
```

## 4. Check cost and troubleshoot

Confirm the **one** creation request, task ID and Credits deduction in [Ace Data Cloud request history and billing](https://platform.acedata.cloud/console/usages?utm_source=opensource&utm_medium=referral&utm_campaign=evergreen&utm_content=suno_activepieces_readme_request_history). Task queries do not create another song. Current prices and entitlements may change; read them in the console before each paid generation.

| Result | Action |
| --- | --- |
| 401 or 403 | Recheck the full API key, Suno access, expiry and Allowed APIs for both paths. |
| 400 | Check model, prompt and optional duration (whole seconds from 10 to 360). |
| `pending` | Wait and query the same ID. Do not repeat the creation action. |
| 429 | Reduce concurrency and wait. Avoid automatic paid retries. |
| Timeout or 5xx during creation | Inspect request history before trying again: the task may already have been accepted. |
| `failed` | Use the task or trace ID to inspect the failed request; do not share the key. |

The Piece sends the selected inputs and API key to `https://api.acedata.cloud`. It returns only final media URLs and removes internal routing fields from task output. [Source](https://github.com/AceDataCloud/SunoActivepieces) · [Support](https://github.com/AceDataCloud/SunoActivepieces/issues) · dev@acedata.cloud.

API requests verify HTTPS certificates and stay on `api.acedata.cloud`. Transport failures and HTTP errors are not retried automatically; inspect request history before resubmitting a creation. HTTPS proxy configuration is not supported by this transport.
