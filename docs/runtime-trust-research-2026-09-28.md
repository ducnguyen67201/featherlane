# Research: which browser or session may receive account access?

Research date and cutoff: 2026-09-28. Status: literature review, not an accepted design or security certification. Companion to the [deferred runtime-trust problem](deferred-runtime-trust.md).

## Executive summary

Yes: substantial research covers this problem, but under several different names. Desktop/mobile autofill security studies examine whether credentials reach the right app or frame; session-binding work addresses replay; trusted-path and remote-attestation work addresses compromised execution environments. Recent agent-security papers add secret mediation and operation binding. These are related but non-interchangeable guarantees. See the primary sources below.

The practical conclusion for Featherlane is an inference: do not build a single classifier that labels arbitrary browsers “safe.” Define the threat model, enroll a supported runtime, authenticate it, bind authorization to the intended account/session/destination, and mediate credential use. A phishing score can supplement that chain but cannot establish it. No reviewed source demonstrated the entire arbitrary-browser/mobile/sandbox guarantee we discussed; that scoped search finding is not proof of research novelty.

Confidence is high that the literature below addresses important constituent problems; medium for the proposed Featherlane synthesis; insufficient to claim novelty or current product exploitability. All experimental results are author-reported, not reproduced here.

## 1. What does “safe browser” actually mean?

| Question                                            | Relevant research                    | What it does not establish                                |
| --------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| Is this page impersonating a login site?            | PhishIntention, PhishLLM             | That the browser process or host is honest                |
| Will autofill reach the intended app/frame?         | Vault Raider, AutoFail               | That every subsequent account action is authorized        |
| Can a stolen session be replayed elsewhere?         | Device Bound Session Credentials     | That malware cannot act on the original device            |
| Does the channel terminate in the verified runtime? | Remote attestation combined with TLS | That all runtime logic is correct or the page is benign   |
| Does execution match the granted operation?         | SUDP, CapSeal, SecureClaw, VAC       | A universal proof that arbitrary browsers are trustworthy |

This taxonomy is our synthesis; individual mechanisms and limits are sourced below. “Unverified” must remain distinct from “known malicious.” Failing to obtain trustworthy evidence is a reason to withhold credentials, not proof of an attack.

## 2. Closest empirical papers: delivering credentials to the right place

### Vault Raider — NDSS 2026

**Vault Raider: Stealthy UI-based Attacks Against Password Managers in Desktop Environments**, Andrea Infantino, Mir Masood Ali, Kostas Solomos and Jason Polakis. Examines native-app autofill and UI interactions on macOS, Windows and Linux, including 1Password. It shows why application identity checks must cover every credential-access path, not just the main autofill path. Its attacker is a local malicious app; macOS attacks assume Accessibility permission. This is not a claim that any website alone can perform the attacks. [Conference page](https://www.ndss-symposium.org/ndss-paper/vault-raider-stealthy-ui-based-attacks-against-password-managers-in-desktop-environments/), [paper](https://www.ndss-symposium.org/wp-content/uploads/2026-s1067-paper.pdf).

**Featherlane implication:** computer-use permissions and synthetic input must be part of the threat model. A familiar window title, visible confirmation or process name is inadequate evidence. Findings concern tested versions and configurations; we have not checked current vendor remediation.

### AutoFail — USENIX Security 2026

**AutoFail: Breaking Web Boundaries using Android's Autofill Framework**, Riccardo Lamarca, Philipp Beer and Marco Squarcina. Studies nine password managers and five mobile browsers. Its core issue is lost or misrepresented origin/frame context when browsers translate web content into Android autofill structures. Proposed mitigations preserve ancestor context, precise origins and focused-field scope. The threat model assumes the OS, browser and password manager are uncompromised; the work does not attest a malicious browser. [Paper](https://www.usenix.org/system/files/usenixsecurity26-lamarca.pdf).

**Featherlane implication:** a top-level URL is not enough. Test nested frames, opaque/sandboxed origins, scheme/port differences and context translation in each adapter. The authors identify automation of their human-assisted differential tests as future work.

### Secure authentication channel — ACM CCS 2025

**Passwords and FIDO2 Are Meant To Be Secret: A Practical Secure Authentication Channel for Web Browsers**, Anuj Gautam et al. Modifies Firefox and Bitwarden to put a placeholder into the page, replacing it with the credential inside the browser's outbound-request path after destination checks. The extension-resistant variant substitutes after extension-visible stages. The paper reports compatible request behavior on 554 of 573 selected login pages, not successful authenticated agent tasks on 1,000 sites. [Extended paper](https://arxiv.org/html/2509.02289), [publication record](https://arxiv.org/abs/2509.02289).

**Important limits:** modified browser required; OS/browser trusted; password-transforming JavaScript can break compatibility. Section 8.4 explicitly leaves replacement values visible to developer tooling. This is useful secret-injection prior art, not proof that an agent with unrestricted browser debugging access cannot obtain credentials.

## 3. Session identity and stronger runtime assurance

### Device Bound Session Credentials — W3C draft

The dated 21 August 2025 DBSC draft binds session maintenance to possession of a protected key, reducing export-and-replay of session authority. Section 2.1 explicitly excludes ongoing access by an attacker on the same device, replacement/injection of the browser during registration, and guarantees about the particular device or its state. [Dated specification and non-goals](https://www.w3.org/TR/2025/WD-dbsc-1-20250821/#non-goals).

**Featherlane implication:** use session-binding ideas, but never equate “bound to a key/device” with “safe runtime.” Website cooperation and deployment support also matter; this report does not claim universal browser/site availability.

### Fidelius — IEEE Security and Privacy 2019

**Fidelius: Protecting User Secrets from Compromised Browsers**, Saba Eskandarian et al. Uses hardware enclaves and trusted input/output paths to protect selected web interactions even under a compromised browser/OS. It is older but directly relevant to the strongest version of our threat. Its prototype requires specialized integration; it is not a drop-in arbitrary-browser checker. [Paper](https://arxiv.org/abs/1809.04774), [author publication page](https://trouge.net/publication/fidelius-sp-19/).

**Featherlane implication:** if the browser itself is untrusted, the sensitive computation and input/output path need another trust anchor. Checking browser branding or signing a session ID does not replace that architecture.

Section 8.2 explicitly considers a trusted display paired with input sent to a different enclave, proposing a same-enclave check. This closely resembles our target-substitution concern. However, initial trusted setup was manual, the modified server was not implemented, and evaluation excluded remote-attestation latency. These are material prototype limits. [Full text](https://arxiv.org/html/1809.04774).

### Separate but Together — USENIX ATC 2025

**Separate but Together: Integrating Remote Attestation into TLS**, Carsten Weinhold et al. Addresses a specific missing link: proving that the encrypted channel terminates inside the attested environment. Attestation and TLS cannot simply be checked independently, because a relay may supply evidence from a genuine environment while terminating the channel elsewhere. [Conference page](https://www.usenix.org/conference/atc25/presentation/weinhold), [paper](https://www.usenix.org/system/files/atc25-weinhold.pdf).

**Featherlane implication:** if we investigate an attested worker, fresh evidence must bind the actual communication endpoint. This paper is a channel-building block, not a browser-session or account-policy implementation.

### Two useful distinctions

**Site Attestation: Browser-based Remote Attestation** (EuroSec 2025) concerns a browser checking a website's confidential-computing environment. Its direction matters: it is not evidence that a credential broker can verify the local browser receiving a password. [Publication](https://dl.acm.org/doi/10.1145/3722041.3723095).

**RFC 9334: Remote ATtestation procedureS (RATS) Architecture** (2023, Informational RFC) separates evidence, verification/appraisal and the relying party's decision. It provides vocabulary for what evidence establishes under a policy, not an unconditional “safe” certificate. [RFC](https://www.rfc-editor.org/rfc/rfc9334.html).

## 4. Recent agent-specific work we must not overlook

These are preprints unless explicitly stated otherwise. Their existence makes broad novelty claims such as “agents use secrets without seeing them” or “bind approval to execution” untenable without much narrower qualification.

| Work and status                                                                                                                                                   | Closest contribution                                                                                                | Important limitation                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [CapSeal: Capability-Sealed Secret Mediation for Secure Agent Execution](https://arxiv.org/html/2604.16762v1), 18 April 2026 preprint                             | Broker-mediated HTTP/SSH secret use; local peer identity, session-bound capabilities and replay checks              | Assumes OS isolation and trusted broker; hardware attestation is out of scope. Process/channel binding is not browser profile/tab attestation. Evaluation is narrow and scripted.                                                                      |
| [SUDP: Secret-Use Delegation Protocol for Agentic Systems](https://arxiv.org/html/2604.24920v3), 27 April, revised 22 May 2026 preprint                           | Fresh authenticator-backed grants bind a canonical operation, redeemer and recipient; custodian performs secret use | Requires trusted rendering and faithful operation adapters. Code-integrity attestation is outside scope; TLS peer/session data are not in its protocol commitments.                                                                                    |
| [SecureClaw: Clawing Back Control of LLM Agents](https://arxiv.org/html/2606.09549v1), 8 June 2026 preprint                                                       | Opaque secret handles plus exact-request PREVIEW/COMMIT enforcement                                                 | Trusts gateway, policy engine and executor; complete mediation is required. Does not establish arbitrary browser identity or semantic correctness of every permitted action.                                                                           |
| [WebMCP-Phalanx: Enforcing and Characterizing Trust Boundaries for Browser-Integrated LLM Agents](https://arxiv.org/html/2608.24017v1), 25 August 2026 preprint   | Tool ownership, provenance and lifecycle binding                                                                    | Prototype is a JavaScript polyfill with assumed/emulated native properties; adaptive tool-name attacks bypass its semantic filter. Not remote runtime attestation.                                                                                     |
| [The Verifiable Action Card: Trustworthy Human-in-the-Loop Control for Secure Autonomous Agents](https://arxiv.org/html/2609.18411v1), 16 September 2026 preprint | Derive confirmation from the pending action, display outside page control and recheck at dispatch                   | Assumes a trusted host/browser. Evaluation uses an approval oracle, not a human study. Sections 4.7 and 13 leave systematic mutation evaluation/hardened TOCTOU dispatch to future work despite stronger claims elsewhere. Treat assurance cautiously. |

**Site Isolation is Dead: How Site Isolation is Broken in Agentic Browsers and Extensions** (IEEE Security and Privacy 2026) reports vulnerable privilege crossings in two agentic browsers and seven extensions. Its attacker already has arbitrary code execution in a renderer; this is stronger than merely controlling a webpage's text. The lesson is to authenticate internal message provenance and limit privileged operations, not that all browser site isolation has universally stopped working. [Author-hosted paper](https://wsp-lab.github.io/papers/lee-sp26.pdf).

## 5. Detecting dangerous pages is a separate research branch

**PhishIntention: Inferring Phishing Intention via Webpage Appearance and Dynamics** (USENIX Security 2022) combines brand recognition and credential-taking behavior, including page interaction. It addresses whether a page is phishing, not whether the browser runtime is genuine. [Conference page](https://www.usenix.org/conference/usenixsecurity22/presentation/liu-ruofan).

**Less Defined Knowledge and More True Alarms: Reference-based Phishing Detection without a Pre-defined Reference List**, the PhishLLM paper (USENIX Security 2024), uses LLM knowledge and search validation for brand/domain relationships and credential-taking intent. This remains detection with errors, not cryptographic target authentication. [Conference page](https://www.usenix.org/conference/usenixsecurity24/presentation/liu-ruofan).

**Clouding the Mirror: Stealthy Prompt Injection Attacks Targeting LLM-based Phishing Detection** (5 February 2026 preprint) studies attacks against the LLM detector itself and proposes InjectDefuser mitigations. This reinforces the need to keep model-based page assessment separate from authoritative credential-release checks. [Paper](https://arxiv.org/html/2602.05484v1).

## Proposed Featherlane research question

The following is our hypothesis, not an established gap or implementation commitment:

> For one supported browser integration, can a broker bind account access to the authorized runtime, session and destination throughout login and subsequent use, while resisting target substitution and session extraction without making useful agent tasks impractical?

Begin with a trusted host and an isolated browser worker; specify precisely what the agent can execute or inspect. Treat compromised-host protection as a distinct, larger research track. Keep this about credential/session delivery rather than expanding into a universal policy engine.

Candidate evidence to collect:

- Secure task completion, not just login completion: useful work finishes without secret/session escape or unauthorized target use.
- Forged runtime IDs, wrong agents/accounts, cross-tab swaps, frame ancestry changes and redirects.
- Replay after expiry, reconnect, browser restart, profile cloning and revocation.
- Password and derived-session extraction through observations, debugging interfaces, files, responses and logs.
- False rejections, owner interventions, compatibility failures and latency.
- Revocation cutoff for managed operations, separately from destruction of local state and invalidation of website-issued sessions.

Use controlled sites and synthetic credentials for adversarial tests. Compare a plain session handle, authenticated runtime binding, and runtime-plus-execution binding under the same task permissions. Publish exclusions and sample sizes; zero observed failures is not a proof of safety. Do not claim superiority over 1Password or another implementation without a matched threat model, supported integration and reproducible comparison.

## Reading order and sources

Seventeen distinct works/specifications are discussed and linked above; alternate paper/venue URLs refer to the same work, not additional sources.

1. Vault Raider — desktop recipient identity and computer-use permissions.
2. AutoFail — browser/frame context and mobile adapters.
3. Passwords and FIDO2 Are Meant To Be Secret — protected credential injection and its debugging/TCB limits.
4. CapSeal, SUDP and SecureClaw — close agent secret-use/authorization prior art.
5. DBSC and Separate but Together — distinguish session binding from runtime/channel assurance.
6. Fidelius — stronger compromised-browser/OS threat model and deployment cost.
7. The remaining sources — agentic browser boundaries, approval binding, detection and attestation vocabulary.

## Methodology and limits

Used the deep-research skill and two parallel read-only research tracks. Questions covered phishing detection, app/frame targeting, session/runtime attestation, and agent-specific execution binding. Completed 20 Exa search queries and six web-search queries across the tracks; two additional Exa attempts failed on quota. Search result slots and duplicate PDF/abstract pages are not independent publications. Seventeen works are retained in this report; other screened sources are not counted as retained evidence.

Exa was available and used for discovery and full-text retrieval; its quota was reached during parallel searches, so verification continued with web access to primary sources. Evidence includes full-text mechanism, threat-model, evaluation and limitation sections, not only search snippets. Peer-reviewed conference papers, preprints and standards drafts are distinguished. Search indexing timestamps were not treated as publication dates. This is a targeted review, not an exhaustive systematic review or a reproduction of experiments; no current vendor vulnerability claims or deployment guarantees follow from it.

No Featherlane runtime, contract or security boundary is changed by this report. Real credential delivery remains deferred.
