# LifeCast with Lincoln

LifeCast combines a landing page, five-tab planning workspace, text-based Lincoln guide, and a Node backend for Bedrock, Polly and CalcXML. `INTEGRATION-SOURCES.txt` records the source repository and imported revision.

## Hosted deployment

The production build is hosted by AWS Amplify at `https://main.d2igmcf14gibvl.amplifyapp.com`. The app is `d2igmcf14gibvl` in `us-east-2`; `/api/*` is rewritten to the dedicated `lifecast-api` HTTP API/Lambda in `us-east-1`. The browser continues to use same-origin requests. The Lambda handler is `server/lambda.handler` with API Gateway payload format 2.0, Node 22, 512 MB, a 29-second timeout and reserved concurrency 2. Its `PUBLIC_ORIGIN` must equal the HTTPS site origin. Bedrock and Polly use the execution role; do not configure AWS access keys.

Run `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` before publishing. `node scripts/package-api.mjs` prepares `.deployment/api` for a Lambda ZIP; package the directory contents, not the parent folder. Amplify receives the contents of `dist`. The app's rewrite rules put `/api/*` first and route `/studio` and `/classic-studio` to `index.html`. `amplify.yml` contains the build and security-header settings.

Deployment is manual because the connected GitHub account can push but cannot manage this repository's webhooks. Pushing `main` alone does not redeploy. The hosted version is a public demo without user accounts: API throttling, bounded requests and Lambda concurrency reduce abuse, but they are not authentication or a total spending cap. CalcXML remains in its documented sample mode until licensed credentials are configured server-side. Saved plans remain browser-local; the app does not provide encrypted cloud storage.

## Open the app

Install **Node 22.13 or newer**, then run these commands from the repository root:

```sh
npm ci
npm start
```

`npm start` builds the website and serves it together with the API at **http://127.0.0.1:8790/**. Keep the server running. If LifeCast is already running there, the launcher reuses that server. Open the address manually if a browser does not open automatically.

The repository does not include AWS credentials. Configure your own AWS access before using live AI replies and Polly speech, as described below. The optional intake **Hear question** control uses Polly playback and does not need a microphone or local model. The retained local transcription API needs the optional runtime in [`local-voice/README.md`](local-voice/README.md).

The landing page keeps the existing portrait and statue photo sequence. The interactive 3D avatar and Meet Lincoln controls have been removed. Use **Start assessment** for the planning workspace and its text chat.

Choose **Start assessment** to open the integrated workspace at `/studio`. Its five tabs are **Introduction**, **Financial Planning**, **Life Events**, **Review & Plan**, and **Report**. Introduction supports the original question-by-question chat and an optional Bedrock description flow with a confirmation step. The text guide keeps a separate, bounded conversation for each selected plan. Reports include returned calculator line items, household inputs, assumptions, planned events, **Print / Save PDF**, and a JSON **Download data** export.

The prior studio remains available at `/classic-studio`.

Intake speech is optional and starts only when **Hear question** is selected. Playback failures are shown with a retry control. The current interface does not request microphone access.

## Connected services

| Service | Actual use |
| --- | --- |
| Amazon Bedrock | `amazon.nova-lite-v1:0` in `us-east-1`, via Converse. Planning chat, structured intake, scenario extraction and explanations. |
| Amazon Polly | Neural **Matthew** voice. Optional spoken intake questions. Existing speech API responses also contain matching timing marks. |
| CalcXML Ins01 | Current household coverage assessment and report figures. Currently uses the backend's **documented sample credentials**, not licensed production credentials. |
| Optional local Whisper | Retained transcription API on Windows, using `tiny.en`; not used by the current UI. Model files and binaries are excluded from Git. |
| Windows SAPI | Explicitly labeled fallback when Polly fails; audio and mouth cues come from the same synthesis. |
| Local educational retrieval | The existing backend's keyword knowledge retrieval. It is not a Bedrock Knowledge Base. |

The original backend also contained plans for Transcribe Streaming, Bedrock Agent Runtime, S3/Knowledge Bases, AgentCore, Lambda/API Gateway and DynamoDB. Those services are **not deployed or silently enabled by this integration**. No AWS infrastructure or IAM policies were changed.


## Credentials and configuration

AWS access stays in the Node server and uses the standard SDK credential chain. Configure a local AWS profile or another supported credential source with access to the selected Bedrock model and Polly synthesis. Set `AWS_PROFILE` when using a named profile. Credentials are supplied by each developer and are not included in this repository. No AWS keys belong in frontend files or `VITE_` variables.

Optional settings can be placed in `.env` (copy `.env.example`). `npm start` and `npm run server` read that file. Supported settings include `AWS_REGION`, `AWS_PROFILE`, `BEDROCK_MODEL_ID`, `POLLY_VOICE`, and licensed `CALCXML_USERNAME` / `CALCXML_PASSWORD` if available. The launcher uses port 8790. Polly's engine is neural; choose a voice supporting neural speech and viseme marks.

Ordinary Bedrock and Polly requests use the AWS account's normal service billing. No additional service subscription is required by the code.

## Development

After `npm ci`, start the backend:

```sh
npm run server
```

In a second terminal:

```sh
npm run dev
```

Development URL: http://127.0.0.1:5175/. Vite proxies `/api` to the backend at port 8790. `npm start` serves the production build without Vite. The backend binds to localhost and only serves `dist/`; model files, credentials and backend source outside that directory are not public assets. This local app has no user authentication or internet deployment.

## Calculator and saved state

The new workspace sends editable household facts and assumptions to CalcXML. Bedrock explanations receive the actual returned assessment and its calculator inputs. Calculator failures appear with a retry action; a local estimate is not substituted for a failed provider result.

The life-event timelines and multi-plan charts use a **separate illustrative projection**. They model future income, dependent support, education and debt paydown; their figures can differ from the current CalcXML assessment. Future events are not added to the current assessment until their scheduled age. Past/current event obligations are additive, so avoid entering the same debt or dependent twice. The report lists the adapter's assumptions, including missing individual child ages and spouse income. No generated premium quotes or automatic product recommendations are shown.

**Save plans** stores the selected plan and alternatives in this browser's `localStorage` under `lifecast-integrated-plans-v2`, so they can be resumed after refresh. Save again after making changes. Storage errors are shown, and saved data is validated before use. This is local to the current browser/origin; it is not an account or cloud backup. Report data can also be downloaded. The original friend's storage namespace is untouched. Chat history stays in memory, is bounded, and is cleared on leaving the workspace or starting over. **Delete saved plans** on the resume banner removes the saved copy after confirmation; **Start over** alone does not delete saved data.

The preserved `/classic-studio` uses its older session-only save behavior. Its Future B scenario is a snapshot after the final selected event, not an annual forecast. No private Base44 records, hosted authentication or durable database were imported.

## Data flow and security checks

Household information and questions go to the local Node API, then to the configured Bedrock and CalcXML services as needed. Spoken questions go to Polly. Fonts and images are served locally; no analytics or third-party font requests are added. Saved financial details remain in browser localStorage until explicitly deleted. They are not encrypted or shared across accounts.

The service is a localhost development app, not an authenticated multi-user deployment. Host/origin validation, static real-path containment, provider cancellation/deadlines, bounded request handling, safe error responses and a production content security policy are covered by regression tests. API and speech responses use no-store caching.

Production dependencies pass `npm audit --omit=dev`. The full development dependency tree still reports the unpatched [braces stack-exhaustion advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) through Tailwind 3 build tooling. Application input is not passed to that build-time glob parser; this is a remaining development-tool risk, not a claim that the dependency is fixed.

## Verification

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Focused tests cover Bedrock-only routing, request validation, paired Polly speech marks, local fallback, transcription, protected source paths, planner mapping, saved-plan validation, cancellation and calculator grounding. Both the existing JavaScript app and imported TypeScript workspace have type and lint checks. Separate isolated browser checks exercise the five tabs, plan editing/comparison, saved-plan resume, mobile layouts, printable reports, and voice lifecycle cases.

Integration checks on the development machine verified Bedrock intake and replies, Polly audio with visemes, local Whisper transcription, CalcXML scenario changes and future-comparison explanations. These live services require configuration on each new machine. Physical microphone hardware and embedded browser permission behavior were not verified automatically.

## Important files

- `src/hooks/useAvatarVoice.js`: playback, microphone lifecycle and voice conversation loop.
- `src/api/lifecastApi.js`: same-origin backend requests; the old Base44-shaped adapter delegates here.
- `src/planner/`: adapted chat, planning tabs, charts, event editing and reports from the original Life-Cast workspace.
- `src/planner/lib/backend.ts`: current-household CalcXML mapping, shared assessment cache and AI context.
- `src/planner/agent/lincoln.ts`: bounded per-plan Bedrock text conversations.
- `src/planner/state/store.ts`: plan updates and validated local browser persistence.
- `src/lib/lifecastModel.js`: profile/event mapping and authoritative result mapping.
- `server/index.mjs`: Bedrock gateway, private local voice integration and production file serving.
- `server/bedrock.mjs`, `voice.mjs`, `calcxml.mjs`: the connected providers.
- `server/local-voice.mjs` and `local-voice/README.md`: optional Windows transcription and speech fallback setup.
