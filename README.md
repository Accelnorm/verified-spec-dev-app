# Spec-Driven Expo App

**EasyA x Consensus Miami 2026 Hackathon — Solana Mobile track**

Spec-Driven is a mobile app that lets a technical or non-technical dev describe a Solana program in plain language, walks them through reviewing correctness properties and a CVLR (Certora Verification Language for Rust) formal spec, submits the spec to a backend powered by Certora AI Composer for code synthesis, formally verifies the code against the Certora Solana prover, and deploys the generated program to devnet.

---

## Demo flow

The full demo runs on a single Android emulator (or physical device) against a local backend at `http://10.0.2.2:8000`.

### Prerequisites

| Requirement | Notes |
|---|---|
| Android emulator or Seeker device | API level 31+ |
| Local backend running | see `verified-spec-dev-backend` |
| AI Composer at `/home/user/AIComposer_latest` | with a configured provider |
| `adb reverse tcp:8000 tcp:8000` | routes emulator loopback to host backend |
| Solana wallet app installed on device | for deployment signing |

### Steps

1. **Chat — describe the program**
   Open the Chat tab. Type a description such as _"Build a simple on-chain attestation program"_, send and discuss. The backend drafts a Design Doc and proposes it in the Workspace tab.

2. **Workspace — approve the Design Doc**
   Review and approve the auto-drafted Design Doc (title, goal, requirements, assumptions).

3. **Workspace — approve verification properties**
   Review and approve the inferred correctness properties considered in natural language (e.g. _"Attestation records are immutable once written"_).

4. **Workspace — generate the CVLR spec**
   Tap **Generate CVLR spec**. The backend writes `checks.rs`.

5. **Workspace — approve the CVLR spec**
   Accept the spec as is or review it (marketplace for professional review to be added). Tap **Approve spec**. The backend immediately submits the design doc, properties, and CVLR spec to AI Composer for code synthesis.

6. **Workspace — let the AI Composer run**
   The Design Doc card cycles through `queued → running → succeeded`. Tap **Refresh** to poll (notifications to be added).

7. **Workspace — deploy to devnet**
   The Deployment card becomes active. Connect a Solana wallet via Solana Mobile Wallet Adapter. Provide a Squads multisig as the upgrade authority (if any). Tap **Deploy to devnet**. The backend prepares the deployment; the app requests a wallet signature. After signing, the program is deployed and the program ID is shown.

8. **Workspace — publish to Explore**
   Tap **Publish project**. The project title and verification properties become visible to other builders.

9. **Explore tab — confirm live listing**
   Switch to Explore. The published project card and its verification properties appear.

---

## Technologies

- [Expo](https://expo.dev) (Solana Mobile template)
- [Solana Mobile Wallet Adapter](https://github.com/solana-mobile/mobile-wallet-adapter) — wallet connection and transaction signing
- [@solana/kit](https://github.com/solana-labs/solana-web3.js) — RPC and transaction construction
- [@wallet-ui/react-native-kit](https://github.com/wallet-ui/wallet-ui)
- [Uniwind](https://uniwind.dev/) — Tailwind CSS for React Native

---

## Running locally

```bash
npm install
npm run android
```

The app connects to `http://10.0.2.2:8000` (Android emulator loopback). Run `adb reverse tcp:8000 tcp:8000` before starting if the emulator cannot reach the host backend.

---

## Known gaps

- No user authentication — the device is the implicit session boundary for the local demo.
- Backend URL is hardcoded to the emulator loopback; no settings UI to point at a remote backend.
- Explore shows only the current user's published project — no multi-user feed yet.
- App settings (Expo account, EAS token) are in-memory only; not persisted or sent to the backend.
- More iteration on setting up the formal verification cycle for robustness (e.g., prompting, RAG, assuring sound property suggestion, finetuning for CVLR generation)
