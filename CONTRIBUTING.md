# Contributing

After installation, run pnpm db:generate to create the ignored Prisma client before opening or checking TypeScript. Model changes belong in apps/broker/prisma/schema.prisma; commit a reviewed migration and follow docs/Database.md. Do not use raw SQL queries in application code or reset another developer's database.

This repository is prepared for future open-source development but no license has been selected. Obtain owner authorization before redistribution.

Read AGENTS.md and docs/Architecture.md. Use PascalCase for owned filenames, preserving the documented tooling exceptions. Use a feature branch, keep changes in this repository, and run the documented validation commands. No private repo access is needed. Never include credential fixtures with real values. Replace the commented CODEOWNERS.example with real team names only after the organization exists, then configure branch protections explicitly.

Package boundaries are checked by pnpm lint. Tests should cover allowed, rejected and expired transitions, not only successful calls. Any change to wire semantics needs compatibility tests and an API-version decision. No implicit cross-repository source linkage.

Before release: choose a license, establish a vulnerability contact, scan tracked files/history and package tarballs, pin CI action SHAs, add provenance/signing as appropriate, and verify a fresh public-only clone. No publish workflow is supplied.
