# verified-spec-dev-app

Spec-Driven: a Solana Mobile app that takes a plain-language description of a program, guides a user through verification property review and CVLR spec generation, submits to AI Composer for code synthesis, and deploys the result to devnet.

## Demo flow

The intended demo runs end-to-end on a single Android device against a local backend (`http://10.0.2.2:8000`).

### Steps

1. **Chat — describe the program**  
   Open the Chat tab. Type a description such as _"Build a simple on-chain attestation program"_ and send. The backend drafts a Design Doc and proposes it in the Workspace tab.

2. **Workspace — confirm the Design Doc**  
   Switch to Workspace. Review the auto-drafted Design Doc (title, goal, core requirements, assumptions). Clear any missing-information items, then tap **Approve Design Doc**.

3. **Workspace — confirm verification properties**  
   The backend proposes a set of properties to prove (e.g. _"Attestation records are immutable once written"_). Review them in the Properties to Prove card and tap **Approve properties to prove**.

4. **Workspace — generate the CVLR spec**  
   The CVLR Specification card becomes active. Tap **Generate CVLR spec**. The backend writes `checks.rs` and `system_doc.txt` into the project directory and returns the content. The card shows a scrollable preview of `checks.rs`.

5. **Workspace — approve the CVLR spec**  
   Review the spec. Tap **Approve spec**. The backend records the approval and immediately submits the design doc, verification properties, and CVLR spec to AI Composer for code synthesis.

6. **Workspace — watch AI Composer run**  
   The Design Doc card shows the generation job status (`queued → running → succeeded`). Tap **Refresh** to poll. On success the card shows the generated artifact name and summary.

7. **Workspace — deploy to devnet**  
   The Deployment card becomes active. Connect a Solana wallet (Solana Mobile Wallet Adapter). Tap **Deploy to devnet**. The backend prepares the deployment transaction; the app requests a wallet signature. After signing, the program is deployed and the program ID is shown.

8. **Workspace — publish to Explore**  
   Tap **Publish project** in the Publish to Explore card. The project title and verification properties become visible to other builders.

9. **Explore tab — see the live project**  
   Switch to the Explore tab. The Projects sub-tab shows the published project card. The Properties sub-tab shows its verification properties.

### Prerequisites

- Android emulator or physical device with a Solana wallet app installed
- Local backend running at `http://localhost:8000` (forwarded via `adb reverse tcp:8000 tcp:8000`)
- AI Composer available at `/home/user/AIComposer_latest` with a configured provider

### Known backend blockers (as of 2026-05-06)

Two backend endpoints must exist before the demo can run end-to-end:

| Endpoint | Used at step | Status |
|---|---|---|
| `POST /projects/{id}/cvlr-specs` | Step 4 | Not yet implemented |
| `POST /projects/{id}/cvlr-specs/approve` | Step 5 | Not yet implemented |

Without these, the CVLR card returns an error and the generation gate stays blocked. All other steps (1–3, 6–9) depend only on endpoints that are already implemented. See `verified-spec-dev-app-specs/specs/2026-05-06-known-limitations.md` for the full limitations list.

## Technologies

- [Expo](https://expo.dev)
- [Uniwind](https://uniwind.dev/) (Tailwind CSS for React Native)
- [@solana/kit](https://github.com/solana-labs/solana-web3.js)
- [@wallet-ui/react-native-kit](https://github.com/wallet-ui/wallet-ui)

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

This steps builds the dependencies for the development client.

```bash
npm run android
```

In the output, you'll find options to open the app in a:

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Uniwind documentation](https://uniwind.dev/): Learn how to style your app with Tailwind CSS.
- [Solana documentation](https://solana.com/docs): Learn how to build on Solana.
