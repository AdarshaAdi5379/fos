PRODUCT REQUIREMENTS DOCUMENT (PRD)
Product Name

Unbound (working name)

1. Vision (unfiltered)

To create a public thought-sharing platform where users can express ideas without fear of identity exposure, using cryptographic anonymity, and where all speech is publicly visible by default, similar to how blockchain transactions are publicly observable but not directly tied to real-world identity.

This platform prioritizes expression over comfort, openness over control, and privacy over compliance.

2. Core Philosophy (this defines everything)

Public by default
All content is visible to everyone.

Identity is cryptographic, not personal
No real-world identifiers exist in the system.

No central identity authority
The platform does not know who users are.

Speech precedes moderation
Content is published first; consequences come later, if any.

Fear reduction through identity removal
The system removes social fear by eliminating personal traceability.

3. Problem Statement (as YOU see it)

People self-censor because:

Their real name is attached to opinions

Employers, governments, mobs, and peers can retaliate

Platforms act as opaque gatekeepers

Anonymous platforms fail because they lack persistence and public legitimacy.

This product explores a third path:

Persistent public speech without real-world identity.

4. Non-Goals (intentional exclusions)

This platform does NOT aim to:

Protect users from legal consequences

Guarantee safety from harassment

Ensure civil discourse

Be advertiser-friendly

Be compliant-first

Be mass-market

If these become priorities, the product loses its purpose.

5. User Identity Model (absolute)
Authentication

Users authenticate only via cryptographic seed phrase

Seed phrase is generated client-side

Seed phrase never leaves the user's device

Identity

Seed → private key → public key

Public key = user identity

No usernames required

No emails, phone numbers, OAuth, or recovery

Guarantees

Platform cannot identify users

Platform cannot recover accounts

Platform cannot reverse compromise

Loss of seed = loss of identity
This is a feature, not a bug.

6. Posting Model (radical transparency)
Content

Text-only (initially)

Unlimited public visibility

No private posts

No followers required to view content

Publishing Rules

Post is visible immediately

No pre-moderation

No approval queues

Editing

All edits are versioned

Original content always remains visible

This mimics append-only public ledgers.

7. Visibility & Reach
Visibility

All posts are globally visible

No "private" or "friends-only" modes

Feed

Global feed exists

Chronological ordering is always available

Optional algorithmic ranking

Virality is not restricted by identity.

8. Anonymity Model
What is hidden

Real-world identity

Contact information

Personal identifiers

What is visible

Public key

Post history

Interaction history

This is pseudonymity at scale, not secrecy.

9. Moderation Philosophy (minimal, reactive)
Moderation Goals

Preserve platform availability

Prevent total collapse

Avoid legal takedown where unavoidable

Moderation Style

Content is not filtered by ideology

Moderation is reactive, not proactive

Content removal is rare

Allowed Actions

Post removal for extreme cases

Rate limiting identities

Temporary silencing

No shadow bans. No algorithmic suppression.

10. Abuse Handling (accepted risk)
Abuse is expected

Harassment

Offensive speech

Extremist views

Spam

The platform does not promise protection from speech.

User responsibility:

Ignore

Mute

Block public keys

System responsibility is minimal by design.

11. Legal Stance (explicitly hands-off)

Platform stores no real-world identity

Platform cannot deanonymize users

Platform responds only to infrastructure-level legal demands

No promise of cooperation beyond legal compulsion.

12. Technical Scope (MVP)
Included

Seed-based authentication

Public post creation

Global feed

Append-only storage

Client-side key management

Excluded

DMs

Media uploads

Reporting UX

Recommendation safety layers

Monetization

Identity recovery

13. Data Model (simplified)

Identity (public_key, created_at)

Posts (post_id, author_key, content, timestamp)

Post_versions (immutable history)

No social graph required.

14. Success Criteria (your metrics)

Users post without identity anxiety

No onboarding friction beyond seed storage

System remains technically functional

Speech remains uncensored by default

Engagement quality is not a priority.

15. Known Consequences (explicitly accepted)

Platform may attract extreme content

Platform may face legal pressure

Platform may be banned or blocked

Platform may never scale

These are accepted outcomes, not failures.

16. Final Product Definition (one sentence)

A publicly visible, cryptographically pseudonymous platform for unrestricted expression, where identity is reduced to a key and speech precedes control.