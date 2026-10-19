Testing
# Run all tests
pnpm test

# Run in watch mode
pnpm --filter @delegolabs/web exec vitest
🏛️ Architecture
┌──────────────────────────────────────────────┐
│           Delego Web App (this repo)          │
│         @delegolabs/web · Next.js             │
│  approvals · delegations · escrows · orders   │
│  wallet · tracking · analytics · onboarding   │
└──────────────┬───────────────────────────────┘
               │  HTTPS / REST
               ▼
┌──────────────────────────────────────────────┐
│      Delego API Gateway & Microservices       │
│            (DelegoLabs/Delego-backend)        │
│  orchestrator · wallet · payments · agents    │
└──────────────┬───────────────────────────────┘
               │  Soroban RPC
               ▼
┌──────────────────────────────────────────────┐
│          Soroban Smart Contracts              │
│           (DelegoLabs/Delego-contracts)       │
│      escrow · permissions · reputation        │
└──────────────────────────────────────────────┘
Shared SDK and types (@delegolabs/sdk, @delegolabs/types) are consumed from GitHub Packages; the UI package (@delegolabs/ui) is a local workspace package.

🤝 Contributing
See CONTRIBUTING.md and CODE_OF_CONDUCT.md. Use Conventional Commits.

📚 Documentation
docs/vision.md — Product vision
docs/problem.md — Problem statement
docs/grant-deliverables.md — Grant deliverables
docs/architecture/system-design.md — System design
docs/architecture/frontend-perf.md — Frontend performance budget
docs/dashboard-widget-composition.md — Suspense × ErrorBoundary widget matrix
docs/msw-mocking.md — MSW fixtures and pnpm seed:demo
docs/README.md — Documentation index
