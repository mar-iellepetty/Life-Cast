# LifeCast with Lincoln

LifeCast combines a landing page, five-tab planning workspace, colored 3D Lincoln avatar, and a Node backend for Bedrock, Polly and CalcXML. `INTEGRATION-SOURCES.txt` records the source repository and imported revision.

## Open the app

Install **Node 22.13 or newer**, then run these commands from the repository root:

```sh
npm ci
npm start
```

`npm start` builds the website and serves it together with the API at **http://127.0.0.1:8790/**. Keep the server running. If LifeCast is already running there, the launcher reuses that server. Open the address manually if a browser does not open automatically.

The repository does not include AWS credentials. Configure your own AWS access before using live AI replies and Polly speech, as described below. Local microphone transcription on Windows additionally needs the optional runtime in [`local-voice/README.md`](local-voice/README.md). Typed chat and Polly playback do not require that runtime.

The landing page keeps the existing portrait and statue photo sequence. Click **Open Avatar** or **Meet Lincoln** to load the 3D guide. Type a question, or select **Start voice conversation** and allow microphone access. Use **Send now** to finish a recording manually. **End voice conversation** stops both recording and playback. If the browser blocks sound, use the visible **Play audio** button.

Choose **Start assessment** to open the integrated workspace at `/studio`. Its five tabs are **Introduction**, **Financial Planning**, **Life Events**, **Review & Plan**, and **Report**. Introduction supports the original question-by-question chat and an optional Bedrock description flow with a confirmation step. The planning guide and **Meet Lincoln** share a conversation for each selected plan. Reports include returned calculator line items, household inputs, assumptions, planned events, **Print / Save PDF**, and a JSON **Download data** export.

The prior studio remains available at `/classic-studio`.

Chrome and Edge can use the microphone at localhost. Embedded browser permission support may vary; opening the same address in Chrome or Edge is the recovery option. The app shows microphone permission, input-level and playback errors rather than hanging silently.

## Connected services

| Service | Actual use |
| --- | --- |
| Amazon Bedrock | `amazon.nova-lite-v1:0` in `us-east-1`, via Converse. Avatar replies, landing/intake chat, structured intake, scenario extraction and explanations. |
| Amazon Polly | Neural **Matthew** voice. The audio and viseme requests use the same text, voice and engine. The face follows `audio.currentTime`. |
| CalcXML Ins01 | Current household coverage assessment and report figures. Currently uses the backend's **documented sample credentials**, not licensed production credentials. |
| Optional local Whisper | English microphone transcription on Windows, using `tiny.en`. Install the runtime separately; model files and binaries are excluded from Git. |
| Windows SAPI | Explicitly labeled fallback when Polly fails; audio and mouth cues come from the same synthesis. |
| Local educational retrieval | The existing backend's keyword knowledge retrieval. It is not a Bedrock Knowledge Base. |

The original backend includes SDK packages or plans for Transcribe Streaming, Bedrock Agent Runtime, S3/Knowledge Bases, AgentCore, Lambda/API Gateway and DynamoDB. Those services are **not deployed or silently enabled by this integration**. No AWS infrastructure or IAM policies were changed.

The avatar is the existing colored, rigged GLB. Its live facial animation uses jaw, smile, pucker, funnel and two blink morphs. It does not autoplay the GLB's baked demonstration clip. It loads only when the dialog is opened and releases the 3D scene when closed.

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

**Save plans** stores the selected plan and alternatives in this browser's `localStorage` under `lifecast-integrated-plans-v2`, so they can be resumed after refresh. Save again after making changes. Storage errors are shown, and saved data is validated before use. This is local to the current browser/origin; it is not an account or cloud backup. Report data can also be downloaded. The original friend's storage namespace is untouched. Chat history stays in memory and resets after refresh.

The preserved `/classic-studio` uses its older session-only save behavior. Its Future B scenario is a snapshot after the final selected event, not an annual forecast. No private Base44 records, hosted authentication or durable database were imported.

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

- `src/components/lifecast/AvatarDialog.jsx`: chat and voice controls.
- `src/components/lifecast/AnimatedAvatar.jsx`: lazy 3D view and audio-clock mouth animation.
- `src/hooks/useAvatarVoice.js`: playback, microphone lifecycle and voice conversation loop.
- `src/api/lifecastApi.js`: same-origin backend requests; the old Base44-shaped adapter delegates here.
- `src/planner/`: adapted chat, planning tabs, charts, event editing and reports from the original Life-Cast workspace.
- `src/planner/lib/backend.ts`: current-household CalcXML mapping, shared assessment cache and AI context.
- `src/planner/agent/lincoln.ts`: shared per-plan Bedrock conversation for chat and avatar.
- `src/planner/state/store.ts`: plan updates and validated local browser persistence.
- `src/lib/lifecastModel.js`: profile/event mapping and authoritative result mapping.
- `server/index.mjs`: Bedrock gateway, private local voice integration and production file serving.
- `server/bedrock.mjs`, `voice.mjs`, `calcxml.mjs`: the connected providers.
- `server/local-voice.mjs` and `local-voice/README.md`: optional Windows transcription and speech fallback setup.
- `public/assets/lincoln-talking.glb`: the colored animated model.
