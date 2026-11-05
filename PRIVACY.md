# Privacy Policy for Aftermove — Chess Review

**Last Updated:** November 2026  
**Extension:** Aftermove — Chess Review  
**Developer:** mig2165 (Independent Developer)  
**Repository:** [https://github.com/mig2165/Chess_ai](https://github.com/mig2165/Chess_ai)

---

## 1. Overview & Commitment to Privacy

**Aftermove — Chess Review** is built on a privacy-first foundation. The extension is designed to run silently and locally on your device. We believe your chess games, study habits, and personal data belong to you.

- **We do NOT collect personal information.**
- **We do NOT track or profile your browsing activity.**
- **We do NOT sell, lease, or monetize your data.**
- **We do NOT operate tracking or telemetry servers.**

---

## 2. Information Handled by the Extension

### Local Game Records & Stockfish Calculations
- **How It Works:** When you play a game on Chess.com with recording active, Aftermove reads move notations from your active browser tab's DOM to construct a portable game notation (PGN).
- **Where It Stays:** All engine evaluations and move classifications (blunders, mistakes, accuracies) are performed **100% locally on your own machine** using Stockfish WebAssembly.
- **Storage:** Your recorded game PGN and review settings are saved solely in your browser's sandboxed local storage (`chrome.storage.local`). They never leave your device.

### User Preferences
- Settings such as engine analysis depth (Quick, Standard, Deep), move sounds, and theme preferences are stored locally on your device via `chrome.storage.local`.

### Optional AI Coach Feature
- **Strictly Opt-In:** Aftermove includes an optional AI Coach feature for natural-language explanations. This feature is disabled by default.
- **Your Own API Key:** If you choose to enable the AI coach, you supply your own API key (for OpenAI or Google Gemini).
- **Direct Transmission:** When you ask a question about a completed game, the request is sent directly from your browser to OpenAI or Google's API endpoint. The extension authors have no access to your API keys, prompts, or conversations.

---

## 3. Chrome Permissions & Why They Are Needed

In accordance with the Chrome Web Store Minimum Permissions Policy, Aftermove requests only the bare minimum permissions necessary to function:

- **`activeTab`**: Used only when you interact with the extension popup to check whether your active browser tab is an active Chess.com game.
- **`storage`**: Used to save your engine preferences and the recorded PGN in your browser's private extension storage.
- **Host Permissions (`https://www.chess.com/*`, `https://chess.com/*`)**: Required for the content script to detect move notations from the board interface and identify when a game has concluded.
- **Host Permissions (`api.openai.com`, `generativelanguage.googleapis.com`)**: Required solely for the optional AI Coach feature, allowing your browser to communicate with the chosen AI model if you choose to enable it.

---

## 4. Fair Play & Live Play Safety

Aftermove is strictly a **post-game review tool**:
- The Stockfish engine is hard-locked during live games and will not initialize while a game is being recorded.
- The extension never displays move suggestions, engine arrows, or evaluation bars on a live chessboard.
- Aftermove is fully compliant with chess platform fair-play regulations.

---

## 5. Third-Party Sharing

We do not share, transfer, or disclose any user data to third parties. If you enable the optional AI Coach, your interaction is subject to the respective privacy policy of your chosen AI provider:
- [OpenAI Privacy Policy](https://openai.com/policies/privacy-policy)
- [Google Privacy Policy](https://policies.google.com/privacy)

---

## 6. Children’s Privacy

Aftermove does not knowingly collect or solicit any personal data from anyone, including children under the age of 13.

---

## 7. Changes to This Policy

If we update this Privacy Policy in the future, revisions will be published directly in this repository and noted in the Chrome Web Store listing release notes.

---

## 8. Contact

If you have questions, feedback, or concerns regarding your privacy while using Aftermove, please open an issue on GitHub:
👉 [https://github.com/mig2165/Chess_ai/issues](https://github.com/mig2165/Chess_ai/issues)

