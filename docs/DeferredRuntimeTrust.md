# Deferred problem: trusting the browser or runtime receiving account access

Recorded: 2026-09-28. Status: deferred research and implementation; no runtime design accepted here.

Related evidence: [browser/session trust literature review, 2026-09-28](RuntimeTrustResearch20260928.md). The review maps prior work and limitations; it does not resolve this deferred design or authorize credential delivery.

## Problem we are parking

When an agent encounters a login page, we want it to request account access through Featherlane instead of asking the user for a password. Before enabling that flow, Featherlane must establish that the destination browser, tab, device or sandbox is the intended execution target and that sensitive material cannot be redirected to an impostor.

An agent-supplied browser ID, target ID, URL, screenshot or purpose is not proof of identity, destination or isolation. An approval record alone does not solve this problem. Deferring it does not authorize real credential delivery through the current scaffold.

## Current code versus proposed experience

The implemented MCP tools are `list_connections`, `request_access`, `access_status` and `release_access`. `request_access` accepts `connectionId`, `purpose`, `ttlSeconds` and `idempotencyKey`. It returns a synthetic authorization record, not a password or authenticated session. The browser worker refuses execution.

Names discussed in conversation such as `request_account_access`, and inputs such as `browserSessionId`, `tabId`, `targetId` and `capability`, were illustrative proposals. They are not existing tools, accepted contracts or values that the model can invent and expect to work.

The intended experience is: the agent observes a sign-in requirement, discovers a configured account and supported target, requests access, waits for any owner approval, and continues through the authorized runtime. MCP exposes tools; instructions guide the model to call them. Neither an instruction nor the sentence “please sign in” is an automatic login-detection hook or enforcement boundary.

Signing in inside a separate Featherlane browser does not authenticate the browser the agent was already controlling. We must either integrate with that exact supported browser or provide browser tools backed by the Featherlane-managed session. Connecting an account may initially involve the owner signing in directly; password autofill is not a prerequisite for that approach.

## Threats and required evidence

These are requirements to investigate, not implemented protections.

| Threat                                                               | What a future design must establish                                                                                                                                    |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent invents or substitutes a session/target ID                     | A trusted registry binds the target to an enrolled integration and authorized caller; an ID alone grants no access.                                                    |
| Another program impersonates the browser integration                 | Explicit enrollment, authenticated communication and protection of integration credentials. Credential possession alone does not prove honest software.                |
| A phishing page looks like the approved site                         | The trusted adapter obtains actual origin/frame information, including supported login redirects, independently of the agent's description.                            |
| Navigation, frame replacement or focus changes after approval        | Execution-time binding to the intended destination; detect changes and abort/revalidate. A check immediately before use alone does not prove the race is eliminated.   |
| A request is replayed for another agent, account or runtime          | Authorization is bound to caller, account, target, operation and lifetime, with defined replay protection.                                                             |
| A grant expires or is revoked during execution                       | Authoritative checks and defined termination behavior, including in-flight work, disconnection and cleanup. Completed external actions cannot be undone by revocation. |
| Agent reads cookies, passwords, pairing keys or debugging interfaces | A real isolation boundary and restricted exposed capabilities; account for files, process access, browser APIs, screenshots, logs and network paths.                   |

An agent with arbitrary code execution under the same OS permissions may read or interfere with local broker/browser state. File mode 0600, repository separation and an MCP wrapper do not establish protection from that agent. An agent-controlled endpoint cannot prove itself trustworthy merely by reporting its own state. Hardware/remote attestation is an open option, not an existing feature or an automatic solution to browser behavior.

## Integration options still to evaluate

- **Managed browser:** Featherlane controls the runtime lifecycle and exposed operations. This offers a narrower initial integration to investigate, but a separate process is not necessarily isolated, and the agent must use compatible browser tools.
- **Paired existing browser:** preserve the user's current workflow through a supported integration. Investigate pairing, profile/debug access, target binding and how another process could impersonate or interfere with it. Do not claim arbitrary-browser support.
- **Mobile, application and sandbox adapters:** share access decisions where appropriate, but define separate target identity and credential-delivery mechanisms. A mobile app may require a supported OAuth/login flow; an API client may use a restricted authenticated proxy. Putting a token in an agent-readable environment variable is not secret isolation.
- **Unknown or unsupported target:** refuse credential delivery. Do not fall back to returning a password or raw session cookie to make an integration appear to work.

No option has been selected by this note. A separate protected service or remote worker may provide a stronger boundary, but its host/operator trust and operational costs must also be explicit.

## Scope: account access, not a universal action-policy engine

The immediate problem is authenticating the execution target and enabling controlled account use. Permission to use YouTube is not proof that a video will remain private. The agent's stated purpose is unverified text. Site-specific publication/payment restrictions would require additional enforcement and are not silently included in this deferred work.

The public product should own core access enforcement and supported runtime integrations. The private control plane must not duplicate access decisions or become an undocumented prerequisite for self-hosting.

## Work to resume before real account support

- [ ] Choose one initial runtime and document the adversary: model-only tool access, arbitrary agent code, local filesystem/process permissions and host administrator trust.
- [ ] Verify the actual agent/browser integration surface and how it identifies the runtime the agent is controlling; do not assume a particular host exposes attachable session IDs.
- [ ] Design owner enrollment, target discovery, integration authentication, key protection, rotation and revocation.
- [ ] Specify the account-to-target binding, supported origins/login redirects and execution-time checks, including navigation/focus races.
- [ ] Define where credentials/session material live and which operations the agent may invoke. Identify any operation that could expose that material.
- [ ] Define expiry, revocation, crash/restart and disconnected-worker behavior, with measurable cutoff limits and no silent replay of failed operations.
- [ ] Prototype with synthetic accounts and controlled test sites first. Test legitimate completion alongside forged targets, wrong callers, phishing origins, swapped frames, replay, revoked grants and attempted session extraction.
- [ ] Review the evidence and document residual risks before revising the current synthetic-only security restriction or enabling real accounts.

Completion evidence must include an end-to-end supported login/session flow, negative tests showing rejection without credential delivery, and explicit limitations. Ordinary approval tests or a high login success rate are insufficient evidence of runtime trust.

## Consequences of deferral

We can keep improving contracts, developer experience and synthetic approvals without pretending the security boundary exists. Real login, credential delivery and protected browser/mobile/sandbox execution remain blocked on this work. Keep the unsupported worker fail-closed; do not report an authenticated session merely because an approval status is `granted`.

See [architecture](Architecture.md) and [current security status](../SECURITY.md).
